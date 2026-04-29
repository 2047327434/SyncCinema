const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 数据存储
let users = [];
let rooms = [];
let socketToUser = new Map();
let socketToRoom = new Map();

// 简单内存 Rate Limiting
const rateLimits = new Map(); // ip -> { count, resetTime }
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
const RATE_LIMIT_MAX = 60; // 每分钟最多60次请求

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimits.get(ip);
    if (!record || now > record.resetTime) {
        rateLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }
    record.count++;
    return true;
}

// 加载数据
function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
        if (fs.existsSync(ROOMS_FILE)) {
            rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        users = [];
        rooms = [];
    }
}

// 保存数据（使用临时文件避免写入中断导致数据损坏）
function saveData() {
    try {
        const usersTemp = USERS_FILE + '.tmp';
        const roomsTemp = ROOMS_FILE + '.tmp';
        fs.writeFileSync(usersTemp, JSON.stringify(users, null, 2));
        fs.writeFileSync(roomsTemp, JSON.stringify(rooms, null, 2));
        fs.renameSync(usersTemp, USERS_FILE);
        fs.renameSync(roomsTemp, ROOMS_FILE);
    } catch (error) {
        console.error('保存数据失败:', error);
    }
}

// 初始化默认管理员账号
function initDefaultAdmin() {
    const adminExists = users.find(u => u.username === 'admin');
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
        users.push(adminUser);
        saveData();
        console.log('默认管理员账号已创建: admin / admin123');
    }
}

// 输入验证函数
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

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

// Rate Limiting 中间件
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
    }
    next();
});

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

    if (users.find(u => u.username === username)) {
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

    users.push(newUser);
    saveData();

    res.json({ success: true, message: '注册成功', user: { id: newUser.id, username: newUser.username } });
});

// 用户登录
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
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
    saveData();

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

// 获取用户信息
app.get('/api/users/me', (req, res) => {
    const { userId } = req.query;
    const user = users.find(u => u.id === userId);
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
app.put('/api/users/:id/profile', (req, res) => {
    const { id } = req.params;
    const { avatar, bio } = req.body;
    // 简化版： trusting client-provided user identity for now; in production use JWT/session
    // 但至少验证 avatar 大小
    if (avatar && typeof avatar === 'string' && avatar.length > 3 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: '头像大小不能超过 3MB' });
    }

    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    if (avatar !== undefined) user.avatar = avatar;
    if (bio !== undefined) user.bio = sanitizeString(bio, 200);

    saveData();
    res.json({ success: true, message: '资料已更新', user: { id: user.id, avatar: user.avatar, bio: user.bio } });
});

// 更新用户收藏（只能修改自己的收藏）
app.put('/api/users/:id/favorites', (req, res) => {
    const { id } = req.params;
    const { favorites } = req.body;

    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    if (!Array.isArray(favorites)) {
        return res.status(400).json({ success: false, message: '收藏格式错误' });
    }
    // 限制收藏数量
    user.favorites = favorites.slice(0, 100);
    saveData();
    res.json({ success: true, message: '收藏已更新', favorites: user.favorites });
});

// 获取所有用户（管理员接口 - 添加简单校验）
app.get('/api/users', (req, res) => {
    const { adminKey } = req.query;
    // 简化版管理员校验：通过 adminKey 参数（实际生产环境应使用 JWT/session）
    if (adminKey !== 'admin123') {
        return res.status(403).json({ success: false, message: '无权限访问' });
    }
    const userList = users.map(u => ({
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

// 删除用户（管理员接口）
app.delete('/api/users/:id', (req, res) => {
    const { adminKey } = req.query;
    if (adminKey !== 'admin123') {
        return res.status(403).json({ success: false, message: '无权限访问' });
    }
    const { id } = req.params;
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    users.splice(index, 1);
    saveData();
    res.json({ success: true, message: '用户已删除' });
});

// 封禁/解封用户（管理员接口）
app.put('/api/users/:id/status', (req, res) => {
    const { adminKey } = req.query;
    if (adminKey !== 'admin123') {
        return res.status(403).json({ success: false, message: '无权限访问' });
    }
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'banned'].includes(status)) {
        return res.status(400).json({ success: false, message: '无效的状态值' });
    }

    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    user.status = status;
    saveData();
    res.json({ success: true, message: `用户已${status === 'banned' ? '封禁' : '解封'}` });
});

// 获取所有房间
app.get('/api/rooms', (req, res) => {
    const roomList = rooms.map(r => ({
        id: r.id,
        name: r.name,
        host: r.host,
        isPublic: r.isPublic,
        memberCount: r.members.length,
        videoUrl: r.videoUrl,
        createdAt: r.createdAt
    }));
    res.json({ success: true, rooms: roomList });
});

// 删除房间（管理员接口）
app.delete('/api/rooms/:id', (req, res) => {
    const { adminKey } = req.query;
    if (adminKey !== 'admin123') {
        return res.status(403).json({ success: false, message: '无权限访问' });
    }
    const { id } = req.params;
    const index = rooms.findIndex(r => r.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: '房间不存在' });
    }

    rooms.splice(index, 1);
    saveData();
    res.json({ success: true, message: '房间已删除' });
});

// ===== Socket.io 事件处理 =====

io.on('connection', (socket) => {
    console.log('用户连接:', socket.id);

    // 用户认证
    socket.on('auth', ({ userId, username }) => {
        if (typeof username !== 'string' || username.length > 50) return;
        socketToUser.set(socket.id, { userId, username, roomId: null });
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
        if (userInfo) {
            userInfo.roomId = roomId;
        }

        saveData();

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
                memberCount: r.members.length,
                hasPassword: !!r.password,
                videoUrl: r.videoUrl
            }));
        socket.emit('rooms-list', publicRooms);
    });

    // 加入房间
    socket.on('join-room', ({ roomId, password, username }) => {
        const room = rooms.find(r => r.id === roomId);
        if (!room) {
            return socket.emit('join-error', { message: '房间不存在' });
        }

        if (room.password && room.password !== password) {
            return socket.emit('join-error', { message: '房间密码错误' });
        }

        // 防止重复加入
        if (room.members.some(m => m.socketId === socket.id)) {
            return socket.emit('join-error', { message: '你已经在房间中了' });
        }

        socket.join(roomId);
        socketToRoom.set(socket.id, roomId);

        const userInfo = socketToUser.get(socket.id);
        if (userInfo) {
            userInfo.roomId = roomId;
        }

        room.members.push({ socketId: socket.id, username });

        socket.emit('joined-room', {
            roomId: room.id,
            name: room.name,
            host: room.host,
            videoUrl: room.videoUrl,
            videoState: room.videoState,
            members: room.members.map(m => m.username),
            messages: room.messages.slice(-50),
            announcement: room.announcement,
            isPublic: room.isPublic,
            danmakuEnabled: room.danmakuEnabled,
            playlist: room.playlist,
            currentPlaylistIndex: room.currentPlaylistIndex
        });

        socket.to(roomId).emit('user-joined', { username, memberCount: room.members.length });

        saveData();
        console.log(`用户加入: ${username} -> ${room.name}`);
    });

    // 离开房间
    socket.on('leave-room', () => {
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
                        if (index !== -1) {
                            rooms.splice(index, 1);
                        }
                    }
                }

                socket.to(roomId).emit('user-left', {
                    username: socketToUser.get(socket.id)?.username,
                    memberCount: room.members.length
                });

                saveData();
            }
            socket.leave(roomId);
            socketToRoom.delete(socket.id);
        }
    });

    // 视频同步事件
    socket.on('video-play', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.isPlaying = true;
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            saveData();
            socket.to(roomId).emit('video-play', { currentTime });
        }
    });

    socket.on('video-pause', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.isPlaying = false;
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            saveData();
            socket.to(roomId).emit('video-pause', { currentTime });
        }
    });

    socket.on('video-seek', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            saveData();
            socket.to(roomId).emit('video-seek', { currentTime });
        }
    });

    socket.on('video-rate-change', ({ roomId, playbackRate }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.videoState.playbackRate = playbackRate;
            saveData();
            socket.to(roomId).emit('video-rate-change', { playbackRate });
        }
    });

    // 定期同步视频进度（每秒）
    socket.on('video-timeupdate', ({ roomId, currentTime }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            room.videoState.currentTime = currentTime;
            room.videoState.lastUpdate = Date.now();
            socket.to(roomId).emit('video-sync', { currentTime });
        }
    });

    // 请求同步（新成员加入时）
    socket.on('request-sync', ({ roomId }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            socket.emit('video-state', room.videoState);
        }
    });

    // 聊天消息
    socket.on('chat-message', ({ roomId, message, username }) => {
        if (typeof message !== 'string' || message.length > 1000) return;
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const chatMessage = {
                id: uuidv4(),
                username,
                message: sanitizeString(message, 1000),
                timestamp: new Date().toISOString()
            };

            room.messages.push(chatMessage);
            if (room.messages.length > 200) {
                room.messages = room.messages.slice(-200);
            }

            saveData();
            io.to(roomId).emit('chat-message', chatMessage);
        }
    });

    // 弹幕
    socket.on('danmaku-send', ({ roomId, text, color, position, username }) => {
        if (typeof text !== 'string' || text.length > 100) return;
        const room = rooms.find(r => r.id === roomId);
        if (room && room.danmakuEnabled !== false) {
            // 验证颜色格式
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
            saveData();
            io.to(roomId).emit('video-loaded', { videoUrl });
        }
    });

    // 播放列表
    socket.on('playlist-update', ({ roomId, playlist }) => {
        if (!Array.isArray(playlist) || playlist.length > 100) return;
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            room.playlist = playlist;
            saveData();
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
                saveData();
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
            saveData();
            io.to(roomId).emit('playlist-play', {
                index,
                videoUrl: room.playlist[index].url
            });
        }
    });

    // 更新房间设置
    socket.on('update-room-settings', ({ roomId, announcement, isPublic, danmakuEnabled }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            if (announcement !== undefined) {
                room.announcement = sanitizeString(announcement, 500);
            }
            if (isPublic !== undefined) {
                room.isPublic = !!isPublic;
            }
            if (danmakuEnabled !== undefined) {
                room.danmakuEnabled = !!danmakuEnabled;
            }
            saveData();
            io.to(roomId).emit('room-settings-updated', {
                announcement: room.announcement,
                isPublic: room.isPublic,
                danmakuEnabled: room.danmakuEnabled
            });
        }
    });

    // 文件分享
    socket.on('share-file', ({ roomId, username, fileName, fileSize, fileType, fileData }) => {
        // 限制文件大小（Base64 约 5MB 实际数据 ≈ 6.7MB Base64 字符串）
        if (typeof fileData !== 'string' || fileData.length > 7 * 1024 * 1024) {
            return socket.emit('share-error', { message: '文件大小不能超过 5MB' });
        }
        if (typeof fileName !== 'string' || fileName.length > 200) return;

        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const fileMessage = {
                id: uuidv4(),
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

            saveData();
            io.to(roomId).emit('file-shared', fileMessage);
        }
    });

    // ===== WebRTC 信令 =====

    socket.on('webrtc-offer', ({ targetId, offer }) => {
        if (typeof targetId !== 'string' || typeof offer !== 'object') return;
        io.to(targetId).emit('webrtc-offer', {
            senderId: socket.id,
            offer
        });
    });

    socket.on('webrtc-answer', ({ targetId, answer }) => {
        if (typeof targetId !== 'string' || typeof answer !== 'object') return;
        io.to(targetId).emit('webrtc-answer', {
            senderId: socket.id,
            answer
        });
    });

    socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
        if (typeof targetId !== 'string' || typeof candidate !== 'object') return;
        io.to(targetId).emit('webrtc-ice-candidate', {
            senderId: socket.id,
            candidate
        });
    });

    // 屏幕分享状态广播
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
        if (room) {
            socket.to(roomId).emit('screen-share-stopped');
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
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
                        if (index !== -1) {
                            rooms.splice(index, 1);
                        }
                    }
                }

                socket.to(roomId).emit('user-left', {
                    username: userInfo?.username,
                    memberCount: room.members.length
                });

                saveData();
            }
        }

        socketToUser.delete(socket.id);
        socketToRoom.delete(socket.id);
        console.log('用户断开连接:', socket.id);
    });
});

// 启动服务器
server.listen(PORT, () => {
    loadData();
    initDefaultAdmin();
    console.log(`SyncCinema 服务器运行在端口 ${PORT}`);
    console.log(`管理后台: http://localhost:${PORT}/admin/`);
    console.log(`播放页面: http://localhost:${PORT}/player/`);
});
