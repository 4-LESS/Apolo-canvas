import { InkElement, ElementData } from './InkElement';
import { Stroke, StrokeData } from './Stroke';
import { ShapeElement } from './ShapeElement';

/** Page background types. */
export type BackgroundType = 'blank' | 'grid' | 'ruled' | 'dotted';

/** A page size preset. */
export interface PagePreset {
    name: string;
    width: number;  // pixels at target DPI
    height: number;
    dpi: number;
}

/** Built-in page presets. */
export const PAGE_PRESETS: Record<string, PagePreset> = {
    A4: { name: 'A4', width: 2480, height: 3508, dpi: 300 },
    LETTER: { name: 'Letter', width: 2550, height: 3300, dpi: 300 },
    A5: { name: 'A5', width: 1748, height: 2480, dpi: 300 },
    A3: { name: 'A3', width: 3508, height: 4960, dpi: 300 },
    INFINITE: { name: 'Infinite', width: 100000, height: 100000, dpi: 300 }
};

/** Saved viewport state for a page. */
export interface PageViewport {
    x: number;
    y: number;
    zoom: number;
}

/** Serialized page data. */
export interface PageData {
    version: number;
    id: string;
    background: BackgroundType;
    viewport: PageViewport;
    elements: ElementData[];
    links: unknown[]; // Reserved for future link system
    gridSize?: number;
    snapToGrid?: boolean;
    pageSize?: string;
    width?: number;
    height?: number;
    theme?: string;
}

/**
 * A single ink page containing elements.
 *
 * Pages are discrete, fixed-dimension entities — the core organizational
 * unit of the plugin. Each page has its own background, viewport state,
 * and ordered collection of elements (z-order = array index).
 */
export class InkPage {
    id: string;
    elements: InkElement[];
    background: BackgroundType;
    viewport: PageViewport;
    gridSize: number;
    snapToGrid: boolean;
    pageSize?: string;
    width?: number;
    height?: number;
    theme?: string;

    constructor(id: string, background: BackgroundType = 'grid') {
        this.id = id;
        this.elements = [];
        this.background = background;
        this.viewport = { x: 0, y: 0, zoom: 1.0 };
        this.gridSize = 20;
        this.snapToGrid = background === 'grid';
        this.pageSize = 'A4';
        this.width = 2480;
        this.height = 3508;
    }

    /** Add an element to the top of the z-order. */
    addElement(element: InkElement): void {
        this.elements.push(element);
    }

    /** Remove an element by ID. Returns the removed element or null. */
    removeElement(elementId: string): InkElement | null {
        const index = this.elements.findIndex((el) => el.id === elementId);
        if (index === -1) return null;
        return this.elements.splice(index, 1)[0];
    }

    /** Insert an element at a specific z-order index. */
    insertElement(element: InkElement, index: number): void {
        const clamped = Math.max(0, Math.min(index, this.elements.length));
        this.elements.splice(clamped, 0, element);
    }

    /** Find an element by ID. */
    getElementById(id: string): InkElement | undefined {
        return this.elements.find((el) => el.id === id);
    }

    /**
     * Find the top-most element at a given point (in page coordinates).
     * Iterates from top (last) to bottom (first) of the z-order.
     */
    getElementAtPoint(
        x: number,
        y: number,
        threshold: number
    ): InkElement | null {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            if (this.elements[i].hitTest(x, y, threshold)) {
                return this.elements[i];
            }
        }
        return null;
    }

    /** Get the z-order index of an element. Returns -1 if not found. */
    getElementIndex(elementId: string): number {
        return this.elements.findIndex((el) => el.id === elementId);
    }

    /** Serialize this page to a JSON-safe object. */
    serialize(): PageData {
        return {
            version: 1,
            id: this.id,
            background: this.background,
            viewport: { ...this.viewport },
            elements: this.elements.map((el) => el.serialize()),
            links: [],
            gridSize: this.gridSize,
            snapToGrid: this.snapToGrid,
            pageSize: this.pageSize,
            width: this.width,
            height: this.height,
            theme: this.theme
        };
    }

    /** Deserialize a page from JSON data. */
    static deserialize(data: PageData): InkPage {
        const page = new InkPage(data.id, data.background ?? 'grid');
        page.viewport = data.viewport ?? { x: 0, y: 0, zoom: 1.0 };
        page.gridSize = (data as any).gridSize ?? 20;
        page.snapToGrid = (data as any).snapToGrid ?? (page.background === 'grid');
        page.pageSize = data.pageSize ?? 'A4';
        page.width = data.width ?? 2480;
        page.height = data.height ?? 3508;
        page.theme = data.theme;

        if (Array.isArray(data.elements)) {
            for (const elData of data.elements) {
                const element = InkPage.deserializeElement(elData);
                if (element) {
                    page.elements.push(element);
                }
            }
        }

        return page;
    }

    /** Deserialize a single element by dispatching on type. */
    public static deserializeElement(
        data: ElementData
    ): InkElement | null {
        switch (data.type) {
            case 'stroke':
                return Stroke.deserialize(data as StrokeData);
            case 'shape':
                return ShapeElement.deserialize(data);
            default:
                console.warn(
                    `[ObsidianInk] Unknown element type: ${data.type}, skipping.`
                );
                return null;
        }
    }
}
