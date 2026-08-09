/**
 * Shared popover control builders. Every popover assembles its rows from these
 * so slider/toggle/header markup and classes stay identical everywhere.
 */

export interface SliderRowOptions {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    /** Formats the value label; defaults to `${value}px`. */
    format?: (value: number) => string;
    /** Fired on input/change with the parsed numeric value. */
    onInput?: (value: number, event?: Event) => void;
    /** Extra class for the input element (e.g. 'ink-smoothness-slider'). */
    sliderClass?: string;
}

export interface SliderRowHandle {
    row: HTMLDivElement;
    slider: HTMLInputElement;
    valueSpan: HTMLSpanElement;
    /** Sync slider + label from code without firing onInput. */
    setValue(value: number): void;
}

export function buildSliderRow(parent: HTMLElement, opts: SliderRowOptions): SliderRowHandle {
    const format = opts.format ?? ((v: number) => `${v}px`);

    const row = parent.createDiv({ cls: 'ink-slider-row' }) as HTMLDivElement;
    const headerRow = row.createDiv({ cls: 'ink-style-header-row' });
    headerRow.createDiv({ cls: 'ink-popover-header', text: opts.label });

    const inputRow = row.createDiv({ cls: 'ink-slider-input-row' });
    const slider = inputRow.createEl('input', {
        cls: opts.sliderClass ?? 'ink-thickness-slider',
        attr: {
            type: 'range',
            min: String(opts.min),
            max: String(opts.max),
            step: String(opts.step),
            value: String(opts.value)
        }
    }) as HTMLInputElement;
    const valueSpan = inputRow.createSpan({ cls: 'ink-popover-size-val', text: format(opts.value) }) as HTMLSpanElement;

    const handleInput = (e?: Event) => {
        e?.stopPropagation?.();
        const source = (e?.target as HTMLInputElement) || slider;
        const val = Number(source?.value);
        if (isNaN(val)) return;
        slider.value = String(val);
        valueSpan.textContent = format(val);
        opts.onInput?.(val, e);
    };
    slider.addEventListener('input', handleInput);
    slider.addEventListener('change', handleInput);
    slider.addEventListener('pointerdown', (e) => e.stopPropagation());

    return {
        row,
        slider,
        valueSpan,
        setValue(value: number) {
            slider.value = String(value);
            valueSpan.textContent = format(value);
        }
    };
}

export interface ToggleRowOptions {
    label: string;
    /** Optional DOM id, wired to the label's `for` attribute. */
    id?: string;
    onChange?: (checked: boolean) => void;
}

export interface ToggleRowHandle {
    row: HTMLDivElement;
    checkbox: HTMLInputElement;
    /** Sync the checkbox from code without firing onChange. */
    setChecked(checked: boolean): void;
}

export function buildToggleRow(parent: HTMLElement, opts: ToggleRowOptions): ToggleRowHandle {
    const row = parent.createDiv({ cls: 'option-switch-row' }) as HTMLDivElement;
    row.createEl('label', { text: opts.label, attr: opts.id ? { for: opts.id } : undefined });
    const checkbox = row.createEl('input', {
        cls: 'ink-option-checkbox',
        attr: { type: 'checkbox', ...(opts.id ? { id: opts.id } : {}) }
    }) as HTMLInputElement;
    checkbox.addEventListener('change', () => opts.onChange?.(checkbox.checked));

    return {
        row,
        checkbox,
        setChecked(checked: boolean) {
            checkbox.checked = checked;
        }
    };
}

export function buildSectionHeader(parent: HTMLElement, text: string): HTMLDivElement {
    return parent.createDiv({ cls: 'ink-popover-header', text }) as HTMLDivElement;
}
