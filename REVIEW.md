# SyncCinema 代码 Review 报告

## 服务端 (server.js)

| 编号 | 级别 | 问题描述 | 位置 |
|------|------|---------|------|
| S1 | 🔴 P0 | API 无管理员权限校验，任何人可删除/封禁任意用户 | DELETE /api/users/:id, PUT /api/users/:id/status |
| S2 | 🔴 P0 | IDOR 漏洞，任何人知道用户 ID 即可修改他人资料/收藏 | PUT /api/users/:id/profile, PUT /api/users/:id/favorites |
| S3 | 🟡 P1 | 无输入长度限制，用户名/密码/公告等字段无校验 | 多处 API |
| S4 | 🟡 P1 | CORS origin 为 `*`，生产环境存在安全风险 | app.use(cors()) |
| S5 | 🟡 P1 | 无 Rate Limiting，接口易被暴力破解/滥用 | 所有 API 端点 |
| S6 | 🟡 P1 | 同步文件读写无并发控制，高并发可能损坏数据 | loadData/saveData |
| S7 | 🟢 P2 | `webrtcPeers` Map 声明后未使用 | 第36行 |
| S8 | 🟢 P2 | 同一用户可重复加入房间，members 列表会重复 | join-room Socket 事件 |
| S9 | 🟢 P2 | share-file 未限制 fileData 大小，可能被滥用发送超大 Base64 | share-file Socket 事件 |

## 客户端 (player.js)

| 编号 | 级别 | 问题描述 | 位置 |
|------|------|---------|------|
| C1 | 🔴 P0 | **XSS - escapeHtml 不转义单引号**，onclick 属性中可被注入 JS | escapeHtml 函数及 renderRooms/renderWatchHistory/renderFavorites |
| C2 | 🔴 P0 | **XSS - fileData 直接放入 onclick="window.open(...)"**，单引号可注入 | addChatMessage |
| C3 | 🔴 P0 | **XSS - iframe src 未验证协议**，用户输入 `javascript:alert(1)` 可能执行 | loadVideo |
| C4 | 🟡 P1 | **XSS - 弹幕 color 未验证**，可注入恶意 CSS | showDanmaku |
| C5 | 🟡 P1 | WebRTC 语音功能不完整，获取麦克风后未建立与其他成员的 P2P 连接 | joinVoiceChat |
| C6 | 🟢 P2 | parseInt 未指定 radix | setTimer |
| C7 | 🟢 P2 | 依赖外部 DiceBear API，网络不可用时报错 | openProfileModal |
| C8 | 🟢 P2 | `rooms.find?.` optional chaining 语法在旧浏览器不兼容 | joinVoiceChat |

## 修复计划

1. 重写 `escapeHtml` 转义单引号
2. 将所有 `onclick` 内联事件替换为 `data-*` + addEventListener
3. 验证 iframe src 协议（仅允许 http/https）
4. 验证弹幕颜色格式
5. 服务端添加管理员权限中间件
6. 服务端修复 IDOR（只能操作自己的资料）
7. 服务端添加输入长度校验
8. 服务端添加 Rate Limiting
9. 服务端添加 share-file 大小限制
10. 添加 Bilibili 登录引导弹窗
