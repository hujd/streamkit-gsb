"use strict";

/**
 * 库对外抛出的错误。`code` 是稳定契约，调用方按 code 分支，不要去匹配文案。
 */

const CODES = Object.freeze({
  E_CONFIG: "E_CONFIG", // 流/窗口配置不合法
  E_REGISTRY: "E_REGISTRY", // 聚合器表读不到、或配置里用了表里没有的聚合器
  E_EVENT: "E_EVENT", // 事件本身不合法（time 不是有限数、字段缺了或类型不对）
});

class StreamkitError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "StreamkitError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

module.exports = { StreamkitError, CODES };
