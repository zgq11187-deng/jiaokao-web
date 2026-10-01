# Notion 图片分阶段验收

阶段一教学页图片和阶段二题库配图均已获用户确认；阶段二于 2026-10-01 验收通过。两个阶段代码已由用户提交（c81c889dce17479b3254324bb27c5a000681f660），尚未推送或更新腾讯云服务器。

## 在本地真实章节验收

1. 先备份本地 SQLite 和 `.env`；确认 `.env` 指向期望的 Notion 工作区。不要把本地数据库覆盖到服务器。
2. 在项目根运行 `npm run dev`；已有开发服务请重新启动，确保后端加载新增模块和数据库迁移。
3. 打开 `http://127.0.0.1:5174/teacher`，选择 **第4章第3节 工作表的格式化**（不是第2节），点击 **同步当前章节教学页**。
4. 查看返回提示：图片发现、下载、复用和失败数量；Excel 表格图片应在原题目位置显示，并保留说明。若失败应看到明确占位或“暂用旧图片”，文字仍在。
5. 再同步一次，不修改 Notion 图片时应显示复用，图片仍正常。替换原图后再同步应更新图片，旧缓存不删除。
6. 点击图片放大，检查关闭按钮、Esc、Tab 和焦点返回。用浏览器390px手机尺寸检查；真实手机检查留待可访问的测试环境，不为此部署线上。
7. 用已授权学生账号进入该章节，应能查看图片；未授权学生无法查看。撤销指定学生权限后重新请求图片应403；归档章节学生图片请求也应403，老师仍可查看。只对测试账号/测试章节做撤权归档测试，勿影响在用学生。
8. 等 Notion 临时链接过期后重新加载本地教学页（不重新同步），图仍应显示。图保存在本机磁盘，不依赖该临时地址。

阶段一验收时不点击“导入当前章节习题”；该路径已在阶段二启用。

## 阶段二：真实章节验收

1. 在本地运行 `npm run dev`，进入老师端目标章节。先点击 **同步当前章节教学页**，再点击 **导入当前章节习题**。两步仍需分别执行；不要先更新服务器。
2. 检查导入提示中的题目新增/更新/跳过统计和图片发现/下载/复用/失败统计。题库边界外图片不应入库，归属不明图片应提示警告。
3. 展开 **显示/编辑章节习题**：核对题干图、每个选项对应的图和解析图。再次导入同一页，题目数量及 ID 不应增加；原来隐藏的题和历史答题记录应保留。
4. 用授权学生账号分别进入 **章节练习**、**模拟考试**、**错题回看**。题干/选项图可查看及放大；选项图的放大按钮不能触发选择。练习和模考提交前不显示解析图，提交后显示；错题解析在打开“查看解析”后显示。
5. 用一张临时不可用的图片测试警告/占位；不要修改在用学生题目。确认图片 URL 仍是 `/api/chapters/.../images/...`，不是 Notion 临时地址。

## 可复现自动测试

```bash
cd "/Users/apple/Documents/agent lab-1"
node --test apps/server/test/*.test.js
npm run check
npm run build
```

HTTP测试需要允许监听本机临时端口，使用临时数据库并在测试结束清理。图片下载的网络安全边界用模拟响应测试，不向真实 Notion 写入。

可选隔离浏览器夹具：

```bash
node apps/server/test/helpers/image-fixture.js --serve
```

浏览器打开 `http://127.0.0.1:5189/teacher`。老师手机号 `13800000000`，学生手机号 `13800000001`，密码均为 `test-image-only`；这些账号仅存在临时库中。老师选择“Excel 图片测试章节”；学生登录后进入 `/chapters/1`。停止夹具用 Ctrl+C，临时库与图片自动清理。不要部署此夹具。

## 缓存与后续部署约定

- 默认缓存 `data/chapter-images/`；若配置不同 APP_DB_PATH，则为数据库同目录的 `chapter-images/`。
- 图片不在静态公开目录，须经登录和章节权限接口读取；索引为 SQLite `chapter_images`。
- 将缓存目录和 SQLite 一起纳入备份；回滚保留索引表和缓存，不删除历史引用。
- 本地和服务器各自重新同步、各自下载，不搬运本地账号/授权/答题数据。
- 本阶段使用临时夹具完成自测；用户已确认阶段二验收通过并提交代码，阶段三回归与部署交接进行中。

## 阶段三：GitHub 与腾讯云交接

两个阶段代码已由用户提交为 `c81c889dce17479b3254324bb27c5a000681f660`。阶段记录补充提交后，先把 `origin/main` 合入 `competition-demo`，检查通过再推送并创建 `competition-demo → main` PR。若合并有冲突，解决并重新检查后再推送；不要强制推送。PR 通过并合并后，以合并后的 `main` 为服务器部署来源。

服务器由用户执行。在 `/var/www/jiaokao` 先运行 `git status --short`；若仅有 `package-lock.json` 的本地修改，使用 `git stash push -m "pre-v4-package-lock" -- package-lock.json` 保留。其他已修改文件须先核对，避免覆盖服务器本地工作。

在服务器备份数据库、环境文件和已有图片缓存：

```bash
cd /var/www/jiaokao
umask 077
backup_dir="/home/ubuntu/jiaokao-backups/v4-images-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
db_path=$(node --input-type=module -e 'import {config} from "./apps/server/src/config.js"; process.stdout.write(config.dbPath)')
test -f "$db_path"
sqlite3 "$db_path" ".backup '$backup_dir/app.db'"
cp -p .env "$backup_dir/.env"
image_dir="$(dirname "$db_path")/chapter-images"
if test -d "$image_dir"; then cp -a "$image_dir" "$backup_dir/"; fi
git rev-parse HEAD > "$backup_dir/pre-deploy-commit.txt"
```

确认备份成功后更新并检查。`git pull --ff-only`、安装、检查或构建失败时停止，不重启 PM2：

```bash
git fetch origin main
git switch deploy-main
git pull --ff-only origin main
git log -1 --oneline
npm ci
npm run check
npm run build
pm2 restart jiaokao-server --update-env
sleep 10
curl -sS -i http://127.0.0.1:37200/health
pm2 status
pm2 logs jiaokao-server --err --lines 30 --nostream --timestamp
```

健康检查应返回 HTTP 200 和 `{"ok":true,"service":"jiaokao-web-server"}`。然后在老师端先同步目标章节教学页，再导入当前章节习题；确认图片统计、题目数量和老师题库、学生练习、模拟考试、错题页显示。再次导入不能新增重复题，原历史答题记录应保留。线上图片由服务器重新缓存，备份与旧缓存保留到上线验收结束。
