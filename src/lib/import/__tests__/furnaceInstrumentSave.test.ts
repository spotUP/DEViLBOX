/**
 * Save as .fui / .dmp: an instrument edited in the store representation goes through the editor's INS2 encoder,
 * Furnace's own readInsData and putInsData2 / saveDMP (real fileops WASM) and the edit survives a reload.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installFurnaceFileOpsWasm, repoRoot } from './furnaceFileOpsWasmHarness';
import { instrumentsFromFileWasm } from '../wasm/FurnaceFileOps';
import { FurnaceParser } from '../formats/FurnaceParser';
import { furnaceInstrumentFile } from '@lib/export/furnaceInstrumentFiles';

const load = async (rel: string) => {
  const b = fs.readFileSync(path.join(repoRoot, 'src/lib/import/__tests__/fixtures/furnace-instruments', rel));
  const [ins] = await instrumentsFromFileWasm(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, path.basename(rel));
  return FurnaceParser.parse(ins.fui.slice().buffer);
};

describe('saving the edited Furnace instrument', () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('.fui carries the edit and reloads', async () => {
    const { config } = await load('distslap.tfi');
    const edited = { ...config, algorithm: (config.algorithm + 1) & 7, operators: config.operators.map((o, i) => (i === 0 ? { ...o, tl: (o.tl + 7) & 127 } : o)) };
    const file = await furnaceInstrumentFile('Edited Slap', edited);
    expect(file.name).toBe('Edited Slap');
    const [back] = await instrumentsFromFileWasm(file.fui.slice().buffer, 'x.fui');
    const parsed = FurnaceParser.parse(back.fui.slice().buffer);
    expect(parsed.name).toBe('Edited Slap');
    expect(parsed.config.algorithm).toBe(edited.algorithm);
    expect(parsed.config.operators[0].tl).toBe(edited.operators[0].tl);
    expect(parsed.config.operators[1].tl).toBe(config.operators[1].tl);
  });

  it('.dmp carries the edit and reloads', async () => {
    const { config } = await load('distslap.tfi');
    const edited = { ...config, operators: config.operators.map((o, i) => (i === 2 ? { ...o, tl: (o.tl + 5) & 127 } : o)) };
    const file = await furnaceInstrumentFile('Edited Slap', edited);
    expect(file.dmp).not.toBeNull();
    const [back] = await instrumentsFromFileWasm(file.dmp!.slice().buffer, 'x.dmp');
    const parsed = FurnaceParser.parse(back.fui.slice().buffer);
    expect(parsed.config.operators[2].tl).toBe(edited.operators[2].tl);
  });
});
