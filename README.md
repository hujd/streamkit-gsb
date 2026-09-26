# streamkit

按**事件时间**做窗口聚合的小库：把带 `time` 的事件推进来，它按窗口把事件攒住，等水位线推过窗口末尾（再加上允许的迟到）之后，把这一窗的结果吐出来。窗口支持滚动（tumbling）与滑动（sliding），聚合器（计数、求和、最小、最大、平均、收集原值）声明在 `data/aggregators.json` 里，构建脚本 `tools/gen-registry.js` 把它编译成仓库根目录那份索引。

零依赖，用 Node 18 自带的测试跑法就够：

```bash
npm test                       # 等价于 node --test test/
node tools/gen-registry.js     # 重新生成仓库根目录那份聚合器索引
```

## 现在能用到什么程度

在仓库目录里跑是好的：`npm test` 全绿，手动推几个事件也能看到窗口结果，`node -e` 里的例子都照着 `test/` 抄的。

但**这个包现在还发不出去**。打完包装到别的目录以后，`createStream()` 一上来就报错，内置的聚合器表和构建期生成的那份索引都找不到了；想在别的工程里用它，现在只能把整个仓库拷过去、在自己的代码里按相对路径引 `src/index.js`。

## 公开接口

- `createStream({ window, lateness, aggregators })` —— `window` 形如 `{ type: "tumbling", size: 1000 }` 或 `{ type: "sliding", size: 3000, slide: 1000 }`；`aggregators` 形如 `{ 输出名: { id: "sum", field: "amount" } }`。
- `stream.push(event)` / `stream.advanceWatermark(t)` / `stream.flush()` / `stream.onEmit(fn)` / `stream.stats()`
- `aggregators()` —— 内置聚合器清单（读的是 `data/aggregators.json`）
- `version()` —— 运行时版本号
- `StreamkitError`，带稳定的 `code`（`E_CONFIG` / `E_REGISTRY` / `E_EVENT`）

细节以实现为准，README 只讲意图。
