"use strict";

/**
 * 聚合器的实现原语。每种聚合器一个「折叠」：init 给初值，step 吃一个值，
 * merge 把两份部分状态并起来（滑动窗口下一个事件会同时进好几个窗口，合并只发生在
 * 同一窗口内部，不需要重放），finalize 给最终结果。
 *
 * 这里只认 data/aggregators.json 编译出来的那份 plan；表里没有的 id 一律拒绝。
 */

const { StreamkitError, CODES } = require("./errors.js");

const FIELD_TEXT = { min: "最小值", max: "最大值", avg: "平均值", collect: "收集" };

const FOLDS = {
  count: {
    init: () => ({ n: 0 }),
    step: (state) => {
      state.n += 1;
    },
    merge: (a, b) => ({ n: a.n + b.n }),
    finalize: (state) => state.n,
  },
  sum: {
    init: () => ({ s: 0 }),
    step: (state, value) => {
      state.s += value;
    },
    merge: (a, b) => ({ s: a.s + b.s }),
    finalize: (state) => state.s,
  },
  min: {
    init: () => ({ v: null }),
    step: (state, value) => {
      state.v = state.v === null ? value : Math.min(state.v, value);
    },
    merge: (a, b) => {
      if (a.v === null) return { v: b.v };
      if (b.v === null) return { v: a.v };
      return { v: Math.min(a.v, b.v) };
    },
    finalize: (state) => state.v,
  },
  max: {
    init: () => ({ v: null }),
    step: (state, value) => {
      state.v = state.v === null ? value : Math.max(state.v, value);
    },
    merge: (a, b) => {
      if (a.v === null) return { v: b.v };
      if (b.v === null) return { v: a.v };
      return { v: Math.max(a.v, b.v) };
    },
    finalize: (state) => state.v,
  },
  avg: {
    init: () => ({ s: 0, n: 0 }),
    step: (state, value) => {
      state.s += value;
      state.n += 1;
    },
    merge: (a, b) => ({ s: a.s + b.s, n: a.n + b.n }),
    finalize: (state) => (state.n === 0 ? null : state.s / state.n),
  },
  collect: {
    init: () => ({ a: [] }),
    step: (state, value) => {
      state.a.push(value);
    },
    merge: (a, b) => ({ a: a.a.concat(b.a) }),
    finalize: (state) => state.a.slice(),
  },
};

/** 某个聚合器怎么看待它的字段：不看字段 / 必须是有限数 / 什么都收。 */
function coerceOf(id, plan) {
  const meta = plan[id];
  if (!meta) {
    throw new StreamkitError(
      CODES.E_REGISTRY,
      `聚合器表里没有 ${id}`,
      { id, known: Object.keys(plan).sort() },
    );
  }
  return meta;
}

function checkValue(id, meta, field, value, where) {
  if (meta.coerce === "none") return;
  if (value === undefined || value === null) {
    throw new StreamkitError(
      CODES.E_EVENT,
      `${where}：字段 ${field} 缺了值`,
      { id, field },
    );
  }
  if (meta.coerce === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new StreamkitError(
        CODES.E_EVENT,
        `${where}：字段 ${field} 需要有限数，拿到 ${typeof value}`,
        { id, field, value },
      );
    }
  }
  if (meta.coerce === "any" && typeof value === "undefined") {
    throw new StreamkitError(CODES.E_EVENT, `${where}：字段 ${field} 缺了值`, { id, field });
  }
}

/** 按 plan 造一个聚合器实例：一个折叠 + 它怎么看字段。 */
function makeAggregator(id, plan) {
  const meta = coerceOf(id, plan);
  const fold = FOLDS[id];
  if (!fold) {
    throw new StreamkitError(CODES.E_REGISTRY, `聚合器表里没有 ${id} 的实现`, { id });
  }
  return {
    id,
    label: meta.label || FIELD_TEXT[id] || id,
    needsField: meta.field === true,
    coerce: meta.coerce,
    init: fold.init,
    step: fold.step,
    merge: fold.merge,
    finalize: fold.finalize,
    check(value, field) {
      checkValue(id, meta, field, value, `聚合器 ${id}`);
    },
  };
}

module.exports = { makeAggregator, FOLDS, checkValue };
