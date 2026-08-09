import { expect, test, vi } from 'vitest';

vi.mock('obsidian', () => ({
    App: class {},
    Modal: class {},
    Notice: class {},
    PluginSettingTab: class {},
    Setting: class {},
    setIcon: vi.fn()
}));

import { restoreProfilesFromSettings } from './InkEngine';

test('restores valid persisted profile ids', () => {
    const result = restoreProfilesFromSettings({
        activePenProfileId: 'pen-ballpoint',
        activeHighlighterProfileId: 'highlighter-square'
    });
    expect(result.pen?.id).toBe('pen-ballpoint');
    expect(result.highlighter?.id).toBe('highlighter-square');
});

test('returns nothing for unset ids (engine keeps its defaults)', () => {
    const result = restoreProfilesFromSettings({
        activePenProfileId: null,
        activeHighlighterProfileId: null
    });
    expect(result.pen).toBeUndefined();
    expect(result.highlighter).toBeUndefined();
});

test('ignores unknown ids and tool-type mismatches', () => {
    const result = restoreProfilesFromSettings({
        activePenProfileId: 'highlighter-round', // wrong tool type for the pen slot
        activeHighlighterProfileId: 'no-such-profile'
    });
    expect(result.pen).toBeUndefined();
    expect(result.highlighter).toBeUndefined();
});
