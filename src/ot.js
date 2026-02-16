/**
 * Operational Transform (OT) Implementation
 * 
 * OT allows multiple users to edit the same document concurrently
 * without conflicts. Each operation is transformed against concurrent
 * operations to maintain consistency.
 */

class TextOperation {
  constructor() {
    this.ops = [];
    this.baseLength = 0;
    this.targetLength = 0;
  }

  /**
   * Add a retain operation - keep n characters
   */
  retain(n) {
    if (n === 0) return this;
    this.baseLength += n;
    this.targetLength += n;
    
    const lastOp = this.ops[this.ops.length - 1];
    if (lastOp && typeof lastOp.retain === 'number') {
      lastOp.retain += n;
    } else {
      this.ops.push({ retain: n });
    }
    return this;
  }

  /**
   * Add an insert operation - insert a string
   */
  insert(str) {
    if (str === '') return this;
    this.targetLength += str.length;
    
    const lastOp = this.ops[this.ops.length - 1];
    if (lastOp && typeof lastOp.insert === 'string') {
      lastOp.insert += str;
    } else {
      this.ops.push({ insert: str });
    }
    return this;
  }

  /**
   * Add a delete operation - delete n characters
   */
  delete(n) {
    if (n === 0) return this;
    this.baseLength += Math.abs(n);
    
    const lastOp = this.ops[this.ops.length - 1];
    if (lastOp && typeof lastOp.delete === 'number') {
      lastOp.delete += n;
    } else {
      this.ops.push({ delete: n });
    }
    return this;
  }

  /**
   * Apply this operation to a document string
   */
  apply(doc) {
    if (doc.length !== this.baseLength) {
      throw new Error('Document length does not match operation base length');
    }
    
    let result = '';
    let index = 0;
    
    for (const op of this.ops) {
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
   * Compose two operations: A.compose(B) = AB
   * Applying AB is equivalent to applying A then B
   */
  compose(other) {
    if (this.targetLength !== other.baseLength) {
      throw new Error('Cannot compose operations: length mismatch');
    }
    
    const result = new TextOperation();
    let i = 0, j = 0;
    let opA = this.ops[i++];
    let opB = other.ops[j++];
    
    while (opA || opB) {
      if (opA && opA.delete) {
        result.delete(opA.delete);
        opA = this.ops[i++];
      } else if (opB && opB.insert) {
        result.insert(opB.insert);
        opB = other.ops[j++];
      } else if (opA && opA.retain && opB && opB.retain) {
        const minRetain = Math.min(opA.retain, opB.retain);
        result.retain(minRetain);
        opA.retain -= minRetain;
        opB.retain -= minRetain;
        if (opA.retain === 0) opA = this.ops[i++];
        if (opB.retain === 0) opB = other.ops[j++];
      } else if (opA && opA.retain && opB && opB.delete) {
        const minLen = Math.min(opA.retain, opB.delete);
        result.delete(minLen);
        opA.retain -= minLen;
        opB.delete -= minLen;
        if (opA.retain === 0) opA = this.ops[i++];
        if (opB.delete === 0) opB = other.ops[j++];
      } else if (opA && opA.insert && opB && opB.retain) {
        const minLen = Math.min(opA.insert.length, opB.retain);
        result.insert(opA.insert.slice(0, minLen));
        opA.insert = opA.insert.slice(minLen);
        opB.retain -= minLen;
        if (opA.insert === '') opA = this.ops[i++];
        if (opB.retain === 0) opB = other.ops[j++];
      } else if (opA && opA.insert && opB && opB.delete) {
        const minLen = Math.min(opA.insert.length, opB.delete);
        opA.insert = opA.insert.slice(minLen);
        opB.delete -= minLen;
        if (opA.insert === '') opA = this.ops[i++];
        if (opB.delete === 0) opB = other.ops[j++];
      } else {
        break;
      }
    }
    
    return result;
  }

  /**
   * Transform two concurrent operations
   * Returns [operation1', operation2'] where:
   * - operation1' achieves the same effect as operation1 but accounts for operation2
   * - operation2' achieves the same effect as operation2 but accounts for operation1
   */
  static transform(op1, op2) {
    if (op1.baseLength !== op2.baseLength) {
      throw new Error('Cannot transform operations: base length mismatch');
    }
    
    const result1 = new TextOperation();
    const result2 = new TextOperation();
    
    let i = 0, j = 0;
    let a = op1.ops[i++];
    let b = op2.ops[j++];
    
    while (a || b) {
      // Handle deletes in op1
      if (a && a.delete) {
        result1.delete(a.delete);
        result2.retain(a.delete);
        a = op1.ops[i++];
        continue;
      }
      
      // Handle deletes in op2
      if (b && b.delete) {
        result1.retain(b.delete);
        result2.delete(b.delete);
        b = op2.ops[j++];
        continue;
      }
      
      // Both insert at same position: op1's insert comes first
      if (a && a.insert && b && b.insert) {
        if (a.insert.length <= b.insert.length) {
          result1.insert(a.insert);
          result2.retain(a.insert.length);
          b.insert = b.insert.slice(a.insert.length);
          a = op1.ops[i++];
          if (b.insert === '') b = op2.ops[j++];
        } else {
          result1.retain(b.insert.length);
          result2.insert(b.insert);
          a.insert = a.insert.slice(b.insert.length);
          b = op2.ops[j++];
        }
        continue;
      }
      
      // Insert in op1
      if (a && a.insert) {
        result1.insert(a.insert);
        result2.retain(a.insert.length);
        a = op1.ops[i++];
        continue;
      }
      
      // Insert in op2
      if (b && b.insert) {
        result1.retain(b.insert.length);
        result2.insert(b.insert);
        b = op2.ops[j++];
        continue;
      }
      
      // Both retain
      if (a && a.retain && b && b.retain) {
        const minLen = Math.min(a.retain, b.retain);
        result1.retain(minLen);
        result2.retain(minLen);
        a.retain -= minLen;
        b.retain -= minLen;
        if (a.retain === 0) a = op1.ops[i++];
        if (b.retain === 0) b = op2.ops[j++];
        continue;
      }
      
      break;
    }
    
    return [result1, result2];
  }

  /**
   * Serialize operation to JSON
   */
  toJSON() {
    return {
      ops: this.ops,
      baseLength: this.baseLength,
      targetLength: this.targetLength
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(json) {
    const op = new TextOperation();
    op.ops = json.ops;
    op.baseLength = json.baseLength;
    op.targetLength = json.targetLength;
    return op;
  }
}

module.exports = { TextOperation };