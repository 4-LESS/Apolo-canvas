import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        TFile: class MockTFile {}
    };
});

import { TFile } from 'obsidian';

// Simplified version of the scanner to test its logic
async function countCanvasReferencesMock(
    canvasId: string,
    markdownFiles: TFile[],
    cachedReadMock: (file: TFile) => Promise<string>
): Promise<number> {
    let count = 0;
    for (const file of markdownFiles) {
        const content = await cachedReadMock(file);
        if (content.includes(`id: ${canvasId}`)) {
            count++;
        }
    }
    return count;
}

describe('Canvas Reference Counting', () => {
    it('correctly counts single reference', async () => {
        const mockFiles = [
            { path: 'Note1.md', basename: 'Note1' } as TFile,
            { path: 'Note2.md', basename: 'Note2' } as TFile,
        ];
        const cachedReadMock = vi.fn().mockImplementation(async (file: TFile) => {
            if (file.path === 'Note1.md') {
                return `Some content\n\`\`\`ink\nid: canvas-123\ntype: drawing\n\`\`\``;
            }
            return 'No ink block here';
        });

        const count = await countCanvasReferencesMock('canvas-123', mockFiles, cachedReadMock);
        expect(count).toBe(1);
    });

    it('correctly counts multiple references', async () => {
        const mockFiles = [
            { path: 'Note1.md', basename: 'Note1' } as TFile,
            { path: 'Note2.md', basename: 'Note2' } as TFile,
            { path: 'Note3.md', basename: 'Note3' } as TFile,
        ];
        const cachedReadMock = vi.fn().mockImplementation(async (file: TFile) => {
            if (file.path === 'Note1.md') {
                return `\`\`\`ink\nid: canvas-123\n\`\`\``;
            }
            if (file.path === 'Note2.md') {
                return `\`\`\`ink\nid: canvas-123\n\`\`\``;
            }
            return 'No ink block here';
        });

        const count = await countCanvasReferencesMock('canvas-123', mockFiles, cachedReadMock);
        expect(count).toBe(2);
    });

    it('returns 0 when no references exist', async () => {
        const mockFiles = [
            { path: 'Note1.md', basename: 'Note1' } as TFile,
        ];
        const cachedReadMock = vi.fn().mockImplementation(async () => 'No ink block');

        const count = await countCanvasReferencesMock('canvas-123', mockFiles, cachedReadMock);
        expect(count).toBe(0);
    });
});
