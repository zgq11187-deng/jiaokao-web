# Phase 04 — Student Experience

**Status**: `in progress`
**目标**: 完成授权学生的章节学习、刷题、错题、模拟考试、资料查看首版界面。
**前置**: Phase 01 完成；Phase 02 完成；Phase 03 的教学页预览数据可读取。

## 验收判据

phase 完成 = 下面所有判据全部满足：

- `npm run check` 通过。
- 授权学生登录后能看到首页、章节列表、章节详情、练习、错题、模拟考试、资料入口。
- 学生端页面遵守 DESIGN.md：清晰、克制、亲和，不使用大 hero、儿童化卡通、大面积渐变。
- 章节详情能展示学习目标、知识点、资料、练习入口、错题入口、教学页预览。
- 练习页面能完成答题、提交、查看解析、记录错题。
- 模拟考试页面能开始、答题、提交、查看结果摘要和薄弱章节提示。
- 手机端至少能完成章节学习、答题、查看解析。
- 未授权/待审核学生访问学生端内容时能看到清晰提示。

## Tasks

- [x] 设计学生端路由和页面状态：未登录、待审核、已授权、加载中、空状态、错误状态。
- [x] 实现首页学生入口和学习路径区。
- [x] 实现课程章节页 `/chapters`。
- [x] 实现章节详情页 `/chapters/[id]` 的学生视图。
- [x] 实现题库/练习页 `/practice` 的首版交互。
- [x] 实现错题回看入口和错题状态提示。
- [x] 实现模拟考试页 `/mock-exam` 的首版交互。
- [x] 实现资料下载页 `/resources` 的学生可见部分。
- [ ] 做一次移动端视口检查，确认按钮、题目选项、解析不重叠。

## Notes

- 学生端优先可读和可完成任务，不追求复杂仪表盘。
- Phase 02 尚未单独完成完整题库 / 练习 API 基础；Phase 04 第一轮先补最小 `question_attempts` 答题记录表和学生端 API，基于现有 `chapters`、`exam_questions`、`outline_analyses`、`teaching_pages` 做可用闭环。
- 错题首版从学生个人答题记录中聚合，不额外维护独立错题库；模拟考试首版从本地题库抽题，不做复杂题型比例和考试配置后台。

## Evidence

- `apps/server/src/db.js` 新增 `question_attempts` 表，保存学生章节练习和模考答题记录。
- `apps/server/src/index.js` 新增学生端 API：`POST /api/questions/:id/attempt`、`GET /api/student/wrong-questions`、`GET /api/mock-exam/questions`、`POST /api/mock-exam/submit`、`GET /api/student/summary`。
- `apps/web/src/main.jsx` 学生端从静态入口升级为“章节学习 / 章节练习 / 错题回看 / 模拟考试 / 资料导出”标签页。
- API 验证：学生 session 调用练习提交返回 200；错题查询返回 200；模考提交返回 200。
- 用户手动验证：“章节练习 -> 答错 -> 错题回看 -> 模拟考试”可用。
- `apps/web/src/main.jsx` 新增学生端轻量路由：`/`、`/chapters`、`/chapters/:id`、`/practice`、`/wrong-questions`、`/mock-exam`、`/resources`。
- `apps/web/src/styles.css` 补充学生首页、章节卡片、学生导航和 720px 移动端响应式布局。
- 构建验证：`vite build` passed；`node --check apps/server/src/index.js` passed；`node --check apps/server/src/db.js` passed。
