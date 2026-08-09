/**
 * CRITICAL ARCHITECTURAL RISK WARNING:
 * This worker directly mutates Obsidian's private internal structures:
 * `app.metadataCache.resolvedLinks` and `app.metadataCache.unresolvedLinks`.
 * These are not public APIs and are subject to breaking changes without notice.
 * All mutations must remain defensively wrapped to ensure graceful degradation.
 */
import { App, TFile } from 'obsidian';

/**
 * Checks if a URL points to an external resource rather than an internal Obsidian note.
 */
export function isExternalUrl(url: string): boolean {
    return /^[a-z0-9+.-]+:\/\//i.test(url) || /^(mailto|tel|obsidian):/i.test(url);
}

/**
 * GraphCacheWorker coordinates direct injection of drawings' link paths into
 * Obsidian's internal metadata cache resolved and unresolved link tables.
 */
export class GraphCacheWorker {
    // Tracks parent notes displaying each canvas ID: canvasId -> Set of parentNotePaths
    private canvasToNotes = new Map<string, Set<string>>();

    // Tracks current links extracted for each canvas ID: canvasId -> array of link texts
    private canvasLinks = new Map<string, string[]>();

    // Tracks previously injected keys for each note path to ensure clean overwrite/re-injection: parentNotePath -> Set of injected target paths/keys
    private lastInjectedLinks = new Map<string, Set<string>>();

    constructor(private app: App) {}

    /**
     * Registers a mapping between a canvas and a parent note.
     */
    registerCanvas(canvasId: string, parentNotePath: string): void {
        let notes = this.canvasToNotes.get(canvasId);
        if (!notes) {
            notes = new Set();
            this.canvasToNotes.set(canvasId, notes);
        }
        notes.add(parentNotePath);
        this.reinjectVectorLinks();
    }

    /**
     * Unregisters a mapping between a canvas and a parent note.
     */
    unregisterCanvas(canvasId: string, parentNotePath: string): void {
        const notes = this.canvasToNotes.get(canvasId);
        if (notes) {
            notes.delete(parentNotePath);
            if (notes.size === 0) {
                this.canvasToNotes.delete(canvasId);
                this.canvasLinks.delete(canvasId);
            }
        }
        this.reinjectVectorLinks();
    }

    /**
     * Updates active links for a canvas and triggers re-injection.
     */
    updateCanvasLinks(canvasId: string, links: string[]): void {
        this.canvasLinks.set(canvasId, links);
        this.reinjectVectorLinks();
    }

    /**
     * Forcefully re-injects all vector drawing link relationships into Obsidian's internal resolved/unresolved link caches.
     */
    reinjectVectorLinks(): void {
        if (!this.app.metadataCache || !this.app.metadataCache.resolvedLinks || !this.app.metadataCache.unresolvedLinks) {
            console.warn('[InkGraphWorker] Metadata structures missing or modified. Ingestion bypassed.');
            return;
        }

        try {
            const cache = this.app.metadataCache as any;

            // 1. Clean up previously injected links to prevent stale states
            for (const [parentNotePath, targetKeys] of this.lastInjectedLinks.entries()) {
                const res = cache.resolvedLinks[parentNotePath];
                if (res) {
                    for (const key of targetKeys) {
                        delete res[key];
                    }
                    if (Object.keys(res).length === 0) {
                        delete cache.resolvedLinks[parentNotePath];
                    }
                }

                const unres = cache.unresolvedLinks[parentNotePath];
                if (unres) {
                    for (const key of targetKeys) {
                        delete unres[key];
                    }
                    if (Object.keys(unres).length === 0) {
                        delete cache.unresolvedLinks[parentNotePath];
                    }
                }
            }
            this.lastInjectedLinks.clear();

            // 2. Build noteToCanvases mapping from canvasToNotes on the fly
            const noteToCanvases = new Map<string, Set<string>>();
            for (const [canvasId, notePaths] of this.canvasToNotes.entries()) {
                for (const notePath of notePaths) {
                    let canvases = noteToCanvases.get(notePath);
                    if (!canvases) {
                        canvases = new Set();
                        noteToCanvases.set(notePath, canvases);
                    }
                    canvases.add(canvasId);
                }
            }

            // 3. Perform direct cache mutations for each parent note
            for (const [parentNotePath, canvases] of noteToCanvases.entries()) {
                const injectedSet = new Set<string>();

                // 1. Draw edge from Markdown Note to the embedded Canvas file
                for (const canvasId of canvases) {
                    const canvasAssetPath = `ApoloCanvas/data/${canvasId}.ink`;
                    if (!cache.resolvedLinks[parentNotePath]) {
                        cache.resolvedLinks[parentNotePath] = {};
                    }
                    cache.resolvedLinks[parentNotePath][canvasAssetPath] = 1;
                    injectedSet.add(canvasAssetPath);
                }

                // 2. Draw edges from Markdown Note to all elements hyperlinked inside that canvas
                const linkCounts = new Map<string, number>();
                for (const canvasId of canvases) {
                    const links = this.canvasLinks.get(canvasId) || [];
                    for (const link of links) {
                        const trimmed = link.trim();
                        if (trimmed && !isExternalUrl(trimmed)) {
                            linkCounts.set(trimmed, (linkCounts.get(trimmed) || 0) + 1);
                        }
                    }
                }

                for (const [targetLink, count] of linkCounts.entries()) {
                    const baseLinkPath = targetLink.includes('#') ? targetLink.split('#')[0] : targetLink;
                    const destFile = this.app.metadataCache.getFirstLinkpathDest(baseLinkPath, parentNotePath);
                    if (destFile) {
                        const targetPath = destFile.path;
                        if (!cache.resolvedLinks[parentNotePath]) {
                            cache.resolvedLinks[parentNotePath] = {};
                        }
                        cache.resolvedLinks[parentNotePath][targetPath] = (cache.resolvedLinks[parentNotePath][targetPath] || 0) + count;
                        injectedSet.add(targetPath);
                    } else {
                        if (!cache.unresolvedLinks[parentNotePath]) {
                            cache.unresolvedLinks[parentNotePath] = {};
                        }
                        cache.unresolvedLinks[parentNotePath][baseLinkPath] = (cache.unresolvedLinks[parentNotePath][baseLinkPath] || 0) + count;
                        injectedSet.add(baseLinkPath);
                    }
                }

                if (injectedSet.size > 0) {
                    this.lastInjectedLinks.set(parentNotePath, injectedSet);
                }
            }
        } catch (e) {
            console.warn('[InkGraphWorker] Exception during cache sweeping/injection. Cache format may have changed.', e);
            // clear transient state and fail silently
            this.lastInjectedLinks.clear();
        }
    }

    /**
     * Runs an asynchronous vault-wide ingestion scan to compile structural
     * connections for closed notes.
     */
    async initializeVaultIndex(): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        for (const file of markdownFiles) {
            const content = await this.app.vault.cachedRead(file);
            const regex = /```ink\s*([\s\S]*?)```/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                const blockBody = match[1];
                const idMatch = blockBody.match(/^id:\s*"?([^"\n]+)"?\s*$/m);
                if (idMatch) {
                    const canvasId = idMatch[1].trim();
                    
                    let notes = this.canvasToNotes.get(canvasId);
                    if (!notes) {
                        notes = new Set();
                        this.canvasToNotes.set(canvasId, notes);
                    }
                    notes.add(file.path);
                    
                    const canvasPath = `ApoloCanvas/data/${canvasId}.ink`;
                    const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
                    if (canvasFile && canvasFile instanceof TFile) {
                        try {
                            const rawData = await this.app.vault.read(canvasFile);
                            const parsed = JSON.parse(rawData);
                            const links: string[] = [];
                            if (parsed && Array.isArray(parsed.elements)) {
                                for (const el of parsed.elements) {
                                    if (el && typeof el.url === 'string' && el.url.trim().length > 0) {
                                        links.push(el.url.trim());
                                    }
                                }
                            }
                            this.canvasLinks.set(canvasId, links);
                        } catch (e) {
                            // Suppress errors for missing or corrupt files
                        }
                    }
                }
            }
        }
        this.reinjectVectorLinks();
    }

    /**
     * Swaps file keys inside RAM resolved/unresolved cache and state registries
     * instantly when a canvas is renamed.
     */
    handleCanvasRename(file: TFile, oldPath: string): void {
        const oldId = oldPath.split('/').pop()?.replace(/\.ink$/i, '') || '';
        const newId = file.basename;
        if (!oldId || !newId || oldId === newId) return;

        // 1. Morph keys in state registries
        const notes = this.canvasToNotes.get(oldId);
        if (notes) {
            this.canvasToNotes.set(newId, new Set(notes));
            this.canvasToNotes.delete(oldId);
        }
        const links = this.canvasLinks.get(oldId);
        if (links) {
            this.canvasLinks.set(newId, [...links]);
            this.canvasLinks.delete(oldId);
        }

        // 2. Morph keys in metadata resolved/unresolved caches
        const cache = this.app.metadataCache as any;
        const oldPathAsset = `ApoloCanvas/data/${oldId}.ink`;
        const newPathAsset = `ApoloCanvas/data/${newId}.ink`;

        if (cache && cache.resolvedLinks) {
            for (const parentNote of Object.keys(cache.resolvedLinks)) {
                const targets = cache.resolvedLinks[parentNote];
                if (targets && targets[oldPathAsset] !== undefined) {
                    const val = targets[oldPathAsset];
                    delete targets[oldPathAsset];
                    targets[newPathAsset] = val;
                }
            }
        }

        if (cache && cache.unresolvedLinks) {
            for (const parentNote of Object.keys(cache.unresolvedLinks)) {
                const targets = cache.unresolvedLinks[parentNote];
                if (targets && targets[oldPathAsset] !== undefined) {
                    const val = targets[oldPathAsset];
                    delete targets[oldPathAsset];
                    targets[newPathAsset] = val;
                }
            }
        }

        // 3. Morph keys in lastInjectedLinks
        for (const [parentNote, injectedKeys] of this.lastInjectedLinks.entries()) {
            if (injectedKeys.has(oldPathAsset)) {
                injectedKeys.delete(oldPathAsset);
                injectedKeys.add(newPathAsset);
            }
        }

        // 4. Synchronously execute reinjectVectorLinks
        this.reinjectVectorLinks();
    }

    /**
     * Updates index mappings for a note when it changes on disk.
     */
    async updateNoteIndex(file: TFile): Promise<void> {
        const notePath = file.path;

        // Remove this note path from all canvases in the registry
        for (const [canvasId, notes] of this.canvasToNotes.entries()) {
            if (notes.has(notePath)) {
                notes.delete(notePath);
                if (notes.size === 0) {
                    this.canvasToNotes.delete(canvasId);
                }
            }
        }

        // Scan file content for ink blocks
        try {
            const content = await this.app.vault.cachedRead(file);
            const regex = /```ink\s*([\s\S]*?)```/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                const blockBody = match[1];
                const idMatch = blockBody.match(/^id:\s*"?([^"\n]+)"?\s*$/m);
                if (idMatch) {
                    const canvasId = idMatch[1].trim();
                    let notes = this.canvasToNotes.get(canvasId);
                    if (!notes) {
                        notes = new Set();
                        this.canvasToNotes.set(canvasId, notes);
                    }
                    notes.add(notePath);

                    if (!this.canvasLinks.has(canvasId)) {
                        await this.loadCanvasLinksFromDisk(canvasId);
                    }
                }
            }
        } catch (e) {
            // Suppress errors
        }

        this.reinjectVectorLinks();
    }

    /**
     * Loads canvas hyperlink targets directly from disk.
     */
    private async loadCanvasLinksFromDisk(canvasId: string): Promise<void> {
        const canvasPath = `ApoloCanvas/data/${canvasId}.ink`;
        const file = this.app.vault.getAbstractFileByPath(canvasPath);
        if (file && file instanceof TFile) {
            try {
                const rawData = await this.app.vault.read(file);
                const parsed = JSON.parse(rawData);
                const links: string[] = [];
                if (parsed && Array.isArray(parsed.elements)) {
                    for (const el of parsed.elements) {
                        if (el && typeof el.url === 'string' && el.url.trim().length > 0) {
                            links.push(el.url.trim());
                        }
                    }
                }
                this.canvasLinks.set(canvasId, links);
            } catch (e) {
                // Suppress
            }
        }
    }
}
