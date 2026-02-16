const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { TextOperation } = require('./ot');
const { DocumentManager } = require('./document');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Document manager
const docManager = new DocumentManager();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  let currentDocId = null;
  let userId = null;

  /**
   * Join a document room
   */
  socket.on('join-room', ({ roomId, username }) => {
    // Leave previous room if any
    if (currentDocId) {
      socket.leave(currentDocId);
      const doc = docManager.get(currentDocId);
      if (doc) {
        doc.removeUser(userId);
        socket.to(currentDocId).emit('user-left', { userId });
      }
    }

    // Join new room
    currentDocId = roomId;
    userId = uuidv4();
    
    socket.join(roomId);
    
    // Get or create document
    const doc = docManager.getOrCreate(roomId, '// Start coding...\n');
    
    // Add user to document
    doc.addUser(userId, {
      username: username || `User ${userId.slice(0, 4)}`,
      socketId: socket.id,
      color: generateUserColor()
    });

    // Send initial state to new user
    socket.emit('init', {
      userId,
      ...doc.getState()
    });

    // Notify others about new user
    socket.to(roomId).emit('user-joined', {
      userId,
      user: doc.getUsers()[userId]
    });

    console.log(`User ${userId} joined room ${roomId}`);
  });

  /**
   * Handle edit operations
   */
  socket.on('operation', ({ revision, operation }) => {
    if (!currentDocId) return;
    
    const doc = docManager.get(currentDocId);
    if (!doc) return;

    try {
      // Parse operation
      let op = TextOperation.fromJSON(operation);
      
      // Transform if needed (client is behind)
      if (revision < doc.revision) {
        op = doc.transformOperation(op, revision);
      }
      
      // Apply to document
      const newRevision = doc.applyOperation(op, userId);
      
      // Broadcast to other clients
      socket.to(currentDocId).emit('operation', {
        operation: op.toJSON(),
        userId,
        revision: newRevision - 1
      });
      
      // Acknowledge to sender
      socket.emit('ack', { revision: newRevision });
      
    } catch (err) {
      console.error('Operation error:', err.message);
      socket.emit('error', { message: err.message });
    }
  });

  /**
   * Handle cursor position updates
   */
  socket.on('cursor-move', ({ position }) => {
    if (!currentDocId || !userId) return;
    
    const doc = docManager.get(currentDocId);
    if (doc) {
      doc.updateCursor(userId, position);
      socket.to(currentDocId).emit('cursor-update', {
        userId,
        position
      });
    }
  });

  /**
   * Handle selection updates
   */
  socket.on('selection-change', ({ selection }) => {
    if (!currentDocId || !userId) return;
    
    socket.to(currentDocId).emit('selection-update', {
      userId,
      selection
    });
  });

  /**
   * Handle disconnect
   */
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (currentDocId && userId) {
      const doc = docManager.get(currentDocId);
      if (doc) {
        doc.removeUser(userId);
        socket.to(currentDocId).emit('user-left', { userId });
      }
    }
  });
});

/**
 * Generate a consistent color for a user
 */
function generateUserColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    documents: docManager.list().length,
    connections: io.engine.clientsCount
  });
});

// List active documents
app.get('/docs', (req, res) => {
  const docs = docManager.list().map(id => {
    const doc = docManager.get(id);
    return {
      id,
      revision: doc.revision,
      users: Object.keys(doc.getUsers()).length,
      length: doc.content.length
    };
  });
  res.json(docs);
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Collaborative Editor Server running on port ${PORT}`);
  console.log(`📁 Open http://localhost:${PORT} to start editing`);
});

module.exports = { app, httpServer };