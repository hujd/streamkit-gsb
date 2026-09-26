// 由 tools/gen-registry.js 生成，别手改。
// builtAt: 2026-09-26T01:56:38.008Z
// buildId: 37b1466d-b756-4281-bbb9-2ee99188312f
// version: 1.0.0
"use strict";

module.exports = {
  builtAt: "2026-09-26T01:56:38.008Z",
  buildId: "37b1466d-b756-4281-bbb9-2ee99188312f",
  version: "1.0.0",
  ids: ["avg","collect","count","max","min","sum"],
  plan: {
    "avg": { label: "平均值", field: true, coerce: "number" },
    "collect": { label: "收集", field: true, coerce: "any" },
    "count": { label: "计数", field: false, coerce: "none" },
    "max": { label: "最大值", field: true, coerce: "number" },
    "min": { label: "最小值", field: true, coerce: "number" },
    "sum": { label: "求和", field: true, coerce: "number" },
  },
};
