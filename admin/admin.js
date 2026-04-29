const API_URL = window.location.origin;
const ADMIN_KEY = 'admin123';

// 状态管理
let currentAdmin = null;
let users = [];
let rooms = [];

// DOM 元素
const loginPage = document.getElementById('login-page');
const dashboardPage = document.getElementById('dashboard-page');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const adminName = document.getElementById('admin-name');

// 安全工具
function escapeHtml(text) {
    if (text == null) return '';
    const str = String(text);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    setupDelegatedEvents();
});

// 检查认证状态
function checkAuth() {
    const saved = localStorage.getItem('sc_admin');
    if (saved) {
        try {
            currentAdmin = JSON.parse(saved);
            if (currentAdmin.role === 'admin') {
                showDashboard();
                loadData();
            } else {
                localStorage.removeItem('sc_admin');
                showLogin();
            }
        } catch (e) {
            showLogin();
        }
    } else {
        showLogin();
    }
}

// 设置事件监听
function setupEventListeners() {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        await login(username, password);
    });

    logoutBtn.addEventListener('click', logout);

    document.querySelectorAll('.sidebar li').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });

    document.getElementById('user-search').addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });

    document.getElementById('room-search').addEventListener('input', (e) => {
        filterRooms(e.target.value);
    });
}

// 事件委托（替代 onclick）
function setupDelegatedEvents() {
    document.addEventListener('click', (e) => {
        const banBtn = e.target.closest('[data-ban-user]');
        if (banBtn) {
            const userId = banBtn.dataset.banUser;
            const currentStatus = banBtn.dataset.currentStatus;
            toggleUserStatus(userId, currentStatus);
        }

        const delUserBtn = e.target.closest('[data-delete-user]');
        if (delUserBtn) {
            const userId = delUserBtn.dataset.deleteUser;
            deleteUser(userId);
        }

        const delRoomBtn = e.target.closest('[data-delete-room]');
        if (delRoomBtn) {
            const roomId = delRoomBtn.dataset.deleteRoom;
            deleteRoom(roomId);
        }
    });
}

// 登录
async function login(username, password) {
    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            if (data.user.role !== 'admin') {
                loginError.textContent = '只有管理员可以登录后台';
                return;
            }
            currentAdmin = data.user;
            localStorage.setItem('sc_admin', JSON.stringify(currentAdmin));
            showDashboard();
            loadData();
        } else {
            loginError.textContent = data.message || '登录失败';
        }
    } catch (error) {
        loginError.textContent = '网络错误，请检查服务器连接';
        console.error('登录错误:', error);
    }
}

// 退出登录
function logout() {
    currentAdmin = null;
    localStorage.removeItem('sc_admin');
    showLogin();
}

// 显示登录页
function showLogin() {
    loginPage.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
    loginForm.reset();
    loginError.textContent = '';
}

// 显示管理页
function showDashboard() {
    loginPage.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
    adminName.textContent = currentAdmin?.username || 'Admin';
}

// 切换标签
function switchTab(tab) {
    document.querySelectorAll('.sidebar li').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}-tab`);
    });

    if (tab === 'users') {
        loadUsers();
    } else if (tab === 'rooms') {
        loadRooms();
    } else if (tab === 'stats') {
        loadStats();
    }
}

// 加载数据
async function loadData() {
    await Promise.all([loadUsers(), loadRooms()]);
    loadStats();
}

// 加载用户列表
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/users?adminKey=${encodeURIComponent(ADMIN_KEY)}`);
        const data = await response.json();

        if (data.success) {
            users = data.users;
            renderUsers(users);
        } else {
            console.error('加载用户失败:', data.message);
        }
    } catch (error) {
        console.error('加载用户失败:', error);
    }
}

// 渲染用户列表
function renderUsers(userList) {
    const tbody = document.getElementById('users-tbody');

    if (userList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-state-icon">👤</div>
                    <p>暂无用户</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = userList.map(user => {
        const isAdmin = user.role === 'admin';
        const actionButtons = isAdmin
            ? '<span style="color: #999; font-size: 12px;">不可操作</span>'
            : `
                <button class="btn ${user.status === 'active' ? 'btn-warning' : 'btn-success'}"
                        data-ban-user="${escapeHtml(user.id)}"
                        data-current-status="${escapeHtml(user.status)}">
                    ${user.status === 'active' ? '封禁' : '解封'}
                </button>
                <button class="btn btn-danger" data-delete-user="${escapeHtml(user.id)}">
                    删除
                </button>
            `;
        return `
            <tr>
                <td>${escapeHtml(user.id.substring(0, 8))}...</td>
                <td>${escapeHtml(user.username)}</td>
                <td><span class="status-badge ${isAdmin ? 'role-admin' : 'role-user'}">${isAdmin ? '管理员' : '用户'}</span></td>
                <td><span class="status-badge ${user.status === 'active' ? 'status-active' : 'status-banned'}">${user.status === 'active' ? '正常' : '封禁'}</span></td>
                <td>${formatDate(user.createdAt)}</td>
                <td>${user.lastLogin ? formatDate(user.lastLogin) : '从未登录'}</td>
                <td>
                    <div class="actions">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 加载房间列表
async function loadRooms() {
    try {
        const response = await fetch(`${API_URL}/api/rooms`);
        const data = await response.json();

        if (data.success) {
            rooms = data.rooms;
            renderRooms(rooms);
        }
    } catch (error) {
        console.error('加载房间失败:', error);
    }
}

// 渲染房间列表
function renderRooms(roomList) {
    const tbody = document.getElementById('rooms-tbody');

    if (roomList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-state-icon">🏠</div>
                    <p>暂无房间</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = roomList.map(room => `
        <tr>
            <td>${escapeHtml(room.id.substring(0, 8))}...</td>
            <td>${escapeHtml(room.name)}</td>
            <td>${escapeHtml(room.host)}</td>
            <td><span class="status-badge ${room.isPublic ? 'status-active' : 'status-banned'}">${room.isPublic ? '公开' : '私密'}</span></td>
            <td>${room.memberCount}</td>
            <td>${room.videoUrl ? escapeHtml(room.videoUrl.substring(0, 30)) + '...' : '无'}</td>
            <td>${formatDate(room.createdAt)}</td>
            <td>
                <div class="actions">
                    <button class="btn btn-danger" data-delete-room="${escapeHtml(room.id)}">
                        删除
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 加载统计
function loadStats() {
    document.getElementById('total-users').textContent = users.length;
    document.getElementById('total-rooms').textContent = rooms.length;
    document.getElementById('active-users').textContent = users.filter(u => u.status === 'active').length;
    document.getElementById('banned-users').textContent = users.filter(u => u.status === 'banned').length;
}

// 过滤用户
function filterUsers(query) {
    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(query.toLowerCase()) ||
        u.id.includes(query)
    );
    renderUsers(filtered);
}

// 过滤房间
function filterRooms(query) {
    const filtered = rooms.filter(r =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.host.toLowerCase().includes(query.toLowerCase()) ||
        r.id.includes(query)
    );
    renderRooms(filtered);
}

// 切换用户状态
async function toggleUserStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    const action = newStatus === 'banned' ? '封禁' : '解封';

    if (!confirm(`确定要${action}该用户吗？`)) return;

    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/status?adminKey=${encodeURIComponent(ADMIN_KEY)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        const data = await response.json();
        if (data.success) {
            loadUsers();
            loadStats();
        } else {
            alert(data.message || '操作失败');
        }
    } catch (error) {
        console.error('操作失败:', error);
        alert('操作失败');
    }
}

// 删除用户
async function deleteUser(userId) {
    if (!confirm('确定要删除该用户吗？此操作不可恢复！')) return;

    try {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}?adminKey=${encodeURIComponent(ADMIN_KEY)}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            loadUsers();
            loadStats();
        } else {
            alert(data.message || '删除失败');
        }
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败');
    }
}

// 删除房间
async function deleteRoom(roomId) {
    if (!confirm('确定要删除该房间吗？')) return;

    try {
        const response = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}?adminKey=${encodeURIComponent(ADMIN_KEY)}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            loadRooms();
            loadStats();
        } else {
            alert(data.message || '删除失败');
        }
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败');
    }
}

// 格式化日期
function formatDate(dateString) {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
