const { TextOperation } = require('../ot');

describe('Operational Transforms', () => {
    describe('TextOperation', () => {
        test('should apply retain operation', () => {
            const op = new TextOperation();
            op.retain(5);
            
            expect(op.apply('hello')).toBe('hello');
        });

        test('should apply insert operation', () => {
            const op = new TextOperation();
            op.insert('hello');
            
            expect(op.apply('')).toBe('hello');
        });

        test('should apply delete operation', () => {
            const op = new TextOperation();
            op.delete(5);
            
            expect(op.apply('hello')).toBe('');
        });

        test('should apply combined operations', () => {
            const op = new TextOperation();
            op.retain(6).insert('beautiful ').retain(5);
            
            expect(op.apply('hello world')).toBe('hello beautiful world');
        });

        test('should apply delete in middle', () => {
            const op = new TextOperation();
            op.retain(6).delete(5);
            
            expect(op.apply('hello world')).toBe('hello ');
        });
    });

    describe('Compose', () => {
        test('should compose two operations', () => {
            const op1 = new TextOperation();
            op1.retain(5).insert('!');
            
            const op2 = new TextOperation();
            op2.retain(6).insert('?');
            
            const composed = op1.compose(op2);
            
            expect(composed.apply('hello')).toBe('hello!?');
        });
    });

    describe('Serialization', () => {
        test('should serialize and deserialize', () => {
            const op = new TextOperation();
            op.retain(5).insert(' world').delete(1);
            
            const json = op.toJSON();
            const restored = TextOperation.fromJSON(json);
            
            expect(restored.apply('hello!')).toBe('hello world');
        });
    });
});