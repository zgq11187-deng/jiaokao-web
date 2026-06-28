# Phase 03 手工验收记录 — 上传 -> A -> B -> C -> 导出

**日期**: 2026-06-06
**样本章节**: 第 1 章第 1 节-0606-2（本地 chapter id: 26）
**目标**: 验证 Qwen 原始页、A/B/C、Notion 写回、网页数据和导出能力是否形成可检查闭环。

## 验收清单

| 步骤 | 验收动作 | 期望结果 | 本次结果 |
|---|---|---|---|
| 0. 服务 | 检查后端 `/health` 与前端页面 | 后端返回 ok；前端 HTML 可访问 | 通过。后端 `127.0.0.1:37200` 正常，前端 `127.0.0.1:5175` 正常 |
| 1. 章节详情 | 请求 `/api/chapters/26` | 返回章节、原始页、考点、真题、教学页、日志 | 通过。rawPages=2, outlines=1, questions=8, teachingPages=2 |
| 2. 上传/Qwen 原始页 | 检查 `qwen-raw-page` 日志与 raw_pages | 有 running/success 日志，本地有 raw_pages，Notion page id 已保存 | 通过。最近日志显示“原始页面已追加到同名 Notion 页面” |
| 3. A 自动填充考点 | 检查 `fill-outline` 日志与 outline_analyses | 有考点分析记录，日志 success | 通过。outline_analyses 有 1 条，日志 success |
| 4. B 真题自动入库 | 检查 `import-exam-questions` 日志与 exam_questions | 有题目入库/关联记录，日志 success | 通过。exam_questions 有 8 条，题型覆盖单选/多选/判断 |
| 5. C 生成教学页 | 检查 `generate-teaching-page` 日志与 teaching_pages | 有教学页 Markdown，状态为草稿，有 warning 可检查 | 通过。teaching_pages 有 2 条，日志 success |
| 6. 导出 Markdown | 下载 `/export/markdown` | 返回 `.md`，包含 callout、mermaid、details、表格 | 通过。200，约 33 KB |
| 7. 导出教学网页 | 下载 `/export/site` | 返回 `.html`，表格转换、details、mermaid、目录存在 | 通过。200，约 65 KB |
| 8. 导出演示 PPT | 下载 `/export/ppt` | 返回 `.pptx`，文件可作为 zip 解析 | 通过。200，约 806 KB |
| 9. 导出章节题库 | 下载 `/export/question-bank` | 返回 `.html`，题型筛选、题卡、答案折叠存在 | 通过。200，约 22 KB |
| 10. 构建检查 | 前端 build + 后端语法检查 | 无阻断错误 | 通过。Vite build 成功；`node --check` 通过 |

## 发现的问题

1. **C 结构校验误报 Markdown 表格**
   - 现象：最新教学页 warning 中出现“存在疑似未按标准 Markdown 表格输出的管道文本”，但导出的教学网页已经把表格正确转换为 `.table-wrap <table>`。
   - 原因：校验函数只检查表格行是否紧邻分隔行，标准 Markdown 表格的数据行不一定每一行都紧邻分隔行。
   - 处理：已修复 `hasLooseMarkdownTable()`，按完整表格区块识别，不再误报正常数据行。

2. **C 结构校验误报非真题 details**
   - 现象：随堂练习的 `<summary>参考答案</summary>` 被计入“未使用答案与解析”的 warning。
   - 原因：校验函数把所有 details 都当作真题答案解析。
   - 处理：已改为只对疑似真题 details 检查固定 `答案与解析` summary。

3. **历史数据里存在旧 warning**
   - 现象：chapter 26 已生成的 teaching_pages 仍保留修复前 warning。
   - 原因：这是历史生成记录，修复只影响后续 C 生成。
   - 处理：保留历史 warning，不直接改库；如需干净结果，重新执行 C 后会使用新校验逻辑。

4. **本机 shell 找不到 npm**
   - 现象：直接执行 `npm run check` 报 `command not found: npm`。
   - 原因：当前 Codex shell PATH 没有 npm。
   - 处理：使用 Codex 内置 Node 运行等价检查：`vite build`、`node --check apps/server/src/index.js`、`node --check apps/server/src/prompts.js`。

## Evidence

- `/api/chapters/26`: `rawPages=2`, `outlines=1`, `questions=8`, `teachingPages=2`。
- 导出结果：
  - `/private/tmp/jiaokao-markdown.out`：200，约 33 KB。
  - `/private/tmp/jiaokao-site.out`：200，约 65 KB。
  - `/private/tmp/jiaokao-ppt.out`：200，约 806 KB。
  - `/private/tmp/jiaokao-question-bank.out`：200，约 22 KB。
- 教学网页导出包含：
  - `.table-wrap <table>`；
  - `<details class="md-details"><summary>答案与解析</summary>`；
  - Mermaid 初始化脚本；
  - `课后作业`、`教师备课卡`。
- 章节题库导出包含：
  - `一、单选`、`二、多选`、`三、判断`、`四、简答`、`五、操作`；
  - 题卡 `data-type`；
  - 折叠答案解析。

## 下一步

- 若要验证“当前代码修复后的 C warning”，需要对一个测试章节重新执行 C；这会再次写回 Notion 章节正文，因此建议先确认测试章节。
- 完成一次新的 C 后，再把 Phase 03 主文档中的对应任务和 evidence 勾选。

## 2026-06-06 重新执行 C 验证

**动作**: 对 `第 1 章第 1 节-0606-2`（chapter id: 26）重新调用 `POST /api/chapters/26/generate-teaching-page`。

**结果**:

- 新增 `teaching_pages.id = 6`，创建时间 `2026-06-06 13:59:15`。
- 新增 `generation_logs.id = 182`，`step = generate-teaching-page`，`status = success`。
- 最新 C 生成摘要：约 39 页 Notion Presentation Mode 教学页草稿，包含学习目标、导入、结构图、重点难点、原小节六段式讲解、真题演练、2026 题库占位、分层练习、课堂小结、课后作业、下节预告和教师备课卡。
- 重新导出通过：
  - Markdown：200，约 45 KB。
  - 教学网页：200，约 80 KB，包含 `.table-wrap`、`md-details`、Mermaid、课后作业、教师备课卡。
  - PPT：200，约 931 KB，PPTX 内含 51 张 slide。
  - 章节题库：200，约 22 KB，题型筛选文案正常。

**warning 验证**:

- 旧的“Markdown 表格误报”已经消失。
- 新结果仍出现一次“疑似真题 details 未使用固定答案与解析 summary” warning。
- 检查最新 Markdown 后确认：13 个真题 details 均使用 `<summary>答案与解析</summary>`；唯一不同的是随堂练习的 `<summary>参考答案</summary>`，属于校验误报。
- 已继续修正 `isLikelyExamDetails()`，不再把普通“参考答案”折叠块误判为真题折叠块。
- 使用最新 Markdown 按修正后的校验逻辑复测：`details = 14`，`badDetails = 0`，`warnings = []`。

**剩余说明**:

- `teaching_pages.id = 6` 的 `warnings_json` 是生成时写入的历史记录，仍保留该误报；后续再次生成会使用新的校验逻辑。
- 其余 warning 为真实内容风险：占位讲义页未提取文本、原始资料缺少“三”编号、缺少可确认 2026 新增题库、没有简答/操作真题等，属于需要老师人工检查的合理提示。
