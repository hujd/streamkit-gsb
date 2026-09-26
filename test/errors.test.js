"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ck, makeStream, ev } = require("./helpers.js");

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
}

test("错误类自己带着稳定的 code", () => {
  const err = new ck.StreamkitError(ck.CODES.E_EVENT, "试试", { at: "test" });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ck.StreamkitError);
  assert.equal(err.name, "StreamkitError");
  assert.equal(err.code, "E_EVENT");
  assert.deepEqual(err.details, { at: "test" });
  assert.equal(err.message, "试试");
});

test("三个错误码是固定的三个", () => {
  assert.deepEqual(Object.values(ck.CODES).sort(), ["E_CONFIG", "E_EVENT", "E_REGISTRY"]);
});

test("事件不是对象 → E_EVENT", () => {
  const { stream } = makeStream();
  for (const bad of [null, undefined, 42, "x", [], true]) {
    assert.equal(codeOf(() => stream.push(bad)), "E_EVENT", `bad=${JSON.stringify(bad)}`);
  }
});

test("事件的 time 必须是有限数", () => {
  const { stream } = makeStream();
  for (const bad of [undefined, null, "100", NaN, Infinity, -Infinity, {}]) {
    assert.equal(codeOf(() => stream.push({ time: bad, amount: 1 })), "E_EVENT");
  }
});

test("需要数的聚合器收到非数 → E_EVENT，details 指得出字段", () => {
  const { stream } = makeStream();
  let caught = null;
  try {
    stream.push({ time: 100, amount: "5" });
  } catch (err) {
    caught = err;
  }
  assert.equal(caught.code, "E_EVENT");
  assert.equal(caught.details.field, "amount");
  assert.equal(caught.details.id, "sum");
});

test("字段缺了或为 null → E_EVENT", () => {
  const { stream } = makeStream();
  assert.equal(codeOf(() => stream.push({ time: 100 })), "E_EVENT");
  assert.equal(codeOf(() => stream.push({ time: 100, amount: null })), "E_EVENT");
});

test("NaN / Infinity 不算有限数", () => {
  const { stream } = makeStream();
  assert.equal(codeOf(() => stream.push({ time: 100, amount: NaN })), "E_EVENT");
  assert.equal(codeOf(() => stream.push({ time: 100, amount: Infinity })), "E_EVENT");
});

test("水位线必须是有限数 → E_EVENT", () => {
  const { stream } = makeStream();
  for (const bad of [undefined, null, "1000", NaN, Infinity]) {
    assert.equal(codeOf(() => stream.advanceWatermark(bad)), "E_EVENT");
  }
});

test("onEmit 只收函数", () => {
  const { stream } = makeStream();
  for (const bad of [null, 42, "fn", {}]) {
    assert.equal(codeOf(() => stream.onEmit(bad)), "E_CONFIG");
  }
});

test("报错不改变流的状态", () => {
  const { stream, batches } = makeStream();
  const before = stream.stats();
  assert.equal(codeOf(() => stream.push({ time: "nope" })), "E_EVENT");
  assert.deepEqual(stream.stats(), before);
  stream.push(ev(100, 1));
  stream.advanceWatermark(1000);
  assert.deepEqual(batches[0].values, { n: 1, total: 1 });
});
