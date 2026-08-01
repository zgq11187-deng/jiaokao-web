# Phase 01 — 规格与数据迁移

**Status**: completed
**目标**: 将 Notion 来源归档规则写入 v3 规格，并让新旧 SQLite 数据库都拥有兼容的 `notion_archived` 字段。
**前置**: 无

## 验收判据

- 新建数据库的 `chapters` 含 `notion_archived INTEGER NOT NULL DEFAULT 0`。
- 已有数据库启动时会自动补充该字段，且不改动现有章节数据。
- PRD 明确区分 `notion_archived`、`student_visible` 和指定学生授权，并排除人工回收站。

## Tasks

- [x] 将 v3 规格改为 Notion 章节归档，明确非目标为人工回收站。(iterations/v3-chapter-recycle-bin/PRD.md:1)
- [x] 在建表 SQL 和启动迁移中增加 `notion_archived`。(apps/server/src/db.js:18-21, apps/server/src/db.js:154-168)
- [x] 对迁移脚本进行语法和空数据库验证。(node --check apps/server/src/db.js; new-db / legacy-db temporary SQLite migration verification, 2026-08-01)

## Notes

- 已有未提交的 v3 回收站规格被用户明确改为 Notion 生命周期归档；未改动与本次无关的工作区文件。
- 默认 `data/app.db` 在本会话中不可写，因此迁移验证使用 `/private/tmp` 中新建和旧结构的隔离 SQLite 文件；真实数据库未被触碰。
- 2026-08-01：用户用真实 `data/app.db` 的 `PRAGMA table_info(chapters)` 确认 `notion_archived` 已存在，默认值为 `0`。
