# 教考智联工作台 · AGENTS

> 这份文档是 Codex / Claude 进入本项目的入口。拿到项目目录后，请先读完这份文档再开始工作。

## 项目一句话

教考智联工作台是面向专升本学生、任课老师和自学备考者的《计算机应用基础》教与学网站，帮助他们围绕课程、资料、练习和备课形成清晰的学习路径。

## 文档地图

本项目由 First Flight 生成，文档分两类。长期文档先读，迭代产物按需读。

**长期文档（项目根，跨迭代共用）：**

| 文档 | 内容 |
|---|---|
| [BRIEF.md](./BRIEF.md) | 项目长期纲领：本质、用户、价值、边界 |
| [DESIGN.md](./DESIGN.md) | 视觉与 UX 风格：Google DESIGN.md 标准 + First Flight 扩展 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 技术栈、代码组织、部署、认证、Notion/Qwen/Codex 边界 |
| [AGENTS.md](./AGENTS.md) | 本文件：AI 入口 + 协作规则 |
| [CLAUDE.md](./CLAUDE.md) | Claude 入口提示，指向 AGENTS.md |

**迭代产物（`iterations/v{N}-{slug}/`）：**

| 文件 | 内容 |
|---|---|
| [iterations/v1-launch/PRD.md](./iterations/v1-launch/PRD.md) | 首版功能、页面结构、信息架构、目标衡量 |
| [iterations/v1-launch/CONTENT.md](./iterations/v1-launch/CONTENT.md) | 首版内容槽、文案、AI 生成需求、数据源 |
| `iterations/v{N}-{slug}/.plan/` | 各迭代的 plan + phase 实施目录 |

## 项目本质边界

**永远会是的：**

- 专升本计算机应用基础教与学平台
- 课程资源中心
- 备考辅助工具
- 教师备课工作台

**永远不会做的：**

- 不做所有学科，只聚焦计算机应用基础
- 不做学生社交社区
- 不做学校教务系统

任何看似偏离这些边界的请求，请先停下来和用户确认；不要默认接受。

## 技术栈一句话

本项目保留并规范当前 monorepo：`apps/web` 使用 React 18 + Vite，`apps/server` 使用 Express + SQLite，`packages/shared` 存放 Codex Agent JSON schema；后端负责 Notion、Qwen、Codex CLI、文件上传、导出和登录授权。

详细决策见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 写代码前的准备

如果还没做完这些，先停下来提醒用户：

- [ ] 确认 `.env` 已配置 Notion、Qwen、Codex、数据库路径和 `SESSION_SECRET`
- [ ] 跑 `npm install`
- [ ] 跑 `npm run check`
- [ ] 启动开发时用 `npm run dev`
- [ ] 实现 Tailwind 时，把 [DESIGN.md](./DESIGN.md) 的 tokens 映射到 Tailwind theme 或全局 CSS 变量
- [ ] 如果安装了 Google design.md 工具，改 DESIGN 后可跑 `npx @google/design.md export --format css-tailwind DESIGN.md > apps/web/src/theme.css`

## 写代码时的核心规则

### 必须遵循

1. 所有回复默认用中文。
2. 不要偏离“专升本《计算机应用基础》”边界。
3. 新功能必须先更新当前迭代 PRD，再写代码。
4. 改技术栈或新增依赖前，必须先更新 ARCHITECTURE。
5. AI 生成的教学内容必须经过人工检查后才能发布或导出。
6. 每次开发前先读 `AGENTS.md`、`BRIEF.md`、当前迭代 `PRD.md`。
7. 遵循 DESIGN.md 的 Do's & Don'ts，尤其不要做营销落地页式大 hero、儿童化卡通风、大面积渐变、粒子、3D、玻璃拟态、轮播图、纯暗色默认模式。
8. CONTENT.md 的三种模式必须严格处理：
   - 📝 标记的文案：原样使用，不要替换或“优化”。
   - 🤖 标记的需求：按需求 + DESIGN voice + BRIEF 语气生成，生成后让用户检查。
   - 📦 标记的数据源：从指定数据源读取，不要写死成静态文案。
9. 不要把 Notion、Qwen、Codex 密钥放到前端。前端只调用后端 API。
10. A/B/C 生成流程的输出必须保留日志、失败状态和人工检查入口。
11. 复杂开发用 phase 管理。改动跨多文件、跨多个步骤或需要多次会话时，使用 First Flight phases 规则建立 `.plan/plan.md` 和 `.plan/phases/`，每个 phase 完成后停下让用户验收。

### 编码风格

- 继续兼容现有 JavaScript/JSX；后续新增模块优先 TypeScript。
- React 组件名使用 PascalCase。
- 工具函数使用 camelCase。
- 后端继续使用 Node ESM。
- API 边界放在 `apps/server/src/index.js` 或按业务拆到 `apps/server/src/` 子模块。
- Notion、Qwen、Codex 调用分别保持在 `notion.js`、`qwen.js`、`codex.js` 边界内。
- 共享 JSON schema 放在 `packages/shared/schemas/`。

### Commit 前自检

- [ ] `npm run check` 通过。
- [ ] 如果改了前端，确认 `npm -w apps/web run build` 通过。
- [ ] 如果改了服务端，确认 `npm -w apps/server run check` 通过。
- [ ] 如果改了 DESIGN.md，检查颜色对比和 Do's & Don'ts 没被实现违背。
- [ ] 如果改了认证、上传、AI 调用或 Notion 写入，补充最小验证说明。

## Spec Sync

Spec 是 source of truth，但不同类型文档同步规则不同。

**长期文档**：根目录 `BRIEF.md`、`DESIGN.md`、`ARCHITECTURE.md`、`AGENTS.md`、`CLAUDE.md`。

**迭代产物**：`iterations/v{N}-{slug}/PRD.md`、`CONTENT.md`（仅 v1）、`.plan/` 工作目录。

三种改动对应三种处理：

1. 改动影响长期方向：更新根目录对应文档。比如主色调整更新 DESIGN，新增依赖更新 ARCHITECTURE。
2. 改动影响当前迭代：更新当前 `iterations/v{N}-{slug}/PRD.md` 或 `.plan/`。
3. 新需求 / 新功能：开新迭代，不要直接改 `iterations/v1-launch/PRD.md` 冒充首版范围。

如果用户要做的事和 BRIEF 的“永远不会做”冲突，请停下来确认：要么更新 BRIEF 重审项目方向，要么收窄需求。不要默认接受。

判断原则：下次 AI 看到这个项目时需要知道吗？需要就进对应 spec；不需要就是实现层面的局部调整。

## 工具链常用命令

```bash
# 安装依赖
npm install

# 启动开发
npm run dev

# 构建前检查
npm run check

# 构建
npm run build

# 单独启动后端
npm -w apps/server run dev

# 单独启动前端
npm -w apps/web run dev
```

本地默认端口：

- 前端：`http://127.0.0.1:5174`
- 后端：`http://127.0.0.1:37200`

## 在哪里找信息

| 问题 | 去哪查 |
|---|---|
| 项目长期要做什么、不能做什么？ | [BRIEF.md](./BRIEF.md) |
| 第一版要做哪些页面 / 功能？ | [iterations/v1-launch/PRD.md](./iterations/v1-launch/PRD.md) |
| 页面、按钮、卡片应该长什么样？ | [DESIGN.md](./DESIGN.md) |
| 用什么色、字体、圆角、动效？ | [DESIGN.md](./DESIGN.md) YAML front matter |
| 技术栈、数据库、认证、部署怎么定？ | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 具体文案、按钮文字、空状态、数据源？ | [iterations/v1-launch/CONTENT.md](./iterations/v1-launch/CONTENT.md) |
| Notion / Qwen / Codex Agent 流程？ | [ARCHITECTURE.md](./ARCHITECTURE.md) §7 |
| 登录授权最小闭环？ | [ARCHITECTURE.md](./ARCHITECTURE.md) §5 |

## 协作姿态

- 请向用户提问而不是默认假设。
- 遇到 BRIEF 边界冲突要停下。
- 改文档要更新对应 spec 文件。
- 保持文档的权威性：这些 spec 是 source of truth，代码是文档的实现。
- 对已有代码保持尊重，优先延续当前 monorepo、Express、SQLite、Notion/Qwen/Codex 边界，不做无关迁移。

## First Flight

本项目的 First Flight 文档链路为：

BRIEF → PRD → DESIGN → ARCHITECTURE → CONTENT → AGENTS

首版开发实施阶段应继续使用 phases 规则，把 `v1-launch` 拆成可验收的阶段。
