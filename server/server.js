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
let socketToUser = new Map(); // socket.id -> { userId, username, roomId }
let socketToRoom = new Map(); // socket.id -> roomId

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

// 保存数据
function saveData() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
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
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        users.push(adminUser);
        saveData();
        console.log('默认管理员账号已创建: admin / admin123');
    }
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ===== API 路由 =====

// 用户注册
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
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
            role: user.role
        }
    });
});

// 获取所有用户（管理员）
app.get('/api/users', (req, res) => {
    const userList = users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
    }));
    res.json({ success: true, users: userList });
});

// 删除用户
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    users.splice(index, 1);
    saveData();
    res.json({ success: true, message: '用户已删除' });
});

// 封禁/解封用户
app.put('/api/users/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
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

// 删除房间
app.delete('/api/rooms/:id', (req, res) => {
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
        socketToUser.set(socket.id, { userId, username, roomId: null });
        console.log(`用户认证: ${username} (${userId})`);
    });
    
    // 创建房间
    socket.on('create-room', ({ name, isPublic, password, videoUrl, username }) => {
        const roomId = uuidv4();
        const room = {
            id: roomId,
            name: name || `房间 ${rooms.length + 1}`,
            host: username,
            hostSocketId: socket.id,
            isPublic: isPublic !== false,
            password: password || null,
            videoUrl: videoUrl || null,
            announcement: '',
            members: [{ socketId: socket.id, username }],
            messages: [],
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
                announcement: room.announcement
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
        
        socket.join(roomId);
        socketToRoom.set(socket.id, roomId);
        
        const userInfo = socketToUser.get(socket.id);
        if (userInfo) {
            userInfo.roomId = roomId;
        }
        
        room.members.push({ socketId: socket.id, username });
        
        // 发送房间信息给新成员
        socket.emit('joined-room', {
            roomId: room.id,
            name: room.name,
            host: room.host,
            videoUrl: room.videoUrl,
            videoState: room.videoState,
            members: room.members.map(m => m.username),
            messages: room.messages.slice(-50), // 最近50条消息
            announcement: room.announcement,
            isPublic: room.isPublic
        });
        
        // 通知其他成员
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
                
                // 如果房主离开，指定新房主或删除房间
                if (room.hostSocketId === socket.id) {
                    if (room.members.length > 0) {
                        room.hostSocketId = room.members[0].socketId;
                        room.host = room.members[0].username;
                        io.to(roomId).emit('host-changed', { newHost: room.host });
                    } else {
                        // 房间为空，删除房间
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
            // 广播给其他成员
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
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const chatMessage = {
                id: uuidv4(),
                username,
                message,
                timestamp: new Date().toISOString()
            };
            
            room.messages.push(chatMessage);
            
            // 限制消息历史数量
            if (room.messages.length > 200) {
                room.messages = room.messages.slice(-200);
            }
            
            saveData();
            io.to(roomId).emit('chat-message', chatMessage);
        }
    });
    
    // 加载视频
    socket.on('load-video', ({ roomId, videoUrl }) => {
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
    
    // 更新房间设置
    socket.on('update-room-settings', ({ roomId, announcement, isPublic }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room && room.hostSocketId === socket.id) {
            if (announcement !== undefined) {
                room.announcement = announcement;
            }
            if (isPublic !== undefined) {
                room.isPublic = isPublic;
            }
            saveData();
            io.to(roomId).emit('room-settings-updated', { announcement: room.announcement, isPublic: room.isPublic });
        }
    });
    
    // 文件分享
    socket.on('share-file', ({ roomId, username, fileName, fileSize, fileType, fileData }) => {
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const fileMessage = {
                id: uuidv4(),
                username,
                type: 'file',
                fileName,
                fileSize,
                fileType,
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
