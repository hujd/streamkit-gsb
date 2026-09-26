"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ck } = require("./helpers.js");

test("滚动窗口按 size 对齐到 epoch", () => {
  const win = ck.normalizeWindow({ type: "tumbling", size: 1000 });
  assert.deepEqual(ck.windowsOf(win, 0), [0]);
  assert.deepEqual(ck.windowsOf(win, 999), [0]);
  assert.deepEqual(ck.windowsOf(win, 1000), [1000]);
  assert.deepEqual(ck.windowsOf(win, 1500), [1000]);
  assert.deepEqual(ck.windowsOf(win, 15000), [15000]);
});

test("滚动窗口的 slide 就是 size", () => {
  const win = ck.normalizeWindow({ type: "tumbling", size: 500 });
  assert.equal(win.slide, 500);
  assert.equal(win.type, "tumbling");
});

test("时间落在边界上归后面那一窗", () => {
  const win = ck.normalizeWindow({ type: "tumbling", size: 100 });
  assert.deepEqual(ck.windowsOf(win, 300), [300]);
  assert.deepEqual(ck.windowsOf(win, 299), [200]);
});

test("滑动窗口一个时间可以落在多窗里，按起点升序", () => {
  const win = ck.normalizeWindow({ type: "sliding", size: 3000, slide: 1000 });
  assert.deepEqual(ck.windowsOf(win, 1500), [-1000, 0, 1000]);
  assert.deepEqual(ck.windowsOf(win, 3000), [1000, 2000, 3000]);
});

test("滑动窗口的窗数取决于对齐位置", () => {
  const win = ck.normalizeWindow({ type: "sliding", size: 1000, slide: 400 });
  assert.deepEqual(ck.windowsOf(win, 800), [0, 400, 800]);
  assert.deepEqual(ck.windowsOf(win, 1000), [400, 800]);
});

test("窗口配置不合法时报 E_CONFIG", () => {
  const bad = [
    undefined,
    {},
    { type: "session", size: 1000 },
    { type: "tumbling" },
    { type: "tumbling", size: 0 },
    { type: "tumbling", size: 1.5 },
    { type: "sliding", size: 1000 },
    { type: "sliding", size: 1000, slide: 0 },
    { type: "sliding", size: 1000, slide: 2000 },
  ];
  for (const spec of bad) {
    assert.throws(
      () => ck.normalizeWindow(spec),
      (err) => err instanceof ck.StreamkitError && err.code === ck.CODES.E_CONFIG,
      `应该拒绝 ${JSON.stringify(spec)}`,
    );
  }
});
