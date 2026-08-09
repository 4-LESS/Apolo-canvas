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
        setIcon: vi.fn()
    };
});

import { LinkSuggestModal } from './LinkSuggestModal';
import { TFile, setIcon } from 'obsidian';

test('LinkSuggestModal getItems correctly lists all vault files and filters internal data files', () => {
    const mockFiles = [
        { path: 'NoteA.md', basename: 'NoteA', extension: 'md' },
        { path: 'Attachments/Syllabus.pdf', basename: 'Syllabus', extension: 'pdf' },
        { path: 'ApoloCanvas/data/canvas-1.ink', basename: 'canvas-1', extension: 'ink' },
        { path: 'ApoloCanvas/data/settings.json', basename: 'settings', extension: 'json' },
        { path: 'Diagram.png', basename: 'Diagram', extension: 'png' },
    ];
    const mockApp = {
        vault: {
            getFiles: vi.fn().mockReturnValue(mockFiles)
        }
    };
    const onSelect = vi.fn();
    const modal = new LinkSuggestModal(mockApp as any, onSelect);

    const items = modal.getItems();
    expect(items.map(i => i.path)).toEqual([
        'NoteA.md',
        'Attachments/Syllabus.pdf',
        'ApoloCanvas/data/canvas-1.ink',
        'Diagram.png'
    ]);
});

test('LinkSuggestModal renderSuggestion creates DOM elements correctly', () => {
    const mockFile = {
        path: 'Attachments/Syllabus.pdf',
        name: 'Syllabus.pdf',
        basename: 'Syllabus',
        extension: 'pdf',
        parent: { path: 'Attachments' }
    } as any;

    const mockMatch = {
        item: mockFile,
        match: {}
    } as any;

    const createdElements: any[] = [];
    const mockEl = {
        empty: vi.fn(),
        style: {},
        createEl: vi.fn().mockImplementation((tag, attrs) => {
            const el = {
                style: {},
                textContent: attrs?.text || '',
                createEl: vi.fn().mockImplementation((t, a) => {
                    const innerEl = { style: {}, textContent: a?.text || '' };
                    createdElements.push(innerEl);
                    return innerEl;
                })
            };
            createdElements.push(el);
            return el;
        })
    } as any;

    const modal = new LinkSuggestModal({} as any, vi.fn());
    modal.renderSuggestion(mockMatch, mockEl);

    expect(mockEl.empty).toHaveBeenCalled();
    expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'pdf-file');

    const hasTitle = createdElements.some(el => el.textContent === 'Syllabus.pdf');
    expect(hasTitle).toBe(true);

    const hasNote = createdElements.some(el => el.textContent === 'Attachments/');
    expect(hasNote).toBe(true);
});

test('LinkSuggestModal onChooseItem selects the file path', () => {
    const mockFile = { path: 'Attachments/Syllabus.pdf' } as TFile;
    const onSelect = vi.fn();
    const modal = new LinkSuggestModal({} as any, onSelect);

    modal.onChooseItem(mockFile, {} as any);
    expect(onSelect).toHaveBeenCalledWith('Attachments/Syllabus.pdf');
});
