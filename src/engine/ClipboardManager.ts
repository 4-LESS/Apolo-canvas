import { ClipboardBuffer } from '../model/ClipboardBuffer';
import { SelectionState } from '../model/SelectionState';
import { InkPage } from '../model/InkPage';
import { HistoryManager, DeleteElementsCommand, AddElementsCommand } from './HistoryManager';
import { InkElement } from '../model/InkElement';
import { generateId } from '../utils/id';
import { BoundingBox } from '../model/BoundingBox';

const PASTE_OFFSET_PX = 16;

/**
 * Manages clipboard operations (Cut, Copy, Paste).
 */
export class ClipboardManager {
    private static sharedBuffer: ClipboardBuffer | null = null;

    /** Copies the currently selected elements (deep copy) into the buffer. */
    copy(selectionState: SelectionState, page: InkPage): void {
        if (selectionState.selectedIds.size === 0 || !selectionState.unifiedBounds) return;

        const elements: InkElement[] = [];
        for (const id of selectionState.selectedIds) {
            const el = page.getElementById(id);
            if (el) {
                // Deep copy via serialize/deserialize
                const data = el.serialize();
                const cloned = InkPage.deserializeElement(data);
                if (cloned) {
                    cloned.url = el.url;
                    elements.push(cloned);
                }
            }
        }

        ClipboardManager.sharedBuffer = {
            elements,
            sourceBounds: selectionState.unifiedBounds.clone(),
            pasteCount: 0
        };
    }

    /** Copies then deletes the selected elements. */
    cut(selectionState: SelectionState, page: InkPage, history: HistoryManager): void {
        if (selectionState.selectedIds.size === 0) return;

        this.copy(selectionState, page);

        const idsToDelete = Array.from(selectionState.selectedIds);
        const cmd = new DeleteElementsCommand(page, idsToDelete);
        history.execute(cmd);
    }

    /** Pastes the buffer into the current page, centering at targetCenter if provided. */
    paste(
        page: InkPage,
        history: HistoryManager,
        targetCenter?: { x: number; y: number }
    ): InkElement[] {
        const buffer = ClipboardManager.sharedBuffer;
        if (!buffer || buffer.elements.length === 0) return [];

        let offset: { x: number; y: number };
        if (targetCenter && buffer.sourceBounds) {
            offset = this.computeOffsetToCenter(buffer.sourceBounds, targetCenter);
        } else {
            const val = (buffer.pasteCount + 1) * PASTE_OFFSET_PX;
            offset = { x: val, y: val };
        }

        const newElements: InkElement[] = [];
        for (const el of buffer.elements) {
            // Clone again to ensure uniqueness across multiple pastes
            const data = el.serialize();
            const cloned = InkPage.deserializeElement(data);
            if (cloned) {
                cloned.id = generateId(); // Assign new unique ID
                cloned.url = el.url;
                
                // Shift coordinates
                this.shiftElementPoints(cloned, offset);
                newElements.push(cloned);
            }
        }

        if (newElements.length > 0) {
            const cmd = new AddElementsCommand(page, newElements);
            history.execute(cmd);
        }

        buffer.pasteCount++;
        return newElements;
    }

    private computeOffsetToCenter(sourceBounds: BoundingBox, target: { x: number; y: number }): { x: number; y: number } {
        const sourceCenter = {
            x: sourceBounds.x + sourceBounds.width / 2,
            y: sourceBounds.y + sourceBounds.height / 2,
        };
        return {
            x: target.x - sourceCenter.x,
            y: target.y - sourceCenter.y
        };
    }

    private shiftElementPoints(el: InkElement, offset: { x: number; y: number }): void {
        if (el.type === 'stroke') {
            const stroke = el as any;
            if (stroke.points && Array.isArray(stroke.points)) {
                for (const pt of stroke.points) {
                    pt[0] += offset.x;
                    pt[1] += offset.y;
                }
            }
        } else if (el.type === 'shape') {
            const shape = el as any;
            if (shape.points && Array.isArray(shape.points)) {
                for (const pt of shape.points) {
                    pt.x += offset.x;
                    pt.y += offset.y;
                }
            }
        }
        el.invalidateCache();
        el.getBoundingBox();
    }

    /** Returns true if the clipboard has content to paste. */
    hasContent(): boolean {
        return ClipboardManager.sharedBuffer !== null && ClipboardManager.sharedBuffer.elements.length > 0;
    }
}
