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
let currentVideoType = 'native';
let watchHistory = [];
let favorites = [];
let avatarBase64 = null;
let danmakuEnabled = true;
let blockedDanmakuKeywords = [];
let playlist = [];
let currentPlaylistIndex = -1;

// 防止同步循环：远程操作触发本地事件时，标记为远程同步，避免再 emit 回服务器
let _isRemoteSyncing = false;

// WebRTC
let localStream = null;
let peerConnections = new Map();
let isVoiceActive = false;
let isMuted = false;

// 定时器
let autoCloseTimer = null;
let autoCloseTimeout = null;
let restReminderInterval = null;
let restReminderIntervalMs = 45 * 60 * 1000;
let lastRestTime = Date.now();

// 屏幕分享
let screenShareStream = null;

// JWT Token
let authToken = null;

// 私聊
let privateChatOpen = false;
let privateChatTarget = null;
let privateChatMessages = [];

// DOM 元素缓存
const authPage = document.getElementById('auth-page');
const lobbyPage = document.getElementById('lobby-page');
const roomPage = document.getElementById('room-page');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadWatchHistory();
    loadFavorites();
    loadBlockedKeywords();
    checkAuth();
    setupEventListeners();
    setupDelegatedEventListeners();
    setupPrivateChatListeners();
    startRestReminder();
});

// ===== 安全工具函数 =====

/**
 * HTML 实体编码，防御 XSS
 * 同时转义单引号，防止在 HTML 属性中注入
 */
function escapeHtml(text) {
    if (text == null) return '';
    const str = String(text);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

/**
 * JavaScript 字符串转义，用于安全地放入 JS 字符串上下文
 */
function escapeJsString(str) {
    if (str == null) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

/**
 * 验证 URL 是否为安全的 HTTP/HTTPS 链接
 */
function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * 验证颜色是否为合法 hex 格式
 */
function isValidHexColor(color) {
    return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color);
}

// ===== API 请求封装（自动携带 JWT Token）=====
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error('认证已过期，请重新登录');
    }
    return response;
}

// ===== 本地存储管理 =====
function loadWatchHistory() {
    const saved = localStorage.getItem('sc_watch_history');
    if (saved) {
        try { watchHistory = JSON.parse(saved); } catch (e) { watchHistory = []; }
    }
}

function saveWatchHistory() {
    localStorage.setItem('sc_watch_history', JSON.stringify(watchHistory.slice(-20)));
}

function loadFavorites() {
    const saved = localStorage.getItem('sc_favorites');
    if (saved) {
        try { favorites = JSON.parse(saved); } catch (e) { favorites = []; }
    }
}

function saveFavorites() {
    localStorage.setItem('sc_favorites', JSON.stringify(favorites));
    if (currentUser?.id && authToken) {
        apiFetch(`${API_URL}/api/users/${encodeURIComponent(currentUser.id)}/favorites`, {
            method: 'PUT',
            body: JSON.stringify({ favorites })
        }).catch(() => {});
    }
}

function loadBlockedKeywords() {
    const saved = localStorage.getItem('sc_blocked_danmaku');
    if (saved) {
        try { blockedDanmakuKeywords = JSON.parse(saved); } catch (e) { blockedDanmakuKeywords = []; }
    }
}

// ===== 观看历史 =====
function addWatchHistory(roomName, videoUrl) {
    if (!videoUrl) return;
    watchHistory = watchHistory.filter(h => h.videoUrl !== videoUrl);
    watchHistory.push({ roomName, videoUrl, timestamp: new Date().toISOString() });
    saveWatchHistory();
}

function renderWatchHistory() {
    const container = document.getElementById('watch-history');
    if (!container) return;
    if (watchHistory.length === 0) {
        container.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:13px;">暂无观看记录</div>';
        return;
    }
    container.innerHTML = watchHistory.slice(-8).reverse().map((h, i) => `
        <div class="history-item" data-history-index="${i}" data-video-url="${escapeHtml(h.videoUrl)}">
            <div class="history-item-title">${escapeHtml(h.roomName)}</div>
            <div class="history-item-time">${formatDateShort(h.timestamp)}</div>
        </div>
    `).join('');
}

function joinHistoryRoom(videoUrl) {
    document.getElementById('room-video').value = videoUrl;
    document.getElementById('create-room-modal').classList.remove('hidden');
}

// ===== 收藏房间 =====
function toggleFavoriteRoom() {
    if (!currentRoom) return;
    const index = favorites.findIndex(f => f.id === currentRoom.id);
    if (index >= 0) {
        favorites.splice(index, 1);
    } else {
        favorites.push({
            id: currentRoom.id,
            name: currentRoom.name,
            host: currentRoom.host,
            addedAt: new Date().toISOString()
        });
    }
    saveFavorites();
    updateFavoriteButton();
    renderFavorites();
}

function removeFavorite(roomId) {
    favorites = favorites.filter(f => f.id !== roomId);
    saveFavorites();
    renderFavorites();
    if (currentRoom?.id === roomId) updateFavoriteButton();
}

function updateFavoriteButton() {
    const btn = document.getElementById('favorite-room-btn');
    if (!btn || !currentRoom) return;
    const isFav = favorites.some(f => f.id === currentRoom.id);
    btn.textContent = isFav ? '\u2B50' : '\u2606'; // ⭐ / ☆
    btn.title = isFav ? '取消收藏' : '收藏房间';
}

function renderFavorites() {
    const container = document.getElementById('favorites-list');
    const section = document.getElementById('favorites-section');
    if (!container) return;
    if (favorites.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    container.innerHTML = favorites.map((f, i) => `
        <div class="favorite-item" data-favorite-id="${escapeHtml(f.id)}">
            <button class="favorite-remove" data-remove-index="${i}">\u00D7</button>
            <div class="favorite-item-name">${escapeHtml(f.name)}</div>
            <div class="favorite-item-host">房主: ${escapeHtml(f.host)}</div>
        </div>
    `).join('');
}

function clearAllFavorites() {
    if (!confirm('确定要清空所有收藏吗？')) return;
    favorites = [];
    saveFavorites();
    renderFavorites();
    updateFavoriteButton();
}

// ===== 视频源解析（增强版 + 安全） =====
function parseVideoUrl(url) {
    if (!url) return { type: 'native', id: null, embedUrl: '' };
    const trimmed = url.trim();

    // YouTube
    const youtubeMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (youtubeMatch) {
        return { type: 'youtube', id: youtubeMatch[1], embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(youtubeMatch[1])}?enablejsapi=1` };
    }

    // Bilibili BV
    const bvMatch = trimmed.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i);
    if (bvMatch) {
        return { type: 'bilibili', id: bvMatch[1], embedUrl: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvMatch[1])}&page=1&high_quality=1&danmaku=0` };
    }

    // Bilibili av
    const avMatch = trimmed.match(/bilibili\.com\/video\/(?:av|AV)(\d+)/);
    if (avMatch) {
        return { type: 'bilibili', id: `av${avMatch[1]}`, embedUrl: `https://player.bilibili.com/player.html?aid=${encodeURIComponent(avMatch[1])}&page=1&high_quality=1&danmaku=0` };
    }

    // Bilibili ep (番剧)
    const epMatch = trimmed.match(/bilibili\.com\/bangumi\/play\/(ep\d+)/i);
    if (epMatch) {
        return { type: 'bilibili', id: epMatch[1], embedUrl: `https://player.bilibili.com/player.html?ep=${encodeURIComponent(epMatch[1].replace('ep',''))}&high_quality=1&danmaku=0`, isEp: true };
    }

    // Bilibili ss (番剧系列)
    const ssMatch = trimmed.match(/bilibili\.com\/bangumi\/play\/(ss\d+)/i);
    if (ssMatch) {
        return { type: 'bilibili', id: ssMatch[1], embedUrl: `https://player.bilibili.com/player.html?ssid=${encodeURIComponent(ssMatch[1].replace('ss',''))}&high_quality=1&danmaku=0`, isSs: true };
    }

    // Bilibili b23.tv short link
    if (trimmed.includes('b23.tv')) {
        return { type: 'bilibili', id: 'short', embedUrl: trimmed, isShort: true };
    }

    // Bilibili other
    if (trimmed.includes('bilibili.com')) {
        return { type: 'bilibili', id: 'unknown', embedUrl: trimmed, isGeneric: true };
    }

    // 直接视频链接
    if (trimmed.match(/\.(mp4|webm|ogg|m3u8)(\?.*)?$/i)) {
        return { type: 'native', id: null, embedUrl: trimmed };
    }

    return { type: 'native', id: null, embedUrl: trimmed };
}

function loadVideo(url) {
    const video = document.getElementById('video-player');
    const externalPlayer = document.getElementById('external-player');
    const parsed = parseVideoUrl(url);

    currentVideoType = parsed.type;

    if (parsed.type === 'youtube' || parsed.type === 'bilibili') {
        video.classList.add('hidden');
        externalPlayer.classList.remove('hidden');

        // 安全验证：iframe src 必须是 http/https
        if (!isSafeUrl(parsed.embedUrl)) {
            externalPlayer.innerHTML = '<div style="color:#fff;padding:20px;text-align:center;">不安全的视频链接</div>';
            showSyncStatus('链接不安全');
            return;
        }

        if (parsed.isEp || parsed.isSs || parsed.isShort || parsed.isGeneric) {
            externalPlayer.innerHTML = `
                <iframe src="${escapeHtml(parsed.embedUrl)}"
                    allowfullscreen
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                </iframe>
            `;
            if (parsed.isEp || parsed.isSs) {
                showSyncStatus('番剧嵌入可能受限，建议提供BV号');
            }
        } else {
            externalPlayer.innerHTML = `
                <iframe src="${escapeHtml(parsed.embedUrl)}"
                    allowfullscreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                </iframe>
            `;
        }
        showSyncStatus('外部播放器 - 同步受限');
    } else {
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
    const saved = localStorage.getItem('sc_user');
    const savedToken = localStorage.getItem('sc_token');
    if (saved && savedToken) {
        try {
            currentUser = JSON.parse(saved);
            authToken = savedToken;
            if (currentUser.favorites) favorites = currentUser.favorites;
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
            socket.emit('auth', {
                userId: currentUser.id,
                username: currentUser.username,
                token: authToken
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket 已断开');
        isVoiceActive = false;
        cleanupVoiceChat();
    });

    socket.on('room-created', ({ roomId, room }) => {
        currentRoom = { id: roomId, ...room };
        isHost = true;
        playlist = room.playlist || [];
        currentPlaylistIndex = room.currentPlaylistIndex || -1;
        showRoom();
        updateFavoriteButton();
    });

    socket.on('joined-room', ({ roomId, name, host, videoUrl, videoState, members: roomMembers, messages, announcement, isPublic, danmakuEnabled: de, playlist: pl, currentPlaylistIndex: cpi }) => {
        currentRoom = { id: roomId, name, host, videoUrl, isPublic };
        isHost = host === currentUser.username;
        members = roomMembers;
        danmakuEnabled = de !== false;
        playlist = pl || [];
        currentPlaylistIndex = cpi !== undefined ? cpi : -1;

        showRoom();
        updateMembersList();

        if (messages) messages.forEach(msg => addChatMessage(msg));
        if (videoUrl) {
            loadVideo(videoUrl);
            if (videoState) syncVideoState(videoState);
        }
        if (announcement) updateAnnouncement(announcement);
        updateFavoriteButton();
        updateDanmakuToggle();
        renderPlaylist();
    });

    socket.on('join-error', ({ message }) => {
        document.getElementById('join-error').textContent = message;
    });

    socket.on('user-joined', ({ username, memberCount }) => {
        if (!members.includes(username)) members.push(username);
        updateMembersList();
        addSystemMessage(`${username} 加入了房间`);
        document.getElementById('member-count').textContent = `${memberCount} 人在线`;
    });

    socket.on('user-left', ({ username, memberCount }) => {
        members = members.filter(m => m !== username);
        updateMembersList();
        addSystemMessage(`${username} 离开了房间`);
        document.getElementById('member-count').textContent = `${memberCount} 人在线`;
        if (peerConnections.has(username)) {
            peerConnections.get(username).close();
            peerConnections.delete(username);
        }
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
        _isRemoteSyncing = true;
        const video = document.getElementById('video-player');
        if (Math.abs(video.currentTime - currentTime) > 0.5) video.currentTime = currentTime;
        video.play();
        showSyncStatus('播放');
        setTimeout(() => { _isRemoteSyncing = false; }, 500);
    });

    socket.on('video-pause', ({ currentTime }) => {
        if (currentVideoType !== 'native') return;
        _isRemoteSyncing = true;
        const video = document.getElementById('video-player');
        video.currentTime = currentTime;
        video.pause();
        showSyncStatus('暂停');
        setTimeout(() => { _isRemoteSyncing = false; }, 500);
    });

    socket.on('video-seek', ({ currentTime }) => {
        if (currentVideoType !== 'native') return;
        _isRemoteSyncing = true;
        const video = document.getElementById('video-player');
        video.currentTime = currentTime;
        showSyncStatus('进度同步');
        setTimeout(() => { _isRemoteSyncing = false; }, 500);
    });

    socket.on('video-rate-change', ({ playbackRate }) => {
        if (currentVideoType !== 'native') return;
        _isRemoteSyncing = true;
        const video = document.getElementById('video-player');
        video.playbackRate = playbackRate;
        document.getElementById('rate-select').value = playbackRate;
        showSyncStatus(`倍速 ${playbackRate}x`);
        setTimeout(() => { _isRemoteSyncing = false; }, 500);
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

    socket.on('room-settings-updated', ({ announcement, isPublic, danmakuEnabled: de }) => {
        if (announcement !== undefined) updateAnnouncement(announcement);
        if (isPublic !== undefined) currentRoom.isPublic = isPublic;
        if (de !== undefined) {
            danmakuEnabled = de;
            updateDanmakuToggle();
        }
    });

    socket.on('file-shared', (message) => {
        addChatMessage(message);
    });

    socket.on('danmaku-received', (danmaku) => {
        if (danmakuEnabled) showDanmaku(danmaku);
    });

    socket.on('playlist-updated', ({ playlist: pl }) => {
        playlist = pl;
        renderPlaylist();
    });

    socket.on('playlist-play', ({ index, videoUrl }) => {
        currentPlaylistIndex = index;
        loadVideo(videoUrl);
        renderPlaylist();
        addSystemMessage(`播放列表: 第 ${index + 1} 个视频`);
    });

    // WebRTC 信令
    socket.on('webrtc-offer', async ({ senderId, offer }) => {
        await handleWebRTCOffer(senderId, offer);
    });

    socket.on('webrtc-answer', async ({ senderId, answer }) => {
        const pc = peerConnections.get(senderId);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
        const pc = peerConnections.get(senderId);
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('screen-share-started', ({ username }) => {
        addSystemMessage(`${username} 开始分享屏幕`);
    });

    socket.on('screen-share-stopped', () => {
        addSystemMessage('屏幕分享已结束');
        if (currentRoom?.videoUrl) {
            loadVideo(currentRoom.videoUrl);
        }
    });

    socket.on('share-error', ({ message }) => {
        alert(message);
    });

    // 私聊
    socket.on('private-message-received', (msg) => {
        const isFromCurrentTarget = privateChatTarget &&
            (msg.from === privateChatTarget.id || msg.fromUsername === privateChatTarget.username);
        if (privateChatOpen && isFromCurrentTarget) {
            privateChatMessages.push(msg);
            renderPrivateChat();
            socket.emit('private-message-read', { fromUserId: msg.from });
        } else {
            showPrivateMessageNotification(msg);
        }
    });

    socket.on('private-message-sent', (msg) => {
        if (privateChatOpen && privateChatTarget) {
            privateChatMessages.push(msg);
            renderPrivateChat();
        }
    });
}

// ===== 弹幕系统 =====
function showDanmaku({ text, color, position }) {
    if (!text) return;
    for (const kw of blockedDanmakuKeywords) {
        if (text.toLowerCase().includes(kw.toLowerCase())) return;
    }

    const layer = document.getElementById('danmaku-layer');
    if (!layer) return;

    const item = document.createElement('div');
    item.className = `danmaku-item ${['scroll', 'top', 'bottom'].includes(position) ? position : 'scroll'}`;
    item.textContent = text;
    item.style.color = isValidHexColor(color) ? color : '#ffffff';

    if (position === 'scroll') {
        const top = Math.random() * 80 + 5;
        item.style.top = `${top}%`;
    }

    layer.appendChild(item);
    item.addEventListener('animationend', () => item.remove());
}

function sendDanmaku() {
    const input = document.getElementById('danmaku-input');
    const text = input.value.trim();
    if (!text || !socket || !currentRoom) return;
    if (text.length > 100) {
        alert('弹幕内容不能超过100字');
        return;
    }

    const color = document.getElementById('danmaku-color').value;
    const position = document.getElementById('danmaku-position').value;

    socket.emit('danmaku-send', {
        roomId: currentRoom.id,
        text,
        color,
        position,
        username: currentUser.username
    });

    showDanmaku({ text, color, position });
    input.value = '';
}

function toggleDanmaku() {
    danmakuEnabled = !danmakuEnabled;
    const btn = document.getElementById('danmaku-toggle-btn');
    btn.classList.toggle('active', danmakuEnabled);
    showSyncStatus(danmakuEnabled ? '弹幕已开启' : '弹幕已关闭');
}

function updateDanmakuToggle() {
    const btn = document.getElementById('danmaku-toggle-btn');
    if (btn) btn.classList.toggle('active', danmakuEnabled);
}

// ===== 播放列表 =====
function addToPlaylist() {
    const urlInput = document.getElementById('playlist-url-input');
    const titleInput = document.getElementById('playlist-title-input');
    const url = urlInput.value.trim();
    if (!url) return;
    if (playlist.length >= 100) {
        alert('播放列表最多100个视频');
        return;
    }

    const parsed = parseVideoUrl(url);
    const title = titleInput.value.trim() || (parsed.type === 'youtube' ? `YouTube ${parsed.id}` : parsed.type === 'bilibili' ? `Bilibili ${parsed.id}` : '未命名视频');

    playlist.push({ url, title, id: Date.now() });
    urlInput.value = '';
    titleInput.value = '';
    renderPlaylist();

    if (socket && currentRoom && isHost) {
        socket.emit('playlist-update', { roomId: currentRoom.id, playlist });
    }
}

function removeFromPlaylist(index) {
    playlist.splice(index, 1);
    if (currentPlaylistIndex >= playlist.length) currentPlaylistIndex = playlist.length - 1;
    renderPlaylist();
    if (socket && currentRoom && isHost) {
        socket.emit('playlist-update', { roomId: currentRoom.id, playlist });
    }
}

function playPlaylistIndex(index) {
    if (!playlist[index]) return;
    currentPlaylistIndex = index;
    loadVideo(playlist[index].url);
    renderPlaylist();
    if (socket && currentRoom && isHost) {
        socket.emit('playlist-play-index', { roomId: currentRoom.id, index });
    }
}

function playNextInPlaylist() {
    if (!isHost || !socket || !currentRoom) return;
    socket.emit('playlist-next', { roomId: currentRoom.id });
}

function playPrevInPlaylist() {
    if (!isHost || !socket || !currentRoom) return;
    if (currentPlaylistIndex > 0) {
        socket.emit('playlist-play-index', { roomId: currentRoom.id, index: currentPlaylistIndex - 1 });
    }
}

function renderPlaylist() {
    const container = document.getElementById('playlist-items');
    if (!container) return;
    if (playlist.length === 0) {
        container.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;">播放列表为空</div>';
        return;
    }
    container.innerHTML = playlist.map((item, i) => `
        <div class="playlist-item ${i === currentPlaylistIndex ? 'active' : ''}" data-playlist-index="${i}">
            <span class="playlist-item-index">${i + 1}</span>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${escapeHtml(item.title)}</div>
                <div class="playlist-item-url">${escapeHtml(item.url)}</div>
            </div>
            <button class="playlist-item-remove" data-remove-playlist="${i}">\u00D7</button>
        </div>
    `).join('');
}

// ===== WebRTC 语音聊天 =====
async function toggleVoiceChat() {
    if (isVoiceActive) {
        leaveVoiceChat();
    } else {
        await joinVoiceChat();
    }
}

async function joinVoiceChat() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        isVoiceActive = true;
        isMuted = false;

        document.getElementById('voice-panel').classList.remove('hidden');
        document.getElementById('voice-btn').classList.add('active');
        updateVoiceMembers();

        showSyncStatus('已加入语音（P2P连接需在多用户环境下自动建立）');
    } catch (err) {
        console.error('语音聊天启动失败:', err);
        alert('无法访问麦克风，请检查权限设置');
    }
}

function leaveVoiceChat() {
    isVoiceActive = false;
    cleanupVoiceChat();
    document.getElementById('voice-panel').classList.add('hidden');
    document.getElementById('voice-btn').classList.remove('active');
    showSyncStatus('已离开语音');
}

function cleanupVoiceChat() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
}

function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    document.getElementById('voice-mute-btn').textContent = isMuted ? '\u1F507 已静音' : '\u1F3A4 静音';
}

function updateVoiceMembers() {
    const container = document.getElementById('voice-members');
    if (!container) return;
    if (!isVoiceActive) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `<div class="voice-member">${escapeHtml(currentUser.username)} (我)</div>`;
}

async function handleWebRTCOffer(senderId, offer) {
    try {
        const pc = createPeerConnection(senderId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { targetId: senderId, answer });
    } catch (err) {
        console.error('WebRTC offer 处理失败:', err);
    }
}

function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', { targetId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
    };

    peerConnections.set(targetId, pc);
    return pc;
}

// ===== 屏幕分享 =====
async function toggleScreenShare() {
    if (screenShareStream) {
        stopScreenShare();
    } else {
        await startScreenShare();
    }
}

async function startScreenShare() {
    if (!isHost) {
        alert('只有房主可以分享屏幕');
        return;
    }
    try {
        screenShareStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const video = document.getElementById('video-player');
        const externalPlayer = document.getElementById('external-player');

        video.srcObject = screenShareStream;
        video.classList.remove('hidden');
        externalPlayer.classList.add('hidden');
        externalPlayer.innerHTML = '';

        document.getElementById('screen-share-overlay').classList.remove('hidden');
        document.getElementById('screen-share-btn').classList.add('active');

        socket.emit('screen-share-started', { roomId: currentRoom.id });

        screenShareStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        showSyncStatus('正在分享屏幕');
    } catch (err) {
        console.error('屏幕分享失败:', err);
        alert('无法启动屏幕分享');
    }
}

function stopScreenShare() {
    if (screenShareStream) {
        screenShareStream.getTracks().forEach(t => t.stop());
        screenShareStream = null;
    }
    document.getElementById('screen-share-overlay').classList.add('hidden');
    document.getElementById('screen-share-btn').classList.remove('active');

    if (socket && currentRoom) {
        socket.emit('screen-share-stopped', { roomId: currentRoom.id });
    }

    if (currentRoom?.videoUrl) {
        loadVideo(currentRoom.videoUrl);
    }
}

// ===== 定时关闭 =====
function openTimerModal() {
    document.getElementById('timer-modal').classList.remove('hidden');
    updateTimerStatus();
}

function closeTimerModal() {
    document.getElementById('timer-modal').classList.add('hidden');
}

function setTimer(minutes) {
    if (autoCloseTimeout) clearTimeout(autoCloseTimeout);
    if (autoCloseTimer) clearInterval(autoCloseTimer);

    const ms = minutes * 60 * 1000;
    const endTime = Date.now() + ms;

    autoCloseTimeout = setTimeout(() => {
        leaveRoom();
        alert('\u23F0 定时关闭时间到，已离开房间');
        clearInterval(autoCloseTimer);
        autoCloseTimer = null;
        autoCloseTimeout = null;
    }, ms);

    autoCloseTimer = setInterval(() => {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
            clearInterval(autoCloseTimer);
            return;
        }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const el = document.getElementById('timer-countdown');
        if (el) el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);

    updateTimerStatus();
    showSyncStatus(`定时关闭: ${minutes} 分钟后`);
}

function cancelTimer() {
    if (autoCloseTimeout) clearTimeout(autoCloseTimeout);
    if (autoCloseTimer) clearInterval(autoCloseTimer);
    autoCloseTimeout = null;
    autoCloseTimer = null;
    updateTimerStatus();
    showSyncStatus('定时关闭已取消');
}

function updateTimerStatus() {
    const statusEl = document.getElementById('timer-status');
    if (!statusEl) return;
    statusEl.classList.toggle('hidden', !autoCloseTimer);
}

// ===== 休息提醒 =====
function startRestReminder() {
    if (restReminderInterval) clearInterval(restReminderInterval);
    restReminderInterval = setInterval(() => {
        const checkbox = document.getElementById('timer-rest-reminder');
        const enabled = checkbox ? checkbox.checked : true;
        if (!enabled) return;
        if (Date.now() - lastRestTime >= restReminderIntervalMs) {
            showRestReminder();
        }
    }, 60000);
}

function showRestReminder() {
    document.getElementById('rest-reminder-modal').classList.remove('hidden');
}

function dismissRestReminder(snooze = false) {
    document.getElementById('rest-reminder-modal').classList.add('hidden');
    if (snooze) {
        lastRestTime = Date.now() - restReminderIntervalMs + 10 * 60 * 1000;
    } else {
        lastRestTime = Date.now();
    }
}

// ===== Bilibili 登录引导 =====
function openBilibiliLogin() {
    document.getElementById('bilibili-login-modal').classList.remove('hidden');
}

function closeBilibiliLogin() {
    document.getElementById('bilibili-login-modal').classList.add('hidden');
}

function goToBilibiliLogin() {
    window.open('https://passport.bilibili.com/login', '_blank');
}

// ===== 弹幕屏蔽设置 =====
function openDanmakuBlockModal() {
    document.getElementById('danmaku-block-modal').classList.remove('hidden');
    document.getElementById('blocked-keywords').value = blockedDanmakuKeywords.join(', ');
}

function closeDanmakuBlockModal() {
    document.getElementById('danmaku-block-modal').classList.add('hidden');
}

function saveBlockedKeywords() {
    const raw = document.getElementById('blocked-keywords').value;
    blockedDanmakuKeywords = raw.split(/[,，]/).map(s => s.trim()).filter(s => s.length > 0);
    saveBlockedKeywordsToStorage();
    closeDanmakuBlockModal();
    alert('屏蔽关键词已保存');
}

function saveBlockedKeywordsToStorage() {
    localStorage.setItem('sc_blocked_danmaku', JSON.stringify(blockedDanmakuKeywords));
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
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        await login(username, password);
    });

    // 注册
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
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

    // 个人资料
    document.getElementById('profile-btn').addEventListener('click', openProfileModal);
    document.getElementById('cancel-profile').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.add('hidden');
    });
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProfile();
    });
    document.getElementById('avatar-input').addEventListener('change', handleAvatarSelect);

    // 收藏
    document.getElementById('favorite-room-btn')?.addEventListener('click', toggleFavoriteRoom);
    document.getElementById('clear-favorites-btn')?.addEventListener('click', clearAllFavorites);

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
        const url = document.getElementById('video-url-input').value.trim();
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

    // 播放列表控制
    document.getElementById('playlist-toggle-btn').addEventListener('click', () => {
        document.getElementById('playlist-modal').classList.remove('hidden');
        renderPlaylist();
    });
    document.getElementById('close-playlist-btn').addEventListener('click', () => {
        document.getElementById('playlist-modal').classList.add('hidden');
    });
    document.getElementById('add-to-playlist-btn').addEventListener('click', addToPlaylist);
    document.getElementById('next-video-btn').addEventListener('click', playNextInPlaylist);
    document.getElementById('prev-video-btn').addEventListener('click', playPrevInPlaylist);

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
        document.getElementById('settings-danmaku').checked = currentRoom?.danmakuEnabled !== false;
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

    // 弹幕
    document.getElementById('danmaku-toggle-btn').addEventListener('click', toggleDanmaku);
    document.getElementById('danmaku-send-btn').addEventListener('click', sendDanmaku);
    document.getElementById('danmaku-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendDanmaku();
    });

    // 语音
    document.getElementById('voice-btn').addEventListener('click', toggleVoiceChat);
    document.getElementById('voice-mute-btn').addEventListener('click', toggleMute);
    document.getElementById('voice-leave-btn').addEventListener('click', leaveVoiceChat);

    // 屏幕分享
    document.getElementById('screen-share-btn').addEventListener('click', toggleScreenShare);
    document.getElementById('stop-screen-share-btn').addEventListener('click', stopScreenShare);

    // 定时关闭
    document.getElementById('timer-btn').addEventListener('click', openTimerModal);
    document.getElementById('cancel-timer-modal').addEventListener('click', closeTimerModal);
    document.getElementById('cancel-timer-btn').addEventListener('click', cancelTimer);
    document.getElementById('timer-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const custom = document.getElementById('timer-minutes').value;
        const minutes = custom ? parseInt(custom, 10) : 30;
        if (minutes > 0 && minutes <= 480) setTimer(minutes);
        closeTimerModal();
    });
    document.querySelectorAll('.timer-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timer-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('timer-minutes').value = btn.dataset.min;
        });
    });

    // 休息提醒
    document.getElementById('rest-ok-btn').addEventListener('click', () => dismissRestReminder(false));
    document.getElementById('rest-later-btn').addEventListener('click', () => dismissRestReminder(true));

    // Bilibili 登录
    document.getElementById('bilibili-login-btn')?.addEventListener('click', openBilibiliLogin);
    document.getElementById('cancel-bilibili-login')?.addEventListener('click', closeBilibiliLogin);
    document.getElementById('go-bilibili-login')?.addEventListener('click', goToBilibiliLogin);

    // 弹幕屏蔽
    document.getElementById('danmaku-block-btn')?.addEventListener('click', openDanmakuBlockModal);
    document.getElementById('cancel-danmaku-block')?.addEventListener('click', closeDanmakuBlockModal);
    document.getElementById('save-danmaku-block')?.addEventListener('click', saveBlockedKeywords);

    // 私聊
    document.getElementById('close-private-chat')?.addEventListener('click', closePrivateChat);
    document.getElementById('private-chat-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        sendPrivateMessage();
    });
    document.getElementById('private-chat-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendPrivateMessage();
    });
}

// ===== 事件委托（替代 onclick） =====
function setupDelegatedEventListeners() {
    // 观看历史点击
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-history-index]');
        if (el) {
            const url = el.dataset.videoUrl;
            if (url) joinHistoryRoom(url);
        }
    });

    // 收藏房间点击
    document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-favorite-id]');
        if (item && !e.target.closest('[data-remove-index]')) {
            const roomId = item.dataset.favoriteId;
            if (roomId) joinRoom(roomId);
        }
        const removeBtn = e.target.closest('[data-remove-index]');
        if (removeBtn) {
            const roomId = removeBtn.closest('[data-favorite-id]')?.dataset.favoriteId;
            if (roomId) removeFavorite(roomId);
        }
    });

    // 播放列表点击
    document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-playlist-index]');
        if (item && !e.target.closest('[data-remove-playlist]')) {
            const index = parseInt(item.dataset.playlistIndex, 10);
            if (!isNaN(index)) playPlaylistIndex(index);
        }
        const removeBtn = e.target.closest('[data-remove-playlist]');
        if (removeBtn) {
            const index = parseInt(removeBtn.dataset.removePlaylist, 10);
            if (!isNaN(index)) removeFromPlaylist(index);
        }
    });
}

// ===== 视频事件 =====
function setupVideoEvents() {
    const video = document.getElementById('video-player');

    video.addEventListener('play', () => {
        if (socket && currentRoom && isHost && !_isRemoteSyncing && currentVideoType === 'native') {
            socket.emit('video-play', { roomId: currentRoom.id, currentTime: video.currentTime });
        }
    });

    video.addEventListener('pause', () => {
        if (socket && currentRoom && isHost && !_isRemoteSyncing && currentVideoType === 'native') {
            socket.emit('video-pause', { roomId: currentRoom.id, currentTime: video.currentTime });
        }
    });

    video.addEventListener('seeked', () => {
        if (socket && currentRoom && isHost && !_isRemoteSyncing && currentVideoType === 'native') {
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

    // 视频结束自动播放下一个
    video.addEventListener('ended', () => {
        if (isHost && playlist.length > 0 && currentPlaylistIndex < playlist.length - 1) {
            playNextInPlaylist();
        }
    });
}

// ===== 文件分享 =====
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    pendingFile = file;
    const content = document.getElementById('file-preview-content');
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('文件大小不能超过 5MB');
        pendingFile = null;
        return;
    }
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            content.innerHTML = `<img src="${escapeHtml(ev.target.result)}" alt="${escapeHtml(file.name)}"><div class="file-preview-info">${escapeHtml(file.name)} (${formatFileSize(file.size)})</div>`;
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            content.innerHTML = `<video src="${escapeHtml(ev.target.result)}" controls></video><div class="file-preview-info">${escapeHtml(file.name)} (${formatFileSize(file.size)})</div>`;
        };
        reader.readAsDataURL(file);
    } else {
        content.innerHTML = `
            <div class="msg-file-icon">\u1F4C4</div>
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
        socket.emit('share-file', {
            roomId: currentRoom.id,
            username: currentUser.username,
            fileName: pendingFile.name,
            fileSize: pendingFile.size,
            fileType: pendingFile.type,
            fileData: ev.target.result
        });
        document.getElementById('file-preview-modal').classList.add('hidden');
        pendingFile = null;
    };
    reader.readAsDataURL(pendingFile);
}

// ===== 个人资料 =====
function openProfileModal() {
    const preview = document.getElementById('profile-avatar-preview');
    const bioInput = document.getElementById('profile-bio');

    if (currentUser?.avatar) {
        preview.src = currentUser.avatar;
        avatarBase64 = currentUser.avatar;
    } else {
        preview.src = generateDefaultAvatar(currentUser.username);
        avatarBase64 = null;
    }
    bioInput.value = currentUser?.bio || '';
    document.getElementById('profile-modal').classList.remove('hidden');
}

function generateDefaultAvatar(name) {
    // 使用 Canvas 生成首字母头像，不依赖外部 API
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#667eea';
    ctx.fillRect(0, 0, 80, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (name || 'U').charAt(0).toUpperCase();
    ctx.fillText(letter, 40, 40);
    return canvas.toDataURL('image/png');
}

function handleAvatarSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        alert('头像大小不能超过 2MB');
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        avatarBase64 = ev.target.result;
        document.getElementById('profile-avatar-preview').src = avatarBase64;
    };
    reader.readAsDataURL(file);
}

async function saveProfile() {
    if (!currentUser) return;
    const bio = document.getElementById('profile-bio').value;

    try {
        const response = await apiFetch(`${API_URL}/api/users/${encodeURIComponent(currentUser.id)}/profile`, {
            method: 'PUT',
            body: JSON.stringify({ avatar: avatarBase64, bio })
        });
        const data = await response.json();
        if (data.success) {
            currentUser.avatar = avatarBase64;
            currentUser.bio = bio;
            localStorage.setItem('sc_user', JSON.stringify(currentUser));
            updateUserAvatarUI();
            document.getElementById('profile-modal').classList.add('hidden');
        }
    } catch (err) {
        console.error('保存资料失败:', err);
    }
}

function updateUserAvatarUI() {
    const lobbyAvatar = document.getElementById('lobby-avatar');
    if (lobbyAvatar) {
        if (currentUser?.avatar) {
            lobbyAvatar.src = currentUser.avatar;
            lobbyAvatar.style.display = 'block';
        } else {
            lobbyAvatar.src = generateDefaultAvatar(currentUser?.username);
            lobbyAvatar.style.display = 'block';
        }
    }
}

// ===== 房间设置 =====
function saveRoomSettings() {
    if (!isHost || !socket || !currentRoom) return;
    const announcement = document.getElementById('settings-announcement').value;
    const isPublic = document.getElementById('settings-public').checked;
    const danmaku = document.getElementById('settings-danmaku').checked;

    socket.emit('update-room-settings', {
        roomId: currentRoom.id,
        announcement,
        isPublic,
        danmakuEnabled: danmaku
    });

    currentRoom.announcement = announcement;
    currentRoom.isPublic = isPublic;
    currentRoom.danmakuEnabled = danmaku;
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
            authToken = data.token;
            if (data.user.favorites) favorites = data.user.favorites;
            localStorage.setItem('sc_user', JSON.stringify(currentUser));
            localStorage.setItem('sc_token', authToken);
            connectSocket();
            showLobby();
            updateUserAvatarUI();
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
    cleanupVoiceChat();
    stopScreenShare();
    cancelTimer();
    currentUser = null;
    authToken = null;
    currentRoom = null;
    localStorage.removeItem('sc_user');
    localStorage.removeItem('sc_token');
    showAuth();
}

// ===== 房间操作 =====
function createRoom() {
    const name = document.getElementById('room-name').value.trim();
    const videoUrl = document.getElementById('room-video').value.trim();
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
        socket.emit('join-room', { roomId, password, username: currentUser.username });
    }
}

function leaveRoom() {
    if (socket) socket.emit('leave-room');
    currentRoom = null;
    isHost = false;
    members = [];
    currentVideoType = 'native';
    playlist = [];
    currentPlaylistIndex = -1;

    const video = document.getElementById('video-player');
    video.pause();
    video.src = '';
    video.srcObject = null;

    const externalPlayer = document.getElementById('external-player');
    externalPlayer.innerHTML = '';
    externalPlayer.classList.add('hidden');
    video.classList.remove('hidden');

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('danmaku-layer').innerHTML = '';

    cleanupVoiceChat();
    stopScreenShare();
    cancelTimer();

    showLobby();
    loadRooms();
}

function syncVideoState(videoState) {
    if (currentVideoType !== 'native') return;
    const video = document.getElementById('video-player');
    if (videoState.currentTime) video.currentTime = videoState.currentTime;
    if (videoState.playbackRate) {
        video.playbackRate = videoState.playbackRate;
        document.getElementById('rate-select').value = videoState.playbackRate;
    }
    if (videoState.isPlaying) video.play(); else video.pause();
}

// ===== 聊天 =====
function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message || !socket || !currentRoom) return;
    socket.emit('chat-message', { roomId: currentRoom.id, message, username: currentUser.username });
    input.value = '';
}

function addChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const isOwn = msg.username === currentUser?.username;
    const div = document.createElement('div');
    div.className = `chat-message ${isOwn ? 'own' : ''}`;

    if (msg.type === 'file') {
        let fileContent = '';
        if (msg.fileType?.startsWith('image/')) {
            // 使用 data-url 安全地展示图片，不使用 onclick 属性
            const imgId = 'img-' + Math.random().toString(36).slice(2);
            fileContent = `<img class="msg-file-image" id="${imgId}" src="${escapeHtml(msg.fileData)}" alt="${escapeHtml(msg.fileName)}">`;
            // 延迟绑定点击事件
            setTimeout(() => {
                const img = document.getElementById(imgId);
                if (img) img.addEventListener('click', () => window.open(msg.fileData));
            }, 0);
        } else {
            const icon = msg.fileType?.startsWith('video/') ? '\u1F3AC' : msg.fileType?.startsWith('audio/') ? '\u1F3B5' : '\u1F4C4';
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
        div.innerHTML = `<div class="msg-user">${escapeHtml(msg.username)}</div>${fileContent}<div class="msg-time">${formatTime(msg.timestamp)}</div>`;
    } else {
        div.innerHTML = `<div class="msg-user">${escapeHtml(msg.username)}</div><div class="msg-text">${escapeHtml(msg.message)}</div><div class="msg-time">${formatTime(msg.timestamp)}</div>`;
    }
    container.appendChild(div);
    // 限制聊天消息 DOM 数量，防止内存泄漏
    while (container.children.length > 200) {
        container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    container.appendChild(div);
    // 限制聊天消息 DOM 数量
    while (container.children.length > 200) {
        container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
}

// ===== UI 更新 =====
function updateMembersList() {
    const list = document.getElementById('members-list');
    list.innerHTML = members.map(member => `
        <li class="member-item ${member === currentRoom?.host ? 'host' : ''}" data-username="${escapeHtml(member)}">
            ${escapeHtml(member)} ${member === currentRoom?.host ? '(房主)' : ''}
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
    container.innerHTML = roomList.map((room, i) => `
        <div class="room-card" data-room-id="${escapeHtml(room.id)}" data-has-password="${room.hasPassword}" data-room-name="${escapeHtml(room.name)}">
            <div class="room-card-header">
                <h3>${escapeHtml(room.name)}</h3>
                ${room.hasPassword ? '<span class="room-visibility room-password">\u1F512 有密码</span>' : ''}
            </div>
            <div class="room-card-meta">
                <span>\u1F465 ${room.memberCount} 人</span>
                <span>${room.isPublic ? '\u1F310 公开' : '\u1F512 私密'}</span>
            </div>
            <div class="room-card-footer">
                <span class="room-host">房主: ${escapeHtml(room.host)}</span>
                <span class="room-visibility ${room.isPublic ? 'room-public' : 'room-private'}">${room.isPublic ? '公开' : '私密'}</span>
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
    if (socket) socket.emit('get-rooms');
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
    updateUserAvatarUI();
    renderFavorites();
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

// ===== 房间卡片点击委托 =====
document.addEventListener('click', (e) => {
    const card = e.target.closest('.room-card[data-room-id]');
    if (card) {
        const roomId = card.dataset.roomId;
        const hasPassword = card.dataset.hasPassword === 'true';
        const roomName = card.dataset.roomName;
        handleRoomClick(roomId, hasPassword, roomName);
    }
});

// ===== 工具函数 =====
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

// ===== 私聊功能 =====

function openPrivateChat(targetUsername) {
    if (!currentUser || targetUsername === currentUser.username) return;
    privateChatTarget = { id: null, username: targetUsername };
    privateChatOpen = true;
    privateChatMessages = [];
    document.getElementById('private-chat-modal').classList.remove('hidden');
    document.getElementById('private-chat-title').textContent = `私聊: ${targetUsername}`;
    document.getElementById('private-chat-messages').innerHTML = '';
    loadPrivateChatHistory(targetUsername);
}

function closePrivateChat() {
    privateChatOpen = false;
    privateChatTarget = null;
    privateChatMessages = [];
    document.getElementById('private-chat-modal').classList.add('hidden');
}

async function loadPrivateChatHistory(targetUsername) {
    if (!authToken) return;
    // 通过用户名查找用户 ID（简化：使用 members 列表）
    // 实际应通过 API 获取用户 ID，这里简化处理
}

function sendPrivateMessage() {
    const input = document.getElementById('private-chat-input');
    const text = input.value.trim();
    if (!text || !socket || !privateChatTarget) return;
    if (text.length > 1000) {
        alert('消息不能超过1000字');
        return;
    }

    socket.emit('private-message', {
        toUserId: privateChatTarget.username, // 简化：使用 username 作为 ID
        message: text,
        fromUsername: currentUser.username
    });

    input.value = '';
}

function renderPrivateChat() {
    const container = document.getElementById('private-chat-messages');
    if (!container) return;
    container.innerHTML = privateChatMessages.map(msg => {
        const isSelf = msg.from === currentUser?.id || msg.fromUsername === currentUser?.username;
        return `
            <div class="private-msg ${isSelf ? 'self' : 'other'}">
                <div class="private-msg-sender">${escapeHtml(msg.fromUsername)}</div>
                <div class="private-msg-content">${escapeHtml(msg.message)}</div>
                <div class="private-msg-time">${formatTime(msg.timestamp)}</div>
            </div>
        `;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

function showPrivateMessageNotification(msg) {
    // 显示一个简单的通知
    const notification = document.createElement('div');
    notification.className = 'private-notification';
    notification.innerHTML = `
        <strong>${escapeHtml(msg.fromUsername)}</strong>: ${escapeHtml(msg.message.substring(0, 30))}${msg.message.length > 30 ? '...' : ''}
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// 点击成员列表中的用户头像或用户名打开私聊
function setupPrivateChatListeners() {
    const membersList = document.getElementById('members-list');
    if (!membersList) return;
    membersList.addEventListener('click', (e) => {
        const memberEl = e.target.closest('.member-item');
        if (memberEl) {
            const username = memberEl.dataset.username;
            if (username && username !== currentUser?.username) {
                openPrivateChat(username);
            }
        }
    });
}
