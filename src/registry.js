"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { StreamkitError, CODES } = require("./errors.js");

const DEFAULT_REL = path.join("data", "aggregators.json");

let cache = null;

/**
 * 读内置聚合器表。表里写清了哪些聚合器存在、要不要字段、值要不要是数，
 * 运行时按它校验用户配置（表里没有的 id 一律拒绝）。
 */
function loadRegistry(options) {
  const opts = options || {};
  if (cache && !opts.reload) {
    return cache;
  }
  const rel = opts.path || DEFAULT_REL;
  const file = path.resolve(process.cwd(), rel);

  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new StreamkitError(CODES.E_REGISTRY, `聚合器表读不到：${rel}`, {
      file,
      cause: err.code || err.message,
    });
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new StreamkitError(CODES.E_REGISTRY, `聚合器表不是合法 JSON：${rel}`, {
      file,
      cause: err.message,
    });
  }

  const rows = Array.isArray(doc.aggregators) ? doc.aggregators : [];
  if (rows.length === 0) {
    throw new StreamkitError(CODES.E_REGISTRY, "聚合器表里一条都没有", { file });
  }

  const byId = new Map();
  const list = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || row.id === "") {
      throw new StreamkitError(CODES.E_REGISTRY, "聚合器表里有条目缺 id", { file, row });
    }
    if (byId.has(row.id)) {
      throw new StreamkitError(CODES.E_REGISTRY, `聚合器表里 ${row.id} 重复`, { file, id: row.id });
    }
    const item = Object.freeze({
      id: row.id,
      label: typeof row.label === "string" && row.label !== "" ? row.label : row.id,
      field: row.field === true,
      coerce: typeof row.coerce === "string" && row.coerce !== "" ? row.coerce : "none",
    });
    byId.set(item.id, item);
    list.push(item);
  }

  cache = Object.freeze({
    schema: typeof doc.schema === "number" ? doc.schema : null,
    note: typeof doc.note === "string" ? doc.note : "",
    file,
    list: Object.freeze(list),
    byId,
  });
  return cache;
}

function resetRegistryCache() {
  cache = null;
}

module.exports = { loadRegistry, resetRegistryCache, DEFAULT_REL };
