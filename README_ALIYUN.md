# PixVault Aliyun 部署版

这是不用 Supabase 的服务器版。GitHub 保存代码，阿里云 ECS 运行 Node.js 后端，照片保存在服务器 `uploads/`，照片信息保存在 `data/photos.json`。

## 默认登录

- 账号：`123456`
- 密码：`123456`

也可以在服务器环境变量里覆盖：

- `ADMIN_USER`
- `ADMIN_PASSWORD`

## GitHub Secrets

在 GitHub 仓库进入 `Settings` -> `Secrets and variables` -> `Actions`，添加：

- `ALIYUN_HOST`：阿里云服务器公网 IP 或域名
- `ALIYUN_USER`：SSH 用户名，例如 `root`
- `ALIYUN_SSH_KEY`：SSH 私钥内容
- `ALIYUN_APP_DIR`：服务器部署目录，例如 `/www/pixvault`
- `ALIYUN_APP_PORT`：Node 服务端口，例如 `3000`

每次推送到 `main` 后，`.github/workflows/deploy-aliyun.yml` 会自动同步代码到阿里云并重启服务。

## 服务器需要

服务器上需要有：

- Node.js 18+
- SSH 可登录
- 推荐安装 PM2：`npm install -g pm2`

如果没有 PM2，工作流会用 `nohup node server.js` 启动。

## Nginx 反向代理示例

```nginx
server {
  listen 80;
  server_name your-domain.com;

  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
