# v1-launch 实施计划：把教考智联工作台做成可内测首版

> 文件位置：`iterations/v1-launch/.plan/plan.md`
> 配套 skill：first-flight-phases
> 本 plan 文档是稳定航图，状态跟踪在各 phase 文档（同目录的 `phases/NN-*.md`）里。

## 背景

v1-launch 已完成 BRIEF、PRD、DESIGN、ARCHITECTURE、CONTENT、AGENTS 六份 spec。当前项目已有 React + Vite 前端、Express 后端、SQLite、Notion、Qwen、Codex Agent A/B/C 的工作台雏形，但距离“授权学生可用、老师可备课、教学页可检查导出”的首版还有多个跨模块闭环。

本计划把首版拆成可独立验收的阶段，避免一次性改完登录、题库、教学页生成、教师工作台和 UI 后无法判断问题来源。每个 phase 完成后停下来验收，再进入下一阶段。

## 范围

**做：**

- 登录授权最小闭环：学生申请、老师审核、授权拦截、退出登录。
- 学生端章节学习、刷题、错题、模拟考试的首版可用流程。
- 教师端学生授权、题库管理、练习布置、学习反馈的工作台入口。
- Qwen + Codex Agent A/B/C + Notion 教学页生成流程的可检查、可回滚首版闭环。
- 按 DESIGN.md 统一界面风格，并完成基础验证和内测准备。

**不做：**

- 不做短信验证码、微信登录、找回密码自动流程。
- 不做多班级、多学校、多角色细分、学校组织架构。
- 不做在线支付、学生社交讨论区、移动 App。
- 不迁移到 Next.js / Astro / PostgreSQL，除非先更新 ARCHITECTURE 并获得确认。
- 不把 AI 生成教学内容直接发布为最终内容，必须保留人工检查入口。

## 阶段总览

| #  | 阶段 slug | 一句话目标 | 状态 |
|----|-----------|------------|------|
| 01 | baseline-and-auth | 建立开发基线，并完成登录授权最小闭环 | completed |
| 02 | course-data-and-practice | 补齐章节、题库、练习、错题、模拟考试的数据与 API 基础 | not started |
| 03 | aigc-teaching-flow | 收敛 Qwen/Codex/Notion 教学页生成流程，保证可检查和可回滚 | completed |
| 04 | student-experience | 完成授权学生的章节学习、刷题、错题、模考界面 | in progress |
| 05 | teacher-workbench | 完成教师工作台的授权、题库、布置练习、反馈、导出入口 | not started |
| 06 | design-verification-and-pilot | 统一视觉、补齐验证、准备一个班内测 | not started |

> 状态值：`not started` / `in progress` / `completed` / `blocked` / `skipped`
>
> 详细任务、evidence、blocker 在各 phase 文档（`phases/NN-<slug>.md`）里，不在本表里展开。

## 关键决策

- **2026-05-31**：先做登录授权，因为 PRD 已确定首版只给授权学生使用；不先做访问控制，后续章节、题库、教学页页面都会返工。
- **2026-05-31**：继续使用 React + Vite、Express、SQLite、Notion、Qwen、Codex CLI 的现有 monorepo，不做无关迁移。
- **2026-05-31**：把 AIGC 教学页生成单独作为 phase，因为 A/B 已完成但 C 尚未复刻原 Notion Agent 全部能力，需要独立定义最小可用范围。
- **2026-05-31**：最后统一设计与验证，避免在功能还未闭环时过早做大规模视觉整理。

## Open Questions

- [ ] 教师初始账号如何创建：写种子脚本、环境变量初始化，还是临时管理命令？— 预期在 phase 01 解决
- [x] C 生成教学页的“最小可用范围”具体包括哪些 Notion Agent 能力？— 已在 phase 03 解决
- [x] 模拟考试组卷规则：固定题量还是按题型比例抽题？— Phase 04 首版按本地题库题型顺序抽取一组题，后续再优化比例
- [ ] 练习布置是否首版必须支持截止时间？— 预期在 phase 05 解决
- [ ] 一个班内测如何访问本机/内网服务？— 预期在 phase 06 解决

## 关联

- 长期文档（项目根）：[BRIEF.md](../../../BRIEF.md) / [DESIGN.md](../../../DESIGN.md) / [ARCHITECTURE.md](../../../ARCHITECTURE.md) / [AGENTS.md](../../../AGENTS.md)
- 当前迭代 PRD：[PRD.md](../PRD.md)
- 首版 CONTENT：[CONTENT.md](../CONTENT.md)
