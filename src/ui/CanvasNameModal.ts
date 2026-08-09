import { App, Modal, Setting } from 'obsidian';

/**
 * Modern modal to prompt the user for a semantic canvas name.
 */
export class CanvasNameModal extends Modal {
    private result: string = '';

    constructor(
        app: App,
        private activeNoteTitle: string,
        private onSubmit: (name: string) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Name new Ink Canvas' });

        let nameInput: HTMLInputElement;

        new Setting(contentEl)
            .setName('Canvas Name')
            .setDesc('Enter a name for the new canvas (leave empty for automatic name).')
            .addText((text) => {
                nameInput = text.inputEl;
                text.onChange((value) => {
                    this.result = value.trim();
                });
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText('Confirm')
                    .setCta()
                    .onClick(() => {
                        this.submit();
                    });
            });

        nameInput!.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this.submit();
            }
        });

        nameInput!.focus();
    }

    private submit() {
        let name = this.result;
        if (!name) {
            const now = new Date();
            const pad = (value: number) => String(value).padStart(2, '0');
            const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
            name = `${this.activeNoteTitle} - ${timestamp}`;
        }
        // Sanitize name to make it a safe Obsidian filename
        const sanitized = name.replace(/[\\\/:\*\?"<>\|]/g, '').trim();
        this.onSubmit(sanitized);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
