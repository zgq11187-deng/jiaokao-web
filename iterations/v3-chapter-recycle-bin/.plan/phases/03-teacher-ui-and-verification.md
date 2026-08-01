# Phase 03 — 老师端与验证

**Status**: completed
**目标**: 老师可按需查看已归档章节，并得到同步结果和 Notion 不可用提示。
**前置**: Phase 02 已验收

## 验收判据

- 默认老师章节列表隐藏归档章节；开关可显示并选择归档章节。
- 归档章节有清晰状态与 Notion 教学页同步提示。
- 同步提示包含新增、更新、归档、恢复、保留和跳过无效页面。
- `ARCHITECTURE.md`、`npm run check` 和 `npm run build` 完成更新或验证。

## Tasks

- [x] 实现老师端归档筛选、状态展示和同步结果提示。(apps/web/src/main.jsx:72-130, apps/web/src/main.jsx:310-323, apps/web/src/main.jsx:830-969)
- [x] 保持学生开放范围展示独立于归档状态。(apps/web/src/main.jsx:1039-1053, apps/web/src/main.jsx:2216-2240)
- [x] 更新架构文档中的生命周期、查询和访问规则。(ARCHITECTURE.md:79-80, ARCHITECTURE.md:139-142, ARCHITECTURE.md:198-202)
- [x] 运行检查和构建，记录验证结果。(npm run check; npm run build, 2026-08-01)

## Notes

- 老师端默认仅排序和搜索未归档章节；切换“显示已归档”后可查看历史数据。同步完成后自动回到默认隐藏状态。
- 归档章节会显示来源状态和本地历史数据提示，并禁用依赖 Notion 的按钮；学生开放范围和指定学生授权仍显示为独立状态。
- `npm run check`、`npm run build` 和 `git diff --check` 通过。Vite 仍报告既有 Mermaid 依赖的大 chunk 警告，不影响本次构建。
