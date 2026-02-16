const { TextOperation } = require('./ot');

/**
 * Document model with OT support
 * Manages the document state and operation history
 */
class Document {
  constructor(id, initialContent = '') {
    this.id = id;
    this.content = initialContent;
    this.operations = []; // History of all operations
    this.revision = 0;    // Current revision number
    this.users = new Map(); // userId -> { cursor, selection }
  }

  /**
   * Apply an operation to the document
   * Returns the new revision number
   */
  applyOperation(operation, userId) {
    // Validate operation
    if (operation.baseLength !== this.content.length) {
      throw new Error('Operation base length mismatch');
    }
    
    // Apply the operation
    this.content = operation.apply(this.content);
    this.operations.push({
      operation: operation.toJSON(),
      userId,
      revision: this.revision,
      timestamp: Date.now()
    });
    this.revision++;
    
    return this.revision;
  }

  /**
   * Transform a pending operation against all operations since its base
   * Used when a client sends an operation based on an old revision
   */
  transformOperation(operation, baseRevision) {
    let transformedOp = operation;
    
    for (let i = baseRevision; i < this.revision; i++) {
      const historicOp = TextOperation.fromJSON(this.operations[i].operation);
      const [newOp] = TextOperation.transform(transformedOp, historicOp);
      transformedOp = newOp;
    }
    
    return transformedOp;
  }

  /**
   * Get operations from a specific revision onwards
   */
  getOperationsSince(revision) {
    return this.operations.slice(revision).map(op => ({
      ...op,
      operation: op.operation
    }));
  }

  /**
   * Add or update a user
   */
  addUser(userId, userInfo) {
    this.users.set(userId, {
      ...userInfo,
      joinedAt: Date.now()
    });
  }

  /**
   * Remove a user
   */
  removeUser(userId) {
    this.users.delete(userId);
  }

  /**
   * Update user cursor position
   */
  updateCursor(userId, position) {
    if (this.users.has(userId)) {
      this.users.get(userId).cursor = position;
    }
  }

  /**
   * Get all connected users
   */
  getUsers() {
    const result = {};
    for (const [id, info] of this.users) {
      result[id] = info;
    }
    return result;
  }

  /**
   * Get document state for new connections
   */
  getState() {
    return {
      content: this.content,
      revision: this.revision,
      users: this.getUsers()
    };
  }
}

/**
 * Document manager - handles multiple documents
 */
class DocumentManager {
  constructor() {
    this.documents = new Map();
  }

  getOrCreate(id, initialContent = '') {
    if (!this.documents.has(id)) {
      this.documents.set(id, new Document(id, initialContent));
    }
    return this.documents.get(id);
  }

  get(id) {
    return this.documents.get(id);
  }

  delete(id) {
    this.documents.delete(id);
  }

  list() {
    return Array.from(this.documents.keys());
  }
}

module.exports = { Document, DocumentManager };