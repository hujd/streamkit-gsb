"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { makeStream, ev } = require("./helpers.js");

test("六种聚合器的值都对", () => {
  const { stream, batches } = makeStream({
    aggregators: {
      n: { id: "count" },
      total: { id: "sum", field: "amount" },
      lo: { id: "min", field: "amount" },
      hi: { id: "max", field: "amount" },
      mean: { id: "avg", field: "amount" },
      seen: { id: "collect", field: "amount" },
    },
  });
  [3, 1, 4].forEach((value, index) => stream.push(ev(100 + index * 10, value)));
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values, { n: 3, total: 8, lo: 1, hi: 4, mean: 8 / 3, seen: [3, 1, 4] });
});

test("汇总值按到达顺序攒，不看事件时间先后", () => {
  const { stream, batches } = makeStream({
    aggregators: { seen: { id: "collect", field: "amount" }, total: { id: "sum", field: "amount" } },
  });
  stream.push(ev(900, 1));
  stream.push(ev(100, 2));
  stream.push(ev(500, 3));
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values.seen, [1, 2, 3]);
  assert.equal(batches[0].values.total, 6);
});

test("同一个聚合器可以用在不同字段上，互不干扰", () => {
  const { stream, batches } = makeStream({
    aggregators: {
      in_sum: { id: "sum", field: "amount" },
      out_sum: { id: "sum", field: "refund" },
    },
  });
  stream.push({ time: 100, amount: 5, refund: 2 });
  stream.push({ time: 200, amount: 1, refund: 3 });
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values, { in_sum: 6, out_sum: 5 });
});

test("输出名按配置来，跟聚合器 id 无关", () => {
  const { stream, batches } = makeStream({
    aggregators: { 事件数: { id: "count" }, 合计: { id: "sum", field: "amount" } },
  });
  stream.push(ev(100, 4));
  stream.advanceWatermark(1000);
  assert.deepEqual(Object.keys(batches[0].values).sort(), ["事件数", "合计"]);
  assert.deepEqual(batches[0].values, { 事件数: 1, 合计: 4 });
});

test("count 不吃字段，事件里没有 amount 也能数", () => {
  const { stream, batches } = makeStream({ aggregators: { n: { id: "count" } } });
  stream.push({ time: 100 });
  stream.push({ time: 200, 别的: "x" });
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values, { n: 2 });
});

test("collect 收任何类型的值", () => {
  const { stream, batches } = makeStream({ aggregators: { seen: { id: "collect", field: "tag" } } });
  stream.push({ time: 100, tag: "a" });
  stream.push({ time: 200, tag: 0 });
  stream.push({ time: 300, tag: false });
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values.seen, ["a", 0, false]);
});

test("事件里的额外字段不影响结果", () => {
  const { stream, batches } = makeStream();
  stream.push({ time: 100, amount: 5, 备注: "随便写", nested: { a: 1 } });
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values, { n: 1, total: 5 });
});

test("校验没过的事件一个字都不落，后面正常事件不受影响", () => {
  const { stream, batches } = makeStream();
  stream.push(ev(100, 5));
  assert.throws(() => stream.push(ev(200, "不是数")), (err) => err.code === "E_EVENT");
  stream.push(ev(300, 7));
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values, { n: 2, total: 12 });
  assert.equal(batches[0].eventCount, 2);
});

test("事件计数只数真的进窗的那些", () => {
  const { stream } = makeStream();
  stream.push(ev(100, 5));
  stream.advanceWatermark(1000);
  stream.push(ev(500, 99)); // 迟到
  assert.deepEqual(stream.stats(), { eventsIn: 1, eventsLate: 1, windowsEmitted: 1, pending: 0 });
});

test("stats 反映还没产出的窗口数", () => {
  const { stream } = makeStream();
  stream.push(ev(100, 1));
  stream.push(ev(1100, 1));
  stream.push(ev(2100, 1));
  // 每次 push 都会把水位线推到事件时间，前两窗当场就产出了
  assert.deepEqual(stream.stats(), { eventsIn: 3, eventsLate: 0, windowsEmitted: 2, pending: 1 });
  stream.advanceWatermark(3000);
  assert.deepEqual(stream.stats(), { eventsIn: 3, eventsLate: 0, windowsEmitted: 3, pending: 0 });
});

test("data/aggregators.json 里声明的每种聚合器都能真的跑起来", () => {
  const { ck } = require("./helpers.js");
  const { stream, batches } = makeStream({
    aggregators: Object.fromEntries(ck.aggregators().map((item) => [item.id, { id: item.id, field: item.field ? "amount" : undefined }])),
  });
  stream.push(ev(100, 2));
  stream.push(ev(200, 8));
  stream.advanceWatermark(1000);
  const values = batches[0].values;
  assert.equal(values.count, 2);
  assert.equal(values.sum, 10);
  assert.equal(values.min, 2);
  assert.equal(values.max, 8);
  assert.equal(values.avg, 5);
  assert.deepEqual(values.collect, [2, 8]);
});
