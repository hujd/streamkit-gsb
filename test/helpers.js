"use strict";

const ck = require("../src/index.js");

const TUMBLING = { window: { type: "tumbling", size: 1000 } };

const BASIC = {
  window: { type: "tumbling", size: 1000 },
  aggregators: {
    n: { id: "count" },
    total: { id: "sum", field: "amount" },
  },
};

/** 收产出的批次。 */
function collect(stream) {
  const batches = [];
  stream.onEmit((batch) => batches.push(batch));
  return batches;
}

/** 造一条流，顺便把产出收进数组。 */
function makeStream(overrides) {
  const cfg = Object.assign({}, BASIC, overrides || {});
  const stream = ck.createStream(cfg);
  return { stream, batches: collect(stream) };
}

function ev(time, amount) {
  return { time, amount };
}

module.exports = { ck, TUMBLING, BASIC, collect, makeStream, ev };
