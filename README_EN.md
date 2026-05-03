<div align="center">

# SyncCinema

**Watch Together, Feel Together**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](CONTRIBUTING.md)

**English** | [中文](README.md)

A real-time synchronized video watching platform — play, pause, seek, and chat in perfect sync with friends anywhere in the world.

[Getting Started](#quick-start) · [Features](#features) · [Deploy](#deployment) · [API Docs](#api-reference) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why SyncCinema?

Watching videos alone is fine. Watching together is better. SyncCinema bridges the distance with **millisecond-precise sync**, so everyone sees the same frame at the same time — no "3...2...1...play!" countdowns needed.

| | SyncCinema | Discord Watch Together | Teleparty |
|---|:---:|:---:|:---:|
| Self-hosted | Yes | No | No |
| Native video sync | 0.3s precision | ~1-2s | ~1s |
| Custom video sources | MP4/WebM/HLS/YouTube/Bilibili | YouTube only | Netflix/YouTube/Hulu |
| Danmaku (bullet comments) | Yes | No | No |
| Voice chat (WebRTC P2P) | Yes | Yes | No |
| Open source | MIT | - | - |

---

## Privacy Policy

**Last updated: 2026-05-03**

SyncCinema respects your privacy. Here's how we handle your data.

### Information We Collect

| Data Type | Purpose | Storage |
|-----------|---------|---------|
| Username & password | Account authentication | Server database (password hashed with bcrypt) |
| Avatar & bio | User profile display | Server database |
| Chat messages | Room chat and private messaging | Server database (persistent) |
| Room data | Room creation and management | Server database (auto-deleted when room is empty) |
| Shared files | File sharing in chat | Server database (max 5MB per file) |
| Watch history & favorites | Quick access to previous rooms | Browser localStorage |
| Danmaku blocklist | Keyword filtering preference | Browser localStorage |

### Data Security

- **Passwords** are hashed using bcrypt and never stored in plain text
- **JWT tokens** are used for authentication with configurable expiration (7 days default)
- **Rate limiting** is enforced (60 requests/min per IP) to prevent abuse
- **XSS protection** is applied to all user-generated content
- **File uploads** are limited to 5MB (shared files) and 2MB (avatars)
- **Static file isolation** — only `player/` and `admin/` directories served

### Data We Do NOT Collect

- We do not collect, store, or process any video content you watch
- We do not track your browsing behavior outside our service
- We do not use cookies for advertising or analytics tracking
- We do not share your data with third parties
- We do not access your microphone or camera without explicit permission (WebRTC requires user consent)

### Third-Party Services

SyncCinema may embed YouTube and Bilibili content via iframe. These platforms have their own privacy policies. SyncCinema does not send your personal data to them.

### Data Retention & Deletion

- Room data is automatically deleted when all members leave
- Chat history is retained per room (up to 200 in memory, 100 in persistent storage)
- Account data can be deleted by an administrator upon request
- You can clear your local watch history and favorites from the browser

### Self-Hosted Deployments

If you self-host SyncCinema, you are the data controller. You are responsible for server security, JWT_SECRET/CORS configuration, user data compliance, and backup strategy.

> Full privacy policy (including Chinese version) available at [PRIVACY.md](PRIVACY.md)

---

<h2 id="features">Features</h2>

### Core

- **Real-time video sync** — Play, pause, seek, and playback rate synced across all room members with &lt;0.3s auto-calibration
- **Room system** — Public rooms, password-protected private rooms, auto host-transfer on leave
- **Live chat** — Text messages with emoji picker, file sharing (images/videos/docs up to 5MB), persistent history

### Video Sources

| Source | Formats | Sync Precision |
|--------|---------|---------------|
| Native video | MP4, WebM, OGG, HLS (m3u8) | Millisecond-level |
| YouTube | Video URLs (iframe embed) | Limited by iframe API |
| Bilibili | BV/av, bangumi (ep/ss), b23.tv short links | Limited by iframe API |

### Social & Interaction

- **Danmaku** — Bullet comments with scroll/top/bottom modes and keyword filtering
- **Private messaging** — Click a member's avatar to start a 1-on-1 chat
- **Voice chat** — WebRTC P2P voice calls (experimental)
- **Screen sharing** — Host can share screen to all room members
- **Playlist** — Queue multiple videos with auto-play next
- **Emoji reactions** — Built-in 24 emoji picker for chat

### User System

- **Authentication** — JWT-based registration/login with Bearer token
- **Profiles** — Custom avatar upload, personal bio
- **Room favorites** — Save rooms for quick access
- **Watch history** — Auto-record recent rooms and videos
- **Admin panel** — User management, room management, statistics dashboard

### Quality of Life

- **Responsive design** — Mobile, tablet, and desktop optimized
- **Dark theme** — Designed for comfortable night viewing
- **Auto-close timer** — Set a timer to auto-leave (15/30/45/60/90/120 min or custom)
- **Rest reminder** — 45-minute interval break reminders

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 18 |
| Backend | Express ^4.18 |
| Real-time | Socket.io ^4.7 |
| Auth | JWT (jsonwebtoken ^9.0) |
| Frontend | Vanilla HTML5 / CSS3 / ES6+ |
| Database | JSON file (swappable to MongoDB/PostgreSQL via `db.js`) |
| Encryption | bcryptjs ^2.4 |
| Voice | WebRTC (P2P) |

---

<h2 id="quick-start">Getting Started</h2>

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm >= 9

### Install & Run

```bash
# Clone the repository
git clone https://github.com/2047327434/SyncCinema.git
cd SyncCinema

# Install dependencies
cd server
npm install

# Start the server
npm start
```

Server starts at `http://localhost:3001` by default.

| Entry | URL | Description |
|-------|-----|-------------|
| Player | http://localhost:3001/player/ | Create/join rooms, watch videos |
| Admin | http://localhost:3001/admin/ | User & room management (admin only) |

### Default Admin Account

```
Username: admin
Password: admin123
```

> Change the default password immediately after first deployment.

---

<h2 id="deployment">Deployment</h2>

### Docker (Recommended)

```bash
docker build -t synccinema .
docker run -d -p 3001:3001 \
  -e JWT_SECRET=your-secret-key \
  -e DB_TYPE=json \
  -v synccinema-data:/app/server/data \
  --name synccinema \
  synccinema
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | `synccinema-secret-key-...` | JWT signing key (**must change in production**) |
| `DB_TYPE` | `json` | Database backend: `json` / `mongodb` / `postgresql` |

### Production Checklist

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Switch `DB_TYPE` to MongoDB or PostgreSQL for production workloads
- [ ] Set up Nginx reverse proxy with SSL
- [ ] Mount `server/data/` to a persistent volume
- [ ] Restrict CORS origin to your actual domain
- [ ] Change the default admin password

---

## Project Structure

```
SyncCinema/
├── server/                 # Backend
│   ├── server.js           # Express + Socket.io entry point
│   ├── db.js               # Database abstraction layer
│   ├── package.json        # Dependencies
│   └── data/               # JSON data store (gitignored)
├── admin/                  # Admin dashboard
│   ├── index.html
│   ├── admin.css
│   └── admin.js
├── player/                 # User-facing player
│   ├── index.html
│   ├── player.css
│   └── player.js
├── LICENSE
├── PRIVACY.md              # Privacy Policy
├── CONTRIBUTING.md
└── README.md
```

---

<h2 id="api-reference">API Reference</h2>

### REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/register` | - | Register new user |
| POST | `/api/login` | - | Login, returns JWT token |
| POST | `/api/refresh-token` | JWT | Refresh JWT token |
| GET | `/api/users/me` | JWT | Get current user profile |
| PUT | `/api/users/:id/profile` | JWT | Update profile (own only) |
| PUT | `/api/users/:id/favorites` | JWT | Update favorites (own only) |
| GET | `/api/users` | Admin | List all users |
| DELETE | `/api/users/:id` | Admin | Delete a user |
| PUT | `/api/users/:id/status` | Admin | Ban/unban a user |
| GET | `/api/rooms` | - | List all rooms |
| DELETE | `/api/rooms/:id` | Admin | Delete a room |
| GET | `/api/private-messages/:userId` | JWT | Get private chat history |
| GET | `/api/private-messages/unread/count` | JWT | Get unread message count |

### Socket.io Events

<details>
<summary>Client → Server</summary>

| Event | Params | Role | Description |
|-------|--------|------|-------------|
| `auth` | `{ userId, username, token }` | All | Authenticate connection |
| `create-room` | `{ name, isPublic, password, videoUrl }` | User | Create a room |
| `join-room` | `{ roomId, password }` | User | Join a room |
| `leave-room` | - | Member | Leave current room |
| `video-play` | `{ roomId, currentTime }` | Host | Broadcast play |
| `video-pause` | `{ roomId, currentTime }` | Host | Broadcast pause |
| `video-seek` | `{ roomId, currentTime }` | Host | Broadcast seek |
| `video-rate-change` | `{ roomId, playbackRate }` | Host | Broadcast rate change |
| `video-timeupdate` | `{ roomId, currentTime }` | Host | Periodic sync (1s) |
| `load-video` | `{ roomId, videoUrl }` | Host | Load new video |
| `chat-message` | `{ roomId, message }` | Member | Send chat message |
| `share-file` | `{ roomId, fileName, fileData, ... }` | Member | Share a file |
| `danmaku-send` | `{ roomId, text, color, position }` | Member | Send danmaku |
| `private-message` | `{ toUserId, message }` | User | Send private message |
| `playlist-update` | `{ roomId, playlist }` | Host | Update playlist |
| `update-room-settings` | `{ roomId, announcement, isPublic }` | Host | Update room settings |

</details>

<details>
<summary>Server → Client</summary>

| Event | Params | Description |
|-------|--------|-------------|
| `room-created` | `{ roomId, room }` | Room created successfully |
| `joined-room` | `{ roomId, name, host, videoUrl, videoState, members, messages, ... }` | Joined room successfully |
| `join-error` | `{ message }` | Failed to join |
| `user-joined` | `{ username, memberCount }` | A user joined |
| `user-left` | `{ username, memberCount }` | A user left |
| `host-changed` | `{ newHost }` | Host transferred |
| `rooms-list` | `[room]` | Public room list |
| `video-play` | `{ currentTime }` | Play command |
| `video-pause` | `{ currentTime }` | Pause command |
| `video-seek` | `{ currentTime }` | Seek command |
| `video-rate-change` | `{ playbackRate }` | Rate change command |
| `video-sync` | `{ currentTime }` | Periodic sync |
| `video-state` | `{ isPlaying, currentTime, playbackRate }` | Full video state |
| `video-loaded` | `{ videoUrl }` | New video loaded |
| `chat-message` | `{ id, username, message, timestamp }` | New chat message |
| `file-shared` | `{ id, username, fileName, fileData, ... }` | File shared |
| `danmaku-received` | `{ id, text, color, position }` | Danmaku received |
| `private-message-received` | `{ id, from, message, ... }` | Private message received |

</details>

---

## Security

SyncCinema is built with security in mind:

| Measure | Status | Detail |
|---------|--------|--------|
| XSS Protection | Verified | All output HTML-entity encoded, single quotes escaped |
| onclick Injection | Verified | Replaced with `data-*` + event delegation |
| iframe Protocol Validation | Verified | Only `http://` / `https://` allowed |
| Input Length Limits | Verified | Username, password, messages, announcements all validated |
| Admin Auth | Verified | JWT Token + admin role required for admin APIs |
| IDOR Protection | Verified | Users can only modify their own data |
| Rate Limiting | Verified | 60 requests/min per IP |
| File Size Limits | Verified | Shared files 5MB, avatars 2MB |
| Data Race Protection | Verified | Temp file + atomic rename for writes |
| Static File Isolation | Verified | Only `player/` and `admin/` served |

---

## Roadmap

- [ ] Auto-reconnect on network drop
- [ ] Room password modification
- [ ] Kick member functionality
- [ ] Notification sounds
- [ ] Online status indicators
- [ ] Message read receipts
- [ ] Emoji reactions on video
- [ ] Friend system
- [ ] MongoDB implementation in `db.js`
- [ ] Docker Compose one-click deploy
- [ ] Video upload with HLS transcoding

See the [open issues](https://github.com/2047327434/SyncCinema/issues) for a full list.

---

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

## Changelog

<details>
<summary>v2.1.1 — 2026-05-03</summary>

**Bug Fixes**

- Fixed sync loop: remote events triggering local events re-emitting to server; added `_isRemoteSyncing` flag
- Fixed EADDRINUSE crash: unhandled error on port conflict now gracefully exits with helpful message
- Fixed Bilibili bangumi embed: changed from page URL to `player.bilibili.com` embed URL
- Fixed private chat delivery: server now matches both userId (UUID) and username
- Fixed private chat receive: `privateChatTarget.id` was always null, now matches username too
- Hardened static file serving: only `player/` and `admin/` directories exposed
- Fixed rate limit memory leak: added 60s cleanup interval for expired records
- Fixed chat DOM memory leak: capped at 200 messages, auto-removes oldest
- Removed duplicate `saveBlockedKeywordsToStorage` function definition
- Added graceful shutdown (SIGTERM/SIGINT)

</details>

<details>
<summary>v2.1.0 — 2026-04-29</summary>

**New Features**

- JWT authentication replacing adminKey
- Database abstraction layer (`db.js`) supporting JSON/MongoDB/PostgreSQL
- Private messaging between users
- Persistent chat history (up to 100 messages per room)
- Token refresh endpoint (`/api/refresh-token`)

</details>

<details>
<summary>v2.0.0 — 2026-04-29</summary>

**New Features**

- User avatars and bio
- Room favorites
- Danmaku system (scroll/top/bottom + keyword blocking)
- WebRTC P2P voice chat (experimental)
- Screen sharing
- Playlist with auto-play
- Auto-close timer and rest reminders
- Bilibili enhancement (BV/av/ep/ss/short links + login guide)

**Security Hardening**

- Full XSS protection, onclick injection fix, iframe protocol validation
- Admin auth, IDOR protection, input length limits, rate limiting, data race protection

</details>

<details>
<summary>v1.0.0 — 2026-04-27</summary>

Initial release — real-time video sync, room system, chat, video source support, emoji, file sharing, watch history, accounts, admin dashboard, responsive dark UI.

</details>

---

<div align="center">

Built with passion and code · **SyncCinema**

[Report Bug](https://github.com/2047327434/SyncCinema/issues) · [Request Feature](https://github.com/2047327434/SyncCinema/issues)

</div>
