# Phase 01 — 教学页图片闭环

**Status**: completed
**目标**: 教学页图片可持久显示且权限不被绕过。
**前置**: 已确认 v4 方案，依赖已安装。
**Gate**: user-approved — 用户于 2026-10-01 确认图片存在、可放大和关闭，并要求开始阶段二

## 验收判据

- 自动测试覆盖读取、缓存、安全限制、授权和失败回退。
- npm run check / npm run build 通过。
- 老师和有权限学生看见 Excel 表格图，手机可放大，撤权后接口拒绝。

## Tasks

- [x] 添加失败测试验证图片缺失。（apps/server/test/notion-images.test.js:5；首次 RED 为缺少图片模块/读取入口；折叠标题补测 RED 后修复）
- [x] 实现下载、索引、权限与同步反馈。（apps/server/src/image-download.js:1、chapter-images.js:6、index.js:83；13 项测试通过，未提交）
- [x] 实现共享图片显示和放大。（apps/web/src/ChapterImage.jsx:3、main.jsx:3297；老师与学生浏览器测试通过，未提交）
- [x] 自测、审查和真实页面验收说明。（iterations/v4-notion-images/ACCEPTANCE.md；2026-09-30 npm run check/build 与 git diff --check 通过）

## 自测记录

- `node --test apps/server/test/*.test.js`：13/13 通过。缓存版本、失败旧图、占位、路径穿越/符号链接、HTTPS/DNS/重定向/实际连接地址、大小/超时/并发、超过100块分页、提示块/分栏/折叠标题均有覆盖。
- 真实 Express 子进程使用临时 SQLite/图片目录：匿名401、未审批/撤权/归档学生403、跨章节图片404；老师和授权学生200。无生产数据库写入。
- Playwright：老师图片加载与嵌套图片 decode 成功；390px 窗口弹窗 x=11.70、width=366.59，没有横向越界；Esc 焦点返回；学生图片加载、Enter 打开和关闭按钮验证通过。仅使用合成测试 PNG，不是用户 Excel 原图。
- `npm run check`、`npm run build`：通过，原有 Mermaid 等大包警告仍在。
- 自查未启用公开试用页图片，未改 Agent 默认图片读取、题目导入、导出、模型或线上部署。
- 未验证：真实 Notion 图片下载、实际手机设备、真实临时地址过期后的长期显示。缓存测试证明复用时不再调用源地址，但不能替代用户原图验收。

## 用户验收

用户于 2026-10-01 确认阶段一验收完毕：图片存在、可放大及关闭；并明确要求开始阶段二。

## Notes

未提交、未部署。用户明确要求在未提交阶段一的情况下开始阶段二；TDD 记录红/绿测试证据，不自动创建 checkpoint commit。
