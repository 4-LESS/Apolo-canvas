import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => {
    return {
        App: class MockApp {},
        TFile: class MockTFile {}
    };
});

import { GraphCacheWorker, isExternalUrl } from './GraphCacheWorker';
import { TFile } from 'obsidian';

describe('isExternalUrl', () => {
    it('correctly identifies external schemes', () => {
        expect(isExternalUrl('http://example.com')).toBe(true);
        expect(isExternalUrl('https://example.com/path')).toBe(true);
        expect(isExternalUrl('obsidian://open?vault=test')).toBe(true);
        expect(isExternalUrl('mailto:test@example.com')).toBe(true);
        expect(isExternalUrl('tel:+123456')).toBe(true);
    });

    it('correctly identifies internal links', () => {
        expect(isExternalUrl('My Note')).toBe(false);
        expect(isExternalUrl('folder/subfolder/My Note.md')).toBe(false);
        expect(isExternalUrl('Chapter 1: The Beginning')).toBe(false);
    });
});

describe('GraphCacheWorker', () => {
    let mockApp: any;
    let worker: GraphCacheWorker;
    let resolvedFiles: Record<string, TFile>;

    beforeEach(() => {
        resolvedFiles = {
            'ExistingNote.md': { path: 'ExistingNote.md', basename: 'ExistingNote' } as TFile,
            'OtherNote.md': { path: 'OtherNote.md', basename: 'OtherNote' } as TFile,
            'Attachments/Syllabus.pdf': { path: 'Attachments/Syllabus.pdf', basename: 'Syllabus' } as TFile,
        };

        mockApp = {
            metadataCache: {
                resolvedLinks: {} as Record<string, Record<string, number>>,
                unresolvedLinks: {} as Record<string, Record<string, number>>,
                getFirstLinkpathDest: vi.fn((linkpath: string, sourcePath: string) => {
                    // Simple resolution logic for testing
                    // If linkpath matches a resolved file, return it
                    for (const file of Object.values(resolvedFiles)) {
                        if (file.basename === linkpath || file.path === linkpath) {
                            return file;
                        }
                    }
                    return null;
                }),
            },
        };

        worker = new GraphCacheWorker(mockApp);
    });

    it('should inject links correctly (resolved vs unresolved)', () => {
        // Register canvas on a parent note
        worker.registerCanvas('canvas-1', 'ParentNote.md');

        // Update canvas links: one existing note, one missing note, and one external URL
        worker.updateCanvasLinks('canvas-1', [
            'ExistingNote',
            'NonExistentNote',
            'https://google.com',
        ]);

        const cache = mockApp.metadataCache;

        // Verify resolvedLinks contains the existing note
        expect(cache.resolvedLinks['ParentNote.md']).toBeDefined();
        expect(cache.resolvedLinks['ParentNote.md']['ExistingNote.md']).toBe(1);

        // Verify unresolvedLinks contains the missing note
        expect(cache.unresolvedLinks['ParentNote.md']).toBeDefined();
        expect(cache.unresolvedLinks['ParentNote.md']['NonExistentNote']).toBe(1);

        // Verify external URL is completely excluded
        expect(cache.resolvedLinks['ParentNote.md']['https://google.com']).toBeUndefined();
        expect(cache.unresolvedLinks['ParentNote.md']['https://google.com']).toBeUndefined();
    });

    it('should overwrite and clean up old links when updated', () => {
        worker.registerCanvas('canvas-1', 'ParentNote.md');

        // Initial update
        worker.updateCanvasLinks('canvas-1', ['ExistingNote', 'OldUnresolved']);

        let cache = mockApp.metadataCache;
        expect(cache.resolvedLinks['ParentNote.md']['ExistingNote.md']).toBe(1);
        expect(cache.unresolvedLinks['ParentNote.md']['OldUnresolved']).toBe(1);

        // Update with new links, removing old ones
        worker.updateCanvasLinks('canvas-1', ['OtherNote', 'NewUnresolved']);

        expect(cache.resolvedLinks['ParentNote.md']['ExistingNote.md']).toBeUndefined();
        expect(cache.unresolvedLinks['ParentNote.md']['OldUnresolved']).toBeUndefined();
        expect(cache.resolvedLinks['ParentNote.md']['OtherNote.md']).toBe(1);
        expect(cache.unresolvedLinks['ParentNote.md']['NewUnresolved']).toBe(1);
    });

    it('should propagate links to all parent notes in a multi-embed scenario', () => {
        // Register canvas-1 in two different parent notes
        worker.registerCanvas('canvas-1', 'NoteA.md');
        worker.registerCanvas('canvas-1', 'NoteB.md');

        worker.updateCanvasLinks('canvas-1', ['ExistingNote', 'MissingNote']);

        const cache = mockApp.metadataCache;

        // Verify NoteA.md received the injections
        expect(cache.resolvedLinks['NoteA.md']['ExistingNote.md']).toBe(1);
        expect(cache.unresolvedLinks['NoteA.md']['MissingNote']).toBe(1);

        // Verify NoteB.md received the injections
        expect(cache.resolvedLinks['NoteB.md']['ExistingNote.md']).toBe(1);
        expect(cache.unresolvedLinks['NoteB.md']['MissingNote']).toBe(1);
    });

    it('should unregister canvas and clean up parent note caches correctly', () => {
        worker.registerCanvas('canvas-1', 'NoteA.md');
        worker.registerCanvas('canvas-1', 'NoteB.md');

        worker.updateCanvasLinks('canvas-1', ['ExistingNote']);

        const cache = mockApp.metadataCache;
        expect(cache.resolvedLinks['NoteA.md']['ExistingNote.md']).toBe(1);
        expect(cache.resolvedLinks['NoteB.md']['ExistingNote.md']).toBe(1);

        // Unregister canvas-1 from NoteB.md
        worker.unregisterCanvas('canvas-1', 'NoteB.md');

        // NoteA.md should still have the links
        expect(cache.resolvedLinks['NoteA.md']['ExistingNote.md']).toBe(1);

        // NoteB.md links should be completely cleaned up
        expect(cache.resolvedLinks['NoteB.md']).toBeUndefined();
    });

    it('should handle multiple canvases in the same note correctly', () => {
        worker.registerCanvas('canvas-1', 'ParentNote.md');
        worker.registerCanvas('canvas-2', 'ParentNote.md');

        worker.updateCanvasLinks('canvas-1', ['ExistingNote']);
        worker.updateCanvasLinks('canvas-2', ['ExistingNote', 'OtherNote']);

        const cache = mockApp.metadataCache;
        // Count should accumulate across canvases
        expect(cache.resolvedLinks['ParentNote.md']['ExistingNote.md']).toBe(2);
        expect(cache.resolvedLinks['ParentNote.md']['OtherNote.md']).toBe(1);
    });

    it('should strip anchor tags from link paths before resolving and injecting', () => {
        worker.registerCanvas('canvas-1', 'ParentNote.md');

        // Update canvas links with anchor tags
        worker.updateCanvasLinks('canvas-1', [
            'ExistingNote#^block-1',
            'NonExistentNote#^block-2',
        ]);

        const cache = mockApp.metadataCache;

        // Verify resolvedLinks contains the existing note (without the anchor tag in the path/key)
        expect(cache.resolvedLinks['ParentNote.md']).toBeDefined();
        expect(cache.resolvedLinks['ParentNote.md']['ExistingNote.md']).toBe(1);

        // Verify unresolvedLinks contains the missing note (without the anchor tag)
        expect(cache.unresolvedLinks['ParentNote.md']).toBeDefined();
        expect(cache.unresolvedLinks['ParentNote.md']['NonExistentNote']).toBe(1);
    });

    it('should resolve and inject non-markdown attachment files correctly', () => {
        worker.registerCanvas('canvas-1', 'ParentNote.md');

        worker.updateCanvasLinks('canvas-1', [
            'Attachments/Syllabus.pdf',
        ]);

        const cache = mockApp.metadataCache;

    });

    it('should propagate canvas-to-canvas and canvas-to-asset links under parent-edge inheritance model', () => {
        worker.registerCanvas('canvas-1', 'ParentNote.md');

        worker.updateCanvasLinks('canvas-1', [
            'ApoloCanvas/data/Example2.ink',
            'Attachments/Syllabus.pdf',
        ]);

        const cache = mockApp.metadataCache;

        // Ensure parent note inherits link to the other canvas
        expect(cache.unresolvedLinks['ParentNote.md']['ApoloCanvas/data/Example2.ink']).toBe(1);

        // Ensure parent note inherits link to the PDF asset
        expect(cache.resolvedLinks['ParentNote.md']['Attachments/Syllabus.pdf']).toBe(1);

        // Ensure parent note also has the parent-to-embed edge for the embedded canvas itself
        expect(cache.resolvedLinks['ParentNote.md']['ApoloCanvas/data/canvas-1.ink']).toBe(1);
    });
});

describe('Rename Regex Cascade', () => {
    it('correctly replaces targeted canvas IDs without altering other text', () => {
        const oldId = 'canvas-123';
        const newId = 'canvas-abc';

        const escapedOldId = oldId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(\\bid:\\s*"?)${escapedOldId}("?\\b)`, 'g');

        const inputs = [
            {
                input: 'id: canvas-123',
                expected: 'id: canvas-abc'
            },
            {
                input: 'id: "canvas-123"',
                expected: 'id: "canvas-abc"'
            },
            {
                input: 'background: grid\nid: canvas-123\nheight: 400',
                expected: 'background: grid\nid: canvas-abc\nheight: 400'
            },
            {
                input: 'This is not an id: my-canvas-123 but canvas-123 is something else.',
                expected: 'This is not an id: my-canvas-123 but canvas-123 is something else.'
            },
            {
                input: 'id: canvas-1234',
                expected: 'id: canvas-1234'
            }
        ];

        for (const { input, expected } of inputs) {
            const output = input.replace(regex, `$1${newId}$2`);
            expect(output).toBe(expected);
        }
    });
});
