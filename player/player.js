const API_URL = window.location.origin;
let socket = null;

// 状态管理
let currentUser = null;
let currentRoom = null;
let isHost = false;
let rooms = [];
let members = [];
let pendingJoinRoom = null;
let pendingFile = null;
let currentVideoType = 'native'; // native, youtube, bilibili
let watchHistory = [];

// DOM 元素
const authPage = document.getElementById('auth-page');
const lobbyPage = document.getElementById('lobby-page');
const roomPage = document.getElementById('room-page');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadWatchHistory();
    checkAuth();
    setupEventListeners();
});

// ===== 观看历史 =====
function loadWatchHistory() {
    const saved = localStorage.getItem('vt_watch_history');
    if (saved) {
        try {
            watchHistory = JSON.parse(saved);
        } catch (e) {
            watchHistory = [];
        }
    }
}

function saveWatchHistory() {
    localStorage.setItem('vt_watch_history', JSON.stringify(watchHistory.slice(-20)));
}

function addWatchHistory(roomName, videoUrl) {
    if (!videoUrl) return;
    watchHistory = watchHistory.filter(h => h.videoUrl !== videoUrl);
    watchHistory.push({
        roomName,
        videoUrl,
        timestamp: new Date().toISOString()
    });
    saveWatchHistory();
}

function renderWatchHistory() {
    const container = document.getElementById('watch-history');
    if (!container) return;
    
    if (watchHistory.length === 0) {
        container.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:13px;">暂无观看记录</div>';
        return;
    }
    
    container.innerHTML = watchHistory.slice(-8).reverse().map(h => `
        <div class="history-item" onclick="joinHistoryRoom('${escapeHtml(h.videoUrl)}')">
            <div class="history-item-title">${escapeHtml(h.roomName)}</div>
            <div class="history-item-time">${formatDateShort(h.timestamp)}</div>
        </div>
    `).join('');
}

function joinHistoryRoom(videoUrl) {
    document.getElementById('room-video').value = videoUrl;
    document.getElementById('create-room-modal').classList.remove('hidden');
}

// ===== 视频源解析 =====
function parseVideoUrl(url) {
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (youtubeMatch) {
        return { type: 'youtube', id: youtubeMatch[1], embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?enablejsapi=1` };
    }
    
    // Bilibili
    const bilibiliMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
    if (bilibiliMatch) {
        return { type: 'bilibili', id: bilibiliMatch[1], embedUrl: `https://player.bilibili.com/player.html?bvid=${bilibiliMatch[1]}&page=1&high_quality=1` };
    }
    
    // 直接视频链接
    if (url.match(/\.(mp4|webm|ogg|m3u8)(\?.*)?$/i)) {
        return { type: 'native', id: null, embedUrl: url };
    }
    
    return { type: 'native', id: null, embedUrl: url };
}

function loadVideo(url) {
    const video = document.getElementById('video-player');
    const externalPlayer = document.getElementById('external-player');
    const parsed = parseVideoUrl(url);
    
    currentVideoType = parsed.type;
    
    if (parsed.type === 'youtube' || parsed.type === 'bilibili') {
        // 使用 iframe 嵌入
        video.classList.add('hidden');
        externalPlayer.classList.remove('hidden');
        externalPlayer.innerHTML = `<iframe src="${parsed.embedUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
        
        // 外部播放器无法精确同步，显示提示
        showSyncStatus('外部播放器 - 同步受限');
    } else {
        // 原生播放器
        externalPlayer.classList.add('hidden');
        externalPlayer.innerHTML = '';
        video.classList.remove('hidden');
        video.src = url;
        video.load();
    }
    
    document.getElementById('video-input-area').style.display = isHost ? 'block' : 'none';
    
    if (currentRoom) {
        addWatchHistory(currentRoom.name, url);
    }
}

// ===== 认证 =====
function checkAuth() {
    const saved = localStorage.getItem('vt_user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            connectSocket();
            showLobby();
        } catch (e) {
            showAuth();
        }
    } else {
        showAuth();
    }
}

function connectSocket() {
    socket = io(API_URL);
    
    socket.on('connect', () => {
        console.log('Socket 已连接');
        if (currentUser) {
            socket.emit('auth', { userId: currentUser.id, username: currentUser.username });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Socket 已断开');
    });
    
    socket.on('room-created', ({ roomId, room }) => {
        currentRoom = { id: roomId, ...room };
        isHost = true;
        showRoom();
    });
    
    socket.on('joined-room', ({ roomId, name, host, videoUrl, videoState, members: roomMembers, messages, announcement }) => {
        currentRoom = { id: roomId, name, host, videoUrl };
        isHost = host === currentUser.username;
        members = roomMembers;
        
        showRoom();
        updateMembersList();
        
        if (messages) {
            messages.forEach(msg => addChatMessage(msg));
        }
        
        if (videoUrl) {
            loadVideo(videoUrl);
            if (videoState) {
                syncVideoState(videoState);
            }
        }
        
        if (announcement) {
            updateAnnouncement(announcement);
        }
    });
    
    socket.on('join-error', ({ message }) => {
        document.getElementById('join-error').textContent = message;
    });
    
    socket.on('user-joined', ({ username, memberCount }) => {
        if (!members.includes(username)) {
            members.push(username);
        }
        updateMembersList();
        addSystemMessage(`${username} 加入了房间`);
        document.getElementById('member-count').textContent = `${memberCount} 人在线`;
    });
    
    socket.on('user-left', ({ username, memberCount }) => {
        members = members.filter(m => m !== username);
        updateMembersList();
        addSystemMessage(`${username} 离开了房间`);
        document.getElementById('member-count').textContent = `${memberCount} 人在线`;
    });
    
    socket.on('host-changed', ({ newHost }) => {
        currentRoom.host = newHost;
        isHost = newHost === currentUser.username;
        updateRoomUI();
        addSystemMessage(`${newHost} 成为了新房主`);
    });
    
    socket.on('rooms-list', (publicRooms) => {
        rooms = publicRooms;
        renderRooms(publicRooms);
    });
    
    socket.on('video-loaded', ({ videoUrl }) => {
        loadVideo(videoUrl);
        addSystemMessage('房主加载了新视频');
    });
    
    socket.on('video-play', ({ currentTime }) => {
        if (currentVideoType !== 'native') return;
        const video = document.getElementById('video-player');
        if (Math.abs(video.currentTime - currentTime) > 0.5) {
            video.currentTime = currentTime;
        }
        video.play();
        showSyncStatus('播放');
    });
    
    socket.on('video-pause', ({ currentTime }) => {
        if (currentVideoType !== 'native') return;
        const video = document.getElementById('video-player');
        video.currentTime = currentTime;
        video.pause();
        showSyncStatus('暂停');
    });
    
    socket.on('video-seek', ({ currentTime }) => {
        if (currentVideoType !== 'native') return;
        const video = document.getElementById('video-player');
        video.currentTime = currentTime;
        showSyncStatus('进度同步');
    });
    
    socket.on('video-rate-change', ({ playbackRate }) => {
        if (currentVideoType !== 'native') return;
        const video = document.getElementById('video-player');
        video.playbackRate = playbackRate;
        document.getElementById('rate-select').value = playbackRate;
        showSyncStatus(`倍速 ${playbackRate}x`);
    });
    
    socket.on('video-sync', ({ currentTime }) => {
        if (currentVideoType !== 'native') return;
        const video = document.getElementById('video-player');
        const diff = Math.abs(video.currentTime - currentTime);
        if (diff > 0.3 && !video.paused) {
            video.currentTime = currentTime;
            showSyncStatus('同步中', true);
        }
    });
    
    socket.on('video-state', (videoState) => {
        syncVideoState(videoState);
    });
    
    socket.on('chat-message', (message) => {
        addChatMessage(message);
    });
    
    socket.on('room-settings-updated', ({ announcement, isPublic }) => {
        if (announcement !== undefined) {
            updateAnnouncement(announcement);
        }
        if (isPublic !== undefined) {
            currentRoom.isPublic = isPublic;
        }
    });
    
    socket.on('file-shared', (message) => {
        addChatMessage(message);
    });
}

// ===== 事件监听 =====
function setupEventListeners() {
    // 认证标签
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
            document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
            document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
            document.getElementById('auth-error').textContent = '';
        });
    });
    
    // 登录
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        await login(username, password);
    });
    
    // 注册
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const password2 = document.getElementById('reg-password2').value;
        
        if (password !== password2) {
            document.getElementById('auth-error').textContent = '两次输入的密码不一致';
            return;
        }
        
        await register(username, password);
    });
    
    // 退出
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // 创建房间
    document.getElementById('create-room-btn').addEventListener('click', () => {
        document.getElementById('create-room-modal').classList.remove('hidden');
    });
    
    document.getElementById('cancel-create').addEventListener('click', () => {
        document.getElementById('create-room-modal').classList.add('hidden');
        document.getElementById('create-room-form').reset();
    });
    
    document.getElementById('create-room-form').addEventListener('submit', (e) => {
        e.preventDefault();
        createRoom();
    });
    
    document.getElementById('room-public').addEventListener('change', (e) => {
        document.getElementById('password-group').style.display = e.target.checked ? 'block' : 'none';
    });
    
    // 加入房间
    document.getElementById('cancel-join').addEventListener('click', () => {
        document.getElementById('join-room-modal').classList.add('hidden');
        pendingJoinRoom = null;
    });
    
    document.getElementById('join-room-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const password = document.getElementById('join-password').value;
        if (pendingJoinRoom) {
            joinRoom(pendingJoinRoom.id, password);
            document.getElementById('join-room-modal').classList.add('hidden');
            pendingJoinRoom = null;
        }
    });
    
    // 离开房间
    document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
    
    // 加载视频
    document.getElementById('load-video-btn').addEventListener('click', () => {
        const url = document.getElementById('video-url-input').value;
        if (url) {
            loadVideo(url);
            if (socket && currentRoom) {
                socket.emit('load-video', { roomId: currentRoom.id, videoUrl: url });
            }
        }
    });
    
    // 视频事件
    setupVideoEvents();
    
    // 同步
    document.getElementById('sync-btn').addEventListener('click', () => {
        if (socket && currentRoom) {
            socket.emit('request-sync', { roomId: currentRoom.id });
            showSyncStatus('请求同步...');
        }
    });
    
    // 倍速
    document.getElementById('rate-select').addEventListener('change', (e) => {
        const rate = parseFloat(e.target.value);
        if (currentVideoType === 'native') {
            const video = document.getElementById('video-player');
            video.playbackRate = rate;
        }
        if (socket && currentRoom && isHost) {
            socket.emit('video-rate-change', { roomId: currentRoom.id, playbackRate: rate });
        }
    });
    
    // 聊天
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // 表情
    document.getElementById('emoji-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('emoji-picker').classList.toggle('hidden');
    });
    
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            input.value += emoji.textContent;
            input.focus();
            document.getElementById('emoji-picker').classList.add('hidden');
        });
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#emoji-picker') && !e.target.closest('#emoji-btn')) {
            document.getElementById('emoji-picker').classList.add('hidden');
        }
    });
    
    // 文件分享
    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    
    document.getElementById('cancel-file-share').addEventListener('click', () => {
        document.getElementById('file-preview-modal').classList.add('hidden');
        pendingFile = null;
    });
    
    document.getElementById('confirm-file-share').addEventListener('click', shareFile);
    
    // 房间设置
    document.getElementById('edit-announcement-btn').addEventListener('click', () => {
        if (!isHost) return;
        document.getElementById('settings-announcement').value = currentRoom?.announcement || '';
        document.getElementById('settings-public').checked = currentRoom?.isPublic !== false;
        document.getElementById('room-settings-modal').classList.remove('hidden');
    });
    
    document.getElementById('cancel-settings').addEventListener('click', () => {
        document.getElementById('room-settings-modal').classList.add('hidden');
    });
    
    document.getElementById('room-settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveRoomSettings();
    });
    
    // 搜索房间
    document.getElementById('room-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = rooms.filter(r => 
            r.name.toLowerCase().includes(query) ||
            r.host.toLowerCase().includes(query)
        );
        renderRooms(filtered);
    });
}

// ===== 视频事件 =====
function setupVideoEvents() {
    const video = document.getElementById('video-player');
    let isSyncing = false;
    
    video.addEventListener('play', () => {
        if (socket && currentRoom && isHost && !isSyncing && currentVideoType === 'native') {
            socket.emit('video-play', { roomId: currentRoom.id, currentTime: video.currentTime });
        }
    });
    
    video.addEventListener('pause', () => {
        if (socket && currentRoom && isHost && !isSyncing && currentVideoType === 'native') {
            socket.emit('video-pause', { roomId: currentRoom.id, currentTime: video.currentTime });
        }
    });
    
    video.addEventListener('seeked', () => {
        if (socket && currentRoom && isHost && !isSyncing && currentVideoType === 'native') {
            socket.emit('video-seek', { roomId: currentRoom.id, currentTime: video.currentTime });
        }
    });
    
    let lastTimeUpdate = 0;
    video.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastTimeUpdate < 1000) return;
        lastTimeUpdate = now;
        
        if (socket && currentRoom && isHost && currentVideoType === 'native') {
            socket.emit('video-timeupdate', { roomId: currentRoom.id, currentTime: video.currentTime });
        }
    });
    
    video.addEventListener('ratechange', () => {
        if (socket && currentRoom && isHost && currentVideoType === 'native') {
            socket.emit('video-rate-change', { roomId: currentRoom.id, playbackRate: video.playbackRate });
        }
    });
}

// ===== 文件分享 =====
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    pendingFile = file;
    const content = document.getElementById('file-preview-content');
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (file.size > maxSize) {
        alert('文件大小不能超过 5MB');
        pendingFile = null;
        return;
    }
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            content.innerHTML = `<img src="${ev.target.result}" alt="${escapeHtml(file.name)}"><div class="file-preview-info">${escapeHtml(file.name)} (${formatFileSize(file.size)})</div>`;
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            content.innerHTML = `<video src="${ev.target.result}" controls></video><div class="file-preview-info">${escapeHtml(file.name)} (${formatFileSize(file.size)})</div>`;
        };
        reader.readAsDataURL(file);
    } else {
        content.innerHTML = `
            <div class="msg-file-icon">📄</div>
            <div class="file-preview-info">
                <div>${escapeHtml(file.name)}</div>
                <div style="color:rgba(255,255,255,0.4);font-size:12px;">${formatFileSize(file.size)}</div>
            </div>
        `;
    }
    
    document.getElementById('file-preview-modal').classList.remove('hidden');
    e.target.value = '';
}

function shareFile() {
    if (!pendingFile || !socket || !currentRoom) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        const message = {
            roomId: currentRoom.id,
            username: currentUser.username,
            fileName: pendingFile.name,
            fileSize: pendingFile.size,
            fileType: pendingFile.type,
            fileData: ev.target.result
        };
        socket.emit('share-file', message);
        document.getElementById('file-preview-modal').classList.add('hidden');
        pendingFile = null;
    };
    reader.readAsDataURL(pendingFile);
}

// ===== 房间设置 =====
function saveRoomSettings() {
    if (!isHost || !socket || !currentRoom) return;
    
    const announcement = document.getElementById('settings-announcement').value;
    const isPublic = document.getElementById('settings-public').checked;
    
    socket.emit('update-room-settings', {
        roomId: currentRoom.id,
        announcement,
        isPublic
    });
    
    currentRoom.announcement = announcement;
    currentRoom.isPublic = isPublic;
    updateAnnouncement(announcement);
    document.getElementById('room-settings-modal').classList.add('hidden');
}

function updateAnnouncement(text) {
    const el = document.getElementById('announcement-text');
    const btn = document.getElementById('edit-announcement-btn');
    el.textContent = text || '暂无公告';
    btn.style.display = isHost ? 'inline-block' : 'none';
}

// ===== 登录/注册 =====
async function login(username, password) {
    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('vt_user', JSON.stringify(currentUser));
            connectSocket();
            showLobby();
        } else {
            document.getElementById('auth-error').textContent = data.message;
        }
    } catch (error) {
        document.getElementById('auth-error').textContent = '网络错误';
    }
}

async function register(username, password) {
    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('auth-error').textContent = '注册成功，请登录';
            document.getElementById('auth-error').style.color = '#2ed573';
            document.getElementById('register-form').reset();
            document.querySelector('[data-tab="login"]').click();
        } else {
            document.getElementById('auth-error').textContent = data.message;
        }
    } catch (error) {
        document.getElementById('auth-error').textContent = '网络错误';
    }
}

function logout() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    currentUser = null;
    currentRoom = null;
    localStorage.removeItem('vt_user');
    showAuth();
}

// ===== 房间操作 =====
function createRoom() {
    const name = document.getElementById('room-name').value;
    const videoUrl = document.getElementById('room-video').value;
    const isPublic = document.getElementById('room-public').checked;
    const password = document.getElementById('room-password').value;
    
    if (socket) {
        socket.emit('create-room', {
            name,
            isPublic,
            password: password || null,
            videoUrl: videoUrl || null,
            username: currentUser.username
        });
        
        document.getElementById('create-room-modal').classList.add('hidden');
        document.getElementById('create-room-form').reset();
    }
}

function joinRoom(roomId, password = null) {
    if (socket) {
        socket.emit('join-room', {
            roomId,
            password,
            username: currentUser.username
        });
    }
}

function leaveRoom() {
    if (socket) {
        socket.emit('leave-room');
    }
    currentRoom = null;
    isHost = false;
    members = [];
    currentVideoType = 'native';
    
    const video = document.getElementById('video-player');
    video.pause();
    video.src = '';
    
    const externalPlayer = document.getElementById('external-player');
    externalPlayer.innerHTML = '';
    externalPlayer.classList.add('hidden');
    video.classList.remove('hidden');
    
    document.getElementById('chat-messages').innerHTML = '';
    
    showLobby();
    loadRooms();
}

function syncVideoState(videoState) {
    if (currentVideoType !== 'native') return;
    const video = document.getElementById('video-player');
    
    if (videoState.currentTime) {
        video.currentTime = videoState.currentTime;
    }
    if (videoState.playbackRate) {
        video.playbackRate = videoState.playbackRate;
        document.getElementById('rate-select').value = videoState.playbackRate;
    }
    if (videoState.isPlaying) {
        video.play();
    } else {
        video.pause();
    }
}

// ===== 聊天 =====
function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message || !socket || !currentRoom) return;
    
    socket.emit('chat-message', {
        roomId: currentRoom.id,
        message,
        username: currentUser.username
    });
    
    input.value = '';
}

function addChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const isOwn = msg.username === currentUser?.username;
    
    const div = document.createElement('div');
    div.className = `chat-message ${isOwn ? 'own' : ''}`;
    
    if (msg.type === 'file') {
        // 文件消息
        let fileContent = '';
        if (msg.fileType?.startsWith('image/')) {
            fileContent = `<img class="msg-file-image" src="${msg.fileData}" alt="${escapeHtml(msg.fileName)}" onclick="window.open('${msg.fileData}')">`;
        } else {
            const icon = msg.fileType?.startsWith('video/') ? '🎬' : msg.fileType?.startsWith('audio/') ? '🎵' : '📄';
            fileContent = `
                <div class="msg-file">
                    <span class="msg-file-icon">${icon}</span>
                    <div class="msg-file-info">
                        <div class="msg-file-name">${escapeHtml(msg.fileName)}</div>
                        <div class="msg-file-size">${formatFileSize(msg.fileSize)}</div>
                    </div>
                </div>
            `;
        }
        
        div.innerHTML = `
            <div class="msg-user">${msg.username}</div>
            ${fileContent}
            <div class="msg-time">${formatTime(msg.timestamp)}</div>
        `;
    } else {
        div.innerHTML = `
            <div class="msg-user">${msg.username}</div>
            <div class="msg-text">${escapeHtml(msg.message)}</div>
            <div class="msg-time">${formatTime(msg.timestamp)}</div>
        `;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ===== UI 更新 =====
function updateMembersList() {
    const list = document.getElementById('members-list');
    list.innerHTML = members.map(member => `
        <li class="${member === currentRoom?.host ? 'host' : ''}">
            ${member} ${member === currentRoom?.host ? '(房主)' : ''}
        </li>
    `).join('');
}

function updateRoomUI() {
    document.getElementById('room-title').textContent = currentRoom?.name || '房间';
    document.getElementById('room-badge').textContent = isHost ? '房主' : '成员';
    document.getElementById('room-badge').style.display = isHost ? 'inline-block' : 'none';
    document.getElementById('video-input-area').style.display = isHost ? 'block' : 'none';
    document.getElementById('edit-announcement-btn').style.display = isHost ? 'inline-block' : 'none';
}

function showSyncStatus(text, isSyncing = false) {
    const status = document.getElementById('sync-status');
    status.textContent = text;
    status.classList.toggle('syncing', isSyncing);
    
    setTimeout(() => {
        status.textContent = '已同步';
        status.classList.remove('syncing');
    }, 2000);
}

function renderRooms(roomList) {
    const container = document.getElementById('rooms-list');
    const emptyState = document.getElementById('empty-rooms');
    
    if (roomList.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    container.innerHTML = roomList.map(room => `
        <div class="room-card" onclick="handleRoomClick('${room.id}', ${room.hasPassword}, '${escapeHtml(room.name)}')">
            <div class="room-card-header">
                <h3>${escapeHtml(room.name)}</h3>
                ${room.hasPassword ? '<span class="room-visibility room-password">🔒 有密码</span>' : ''}
            </div>
            <div class="room-card-meta">
                <span>👥 ${room.memberCount} 人</span>
                <span>${room.isPublic ? '🌐 公开' : '🔒 私密'}</span>
            </div>
            <div class="room-card-footer">
                <span class="room-host">房主: ${escapeHtml(room.host)}</span>
                <span class="room-visibility ${room.isPublic ? 'room-public' : 'room-private'}">
                    ${room.isPublic ? '公开' : '私密'}
                </span>
            </div>
        </div>
    `).join('');
}

function handleRoomClick(roomId, hasPassword, roomName) {
    if (hasPassword) {
        pendingJoinRoom = { id: roomId, name: roomName };
        document.getElementById('join-room-name').textContent = roomName;
        document.getElementById('join-password').value = '';
        document.getElementById('join-error').textContent = '';
        document.getElementById('join-room-modal').classList.remove('hidden');
    } else {
        joinRoom(roomId);
    }
}

function loadRooms() {
    if (socket) {
        socket.emit('get-rooms');
    }
}

// ===== 页面切换 =====
function showAuth() {
    authPage.classList.remove('hidden');
    lobbyPage.classList.add('hidden');
    roomPage.classList.add('hidden');
}

function showLobby() {
    authPage.classList.add('hidden');
    lobbyPage.classList.remove('hidden');
    roomPage.classList.add('hidden');
    
    document.getElementById('user-name').textContent = currentUser?.username || 'User';
    renderWatchHistory();
    loadRooms();
}

function showRoom() {
    authPage.classList.add('hidden');
    lobbyPage.classList.add('hidden');
    roomPage.classList.remove('hidden');
    
    document.getElementById('current-user').textContent = currentUser?.username || 'User';
    document.getElementById('member-count').textContent = `${members.length} 人在线`;
    
    updateRoomUI();
}

// ===== 工具函数 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
