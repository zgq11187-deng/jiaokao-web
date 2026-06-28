# Phase 01 — Baseline And Auth

**Status**: `completed`
**目标**: 建立开发基线，并完成账号密码登录、学生申请、老师审核、授权拦截、退出登录的最小闭环。
**前置**: First Flight spec 已完成；`.env` 至少具备本地开发所需配置。

## 验收判据

phase 完成 = 下面所有判据全部满足：

- `npm run check` 通过。
- 老师账号可以登录并看到教师入口。
- 学生可以提交姓名、手机号、密码、班级/身份说明并进入待审核状态。
- 老师可以通过或拒绝学生申请。
- 未登录用户只能访问登录/注册/申请状态相关页面。
- 已登录但未授权学生不能访问课程、题库、模拟考试、教学页和资料下载。
- 已授权学生可以访问学生端基础入口。
- 密码不以明文保存，前端不暴露 Notion/Qwen/Codex 密钥。

## Tasks

- [x] 记录当前基线：检查 `npm run check`、现有路由/API、数据库表、环境变量缺口。(`npm run check` 通过；apps/server/src/index.js:174-209；apps/server/src/db.js:88-120；.env.example:26-27)
- [x] 设计并实现认证相关 SQLite 表：`users`、`student_applications`、`sessions` 或等价最小结构。(apps/server/src/db.js:88-120)
- [x] 实现密码哈希、session/token 创建、登录态读取、退出登录。(apps/server/src/auth.js:7-61；apps/server/src/index.js:116-133)
- [x] 实现学生注册申请 API：姓名、手机号、密码、班级/身份说明。(apps/server/src/index.js:88-114)
- [x] 实现老师审核 API：申请列表、通过、拒绝、预录入学生账号。(apps/server/src/index.js:136-168；apps/server/src/index.js:557-580)
- [x] 为受保护 API 添加登录、授权、角色校验中间件。(apps/server/src/auth.js:97-114；apps/server/src/index.js:174-225；apps/server/src/index.js:523-548)
- [x] 实现前端登录、注册、待审核、未授权拦截和退出登录流程。(apps/web/src/main.jsx:67-161；apps/web/src/main.jsx:221-253；apps/web/src/main.jsx:360-430)
- [x] 添加或更新最小验证脚本/手工验证记录，覆盖老师、待审核学生、已授权学生三种身份。(`npm run check` 通过；API smoke: 未登录章节 401、老师登录 200、学生申请 200、老师审核 200、学生状态 approved)

> 状态符号：
>
> - `[ ]` 待办
> - `[~]` 进行中
> - `[x]` 已完成 — 行尾必须追加 evidence：`文件路径:行号` / `commit hash` / `命令`
> - `[-]` 跳过 — 行尾注明理由，只在用户明确说跳过时才标
> - `[!]` 受阻 — 在 Notes 区写清 blocker

## Notes

- 第一版不做短信验证码、微信登录、自动找回密码、多班级、多角色细分。
- 教师初始账号创建方式已定为首屏初始化：没有老师账号时，前端显示“初始化老师账号”，调用 `/api/auth/bootstrap-teacher` 创建第一个老师账号。
- 本地开发服务在沙盒内启动会遇到端口/文件监听限制；已用授权后的 `npm run dev` 启动验证，前端 `http://127.0.0.1:5174/`、后端 `http://127.0.0.1:37200` 正常就绪。
