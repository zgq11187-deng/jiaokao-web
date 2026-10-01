# Phase 02 — 习题图片闭环

**Status**: completed
**Gate**: committed — 用户提交 c81c889dce17479b3254324bb27c5a000681f660
**目标**: 保留题干、选项、解析图片及历史记录。
**前置**: Phase 01 用户验收；用户明确要求在阶段一尚未提交时继续阶段二。

## Tasks

- [x] 图片归属解析，边界外或归属不明警告。（apps/server/src/index.js:2202、2261；apps/server/test/question-images-import.test.js:6）
- [x] 去重忽略图片，明确匹配后更新并保留题目 ID、历史和隐藏状态。（apps/server/src/index.js:1888、2995；apps/server/test/question-images-import.test.js:6）
- [x] 老师题库、练习、模考、错题渲染，解析遵循揭示时机。（apps/web/src/main.jsx:3054、3130、3150、3739；2026-10-01 隔离浏览器四流程验证）
- [x] 重复导入和不同题型回归。（apps/server/test/question-images-import.test.js:6；2026-10-01 `node --test apps/server/test/*.test.js` 14/14、`npm run check`、`npm run build` 通过）

## 验收判据

配图正确，重复导入不增加题目，不提前展示答案。

## 自测与验收

- 临时 SQLite + 模拟 Notion 嵌套块：题干、选项、折叠解析图归属；边界外/归属不明图片；失效缓存占位；操作题解析中的转义说明；手动题和歧义匹配跳过；重复导入保留 ID、隐藏状态和历史答题记录。真实 Notion API 与用户原图尚未验证。
- 浏览器隔离夹具：老师题库预览，学生练习、模考、错题均能显示受保护图片；练习与模考提交前不出现解析图，提交后出现；错题解析保持折叠。浏览器仅有夹具 favicon 404。
- `node --test apps/server/test/*.test.js`：14/14；`npm run check`、`npm run build`：通过，Vite 大包警告仍在；`git diff --check`：通过。用户已提交，尚未推送或部署。
- 用户于 2026-10-01 明确确认阶段二验收完成，验收步骤见 [ACCEPTANCE.md](../../ACCEPTANCE.md)。两个阶段代码由用户提交为 c81c889dce17479b3254324bb27c5a000681f660，进入 Phase 03。

## Notes

测试中曾因新增测试过早加载配置，将 3 个夹具账号/会话误写入本地 `data/app.db`。已于 2026-10-01 备份至 `/private/tmp/jiaokao-test-recovery.QjN6YV/app.db`，按账号信息精确清理，重跑全套测试后再次查询为 0；测试初始化顺序已修正。没有写入章节或题目，未触及服务器。
