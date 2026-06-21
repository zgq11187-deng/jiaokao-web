# 教考智联工作台 · ARCHITECTURE

## 1. 架构定位

教考智联工作台第一版采用本地优先的 Web 工作台架构：React + Vite 前端、Express 后端、SQLite 本地数据库、Notion 作为课程资料与教学页同步目标，Qwen 负责图片/文档到 Markdown 的原始页生成，Codex Agent 负责 A/B/C 教学内容生成流程。

这个项目不是纯静态课程网站，也不是营销落地页。它需要文件上传、AI 调用、Notion 写入、SQLite 持久化、登录授权、练习记录和导出能力，因此保留现有 `apps/web` + `apps/server` + `packages/shared` monorepo 结构。

## 2. 技术栈

### Frontend

- Framework：React 18
- Build tool：Vite 5
- Language：第一版继续兼容现有 JavaScript/JSX，后续新增模块优先 TypeScript
- Styling：Tailwind CSS
- UI：shadcn/ui + Radix UI
- Icons：lucide-react

理由：当前项目已经使用 React + Vite，并且界面属于工作台型应用。Vite 足够轻，适合本地开发和内网部署；shadcn/ui + Radix UI 与 DESIGN.md 中的表单、弹窗、Tabs、Toast、Dropdown、表格、授权审核列表和流程状态卡匹配。

### Backend

- Runtime：Node.js
- Framework：Express
- Module format：ESM
- Database：SQLite
- File upload：本地 `uploads/`
- Export：Markdown / HTML / PPT / 章节题库
- External APIs：Notion API、Qwen OpenAI-compatible API、Codex CLI

理由：后端需要持有密钥、写数据库、处理上传文件、调用 Qwen、调用 Codex CLI、写回 Notion，这些都不应放在前端。Express 继续作为所有业务 API 的边界。

## 3. Monorepo 结构

```text
project/
├── apps/
│   ├── web/                 # React + Vite 前端
│   │   ├── src/
│   │   │   ├── main.jsx
│   │   │   ├── styles.css
│   │   │   ├── components/  # 后续新增：通用 UI 与业务组件
│   │   │   ├── pages/       # 后续新增：页面级组件
│   │   │   └── lib/         # 后续新增：API client、工具函数
│   │   └── package.json
│   └── server/              # Express 后端
│       ├── src/
│       │   ├── index.js     # API 路由入口
│       │   ├── config.js    # 环境变量与运行目录
│       │   ├── db.js        # SQLite schema 与查询封装
│       │   ├── notion.js    # Notion API 边界
│       │   ├── qwen.js      # Qwen 调用边界
│       │   ├── codex.js     # Codex CLI 调用边界
│       │   ├── prompts.js   # A/B/C prompt
│       │   ├── markdown.js  # Markdown/Notion blocks 转换
│       │   └── exports.js   # 导出 Markdown/HTML/PPT
│       └── package.json
├── packages/
│   └── shared/
│       └── schemas/         # Codex Agent JSON schema
├── data/                    # SQLite 数据库与日志
├── uploads/                 # 上传文件
├── BRIEF.md
├── DESIGN.md
├── ARCHITECTURE.md
└── iterations/
    └── v1-launch/
        └── PRD.md
```

## 4. 数据策略

第一版继续使用 SQLite。SQLite 适合单教师、一个班级、本地/内网试用和快速迭代，能支撑章节、原始页、考点、真题、教学页、日志和练习记录。

现有核心表：

- `chapters`：章节，包含 `student_visible` 控制是否开放给学生
- `raw_pages`：Qwen 生成的 Markdown 原始页
- `outline_analyses`：A 自动填充考点结果
- `exam_questions`：B 真题入库结果和 Notion 教学页导入题，包含 `is_archived` 用于老师隐藏题目；隐藏题不进入学生练习、模拟考试和导出题库，但保留历史答题记录
- `teaching_pages`：C 教学页结果
- `generation_logs`：生成流程日志

第一版新增认证与学习相关表：

- `users`：用户账号，包含老师和学生
- `student_applications`：学生注册申请与审核状态
- `sessions`：登录会话或令牌
- `practice_attempts`：练习记录
- `wrong_questions`：错题记录
- `assignments`：老师布置的练习
- `assignment_submissions`：学生完成情况

后续如果出现多班级、多老师、长期公网访问或并发增长，再迁移到 PostgreSQL / Supabase / Neon。

## 5. 认证与授权

第一版使用简单账号密码登录，不接入微信、短信验证码或第三方 OAuth。登录授权只做最小闭环：账号密码登录、学生注册申请、老师通过/拒绝、未授权拦截、退出登录。

用户角色：

- `teacher`：老师/管理员，可审核学生、管理章节、题库、练习、教学页生成和导出
- `student`：学生，仅在授权后访问课程、练习、模考和教学页

授权规则：

- 学生可以自行注册，提交姓名和手机号，等待老师审核
- 老师也可以提前录入学生账号
- 老师根据姓名 + 手机号通过或拒绝申请
- 未授权用户只能访问登录/注册/申请状态页
- 未授权用户不能访问课程章节、题库、模拟考试、教学页和下载资源

第一版明确不做：

- 不做短信验证码
- 不做微信登录
- 不做找回密码自动流程
- 不做多班级
- 不做复杂角色权限
- 不做学校组织架构

安全要求：

- 密码必须哈希存储，不能明文保存
- Session token 使用 httpOnly cookie 或服务端可撤销 token
- 所有受保护 API 必须校验登录状态和授权状态
- 老师端 API 必须校验 `teacher` 角色
- 用户修改或被重置密码后，服务端删除该用户所有现有 session，要求重新登录

## 6. API 边界

前端只调用后端 API，不直接调用 Notion、Qwen 或 Codex CLI。

主要 API 分组：

- `GET /api/chapters`：章节列表；老师返回全部本地章节，学生只返回 `student_visible = 1` 的开放章节
- `GET /api/chapters/:id`：章节详情
- `POST /api/teacher/sync-chapters-from-notion`：老师手动同步 Notion 章节列表到 SQLite；只同步章节元数据，Notion 已删除章节先对学生隐藏，不读取页面正文，不导入习题
- `POST /api/teacher/chapters/:id/sync-teaching-page-from-notion`：老师手动同步当前章节 Notion 页面正文到本地教学页缓存
- `POST /api/teacher/chapters/:id/show-to-students`：老师将章节开放给学生
- `POST /api/teacher/chapters/:id/hide-from-students`：老师将章节对学生隐藏
- `POST /api/chapters/:id/raw-pages/from-file`：上传文件并用 Qwen 生成原始页
- `POST /api/chapters/:id/fill-outline`：Codex Agent A 自动填充考点
- `POST /api/chapters/:id/import-exam-questions`：Codex Agent B 真题入库
- `POST /api/chapters/:id/import-teaching-questions`：从当前章节最新教学页导入题库型习题，支持历年真题、模拟题、模拟训练、章节测试、习题精选、章节题库等区块，跳过课堂提问类内容；`历年真题演练开始` 到 `历年真题演练结束` 之间的内容强制视为历年真题导入范围，兼容标题、emoji、加粗和空格变体；题库区没有题型小标题时，可根据编号题和 A/B/C/D 选项解析；`单选题：...`、`多选题：...`、`判断题：...`、`操作题：...` 这类无编号题，以及 `单选题 1【模拟题】`、`多选题 1【模拟题】`、`判断题 1【模拟题】`、`操作题 1【模拟题】` 这类标题也按对应题型导入
- `POST /api/chapters/:id/cleanup-duplicate-questions`：老师清理当前章节 Notion AI 导入重复题
- `POST /api/teacher/chapters/:id/questions`：老师手动新增当前章节题目
- `PATCH /api/teacher/questions/:id`：老师编辑当前章节题目
- `POST /api/teacher/questions/:id/archive`：老师隐藏题目，不物理删除历史答题记录
- `POST /api/teacher/questions/:id/restore`：老师恢复已隐藏题目
- `POST /api/chapters/:id/generate-teaching-page`：Codex Agent C 生成教学页
- `POST /api/chapters/:id/generate-all`：串联执行 A/B/C
- `POST /api/notion-agent/scan-triggers`：老师手动扫描 Notion 复选框触发项，并执行 A/B/C
- `GET /api/chapters/:id/export/:kind`：导出 Markdown、HTML、PPT、题库
- `POST /api/auth/register`：学生注册申请
- `POST /api/auth/login`：登录
- `POST /api/auth/logout`：退出
- `POST /api/auth/change-password`：当前登录用户修改自己的密码，需校验旧密码
- `GET /api/auth/me`：当前用户
- `GET /api/teacher/applications`：老师查看申请
- `POST /api/teacher/applications/:id/approve`：通过申请
- `POST /api/teacher/applications/:id/reject`：拒绝申请
- `POST /api/teacher/students`：老师预录入学生账号
- `POST /api/teacher/students/:id/reset-password`：老师重置学生密码，并清除该学生现有 session
- `GET /api/teacher/teachers`：老师查看老师账号列表
- `POST /api/teacher/teachers`：老师添加其他老师，新老师拥有同等教师权限
- `POST /api/teacher/teachers/:id/reset-password`：老师重置其他老师密码，并清除被重置老师现有 session；不提供删除老师账号

## 7. Notion / Qwen / Codex Agent 流程

章节教学页生成链路：

1. 老师点击章节侧边栏刷新时，后端从 Notion 章节库同步手动创建和网页创建的章节元数据到 SQLite
2. 老师在章节详情页上传图片、PDF、CSV、TXT 或 MD
3. 后端调用 Qwen，将资料转换为 Markdown 原始页
4. 后端把 Markdown 原始页写入 Notion 原始页面库，并关联当前章节
5. 后端保存原始页到 SQLite `raw_pages`
6. Codex Agent A 基于新旧大纲、章节和原始页生成考点
7. 后端把 A 结果写入 SQLite，并同步 Notion 章节属性
8. Codex Agent B 筛选章节相关真题并入库
9. 后端写入 SQLite `exam_questions`，并关联 Notion 真题页
10. Codex Agent C 生成章节教学页 Markdown
11. 后端先把教学页追加/写回 Notion 章节库，再保存到 SQLite `teaching_pages`
12. 前端从后端读取最新教学页，用于网页展示和导出

既有 Notion Agent 内容同步链路：

- 老师先点击“同步 Notion 章节列表”，只更新本地章节列表，避免全量读取正文导致请求超时
- 老师选中当前章节后点击“同步当前章节教学页”，后端只读取该章节 Notion 页面正文并写入 `teaching_pages`
- 老师点击“导入当前章节习题”，后端只从当前章节最新教学页解析题库型内容并写入 `exam_questions`，包括历年真题、模拟题和自编题，排除课堂提问类互动题；解析器必须优先支持 `历年真题演练开始` / `历年真题演练结束` 成对边界，边界之间全部按历年真题处理；同时支持真题小节“单项选择题 / 多项选择题 / 判断题 / 操作应用题”、无编号题型前缀“单选题：...”和模拟题标题“单选题 1【模拟题】 / 多选题 1【模拟题】 / 判断题 1【模拟题】 / 操作题 1【模拟题】”，并按题型返回解析、新增、更新、跳过统计
- Notion 教学页导入题的来源必须区分 `Notion AI 题库题`、`Notion AI 模拟题`、`Notion AI 自编题`；操作题允许没有选项，答案保存为“按步骤评分”，参考步骤保存到解析
- 学生端只读取本地已开放章节、教学页和题库，不直接调用 Notion

Logseq 版 Notion Agent 触发链路：

- 章节库 `自动填充考点 = true`：执行 A，完成后尽力清勾并评论汇报
- 原始资料库 `入库 = true` 且 `类型 = 原始课件`：执行 B，完成后尽力清勾并评论汇报
- 章节库 `生成课件 = true`：依次执行 A → B → C，完成后尽力清勾并评论汇报
- 网页按钮 A/B/C/一键执行与 Notion 扫描共用同一套后端 service，避免规则分叉
- Notion 评论、复选框清勾或可选字段写入失败时记录 warning，不阻断核心生成；前置校验失败、关键 Notion 页面不可读、C 无骨架来源时中止

重要约束：

- A/B 已完成，C 还不能实现原 Notion Agent 中的所有功能
- C 第一版要定义最小可用范围
- A/B/C 输出必须进入可检查状态，避免错误内容直接成为最终教学页
- 生成日志必须保留成功、失败、警告和上下文摘要

## 8. 环境变量

```env
PORT=37200
WEB_ORIGIN=http://127.0.0.1:5174
APP_DB_PATH=./data/app.db
UPLOAD_DIR=./uploads

NOTION_TOKEN=
CHAPTER_DATABASE_ID=
ORIGINAL_PAGE_DB_ID=
RAW_MATERIALS_DATABASE_ID=
EXAM_QUESTIONS_DATABASE_ID=
OUTLINE_DATABASE_ID=

QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_VISION_MODEL=qwen3-vl-flash
QWEN_TEXT_MODEL=qwen3-vl-flash

CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
CODEX_MODEL=
CODEX_TIMEOUT_MS=600000

SESSION_SECRET=
```

`.env` 不进入 git。生产或公网部署时必须使用平台环境变量。

## 9. 部署策略

第一版优先本地/内网运行，适合你本人和一个班学生内测。

推荐启动方式：

```bash
npm install
npm run dev
```

本地端口：

- 前端：`http://127.0.0.1:5174`
- 后端：`http://127.0.0.1:37200`

如果后续需要公网访问，不推荐纯 Vercel 静态部署，因为后端需要运行 Codex CLI、写 SQLite、访问本地上传文件和同步 Notion。更合适的方案是：

- 小规模公网：云服务器 / VPS，Node 进程 + SQLite + 文件目录
- 托管平台：Render / Fly.io / Railway 这类可运行长时间 Node 服务的平台
- 数据增长后：迁移 PostgreSQL，再考虑更标准的云部署

## 10. 性能、可访问性与安全预算

性能目标：

- 首屏主要内容 LCP < 2.5s
- CLS < 0.1
- 常规 API 响应 < 500ms，AI 生成类接口允许长任务
- 大文件上传需要大小限制和错误提示
- AI 生成类操作必须有 loading、日志和失败状态

可访问性目标：

- 延续 DESIGN.md 的 WCAG AA 目标
- Lighthouse accessibility score >= 95
- 登录、注册、章节、练习、题目选项、弹窗、Tabs 可键盘操作
- 状态不能只靠颜色表达，必须有文字

安全目标：

- Notion/Qwen/Codex 密钥只在后端
- 密码哈希存储
- API 按角色鉴权
- 上传文件限制类型和大小
- CORS 只允许 `WEB_ORIGIN`
- 生成内容进入人工可检查流程
- 重要写操作记录日志

## 11. Design Token 接入

`DESIGN.md` 是设计 token 的来源。实现 Tailwind 时应把其中的颜色、字号、间距、圆角、阴影转成 Tailwind theme。

如果后续安装 Google design.md 工具，可使用：

```bash
npx @google/design.md export --format css-tailwind DESIGN.md > apps/web/src/theme.css
```

第一版也可以手动把 tokens 映射到 `tailwind.config` 或全局 CSS 变量，保持与 DESIGN.md 一致。

## 12. 主要风险

- 第一版加入登录授权后，范围比原有 Qwen/Codex/Notion 工作台更大。解决方式是把登录授权定义为最小闭环：账号密码登录、学生注册申请、老师通过/拒绝、未授权拦截、退出登录。第一版不做短信验证码、微信登录、找回密码自动流程、多班级、多角色细分、复杂权限配置和组织架构。这样可以满足“只给授权学生使用”的核心目标，同时避免认证系统失控。
- SQLite 适合单机和小规模内测，但不适合长期多人公网并发。
- Codex Agent C 尚未完全复刻 Notion Agent 能力，需要明确最小可用范围。
- Notion 数据库字段变化会影响同步链路。
- Qwen 原始页质量直接影响 A/B/C 输出质量。
- AI 输出需要审核、回滚和日志，否则教学内容容易不可控。
