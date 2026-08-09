import { expect, test } from 'vitest';
import { ClipboardManager } from './ClipboardManager';
import { InkPage } from '../model/InkPage';
import { HistoryManager } from './HistoryManager';
import { Stroke } from '../model/Stroke';
import { SelectionState } from '../model/SelectionState';

test('ClipboardManager copy and paste lifecycle', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const clip = new ClipboardManager();

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(10, 10, 1);
    page.addElement(s1);

    const selectionState: SelectionState = {
        selectedIds: new Set(['s1']),
        unifiedBounds: s1.getBoundingBox().clone(),
        activeTransformDelta: null,
        pendingLassoPath: null,
        activeResizeScale: null,
        activeResizeAnchor: null
    };

    expect(clip.hasContent()).toBe(false);

    // Copy
    clip.copy(selectionState, page);
    expect(clip.hasContent()).toBe(true);

    // Paste 1
    clip.paste(page, history);
    expect(page.elements.length).toBe(2);
    const pasted1 = page.elements[1] as Stroke;
    expect(pasted1.id).not.toBe('s1');
    expect(pasted1.points[0]).toEqual([10 + 16, 10 + 16, 1]); // offset by 16

    // Paste 2
    clip.paste(page, history);
    expect(page.elements.length).toBe(3);
    const pasted2 = page.elements[2] as Stroke;
    expect(pasted2.points[0]).toEqual([10 + 32, 10 + 32, 1]); // offset by 32
});

test('ClipboardManager cut removes original elements', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const clip = new ClipboardManager();

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(10, 10, 1);
    page.addElement(s1);

    const selectionState: SelectionState = {
        selectedIds: new Set(['s1']),
        unifiedBounds: s1.getBoundingBox().clone(),
        activeTransformDelta: null,
        pendingLassoPath: null,
        activeResizeScale: null,
        activeResizeAnchor: null
    };

    clip.cut(selectionState, page, history);
    
    expect(page.elements.length).toBe(0);
    expect(clip.hasContent()).toBe(true);

    history.undo();
    expect(page.elements.length).toBe(1); // undoing cut should restore it
});

test('ClipboardManager copy and paste preserves link URL metadata', () => {
    const page = new InkPage('page1');
    const history = new HistoryManager();
    const clip = new ClipboardManager();

    const s1 = new Stroke('s1', 'pen');
    s1.addPoint(10, 10, 1);
    s1.url = 'https://obsidian.md';
    page.addElement(s1);

    const selectionState: SelectionState = {
        selectedIds: new Set(['s1']),
        unifiedBounds: s1.getBoundingBox().clone(),
        activeTransformDelta: null,
        pendingLassoPath: null,
        activeResizeScale: null,
        activeResizeAnchor: null
    };

    clip.copy(selectionState, page);
    const pastedElements = clip.paste(page, history);
    
    expect(pastedElements.length).toBe(1);
    expect(pastedElements[0].url).toBe('https://obsidian.md');
});
