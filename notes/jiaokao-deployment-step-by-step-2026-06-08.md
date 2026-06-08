# 教考智联部署操作步骤（小白版）

> 日期：2026-06-08  
> 适用项目：教考智联工作台  
> 推荐路线：VPS 一体化部署  
> 目标：让你能从“本地能跑”走到“别人能通过域名访问”。

## 先说结论

教考智联不是纯静态网页，所以不要按 GitHub Pages / Vercel 静态站来部署完整系统。

你第一版最稳的路线是：

```text
买一台云服务器 VPS
  -> 安装 Node.js / Nginx / PM2
  -> 上传代码
  -> 配置 .env
  -> npm install
  -> npm run build
  -> 用 PM2 启动后端
  -> 用 Nginx 托管前端并转发 API
  -> 绑定域名和 HTTPS
  -> 做备份、SEO、GEO、统计
```

## 阶段 0：先做选择

### 0.1 选择服务器地区

如果学生主要在中国大陆访问：

- 选择大陆服务器，访问更稳定。
- 但域名通常需要备案。

如果你暂时不想备案：

- 选择香港服务器。
- 部署更快，但大陆访问速度可能略不稳定。

### 0.2 推荐购买方式

小白建议：

- 腾讯云轻量应用服务器，Ubuntu 系统。
- 或阿里云轻量应用服务器 / ECS，Ubuntu 系统。

配置第一版可以从低配开始：

- 2 核 CPU
- 2GB 或 4GB 内存
- 40GB 以上磁盘
- Ubuntu 22.04 或 24.04

### 0.2.1 购买腾讯云轻量应用服务器

适合你选择腾讯云时照着做。

1. 打开腾讯云轻量应用服务器产品页。
2. 登录腾讯云账号。
3. 如果提示实名认证，先完成实名认证。
4. 点击“立即购买”或“购买”。
5. 选择地域：
   - 不想备案、想先快速测试：选中国香港。
   - 面向大陆学生长期使用：选中国大陆地域，但域名访问通常需要备案。
6. 选择镜像：
   - 优先选“系统镜像”。
   - 选择 Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS。
   - 不要选 WordPress、宝塔、应用模板，先保持干净。
7. 选择套餐：
   - 第一版建议 2 核 4GB 内存。
   - 如果预算很紧，可先 2 核 2GB，但后续运行 AI / 导出 / 上传时可能吃紧。
   - 磁盘建议 40GB 以上。
8. 设置登录方式：
   - 小白可以先选“密码登录”。
   - 密码要保存好。
   - 后续熟悉后再改 SSH 密钥登录。
9. 防火墙 / 安全组放行端口：
   - `22`：SSH 登录服务器。
   - `80`：HTTP 网站访问。
   - `443`：HTTPS 网站访问。
   - 不建议直接对公网开放 `37200`，后端端口由 Nginx 在服务器内部代理。
   - 如果购买页面没有看到“防火墙 / 安全组”，先完成购买。腾讯云轻量应用服务器通常在实例创建后，到服务器详情页的“防火墙”标签里再添加规则。
10. 确认购买时长和费用。
11. 付款后进入控制台，找到这台服务器。
12. 记录服务器公网 IP。

买完后，你需要拿到：

```text
服务器公网 IP
root 用户或默认登录用户（腾讯云 Ubuntu 页面常见用户名是 ubuntu）
登录密码或 SSH 密钥
```

如果用户名显示为 `ubuntu`，后续连接命令是：

```bash
ssh ubuntu@你的服务器公网IP
```

进入服务器后，需要管理员权限的命令前面加 `sudo`。

### 0.2.2 购买阿里云轻量应用服务器

适合你选择阿里云时照着做。

1. 打开阿里云轻量应用服务器产品页。
2. 登录阿里云账号。
3. 如果提示实名认证，先完成实名认证。
4. 点击“立即购买”。
5. 选择地域：
   - 不想备案、想先快速测试：选中国香港。
   - 面向大陆学生长期使用：选中国大陆地域，但域名访问通常需要备案。
6. 选择镜像：
   - 选择“系统镜像”。
   - 选择 Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS。
   - 不要选 WordPress、宝塔、应用模板。
7. 选择套餐：
   - 第一版建议 2 核 4GB 内存，40GB 以上磁盘。
   - 预算紧张可以先 2 核 2GB。
8. 设置登录密码或 SSH 密钥。
9. 确认防火墙 / 安全组：
   - 放行 `22`、`80`、`443`。
   - 不要把后端 `37200` 直接暴露到公网。
10. 确认购买时长和费用。
11. 付款后进入控制台，记录公网 IP。

### 0.2.3 你该选腾讯云还是阿里云

如果你没有明显偏好：

- 已经有腾讯云账号：选腾讯云。
- 已经有阿里云账号：选阿里云。
- 想先最快跑起来：选任意一家香港轻量服务器。
- 未来要给大陆学生稳定访问：考虑大陆地域，但提前准备备案。

两家都能部署教考智联，关键不是品牌，而是你要买到：

```text
Ubuntu VPS + 公网 IP + 22/80/443 端口 + 可长期运行 Node + 可保存 SQLite 和 uploads
```

### 0.3 域名

你需要一个域名，例如：

```text
jiaokao.example.com
```

如果还没有域名，可以先用服务器 IP 测试，等网站跑通后再绑定域名。

## 阶段 1：在本地确认项目能正常构建

在你电脑的项目目录运行：

```bash
cd "/Users/apple/Documents/agent lab-1"
npm run check
```

如果通过，再运行：

```bash
npm run build
```

这一步的目标：

- 确认前端能构建。
- 确认后端语法检查通过。
- 不要把有明显错误的代码传到服务器。

## 阶段 2：准备生产环境变量

在服务器上最终需要一份 `.env`。

不要把 `.env` 提交到 git，也不要放到前端。

生产环境建议长这样：

```env
PORT=37200
WEB_ORIGIN=https://你的域名
APP_DB_PATH=./data/app.db
UPLOAD_DIR=./uploads

NOTION_TOKEN=你的 Notion token
CHAPTER_DATABASE_ID=你的章节库 ID
ORIGINAL_PAGE_DB_ID=你的原始页面库 ID
RAW_MATERIALS_DATABASE_ID=你的原始资料库 ID
EXAM_QUESTIONS_DATABASE_ID=你的真题库 ID
OUTLINE_DATABASE_ID=你的大纲库 ID

QWEN_API_KEY=你的 Qwen key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_VISION_MODEL=qwen3-vl-flash
QWEN_TEXT_MODEL=qwen3-vl-flash

CODEX_BIN=服务器上的 codex 路径
CODEX_MODEL=
CODEX_TIMEOUT_MS=600000

SESSION_SECRET=一串很长的随机字符串
```

`SESSION_SECRET` 可以本地生成：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 阶段 3：连接服务器

云服务器创建后，你会拿到：

- 服务器 IP
- 用户名，通常是 `root`
- 密码或 SSH 密钥

在本地终端连接：

```bash
ssh root@你的服务器IP
```

如果首次连接，会问是否信任，输入：

```text
yes
```

## 阶段 4：在服务器安装基础软件

登录服务器后运行：

```bash
apt update
apt upgrade -y
apt install -y git curl nginx sqlite3
```

安装 Node.js。建议用 Node 20 LTS：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

检查：

```bash
node -v
npm -v
nginx -v
```

安装 PM2：

```bash
npm install -g pm2
```

PM2 用来让后端一直运行。

## 阶段 5：把代码放到服务器

如果你的项目已经在 GitHub：

```bash
mkdir -p /var/www
cd /var/www
git clone 你的仓库地址 jiaokao
cd /var/www/jiaokao
```

如果还没有 GitHub 仓库：

- 先在本地把项目推到私有 GitHub 仓库。
- 再在服务器 `git clone`。

不建议小白用手动拖文件的方式长期部署，因为后续更新会很麻烦。

## 阶段 6：创建运行目录和 .env

在服务器项目目录：

```bash
cd /var/www/jiaokao
mkdir -p data uploads
```

创建 `.env`：

```bash
nano .env
```

把阶段 2 的环境变量粘贴进去。

保存：

- `Ctrl + O`
- 回车
- `Ctrl + X`

## 阶段 7：安装依赖并构建

```bash
cd /var/www/jiaokao
npm install
npm run build
```

如果这一步失败，不要继续部署。先看错误信息。

成功后，前端构建产物通常在：

```text
apps/web/dist
```

后端入口是：

```text
apps/server/src/index.js
```

## 阶段 8：先直接启动后端测试

```bash
cd /var/www/jiaokao
npm run start
```

看到类似服务启动后，另开一个服务器终端测试：

```bash
curl http://127.0.0.1:37200/health
```

如果返回：

```json
{"ok":true,"service":"jiaokao-web-server"}
```

说明后端能跑。

然后按 `Ctrl + C` 停掉临时启动。

## 阶段 9：用 PM2 启动后端

```bash
cd /var/www/jiaokao
pm2 start npm --name jiaokao-server -- run start
pm2 save
pm2 startup
```

`pm2 startup` 会输出一行命令，让你复制再运行一次。照做即可。

检查：

```bash
pm2 status
pm2 logs jiaokao-server
```

## 阶段 10：配置 Nginx

这里用一体化方式：

- 前端：Nginx 直接托管 `apps/web/dist`
- 后端 API：Nginx 把 `/api` 转发到 `127.0.0.1:37200`

创建配置：

```bash
nano /etc/nginx/sites-available/jiaokao
```

如果你还没有域名，先用服务器 IP：

```nginx
server {
    listen 80;
    server_name 你的服务器IP;

    root /var/www/jiaokao/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:37200/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:37200/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用配置：

```bash
ln -s /etc/nginx/sites-available/jiaokao /etc/nginx/sites-enabled/jiaokao
nginx -t
systemctl reload nginx
```

如果有默认站点冲突，可以禁用默认配置：

```bash
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

现在用浏览器访问：

```text
http://你的服务器IP
```

## 阶段 11：绑定域名

在你的域名 DNS 控制台里添加记录：

```text
类型：A
主机记录：@ 或 www
值：你的服务器 IP
```

如果用子域名：

```text
类型：A
主机记录：jiaokao
值：你的服务器 IP
```

然后把 Nginx 里的：

```nginx
server_name 你的服务器IP;
```

改成：

```nginx
server_name 你的域名;
```

并把 `.env` 里的：

```env
WEB_ORIGIN=https://你的域名
```

改好。

改完后：

```bash
systemctl reload nginx
pm2 restart jiaokao-server
```

## 阶段 12：配置 HTTPS

安装 Certbot：

```bash
apt install -y certbot python3-certbot-nginx
```

申请证书：

```bash
certbot --nginx -d 你的域名
```

按提示选择自动跳转 HTTPS。

检查自动续期：

```bash
certbot renew --dry-run
```

## 阶段 13：上线后检查

打开：

```text
https://你的域名
https://你的域名/health
```

检查这些路径：

- 首页是否能打开
- 登录页是否能打开
- 注册申请是否能提交
- 老师账号是否能登录
- 章节页是否能访问
- 上传文件是否正常
- Notion 同步是否正常
- Qwen 调用是否正常
- Codex Agent 是否正常
- 导出是否正常

## 阶段 14：配置 SEO / GEO 文件

在 `apps/web/public` 或构建后可访问的静态目录中准备：

```text
robots.txt
sitemap.xml
llms.txt
```

如果当前项目没有 `apps/web/public`，可以先在项目中新增这个目录。

`robots.txt` 示例：

```txt
User-agent: *
Allow: /
Disallow: /api
Disallow: /teacher
Disallow: /practice
Disallow: /mock-exam
Disallow: /chapters/*/practice
Disallow: /chapters/*/wrong-questions

Sitemap: https://你的域名/sitemap.xml
```

`sitemap.xml` 只列公开页：

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://你的域名/</loc>
  </url>
  <url>
    <loc>https://你的域名/about</loc>
  </url>
  <url>
    <loc>https://你的域名/resources</loc>
  </url>
</urlset>
```

`llms.txt` 用来给 AI 看，说明教考智联是什么、服务谁、包含什么、边界是什么。

## 阶段 15：配置备份

最重要的是备份：

```text
data/app.db
uploads/
.env
```

建议每天备份一次。

先创建备份目录：

```bash
mkdir -p /var/backups/jiaokao
```

手动备份命令：

```bash
cd /var/www/jiaokao
tar -czf /var/backups/jiaokao/jiaokao-$(date +%F).tar.gz data uploads .env
```

后续可以再做定时任务。

## 阶段 16：以后如何更新网站

每次你在本地改完代码，推到 GitHub 后，在服务器运行：

```bash
cd /var/www/jiaokao
git pull
npm install
npm run build
pm2 restart jiaokao-server
systemctl reload nginx
```

更新后检查：

```bash
curl http://127.0.0.1:37200/health
pm2 status
pm2 logs jiaokao-server
```

## 小白最容易踩的坑

1. 把 `localhost:5174` 发给别人。  
   这是本地地址，别人打不开。

2. 把密钥放到前端。  
   Notion、Qwen、Codex 密钥只能在后端 `.env`。

3. 忘记备份 SQLite。  
   `data/app.db` 丢了，用户、章节、练习记录都会出问题。

4. 只部署前端，忘记后端。  
   教考智联不是纯前端，必须后端也在线。

5. 用 Cloudflare Worker 承载完整后端。  
   当前项目有长任务、SQLite、上传目录，不适合直接这么做。

6. 只看访问量。  
   第一周更重要的是学生是否能注册、进入章节、完成练习；老师是否能生成和导出教学页。

## 你的第一阶段最短路径

如果只保留最必要步骤，就是：

1. 买一台 Ubuntu VPS。
2. 域名先可选，没有域名就先用 IP 测试。
3. 服务器安装 Node、Nginx、PM2、Git。
4. `git clone` 项目。
5. 写 `.env`。
6. `npm install`。
7. `npm run build`。
8. `pm2 start npm --name jiaokao-server -- run start`。
9. Nginx 托管 `apps/web/dist`，并把 `/api` 转发到 `37200`。
10. 浏览器打开服务器 IP 或域名测试。
11. 配 HTTPS。
12. 配备份。
13. 配 `robots.txt`、`sitemap.xml`、`llms.txt`。
14. 邀请少量学生和老师内测。

完成这 14 步，教考智联就从“本地网页”进入“可被别人访问的第一版网站”。
