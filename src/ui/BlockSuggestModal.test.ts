import { expect, test, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        FuzzySuggestModal: class MockFuzzySuggestModal {
            constructor(app) {
                this.app = app;
            }
            setPlaceholder(text) {}
        },
        TFile: class MockTFile {},
        App: class MockApp {},
    };
});

import { BlockSuggestModal } from './BlockSuggestModal';
import { TFile } from 'obsidian';

test('BlockSuggestModal getItems correctly parses ink blocks and titles', async () => {
    const mockFile = { basename: 'NoteB', path: 'NoteB.md' } as TFile;
    const mockApp = {
        metadataCache: {
            getFileCache: vi.fn().mockReturnValue({
                sections: [
                    { type: 'code', position: { start: { line: 1 }, end: { line: 4 } } },
                    { type: 'paragraph', position: { start: { line: 5 }, end: { line: 5 } } },
                    { type: 'code', position: { start: { line: 6 }, end: { line: 8 } } },
                ]
            })
        },
        vault: {
            cachedRead: vi.fn().mockResolvedValue(
                '\n' +
                '```ink\n' +
                'id: canvas-a\n' +
                'title: Canvas Title A\n' +
                '```\n' +
                'Some other text\n' +
                '```ink\n' +
                'id: canvas-b\n' +
                '```\n'
            )
        }
    };

    const mockOnSelect = vi.fn();
    const modal = new BlockSuggestModal(mockApp as any, mockFile, mockOnSelect);

    const items = await modal.getItems();
    expect(items).toEqual(['canvas-a', 'canvas-b']);

    expect(modal.getItemText('canvas-a')).toBe('Canvas Title A');
    expect(modal.getItemText('canvas-b')).toBe('canvas-b');

    modal.onChooseItem('canvas-b', {} as any);
    expect(mockOnSelect).toHaveBeenCalledWith('canvas-b');
});
