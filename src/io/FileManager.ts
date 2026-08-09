import { App, TFile, TFolder, normalizePath, Notice } from 'obsidian';
import { InkPage, PageData } from '../model/InkPage';
import { InkDocument } from '../model/InkDocument';

/**
 * Manages reading and writing ink data to the Obsidian vault.
 * All active ink data lives in ApoloCanvas/data/<page-id>.json.
 */
export class InkFileManager {
    constructor(private app: App) {}

    /**
     * Load a single page's data directly by ID.
     */
    async loadPage(id: string): Promise<InkPage | null> {
        let pagePath = `ApoloCanvas/data/${id}.ink`;
        let isLegacy = false;

        if (!(await this.app.vault.adapter.exists(pagePath))) {
            const legacyPath = `ApoloCanvas/data/${id}.json`;
            if (await this.app.vault.adapter.exists(legacyPath)) {
                pagePath = legacyPath;
                isLegacy = true;
            } else {
                return null;
            }
        }

        try {
            const raw = await this.app.vault.adapter.read(pagePath);
            const data = JSON.parse(raw) as PageData;
            const page = InkPage.deserialize(data);

            if (isLegacy) {
                await this.savePage(page);
                await this.app.vault.adapter.remove(pagePath);
            }

            return page;
        } catch (err) {
            console.error(`[ApoloCanvas] Failed to read page ${id}:`, err);
            return null;
        }
    }

    /**
     * Save a single page's data directly.
     */
    async savePage(page: InkPage): Promise<void> {
        const pagePath = `ApoloCanvas/data/${page.id}.ink`;
        const json = JSON.stringify(page.serialize(), null, 2);
        await this.app.vault.adapter.write(pagePath, json);
    }

    /**
     * Delete a single page's data file permanently from the vault.
     */
    async deletePage(id: string): Promise<void> {
        const pagePath = `ApoloCanvas/data/${id}.ink`;
        if (await this.app.vault.adapter.exists(pagePath)) {
            await this.app.vault.adapter.remove(pagePath);
        } else {
            const legacyPath = `ApoloCanvas/data/${id}.json`;
            if (await this.app.vault.adapter.exists(legacyPath)) {
                await this.app.vault.adapter.remove(legacyPath);
            }
        }
    }

    /**
     * Recursively scan the vault for folders named `.assets/ink/` and copy
     * their JSON contents to the centralized storage location.
     */
    async migrateFromLegacyStorage(plugin: any): Promise<void> {
        try {
            const files = this.app.vault.getAllLoadedFiles();
            let migratedCount = 0;

            for (const file of files) {
                if (file instanceof TFolder && file.path.endsWith('.assets/ink')) {
                    const children = file.children;
                    for (const child of children) {
                        if (child instanceof TFile && child.extension === 'json') {
                            const destName = child.name.replace(/\.json$/i, '.ink');
                            const destPath = `ApoloCanvas/data/${destName}`;
                            // Read from source, write to centralized destination
                            const content = await this.app.vault.read(child);
                            await this.app.vault.adapter.write(destPath, content);
                            migratedCount++;
                        }
                    }
                }
            }

            if (migratedCount > 0) {
                new Notice(
                    `Apolo Canvas: data migrated to ApoloCanvas/data/. Legacy .assets/ink/ folders can be deleted manually.`
                );
            }

            plugin.settings.migrationComplete = true;
            await plugin.saveSettings();
        } catch (err) {
            console.error('[ApoloCanvas] Legacy data migration failed:', err);
        }
    }

    // ── DEPRECATED METHODS ──

    /** @deprecated Use loadPage instead */
    async loadPageLegacy(notePath: string, pageFile: string): Promise<PageData | null> {
        console.warn('loadPageLegacy is deprecated. Use loadPage instead.');
        const pageId = pageFile.replace(/\.json$/i, '');
        const page = await this.loadPage(pageId);
        return page ? page.serialize() : null;
    }

    /** @deprecated Use savePage instead */
    async savePageLegacy(notePath: string, pageFile: string, data: PageData): Promise<void> {
        console.warn('savePageLegacy is deprecated. Use savePage instead.');
        const page = InkPage.deserialize(data);
        await this.savePage(page);
    }

    /** @deprecated Use loadPage instead */
    async loadDocument(notePath: string): Promise<InkDocument | null> {
        console.warn('loadDocument is deprecated. Retire InkDocument usage.');
        return null;
    }

    /** @deprecated Use savePage instead */
    async saveDocument(notePath: string, doc: InkDocument): Promise<void> {
        console.warn('saveDocument is deprecated. Retire InkDocument usage.');
        for (const page of doc.pages) {
            await this.savePage(page);
        }
    }

    /** @deprecated Use savePage instead */
    async savePageOnly(notePath: string, page: InkPage, doc: InkDocument): Promise<void> {
        console.warn('savePageOnly is deprecated. Retire InkDocument usage.');
        await this.savePage(page);
    }

    /** @deprecated */
    async hasInkData(notePath: string): Promise<boolean> {
        console.warn('hasInkData is deprecated.');
        return false;
    }

    /** @deprecated */
    getInkFolderPath(notePath: string): string {
        console.warn('getInkFolderPath is deprecated.');
        const base = notePath.replace(/\.md$/i, '');
        return normalizePath(`${base}.assets/ink`);
    }

    /** @deprecated */
    async ensureInkFolder(notePath: string): Promise<string> {
        console.warn('ensureInkFolder is deprecated.');
        return '';
    }
}
