import { InkEngine } from '../../../engine/InkEngine';
import { BasePopover } from '../BasePopover';
import { parseColor, serializeColor, hexToHsv, hsvToHex, hexToRgb } from '../colorUtils';
import type { Toolbar } from '../../Toolbar';
import { ColorSwatchComponent } from '../components/ColorSwatchComponent';

type ColorValueFormat = 'HEX' | 'RGB' | 'HSL';
const COLOR_VALUE_FORMATS: ColorValueFormat[] = ['HEX', 'RGB', 'HSL'];

export class ColorPickerPopover extends BasePopover {
    public activeTriggerEl: HTMLElement | null = null;
    public activeEngine: InkEngine | null = null;
    public miniSwatch: ColorSwatchComponent | null = null;
    public recentSwatch: ColorSwatchComponent | null = null;

    constructor(parent: HTMLElement, plugin: any, private toolbar: Toolbar, dismissBoundary?: HTMLElement) {
        super(parent, plugin, 'ink-color-picker-popover', dismissBoundary);
        this.ensureBuilt();
    }

    protected buildContent(): void {
        // Dynamic per selected slot.
    }

    public close(): void {
        this.hide();
    }

    public drawColorMatrix(canvas: HTMLCanvasElement, hue: number): void {
        if (typeof canvas.getContext !== 'function') return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Base color horizontal gradient
        const baseColor = `hsl(${hue}, 100%, 50%)`;
        const gradH = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradH.addColorStop(0, '#FFFFFF');
        gradH.addColorStop(1, baseColor);
        ctx.fillStyle = gradH;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Black vertical gradient
        const gradV = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradV.addColorStop(0, 'rgba(0,0,0,0)');
        gradV.addColorStop(1, '#000000');
        ctx.fillStyle = gradV;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    public showColorPicker(triggerEl: HTMLElement, slotIdx: number, engine: InkEngine): void {
        this.activeTriggerEl = triggerEl;
        this.activeEngine = engine;
        this.toolbar.activePickerSlotIdx = slotIdx;
        const toolName = engine.getToolName();
        const toolType: 'pen' | 'highlighter' | 'shape' = toolName === 'highlighter' ? 'highlighter' : (toolName === 'shape' ? 'shape' : 'pen');
        const isHighlighter = toolType === 'highlighter';
        const { palette } = this.toolbar.getPaletteData(toolType);
        const currentColor = palette.colors[slotIdx] ?? (isHighlighter ? '#ffff0080' : '#000000');
        const { rgb, alpha } = parseColor(currentColor);

        const { h, s, v } = hexToHsv(rgb);
        let currentH = h;
        let currentS = s;
        let currentV = v;
        let activeValueFormat: ColorValueFormat = 'HEX';

        // Sanitation: Destroy previous swatch components to unbind swipe/event listeners
        if (this.miniSwatch) {
            this.miniSwatch.destroy();
            this.miniSwatch = null;
        }
        if (this.recentSwatch) {
            this.recentSwatch.destroy();
            this.recentSwatch = null;
        }

        this.el.empty();

        // Segment 1: Embedded Gradient Color Picker
        const header1 = this.el.createDiv({ cls: 'ink-popover-header' });
        header1.textContent = 'COLOR';
        
        const colorMatrixRow = this.el.createDiv({ cls: 'ink-popover-row color-matrix-row' });
        const canvas = colorMatrixRow.createEl('canvas', {
            cls: 'ink-popover-color-matrix',
            attr: { width: '180', height: '120' }
        }) as HTMLCanvasElement;
        canvas.width = 180;
        canvas.height = 120;

        const hueSliderRow = this.el.createDiv({ cls: 'ink-popover-row hue-slider-row' });
        const hueSlider = hueSliderRow.createEl('input', {
            cls: 'ink-popover-hue-slider',
            attr: { type: 'range', min: '0', max: '360', step: '1', value: String(currentH) }
        }) as HTMLInputElement;
        hueSlider.value = String(currentH);

        const valueRow = this.el.createDiv({ cls: 'ink-popover-row color-value-row' });
        const valueFields = valueRow.createDiv({ cls: 'ink-popover-value-fields' });
        const valueInputs = [0, 1, 2].map((idx) => valueFields.createEl('input', {
            cls: 'ink-popover-sub-input',
            attr: {
                type: 'text',
                spellcheck: 'false',
                'aria-label': `Color value ${idx + 1}`
            }
        }) as HTMLInputElement);
        const formatToggleBtn = valueRow.createEl('button', {
            cls: 'ink-format-toggle-btn',
            text: activeValueFormat,
            attr: { type: 'button', 'aria-label': 'Cycle color value format' }
        }) as HTMLButtonElement;

        this.drawColorMatrix(canvas, currentH);

        // Segment 2: Translucent Opacity Controls
        const header2 = this.el.createDiv({ cls: 'ink-popover-header' });
        header2.textContent = 'OPACITY';
        const opacityRow = this.el.createDiv({ cls: 'ink-popover-row opacity-row' });
        const opacitySlider = opacityRow.createEl('input', {
            cls: 'ink-popover-opacity-slider',
            attr: { type: 'range', min: '0', max: '100', step: '1', value: String(alpha) }
        }) as HTMLInputElement;
        opacitySlider.value = String(alpha);
        const opacityVal = opacityRow.createSpan({ cls: 'ink-popover-size-val', text: `${alpha}%` });

        const updateValueFields = () => {
            const rgbPart = hsvToHex(currentH, currentS, currentV);
            renderColorValueInputs(valueInputs, rgbPart, activeValueFormat);
        };

        const syncFromValueInputs = () => {
            const visibleInputs = valueInputs.filter((input) => input.style.display !== 'none');
            if (visibleInputs.some((input) => input.value.trim() === '')) return;
            const nextRgb = readColorValueInputs(valueInputs, activeValueFormat, hsvToHex(currentH, currentS, currentV));
            const hsv = hexToHsv(nextRgb);
            currentH = hsv.h;
            currentS = hsv.s;
            currentV = hsv.v;
            hueSlider.value = String(currentH);
            this.drawColorMatrix(canvas, currentH);
            updateColorFromInputs(false);
        };

        valueInputs.forEach((input) => {
            input.addEventListener('focus', () => input.select?.());
            input.addEventListener('click', () => input.select?.());
            input.addEventListener('input', syncFromValueInputs);
            input.addEventListener('blur', updateValueFields);
        });

        formatToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nextIdx = (COLOR_VALUE_FORMATS.indexOf(activeValueFormat) + 1) % COLOR_VALUE_FORMATS.length;
            activeValueFormat = COLOR_VALUE_FORMATS[nextIdx];
            formatToggleBtn.textContent = activeValueFormat;
            updateValueFields();
        });
        updateValueFields();

        // Divider
        this.el.createEl('hr');

        // Segment 3: Swatch Palette Manager
        const header3 = this.el.createDiv({ cls: 'ink-popover-header' });
        header3.textContent = 'SWATCH PALETTE';
        const miniSwatch = new ColorSwatchComponent(this.el, {
            orientation: 'horizontal',
            toolType: toolType,
            isStatic: false,
            onSlotClick: (idx) => {
                focusSlot(idx);
            }
        }, this.toolbar);
        miniSwatch.containerEl.classList.add('is-mini');
        this.miniSwatch = miniSwatch;

        const buttonBar = this.el.createDiv({ cls: 'ink-swatch-settings-bar' });
        const gearBtn = buttonBar.createEl('button', {
            cls: 'ink-swatch-settings-gear',
            attr: { type: 'button', 'aria-label': 'Settings' }
        }) as HTMLButtonElement;
        gearBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> <span>Manage Swatches</span>`;

        // Divider
        this.el.createEl('hr');

        // Segment 4: History Tracker
        const header4 = this.el.createDiv({ cls: 'ink-popover-header' });
        header4.textContent = 'RECENTLY USED';
        const recentSwatch = new ColorSwatchComponent(this.el, {
            orientation: 'horizontal',
            toolType: toolType,
            isStatic: true,
            onSlotClick: (idx, colorValue) => {
                const activeSlotIdx = this.toolbar.activePickerSlotIdx ?? 0;
                palette.colors[activeSlotIdx] = colorValue;

                const settings = this.plugin?.settings;
                if (settings) {
                    if (toolType === 'highlighter') {
                        settings.lastHighlighterColorHex = colorValue;
                    } else if (toolType === 'shape') {
                        settings.lastShapeColorHex = colorValue;
                    } else {
                        settings.lastPenColorHex = colorValue;
                    }
                }

                // Canvas Firewall: strictly set future brush parameters, DO NOT redraw/requestRender
                engine.setPenColor(colorValue);

                const parsed = parseColor(colorValue);
                const hsv = hexToHsv(parsed.rgb);
                currentH = hsv.h;
                currentS = hsv.s;
                currentV = hsv.v;
                this.drawColorMatrix(canvas, currentH);
                hueSlider.value = String(currentH);
                opacitySlider.value = String(parsed.alpha);
                opacityVal.textContent = `${parsed.alpha}%`;
                updateValueFields();

                ColorSwatchComponent.refreshAll(toolType);
                this.toolbar.syncColorSlots(toolType);
                this.toolbar.queueSettingsSave();
            }
        }, this.toolbar);
        recentSwatch.containerEl.classList.add('is-mini');
        this.recentSwatch = recentSwatch;

        const updateSelectedSlotHighlight = (idx: number) => {
            miniSwatch.slotBtns.forEach((btn, sIdx) => {
                if (sIdx === idx) {
                    btn.classList.add('is-selected');
                } else {
                    btn.classList.remove('is-selected');
                }
            });
        };
        updateSelectedSlotHighlight(slotIdx);

        const focusSlot = (idx: number) => {
            this.toolbar.activePickerSlotIdx = idx;
            const currentColorVal = palette.colors[idx] ?? (isHighlighter ? '#ffff0080' : '#000000');
            const settings = this.plugin?.settings;
            if (settings) {
                if (toolType === 'highlighter') {
                    settings.activeHighlighterColorIndex = idx;
                    settings.lastHighlighterColorHex = currentColorVal;
                } else if (toolType === 'shape') {
                    settings.activeShapeColorIndex = idx;
                    settings.lastShapeColorHex = currentColorVal;
                } else {
                    settings.activePenColorIndex = idx;
                    settings.lastPenColorHex = currentColorVal;
                }
            }
            engine.setPenColor(currentColorVal);
            const parsed = parseColor(currentColorVal);
            const hsv = hexToHsv(parsed.rgb);
            currentH = hsv.h;
            currentS = hsv.s;
            currentV = hsv.v;
            this.drawColorMatrix(canvas, currentH);
            hueSlider.value = String(currentH);
            opacitySlider.value = String(parsed.alpha);
            opacityVal.textContent = `${parsed.alpha}%`;
            updateValueFields();
            updateSelectedSlotHighlight(idx);

            // Refresh both swatches to display accurate state / highlights
            miniSwatch.refresh();
            recentSwatch.refresh();
            this.toolbar.syncColorSlots(toolType);
            this.toolbar.queueSettingsSave();
        };

        const updateColorFromInputs = (refreshFields = true) => {
            const rgbPart = hsvToHex(currentH, currentS, currentV);
            const alphaPart = Number(opacitySlider.value);
            const newColor = serializeColor(rgbPart, alphaPart, isHighlighter);

            const activeSlotIdx = this.toolbar.activePickerSlotIdx ?? 0;
            palette.colors[activeSlotIdx] = newColor;

            const settings = this.plugin?.settings;
            if (settings) {
                if (toolType === 'highlighter') {
                    settings.lastHighlighterColorHex = newColor;
                } else if (toolType === 'shape') {
                    settings.lastShapeColorHex = newColor;
                } else {
                    settings.lastPenColorHex = newColor;
                }
            }

            // Canvas Firewall: Strictly set future brush configuration parameters, DO NOT redraw/requestRender
            engine.setPenColor(newColor);
            if (refreshFields) updateValueFields();

            miniSwatch.refresh();
            recentSwatch.refresh();
            this.toolbar.syncColorSlots(toolType);
            this.toolbar.queueSettingsSave();
        };

        const handlePointer = (e: PointerEvent) => {
            const rect = typeof canvas.getBoundingClientRect === 'function'
                ? canvas.getBoundingClientRect()
                : { left: 0, top: 0, width: 180, height: 120 };

            const clientX = e.clientX;
            const clientY = e.clientY;

            let offsetX = e.offsetX !== undefined ? e.offsetX : (clientX !== undefined ? clientX - rect.left : 90);
            let offsetY = e.offsetY !== undefined ? e.offsetY : (clientY !== undefined ? clientY - rect.top : 60);

            offsetX = Math.min(rect.width, Math.max(0, offsetX));
            offsetY = Math.min(rect.height, Math.max(0, offsetY));

            currentS = offsetX / rect.width;
            currentV = 1 - (offsetY / rect.height);

            updateColorFromInputs();
        };

        let isDragging = false;

        const onPointerMove = (e: PointerEvent) => {
            if (!isDragging) return;
            handlePointer(e);
        };

        const onPointerUp = () => {
            if (isDragging) {
                isDragging = false;
                if (typeof window !== 'undefined') {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                }
            }
        };

        canvas.addEventListener('pointerdown', (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            isDragging = true;
            handlePointer(e);

            if (typeof window !== 'undefined') {
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
            }
        });

        hueSlider.addEventListener('input', () => {
            currentH = Number(hueSlider.value);
            this.drawColorMatrix(canvas, currentH);
            updateColorFromInputs();
        });

        opacitySlider.addEventListener('input', () => {
            opacityVal.textContent = `${opacitySlider.value}%`;
            updateColorFromInputs();
        });

        gearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.close();
            this.toolbar.openSwatchManager(this.activeTriggerEl as HTMLButtonElement);
        });

        this.show(triggerEl);
    }

    protected onOutsidePointerDown(): void {
        this.toolbar.resetColorSlotClickCycle();
    }

    public hide(): void {
        if (this.miniSwatch) {
            this.miniSwatch.destroy();
            this.miniSwatch = null;
        }
        if (this.recentSwatch) {
            this.recentSwatch.destroy();
            this.recentSwatch = null;
        }
        super.hide();
    }
}

function renderColorValueInputs(inputs: HTMLInputElement[], rgbHex: string, format: ColorValueFormat): void {
    inputs.forEach((input, idx) => {
        input.style.display = format === 'HEX' && idx > 0 ? 'none' : '';
        if (format === 'HEX' && idx === 0) {
            input.classList.add('is-wide');
        } else {
            input.classList.remove('is-wide');
        }
    });

    if (format === 'HEX') {
        inputs[0].value = rgbHex.replace('#', '').substring(0, 6).toUpperCase();
        inputs[1].value = '';
        inputs[2].value = '';
        return;
    }

    const rgb = hexToRgb(rgbHex);
    if (format === 'RGB') {
        inputs[0].value = String(rgb.r);
        inputs[1].value = String(rgb.g);
        inputs[2].value = String(rgb.b);
        return;
    }

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    inputs[0].value = padThreeDigits(hsl.h);
    inputs[1].value = padThreeDigits(hsl.s);
    inputs[2].value = padThreeDigits(hsl.l);
}

function readColorValueInputs(inputs: HTMLInputElement[], format: ColorValueFormat, fallbackRgbHex: string): string {
    if (format === 'HEX') {
        const clean = inputs[0].value.trim().replace(/^#/, '').replace(/[^0-9a-fA-F]/g, '');
        if (/^[0-9a-fA-F]{3}$/.test(clean)) {
            return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
        }
        if (/^[0-9a-fA-F]{6}$/.test(clean)) {
            return `#${clean}`.toUpperCase();
        }
        return fallbackRgbHex;
    }

    if (format === 'RGB') {
        const values = inputs.map((input) => clamp(parseNumericInput(input.value), 0, 255));
        return rgbChannelsToHex(values[0], values[1], values[2]);
    }

    const h = clamp(parseNumericInput(inputs[0].value), 0, 360);
    const s = clamp(parseNumericInput(inputs[1].value), 0, 100);
    const l = clamp(parseNumericInput(inputs[2].value), 0, 100);
    return rgbChannelsToHex(...hslToRgb(h, s, l));
}

function rgbChannelsToHex(r: number, g: number, b: number): string {
    const toHex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (delta !== 0) {
        s = delta / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case nr:
                h = 60 * (((ng - nb) / delta) % 6);
                break;
            case ng:
                h = 60 * (((nb - nr) / delta) + 2);
                break;
            case nb:
                h = 60 * (((nr - ng) / delta) + 4);
                break;
        }
    }

    if (h < 0) h += 360;
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const hue = ((h % 360) + 360) % 360;
    const sat = clamp(s, 0, 100) / 100;
    const light = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light - c / 2;

    let r = 0, g = 0, b = 0;
    if (hue < 60) {
        r = c; g = x; b = 0;
    } else if (hue < 120) {
        r = x; g = c; b = 0;
    } else if (hue < 180) {
        r = 0; g = c; b = x;
    } else if (hue < 240) {
        r = 0; g = x; b = c;
    } else if (hue < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

function parseNumericInput(value: string): number {
    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function padThreeDigits(value: number): string {
    return String(Math.round(value)).padStart(3, '0');
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
