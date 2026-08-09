import { App, Modal, Setting } from 'obsidian';

/**
 * Naming modal for custom tool configurations.
 */
export class PencilCasePresetNameModal extends Modal {
    private result: string = '';

    constructor(
        app: App,
        private onSubmit: (name: string) => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Name new Tool Preset' });

        let nameInput: HTMLInputElement;

        new Setting(contentEl)
            .setName('Preset Name')
            .setDesc('Enter a name for the saved tool configuration.')
            .addText((text) => {
                nameInput = text.inputEl;
                text.onChange((value) => {
                    this.result = value.trim();
                });
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText('Save')
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
        const name = this.result || 'My Preset';
        this.onSubmit(name);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
