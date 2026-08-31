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
- `MANAGE_COMMENTS`（可删除任意评论、处理举报）

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

### Message（站内消息）
```json
{
  "id": 1,
  "senderId": 1,
  "senderName": "string",
  "receiverId": 1,
  "receiverName": "string",
  "content": "string",
  "type": 2,
  "link": "string|null",
  "isRead": false,
  "createdAt": 1710000000000
}
```
`type` 取值：`1` 系统消息（题库审核等）、`2` 评论点赞、`3` 举报通知、`4` 评论引用。`link` 非空时前端可点击跳转。

### Comment（题目评论）
```json
{
  "id": 1,
  "problemId": 1,
  "userId": "1",
  "userName": "string",
  "content": "string",
  "floor": 1,
  "likeCount": 0,
  "liked": false,
  "replyTo": {
    "commentId": 1,
    "floor": 1,
    "userName": "string",
    "snippet": "string"
  },
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```
- `floor` 为题内楼号（按发表时间递增，删除评论不重排，允许跳号）。
- `liked` 为当前查看者是否已点赞（未登录恒为 `false`）。
- `replyTo` 为该评论引用的父评论摘要；无引用或父评论已删时为 `null`。`snippet` 为父评论内容前 40 字。

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
  "commentCount": 0,
  "likeCount": 0,
  "reportCount": 0,
  "deltas": {
    "totalSets7d": 0,
    "publicSets7d": 0,
    "activeUsersToday": 0,
    "visitToday": 0,
    "practiceToday": 0
  }
}
```
`commentCount`/`likeCount`/`reportCount` 为评论、点赞、举报的累计总数（点赞按点赞记录表计、举报含已忽略）。

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

## 消息（站内消息）

### 未读消息数
`GET /api/messages/unread-count`

**需要登录**

**Response**
```json
{ "count": 0 }
```

### 消息列表
`GET /api/messages`

**需要登录**

**Query**
- `page`（默认 1）、`pageSize`（默认 8）

**Response**
```json
[ /* Message[] */ ]
```
响应头：`x-total-count`（总数）、`x-unread-count`（未读数，返回时尚未标记已读的值）。读取列表时服务端会自动把这些消息标记为已读。

## 题目评论

评论按"单个题目"维度展开；前端在某题作答后才展示（防剧透）。**查看（GET）对游客开放**，发评论 / 点赞 / 举报 / 删除均需登录。

### 评论列表
`GET /api/problems/:id/comments`

**Query**
- `page`（默认 1）、`pageSize`（默认 10）、`sort`：`latest`（默认，按 id 倒序）/ `hot`（按点赞数倒序）

**Response**
```json
[ /* Comment[] */ ]
```
响应头 `x-total-count` 为该题评论总数。已登录查看者会回填各条 `liked` 与 `replyTo`。

### 发表评论
`POST /api/problems/:id/comments`

**需要登录 + 频率限制**（每用户 60 秒内 ≤ 5 条）

**Body**
```json
{ "content": "string", "replyToCommentId": 1 }
```
- `content`：trim 后非空，长度 ≤ 500。
- `replyToCommentId`（可选）：引用的目标评论 id；必须存在且属于**同一题目**，否则忽略（降级为普通评论）。

**Response** `201`
```json
{ /* Comment */ }
```
引用了他人评论时，被引用者收到一条 `type=4`（评论引用）消息；自引用不发通知。

**错误**
- `400`：内容为空 / 超长
- `401`：未登录
- `404`：题目不存在
- `429`：频率过高

### 点赞 / 取消点赞
`POST /api/comments/:id/like`

**需要登录**

**Response**
```json
{ "liked": true, "likeCount": 1 }
```
再次调用即取消。新点赞（非自赞）会向评论作者发一条 `type=2`（评论点赞）消息。

**错误**
- `401`：未登录
- `404`：评论不存在

### 举报评论
`POST /api/comments/:id/report`

**需要登录**

**Body**
```json
{ "reason": "string" }
```
`reason` 可选（最长 200）。同一用户对同一评论只能举报一次。

**Response**
```json
{ "ok": true, "alreadyReported": false }
```
当某评论**当前没有待处理（open）举报**时收到一条新举报，所有持 `MANAGE_COMMENTS` 的用户会收到一条 `type=3`（举报通知）消息，`link` 指向 `/admin/comments`。即每一「波」举报只通知一次；管理员把这波举报忽略（置为 `dismissed`）后，若再收到新举报会再次通知。举报记录带 `status`：`open`（待处理）/ `dismissed`（已忽略，评论保留）。

### 删除评论
`DELETE /api/comments/:id`

**需要登录**

**权限**：评论作者，或持 `MANAGE_COMMENTS`。

**Response**
```json
{ "ok": true }
```
删除会级联移除该评论的点赞与举报记录；若它被其他评论引用，引用方的 `replyTo` 会变为 `null`（评论本身保留）。

**错误**
- `401`：未登录
- `403`：无权删除
- `404`：评论不存在

### 被举报评论列表（管理端，按评论聚合）
`GET /api/admin/comments/reported`

**需要登录 + 权限 `MANAGE_COMMENTS`**

**Query**
- `page`（默认 1）、`pageSize`（默认 20，按**评论**分页）

**Response**
```json
[
  {
    "commentId": 1,
    "problemId": 1,
    "setTitle": "string|null",
    "questionNumber": 1,
    "commentUserName": "string",
    "commentContent": "string",
    "floor": 1,
    "likeCount": 0,
    "openCount": 3,
    "totalCount": 5,
    "latestReportAt": 1710000000000,
    "reports": [
      { "reportId": 1, "reason": "string|null", "createdAt": 1710000000000 }
    ]
  }
]
```
只返回**仍有 `open` 举报**的评论，按最新 open 举报时间倒序。`openCount` 为当前待处理数，`totalCount` 为累计（含已忽略）。响应头 `x-total-count` 为待处理评论数。`setTitle`/`questionNumber` 取该题所属题库（多题集时取最近更新的一个）。

### 忽略举报（管理端，按评论批量）
`POST /api/admin/comments/:id/dismiss-reports`

**需要登录 + 权限 `MANAGE_COMMENTS`**

把该评论的全部 `open` 举报置为 `dismissed`（**保留评论**，举报记录留作审计）。幂等。

**Response**
```json
{ "ok": true }
```
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
