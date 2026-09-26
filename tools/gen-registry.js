"use strict";

/**
 * 把 data/aggregators.json 编译成仓库根目录那份索引（aggregator_index.js）。
 * 构建时跑：npm pack 会通过 prepack 钩子调它。
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const { VERSION } = require(path.join(ROOT, "src", "version.js"));

const dataFile = path.join(ROOT, "data", "aggregators.json");
const doc = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const rows = Array.isArray(doc.aggregators) ? doc.aggregators : [];
if (rows.length === 0) {
  throw new Error(`${dataFile} 里一条聚合器都没有`);
}

const ids = rows.map((row) => row.id).slice().sort();
const plan = new Map();
for (const row of rows) {
  plan.set(row.id, {
    label: typeof row.label === "string" && row.label !== "" ? row.label : row.id,
    field: row.field === true,
    coerce: typeof row.coerce === "string" && row.coerce !== "" ? row.coerce : "none",
  });
}

const builtAt = new Date().toISOString();
const buildId = crypto.randomUUID();

const lines = [];
lines.push("// 由 tools/gen-registry.js 生成，别手改。");
lines.push(`// builtAt: ${builtAt}`);
lines.push(`// buildId: ${buildId}`);
lines.push(`// version: ${VERSION}`);
lines.push('"use strict";');
lines.push("");
lines.push("module.exports = {");
lines.push(`  builtAt: ${JSON.stringify(builtAt)},`);
lines.push(`  buildId: ${JSON.stringify(buildId)},`);
lines.push(`  version: ${JSON.stringify(VERSION)},`);
lines.push(`  ids: ${JSON.stringify(ids)},`);
lines.push("  plan: {");
for (const id of ids) {
  const item = plan.get(id);
  lines.push(
    `    ${JSON.stringify(id)}: { label: ${JSON.stringify(item.label)}, field: ${item.field}, coerce: ${JSON.stringify(item.coerce)} },`,
  );
}
lines.push("  },");
lines.push("};");

const out = path.join(ROOT, "aggregator_index.js");
fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`已生成 ${path.relative(ROOT, out)}：${ids.length} 个聚合器，version ${VERSION}`);
