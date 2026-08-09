import { Notice } from 'obsidian';
import { InkEngine } from '../../engine/InkEngine';
import { PenProfileRegistry } from '../../model/PenProfileRegistry';
import type { ApoloCanvasSettings, PencilCaseProfile, SavedToolConfig } from '../../plugin/Settings';
import type { Toolbar } from '../Toolbar';
import { parseColor, serializeColor } from './colorUtils';

/**
 * Single home for pencil-case preset logic: capturing the engine's current tool
 * configuration, matching it against saved presets, toggling favourites, and
 * applying a preset back onto the engine. Previously duplicated across
 * PencilCaseBar and both stroke-tool options popovers.
 */

export type StrokeToolType = 'pen' | 'highlighter';

export interface CapturedToolConfig {
    profileId: string;
    strokeWidth: number;
    smoothingLevel: number;
    strokePattern: SavedToolConfig['strokePattern'];
    color: string;
}

/** Simple normalized string comparison — presets store colors verbatim. */
function colorEquals(a: string, b: string): boolean {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function captureToolConfig(
    engine: InkEngine,
    toolType: StrokeToolType,
    fallbackProfileId = ''
): CapturedToolConfig {
    const profileId = (engine as any).activeProfileId || fallbackProfileId;
    const strokeWidth = engine.getToolSize(toolType) ?? (toolType === 'pen' ? 4 : 16);
    const smoothingLevel = toolType === 'pen'
        ? (engine.getPenSmoothing?.() ?? 0.3)
        : (engine.getHighlighterSmoothing?.() ?? 0.55);
    const strokePattern = engine.currentPattern ?? 'solid';
    const rawColor = (engine as any).toolContext?.currentColor ?? (toolType === 'pen' ? '#000000' : '#ffff0080');
    const parsed = parseColor(rawColor);
    const color = serializeColor(parsed.rgb, parsed.alpha, toolType === 'highlighter');
    return { profileId, strokeWidth, smoothingLevel, strokePattern, color };
}

export function getActiveCaseProfile(settings?: Partial<ApoloCanvasSettings>): PencilCaseProfile | undefined {
    return settings?.pencilCaseProfiles?.find((p) => p.id === settings.activePencilCaseProfileId);
}

/** Index of the saved preset matching the given configuration, or -1. */
export function findMatchingConfigIndex(
    caseProfile: PencilCaseProfile,
    toolType: StrokeToolType,
    config: Pick<CapturedToolConfig, 'profileId' | 'strokeWidth' | 'color'>
): number {
    return caseProfile.configs.findIndex((c) =>
        c.toolType === toolType &&
        c.profileId === config.profileId &&
        Math.abs(c.strokeWidth - config.strokeWidth) < 0.5 &&
        colorEquals(c.color, config.color)
    );
}

/** True when the engine's current tool configuration is saved as a preset. */
export function configMatchesEngine(
    settings: Partial<ApoloCanvasSettings> | undefined,
    engine: InkEngine,
    toolType: StrokeToolType,
    fallbackProfileId: string
): boolean {
    const caseProfile = getActiveCaseProfile(settings);
    if (!caseProfile) return false;
    const captured = captureToolConfig(engine, toolType, fallbackProfileId);
    return findMatchingConfigIndex(caseProfile, toolType, captured) !== -1;
}

export type FavoriteToggleResult = 'added' | 'removed' | 'full' | 'no-case';

/**
 * Star-button behavior: removes the current configuration from the active case
 * if already saved, otherwise adds it (up to 6 presets). Shows the user Notice
 * and persists settings.
 */
export function toggleFavorite(
    plugin: { settings?: Partial<ApoloCanvasSettings>; saveSettings?: () => Promise<void>; settingTab?: { display(): void } },
    engine: InkEngine,
    toolType: StrokeToolType,
    fallbackProfileId: string
): FavoriteToggleResult {
    const caseProfile = getActiveCaseProfile(plugin.settings);
    if (!caseProfile) return 'no-case';

    const captured = captureToolConfig(engine, toolType, fallbackProfileId);
    const existingIdx = findMatchingConfigIndex(caseProfile, toolType, captured);

    let result: FavoriteToggleResult;
    if (existingIdx !== -1) {
        caseProfile.configs.splice(existingIdx, 1);
        new Notice(`Removed ${toolType} preset from Pencil Case.`);
        result = 'removed';
    } else {
        if (caseProfile.configs.length >= 6) {
            new Notice('Pencil Case is full (maximum 6 presets).');
            return 'full';
        }
        const registryProfile = PenProfileRegistry.get(captured.profileId);
        const defaultName = registryProfile?.name || (toolType === 'pen' ? 'Pen' : 'Highlighter');
        caseProfile.configs.push({
            id: `preset-${Date.now()}`,
            name: `${defaultName} (${captured.strokeWidth}px)`,
            toolType,
            ...captured
        });
        new Notice(`Saved ${toolType} preset to Pencil Case!`);
        result = 'added';
    }

    void plugin.saveSettings?.();
    if (plugin.settingTab) plugin.settingTab.display();
    return result;
}

/**
 * Canonical preset applier: puts a saved configuration back onto the focused
 * engine (tool, size, smoothing, pattern, profile, color + palette slot sync).
 */
export function applyToolConfig(toolbar: Toolbar, plugin: any, config: SavedToolConfig): void {
    const engine = toolbar.focusedEngineRef.get();
    if (!engine) return;

    engine.setTool(config.toolType);
    engine.setToolSize(config.toolType, config.strokeWidth);

    if (config.toolType === 'pen') {
        engine.setPenSmoothing?.(config.smoothingLevel);
    } else {
        engine.setHighlighterSmoothing?.(config.smoothingLevel);
    }

    engine.currentPattern = config.strokePattern;
    engine.activeProfileId = config.profileId;

    const toolType = config.toolType;
    const { palette } = toolbar.getPaletteData(toolType);
    let colorIndex = palette.colors.findIndex(
        (c: string) => c.toLowerCase() === config.color.toLowerCase()
    );

    if (colorIndex === -1) {
        const activeIdx = toolType === 'highlighter'
            ? (plugin.settings.activeHighlighterColorIndex ?? 0)
            : (plugin.settings.activePenColorIndex ?? 0);
        palette.colors[activeIdx] = config.color;
        colorIndex = activeIdx;
    }

    if (toolType === 'highlighter') {
        plugin.settings.activeHighlighterColorIndex = colorIndex;
        plugin.settings.lastHighlighterColorHex = config.color;
    } else {
        plugin.settings.activePenColorIndex = colorIndex;
        plugin.settings.lastPenColorHex = config.color;
    }

    engine.setPenColor(config.color);
    engine.requestFullRender();
    plugin.saveSettings();
    toolbar.syncToolState();
}
