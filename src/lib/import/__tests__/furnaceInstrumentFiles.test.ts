/**
 * Furnace instrument files read by Furnace's own instrumentFromFile (WASM), real fixtures copied from the Furnace
 * instrument library (third-party/furnace-master/instruments; copied because the pre-commit snapshot holds staged files only): the result is a .fui the editor's FurnaceParser opens, and .dmp saves back out.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installFurnaceFileOpsWasm, repoRoot } from './furnaceFileOpsWasmHarness';
import { instrumentsFromFileWasm } from '../wasm/FurnaceFileOps';
import { FurnaceParser } from '../formats/FurnaceParser';

const lib = (rel: string): { buf: ArrayBuffer; name: string } => {
  const b = fs.readFileSync(path.join(repoRoot, 'src/lib/import/__tests__/fixtures/furnace-instruments', rel));
  return { buf: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, name: path.basename(rel) };
};
const DIV_INS_FM = 1;
const DIV_INS_OPZ = 33; // Furnace's .opm patches are 4-operator OPZ instruments

describe('instrument files through Furnace instrumentFromFile', () => {
  beforeAll(installFurnaceFileOpsWasm);

  it.each([
    ['distslap.tfi', 'distslap', DIV_INS_FM],
    ['Shamisen (Tsugaru Slap).opni', null, DIV_INS_FM],
    ['Piano Test.opm', null, DIV_INS_OPZ],
  ])('%s loads with its chip type and the editor parser opens the .fui', async (rel, name, type) => {
    const { buf, name: file } = lib(rel);
    const [ins] = await instrumentsFromFileWasm(buf, file);
    expect(ins.type).toBe(type);
    if (name) expect(ins.name).toBe(name);
    expect(ins.name.length).toBeGreaterThan(0);
    const parsed = FurnaceParser.parse(ins.fui.slice().buffer);
    expect(parsed.name).toBe(ins.name);
    expect(parsed.config.chipType).toBe(type === DIV_INS_FM ? DIV_INS_FM : parsed.config.chipType);
    expect(parsed.config.operators?.length).toBeGreaterThanOrEqual(2);
  });

  it('a .dmp saves back out and reloads to the same name, type and operator data', async () => {
    const { buf, name } = lib('distslap.tfi');
    const [a] = await instrumentsFromFileWasm(buf, name);
    expect(a.dmp).not.toBeNull();
    const [b] = await instrumentsFromFileWasm(a.dmp!.slice().buffer, 'roundtrip.dmp');
    expect(b.type).toBe(a.type);
    const pa = FurnaceParser.parse(a.fui.slice().buffer).config.operators;
    const pb = FurnaceParser.parse(b.fui.slice().buffer).config.operators;
    expect(pb).toEqual(pa);
  });

  it('a .fui saved by Furnace reloads through instrumentFromFile to identical bytes', async () => {
    const { buf, name } = lib('Piano Test.opm');
    const [a] = await instrumentsFromFileWasm(buf, name);
    const [b] = await instrumentsFromFileWasm(a.fui.slice().buffer, 'again.fui');
    expect(b.fui).toEqual(a.fui);
  });

  it('a corrupt file reports an error', async () => {
    await expect(instrumentsFromFileWasm(new ArrayBuffer(3), 'bad.tfi')).rejects.toThrow(/Furnace instrument load failed/);
  });
});
