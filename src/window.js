"use strict";

/**
 * 窗口的形状与归属。窗口对齐到 epoch：一个事件的 time 落在哪些窗口里，是纯函数。
 */

const { StreamkitError, CODES } = require("./errors.js");

const TYPES = Object.freeze(["tumbling", "sliding"]);

function normalizeWindow(spec) {
  if (!spec || typeof spec !== "object") {
    throw new StreamkitError(CODES.E_CONFIG, "window 必须是对象", { window: spec });
  }
  const type = spec.type;
  if (!TYPES.includes(type)) {
    throw new StreamkitError(CODES.E_CONFIG, `window.type 只能是 ${TYPES.join(" 或 ")}`, { type });
  }
  const size = spec.size;
  if (!Number.isInteger(size) || size <= 0) {
    throw new StreamkitError(CODES.E_CONFIG, "window.size 必须是正整数", { size });
  }
  if (type === "tumbling") {
    return Object.freeze({ type, size, slide: size });
  }
  const slide = spec.slide;
  if (!Number.isInteger(slide) || slide <= 0) {
    throw new StreamkitError(CODES.E_CONFIG, "滑动窗口必须给正整数 slide", { slide });
  }
  if (slide > size) {
    throw new StreamkitError(CODES.E_CONFIG, "slide 不能大于 size", { size, slide });
  }
  return Object.freeze({ type, size, slide });
}

/** 事件时间 t 落在哪些窗口里（按起点升序）。 */
function windowsOf(win, t) {
  const last = Math.floor(t / win.slide) * win.slide;
  const starts = [];
  for (let start = last; start > t - win.size; start -= win.slide) {
    starts.push(start);
  }
  return starts.sort((a, b) => a - b);
}

module.exports = { normalizeWindow, windowsOf, TYPES };
