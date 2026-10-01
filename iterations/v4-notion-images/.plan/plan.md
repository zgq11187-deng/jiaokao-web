# Notion 教学图片实施计划

## 背景

现有转换丢弃 image 块，网页无图片解析。私有缓存解决临时地址失效并保持章节权限。

## 范围

教学页和习题图片；不做模型迁移、OCR、公开图片和离线导出，不操作线上服务器。

## 阶段总览

| 阶段 | 目标 | 状态 |
|---|---|---|
| 01 teaching-images | 下载、缓存、权限、教学页渲染 | completed — user-approved |
| 02 question-images | 题目导入与练习渲染 | completed — user-approved，待用户提交 |
| 03 regression-deploy | 回归及部署交接 | not started |

## 关键决策

- 2026-09-30：按用户确认方案，每阶段自测后暂停验收，由用户提交部署。
- 不新增依赖，沿用 Node ESM/JS，使用 node:test 和临时 SQLite。
- 图片回调仅同步时启用，不改 Agent 默认读取行为。

## Open Questions

无。真实 Notion 页面验收由用户在阶段一自测完成后执行。

## 最新进度

2026-09-30：阶段一代码与隔离自测完成；13 项 node:test、真实 HTTP 权限测试、桌面/390px 学生和老师端浏览器交互、npm run check/build 均通过。验收步骤见 [阶段一验收](../ACCEPTANCE.md)。

2026-10-01：用户确认阶段一图片可见且可放大关闭，批准开始阶段二。阶段一尚未提交或部署；阶段二进行中。

2026-10-01：阶段二隔离自动测试 14/14、老师与学生四流程浏览器检查、`npm run check/build` 通过；待用户真实 Notion 章节验收。测试配置加载顺序事故已修复且本地测试账号已清理，详见 Phase 02 Notes。

2026-10-01：用户确认阶段二验收完成；Gate 更新为 user-approved。图片功能仍未提交、推送或部署，用户提交后回填 hash，再进入阶段三。

## 关联

[PRD](../PRD.md)、[ARCHITECTURE](../../../ARCHITECTURE.md)
