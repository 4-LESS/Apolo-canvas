import { BoundingBox } from '../model/BoundingBox';
import { LinkSuggestModal } from './LinkSuggestModal';
import { BlockSuggestModal } from './BlockSuggestModal';

interface PageToScreenMapper {
    pageToScreen(pageX: number, pageY: number): { x: number; y: number };
}

/**
 * Overlay menu that appears immediately above selected ink elements.
 */
export class SelectionMenu {
    private element: HTMLElement;
    private outsideClickListener: ((e: PointerEvent) => void) | null = null;
    private selectionManager: any = null;
    private engine: any = null;
    private isStyleMode = false;
    private app: any = null;

    constructor(mountTarget: HTMLElement) {
        this.element = mountTarget.createEl('div', { cls: 'ink-selection-menu' });
        this.element.style.display = 'none';
        this.element.style.position = 'absolute';
        this.element.style.zIndex = '1001';
        this.buildItems();
    }

    setSelectionManager(sm: any): void {
        this.selectionManager = sm;
    }

    setEngine(engine: any): void {
        this.engine = engine;
    }

    setApp(app: any): void {
        this.app = app;
    }

    private createChild(parent: HTMLElement, tag: string, attrs?: any): HTMLElement {
        if (parent && typeof parent.createEl === 'function') {
            return parent.createEl(tag as any, attrs);
        }
        // Fallback for unit testing mock environments where parent doesn't have createEl
        const mockChild = {
            style: {},
            addEventListener: () => {},
            setAttribute: () => {},
            classList: {
                add: (c: string) => { mockChild.className = (mockChild.className || '') + ' ' + c; },
                remove: (c: string) => { mockChild.className = (mockChild.className || '').replace(c, ''); },
            },
            innerHTML: '',
            textContent: '',
            className: attrs?.cls || '',
        } as any;
        return mockChild;
    }

    private buildItems(): void {
        if (typeof this.element.empty === 'function') {
            this.element.empty();
        } else {
            this.element.innerHTML = '';
        }

        if (!this.isStyleMode) {
            // Base actions mode
            let hasLinkedElement = false;
            if (this.selectionManager && this.engine) {
                const selectedIds = this.selectionManager.getState().selectedIds;
                for (const id of selectedIds) {
                    const el = this.engine.getActivePage().getElementById(id);
                    if (el && typeof el.url === 'string' && el.url.trim().length > 0) {
                        hasLinkedElement = true;
                        break;
                    }
                }
            }

            const items: { svg: string; title: string; action: () => void; disabled?: boolean }[] = [
                {
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
                    title: 'Copy',
                    action: () => { this.copy(); this.hide(); }
                },
                {
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
                    title: 'Paste',
                    action: () => { this.paste(); this.hide(); }
                },
                {
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
                    title: 'Link',
                    action: () => { this.promptForLink(); }
                }
            ];

            if (hasLinkedElement) {
                items.push({
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M18.8 6.2c.5.5.9 1.1 1.2 1.8.4.8.5 1.7.5 2.5a5 5 0 0 1-1.5 3.5l-3 3a5 5 0 0 1-3.6 1.5h-1.4"></path><path d="M10 13a5 5 0 0 1-.5-1"></path><path d="M5.2 17.8a5 5 0 0 1-1.7-4.3c0-.9.2-1.7.5-2.5.3-.7.7-1.3 1.2-1.8l3-3a5 5 0 0 1 6.8-.2"></path></svg>`,
                    title: 'Unlink',
                    action: () => {
                        this.selectionManager?.applyUrlToSelection(undefined);
                        this.engine?.requestFullRender();
                        this.engine?.requestSave();
                        this.hide();
                    }
                });
            }

            items.push(
                {
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C17.52 22 22 17.52 22 12S17.52 2 12 2 2 6.48 2 12c0 2.23.8 4.29 2.13 5.92A1 1 0 0 0 5 18h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3z"></path><path d="M12 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path><path d="M16 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path><path d="M12 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path><path d="M8 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path></svg>`,
                    title: 'Style',
                    action: () => { this.isStyleMode = true; this.buildItems(); }
                },
                {
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="8" height="8" rx="2"></rect><path d="M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M14 18a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2"></path></svg>`,
                    title: 'Bring to Front',
                    action: () => {
                        this.selectionManager?.bringSelectionToFront();
                        this.engine?.requestFullRender();
                        this.engine?.requestSave();
                        this.hide();
                    }
                },
                {
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="14" width="8" height="8" rx="2"></rect><rect x="2" y="2" width="8" height="8" rx="2"></rect><path d="M14 8a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2z"></path></svg>`,
                    title: 'Send to Back',
                    action: () => {
                        this.selectionManager?.sendSelectionToBack();
                        this.engine?.requestFullRender();
                        this.engine?.requestSave();
                        this.hide();
                    }
                }
            );

            items.forEach(({ svg, title, action, disabled }) => {
                const btn = this.createChild(this.element, 'button', {
                    cls: 'ink-menu-item' + (disabled ? ' ink-menu-item--disabled' : ''),
                });
                btn.innerHTML = svg;
                if (title && typeof btn.setAttribute === 'function') {
                    btn.setAttribute('title', title);
                }
                if (!disabled) {
                    btn.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        action();
                    });
                }
            });
        } else {
            // Style mode: Back button, Colors, Width slider, Pattern buttons
            
            // 1. Back button
            const backBtn = this.createChild(this.element, 'button', {
                cls: 'ink-menu-item ink-menu-back-btn',
            });
            backBtn.textContent = '←';
            backBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this.isStyleMode = false;
                this.buildItems();
            });

            this.createSeparator();

            // Read currently active stroke properties from selection (if any)
            let activeColor = '';
            let activePattern = '';
            let currentWidth = 5;
            let activeFill = '';
            if (this.selectionManager && this.engine) {
                const selectedIds = this.selectionManager.getState().selectedIds;
                const firstId = Array.from(selectedIds)[0];
                if (firstId) {
                    const firstEl = this.engine.getActivePage().getElementById(firstId);
                    if (firstEl && (firstEl as any).style) {
                        activeColor = (firstEl as any).style.strokeColor || '';
                        activePattern = (firstEl as any).style.strokePattern || '';
                        currentWidth = (firstEl as any).style.strokeWidth || 5;
                        activeFill = (firstEl as any).style.fillColor || '';
                    }
                }
            }

            // Create styles column
            const stylesCol = this.createChild(this.element, 'div', { cls: 'ink-menu-styles-col' });

            // Row 1: Contorno (Stroke Color)
            const strokeRow = this.createChild(stylesCol, 'div', { cls: 'ink-menu-row' });
            const strokeLabel = this.createChild(strokeRow, 'span', { cls: 'ink-menu-row-label' });
            strokeLabel.textContent = 'Borde:';

            const colors = ['#1a1a1a', '#1e3a5f', '#7c1d1d', '#1a3d2b', '#FFE066'];
            const colorsContainer = this.createChild(strokeRow, 'div', { cls: 'ink-menu-colors' });
            colors.forEach((color) => {
                const swatch = this.createChild(colorsContainer, 'div', { cls: 'ink-menu-swatch' });
                swatch.style.backgroundColor = color;
                
                if (activeColor && color.toLowerCase() === activeColor.toLowerCase()) {
                    swatch.classList.add('is-active');
                }

                swatch.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    colorsContainer.querySelectorAll('.ink-menu-swatch').forEach(s => s.classList.remove('is-active'));
                    swatch.classList.add('is-active');
                    if (this.selectionManager) {
                        this.selectionManager.applyStyleToSelection({ strokeColor: color });
                        this.engine?.render();
                        this.engine?.triggerSave();
                    }
                });
            });

            // Row 2: Relleno (Fill Color) - Only render if a shape is selected
            let hasShapeSelected = false;
            if (this.selectionManager && this.engine) {
                const selectedIds = this.selectionManager.getState().selectedIds;
                for (const id of selectedIds) {
                    const el = this.engine.getActivePage().getElementById(id);
                    if (el && el.type === 'shape') {
                        hasShapeSelected = true;
                        break;
                    }
                }
            }

            if (hasShapeSelected) {
                const fillRow = this.createChild(stylesCol, 'div', { cls: 'ink-menu-row' });
                const fillLabel = this.createChild(fillRow, 'span', { cls: 'ink-menu-row-label' });
                fillLabel.textContent = 'Relleno:';

                const fillColorsContainer = this.createChild(fillRow, 'div', { cls: 'ink-menu-colors' });

                // None / Transparent swatch
                const noneSwatch = this.createChild(fillColorsContainer, 'div', { cls: 'ink-menu-swatch swatch-transparent' });
                if (activeFill === 'transparent' || activeFill === '') {
                    noneSwatch.classList.add('is-active');
                }
                noneSwatch.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    fillColorsContainer.querySelectorAll('.ink-menu-swatch').forEach(s => s.classList.remove('is-active'));
                    noneSwatch.classList.add('is-active');
                    if (this.selectionManager) {
                        this.selectionManager.applyStyleToSelection({ fillColor: 'transparent' });
                        this.engine?.render();
                        this.engine?.triggerSave();
                    }
                });

                // Standard fill swatches
                const fillColors = ['#1a1a1a', '#1e3a5f', '#7c1d1d', '#1a3d2b', '#4a4a4a'];
                fillColors.forEach((color) => {
                    const swatch = this.createChild(fillColorsContainer, 'div', { cls: 'ink-menu-swatch' });
                    swatch.style.backgroundColor = color;
                    
                    if (activeFill && color.toLowerCase() === activeFill.toLowerCase()) {
                        swatch.classList.add('is-active');
                    }

                    swatch.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        fillColorsContainer.querySelectorAll('.ink-menu-swatch').forEach(s => s.classList.remove('is-active'));
                        swatch.classList.add('is-active');
                        if (this.selectionManager) {
                            this.selectionManager.applyStyleToSelection({ fillColor: color });
                            this.engine?.render();
                            this.engine?.triggerSave();
                        }
                    });
                });
            }

            this.createSeparator();

            // 3. Stepped Width Slider [2, 4, 5, 10] px
            const widthValues = [2, 4, 5, 10];
            const getWidthIndex = (w: number) => {
                let closestIndex = 0;
                let minDiff = Infinity;
                for (let idx = 0; idx < widthValues.length; idx++) {
                    const diff = Math.abs(widthValues[idx] - w);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIndex = idx;
                    }
                }
                return closestIndex;
            };

            const initialIndex = getWidthIndex(currentWidth);
            const widthsContainer = this.createChild(this.element, 'div', { cls: 'ink-menu-widths' });
            const slider = this.createChild(widthsContainer, 'input', {
                cls: 'ink-menu-width-slider',
                attr: {
                    type: 'range',
                    min: '0',
                    max: '3',
                    step: '1',
                    value: String(initialIndex)
                }
            }) as HTMLInputElement;

            const sizeLabel = this.createChild(widthsContainer, 'span', {
                cls: 'ink-menu-width-val',
                text: `${widthValues[initialIndex]}px`
            });

            slider.addEventListener('input', () => {
                const index = parseInt(slider.value, 10);
                const size = widthValues[index];
                sizeLabel.textContent = `${size}px`;
                
                if (this.selectionManager) {
                    this.selectionManager.applyStyleToSelection({ strokeWidth: size });
                    this.engine?.render();
                    this.engine?.triggerSave();
                }
            });

            this.createSeparator();

            // 4. Pattern SVG buttons (Solid, Dashed, Dotted)
            const patterns: { id: 'solid' | 'dashed' | 'dotted'; svg: string; title: string }[] = [
                {
                    id: 'solid',
                    title: 'Sólido',
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round"/></svg>`
                },
                {
                    id: 'dashed',
                    title: 'Guiones',
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="4,4" stroke-linecap="round"/></svg>`
                },
                {
                    id: 'dotted',
                    title: 'Puntos',
                    svg: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="20" y2="12" stroke-dasharray="1,4" stroke-linecap="round"/></svg>`
                }
            ];

            const patternsContainer = this.createChild(this.element, 'div', { cls: 'ink-menu-patterns' });
            patterns.forEach((pat) => {
                const btn = this.createChild(patternsContainer, 'button', {
                    cls: 'ink-menu-pattern-btn',
                    attr: { title: pat.title }
                });
                btn.innerHTML = pat.svg;

                if (pat.id === activePattern) {
                    btn.classList.add('is-active');
                }

                btn.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    patternsContainer.querySelectorAll('.ink-menu-pattern-btn').forEach(b => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                    if (this.selectionManager) {
                        this.selectionManager.applyStyleToSelection({ strokePattern: pat.id });
                        this.engine?.render();
                        this.engine?.triggerSave();
                    }
                });
            });
        }
    }

    private createSeparator(): void {
        this.createChild(this.element, 'div', { cls: 'ink-menu-separator' });
    }

    // Callbacks wired to engine actions in views
    onCut: (() => void) | null = null;
    onCopy: (() => void) | null = null;
    onPaste: (() => void) | null = null;

    private cut(): void {
        this.onCut?.();
    }

    private copy(): void {
        this.onCopy?.();
    }

    private paste(): void {
        this.onPaste?.();
    }

    /**
     * Positions and displays the menu centered above the selection bounds.
     * Flips the menu below the selection if it would clip above the viewport.
     */
    showAboveBounds(bounds: BoundingBox, canvasEl: HTMLCanvasElement, viewport: PageToScreenMapper): void {
        this.buildItems();
        this.element.style.display = 'flex';
        
        const rect = canvasEl.getBoundingClientRect();
        const parentRect = this.element.parentElement?.getBoundingClientRect() || {
            left: 0,
            top: 0,
            width: rect.width,
            height: rect.height,
        };

        const topLeft = viewport.pageToScreen(bounds.x, bounds.y);
        const bottomRight = viewport.pageToScreen(bounds.right, bounds.bottom);
        const screenLeft = Math.min(topLeft.x, bottomRight.x);
        const screenRight = Math.max(topLeft.x, bottomRight.x);
        const screenTop = Math.min(topLeft.y, bottomRight.y);
        const screenBottom = Math.max(topLeft.y, bottomRight.y);

        const menuW = this.element.offsetWidth || 220;
        const menuH = this.element.offsetHeight || 40;
        const padding = 8;
        const gap = 8;
        const canvasLeft = rect.left - parentRect.left;
        const canvasTop = rect.top - parentRect.top;
        const parentWidth = parentRect.width || rect.width;
        const parentHeight = parentRect.height || rect.height;

        let left = canvasLeft + (screenLeft + screenRight) / 2 - menuW / 2;
        let top = canvasTop + screenTop - menuH - gap;

        if (top < padding) {
            top = canvasTop + screenBottom + gap;
        }

        left = this.clamp(left, padding, Math.max(padding, parentWidth - menuW - padding));
        top = this.clamp(top, padding, Math.max(padding, parentHeight - menuH - padding));

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;

        // Bind outside tap listener in the next macrotask to prevent immediate self-closure
        setTimeout(() => {
            if (!this.outsideClickListener) {
                this.outsideClickListener = (e: PointerEvent) => {
                    if (!this.element.contains(e.target as Node)) {
                        this.hide();
                    }
                };
                document.addEventListener('pointerdown', this.outsideClickListener);
            }
        }, 0);
    }

    hide(): void {
        this.element.style.display = 'none';
        this.isStyleMode = false;
        this.buildItems();
        if (this.outsideClickListener) {
            document.removeEventListener('pointerdown', this.outsideClickListener);
            this.outsideClickListener = null;
        }
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    private promptForLink(): void {
        if (!this.selectionManager || !this.engine) return;

        let initialUrl = '';
        const selectedIds = this.selectionManager.getState().selectedIds;
        const firstId = Array.from(selectedIds)[0];
        if (firstId) {
            const firstEl = this.engine.getActivePage().getElementById(firstId);
            if (firstEl) {
                initialUrl = firstEl.url || '';
            }
        }

        if (this.app) {
            const modal = new LinkSuggestModal(this.app, async (url) => {
                const targetFile = this.app.metadataCache.getFirstLinkpathDest(url, '');
                if (!targetFile) {
                    this.selectionManager.applyUrlToSelection(url);
                    this.engine.requestFullRender();
                    this.engine.requestSave();
                    this.hide();
                    return;
                }

                let inkBlockCount = 0;
                try {
                    const cache = this.app.metadataCache.getFileCache(targetFile);
                    const content = await this.app.vault.cachedRead(targetFile);
                    const lines = content.split('\n');
                    if (cache && cache.sections) {
                        const codeSections = cache.sections.filter((sec: any) => sec.type === 'code');
                        for (const sec of codeSections) {
                            const startLine = sec.position.start.line;
                            const endLine = sec.position.end.line;
                            const blockLines = lines.slice(startLine, endLine + 1);
                            const firstLine = blockLines[0] || '';
                            if (firstLine.trim().startsWith('```ink')) {
                                inkBlockCount++;
                            }
                        }
                    }
                } catch (err) {
                    // ignore
                }

                if (inkBlockCount <= 1) {
                    this.selectionManager.applyUrlToSelection(url);
                    this.engine.requestFullRender();
                    this.engine.requestSave();
                    this.hide();
                } else {
                    const blockModal = new BlockSuggestModal(this.app, targetFile, (blockId) => {
                        const compiledUrl = `${url}#^${blockId}`;
                        this.selectionManager.applyUrlToSelection(compiledUrl);
                        this.engine.requestFullRender();
                        this.engine.requestSave();
                        this.hide();
                    });
                    blockModal.open();
                }
            });
            modal.open();
        } else {
            const url = window.prompt("Enter Obsidian Link (e.g., [[My Note]] or https://...)", initialUrl);
            if (url !== null) {
                this.selectionManager.applyUrlToSelection(url);
                this.engine.triggerSyncLink?.(url);
                this.engine.requestFullRender();
                this.engine.requestSave();
                this.hide();
            }
        }
    }
}
