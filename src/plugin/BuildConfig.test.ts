import { expect, test } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '..', '..');

// The shipped bundle once diverged from test behavior because esbuild received the
// entry via stdin and never discovered tsconfig.json, silently switching class
// fields to `define` semantics and wiping fields assigned during super() calls.
// These assertions pin both halves of the fix.
test('esbuild config passes tsconfig explicitly (stdin skips auto-discovery)', () => {
    const config = readFileSync(resolve(repoRoot, 'esbuild.config.mjs'), 'utf8');
    expect(config).toMatch(/tsconfig:/);
});

test('tsconfig pins useDefineForClassFields to false', () => {
    const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.useDefineForClassFields).toBe(false);
});
