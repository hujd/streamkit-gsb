"use strict";

/**
 * 流本体。事件按事件时间进窗口，水位线推过窗口末尾（加允许的迟到）就产出。
 * 不读墙上时钟，也不起定时器：产出点只有 push / advanceWatermark / flush 三处，
 * 所以同样的输入序列永远得到同样的产出序列。
 */

const { StreamkitError, CODES } = require("./errors.js");
const { normalizeWindow, windowsOf } = require("./window.js");
const { Watermark } = require("./watermark.js");
const { makeAggregator } = require("./ops.js");
const { loadRegistry } = require("./registry.js");
const index = require("../aggregator_index.js");

const PLAN = index.plan;

class Stream {
  constructor(config) {
    const cfg = config || {};
    this.window = normalizeWindow(cfg.window);

    const lateness = cfg.lateness === undefined ? 0 : cfg.lateness;
    if (!Number.isInteger(lateness) || lateness < 0) {
      throw new StreamkitError(CODES.E_CONFIG, "lateness 必须是非负整数", { lateness });
    }
    this.lateness = lateness;
    this.watermark = new Watermark(lateness);

    const registry = loadRegistry();
    const spec = cfg.aggregators;
    if (!spec || typeof spec !== "object" || Array.isArray(spec) || Object.keys(spec).length === 0) {
      throw new StreamkitError(CODES.E_CONFIG, "至少要配一个聚合器", { aggregators: spec });
    }

    this.outputs = new Map();
    for (const name of Object.keys(spec)) {
      const entry = spec[name];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new StreamkitError(CODES.E_CONFIG, `聚合器 ${name} 的配置必须是对象`, { name });
      }
      const id = entry.id;
      const meta = registry.byId.get(id);
      if (typeof id !== "string" || !meta) {
        throw new StreamkitError(CODES.E_REGISTRY, `聚合器表里没有 ${id}`, {
          name,
          id,
          known: [...registry.byId.keys()].sort(),
        });
      }
      const field = entry.field === undefined || entry.field === null ? null : entry.field;
      if (meta.field) {
        if (typeof field !== "string" || field === "") {
          throw new StreamkitError(CODES.E_REGISTRY, `聚合器 ${id} 需要 field`, { name, id });
        }
      } else if (field !== null) {
        throw new StreamkitError(CODES.E_REGISTRY, `聚合器 ${id} 不看字段`, { name, id, field });
      }
      this.outputs.set(name, {
        name,
        id,
        field,
        aggregator: makeAggregator(id, PLAN),
        meta,
      });
    }

    this.windows = new Map();
    this.emittedUpTo = null;
    this.listeners = new Set();
    this.counters = { eventsIn: 0, eventsLate: 0, windowsEmitted: 0 };
  }

  push(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new StreamkitError(CODES.E_EVENT, "事件必须是对象", { event });
    }
    const time = event.time;
    if (typeof time !== "number" || !Number.isFinite(time)) {
      throw new StreamkitError(CODES.E_EVENT, "事件的 time 必须是有限数", { time });
    }

    this.watermark.observe(time);

    const targets = windowsOf(this.window, time).filter((start) => !this._hasEmitted(start));
    if (targets.length === 0) {
      this.counters.eventsLate += 1;
      this._closeReady();
      return this;
    }

    // 先整条校验完，再落状态：报错的事件不许留下半份脏数据
    const prepared = [];
    for (const output of this.outputs.values()) {
      const raw = output.field === null ? undefined : event[output.field];
      output.aggregator.check(raw, output.field);
      prepared.push([output, raw]);
    }
    this.counters.eventsIn += 1;
    for (const start of targets) {
      const win = this._windowAt(start);
      for (const [output, raw] of prepared) {
        output.aggregator.step(win.states.get(output.name), raw);
      }
      win.count += 1;
    }

    this._closeReady();
    return this;
  }

  advanceWatermark(t) {
    if (typeof t !== "number" || !Number.isFinite(t)) {
      throw new StreamkitError(CODES.E_EVENT, "水位线必须是有限数", { t });
    }
    this.watermark.observe(t);
    this._closeReady();
    return this;
  }

  /** 把还没产出的窗口全部产出（按起点升序），不管水位线到没到。 */
  flush() {
    const starts = [...this.windows.keys()].sort((a, b) => a - b);
    for (const start of starts) {
      this._emit(start);
    }
    return this;
  }

  onEmit(fn) {
    if (typeof fn !== "function") {
      throw new StreamkitError(CODES.E_CONFIG, "onEmit 需要一个函数", {});
    }
    this.listeners.add(fn);
    const listeners = this.listeners;
    return function off() {
      listeners.delete(fn);
    };
  }

  stats() {
    return {
      eventsIn: this.counters.eventsIn,
      eventsLate: this.counters.eventsLate,
      windowsEmitted: this.counters.windowsEmitted,
      pending: this.windows.size,
    };
  }

  _hasEmitted(start) {
    return this.emittedUpTo !== null && start <= this.emittedUpTo;
  }

  _windowAt(start) {
    let win = this.windows.get(start);
    if (!win) {
      win = { start, end: start + this.window.size, count: 0, states: new Map() };
      for (const output of this.outputs.values()) {
        win.states.set(output.name, output.aggregator.init());
      }
      this.windows.set(start, win);
    }
    return win;
  }

  _closeReady() {
    const value = this.watermark.value;
    if (value === null) {
      return;
    }
    const ready = [];
    for (const win of this.windows.values()) {
      if (value >= win.end) {
        ready.push(win.start);
      }
    }
    ready.sort((a, b) => a - b);
    for (const start of ready) {
      this._emit(start);
    }
  }

  _emit(start) {
    const win = this.windows.get(start);
    if (!win) {
      return null;
    }
    const values = {};
    for (const output of this.outputs.values()) {
      values[output.name] = output.aggregator.finalize(win.states.get(output.name));
    }
    const batch = Object.freeze({ start: win.start, end: win.end, values, eventCount: win.count });
    this.windows.delete(start);
    if (this.emittedUpTo === null || start > this.emittedUpTo) {
      this.emittedUpTo = start;
    }
    this.counters.windowsEmitted += 1;
    for (const fn of [...this.listeners]) {
      fn(batch);
    }
    return batch;
  }
}

module.exports = { Stream };
