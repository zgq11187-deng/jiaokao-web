# Phase 03 — 回归与部署交接

**Status**: in progress
**目标**: 完整验证并交接部署。
**前置**: Phase 02 已由用户验收并提交（c81c889dce17479b3254324bb27c5a000681f660）。

## Tasks

- [~] 旧库、文字、分页嵌套、故障和权限综合回归。（旧库迁移、分页嵌套、失败回退和 HTTP 权限已由 `node --test apps/server/test/*.test.js` 覆盖；纯文字章节及上线回归待验证）
- [x] npm run check / npm run build 及自动测试。（2026-10-01 `node --test apps/server/test/*.test.js` 14/14；`npm run check`、`npm run build` 均通过）
- [~] 数据库、环境和图片目录备份及服务器更新步骤。（操作步骤见 `iterations/v4-notion-images/ACCEPTANCE.md`；等待 PR 合并和用户在腾讯云执行备份、部署）

## 验收判据

用户上线验证正文和题库，保留历史与回滚能力。

## Notes

用户本次输入 `e --test apps/server/test/*.test.js` 时，shell 返回命令不存在；项目工作区先前使用完整的 `node --test apps/server/test/*.test.js` 已通过 14/14。用户的 `npm run check`、`npm run build` 输出均显示成功。GitHub 与服务器更新尚未完成。
