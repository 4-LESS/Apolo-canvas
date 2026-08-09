import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import type { Toolbar } from '../../Toolbar';

export class SwatchManagerPopover extends BasePopover {
    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-palette-management-popover', dismissBoundary);
    }

    protected buildContent(): void {
        // Dynamic per active tool.
    }

    public showPaletteMatrix(triggerEl: HTMLElement, engine: InkEngine): void {
        const isHighlighter = engine.getToolName() === 'highlighter';
        const settings = this.plugin?.settings ?? {};
        const { palettes, activePaletteId } = this.toolbar.getPaletteData(isHighlighter);

        this.el.empty();
        this.el.createEl('div', { cls: 'ink-style-header', text: 'PALETTES' });
        const listContainer = this.el.createDiv({ cls: 'ink-palette-list' });

        const renderList = () => {
            listContainer.empty();
            palettes.forEach((pal: any) => {
                const row = listContainer.createDiv({ cls: 'ink-palette-row' });
                if (pal.id === activePaletteId) this.addClass(row, 'is-active');

                const nameInput = row.createEl('input', {
                    cls: 'ink-palette-name-input',
                    attr: { type: 'text', value: pal.name ?? 'Untitled' }
                }) as HTMLInputElement;
                nameInput.addEventListener('change', () => {
                    pal.name = nameInput.value.trim() || 'Untitled';
                    this.plugin?.saveSettings?.();
                });

                const colorsContainer = row.createDiv({ cls: 'ink-palette-colors-preview' });
                pal.colors.forEach((color: string) => {
                    const colorDot = colorsContainer.createDiv({ cls: 'ink-palette-color-dot' });
                    colorDot.style.backgroundColor = color;
                });

                row.addEventListener('click', (e) => {
                    if (e.target === nameInput) return;
                    if (isHighlighter) settings.activeHighlighterPaletteId = pal.id;
                    else settings.activePenPaletteId = pal.id;

                    const activeIdx = isHighlighter ? settings.activeHighlighterColorIndex : settings.activePenColorIndex;
                    const newColor = pal.colors[activeIdx ?? 0] ?? pal.colors[0];
                    if (isHighlighter) settings.lastHighlighterColorHex = newColor;
                    else settings.lastPenColorHex = newColor;

                    engine.setPenColor(newColor);
                    engine.requestFullRender();
                    const saved = this.plugin?.saveSettings?.();
                    if (saved?.then) saved.then(() => this.toolbar.syncToolState());
                    else this.toolbar.syncToolState();
                    this.hide();
                });
            });

            const addRow = listContainer.createDiv({ cls: 'ink-palette-add-row', text: '+ Add Custom Palette' });
            addRow.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const nextCustomPaletteIndex = palettes.reduce((max: number, p: any) => {
                    const match = p.name?.match(/^Custom Palette(?:\s+(\d+))?$/i);
                    return match ? Math.max(max, Number(match[1] ?? '1')) : max;
                }, 0);
                const colors = isHighlighter
                    ? ['#ffff0080', '#00ff0080', '#ff00ff80', '#00ffff80']
                    : ['#000000', '#ff0000', '#0000ff', '#00ff00'];
                const newPalette = {
                    id: `custom_${Date.now()}`,
                    name: `Custom Palette ${nextCustomPaletteIndex + 1}`,
                    colors
                };
                palettes.push(newPalette);
                if (isHighlighter) settings.activeHighlighterPaletteId = newPalette.id;
                else settings.activePenPaletteId = newPalette.id;
                engine.setPenColor(newPalette.colors[0]);
                engine.requestFullRender();
                const saved = this.plugin?.saveSettings?.();
                if (saved?.then) saved.then(renderList);
                else renderList();
                this.toolbar.syncToolState();
            });
        };

        renderList();
        this.show(triggerEl);
    }
}
