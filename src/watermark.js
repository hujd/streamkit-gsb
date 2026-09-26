"use strict";

/**
 * 水位线：只跟着见过的最大事件时间走（以及显式推上来的时间），不读墙上时钟。
 * 窗口 [start, end) 算「关门」的条件是 maxSeen - lateness >= end。
 */

class Watermark {
  constructor(lateness) {
    this.lateness = lateness;
    this.maxSeen = null;
  }

  observe(t) {
    if (this.maxSeen === null || t > this.maxSeen) {
      this.maxSeen = t;
    }
    return this.maxSeen;
  }

  /** 当前水位线；一次都没见过事件时是 null。 */
  get value() {
    return this.maxSeen === null ? null : this.maxSeen - this.lateness;
  }

  /** 窗口 [start, end) 是否已经关门。 */
  isClosed(end) {
    return this.maxSeen !== null && this.maxSeen - this.lateness >= end;
  }
}

module.exports = { Watermark };
