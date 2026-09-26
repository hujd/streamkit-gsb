"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ck, BASIC } = require("./helpers.js");

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
}

test("聚合器清单来自内置表，顺序与内容都在", () => {
  const list = ck.aggregators();
  assert.deepEqual(list.map((item) => item.id), ["count", "sum", "min", "max", "avg", "collect"]);
  for (const item of list) {
    assert.equal(typeof item.label, "string");
    assert.notEqual(item.label, "");
    assert.equal(typeof item.field, "boolean");
    assert.equal(typeof item.coerce, "string");
  }
});

test("只有 count 不看字段", () => {
  const fieldless = ck.aggregators().filter((item) => item.field === false).map((item) => item.id);
  assert.deepEqual(fieldless, ["count"]);
});

test("构建信息与运行时版本对得上", () => {
  const info = ck.buildInfo();
  assert.equal(info.version, ck.version());
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  for (const key of ["builtAt", "buildId"]) {
    assert.ok(info[key] === null || typeof info[key] === "string", `${key} 要么没有，要么是字符串`);
  }
  assert.deepEqual(info.ids.slice().sort(), ck.aggregators().map((item) => item.id).sort());
});

test("配置里用了表里没有的聚合器 → E_REGISTRY", () => {
  const code = codeOf(() =>
    ck.createStream({
      window: BASIC.window,
      aggregators: { x: { id: "stdev", field: "amount" } },
    }),
  );
  assert.equal(code, "E_REGISTRY");
});

test("需要字段的聚合器没给 field → E_REGISTRY", () => {
  const code = codeOf(() =>
    ck.createStream({ window: BASIC.window, aggregators: { x: { id: "sum" } } }),
  );
  assert.equal(code, "E_REGISTRY");
});

test("不看字段的聚合器给了 field → E_REGISTRY", () => {
  const code = codeOf(() =>
    ck.createStream({ window: BASIC.window, aggregators: { x: { id: "count", field: "amount" } } }),
  );
  assert.equal(code, "E_REGISTRY");
});

test("聚合器配置本身写错 → E_CONFIG", () => {
  assert.equal(codeOf(() => ck.createStream({ window: BASIC.window, aggregators: {} })), "E_CONFIG");
  assert.equal(codeOf(() => ck.createStream({ window: BASIC.window })), "E_CONFIG");
  assert.equal(
    codeOf(() => ck.createStream({ window: BASIC.window, aggregators: { x: "sum" } })),
    "E_CONFIG",
  );
  assert.equal(
    codeOf(() => ck.createStream({ window: BASIC.window, aggregators: { x: { id: "sum", field: "" } } })),
    "E_REGISTRY",
  );
});

test("lateness 只能是非负整数", () => {
  for (const lateness of [-1, 1.5, "200", null]) {
    const code = codeOf(() => ck.createStream(Object.assign({}, BASIC, { lateness })));
    assert.equal(code, "E_CONFIG", `lateness=${JSON.stringify(lateness)}`);
  }
  const ok = ck.createStream(Object.assign({}, BASIC, { lateness: 0 }));
  assert.ok(ok instanceof ck.Stream);
});

test("窗口配置写错 → E_CONFIG", () => {
  assert.equal(
    codeOf(() => ck.createStream({ window: { type: "tumbling" }, aggregators: BASIC.aggregators })),
    "E_CONFIG",
  );
  assert.equal(codeOf(() => ck.createStream({ aggregators: BASIC.aggregators })), "E_CONFIG");
});
