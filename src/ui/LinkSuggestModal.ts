import { FuzzySuggestModal, TFile, App, FuzzyMatch, setIcon } from 'obsidian';

/**
 * Native Obsidian Fuzzy File Suggestion Modal for assigning links to drawing elements.
 */
export class LinkSuggestModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App,
        private onSelect: (link: string) => void
    ) {
        super(app);
        this.setPlaceholder('Buscar nota para enlazar...');
    }

    onOpen(): void {
        super.onOpen();
        this.inputEl.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter') {
                const currentInput = this.inputEl.value.trim();
                if (!currentInput) return;

                const suggestionItems = this.containerEl.querySelectorAll('.suggestion-item');
                if (suggestionItems.length === 0) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.onSelect(currentInput);
                    this.close();
                }
            }
        });
    }

    /** Retrieve list of all files in the vault, ignoring non-drawing internal assets. */
    getItems(): TFile[] {
        const files = this.app.vault.getFiles();
        return files.filter(file => {
            if (file.extension === 'ink') return true;
            return !file.path.startsWith('ObsidianInk/data/');
        });
    }

    /** Use file path to display duplicates clearly. */
    getItemText(file: TFile): string {
        return file.path;
    }

    /** Custom suggestion renderer featuring professional Lucide icons and parent paths. */
    renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
        el.empty();
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';

        const file = match.item;
        const ext = file.extension.toLowerCase();
        
        let iconId = 'file';
        if (ext === 'md') {
            iconId = 'document';
        } else if (ext === 'ink') {
            iconId = 'pencil';
        } else if (ext === 'pdf') {
            iconId = 'pdf-file';
        } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
            iconId = 'image';
        } else if (ext === 'canvas') {
            iconId = 'layout-dashboard';
        }

        const iconContainer = el.createEl('div', { cls: 'suggestion-icon' });
        setIcon(iconContainer, iconId);

        const textContainer = el.createEl('div', { cls: 'suggestion-content' });
        textContainer.style.display = 'flex';
        textContainer.style.flexDirection = 'column';

        let titleText = file.name;
        if (ext === 'md') {
            titleText = file.basename;
        }

        textContainer.createEl('div', { cls: 'suggestion-title', text: titleText });
        
        const parentPath = file.parent ? file.parent.path : '';
        if (parentPath && parentPath !== '/') {
            const subtitleEl = textContainer.createEl('div', { cls: 'suggestion-note' });
            subtitleEl.textContent = parentPath + '/';
            subtitleEl.style.opacity = '0.5';
            subtitleEl.style.fontSize = '0.8em';
        }
    }

    /** Formats choice using clean, unbracketed relative vault path and triggers callback. */
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(file.path);
    }
}
