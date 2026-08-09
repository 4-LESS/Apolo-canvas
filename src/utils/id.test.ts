import { expect, test } from 'vitest';
import { generateId, generateBlockId } from './id';

test('generateId returns a unique element ID starting with el-', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1.startsWith('el-')).toBe(true);
    expect(id1).not.toBe(id2);
});

test('generateBlockId returns unique block IDs with correct structure', () => {
    const id1 = generateBlockId();
    const id2 = generateBlockId();
    expect(id1).not.toBe(id2);
    expect(id1.includes('-')).toBe(true);
    const parts = id1.split('-');
    expect(parts.length).toBe(2);
    expect(parts[1].length).toBe(5); // 5 random chars
});
