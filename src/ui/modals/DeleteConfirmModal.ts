import { App, Modal } from 'obsidian';

export class DeleteConfirmModal extends Modal {
    private onConfirm: () => void;

    constructor(app: App, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Delete Ink Data' });
        contentEl.createEl('p', {
            text: 'Are you sure you want to permanently delete this ink block and its underlying data file? This action cannot be undone.'
        });

        const btnContainer = contentEl.createDiv({ cls: 'ink-modal-buttons' });

        const cancelBtn = btnContainer.createEl('button', {
            cls: 'ink-modal-btn',
            text: 'Cancel'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });

        const deleteBtn = btnContainer.createEl('button', {
            cls: 'ink-modal-btn mod-warning',
            text: 'Delete'
        });
        deleteBtn.addEventListener('click', () => {
            this.onConfirm();
            this.close();
        });

        // Set default focus on cancel button
        cancelBtn.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
