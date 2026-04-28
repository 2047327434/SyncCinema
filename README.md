> ⚠️ **声明：本项目由 AI 辅助生成**
>
> 本项目的核心代码、文档及架构设计均由 AI（大型语言模型）辅助完成。项目旨在作为学习参考和技术演示，不建议直接用于生产环境。使用者应自行审查代码安全性，并根据实际需求进行调整和优化。

---

# SyncCinema — 同步影院

> 🎬 与远方的朋友一起，同步观看每一帧精彩。

SyncCinema 是一款支持多人实时同步观看视频和在线聊天的 Web 应用。无论你和朋友相隔多远，都能在同一时刻共享观影的快乐。

---

## 功能特性

### 核心功能

| 功能 | 说明 |
|------|------|
| 🎬 **实时视频同步** | 播放、暂停、进度跳转、倍速播放全房间实时同步 |
| 💬 **实时聊天** | 支持文字聊天，保留最近 50 条消息历史 |
| 🔒 **房间管理** | 支持公开/私密房间，私密房间可设置密码 |
| 👥 **多人在线** | 支持多人同时观看，房主离开后自动转让 |
| 📢 **房间公告** | 房主可设置房间公告，全员可见 |

### 视频源支持

| 类型 | 支持格式 | 同步精度 |
|------|---------|---------|
| 📹 **原生视频** | MP4、WebM、OGG、HLS(m3u8) | ⭐⭐⭐ 毫秒级 |
| ▶️ **YouTube** | YouTube 视频链接（iframe 嵌入） | ⭐⭐ 受限于 iframe |
| 📺 **Bilibili** | Bilibili 视频链接（iframe 嵌入） | ⭐⭐ 受限于 iframe |

### 聊天增强

- 😊 **表情支持** — 内置 24 个常用 emoji 表情
- 📎 **文件分享** — 支持图片、视频、文档等文件分享（最大 5MB）
- 🖼️ **图片预览** — 聊天中图片可直接点击查看大图

### 观看历史

- 📜 **自动记录** — 自动记录最近观看的视频和房间（本地存储）
- 🔄 **一键重播** — 从历史记录一键创建房间，快速回到上次观看

### 用户与权限

- 🔐 **账号系统** — 支持用户注册、登录
- 🛡️ **权限控制** — 区分普通用户和管理员角色
- 🚫 **封禁系统** — 管理员可封禁/解封用户账号

### 管理后台

- 👤 **用户管理** — 查看、搜索、删除、封禁/解封用户
- 🏠 **房间管理** — 查看、搜索、强制解散房间
- 📊 **数据统计** — 总用户数、活跃房间数、正常/封禁用户统计

### 跨端适配

- 📱 **响应式设计** — 完美适配手机、平板、桌面端
- 🎨 **暗黑主题** — 专为夜间观影优化的深色界面

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | >= 18 |
| 后端框架 | Express | ^4.18.2 |
| 实时通信 | Socket.io | ^4.7.5 |
| 前端 | 原生 HTML5 / CSS3 / ES6+ | — |
| 数据持久化 | JSON 文件存储 | — |
| 密码加密 | bcryptjs | ^2.4.3 |
| 工具库 | uuid | ^9.0.1 |

---

## 项目结构

```
videotogether/
├── server/                     # 后端服务
│   ├── package.json            # 项目依赖配置
│   ├── server.js               # 主服务器入口
│   └── data/                   # 数据持久化目录
│       ├── users.json          # 用户数据
│       └── rooms.json          # 房间数据
├── admin/                      # 管理后台
│   ├── index.html              # 管理后台页面
│   ├── admin.css               # 管理后台样式
│   └── admin.js                # 管理后台逻辑
├── player/                     # 用户播放端
│   ├── index.html              # 播放页面
│   ├── player.css              # 播放页面样式
│   └── player.js               # 播放页面逻辑
└── README.md                   # 项目说明文档
```

---

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18.0
- npm >= 9.0

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器默认在 `http://localhost:3000` 启动。若端口被占用，会自动尝试 `3001`。

### 3. 访问应用

| 入口 | 地址 | 说明 |
|------|------|------|
| 🎬 播放页面 | http://localhost:3000/player/ | 用户观影、创建/加入房间 |
| 🛠️ 管理后台 | http://localhost:3000/admin/ | 管理员账号登录后使用 |

### 4. 默认管理员账号

```
用户名: admin
密码:   admin123
```

> ⚠️ **首次部署后，请立即修改默认管理员密码。**

---

## 使用指南

### 创建房间

1. 在播放页面注册或登录账号
2. 进入大厅，点击右上角 **「+ 创建房间」**
3. 填写房间名称、粘贴视频链接（可选）
4. 选择公开/私密，设置密码（可选）
5. 点击 **「创建」** 即可开始观影

### 加入房间

1. 在大厅浏览公开房间列表
2. 点击任意房间卡片即可加入
3. 若房间设有密码，输入正确密码后即可进入

### 视频同步说明

| 操作 | 房主行为 | 成员效果 |
|------|---------|---------|
| 播放/暂停 | 点击播放器控制 | 全员视频同步播放/暂停 |
| 拖拽进度 | 拖动进度条 | 全员视频跳转到同一位置 |
| 调整倍速 | 选择播放速度 | 全员视频切换为相同倍速 |
| 加载新视频 | 输入新链接并加载 | 全员播放器切换新视频 |

- **成员**可随时点击 **「同步进度」** 手动校准到房主当前位置
- 系统每秒自动检测进度偏差，超过 **0.3 秒** 时自动校准

### 聊天与互动

- 在右侧聊天面板输入文字，按 **Enter** 发送
- 点击 **😊** 打开表情选择器
- 点击 **📎** 分享本地文件（图片、视频、文档等）
- 聊天记录保留最近 **50 条**，新成员加入时可查看

---

## 视频同步机制详解

### 房主广播事件

房主的操作会实时通过 WebSocket 广播给房间内所有成员：

| 事件 | 触发条件 | 广播内容 |
|------|---------|---------|
| `video-play` | 房主点击播放 | 当前播放时间戳 |
| `video-pause` | 房主点击暂停 | 当前播放时间戳 |
| `video-seek` | 房主拖拽进度条 | 目标播放时间戳 |
| `video-rate-change` | 房主切换倍速 | 新的播放倍速值 |
| `video-timeupdate` | 每秒定时 | 房主当前播放时间（用于校准） |

### 成员端校准策略

1. **事件响应**：收到播放/暂停/跳转事件时，立即执行对应操作
2. **定时校准**：每秒对比本地进度与房主进度，偏差 > 0.3s 时自动 seek
3. **手动校准**：成员可主动点击「同步进度」按钮请求最新状态

---

## API 接口文档

### 用户相关

| 方法 | 路径 | 请求体 | 响应 | 说明 |
|------|------|--------|------|------|
| POST | `/api/register` | `{ username, password }` | `{ success, user }` | 用户注册 |
| POST | `/api/login` | `{ username, password }` | `{ success, user }` | 用户登录 |
| GET | `/api/users` | — | `{ success, users }` | 获取所有用户 |
| DELETE | `/api/users/:id` | — | `{ success, message }` | 删除指定用户 |
| PUT | `/api/users/:id/status` | `{ status }` | `{ success, message }` | 修改用户状态（active/banned） |

### 房间相关

| 方法 | 路径 | 响应 | 说明 |
|------|------|------|------|
| GET | `/api/rooms` | `{ success, rooms }` | 获取所有房间 |
| DELETE | `/api/rooms/:id` | `{ success, message }` | 删除指定房间 |

---

## Socket.io 事件总览

### 客户端 → 服务端

| 事件名 | 参数 | 权限 | 说明 |
|--------|------|------|------|
| `auth` | `{ userId, username }` | 所有用户 | 连接后发送认证信息 |
| `create-room` | `{ name, isPublic, password, videoUrl, username }` | 登录用户 | 创建新房间 |
| `join-room` | `{ roomId, password, username }` | 登录用户 | 加入已有房间 |
| `leave-room` | — | 房间内用户 | 离开当前房间 |
| `get-rooms` | — | 所有用户 | 获取公开房间列表 |
| `video-play` | `{ roomId, currentTime }` | 房主 | 播放视频 |
| `video-pause` | `{ roomId, currentTime }` | 房主 | 暂停视频 |
| `video-seek` | `{ roomId, currentTime }` | 房主 | 跳转进度 |
| `video-rate-change` | `{ roomId, playbackRate }` | 房主 | 调整倍速 |
| `video-timeupdate` | `{ roomId, currentTime }` | 房主 | 每秒同步进度 |
| `request-sync` | `{ roomId }` | 房间内用户 | 请求当前视频状态 |
| `load-video` | `{ roomId, videoUrl }` | 房主 | 加载新视频 |
| `chat-message` | `{ roomId, message, username }` | 房间内用户 | 发送聊天消息 |
| `share-file` | `{ roomId, username, fileName, fileSize, fileType, fileData }` | 房间内用户 | 分享文件 |
| `update-room-settings` | `{ roomId, announcement, isPublic }` | 房主 | 更新房间设置 |

### 服务端 → 客户端

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `room-created` | `{ roomId, room }` | 房间创建成功 |
| `joined-room` | `{ roomId, name, host, videoUrl, videoState, members, messages, announcement }` | 成功加入房间 |
| `join-error` | `{ message }` | 加入房间失败 |
| `user-joined` | `{ username, memberCount }` | 有用户加入 |
| `user-left` | `{ username, memberCount }` | 有用户离开 |
| `host-changed` | `{ newHost }` | 房主变更 |
| `rooms-list` | `[room]` | 公开房间列表 |
| `video-loaded` | `{ videoUrl }` | 新视频已加载 |
| `video-play` | `{ currentTime }` | 播放指令 |
| `video-pause` | `{ currentTime }` | 暂停指令 |
| `video-seek` | `{ currentTime }` | 跳转指令 |
| `video-rate-change` | `{ playbackRate }` | 倍速变更 |
| `video-sync` | `{ currentTime }` | 进度同步（每秒） |
| `video-state` | `{ isPlaying, currentTime, playbackRate }` | 完整视频状态 |
| `chat-message` | `{ id, username, message, timestamp }` | 新聊天消息 |
| `file-shared` | `{ id, username, type, fileName, fileData, timestamp }` | 文件分享消息 |
| `room-settings-updated` | `{ announcement, isPublic }` | 房间设置更新 |

---

## 部署说明

### Docker 部署（推荐）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server/server.js"]
```

构建并运行：

```bash
docker build -t synccinema .
docker run -d -p 3000:3000 --name synccinema synccinema
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务器监听端口 |

### 生产环境建议

1. **数据库替换**：将 JSON 文件存储替换为 MongoDB / PostgreSQL / MySQL
2. **反向代理**：使用 Nginx 做反向代理和 SSL 终端
3. **持久化卷**：将 `server/data/` 目录挂载到宿主机或云存储
4. **修改密码**：首次部署后立即修改默认管理员密码
5. **CORS 配置**：根据实际域名限制 `cors.origin`，不要设为 `*`

---

## 注意事项

1. **视频格式限制**：原生播放器仅支持浏览器原生解码的格式（MP4/H.264、WebM、OGG）
2. **跨域问题**：若视频链接跨域，需视频服务器支持 CORS 头部
3. **YouTube / Bilibili**：通过 iframe 嵌入，受平台限制，无法做到毫秒级同步
4. **文件分享限制**：单个文件最大 5MB，通过 base64 传输，大文件建议用外链
5. **数据安全**：当前使用 JSON 文件存储，无加密，请勿存储敏感信息

---

## 功能路线图

### 已实现 ✅

- [x] 多人实时视频同步（播放/暂停/进度/倍速）
- [x] 房间系统（公开/私密/密码保护）
- [x] 实时文字聊天 + 历史记录
- [x] YouTube / Bilibili 视频源支持
- [x] 表情选择器
- [x] 文件分享（图片/视频/文档）
- [x] 观看历史记录
- [x] 房间公告与设置
- [x] 用户注册/登录/权限管理
- [x] 管理员后台（用户/房间/统计）
- [x] 响应式布局与移动端适配
- [x] 暗黑主题 UI

### 计划开发 📋

- [ ] 用户头像与个性签名
- [ ] 房间收藏功能
- [ ] 弹幕系统（发送/显示/屏蔽）
- [ ] 语音聊天（WebRTC）
- [ ] 屏幕分享
- [ ] 播放列表与连续播放
- [ ] 定时关闭/休息提醒

---

## 开源协议

MIT License

---

<p align="center">
  用 ❤️ 和 🤖 构建 · SyncCinema 同步影院
</p>
