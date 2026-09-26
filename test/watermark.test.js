"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { makeStream, ev } = require("./helpers.js");

test("没推水位线之前窗口不产出", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(100, 5));
  stream.push(ev(900, 7));
  assert.deepEqual(batches, []);
  assert.deepEqual(stream.stats(), { eventsIn: 2, eventsLate: 0, windowsEmitted: 0, pending: 1 });
});

test("水位线推过窗口末尾就产出，值也对", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(100, 5));
  stream.push(ev(900, 7));
  stream.advanceWatermark(1000);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].values, { n: 2, total: 12 });
  assert.equal(batches[0].start, 0);
  assert.equal(batches[0].end, 1000);
  assert.equal(batches[0].eventCount, 2);
  assert.equal(stream.stats().pending, 0);
});

test("迟到量把关门时间整体推后", () => {
  const { stream, batches } = makeStream({ lateness: 200 });
  stream.push(ev(100, 5));
  stream.advanceWatermark(1100);
  assert.deepEqual(batches, [], "还没到 end + lateness，不许产出");
  stream.advanceWatermark(1200);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].values.total, 5);
});

test("关门前赶到的乱序事件照样进窗", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(900, 7));
  stream.push(ev(100, 5));
  stream.push(ev(400, 1));
  stream.advanceWatermark(1000);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].values, { n: 3, total: 13 });
});

test("已经在迟到量之内到达的旧事件仍然收下", () => {
  const { stream, batches } = makeStream({ lateness: 200 });
  stream.push(ev(900, 7));
  stream.advanceWatermark(1100);
  stream.push(ev(400, 5));
  assert.equal(stream.stats().eventsLate, 0);
  stream.advanceWatermark(1200);
  assert.deepEqual(batches[0].values, { n: 2, total: 12 });
});

test("窗口产出之后的旧事件算迟到，不进窗也不新建窗", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(100, 5));
  stream.advanceWatermark(1000);
  assert.equal(batches.length, 1);
  const before = batches[0].values.total;
  stream.push(ev(500, 99));
  assert.equal(stream.stats().eventsLate, 1);
  assert.equal(stream.stats().eventsIn, 1, "迟到的推入只记在 eventsLate 里");
  assert.equal(stream.stats().pending, 0);
  assert.equal(batches.length, 1, "迟到的旧事件不许再吐一窗出来");
  assert.equal(batches[0].values.total, before);
});

test("水位线只往前走，往回推不生效", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(2500, 1));
  stream.advanceWatermark(3000);
  assert.equal(batches.length, 1);
  stream.advanceWatermark(100);
  assert.equal(batches.length, 1);
});

test("窗口按起点升序产出，一次推进可能连吐几窗", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(100, 1));
  stream.push(ev(1100, 2));
  stream.push(ev(2100, 3));
  stream.advanceWatermark(4000);
  assert.deepEqual(batches.map((b) => b.start), [0, 1000, 2000]);
  assert.deepEqual(batches.map((b) => b.values.total), [1, 2, 3]);
});

test("滑动窗口下一个事件进多窗，各自攒各自的", () => {
  const { stream, batches } = makeStream({
    window: { type: "sliding", size: 2000, slide: 1000 },
  });
  stream.push(ev(500, 1));
  stream.push(ev(1500, 2));
  stream.advanceWatermark(5000);
  assert.deepEqual(batches.map((b) => [b.start, b.eventCount]), [[-1000, 1], [0, 2], [1000, 1]]);
  assert.deepEqual(batches.map((b) => b.values.total), [1, 3, 2]);
});

test("滑动窗口里已经关掉的窗，旧事件不再补进去", () => {
  const { stream, batches } = makeStream({ window: { type: "sliding", size: 2000, slide: 1000 } });
  stream.push(ev(2500, 1));
  stream.advanceWatermark(5000);
  // 此时 [-1000,1000) [0,2000) [1000,3000) 都已产出
  const late = stream.stats().eventsLate;
  stream.push(ev(1900, 5));
  assert.equal(stream.stats().eventsLate, late + 1);
});

test("flush 把没到关门时间的窗口也吐出来", () => {
  const { stream, batches } = makeStream({ lateness: 1000 });
  stream.push(ev(100, 5));
  stream.push(ev(1200, 6));
  assert.deepEqual(batches, [], "水位线离两窗的关门时间都还远");
  assert.equal(stream.stats().pending, 2);
  stream.flush();
  assert.deepEqual(batches.map((b) => b.start), [0, 1000]);
  assert.deepEqual(batches.map((b) => b.values.total), [5, 6]);
  assert.equal(stream.stats().pending, 0);
});

test("flush 之后同一窗不会产出第二次", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(100, 5));
  stream.flush();
  stream.advanceWatermark(999999);
  assert.equal(batches.length, 1);
});

test("onEmit 退订之后不再收到产出", () => {
  const { stream } = makeStream();
  const seen = [];
  const off = stream.onEmit((batch) => seen.push(batch.start));
  stream.push(ev(100, 1));
  stream.advanceWatermark(1000);
  off();
  stream.push(ev(1100, 1));
  stream.advanceWatermark(2000);
  assert.deepEqual(seen, [0]);
});

test("产出是同步的：advanceWatermark 返回时监听器已经跑完", () => {
  const { stream } = makeStream();
  let called = 0;
  stream.onEmit(() => {
    called += 1;
  });
  stream.push(ev(100, 1));
  stream.advanceWatermark(1000);
  assert.equal(called, 1);
});

test("事件时间可以为负，窗口照样对齐", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(-500, 4));
  stream.advanceWatermark(0);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].start, -1000);
  assert.equal(batches[0].end, 0);
  assert.equal(batches[0].values.total, 4);
});
