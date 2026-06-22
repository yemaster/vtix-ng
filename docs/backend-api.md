# VTIX Backend API 文档

> 面向前后端联调与后台运维的接口说明（以当前代码为准）。

## 基本信息

- **Base URL**：由 `VITE_API_BASE`/部署域名决定。
- **数据格式**：JSON。
- **认证方式**：Cookie 会话，服务端返回 `vtix_session`（HttpOnly，SameSite=Lax）。
- **错误格式**：多数接口返回 `{ error: string }`，并设置 4xx/5xx 状态码。
- **会话说明**：会话存储在内存中，服务重启后会话失效。
- **分页响应**：分页接口通过 `x-total-count` 响应头返回总数（CORS 已暴露该头）。
- **实时通信**：题库大乱斗使用 Socket.IO，路径 `/socket.io`，需带 Cookie 会话鉴权。

## 系统信息

### 版本
`GET /api/version`

**Response**
```json
{ "name": "backend", "version": "1.0.50", "buildTime": "2026-06-22T..." }
```
> `buildTime` 来自 `BACKEND_BUILD_TIME` 环境变量，未设置时不返回。

### 公开统计
`GET /api/stats`

**Response**
```json
{ "totalSets": 0, "questionCount": 0, "recommendedCount": 0 }
```
> 仅统计公开题库。

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

## AI 题目解析

### 生成做题解析
`POST /api/ai/problem-explanation`

**需要登录**

**Body**
```json
{
  "testId": "string",
  "testTitle": "string",
  "questionIndex": 1,
  "problem": {
    "type": 1,
    "content": "string",
    "choices": ["A", "B", "C", "D"],
    "answer": 0,
    "hint": "string"
  },
  "userAnswer": [0]
}
```

**Response**

成功时返回 `text/event-stream`，前端可边生成边展示。事件格式：

```text
event: token
data: {"delta":"本次新增文本"}

event: model
data: {"model":"deepseek-v4-flash-ascend"}

event: done
data: {"explanation":"完整解析","model":"deepseek-v4-flash-ascend","usage":null}
```

上游调用失败时，接口会在事件流中返回：

```text
event: error
data: {"error":"错误信息","status":502}
```

未登录仍返回普通 JSON：

```json
{ "error": "Unauthorized" }
```

**错误**
- `400`：题目参数不合法
- `401`：未登录
- `503`：后端未配置 `AI_API_KEY`
- `502`：上游 AI 接口请求失败或返回格式异常

### 获取个人 AI 配置
`GET /api/me/ai-settings`

**需要登录**

**说明**
- 默认服务商为服务器配置的学校大模型平台。
- 用户可保存自己的 API Key。
- 用户切换到其他服务商时，可填写 OpenAI 兼容地址，例如 `https://api.example.com/v1`，或 Anthropic 官方地址，例如 `https://api.anthropic.com`。
- 用户可显式选择 `openai` 或 `anthropic` 协议；旧配置未保存协议时，后端才会按地址和模型名推断。

**Response**
```json
{
  "aiApiBase": "string",
  "aiProtocol": "openai",
  "aiModel": "string",
  "aiRequestTimeoutMs": 30000,
  "hasApiKey": true,
  "modelOptions": [
    { "label": "deepseek-v4-flash-ascend", "value": "deepseek-v4-flash-ascend" }
  ],
  "defaults": {
    "aiApiBase": "https://api.llm.ustc.edu.cn/v1",
    "aiProtocol": "openai",
    "aiModel": "deepseek-v4-flash-ascend",
    "aiRequestTimeoutMs": 30000
  }
}
```

### 更新个人 AI 配置
`PUT /api/me/ai-settings`

**需要登录**

**Body**
```json
{
  "aiApiBase": "https://api.example.com/v1",
  "aiProtocol": "openai",
  "aiModel": "deepseek-chat",
  "aiRequestTimeoutMs": 30000,
  "aiApiKey": "string"
}
```

> `aiApiKey` 省略表示保留原密钥，传空字符串表示清除密钥。学校平台模式下前端会提交空 `aiApiBase`，后端回退到服务器默认学校平台地址。

### 获取可用 AI 模型
`POST /api/me/ai-models`

**需要登录**

通过后端使用当前用户保存的 API Key 或服务器默认 API Key 请求上游模型列表，前端不直接接触第三方服务商。

**Body**
```json
{
  "aiApiBase": "https://api.example.com/v1",
  "aiProtocol": "openai",
  "aiRequestTimeoutMs": 30000,
  "aiApiKey": "string"
}
```

**说明**
- `aiProtocol` 可选值为 `openai` 或 `anthropic`。
- `aiApiKey` 省略表示使用已保存密钥；传入非空值可用于保存前预览模型列表。
- OpenAI 兼容协议会请求 `{aiApiBase}/models`。
- Anthropic 协议会请求 `{aiApiBase}/v1/models`；如果地址已以 `/v1` 结尾，则请求 `{aiApiBase}/models`。

**Response**
```json
{
  "protocol": "openai",
  "modelOptions": [
    { "label": "deepseek-v4-flash-ascend", "value": "deepseek-v4-flash-ascend" }
  ]
}
```

## 题库（公开/个人/管理）

### 获取公开题库列表
`GET /api/problem-sets`

**Query**
- `page`、`pageSize`：分页
- `q`：按标题/编号/年份搜索
- `category`：分类筛选

> 不带任何 query 时返回全部公开题库（不分页）；带任意分页/搜索/分类参数时分页，并通过 `x-total-count` 返回总数。

**Response**
```json
[ /* ProblemSet[] */ ]
```

### 推荐题库
`GET /api/problem-sets/recommended`

**Query**
- `limit`：返回数量上限，不传或 `0` 表示全部

**Response**
```json
[ /* ProblemSet[]，按 recommendedRank 升序 */ ]
```

### 题库分类
`GET /api/problem-sets/categories`

**Response**
```json
{ "items": ["string"] }
```

### 题库广场
`GET /api/problem-sets/plaza`

**Query**
- `page`、`pageSize`：分页
- `q`：搜索

**Response**
通过 `x-total-count` 返回总数，body 为题库广场分页列表。

### 题库元信息
`GET /api/problem-sets/:code/meta`

> 不含完整题目，仅返回题库概览（标题、题数、创建者、反应统计等），用于列表/广场卡片。

### 题库反应（点赞/收藏）
`POST /api/problem-sets/:code/reaction`

**需要登录**

**Body**
```json
{ "type": "like" }
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

### 提交题库发布申请
`POST /api/my-problem-sets/:code/publish-request`

**需要登录**

> 个人私有题库可提交发布申请，进入待审核状态（`isPending`）。管理员通过 `/api/admin/problem-sets/:code/review` 审核后会向创建者发送站内消息。

**Response**
```json
{ "ok": true }
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

### 待审核题库
`GET /api/admin/problem-sets/pending`

**需要登录 + 权限 `MANAGE_QUESTION_BANK_ALL`**

返回 `isPending=true` 的题库列表，供审核。

### 导出题库
`GET /api/admin/problem-sets/export`  
`POST /api/admin/problem-sets/export`

**需要登录 + 权限 `MANAGE_QUESTION_BANK_ALL`**

GET 按条件导出，POST 可指定题库 code 列表导出。

### 导入题库
`POST /api/admin/problem-sets/import`

**需要登录 + 权限 `MANAGE_QUESTION_BANK_ALL`**

批量导入题库（JSON 或 xlsx 解析后的结构）。

### 题库标记
`PUT /api/admin/problem-sets/:code/flags`

**需要登录 + 权限 `MANAGE_QUESTION_BANK_ALL`**

**Body**
```json
{ "isPublic": true, "isPending": false }
```

> 直接修改题库公开/待审核标记。

### 题库审核
`PUT /api/admin/problem-sets/:code/review`

**需要登录 + 权限 `MANAGE_QUESTION_BANK_ALL`**

**Body**
```json
{ "action": "approve" }
```

> `action` 取 `approve` 或 `reject`。审核后会向题库创建者发送站内消息。仅对 `isPending=true` 的题库有效。

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

## 站内消息

> 用户收到的系统通知（题库审核结果、对战邀请等）。消息列表接口在返回时会自动把已拉取的消息标记为已读。

### 未读消息数
`GET /api/messages/unread-count`

**需要登录**

**Response**
```json
{ "count": 3 }
```

### 消息列表
`GET /api/messages`

**需要登录**

**Query**
- `page`、`pageSize`：分页

**Response Header**
- `x-total-count`：消息总数
- `x-unread-count`：本次拉取前的未读数

**Response**
```json
[
  {
    "id": 1,
    "senderName": "管理员",
    "receiverName": "string",
    "content": "string",
    "type": 1,
    "link": "/admin/question-banks",
    "createdAt": 1710000000000
  }
]
```

## 题库大乱斗（Brawl）

> 1v1 实时对战。REST 接口提供题库与用户空间数据，实时对战逻辑走 Socket.IO。

### 乱斗题库列表
`GET /api/brawl/problem-sets`

**需要登录**

**Query**
- `page`、`pageSize`、`q`

**Response Header**
- `x-total-count`

**Response**
```json
[ /* 可用于乱斗的题库分页列表 */ ]
```

### 乱斗用户空间
`GET /api/brawl/user-space`

**Query**
- `name`（必填）：用户名
- `page`、`pageSize`

**Response Header**
- `x-total-count`

**错误**
- `400`：`name` 为空
- `404`：用户不存在

### Socket.IO 事件协议

连接地址：`/socket.io`（需带 Cookie 会话，未登录会被 `brawl:auth-required` 拒绝并断开）。

**客户端 → 服务端**
- `brawl:latency-probe` — 延迟探测，服务端 ack 回调
- `brawl:lobby-chat-send` — 大厅发言 `{ message, setId?, setCode?, setTitle? }`
- `brawl:select-set` — 选择对战题库 `{ setCode }`
- `brawl:start-match` — 开始匹配
- `brawl:cancel-match` — 取消匹配
- `brawl:submit-answer` — 提交答案

**服务端 → 客户端**
- `brawl:connected` — 连接成功 `{ userId, userName, targetScore }`
- `brawl:selected-set` — 当前选中题库 `{ setCode }`
- `brawl:lobby-state` — 大厅快照
- `brawl:lobby-chat` — 大厅消息
- `brawl:round-locked` — 回台锁定
- `brawl:error` — 错误 `{ message }`
- `brawl:auth-required` — 鉴权失败 `{ reason }`

## 练习记录同步

> 前端通过 `/records` + `/records/sync` + `/records/sync-item` + `/records/meta` 实现多端增量同步。每用户有记录条数上限（`limit`，由用户组决定，默认保留最新 10 条）。

### 获取记录索引
`GET /api/records`

**需要登录**

**Query**
- `since`（可选）：时间戳，仅返回该时间之后更新的记录

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

> 服务端会合并并保留最新 N 条记录索引（N 由用户组上限决定）。

### 增量同步
`POST /api/records/sync`

**需要登录**

**Body**
```json
{
  "since": 1710000000000,
  "records": [ { "id": "string", "updatedAt": 1710000000000 } ]
}
```

**Response**
```json
{
  "cursor": 1710000000000,
  "records": [ { "id": "string", "updatedAt": 1710000000000 } ],
  "limit": 10
}
```

> 返回 `since` 之后服务端有变更的记录，以及当前同步游标 `cursor`。

### 单条记录同步
`POST /api/records/sync-item`

**需要登录**

用于单条记录的增量上传/下载。`fullRecord` 省略时服务端仅返回该条是否需要全量上传；传入时执行 upsert。

**Body**
```json
{
  "recordId": "string",
  "since": 1710000000000,
  "fullRecord": { /* 完整 PracticeRecord */ }
}
```

**Response**
```json
{
  "recordExists": true,
  "needFull": false,
  "conflict": false,
  "cursor": 1710000000000,
  "records": [ { "id": "string", "updatedAt": 1710000000000 } ],
  "record": { /* PracticeRecord */ },
  "trimmed": 0,
  "limit": 10
}
```

### 批量查询记录元信息
`POST /api/records/meta`

**需要登录**

**Body**
```json
{ "ids": ["string", "string"] }
```

**Response**
```json
{
  "ids": ["string"],
  "records": [ { "id": "string", "updatedAt": 1710000000000 } ],
  "savedCount": 5,
  "limit": 10
}
```

> `savedCount` 为该用户当前已保存记录数；`ids` 最多 200 个，返回其中服务端存在的记录的 `updatedAt`。
