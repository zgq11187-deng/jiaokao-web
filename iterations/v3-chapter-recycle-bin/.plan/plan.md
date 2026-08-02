# Notion 章节归档实施计划

## 背景

本地章节数据承载教学页、题库和答题历史，不能因 Notion 删除页面而物理删除。现有同步只关闭全体学生可见，老师默认列表仍保留失效章节，且不能区分来源状态与学生发布范围。

本计划引入独立的 `notion_archived` 生命周期字段：将失效 Notion 章节归档并隐藏，保留全部历史数据；页面恢复时只恢复来源状态。

## 范围

**做：**

- 增加兼容 SQLite 迁移和 Notion 章节归档状态。
- 完整同步有效 Notion 页面，并归档或恢复已有本地章节。
- 在老师端提供已归档筛选和提示，在学生端及所有受保护访问中拒绝归档章节。
- 更新本迭代 PRD 与架构文档，完成检查和构建。

**不做：**

- 不提供人工移入回收站、恢复或永久删除。
- 不删除教学页、题库、答题记录或指定学生授权。

## 阶段总览

| # | 阶段 slug | 一句话目标 | 状态 |
|---|---|---|---|
| 01 | spec-and-data | 固化规则并完成兼容字段迁移 | completed |
| 02 | sync-and-access | 完成 Notion 对账、归档和访问限制 | completed |
| 03 | teacher-ui-and-verification | 完成老师端归档体验、文档和验证 | completed |

## 关键决策

- **2026-08-01**：使用 `notion_archived`，而非人工回收站的 `deleted_at/deleted_by`，因为本迭代只表达 Notion 来源是否有效。
- **2026-08-01**：归档时强制关闭 `student_visible`，但保留 `chapter_student_access`；恢复时不自动重新开放，避免错误发布。
- **2026-08-02**：空 `notion_page_id` 章节按 Unicode NFKC、连续空白合并和首尾空白清理后的标题参与对账；唯一匹配时复用本地记录，匹配不到时归档，同名页面不自动选择。该规则要求部署前确认空 ID 本地章节均应纳入 Notion 管理。

## Open Questions

- [ ] 无；已确认本迭代不实现人工回收站。

## 关联

- [ARCHITECTURE.md](../../../ARCHITECTURE.md)
- [PRD.md](../PRD.md)
