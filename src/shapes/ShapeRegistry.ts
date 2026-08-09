import { ShapeDefinition } from './ShapeDefinition';

export class ShapeRegistry {
  private static readonly definitions = new Map<string, ShapeDefinition>();

  static register(def: ShapeDefinition): void {
    if (this.definitions.has(def.id)) {
      console.warn(`[ShapeRegistry] '${def.id}' already registered. Skipping.`);
      return;
    }
    this.definitions.set(def.id, def);
  }

  static get(id: string): ShapeDefinition | undefined {
    return this.definitions.get(id);
  }

  /** All definitions in insertion order — used to build the shape picker. */
  static getAll(): ShapeDefinition[] {
    return Array.from(this.definitions.values());
  }
}
