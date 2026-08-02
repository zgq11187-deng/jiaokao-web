# Phase 02 — 同步与访问限制

**Status**: completed
**目标**: 让完整 Notion 同步归档或恢复章节，并使学生无法查看、访问或操作归档章节。
**前置**: Phase 01 已验收

## 验收判据

- 分页查询跳过 Notion 回收站和已归档页面，并返回完整统计。
- 缺失 Notion 页面归档本地章节和关闭全体学生可见，不删除关联数据；空 `notion_page_id` 记录按规范化标题参与对账。
- 唯一标题匹配的空 ID 记录补写 Notion 来源信息；同名页面跳过绑定并返回歧义统计。
- 恢复页面更新元数据并仅恢复 `notion_archived`。
- 学生列表和所有章节访问校验拒绝归档章节，老师仍可访问。

## Tasks

- [x] 过滤无效 Notion 页面并保留分页计数。(apps/server/src/index.js:3677-3688)
- [x] 实现归档、恢复、保留、标题绑定、同名跳过与无效页面统计。(apps/server/src/index.js:3717-3827)
- [x] 将学生列表和统一权限判断接入 `notion_archived`。(apps/server/src/index.js:3833-3862)
- [x] 为依赖 Notion 的当前章节教学页同步增加归档前置校验。(apps/server/src/index.js:304-312, apps/server/src/index.js:3864-3872)

## Notes

- `node --check apps/server/src/index.js` 与 `git diff --check` 通过。
- 2026-08-01：隔离服务验证：已设置为全员可见且已有指定学生授权的归档章节，学生列表返回 0 条、旧详情地址返回 403、老师列表仍可读取该章节。
- 2026-08-02：标题对账验证：空 ID 章节在标题缺失时归档，唯一标题恢复时补写页面 ID，同名页面保持未绑定并返回歧义统计。
