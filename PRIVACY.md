# Privacy Policy / 隐私声明

---

## English

**Last updated: 2026-05-03**

SyncCinema ("we", "us", or "our") respects your privacy and is committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you use our service.

### Information We Collect

| Data Type | Purpose | Storage |
|-----------|---------|---------|
| Username & password | Account authentication | Server database (password hashed with bcrypt) |
| Avatar & bio | User profile display | Server database |
| Chat messages | Room chat and private messaging | Server database (persistent) |
| Room data | Room creation and management | Server database (auto-deleted when room is empty and host leaves) |
| Shared files | File sharing in chat | Server database (max 5MB per file) |
| Watch history & favorites | Quick access to previous rooms | Browser localStorage |
| Danmaku blocklist | Keyword filtering preference | Browser localStorage |

### How We Use Your Information

- To provide and maintain our service
- To allow you to create rooms and watch videos with others in sync
- To enable real-time chat and interaction features
- To manage your account and preferences

### Data Storage & Security

- **Passwords** are hashed using bcrypt and never stored in plain text
- **JWT tokens** are used for authentication with configurable expiration (7 days default)
- **Data storage** uses JSON files by default; production deployments should use MongoDB or PostgreSQL
- **Rate limiting** is enforced (60 requests/min per IP) to prevent abuse
- **XSS protection** is applied to all user-generated content
- **File uploads** are limited to 5MB (shared files) and 2MB (avatars)

### Data We Do NOT Collect

- We do not collect, store, or process any video content you watch
- We do not track your browsing behavior outside our service
- We do not use cookies for advertising or analytics tracking
- We do not share your data with third parties
- We do not access your microphone or camera without explicit permission (WebRTC voice/screen share requires user consent)

### Third-Party Services

SyncCinema may embed content from:
- **YouTube** — Video playback via iframe embed
- **Bilibili** — Video playback via iframe embed

These services have their own privacy policies. SyncCinema does not send your personal data to these platforms.

### Data Retention & Deletion

- Room data is automatically deleted when all members leave
- Chat history is retained per room (up to 200 messages in memory, 100 in persistent storage)
- Account data can be deleted by an administrator upon request
- You can clear your local watch history and favorites from the browser

### Self-Hosted Deployments

If you self-host SyncCinema, you are the data controller. You are responsible for:
- Securing your server and database
- Configuring JWT_SECRET and CORS settings
- Managing user data according to applicable laws
- Implementing your own backup strategy

### Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date.

### Contact

For privacy-related inquiries, please open an issue at [GitHub Issues](https://github.com/2047327434/SyncCinema/issues).

---

## 中文

**最后更新：2026-05-03**

SyncCinema（以下简称"我们"）尊重您的隐私权，致力于保护您的个人数据。本隐私声明说明我们在您使用服务时如何收集、使用和保护您的信息。

### 我们收集的信息

| 数据类型 | 用途 | 存储位置 |
|---------|------|---------|
| 用户名和密码 | 账号认证 | 服务器数据库（密码使用 bcrypt 加密存储） |
| 头像和个性签名 | 用户资料展示 | 服务器数据库 |
| 聊天消息 | 房间聊天和私聊 | 服务器数据库（持久化存储） |
| 房间数据 | 房间创建和管理 | 服务器数据库（房间无人且房主离开后自动删除） |
| 分享文件 | 聊天中的文件分享 | 服务器数据库（单文件最大 5MB） |
| 观看历史和收藏 | 快速访问之前的房间 | 浏览器 localStorage |
| 弹幕屏蔽词 | 关键词过滤偏好 | 浏览器 localStorage |

### 我们如何使用您的信息

- 提供和维护我们的服务
- 允许您创建房间并与他人同步观看视频
- 实现实时聊天和互动功能
- 管理您的账号和偏好设置

### 数据存储与安全

- **密码**使用 bcrypt 加密存储，绝不保存明文
- **JWT 令牌**用于身份认证，可配置过期时间（默认 7 天）
- **数据存储**默认使用 JSON 文件；生产部署建议使用 MongoDB 或 PostgreSQL
- **请求频率限制**每个 IP 每分钟最多 60 次请求，防止滥用
- **XSS 防护**应用于所有用户生成的内容
- **文件上传**限制为分享文件 5MB、头像 2MB

### 我们不收集的数据

- 我们不收集、存储或处理您观看的任何视频内容
- 我们不跟踪您在服务之外的浏览行为
- 我们不使用 Cookie 进行广告或分析追踪
- 我们不与第三方共享您的数据
- 我们不会在未经您明确许可的情况下访问您的麦克风或摄像头（WebRTC 语音/屏幕分享需要用户主动授权）

### 第三方服务

SyncCinema 可能嵌入以下平台的内容：
- **YouTube** — 通过 iframe 嵌入播放视频
- **Bilibili** — 通过 iframe 嵌入播放视频

这些服务拥有各自的隐私政策。SyncCinema 不会向这些平台发送您的个人数据。

### 数据保留与删除

- 房间数据在所有成员离开后自动删除
- 聊天记录按房间保留（内存中最多 200 条，持久化存储最多 100 条）
- 账号数据可应要求由管理员删除
- 您可以在浏览器中清除本地观看历史和收藏

### 自托管部署

如果您自行部署 SyncCinema，您即数据控制者，需要负责：
- 保护您的服务器和数据库安全
- 配置 JWT_SECRET 和 CORS 设置
- 按照适用法律管理用户数据
- 实施您自己的备份策略

### 政策变更

我们可能会不时更新本隐私声明。变更将反映在"最后更新"日期中。

### 联系方式

如有隐私相关问题，请在 [GitHub Issues](https://github.com/2047327434/SyncCinema/issues) 提交。
