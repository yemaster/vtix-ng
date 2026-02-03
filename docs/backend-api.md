# VTIX Backend API 文档

> 面向前后端联调与后台运维的接口说明（以当前代码为准）。

## 基本信息

- **Base URL**：由 `VITE_API_BASE`/部署域名决定。
- **数据格式**：JSON。
- **认证方式**：Cookie 会话，服务端返回 `vtix_session`（HttpOnly，SameSite=Lax）。
- **错误格式**：多数接口返回 `{ error: string }`，并设置 4xx/5xx 状态码。
- **会话说明**：会话存储在内存中，服务重启后会话失效。

## 权限说明

后端使用以下权限位（见 `backend/src/utils/permissions.ts`）：

- `LOGIN`、`ACCESS_PUBLIC`、`ACCESS_PRIVATE`、`ACCESS_RECORDS`、`ACCESS_WRONG_RECORDS`
- `MANAGE_QUESTION_BANK_OWN`（可管理自己题库）
- `MANAGE_QUESTION_BANK_ALL`（可管理所有题库）
- `MANAGE_USERS`（可管理用户/用户组/查看后台统计）
- `MANAGE_NOTICES`（可管理通知公告）

## 数据结构

### User
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "groupId": "string",
  "groupName": "string",
  "permissions": 0
}
```

### Problem（题目）
`type` 取值：`1` 单选、`2` 多选、`3` 填空、`4` 判断。

```json
{
  "type": 1,
  "content": "string",
  "choices": ["A", "B", "C", "D"],
  "answer": 0,
  "hint": "string"
}
```

> 填空题 `type=3` 不需要 `choices`，`answer` 为字符串（支持“a,b;c”形式）。

### TestConfigItem（模拟考试配置）
```json
{ "type": 1, "number": 10, "score": 1 }
```

### ProblemSet（题库）
**列表字段：**
```json
{
  "id": "string",
  "code": "string",
  "title": "string",
  "year": 2025,
  "categories": ["string"],
  "isNew": true,
  "recommendedRank": 1,
  "questionCount": 100,
  "creatorId": "string",
  "creatorName": "string",
  "isPublic": true,
  "inviteCode": "string|null"
}
```

**详情字段额外包含：**
```json
{
  "test": [{ "type": 1, "number": 10, "score": 1 }],
  "problems": [/* Problem[] */]
}
```

### Notice（通知公告）
```json
{
  "id": "string",
  "title": "string",
  "content": "string",
  "authorName": "string",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```

## 认证与用户

### 注册
`POST /api/register`

**Body**
```json
{
  "name": "string",
  "email": "string",
  "password": "string"
}
```

**规则**
- `name` 长度 2~32
- `email` 必须包含 `@`，长度 <= 254
- `password` 长度 8~128

**Response**
```json
{ "user": { /* User */ } }
```

**错误**
- `400`：参数不合法
- `409`：名称或邮箱已存在

### 登录
`POST /api/login`

**Body**
```json
{
  "name": "string",
  "password": "string"
}
```

> 仅支持用户名登录，`password` 必填。

**Response**
```json
{ "user": { /* User */ } }
```

**错误**
- `400`：参数不合法
- `401`：账号或密码错误

### 获取当前用户
`GET /api/me`

**Response**
```json
{ "user": { /* User */ } }
```
> 未登录时 `user` 为 `null`。

### 更新个人信息
`PUT /api/me`

**Body**
```json
{ "name": "string", "email": "string" }
```

**Response**
```json
{ "user": { /* User */ } }
```

**错误**
- `400`：参数不合法
- `409`：名称或邮箱已被占用
- `401`：未登录

### 修改密码
`POST /api/me/password`

**Body**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response**
```json
{ "ok": true }
```

**错误**
- `400`：参数不合法
- `401`：未登录或当前密码错误
- `404`：用户不存在

### 登出
`POST /api/logout`

**Response**
```json
{ "ok": true }
```

## 题库（公开/个人/管理）

### 获取公开题库列表
`GET /api/problem-sets`

**Response**
```json
[ /* ProblemSet[] */ ]
```

### 获取题库详情
`GET /api/problem-sets/:code`

**Query**
- `invite`：私有题库的邀请码（可选）

**Response**
```json
{ /* ProblemSet + problems/test */ }
```

**访问规则**
- 公开题库：匿名可访问；登录用户需要 `ACCESS_PUBLIC` 才能访问。
- 私有题库：以下任一满足即可访问：
  - 题库创建者
  - 系统管理员（`MANAGE_USERS`）
  - 具备 `ACCESS_PRIVATE`
  - `invite` 与题库邀请码匹配

### 获取我的题库
`GET /api/my-problem-sets`

**需要登录**

**Response**
```json
[ /* ProblemSet[] */ ]
```

### 新建题库
`POST /api/problem-sets`

**需要登录**

**权限**
- `MANAGE_QUESTION_BANK_OWN` 或 `MANAGE_QUESTION_BANK_ALL`

**Body**
```json
{
  "title": "string",
  "year": 2025,
  "categories": ["string"],
  "isPublic": true,
  "inviteCode": "string|null",
  "problems": [ /* Problem[] */ ],
  "test": [ /* TestConfigItem[] */ ],
  "score": [1,2,1,1,0]
}
```

**说明**
- `isPublic` 仅 `MANAGE_QUESTION_BANK_ALL` 可设置，否则强制私有。
- `inviteCode` 仅私有题库有效。
- `test` 支持：
  - 规范数组：`[{type, number, score}]`
  - 旧格式数组：`[10,20, ...]`（配合 `score` 数组）

**Response**
```json
{ /* ProblemSet + problems/test */ }
```

**错误**
- `400`：参数不合法 / 题目为空
- `401`：未登录
- `403`：无权限

### 更新题库
`PUT /api/problem-sets/:code`

**需要登录**

**权限**
- `MANAGE_QUESTION_BANK_ALL`，或 `MANAGE_QUESTION_BANK_OWN` 且为题库创建者

**Body**（同新建）

**Response**
```json
{ /* ProblemSet + problems/test */ }
```

**错误**
- `400`：参数不合法 / 题目为空
- `401`：未登录
- `403`：无权限
- `404`：题库不存在

## 后台管理

### 数据概览
`GET /api/admin/stats`

**需要登录**

**权限**
- `MANAGE_QUESTION_BANK_ALL` 或 `MANAGE_USERS`

**Response**
```json
{
  "totalSets": 0,
  "publicSets": 0,
  "activeUsers": 0,
  "visitCount": 0,
  "practiceCount": 0,
  "deltas": {
    "totalSets7d": 0,
    "publicSets7d": 0,
    "activeUsersToday": 0,
    "visitToday": 0,
    "practiceToday": 0
  }
}
```

### 管理端题库列表
`GET /api/admin/problem-sets`

**需要登录**

**权限**
- `MANAGE_QUESTION_BANK_ALL` 或 `MANAGE_QUESTION_BANK_OWN`

**Response**
```json
[ /* ProblemSet[] */ ]
```

### 删除题库
`DELETE /api/admin/problem-sets/:code`

**需要登录**

**权限**
- `MANAGE_QUESTION_BANK_ALL` 或 `MANAGE_QUESTION_BANK_OWN`（仅可删自己的）

**Response**
```json
{ "ok": true }
```

**错误**
- `401`：未登录
- `403`：无权限
- `404`：题库不存在

### 用户组管理
`GET /api/admin/user-groups`  
`POST /api/admin/user-groups`  
`PUT /api/admin/user-groups/:id`

**需要登录 + 权限 `MANAGE_USERS`**

**POST/PUT Body**
```json
{ "name": "string", "description": "string", "permissions": 0 }
```

**Response**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "permissions": 0,
  "builtIn": true
}
```

### 用户管理
`GET /api/admin/users`  
`POST /api/admin/users`  
`PUT /api/admin/users/:id`

**需要登录 + 权限 `MANAGE_USERS`**

**POST/PUT Body**
```json
{ "name": "string", "email": "string", "groupId": "string" }
```

**Response**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "groupId": "string",
  "groupName": "string",
  "permissions": 0
}
```

**备注**
- 通过后台创建用户会使用默认密码（`DEFAULT_USER_PASSWORD` 环境变量，默认 `vtix1234`）。

### 通知公告管理
`GET /api/admin/notices`  
`POST /api/admin/notices`  
`PUT /api/admin/notices/:id`  
`DELETE /api/admin/notices/:id`

**需要登录 + 权限 `MANAGE_NOTICES`**

**POST/PUT Body**
```json
{ "title": "string", "content": "string" }
```

**Response**
```json
{ /* Notice */ }
```

## 通知公告（前台）

### 通知公告列表
`GET /api/notices`

**Query**
- `limit`：返回数量（默认 6，最大 50）
- `offset`：偏移（默认 0）

**Response**
```json
[
  {
    "id": "string",
    "title": "string",
    "authorName": "string",
    "createdAt": 1710000000000,
    "updatedAt": 1710000000000
  }
]
```

### 通知公告详情
`GET /api/notices/:id`

**Response**
```json
{ /* Notice */ }
```

## 练习记录同步

### 获取记录索引
`GET /api/records`

**需要登录**

**Response**
```json
{
  "records": [
    { "id": "string", "updatedAt": 1710000000000 }
  ]
}
```

### 提交记录索引
`POST /api/records`

**需要登录**

**Body**
```json
{
  "records": [
    { "id": "string", "updatedAt": 1710000000000 }
  ]
}
```

**Response**
```json
{
  "records": [
    { "id": "string", "updatedAt": 1710000000000 }
  ]
}
```

> 服务端会合并并保留最新 10 条记录索引。
