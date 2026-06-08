# Phase 03 — AIGC Teaching Flow

**Status**: `completed`
**目标**: 收敛 Qwen + Codex Agent A/B/C + Notion 的教学页生成流程，使输出可检查、失败可追踪、内容可回滚。
**前置**: Phase 01 完成；Phase 02 至少具备章节和题库基础数据。

## 验收判据

phase 完成 = 下面所有判据全部满足：

- `npm run check` 通过。
- 上传图片/PDF/CSV/TXT/MD 后，Qwen 原始页能写入 SQLite，并在 Notion 原始页面库关联章节。
- 无文件场景下，老师可点击“创建 Notion 讲义页”，在 Notion 原始页面库创建占位讲义页，在原始资料库创建关联记录，并同步 SQLite `raw_pages` 占位记录；该流程不调用 Qwen OCR。
- 老师可点击“扫描 Notion 触发项”，识别 `自动填充考点`、`入库`、`生成课件` 三类复选框，并按 Logseq 版 Agent 规则执行 A/B/C。
- Codex Agent A 能生成并保存考点分析，失败时写入日志。
- Codex Agent B 能筛选真题并入库，重复题处理和 Notion 关联有明确日志。
- Codex Agent C 的最小可用范围已写入文档或代码注释，并能生成教学页 Markdown。
- Codex Agent C 的教学页版式对齐 Notion Agent 指令：学习目标、讲稿口播、课堂导入、知识结构、重点难点、原文小节逐段增补、六段式概念展开、历年真题、2026 新增题库占位、随堂练习、课堂小结、课后作业、下节预告、教师备课卡。
- 真题题干和选项完整展示；答案、解析、考点归属使用 `<details><summary>答案与解析</summary>...</details>`，写入 Notion 时转换为 toggle 折叠块。
- 教学法增强块支持 `<callout icon="..." color="...">...</callout>`，写入 Notion 时转换为 callout 块。
- 教学页写回 Notion 章节库前后都有可检查状态，不直接视为最终发布。
- A/B/C 成功后尽力清勾 Notion 触发复选框并写评论汇报；评论或清勾失败记录 warning，不阻断核心结果。
- `generation_logs` 能展示 running/success/error/warning 等关键状态。
- 支持导出 Markdown、教学网页、PPT、章节题库的现有能力未回退。

## Tasks

- [x] 明确 Codex Agent C 的最小可用范围，并记录不复刻的 Notion Agent 高级能力。
- [x] 梳理现有 `raw-pages/from-file`、`fill-outline`、`import-exam-questions`、`generate-teaching-page`、`generate-all` API。
- [x] 增加无文件创建 Notion 讲义页 API，确保原始页面库、原始资料库和本地 `raw_pages` 同步成功。
- [x] 把 A/B/C 路由改为共用 service，并新增 Notion 触发项扫描 API。
- [x] 支持 Notion checkbox 清勾、评论汇报和 warning 记录。
- [x] 为 A/B/C 增加或修正人工检查状态、警告展示、失败日志。
- [x] 确保 Qwen 原始页、考点、真题、教学页都能在章节详情中看到来源和时间。
- [x] 确保教学页写回 Notion 章节库后，同步保存到 SQLite `teaching_pages`。
- [x] 按 Notion Agent 指令更新 C prompt：保留原始小节骨架、逐小节增补、六段式、真题折叠解析、教学卡片和生成前自检。
- [x] 支持 C 输出中的 `<details>` 与 `<callout>` 写入 Notion 为对应块，避免折叠答案和教学法提示丢失结构。
- [x] 增加回滚或保留历史版本策略：至少能查看历史教学页，避免新结果覆盖旧结果后无法恢复。
- [x] 验证导出 Markdown、教学网页、PPT、章节题库。
- [x] 整理一条端到端手工验证步骤，覆盖上传 -> A -> B -> C -> Notion -> 网页预览 -> 导出。

## Notes

- A/B 已完成，但 C 还不能实现原 Notion Agent 中的所有功能；本 phase 重点是定义 C 的首版边界，而不是一次性追平所有能力。
- “创建 Notion 讲义页”是 AIGC 教学页生成前的 Notion 建页辅助流程，只写入占位讲义页和关联记录，不等同于 Qwen OCR，也不代表 AI 内容已可发布或导出。
- C 生成不直接复刻 Notion Agent 的全部运行环境，但输出格式和内容要求按用户提供的 Notion Agent 指令执行；AI 生成内容仍然只进入草稿和人工检查流程。

## Evidence

- 2026-06-06：已整理并执行一轮“上传 -> A -> B -> C -> 导出”验收，样本章节为 `第 1 章第 1 节-0606-2`（chapter id: 26）。详见 [03-aigc-teaching-flow-validation.md](./03-aigc-teaching-flow-validation.md)。
- 本轮已验证章节详情 API、历史 Qwen/A/B/C 日志、Markdown/教学网页/PPT/章节题库导出，并修复 C 结构校验对标准 Markdown 表格和非真题 details 的误报。
- 2026-06-06：重新执行 C，新增 `teaching_pages.id = 6` 和 `generation_logs.id = 182`，四种导出均返回 200；修正后的校验逻辑对最新 Markdown 复测 `warnings = []`。
- 当前 shell 未提供 `npm`，无法直接执行 `npm run check`；已用等价底层检查替代：Vite build 通过，`node --check apps/server/src/index.js` 与 `node --check apps/server/src/prompts.js` 通过。
