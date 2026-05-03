<div align="center">

# SyncCinema

**同步观影，无距共享**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](README_EN.md) | **中文**

多人实时同步观影平台 — 播放、暂停、进度跳转、倍速播放，与远方的朋友完美同步。

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [部署](#-部署) · [API 文档](#-api-参考) · [贡献指南](CONTRIBUTING.md)

</div>

---

## 为什么选择 SyncCinema？

一个人看视频也行，但一起看更好。SyncCinema 用**毫秒级同步**消除距离感，所有人看到同一帧画面 — 不再需要「3、2、1、播放！」的倒计时。

| | SyncCinema | Discord 一起看 | Teleparty |
|---|:---:|:---:|:---:|
| 自托管 | Yes | No | No |
| 原生视频同步精度 | 0.3s | ~1-2s | ~1s |
| 自定义视频源 | MP4/WebM/HLS/YouTube/Bilibili | 仅 YouTube | Netflix/YouTube/Hulu |
| 弹幕 | Yes | No | No |
| 语音通话 (WebRTC P2P) | Yes | Yes | No |
| 开源 | MIT | - | - |

---

## 功能特性

### 核心功能

- **实时视频同步** — 播放、暂停、进度跳转、倍速播放全房间实时同步，偏差 &lt;0.3s 自动校准
- **房间系统** — 公开房间、密码保护私密房间、房主离开自动转让
- **实时聊天** — 文字消息 + 表情选择器 + 文件分享（图片/视频/文档，最大 5MB）+ 历史记录持久化

### 视频源支持

| 来源 | 格式 | 同步精度 |
|------|------|---------|
| 原生视频 | MP4、WebM、OGG、HLS (m3u8) | 毫秒级 |
| YouTube | 视频链接（iframe 嵌入） | 受 iframe API 限制 |
| Bilibili | BV/av、番剧 (ep/ss)、b23.tv 短链接 | 受 iframe API 限制 |

### 社交与互动

- **弹幕系统** — 滚动/顶部/底部三种模式，支持关键词屏蔽
- **私聊功能** — 点击成员头像发起一对一私聊
- **语音通话** — WebRTC P2P 语音聊天（实验性）
- **屏幕分享** — 房主可实时分享屏幕给房间成员
- **播放列表** — 添加多个视频，自动连续播放
- **表情互动** — 内置 24 个常用 emoji

### 用户系统

- **JWT 认证** — 注册/登录签发 Bearer Token，API 统一认证
- **个人资料** — 自定义头像上传、个性签名
- **房间收藏** — 收藏喜欢的房间，大厅快速进入
- **观看历史** — 自动记录最近观看的房间和视频
- **管理后台** — 用户管理、房间管理、数据统计仪表盘

### 体验优化

- **响应式设计** — 完美适配手机、平板、桌面端
- **暗黑主题** — 专为夜间观影优化的深色界面
- **定时关闭** — 15/30/45/60/90/120 分钟预设，支持自定义
- **休息提醒** — 每 45 分钟弹窗提醒休息

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js >= 18 |
| 后端 | Express ^4.18 |
| 实时通信 | Socket.io ^4.7 |
| 认证 | JWT (jsonwebtoken ^9.0) |
| 前端 | 原生 HTML5 / CSS3 / ES6+ |
| 数据库 | JSON 文件存储（可通过 `db.js` 切换 MongoDB/PostgreSQL） |
| 加密 | bcryptjs ^2.4 |
| 语音 | WebRTC (P2P) |

---

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- npm >= 9

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/2047327434/SyncCinema.git
cd SyncCinema

# 安装依赖
cd server
npm install

# 启动服务
npm start
```

服务器默认在 `http://localhost:3001` 启动。

| 入口 | 地址 | 说明 |
|------|------|------|
| 播放页面 | http://localhost:3001/player/ | 创建/加入房间，同步观影 |
| 管理后台 | http://localhost:3001/admin/ | 用户与房间管理（需管理员账号） |

### 默认管理员账号

```
用户名: admin
密码:   admin123
```

> 首次部署后请立即修改默认管理员密码。

---

## 部署

### Docker 部署（推荐）

```bash
docker build -t synccinema .
docker run -d -p 3001:3001 \
  -e JWT_SECRET=your-secret-key \
  -e DB_TYPE=json \
  -v synccinema-data:/app/server/data \
  --name synccinema \
  synccinema
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务器监听端口 |
| `JWT_SECRET` | `synccinema-secret-key-...` | JWT 签名密钥（**生产环境必须修改**） |
| `DB_TYPE` | `json` | 数据库类型：`json` / `mongodb` / `postgresql` |

### 生产环境检查清单

- [ ] 将 `JWT_SECRET` 改为强随机值
- [ ] 将 `DB_TYPE` 切换为 MongoDB 或 PostgreSQL
- [ ] 配置 Nginx 反向代理并启用 SSL
- [ ] 将 `server/data/` 挂载到持久化存储
- [ ] 限制 CORS origin 为实际域名
- [ ] 修改默认管理员密码

---

## 项目结构

```
SyncCinema/
├── server/                 # 后端服务
│   ├── server.js           # Express + Socket.io 入口
│   ├── db.js               # 数据库抽象层
│   ├── package.json        # 依赖配置
│   └── data/               # JSON 数据目录（gitignored）
├── admin/                  # 管理后台
│   ├── index.html
│   ├── admin.css
│   └── admin.js
├── player/                 # 用户播放端
│   ├── index.html
│   ├── player.css
│   └── player.js
├── LICENSE
├── PRIVACY.md              # 隐私声明
├── CONTRIBUTING.md         # 贡献指南
└── README.md
```

---

## API 参考

### REST 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/register` | - | 用户注册 |
| POST | `/api/login` | - | 用户登录，返回 JWT Token |
| POST | `/api/refresh-token` | JWT | 刷新 Token |
| GET | `/api/users/me` | JWT | 获取当前用户信息 |
| PUT | `/api/users/:id/profile` | JWT | 更新个人资料（仅限本人） |
| PUT | `/api/users/:id/favorites` | JWT | 更新收藏列表（仅限本人） |
| GET | `/api/users` | 管理员 | 获取所有用户 |
| DELETE | `/api/users/:id` | 管理员 | 删除用户 |
| PUT | `/api/users/:id/status` | 管理员 | 封禁/解封用户 |
| GET | `/api/rooms` | - | 获取所有房间 |
| DELETE | `/api/rooms/:id` | 管理员 | 删除房间 |
| GET | `/api/private-messages/:userId` | JWT | 获取私聊历史 |
| GET | `/api/private-messages/unread/count` | JWT | 获取未读私聊数 |

### Socket.io 事件

<details>
<summary>客户端 → 服务端</summary>

| 事件 | 参数 | 权限 | 说明 |
|------|------|------|------|
| `auth` | `{ userId, username, token }` | 所有 | 连接认证 |
| `create-room` | `{ name, isPublic, password, videoUrl }` | 用户 | 创建房间 |
| `join-room` | `{ roomId, password }` | 用户 | 加入房间 |
| `leave-room` | - | 成员 | 离开房间 |
| `video-play` | `{ roomId, currentTime }` | 房主 | 广播播放 |
| `video-pause` | `{ roomId, currentTime }` | 房主 | 广播暂停 |
| `video-seek` | `{ roomId, currentTime }` | 房主 | 广播进度跳转 |
| `video-rate-change` | `{ roomId, playbackRate }` | 房主 | 广播倍速变更 |
| `video-timeupdate` | `{ roomId, currentTime }` | 房主 | 每秒同步进度 |
| `load-video` | `{ roomId, videoUrl }` | 房主 | 加载新视频 |
| `chat-message` | `{ roomId, message }` | 成员 | 发送聊天消息 |
| `share-file` | `{ roomId, fileName, fileData, ... }` | 成员 | 分享文件 |
| `danmaku-send` | `{ roomId, text, color, position }` | 成员 | 发送弹幕 |
| `private-message` | `{ toUserId, message }` | 用户 | 发送私聊 |
| `playlist-update` | `{ roomId, playlist }` | 房主 | 更新播放列表 |
| `update-room-settings` | `{ roomId, announcement, isPublic }` | 房主 | 更新房间设置 |

</details>

<details>
<summary>服务端 → 客户端</summary>

| 事件 | 参数 | 说明 |
|------|------|------|
| `room-created` | `{ roomId, room }` | 房间创建成功 |
| `joined-room` | `{ roomId, name, host, videoUrl, videoState, members, messages, ... }` | 成功加入房间 |
| `join-error` | `{ message }` | 加入失败 |
| `user-joined` | `{ username, memberCount }` | 有用户加入 |
| `user-left` | `{ username, memberCount }` | 有用户离开 |
| `host-changed` | `{ newHost }` | 房主变更 |
| `rooms-list` | `[room]` | 公开房间列表 |
| `video-play` | `{ currentTime }` | 播放指令 |
| `video-pause` | `{ currentTime }` | 暂停指令 |
| `video-seek` | `{ currentTime }` | 跳转指令 |
| `video-rate-change` | `{ playbackRate }` | 倍速变更指令 |
| `video-sync` | `{ currentTime }` | 周期同步 |
| `video-state` | `{ isPlaying, currentTime, playbackRate }` | 完整视频状态 |
| `video-loaded` | `{ videoUrl }` | 新视频已加载 |
| `chat-message` | `{ id, username, message, timestamp }` | 新聊天消息 |
| `file-shared` | `{ id, username, fileName, fileData, ... }` | 文件分享 |
| `danmaku-received` | `{ id, text, color, position }` | 收到弹幕 |
| `private-message-received` | `{ id, from, message, ... }` | 收到私聊 |

</details>

---

## 安全

SyncCinema 在安全方面经过严格审查：

| 安全措施 | 状态 | 说明 |
|---------|------|------|
| XSS 防护 | 已验证 | 所有输出经 HTML 实体编码，单引号一并转义 |
| onclick 注入防护 | 已验证 | 全部替换为 `data-*` + 事件委托 |
| iframe 协议验证 | 已验证 | 仅允许 `http://` / `https://` |
| 输入长度限制 | 已验证 | 用户名、密码、消息、公告等均有校验 |
| 管理员权限校验 | 已验证 | 管理员 API 需 JWT Token + admin 角色 |
| IDOR 防护 | 已验证 | 用户只能操作自己的数据 |
| 请求频率限制 | 已验证 | 每个 IP 每分钟最多 60 次请求 |
| 文件大小限制 | 已验证 | 分享文件 5MB，头像 2MB |
| 数据竞争防护 | 已验证 | 临时文件 + 原子重命名 |
| 静态文件隔离 | 已验证 | 仅暴露 `player/` 和 `admin/` |

---

## 路线图

- [ ] 断线自动重连
- [ ] 房间密码修改
- [ ] 踢人功能
- [ ] 通知音效
- [ ] 用户在线状态
- [ ] 消息已读回执
- [ ] 视频画面 emoji 反应
- [ ] 好友系统
- [ ] MongoDB 实际实现
- [ ] Docker Compose 一键部署
- [ ] 视频上传 + HLS 转码

查看 [Open Issues](https://github.com/2047327434/SyncCinema/issues) 了解完整计划。

---

## 贡献

我们欢迎任何形式的贡献！请参阅 [贡献指南](CONTRIBUTING.md)。

---

## 隐私声明

我们重视您的隐私。请参阅 [隐私声明](PRIVACY.md) 了解我们如何收集、使用和保护您的数据。

---

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

---

## 更新日志

<details>
<summary>v2.1.1 — 2026-05-03</summary>

**Bug 修复**

- 修复同步循环：远程事件触发本地事件再 emit 回服务器；引入 `_isRemoteSyncing` 标志阻断循环
- 修复端口占用崩溃：`EADDRINUSE` 未捕获导致进程崩溃，改为优雅退出并提示
- 修复 Bilibili 番剧嵌入：从页面链接改为 `player.bilibili.com` 播放器嵌入链接
- 修复私聊消息送达：服务端同时支持 userId (UUID) 和 username 匹配
- 修复私聊接收匹配：`privateChatTarget.id` 始终为 null，改为同时匹配 username
- 加固静态文件服务：仅暴露 `player/` 和 `admin/` 目录
- 修复 Rate Limit 内存泄漏：增加 60 秒定时清理
- 修复聊天 DOM 内存泄漏：限制 200 条，超出自动删除
- 删除重复的 `saveBlockedKeywordsToStorage` 函数定义
- 新增优雅关闭（SIGTERM/SIGINT）

</details>

<details>
<summary>v2.1.0 — 2026-04-29</summary>

**新增功能**

- JWT 认证替换 adminKey
- 数据库抽象层 (`db.js`) 支持 JSON/MongoDB/PostgreSQL
- 用户私聊功能
- 聊天记录持久化（每房间最近 100 条）
- Token 刷新接口 (`/api/refresh-token`)

</details>

<details>
<summary>v2.0.0 — 2026-04-29</summary>

**新增功能**

- 用户头像与个性签名
- 房间收藏
- 弹幕系统（滚动/顶部/底部 + 关键词屏蔽）
- WebRTC P2P 语音聊天（实验性）
- 屏幕分享
- 播放列表与连续播放
- 定时关闭与休息提醒
- Bilibili 增强（BV/av/ep/ss/短链接 + 登录引导）

**安全加固**

- 全面 XSS 防护、onclick 注入修复、iframe 协议验证
- 管理员认证、IDOR 防护、输入长度限制、频率限制、数据竞争防护

</details>

<details>
<summary>v1.0.0 — 2026-04-27</summary>

初始版本 — 实时视频同步、房间系统、聊天、多视频源支持、表情、文件分享、观看历史、账号系统、管理后台、响应式暗黑 UI。

</details>

---

<div align="center">

用心构建 · **SyncCinema 同步影院**

[报告 Bug](https://github.com/2047327434/SyncCinema/issues) · [功能建议](https://github.com/2047327434/SyncCinema/issues)

</div>
