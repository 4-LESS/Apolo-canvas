import { FuzzySuggestModal, TFile, App } from 'obsidian';

/**
 * Native Obsidian Fuzzy File Suggestion Modal for selecting existing ink canvases to embed.
 */
export class CanvasSuggestModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App,
        private onSelect: (file: TFile) => void
    ) {
        super(app);
        this.setPlaceholder('Seleccionar un lienzo Ink existente...');
    }

    /** Retrieve list of all .ink files located in the central data folder. */
    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(file =>
            file.extension === 'ink' &&
            file.path.startsWith('ApoloCanvas/data/')
        );
    }

    /** Returns the clean file basename (UUID) to display. */
    getItemText(file: TFile): string {
        return file.basename;
    }

    /** Triggers selection callback. */
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(file);
    }
}
