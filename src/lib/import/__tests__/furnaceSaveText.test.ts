import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, repoRoot } from './furnaceFileOpsWasmHarness';
import { loadFurFileWasm, saveFurTextWasm } from '../wasm/FurnaceFileOps';

describe('Furnace song text export through the fileops WASM', () => {
  beforeAll(async () => { await installFurnaceFileOpsWasm(); });

  it('writes Furnace saveText output for a loaded .fur', async () => {
    const b = readFileSync(join(repoRoot, 'src/lib/import/__tests__/fixtures/furnace-text/sawmen_break_SM8521.fur'));
    await loadFurFileWasm(new Uint8Array(b).buffer);
    const text = await saveFurTextWasm();
    expect(text.startsWith('# Furnace Text Export')).toBe(true);
    expect(text).toContain('# Song Information');
    expect(text).toContain('# Patterns');
  });
});
