# 当前状态

## 2026-06-03

- 已确认现有链路具备 `baseSeq` 和三方合并雏形。
- 主要缺口在浏览器本地草稿持久化、过旧提交留痕、诊断可见性。
- 已实现 IndexedDB/localStorage 本地草稿兜底；恢复草稿时保留原始 `baseSeq`，由服务端按旧基线合并。
- 已实现过旧 `baseSeq` 的服务端拒绝覆盖和 `collab/conflicts` 留痕。
- 已扩展协作诊断，显示本地草稿、草稿时间、草稿基线和草稿错误。
- 已通过 `node --check app/collab.js` 和 `python -m unittest tests.test_collab`。
