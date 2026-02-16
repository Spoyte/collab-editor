/**
 * Client-side collaborative editor
 * Handles OT operations, WebSocket communication, and UI updates
 */

// Global state
let socket = null;
let currentRoomId = null;
let currentUserId = null;
let revision = 0;
let documentContent = '';
let isApplyingRemoteOperation = false;
let pendingOperations = [];
let users = {};
let myUsername = '';

// DOM Elements
const editor = document.getElementById('editor');
const loginModal = document.getElementById('loginModal');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const roomIdDisplay = document.getElementById('roomId');
const userList = document.getElementById('userList');
const userAvatars = document.getElementById('userAvatars');
const charCount = document.getElementById('charCount');
const lineCount = document.getElementById('lineCount');
const syncStatus = document.getElementById('syncStatus');

/**
 * Initialize Socket.io connection
 */
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        updateConnectionStatus('connected');
    });
    
    socket.on('disconnect', () => {
        updateConnectionStatus('disconnected');
    });
    
    socket.on('connect_error', () => {
        updateConnectionStatus('disconnected');
    });
    
    // Receive initial document state
    socket.on('init', (data) => {
        currentUserId = data.userId;
        revision = data.revision;
        documentContent = data.content;
        users = data.users || {};
        
        editor.value = documentContent;
        updateStats();
        renderUsers();
        
        syncStatus.textContent = 'Synced';
    });
    
    // Receive operation from another user
    socket.on('operation', (data) => {
        applyRemoteOperation(data.operation);
        revision = data.revision + 1;
    });
    
    // Acknowledgment from server
    socket.on('ack', (data) => {
        revision = data.revision;
        syncStatus.textContent = 'Synced';
        
        // Send any pending operations
        if (pendingOperations.length > 0) {
            const nextOp = pendingOperations.shift();
            sendOperation(nextOp);
        }
    });
    
    // User joined
    socket.on('user-joined', (data) => {
        users[data.userId] = data.user;
        renderUsers();
        showNotification(`${data.user.username} joined`);
    });
    
    // User left
    socket.on('user-left', (data) => {
        const username = users[data.userId]?.username || 'Someone';
        delete users[data.userId];
        renderUsers();
        removeRemoteCursor(data.userId);
        showNotification(`${username} left`);
    });
    
    // Cursor update
    socket.on('cursor-update', (data) => {
        if (data.userId !== currentUserId) {
            updateRemoteCursor(data.userId, data.position);
        }
    });
    
    // Error
    socket.on('error', (data) => {
        console.error('Server error:', data.message);
        syncStatus.textContent = 'Error';
    });
}

/**
 * Join a room
 */
function joinRoom() {
    const usernameInput = document.getElementById('username');
    const roomIdInput = document.getElementById('roomId');
    
    myUsername = usernameInput.value.trim() || `User ${Math.floor(Math.random() * 1000)}`;
    currentRoomId = roomIdInput.value.trim() || generateRoomId();
    
    // Update UI
    roomIdDisplay.textContent = currentRoomId;
    loginModal.classList.add('hidden');
    
    // Join via socket
    socket.emit('join-room', {
        roomId: currentRoomId,
        username: myUsername
    });
}

/**
 * Generate a random room ID
 */
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Update connection status UI
 */
function updateConnectionStatus(status) {
    statusDot.className = 'status-dot';
    
    switch (status) {
        case 'connected':
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            break;
        case 'disconnected':
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
            break;
        case 'connecting':
            statusDot.classList.add('connecting');
            statusText.textContent = 'Connecting...';
            break;
    }
}

/**
 * Render user list
 */
function renderUsers() {
    userList.innerHTML = '';
    userAvatars.innerHTML = '';
    
    for (const [userId, user] of Object.entries(users)) {
        // Add to list
        const userItem = document.createElement('div');
        userItem.className = `user-item ${userId === currentUserId ? 'you' : ''}`;
        userItem.innerHTML = `
            <span class="color-dot" style="background: ${user.color}"></span>
            <span>${user.username}</span>
        `;
        userList.appendChild(userItem);
        
        // Add avatar to header
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.background = user.color;
        avatar.textContent = user.username.charAt(0).toUpperCase();
        avatar.title = user.username;
        userAvatars.appendChild(avatar);
    }
}

/**
 * Handle editor input
 */
let lastValue = '';
let inputTimeout = null;

editor.addEventListener('input', (e) => {
    if (isApplyingRemoteOperation) return;
    
    const newValue = editor.value;
    const operation = createOperation(lastValue, newValue);
    
    if (operation) {
        documentContent = newValue;
        sendOperation(operation);
        updateStats();
    }
    
    lastValue = newValue;
});

/**
 * Create an OT operation from old to new value
 */
function createOperation(oldValue, newValue) {
    if (oldValue === newValue) return null;
    
    // Simple diff - find common prefix and suffix
    let commonStart = 0;
    while (commonStart < oldValue.length && 
           commonStart < newValue.length &&
           oldValue[commonStart] === newValue[commonStart]) {
        commonStart++;
    }
    
    let commonEnd = 0;
    while (commonEnd < oldValue.length - commonStart &&
           commonEnd < newValue.length - commonStart &&
           oldValue[oldValue.length - 1 - commonEnd] === newValue[newValue.length - 1 - commonEnd]) {
        commonEnd++;
    }
    
    const deleted = oldValue.slice(commonStart, oldValue.length - commonEnd);
    const inserted = newValue.slice(commonStart, newValue.length - commonEnd);
    
    return {
        ops: [
            { retain: commonStart },
            ...(deleted ? [{ delete: deleted.length }] : []),
            ...(inserted ? [{ insert: inserted }] : []),
            ...(commonEnd > 0 ? [{ retain: commonEnd }] : [])
        ],
        baseLength: oldValue.length,
        targetLength: newValue.length
    };
}

/**
 * Send operation to server
 */
function sendOperation(operation) {
    syncStatus.textContent = 'Syncing...';
    
    socket.emit('operation', {
        revision,
        operation
    });
}

/**
 * Apply remote operation to local editor
 */
function applyRemoteOperation(operation) {
    isApplyingRemoteOperation = true;
    
    const oldValue = editor.value;
    const newValue = applyOperation(oldValue, operation);
    
    // Save cursor position
    const cursorStart = editor.selectionStart;
    const cursorEnd = editor.selectionEnd;
    
    // Apply change
    editor.value = newValue;
    documentContent = newValue;
    lastValue = newValue;
    
    // Restore cursor (adjust if needed)
    editor.selectionStart = cursorStart;
    editor.selectionEnd = cursorEnd;
    
    updateStats();
    
    isApplyingRemoteOperation = false;
}

/**
 * Apply an operation to a string
 */
function applyOperation(doc, operation) {
    let result = '';
    let index = 0;
    
    for (const op of operation.ops) {
        if (op.retain) {
            result += doc.slice(index, index + op.retain);
            index += op.retain;
        } else if (op.insert) {
            result += op.insert;
        } else if (op.delete) {
            index += op.delete;
        }
    }
    
    return result;
}

/**
 * Handle cursor movement
 */
let lastCursorPos = 0;

editor.addEventListener('keyup', () => {
    const pos = editor.selectionStart;
    if (pos !== lastCursorPos) {
        lastCursorPos = pos;
        socket.emit('cursor-move', { position: pos });
    }
});

editor.addEventListener('click', () => {
    const pos = editor.selectionStart;
    lastCursorPos = pos;
    socket.emit('cursor-move', { position: pos });
});

/**
 * Update remote cursor position
 */
function updateRemoteCursor(userId, position) {
    let cursor = document.getElementById(`cursor-${userId}`);
    const user = users[userId];
    
    if (!user) return;
    
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${userId}`;
        cursor.className = 'remote-cursor';
        cursor.style.background = user.color;
        cursor.setAttribute('data-user', user.username);
        document.getElementById('remoteCursors').appendChild(cursor);
    }
    
    // Calculate position in textarea
    const text = editor.value.substring(0, position);
    const lines = text.split('\n');
    const lineIndex = lines.length - 1;
    const charIndex = lines[lines.length - 1].length;
    
    // Position cursor (approximate based on character metrics)
    const lineHeight = 22.4; // 14px * 1.6 line-height
    const charWidth = 8.4;   // approximate monospace char width
    
    cursor.style.left = `${20 + charIndex * charWidth}px`;
    cursor.style.top = `${20 + lineIndex * lineHeight}px`;
}

/**
 * Remove remote cursor
 */
function removeRemoteCursor(userId) {
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) {
        cursor.remove();
    }
}

/**
 * Update stats
 */
function updateStats() {
    const text = editor.value;
    charCount.textContent = `${text.length} chars`;
    lineCount.textContent = `${text.split('\n').length} lines`;
}

/**
 * Copy room ID to clipboard
 */
function copyRoomId() {
    navigator.clipboard.writeText(currentRoomId).then(() => {
        showNotification('Room ID copied!');
    });
}

/**
 * Download code
 */
function downloadCode() {
    const blob = new Blob([editor.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collab-${currentRoomId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Update language (placeholder for syntax highlighting)
 */
function updateLanguage() {
    // Could be used to enable syntax highlighting
    showNotification('Language updated');
}

/**
 * Show notification
 */
function showNotification(message) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 20px;
        background: #007acc;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 13px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize
initSocket();
lastValue = editor.value;