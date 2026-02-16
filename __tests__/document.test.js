const { Document, DocumentManager } = require('../document');
const { TextOperation } = require('../ot');

describe('Document', () => {
    let doc;

    beforeEach(() => {
        doc = new Document('test-doc', 'hello world');
    });

    test('should initialize with content', () => {
        expect(doc.content).toBe('hello world');
        expect(doc.revision).toBe(0);
    });

    test('should apply operation and increment revision', () => {
        const op = new TextOperation();
        op.retain(5).insert(' beautiful').retain(6);
        
        const newRevision = doc.applyOperation(op, 'user1');
        
        expect(doc.content).toBe('hello beautiful world');
        expect(newRevision).toBe(1);
        expect(doc.revision).toBe(1);
    });

    test('should track operation history', () => {
        const op = new TextOperation();
        op.retain(5).insert('!').retain(6);
        
        doc.applyOperation(op, 'user1');
        
        expect(doc.operations).toHaveLength(1);
        expect(doc.operations[0].userId).toBe('user1');
        expect(doc.operations[0].revision).toBe(0);
    });

    test('should add and remove users', () => {
        doc.addUser('user1', { username: 'Alice', color: '#ff0000' });
        
        expect(doc.getUsers()).toHaveProperty('user1');
        expect(doc.getUsers()['user1'].username).toBe('Alice');
        
        doc.removeUser('user1');
        
        expect(doc.getUsers()).not.toHaveProperty('user1');
    });

    test('should update cursor position', () => {
        doc.addUser('user1', { username: 'Alice' });
        doc.updateCursor('user1', 10);
        
        expect(doc.getUsers()['user1'].cursor).toBe(10);
    });

    test('should get state for new connections', () => {
        doc.addUser('user1', { username: 'Alice' });
        const state = doc.getState();
        
        expect(state.content).toBe('hello world');
        expect(state.revision).toBe(0);
        expect(state.users).toHaveProperty('user1');
    });
});

describe('DocumentManager', () => {
    let manager;

    beforeEach(() => {
        manager = new DocumentManager();
    });

    test('should create new document', () => {
        const doc = manager.getOrCreate('doc1', 'initial content');
        
        expect(doc.content).toBe('initial content');
        expect(manager.list()).toContain('doc1');
    });

    test('should return existing document', () => {
        const doc1 = manager.getOrCreate('doc1', 'content1');
        const doc2 = manager.getOrCreate('doc1', 'content2');
        
        expect(doc1).toBe(doc2);
        expect(doc2.content).toBe('content1');
    });

    test('should delete document', () => {
        manager.getOrCreate('doc1');
        manager.delete('doc1');
        
        expect(manager.list()).not.toContain('doc1');
    });
});