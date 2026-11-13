// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportToVGM } from '../VGMExporter';
import { ym2610RomBlocks } from '../dispatchRegCapture';
import { FurnaceChipType } from '../../../engine/chips/FurnaceChipEngine';

const DIR = resolve(__dirname, '../../../../public/furnace-dispatch');
const YM2610 = 57;

/** Load the shipped dispatch WASM, give a YM2610 one 16-bit sample on ADPCM-A and one on ADPCM-B, return its ROMs. */
async function renderRoms() {
  const jsCode = readFileSync(resolve(DIR, 'FurnaceDispatch.js'), 'utf8');
  const wasmBinary = readFileSync(resolve(DIR, 'FurnaceDispatch.wasm'));
  const factory = new Function('require', '__dirname', '__filename', `${jsCode}; return createFurnaceDispatch;`)(
    require, DIR, resolve(DIR, 'FurnaceDispatch.js'));
  // The module does not export its heap; take the memory from instantiate (as tools/furnace-audit does).
  let mem: WebAssembly.Memory | null = null;
  const orig = WebAssembly.instantiate;
  (WebAssembly as any).instantiate = async (...a: any[]) => {
    const r = await (orig as any)(...a);
    mem = (r.instance ?? r).exports.memory;
    return r;
  };
  let m: any;
  try { m = await factory({ wasmBinary, print: () => {}, printErr: () => {} }); } finally { (WebAssembly as any).instantiate = orig; }
  const heap = () => new Uint8Array(mem!.buffer);
  m._furnace_init(44100);
  const h = m._furnace_dispatch_create(YM2610, 44100);
  const n = 2000;
  const buf = new Uint8Array(32 + n * 2);
  const v = new DataView(buf.buffer);
  v.setUint32(0, n, true);
  buf[12] = 16; // 16-bit PCM
  v.setUint32(16, 8363, true);
  for (let i = 0; i < n; i++) v.setInt16(32 + i * 2, Math.round(Math.sin(i / 7) * 12000), true);
  const ptr = m._malloc(buf.length);
  heap().set(buf, ptr);
  m._furnace_dispatch_set_sample(h, 0, ptr, buf.length);
  m._furnace_dispatch_render_samples(h);
  const roms = [0, 1].map(index => {
    const usage = m._furnace_dispatch_sample_mem(h, index, 0);
    const p = m._furnace_dispatch_sample_mem(h, index, 2);
    return { index, capacity: m._furnace_dispatch_sample_mem(h, index, 1), bytes: heap().slice(p, p + usage) };
  });
  return roms;
}

describe('YM2610 VGM export without the sample ROM', () => {
  it('writes the ADPCM-A and ADPCM-B ROM as 0x67 data blocks before the first command, as Furnace does', async () => {
    const roms = await renderRoms();
    expect(roms[0].bytes.length).toBeGreaterThan(0);
    expect(roms[1].bytes.length).toBeGreaterThan(0);
    const blocks = ym2610RomBlocks(roms);
    const vgm = exportToVGM(
      [{ timestamp: 0, chipType: FurnaceChipType.OPNB, port: 0x100, data: 0x01 }],
      { dataBlocks: blocks });
    const view = new DataView(vgm.buffer);
    expect(view.getUint32(0x08, true)).toBeGreaterThanOrEqual(0x151);
    let o = 0x100;
    for (const [i, type] of [0x82, 0x83].entries()) {
      expect(Array.from(vgm.slice(o, o + 3))).toEqual([0x67, 0x66, type]);
      expect(view.getUint32(o + 3, true)).toBe(roms[i].bytes.length + 8);
      expect(view.getUint32(o + 7, true)).toBe(roms[i].capacity);
      expect(view.getUint32(o + 11, true)).toBe(0);
      expect(Array.from(vgm.slice(o + 15, o + 15 + 16))).toEqual(Array.from(roms[i].bytes.slice(0, 16)));
      o += 15 + roms[i].bytes.length;
    }
    expect(Array.from(vgm.slice(o, o + 3))).toEqual([0x59, 0x00, 0x01]); // first command follows the blocks
    expect(view.getUint32(0x04, true) + 4).toBe(vgm.length - 0); // EOF offset still the file end
  });
});
