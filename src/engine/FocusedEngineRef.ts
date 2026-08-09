import { InkEngine } from './InkEngine';

/**
 * Tracks the currently focused InkEngine instance in a view-independent way.
 */
export class FocusedEngineRef {
    private current: InkEngine | null = null;
    private listener: ((engine: InkEngine | null) => void) | null = null;

    set(engine: InkEngine | null): void {
        if (this.current !== engine) {
            console.log(`[FocusedEngineRef] Focus changed. Old: ${this.current ? 'EngineInstance' : 'null'}, New: ${engine ? 'EngineInstance' : 'null'}`);
            this.current = engine;
            this.listener?.(engine);
        }
    }

    get(): InkEngine | null {
        return this.current;
    }

    onChange(cb: (engine: InkEngine | null) => void): void {
        this.listener = cb;
    }
}
