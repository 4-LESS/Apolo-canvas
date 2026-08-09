import { InkPageView } from './InkPageView';
import type InkPlugin from './InkPlugin';
import { BackgroundType } from '../model/InkPage';
import { mapBackgroundType } from './Settings';

interface InkBlockConfig {
    id: string;
    type: 'handwriting';
    height: number;
    context?: string;
    previousBlockId?: string;
    background?: BackgroundType;
    gridSize?: number;
}

/**
 * Parses the YAML-like content of an ```ink code block.
 */
function parseBlockConfig(source: string): InkBlockConfig | null {
    const config: Record<string, string> = {};
    for (const line of source.split('\n')) {
        const match = line.match(/^(\w+):\s*"?([^"\n]*)"?\s*$/);
        if (match) {
            config[match[1].trim()] = match[2].trim();
        }
    }

    if (!config.id || !config.type) return null;

    return {
        id: config.id,
        type: 'handwriting',
        height: config.height ? parseInt(config.height, 10) : 600,
        context: config.context,
        previousBlockId: config.previous_block_id,
        background: config.background ? mapBackgroundType(config.background) : undefined,
        gridSize: config.gridSize ? parseInt(config.gridSize, 10) : undefined,
    };
}

/**
 * Register the ```ink code block processor with Obsidian.
 */
export function registerInkProcessor(plugin: InkPlugin): void {
    plugin.registerMarkdownCodeBlockProcessor(
        'ink',
        (source: string, el: HTMLElement, ctx) => {
            const config = parseBlockConfig(source);
            if (!config) {
                const errEl = el.createDiv({ cls: 'ink-error' });
                errEl.textContent = '⚠ Invalid ink block — missing required fields (id, type).';
                return;
            }

            const notePath = ctx.sourcePath;

            const view = new InkPageView(
                el,
                notePath,
                config.id,
                config.height,
                plugin.fileManager,
                plugin.settings,
                plugin.app,
                plugin,
                ctx,
                config.background,
                config.gridSize
            );

            ctx.addChild(view);
        }
    );
}
