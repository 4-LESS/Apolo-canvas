import { InkPage } from '../model/InkPage';
import { InkElement } from '../model/InkElement';
import { ElementStyle } from '../model/ElementStyle';
import { rotatePoint } from '../utils/geometry';

/**
 * A reversible command for the undo/redo system.
 */
export interface Command {
    execute(): void;
    undo(): void;
    description: string;
}

/** Command: add an element to a page. */
export class AddElementCommand implements Command {
    description: string;

    constructor(
        private page: InkPage,
        private element: InkElement
    ) {
        this.description = `Add ${element.type} ${element.id}`;
    }

    execute(): void {
        this.page.addElement(this.element);
    }

    undo(): void {
        this.page.removeElement(this.element.id);
    }
}

/** Command: remove an element from a page. */
export class RemoveElementCommand implements Command {
    description: string;
    private index: number = -1;

    constructor(
        private page: InkPage,
        private element: InkElement
    ) {
        this.description = `Remove ${element.type} ${element.id}`;
        this.index = page.getElementIndex(element.id);
    }

    execute(): void {
        this.page.removeElement(this.element.id);
    }

    undo(): void {
        if (this.index >= 0) {
            this.page.insertElement(this.element, this.index);
        } else {
            this.page.addElement(this.element);
        }
    }
}

/** Command: Move multiple elements by translating their raw point arrays. */
export class MoveElementsCommand implements Command {
    description: string = 'Move elements';

    constructor(
        private elements: InkElement[],
        private delta: { x: number; y: number },
        private renderer?: { fullRender(): void }
    ) {}

    private applyDelta(dx: number, dy: number): void {
        for (const element of this.elements) {
            if (element.type === 'stroke') {
                const stroke = element as any;
                if (stroke.points && Array.isArray(stroke.points)) {
                    for (const pt of stroke.points) {
                        pt[0] += dx;
                        pt[1] += dy;
                    }
                }
            } else if (element.type === 'shape') {
                const shape = element as any;
                if (shape.points && Array.isArray(shape.points)) {
                    for (const pt of shape.points) {
                        pt.x += dx;
                        pt.y += dy;
                    }
                }
            }
            element.invalidateCache();
            element.getBoundingBox();
        }
    }

    execute(): void {
        this.applyDelta(this.delta.x, this.delta.y);
        this.renderer?.fullRender();
    }

    undo(): void {
        this.applyDelta(-this.delta.x, -this.delta.y);
        this.renderer?.fullRender();
    }
}

/** Command: Resize/scale multiple elements relative to an anchor point. */
export class ResizeElementsCommand implements Command {
    description: string = 'Resize elements';

    constructor(
        private elements: InkElement[],
        private scale: { x: number; y: number },
        private anchor: { x: number; y: number },
        private renderer?: { fullRender(): void }
    ) {}

    private applyScale(s: { x: number; y: number }): void {
        for (const element of this.elements) {
            if (element.type === 'stroke') {
                const stroke = element as any;
                if (stroke.points && Array.isArray(stroke.points)) {
                    for (const pt of stroke.points) {
                        pt[0] = this.anchor.x + (pt[0] - this.anchor.x) * s.x;
                        pt[1] = this.anchor.y + (pt[1] - this.anchor.y) * s.y;
                    }
                }
            } else if (element.type === 'shape') {
                const shape = element as any;
                if (shape.points && Array.isArray(shape.points)) {
                    for (const pt of shape.points) {
                        pt.x = this.anchor.x + (pt.x - this.anchor.x) * s.x;
                        pt.y = this.anchor.y + (pt.y - this.anchor.y) * s.y;
                    }
                }
            }
            element.invalidateCache();
            element.getBoundingBox();
        }
    }

    execute(): void {
        this.applyScale(this.scale);
        this.renderer?.fullRender();
    }

    undo(): void {
        const invScale = {
            x: this.scale.x !== 0 ? 1 / this.scale.x : 1,
            y: this.scale.y !== 0 ? 1 / this.scale.y : 1
        };
        this.applyScale(invScale);
        this.renderer?.fullRender();
    }
}

/** Command: Rotate multiple elements relative to a center point. */
export class RotateElementsCommand implements Command {
    description: string = 'Rotate elements';

    constructor(
        private elements: InkElement[],
        private angleRadians: number,
        private center: { x: number; y: number },
        private renderer?: { fullRender(): void }
    ) {}

    private applyRotation(angle: number): void {
        for (const element of this.elements) {
            if (element.type === 'stroke') {
                const stroke = element as any;
                if (stroke.points && Array.isArray(stroke.points)) {
                    for (const pt of stroke.points) {
                        const rotated = rotatePoint({ x: pt[0], y: pt[1] }, this.center, angle);
                        pt[0] = rotated.x;
                        pt[1] = rotated.y;
                    }
                }
            } else if (element.type === 'shape') {
                const shape = element as any;
                const box = shape.getBoundingBox();
                const shCx = box.centerX;
                const shCy = box.centerY;
                const newCenter = rotatePoint({ x: shCx, y: shCy }, this.center, angle);
                const dx = newCenter.x - shCx;
                const dy = newCenter.y - shCy;
                if (shape.points && Array.isArray(shape.points)) {
                    for (const pt of shape.points) {
                        pt.x += dx;
                        pt.y += dy;
                    }
                }
                shape.rotation = (shape.rotation || 0) + angle;
            }
            element.invalidateCache();
            element.getBoundingBox();
        }
    }

    execute(): void {
        this.applyRotation(this.angleRadians);
        this.renderer?.fullRender();
    }

    undo(): void {
        this.applyRotation(-this.angleRadians);
        this.renderer?.fullRender();
    }
}


/** Command: Delete multiple elements while tracking their original indices. */
export class DeleteElementsCommand implements Command {
    description: string = 'Delete elements';
    private savedElements: { element: InkElement; originalIndex: number }[] = [];
    private clearedLinks: { element: InkElement; oldUrl?: string; oldGroupId?: string }[] = [];

    constructor(
        private page: InkPage,
        private elementIds: string[]
    ) {
        // Collect existing elements and their indices
        for (const id of this.elementIds) {
            const index = this.page.getElementIndex(id);
            const element = this.page.getElementById(id);
            if (index >= 0 && element) {
                this.savedElements.push({ element, originalIndex: index });
            }
        }
        
        // Find if any of the deleted elements is part of a linked group,
        // and if so, clear the link for the other elements in that group
        const groupIdsToClear = new Set<string>();
        for (const item of this.savedElements) {
            if ((item.element as any).linkGroupId) {
                groupIdsToClear.add((item.element as any).linkGroupId);
            }
        }

        if (groupIdsToClear.size > 0) {
            for (const el of this.page.elements) {
                if ((el as any).linkGroupId && groupIdsToClear.has((el as any).linkGroupId)) {
                    // Only clear it if it's NOT already in the list of elements being deleted
                    if (!this.elementIds.includes(el.id)) {
                        this.clearedLinks.push({
                            element: el,
                            oldUrl: el.url,
                            oldGroupId: (el as any).linkGroupId
                        });
                    }
                }
            }
        }

        // Sort by index descending so removal from end doesn't mess up earlier indices
        this.savedElements.sort((a, b) => b.originalIndex - a.originalIndex);
    }

    execute(): void {
        for (const item of this.savedElements) {
            this.page.removeElement(item.element.id);
        }
        for (const item of this.clearedLinks) {
            item.element.url = undefined;
            (item.element as any).linkGroupId = undefined;
        }
    }

    undo(): void {
        // Restore elements in ascending order so indices remain stable
        const toRestore = [...this.savedElements].sort((a, b) => a.originalIndex - b.originalIndex);
        for (const item of toRestore) {
            this.page.insertElement(item.element, item.originalIndex);
        }
        for (const item of this.clearedLinks) {
            item.element.url = item.oldUrl;
            (item.element as any).linkGroupId = item.oldGroupId;
        }
    }
}

/** Command: Add multiple elements to the top of the page. */
export class AddElementsCommand implements Command {
    description: string = 'Paste elements';

    constructor(
        private page: InkPage,
        private elements: InkElement[]
    ) {}

    execute(): void {
        for (const element of this.elements) {
            this.page.addElement(element);
        }
    }

    undo(): void {
        for (const element of this.elements) {
            this.page.removeElement(element.id);
        }
    }
}

/** Command: Split a stroke/shape into two strokes. */
export class SplitElementCommand implements Command {
    description: string = 'Split element';
    private index: number = -1;
    private clearedLinks: { element: InkElement; oldUrl?: string; oldGroupId?: string }[] = [];

    constructor(
        private page: InkPage,
        private parentElement: InkElement,
        private childA: InkElement | null,
        private childB: InkElement | null,
        private renderer?: { fullRender(): void }
    ) {
        this.index = this.page.getElementIndex(parentElement.id);

        const parentGroupId = (parentElement as any).linkGroupId;
        if (parentGroupId) {
            for (const el of this.page.elements) {
                if ((el as any).linkGroupId === parentGroupId && el.id !== parentElement.id) {
                    this.clearedLinks.push({
                        element: el,
                        oldUrl: el.url,
                        oldGroupId: (el as any).linkGroupId
                    });
                }
            }
        }
    }

    execute(): void {
        this.page.removeElement(this.parentElement.id);
        if (this.index >= 0) {
            if (this.childB) this.page.insertElement(this.childB, this.index);
            if (this.childA) this.page.insertElement(this.childA, this.index);
        } else {
            if (this.childA) this.page.addElement(this.childA);
            if (this.childB) this.page.addElement(this.childB);
        }
        for (const item of this.clearedLinks) {
            item.element.url = undefined;
            (item.element as any).linkGroupId = undefined;
        }
        this.parentElement.invalidateCache();
        if (this.childA) this.childA.invalidateCache();
        if (this.childB) this.childB.invalidateCache();
        this.renderer?.fullRender();
    }

    undo(): void {
        if (this.childA) this.page.removeElement(this.childA.id);
        if (this.childB) this.page.removeElement(this.childB.id);
        if (this.index >= 0) {
            this.page.insertElement(this.parentElement, this.index);
        } else {
            this.page.addElement(this.parentElement);
        }
        for (const item of this.clearedLinks) {
            item.element.url = item.oldUrl;
            (item.element as any).linkGroupId = item.oldGroupId;
        }
        this.parentElement.invalidateCache();
        this.renderer?.fullRender();
    }
}

/** Command: Change retroactive ElementStyle properties on multiple elements. */
export class ChangeStyleCommand implements Command {
    description: string = 'Change style';

    constructor(
        private updates: { element: InkElement; oldStyle: ElementStyle; newStyle: ElementStyle }[],
        private renderer?: { fullRender(): void }
    ) {}

    execute(): void {
        for (const update of this.updates) {
            (update.element as any).style = { ...update.newStyle };
            update.element.invalidateCache();
        }
        this.renderer?.fullRender();
    }

    undo(): void {
        for (const update of this.updates) {
            (update.element as any).style = { ...update.oldStyle };
            update.element.invalidateCache();
        }
        this.renderer?.fullRender();
    }
}

/** Command: Change retroactive url property on multiple elements. */
export class ChangeUrlCommand implements Command {
    description: string = 'Change link';

    constructor(
        private updates: {
            element: InkElement;
            oldUrl?: string;
            newUrl?: string;
            oldGroupId?: string;
            newGroupId?: string;
        }[],
        private renderer?: { fullRender(): void }
    ) {}

    execute(): void {
        for (const update of this.updates) {
            update.element.url = update.newUrl;
            (update.element as any).linkGroupId = update.newGroupId;
        }
        this.renderer?.fullRender();
    }

    undo(): void {
        for (const update of this.updates) {
            update.element.url = update.oldUrl;
            (update.element as any).linkGroupId = update.oldGroupId;
        }
        this.renderer?.fullRender();
    }
}

/** Command: Sort elements' Z-order (layer sorting). */
export class SortElementsCommand implements Command {
    description: string = 'Sort elements';

    constructor(
        private page: InkPage,
        private originalOrder: InkElement[],
        private newOrder: InkElement[],
        private renderer?: { fullRender(): void }
    ) {}

    execute(): void {
        (this.page as any).elements = [...this.newOrder];
        for (const el of this.newOrder) {
            el.invalidateCache();
        }
        this.renderer?.fullRender();
    }

    undo(): void {
        (this.page as any).elements = [...this.originalOrder];
        for (const el of this.originalOrder) {
            el.invalidateCache();
        }
        this.renderer?.fullRender();
    }
}


/**
 * History manager implementing undo/redo via the command pattern.
 * Each command knows how to execute and reverse itself.
 */
export class HistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private maxHistory: number;

    constructor(maxHistory: number = 100) {
        this.maxHistory = maxHistory;
    }

    /** Execute a command and push it onto the undo stack. Clears redo stack. */
    execute(cmd: Command): void {
        cmd.execute();
        this.undoStack.push(cmd);

        // Trim to max size
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Any new action invalidates the redo stack
        this.redoStack.length = 0;
    }

    /** Push an already executed command onto the undo stack. Clears redo stack. */
    push(cmd: Command): void {
        this.undoStack.push(cmd);

        // Trim to max size
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        // Any new action invalidates the redo stack
        this.redoStack.length = 0;
    }

    /** Undo the last command. Returns true if successful. */
    undo(): boolean {
        const cmd = this.undoStack.pop();
        if (!cmd) return false;
        cmd.undo();
        this.redoStack.push(cmd);
        return true;
    }

    /** Redo the last undone command. Returns true if successful. */
    redo(): boolean {
        const cmd = this.redoStack.pop();
        if (!cmd) return false;
        cmd.execute();
        this.undoStack.push(cmd);
        return true;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /** Clear all history. */
    clear(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }
}
