const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { db, JWT_SECRET } = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// 内存中的房间数据（用于实时状态，会从 db 加载）
let rooms = [];
let socketToUser = new Map();
let socketToRoom = new Map();

// Rate Limiting
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimits.get(ip);
    if (!record || now > record.resetTime) {
        rateLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (record.count >= RATE_LIMIT_MAX) return false;
    record.count++;
    return true;
}

// 输入验证
function validateUsername(username) {
    if (typeof username !== 'string') return false;
    if (username.length < 2 || username.length > 20) return false;
    return /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username);
}

function validatePassword(password) {
    if (typeof password !== 'string') return false;
    return password.length >= 4 && password.length <= 100;
}

function sanitizeString(str, maxLength = 500) {
    if (typeof str !== 'string') return '';
    return str.slice(0, maxLength).replace(/[<>]/g, '');
}

function isValidHttpUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// ===== JWT 中间件 =====

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ success: false, message: '未提供访问令牌' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
    }
    next();
}

// 生成 JWT Token
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// ===== Express 中间件 =====

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
    }
    next();
});

// ===== 初始化 =====

async function initDefaultAdmin() {
    const adminExists = await db.findOne('users', { username: 'admin' });
    if (!adminExists) {
        const adminUser = {
            id: uuidv4(),
            username: 'admin',
            password: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            status: 'active',
            avatar: null,
            bio: '',
            favorites: [],
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        await db.insert('users', adminUser);
        console.log('默认管理员账号已创建: admin / admin123');
    }
}

async function loadRoomsFromDB() {
    rooms = await db.find('rooms', {});
    // 清理已不存在的 socket 成员
    rooms.forEach(room => {
        if (!room.members) room.members = [];
        if (!room.messages) room.messages = [];
        if (!room.playlist) room.playlist = [];
    });
}

// ===== API 路由 =====

// 用户注册
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!validateUsername(username)) {
        return res.status(400).json({ success: false, message: '用户名只能包含字母、数字、下划线和中文，长度2-20' });
    }
    if (!validatePassword(password)) {
        return res.status(400).json({ success: false, message: '密码长度至少4位' });
    }

    const existing = await db.findOne('users', { username });
    if (existing) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: uuidv4(),
        username,
        password: hashedPassword,
        role: 'user',
        status: 'active',
        avatar: null,
        bio: '',
        favorites: [],
        createdAt: new Date().toISOString(),
        lastLogin: null
    };

    await db.insert('users', newUser);

    res.json({ success: true, message: '注册成功', user: { id: newUser.id, username: newUser.username } });
});

// 用户登录（返回 JWT Token）
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await db.findOne('users', { username });
    if (!user) {
        return res.status(400).json({ success: false, message: '用户不存在' });
    }

    if (user.status === 'banned') {
        return res.status(403).json({ success: false, message: '账号已被封禁' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return res.status(400).json({ success: false, message: '密码错误' });
    }

    user.lastLogin = new Date().toISOString();
    await db.updateById('users', user.id, { lastLogin: user.lastLogin });

    const token = generateToken(user);

    res.json({
        success: true,
        token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            avatar: user.avatar,
            bio: user.bio,
            favorites: user.favorites || []
        }
    });
});

// 刷新 Token
app.post('/api/refresh-token', authenticateToken, async (req, res) => {
    const user = await db.findById('users', req.user.id);
    if (!user || user.status === 'banned') {
        return res.status(403).json({ success: false, message: '用户不存在或已被封禁' });
    }
    const token = generateToken(user);
    res.json({ success: true, token });
});

// 获取当前用户信息（需要 JWT）
app.get('/api/users/me', authenticateToken, async (req, res) => {
    const user = await db.findById('users', req.user.id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            avatar: user.avatar,
            bio: user.bio,
            favorites: user.favorites || []
        }
    });
});

// 更新用户资料（只能修改自己的资料）
app.put('/api/users/:id/profile', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { avatar, bio } = req.body;

    // 只能修改自己的资料
    if (req.user.id !== id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '无权修改他人资料' });
    }

    if (avatar && typeof avatar === 'string' && avatar.length > 3 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: '头像大小不能超过 3MB' });
    }

    const user = await db.findById('users', id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const updates = {};
    if (avatar !== undefined) updates.avatar = avatar;
    if (bio !== undefined) updates.bio = sanitizeString(bio, 200);

    await db.updateById('users', id, updates);
    res.json({ success: true, message: '资料已更新', user: { id, ...updates } });
});

// 更新用户收藏
app.put('/api/users/:id/favorites', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { favorites } = req.body;

    if (req.user.id !== id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '无权修改他人收藏' });
    }

    const user = await db.findById('users', id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    if (!Array.isArray(favorites)) {
        return res.status(400).json({ success: false, message: '收藏格式错误' });
    }

    await db.updateById('users', id, { favorites: favorites.slice(0, 100) });
    res.json({ success: true, message: '收藏已更新', favorites: favorites.slice(0, 100) });
});

// ===== 管理员 API（全部需要 JWT + admin 角色）=====

// 获取所有用户
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const allUsers = await db.find('users', {});
    const userList = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        avatar: u.avatar,
        bio: u.bio,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
    }));
    res.json({ success: true, users: userList });
});

// 删除用户
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const user = await db.findById('users', id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    await db.deleteById('users', id);
    res.json({ success: true, message: '用户已删除' });
});

// 封禁/解封用户
app.put('/api/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'banned'].includes(status)) {
        return res.status(400).json({ success: false, message: '无效的状态值' });
    }

    const user = await db.findById('users', id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    await db.updateById('users', id, { status });
    res.json({ success: true, message: `用户已${status === 'banned' ? '封禁' : '解封'}` });
});

// 获取所有房间
app.get('/api/rooms', async (req, res) => {
    const roomList = rooms.map(r => ({
        id: r.id,
        name: r.name,
        host: r.host,
        isPublic: r.isPublic,
        memberCount: r.members ? r.members.length : 0,
        videoUrl: r.videoUrl,
        createdAt: r.createdAt
    }));
    res.json({ success: true, rooms: roomList });
});

// 删除房间（管理员）
app.delete('/api/rooms/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const index = rooms.findIndex(r => r.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: '房间不存在' });
    }
    rooms.splice(index, 1);
    await db.deleteById('rooms', id);
    res.json({ success: true, message: '房间已删除' });
});

// ===== 私聊 API =====

// 获取私聊历史
app.get('/api/private-messages/:userId', authenticateToken, async (req, res) => {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const messages = await db.find('privateMessages', {}, { sort: { timestamp: 1 } });

    // 筛选两人之间的消息
    const filtered = messages.filter(m =>
        (m.from === currentUserId && m.to === otherUserId) ||
        (m.from === otherUserId && m.to === currentUserId)
    ).slice(-200);

    // 标记对方发来的消息为已读
    await db.update('privateMessages',
        { from: otherUserId, to: currentUserId, read: false },
        { $set: { read: true } }
    );

    res.json({ success: true, messages: filtered });
});

// 获取未读私聊数量
app.get('/api/private-messages/unread/count', authenticateToken, async (req, res) => {
    const allMessages = await db.find('privateMessages', { to: req.user.id, read: false });
    res.json({ success: true, count: allMessages.length });
});

// ===== Socket.io 事件 =====

io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);

    // 用户认证（支持 token）
    socket.on('auth', ({ userId, username, token }) => {
        if (typeof username !== 'string' || username.length > 50) return;
        // 如果提供了 token，验证其有效性
        let role = 'user';
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                role = decoded.role || 'user';
            } catch {
                // token 无效但不阻止连接
            }
        }
        socketToUser.set(socket.id, { userId, username, role, roomId: null });
        console.log(`用户认证: ${username} (${userId})`);
    });

    // 创建房间
    socket.on('create-room', ({ name, isPublic, password, videoUrl, username }) => {
        if (typeof name !== 'string') name = '';
        if (typeof username !== 'string' || username.length > 50) return;

        const roomId = uuidv4();
        const room = {
            id: roomId,
            name: sanitizeString(name, 50) || `房间 ${rooms.length + 1}`,
            host: username,
            hostSocketId: socket.id,
            isPublic: isPublic !== false,
            password: (typeof password === 'string' && password.length <= 50) ? password : null,
            videoUrl: (typeof videoUrl === 'string' && videoUrl.length <= 2000) ? videoUrl : null,
            announcement: '',
            danmakuEnabled: true,
            members: [{ socketId: socket.id, username }],
            messages: [],
            playlist: [],
            currentPlaylistIndex: -1,
            videoState: {
                isPlaying: false,
                currentTime: 0,
                playbackRate: 1,
                lastUpdate: Date.now()
            },
            createdAt: new Date().toISOString()
        };

        rooms.push(room);
        socket.join(roomId);
        socketToRoom.set(socket.id, roomId);

        const userInfo = socketToUser.get(socket.id);
        if (userInfo) userInfo.roomId = roomId;

        socket.emit('room-created', {
            roomId,
            room: {
                id: room.id,
                name: room.name,
                host: room.host,
                isPublic: room.isPublic,
                videoUrl: room.videoUrl,
                announcement: room.announcement,
                danmakuEnabled: room.danmakuEnabled,
                playlist: room.playlist,
                currentPlaylistIndex: room.currentPlaylistIndex
            }
        });

        console.log(`房间创建: ${room.name} (${roomId}) by ${username}`);
    });

    // 获取房间列表
    socket.on('get-rooms', () => {
        const publicRooms = rooms
            .filter(r => r.isPublic)
            .map(r => ({
                id: r.id,
                name: r.name,
                host: r.host,
                memberCount: r.members ? r.members.length : 0,
                hasPassword: !!r.password,
                videoUrl: r.videoUrl
            }));
        socket.emit('rooms-list', publicRooms);
    });

    // 加入房间
    socket.on('join-room', async ({ roomId, password, username }) => {
        const room = rooms.find(r => r.id === roomId);
        if (!room) {
            return socket.emit('join-error', { message: '房间不存在' });
        }

        if (room.password && room.password !== password) {
            return socket.emit('join-error', { message: '房间密码错误' });
        }

        if (room.members.some(m => m.socketId === socket.id)) {
            return socket.emit('join-error', { message: '你已经在房间中了' });
        }

        socket.join(roomId);
        socketToRoom.set(socket.id, roomId);

        const userInfo = socketToUser.get(socket.id);
        if (userInfo) userInfo.roomId = roomId;

        room.members.push({ socketId: socket.id, username });

        // 从持久化存储加载历史消息（最近 100 条）
        let historyMessages = [];
        try {
            const stored = await db.find('messages', { roomId }, { sort: { timestamp: 1 } });
            historyMessages = stored.slice(-100);
        } catch (e) {
            console.error('加载历史消息失败:', e);
        }

        // 合并内存中的最新消息和持久化消息
        const allMessages = [...historyMessages, ...room.messages.slice(-50)];
        // 去重（根据 id）
        const seen = new Set();
        const uniqueMessages = [];
        for (const msg of allMessages) {
            if (!seen.has(msg.id)) {
                seen.add(msg.id);
                uniqueMessages.push(msg);
            }
        }

        socket.emit('joined-room', {
            roomId: room.id,
            name: room.name,
            host: room.host,
            videoUrl: room.videoUrl,
            videoState: room.videoState,
            members: room.members.map(m => m.username),
            messages: uniqueMessages.slice(-100),
            announcement: room.announcement,
            isPublic: room.isPublic,
            danmakuEnabled: room.danmakuEnabled,
            playlist: room.playlist,
            currentPlaylistIndex: room.currentPlaylistIndex
        });

        socket.to(roomId).emit('user-joined', { username, memberCount: room.members.length });

        await db.updateById('rooms', roomId, room);
        console.log(`用户加入: ${username} -> ${room.name}`);
    });

    // 离开房间
    socket.on('leave-room', async () => {
        const roomId = socketToRoom.get(socket.id);
        if (roomId) {
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                room.members = room.members.filter(m => m.socketId !== socket.id);

                if (room.hostSocketId === socket.id) {
                    if (room.members.length > 0) {
                        room.hostSocketId = room.members[0].socketId;
                        room.host = room.members[0].username;
                        io.to(roomId).emit('host-changed', { newHost: room.host });
                    } else {
                        const index = rooms.findIndex(r => r.id === roomId);
                        if (index !== -1) rooms.splice(index, 1);
                        await db.deleteById('rooms', roomId);
                    }
                }

                socket.to(roomId).emit('user-left', {
                    username: socketToUser.get(socket.id)?.username,
                    memberCount: room.members.length
                });

                await db.updateById('rooms', roomId, room);
            }
            socket.leave(roomId);
            socketToRoom.delete(socket.id);
        }
    });

    // 视频同步
    socket.on('video-play', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.isPlaying = true;
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            socket.to(roomId).emit('video-play', { currentTime });
        }
    });

    socket.on('video-pause', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.isPlaying = false;
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            socket.to(roomId).emit('video-pause', { currentTime });
        }
    });

    socket.on('video-seek', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            socket.to(roomId).emit('video-seek', { currentTime });
        }
    });

    socket.on('video-rate-change', ({ roomId, playbackRate }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.playbackRate = playbackRate;
            socket.to(roomId).emit('video-rate-change', { playbackRate });
        }
    });

    socket.on('video-timeupdate', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            socket.to(roomId).emit('video-sync', { currentTime });
        }
    });

    socket.on('request-sync', ({ roomId }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) socket.emit('video-state', room.videoState);
    });

    // 聊天消息（持久化到 messages 集合）
    socket.on('chat-message', async ({ roomId, message, username }) => {
        if (typeof message !== 'string' || message.length > 1000) return;
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const chatMessage = {
                id: uuidv4(),
                roomId,
                username,
                message: sanitizeString(message, 1000),
                timestamp: new Date().toISOString()
            };

            room.messages.push(chatMessage);
            if (room.messages.length > 200) {
                room.messages = room.messages.slice(-200);
            }

            // 持久化到数据库
            await db.insert('messages', chatMessage);

            io.to(roomId).emit('chat-message', chatMessage);
        }
    });

    // 弹幕
    socket.on('danmaku-send', ({ roomId, text, color, position, username }) => {
        if (typeof text !== 'string' || text.length > 100) return;
        const room = rooms.find(r => r.id === roomId);
        if (room && room.danmakuEnabled !== false) {
            const validColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#ffffff';
            const validPosition = ['scroll', 'top', 'bottom'].includes(position) ? position : 'scroll';
            const danmaku = {
                id: uuidv4(),
                username,
                text: sanitizeString(text, 100),
                color: validColor,
                position: validPosition,
                timestamp: new Date().toISOString()
            };
            io.to(roomId).emit('danmaku-received', danmaku);
        }
    });

    // 加载视频
    socket.on('load-video', ({ roomId, videoUrl }) => {
        if (typeof videoUrl !== 'string' || videoUrl.length > 2000) return;
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            room.videoUrl = videoUrl;
            room.videoState = {
                isPlaying: false,
                currentTime: 0,
                playbackRate: 1,
                lastUpdate: Date.now()
            };
            io.to(roomId).emit('video-loaded', { videoUrl });
        }
    });

    // 播放列表
    socket.on('playlist-update', ({ roomId, playlist }) => {
        if (!Array.isArray(playlist) || playlist.length > 100) return;
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            room.playlist = playlist;
            io.to(roomId).emit('playlist-updated', { playlist });
        }
    });

    socket.on('playlist-next', ({ roomId }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            if (room.currentPlaylistIndex < room.playlist.length - 1) {
                room.currentPlaylistIndex++;
                const nextVideo = room.playlist[room.currentPlaylistIndex];
                room.videoUrl = nextVideo.url;
                room.videoState = {
                    isPlaying: true,
                    currentTime: 0,
                    playbackRate: 1,
                    lastUpdate: Date.now()
                };
                io.to(roomId).emit('playlist-play', {
                    index: room.currentPlaylistIndex,
                    videoUrl: nextVideo.url
                });
            }
        }
    });

    socket.on('playlist-play-index', ({ roomId, index }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id && room.playlist[index]) {
            room.currentPlaylistIndex = index;
            room.videoUrl = room.playlist[index].url;
            room.videoState = {
                isPlaying: true,
                currentTime: 0,
                playbackRate: 1,
                lastUpdate: Date.now()
            };
            io.to(roomId).emit('playlist-play', { index, videoUrl: room.playlist[index].url });
        }
    });

    // 更新房间设置
    socket.on('update-room-settings', ({ roomId, announcement, isPublic, danmakuEnabled }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            if (announcement !== undefined) room.announcement = sanitizeString(announcement, 500);
            if (isPublic !== undefined) room.isPublic = !!isPublic;
            if (danmakuEnabled !== undefined) room.danmakuEnabled = !!danmakuEnabled;
            io.to(roomId).emit('room-settings-updated', {
                announcement: room.announcement,
                isPublic: room.isPublic,
                danmakuEnabled: room.danmakuEnabled
            });
        }
    });

    // 文件分享
    socket.on('share-file', ({ roomId, username, fileName, fileSize, fileType, fileData }) => {
        if (typeof fileData !== 'string' || fileData.length > 7 * 1024 * 1024) {
            return socket.emit('share-error', { message: '文件大小不能超过 5MB' });
        }
        if (typeof fileName !== 'string' || fileName.length > 200) return;

        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const fileMessage = {
                id: uuidv4(),
                roomId,
                username,
                type: 'file',
                fileName: sanitizeString(fileName, 200),
                fileSize: typeof fileSize === 'number' ? fileSize : 0,
                fileType: typeof fileType === 'string' ? fileType.slice(0, 100) : '',
                fileData,
                timestamp: new Date().toISOString()
            };

            room.messages.push(fileMessage);
            if (room.messages.length > 200) {
                room.messages = room.messages.slice(-200);
            }

            // 持久化到数据库
            db.insert('messages', fileMessage).catch(e => console.error('保存文件消息失败:', e));

            io.to(roomId).emit('file-shared', fileMessage);
        }
    });

    // ===== WebRTC 信令 =====
    socket.on('webrtc-offer', ({ targetId, offer }) => {
        if (typeof targetId !== 'string' || typeof offer !== 'object') return;
        io.to(targetId).emit('webrtc-offer', { senderId: socket.id, offer });
    });

    socket.on('webrtc-answer', ({ targetId, answer }) => {
        if (typeof targetId !== 'string' || typeof answer !== 'object') return;
        io.to(targetId).emit('webrtc-answer', { senderId: socket.id, answer });
    });

    socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
        if (typeof targetId !== 'string' || typeof candidate !== 'object') return;
        io.to(targetId).emit('webrtc-ice-candidate', { senderId: socket.id, candidate });
    });

    // 屏幕分享
    socket.on('screen-share-started', ({ roomId }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            socket.to(roomId).emit('screen-share-started', {
                username: socketToUser.get(socket.id)?.username
            });
        }
    });

    socket.on('screen-share-stopped', ({ roomId }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) socket.to(roomId).emit('screen-share-stopped');
    });

    // ===== 私聊功能 =====
    socket.on('private-message', async ({ toUserId, message, fromUsername }) => {
        const fromUser = socketToUser.get(socket.id);
        if (!fromUser) return;
        if (typeof message !== 'string' || message.length > 1000) return;

        const privateMessage = {
            id: uuidv4(),
            from: fromUser.userId,
            to: toUserId,
            fromUsername,
            message: sanitizeString(message, 1000),
            timestamp: new Date().toISOString(),
            read: false
        };

        // 持久化
        await db.insert('privateMessages', privateMessage);

        // 通知接收者（如果在线）
        for (const [socketId, userInfo] of socketToUser.entries()) {
            if (userInfo.userId === toUserId) {
                io.to(socketId).emit('private-message-received', privateMessage);
            }
        }

        // 回执给发送者
        socket.emit('private-message-sent', privateMessage);
    });

    // 标记私聊已读
    socket.on('private-message-read', async ({ fromUserId }) => {
        const currentUser = socketToUser.get(socket.id);
        if (!currentUser) return;
        await db.update('privateMessages',
            { from: fromUserId, to: currentUser.userId, read: false },
            { $set: { read: true } }
        );
    });

    // 断开连接
    socket.on('disconnect', async () => {
        const roomId = socketToRoom.get(socket.id);
        if (roomId) {
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                const userInfo = socketToUser.get(socket.id);
                room.members = room.members.filter(m => m.socketId !== socket.id);

                if (room.hostSocketId === socket.id) {
                    if (room.members.length > 0) {
                        room.hostSocketId = room.members[0].socketId;
                        room.host = room.members[0].username;
                        io.to(roomId).emit('host-changed', { newHost: room.host });
                    } else {
                        const index = rooms.findIndex(r => r.id === roomId);
                        if (index !== -1) rooms.splice(index, 1);
                        await db.deleteById('rooms', roomId);
                    }
                }

                socket.to(roomId).emit('user-left', {
                    username: userInfo?.username,
                    memberCount: room.members.length
                });

                await db.updateById('rooms', roomId, room);
            }
            socket.leave(roomId);
            socketToRoom.delete(socket.id);
        }

        socketToUser.delete(socket.id);
        console.log('用户断开连接:', socket.id);
    });
});

// 定期保存房间数据到数据库（每 30 秒）
setInterval(async () => {
    for (const room of rooms) {
        const exists = await db.findById('rooms', room.id);
        if (exists) {
            await db.updateById('rooms', room.id, room);
        } else {
            await db.insert('rooms', room);
        }
    }
}, 30000);

// 启动服务器
server.listen(PORT, async () => {
    await initDefaultAdmin();
    await loadRoomsFromDB();
    console.log(`SyncCinema 服务器运行在端口 ${PORT}`);
    console.log(`管理后台: http://localhost:${PORT}/admin/`);
    console.log(`播放页面: http://localhost:${PORT}/player/`);
});
