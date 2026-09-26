"use strict";

/**
 * 对外入口。这里的每一样东西都是稳定契约：函数名、参数、错误 code。
 */

const { Stream } = require("./engine.js");
const { loadRegistry, resetRegistryCache } = require("./registry.js");
const { StreamkitError, CODES } = require("./errors.js");
const { normalizeWindow, windowsOf, TYPES } = require("./window.js");
const { VERSION } = require("./version.js");
const index = require("../aggregator_index.js");

function createStream(config) {
  return new Stream(config);
}

/** 内置聚合器清单，读的是 data/aggregators.json。 */
function aggregators() {
  return loadRegistry().list.map((item) => ({
    id: item.id,
    label: item.label,
    field: item.field,
    coerce: item.coerce,
  }));
}

function version() {
  return VERSION;
}

/** 构建信息：运行时版本、生成物里的构建时间与构建号、可用的聚合器 id。 */
function buildInfo() {
  return {
    version: VERSION,
    builtAt: index.builtAt,
    buildId: index.buildId,
    registryVersion: index.version,
    ids: index.ids.slice(),
  };
}

module.exports = {
  createStream,
  aggregators,
  version,
  buildInfo,
  normalizeWindow,
  windowsOf,
  TYPES,
  StreamkitError,
  CODES,
  Stream,
  resetRegistryCache,
};
