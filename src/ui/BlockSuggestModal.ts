import { FuzzySuggestModal, TFile, App } from 'obsidian';

/**
 * Fuzzy search modal to select a specific ```ink block within a note.
 */
export class BlockSuggestModal extends FuzzySuggestModal<string> {
    private blockTitles = new Map<string, string>();
    private blockIds: string[] = [];

    constructor(
        app: App,
        private targetFile: TFile,
        private onSelect: (blockId: string) => void
    ) {
        super(app);
        this.setPlaceholder('Seleccionar bloque Ink...');
    }

    /** Parses note sections to find and extract ink block IDs. */
    getItems(): any {
        return this.loadItems();
    }

    private async loadItems(): Promise<string[]> {
        const cache = this.app.metadataCache.getFileCache(this.targetFile);
        const content = await this.app.vault.cachedRead(this.targetFile);
        const lines = content.split('\n');
        const blockIds: string[] = [];

        if (cache && cache.sections) {
            const codeSections = cache.sections.filter(sec => sec.type === 'code');
            for (const sec of codeSections) {
                const startLine = sec.position.start.line;
                const endLine = sec.position.end.line;
                const blockLines = lines.slice(startLine, endLine + 1);
                const firstLine = blockLines[0] || '';
                if (firstLine.trim().startsWith('```ink')) {
                    let id = '';
                    let title = '';
                    for (const line of blockLines) {
                        const idMatch = line.match(/^id:\s*"?([^"\n]+)"?\s*$/);
                        if (idMatch) {
                            id = idMatch[1].trim();
                        }
                        const titleMatch = line.match(/^title:\s*"?([^"\n]+)"?\s*$/);
                        if (titleMatch) {
                            title = titleMatch[1].trim();
                        }
                    }
                    if (id) {
                        blockIds.push(id);
                        if (title) {
                            this.blockTitles.set(id, title);
                        }
                    }
                }
            }
        }
        this.blockIds = blockIds;
        return blockIds;
    }

    /** Returns custom title if parsed, otherwise default canvas ID string. */
    getItemText(item: string): string {
        return this.blockTitles.get(item) || item;
    }

    /** Triggers completion callback. */
    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(item);
    }
}
