# 部署流程

本项目通过 GitHub 部署到服务器，不使用 FileZilla 直接传文件。

## 环境信息

| 项目 | 值 |
|---|---|
| GitHub 仓库 | `https://github.com/zgq11187-deng/jiaokao-web.git` |
| 服务器路径 | `/var/www/jiaokao/` |
| 进程管理 | PM2，进程名 `jiaokao-server` |
| Nginx 配置 | `/etc/nginx/sites-enabled/jiaokao` |
| 前端目录 | Nginx `root` 指向 `/var/www/jiaokao/apps/web/dist`（每次 `npm run build` 产出） |
| 后端入口 | `apps/server/src/index.js`，监听 `127.0.0.1:37200`，Nginx `/api/` 反代过去 |
| 数据库 | SQLite，文件 `/var/www/jiaokao/data/app.db` |

## 日常部署流程（5 步）

### 第 1 步｜本地：commit + push

```bash
cd "/Users/apple/Documents/agent lab-1"

git status                       # 看改了什么
git add <具体文件>               # 显式 add，不要 git add .
git status                       # 再核对 staged 区
git commit -m "feat: 描述这次改动"
git push origin main
```

注意：

- 不要 `git add .`，容易把 `.bak`、`.DS_Store`、临时调试文件带上去。
- `data/`、`uploads/`、`node_modules/`、`dist/` 已在 `.gitignore` 里，不会被传。
- 如果 push 提示 `Empty reply from server`，重试一次即可，不要配代理。

### 第 2 步｜服务器：备份 + 拉代码

```bash
ssh ubuntu@<服务器IP>
cd /var/www/jiaokao

# 备份 db（保命，每次部署都做）
mkdir -p ~/jiaokao-pre-pull-backup-$(date +%Y%m%d-%H%M%S)
cp data/app.db ~/jiaokao-pre-pull-backup-$(date +%Y%m%d-%H%M%S)/

# 看服务器当前状态
git status                       # 应该 working tree clean
git log --oneline -3             # 看当前 HEAD

# 如果 git status 有 modified / untracked（说明被手动改过）
# 先 stash 兜住再 pull：
# git stash push --include-untracked --message "部署前残留 $(date +%F)"

git fetch origin
git pull origin main
git log --oneline -3             # 确认 HEAD 到了最新 commit
```

### 第 3 步｜服务器：构建前端（仅当动了前端时）

```bash
cd /var/www/jiaokao
npm run build

# 验证产物
ls -lt apps/web/dist/assets/ | head -3
grep "assets/index-" apps/web/dist/index.html
```

为什么要构建：Nginx 直接服务 `apps/web/dist/`，但该目录在 `.gitignore` 里不进 git，所以必须在服务器上重新打包。

只动后端（`apps/server/src/*.js`）时跳过这步。

### 第 4 步｜服务器：重启进程

```bash
pm2 restart jiaokao-server
pm2 logs jiaokao-server --lines 20 --nostream
```

日志判读：

- ✅ `[server] http://127.0.0.1:37200` 出现 = 起来了
- ⚠️ `Terminated` + `npm error code 143` = pm2 杀旧进程的正常副作用（SIGTERM），不是崩
- ⚠️ `@notionhq/client warn: rate_limited` = Notion API 限流，跟代码无关
- ❌ `SyntaxError`、`ReferenceError`、`SQLITE_ERROR` = 真出问题，立即查

### 第 5 步｜浏览器：硬刷验收

用**无痕窗口**打开 `https://jiaokaoai.cn`：

1. 老师账号登录，确认新功能可见。
2. 学生账号登录，确认权限边界正确。
3. 既有功能（章节列表、练习、模拟考试、错题、资料导出）回归测试。

## 出问题如何回滚

```bash
ssh ubuntu@<服务器IP>
cd /var/www/jiaokao

# A. 代码回滚到上一个 commit
git log --oneline -5                       # 找到要回滚到的 commit hash
git reset --hard <commit hash>
npm run build                              # 如果改过前端
pm2 restart jiaokao-server

# B. 数据库回滚（只有数据真出问题才做）
ls -lt ~/jiaokao-pre-pull-backup-*/        # 找最新的备份
cp ~/jiaokao-pre-pull-backup-XXXX/app.db /var/www/jiaokao/data/app.db
pm2 restart jiaokao-server
```

## 铁律

| 规则 | 原因 |
|---|---|
| 绝不用 FileZilla 直接覆盖 `/var/www/jiaokao/` 里的文件 | 会让服务器 git 状态变乱，下次 pull 撞 conflict |
| 绝不在服务器上手动改源码 | 同上 |
| 绝不碰 `data/`、`uploads/` | 用户数据，丢了找不回 |
| 绝不在服务器跑 `git push` | 服务器是消费方，不是生产方 |
| 每次部署前必备份 `data/app.db` | 时间戳命名，方便回滚 |
| 每次 commit 用具体文件 add，不用 `git add .` | 防止误带临时文件 |

## 完整命令速查

```bash
# === 本地 ===
cd "/Users/apple/Documents/agent lab-1"
git status
git add <文件>
git commit -m "feat: ..."
git push origin main

# === 服务器 ===
ssh ubuntu@<服务器IP>
cd /var/www/jiaokao
mkdir -p ~/jiaokao-pre-pull-backup-$(date +%Y%m%d-%H%M%S)
cp data/app.db ~/jiaokao-pre-pull-backup-$(date +%Y%m%d-%H%M%S)/
git status                                 # 必须 clean，否则先 stash
git pull origin main
npm run build                              # 只在动了前端时
pm2 restart jiaokao-server
pm2 logs jiaokao-server --lines 20 --nostream

# === 浏览器 ===
# 无痕窗口打开 https://jiaokaoai.cn，硬刷验收
```

## 数据流示意

```
   ┌─────────┐         ┌──────────┐         ┌──────────────┐
   │  本地    │ push →  │  GitHub  │ ← pull  │   服务器      │
   │ 改代码   │         │  仓库    │         │ /var/www/... │
   └─────────┘         └──────────┘         └──────┬───────┘
                                                   │ npm run build
                                                   ↓
                                            ┌─────────────────┐
                                            │ apps/web/dist/  │← Nginx 直接服务前端
                                            └─────────────────┘
                                                   ↑
                                                   │ pm2 restart
                                                   ↓
                                            ┌─────────────────┐
                                            │ node 进程 :37200│← Nginx /api/ 反代后端
                                            └─────────────────┘
                                                   ↓
                                            ┌─────────────────┐
                                            │ data/app.db     │← 永远不动
                                            └─────────────────┘
```
