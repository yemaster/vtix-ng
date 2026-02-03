# VTIX 部署文档

本项目由 **前端（Vite + Vue）** 与 **后端（Bun + Elysia）** 组成。后端默认监听 `3000` 端口，前端通过 `VITE_API_BASE` 指向后端地址。

---

## 1. 环境要求

- **Node.js**（用于前端构建，建议 >= 18）
- **Bun**（用于后端运行）
- **MySQL**（可选，默认使用 SQLite）

---

## 2. 后端部署

### 2.1 配置方式

后端配置可通过 **环境变量** 或 **`backend/config.json`** 提供。环境变量优先级更高。

**环境变量**
```
DB_DIALECT=sqlite|mysql
DATABASE_URL=...
MYSQL_URL=...
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@vtix.dev
ADMIN_PASSWORD=admin1234
COOKIE_SECURE=true|false
NODE_ENV=production
DEFAULT_USER_PASSWORD=vtix1234
```

**config.json 示例**
```json
{
  "dbDialect": "sqlite",
  "sqlitePath": "data/vtix.db",
  "adminName": "Admin",
  "adminEmail": "admin@vtix.dev",
  "adminPassword": "admin1234"
}
```

### 2.2 SQLite 模式（默认）

无需额外数据库，首次启动会自动创建 `data/vtix.db`。

```bash
cd backend
bun install
bun run dev
```

### 2.3 MySQL 模式

需配置：

```
DB_DIALECT=mysql
MYSQL_URL=mysql://user:pass@host:3306/dbname
```

> 也可使用 `DATABASE_URL` 替代 `MYSQL_URL`。

启动：

```bash
cd backend
bun install
bun run dev
```

### 2.4 管理员初始化

服务启动时会检查用户表：

- 若不存在用户，会创建默认管理员（`ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD`）。
- 若已有用户，则跳过创建。

### 2.5 Cookie 安全

建议生产环境开启：

```
NODE_ENV=production
COOKIE_SECURE=true
```

这样会为会话 Cookie 自动加 `Secure` 标记，仅在 HTTPS 下传输。

---

## 3. 前端部署

### 3.1 环境变量

前端通过 `VITE_API_BASE` 访问后端：

```
VITE_API_BASE=https://api.example.com
```

### 3.2 本地开发

```bash
cd frontend
npm install
npm run dev
```

### 3.3 构建与预览

```bash
cd frontend
npm install
npm run build
npm run preview
```

构建结果输出到 `frontend/dist`，可交由 Nginx/静态服务器托管。

---

## 4. 反向代理（示例）

生产部署建议使用 Nginx：

- `/api` 反向代理到后端 `3000`
- 前端静态资源指向 `dist`

示例（仅供参考）：

```
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location / {
  root /var/www/vtix/dist;
  try_files $uri /index.html;
}
```

---

## 5. 常见问题

### 5.1 登录后会话失效
后端会话默认存在内存中，服务重启后会话失效。生产可考虑接入 Redis 或数据库会话存储。

### 5.2 CORS 问题
后端已开启 `cors({ origin: true, credentials: true })`，前端请求需带 `credentials: 'include'`。

