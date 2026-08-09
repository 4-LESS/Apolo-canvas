import { InkPage, BackgroundType, PageData } from './InkPage';
import { generateId } from '../utils/id';

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
};

/** Metadata for an ink document. */
export interface MetaData {
    version: number;
    pluginVersion: string;
    createdAt: string;
    modifiedAt: string;
    pagePreset: PagePreset;
    defaultBackground: BackgroundType;
    pages: Array<{
        id: string;
        file: string;
        label: string;
        background: BackgroundType;
    }>;
}

/**
 * An ink document representing all pages associated with a Markdown note.
 *
 * @deprecated Retired in v0.3. Use InkPage directly.
 */
export class InkDocument {
    version: number = 2;
    pluginVersion: string = '0.1.0';
    createdAt: string;
    modifiedAt: string;
    pagePreset: PagePreset;
    defaultBackground: BackgroundType;
    pages: InkPage[];

    constructor(
        preset?: PagePreset,
        background?: BackgroundType
    ) {
        this.pagePreset = preset ?? PAGE_PRESETS.A4;
        this.defaultBackground = background ?? 'grid';
        this.pages = [];
        const now = new Date().toISOString();
        this.createdAt = now;
        this.modifiedAt = now;
    }

    /** Add a new blank page and return it. */
    addPage(background?: BackgroundType, id?: string): InkPage {
        const pageId = id ?? generateId();
        const page = new InkPage(pageId, background ?? this.defaultBackground);
        this.pages.push(page);
        this.touch();
        return page;
    }

    /** Insert a new blank page at a specific index. */
    insertPage(index: number, background?: BackgroundType, id?: string): InkPage {
        const pageId = id ?? generateId();
        const page = new InkPage(pageId, background ?? this.defaultBackground);
        const clampedIndex = Math.max(0, Math.min(index, this.pages.length));
        this.pages.splice(clampedIndex, 0, page);
        this.touch();
        return page;
    }

    /** Remove a page by ID. */
    removePage(pageId: string): void {
        const index = this.pages.findIndex((p) => p.id === pageId);
        if (index !== -1) {
            this.pages.splice(index, 1);
            this.touch();
        }
    }

    /** Get a page by ID. */
    getPage(pageId: string): InkPage | undefined {
        return this.pages.find((p) => p.id === pageId);
    }

    /** Get a page by zero-based index. */
    getPageByIndex(index: number): InkPage | undefined {
        return this.pages[index];
    }

    /** Get the index of a page by ID. Returns -1 if not found. */
    getPageIndex(pageId: string): number {
        return this.pages.findIndex((p) => p.id === pageId);
    }

    /** Number of pages. */
    get pageCount(): number {
        return this.pages.length;
    }

    /** Update the modification timestamp. */
    touch(): void {
        this.modifiedAt = new Date().toISOString();
    }

    /** Serialize document metadata (without page contents). */
    serializeMeta(): MetaData {
        return {
            version: this.version,
            pluginVersion: this.pluginVersion,
            createdAt: this.createdAt,
            modifiedAt: this.modifiedAt,
            pagePreset: { ...this.pagePreset },
            defaultBackground: this.defaultBackground,
            pages: this.pages.map((p) => ({
                id: p.id,
                file: `${p.id}.ink`,
                label: '',
                background: p.background,
            })),
        };
    }

    /** Deserialize from metadata + page data map. */
    static deserialize(
        meta: MetaData,
        pagesData: Map<string, PageData>
    ): InkDocument {
        const doc = new InkDocument(meta.pagePreset, meta.defaultBackground);
        doc.version = meta.version ?? 1;
        doc.pluginVersion = meta.pluginVersion ?? '0.1.0';
        doc.createdAt = meta.createdAt ?? new Date().toISOString();
        doc.modifiedAt = meta.modifiedAt ?? new Date().toISOString();

        if (Array.isArray(meta.pages)) {
            for (const pageInfo of meta.pages) {
                const pageData = pagesData.get(pageInfo.file);
                if (pageData) {
                    if (doc.version < 2) {
                        for (const el of pageData.elements) {
                            if (el.type === 'stroke') {
                                (el as any).isHighlight = false;
                            }
                        }
                    }
                    const page = InkPage.deserialize(pageData);
                    doc.pages.push(page);
                } else {
                    // Page data not found — create empty page with matching id
                    const page = new InkPage(
                        pageInfo.id,
                        pageInfo.background ?? meta.defaultBackground
                    );
                    doc.pages.push(page);
                }
            }
        }

        return doc;
    }
}
