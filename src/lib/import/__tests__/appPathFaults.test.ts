/**
 * Two app-path faults the owner heard in the browser while headless UADE
 * played the same files (2026-10-05):
 *  1. StarTrekker AM `.mod` + `.mod.nt` opened as a plain TS-engine MOD: silent.
 *  2. MusicMaker `moveback.sdata` reached UADE as `sdata.moveback`: refused.
 *     (MusicMaker songs now play on MusicMakerEngine; the native route is
 *     tested in src/engine/__tests__/musicMakerPlays.test.ts. The name
 *     mapping stays for any `sdata.<tune>` that still falls to UADE.)
 * Both are decided by the name/companions the app hands over; the render half
 * uses the exact name the app's route gives UADE plus the resolver's companions.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCompanions } from '../companionResolver';
import { uadePlayerHint } from '../uadePlayerHint';
import { loadUADEModule, readMeta, renderToSamples, addCompanions } from '../../../../tools/uade-audit/uadeRenderCore';

const calls: Array<{ name: string; companions: string[] }> = [];
vi.mock('@lib/import/formats/UADEParser', () => ({
  parseUADEFile: vi.fn(async (_b: ArrayBuffer, name: string, _m: string, _s: number, _p: unknown, comps?: Map<string, ArrayBuffer>) => {
    calls.push({ name, companions: [...(comps?.keys() ?? [])] });
    return { __uade: true };
  }),
}));

const ROOT = process.cwd();
const AM_DIR = join(ROOT, 'public/data/songs/startrekker-am');

function companionMap(dir: string, module: string): Map<string, ArrayBuffer> {
  const r = resolveCompanions(module, { siblings: readdirSync(dir) });
  const m = new Map<string, ArrayBuffer>();
  for (const c of r.companions) {
    const b = readFileSync(join(dir, r.sources[c] ?? c));
    m.set(c, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  }
  return m;
}
const fileOf = (dir: string, name: string) => new File([new Uint8Array(readFileSync(join(dir, name)))], name);

function rms(s: Float32Array): number {
  let t = 0; for (let i = 0; i < s.length; i++) t += s[i] * s[i];
  return Math.sqrt(t / s.length);
}

async function render(dir: string, module: string, companions: Map<string, ArrayBuffer>, name: string) {
  const data = new Uint8Array(readFileSync(join(dir, module)));
  const mod = await loadUADEModule(false);
  expect(mod._uade_wasm_init(44100)).toBe(0);
  try {
    addCompanions(mod, [...companions].map(([n, b]) => ({ name: n, data: new Uint8Array(b) })));
    const r = await renderToSamples(mod, data, name, { sampleRate: 44100, seconds: 4 });
    return { rms: rms(r.samples), player: readMeta(mod).player };
  } finally { try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } }
}

// The route graph loads lazily and the cold import is slow; pay it once.
beforeAll(async () => { await import('../parseModuleToSong'); await import('../parsers/AmigaFormatParsers'); }, 240_000);
beforeEach(() => { calls.length = 0; });

describe('StarTrekker AM .mod + .mod.nt', () => {
  it('parseModuleToSong sends the pair to UADE with the .nt registered', async () => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const comps = companionMap(AM_DIR, 'amsyntdemo.mod');
    expect([...comps.keys()]).toContain('amsyntdemo.mod.nt');
    await parseModuleToSong(fileOf(AM_DIR, 'amsyntdemo.mod'), 0, undefined, undefined, comps);
    expect(calls).toEqual([{ name: 'amsyntdemo.mod', companions: ['amsyntdemo.mod.nt'] }]);
  }, 60_000);

  it('a plain .mod without the .nt is not claimed by the rule', async () => {
    const { modHasStarTrekkerNt } = await import('../adscRoute');
    expect(modHasStarTrekkerNt('plain.mod', [])).toBe(false);
    expect(modHasStarTrekkerNt('plain.mod', ['other.mod.nt'])).toBe(false);
    expect(modHasStarTrekkerNt('plain.xm', ['plain.xm.nt'])).toBe(false);
    expect(modHasStarTrekkerNt('amsyntdemo.mod', ['amsyntdemo.mod.nt'])).toBe(true);
  });

  it('UADE renders the pair as StarTrekker AM with audio', async () => {
    const comps = companionMap(AM_DIR, 'amsyntdemo.mod');
    const r = await render(AM_DIR, 'amsyntdemo.mod', comps, 'amsyntdemo.mod');
    expect(r.player).toMatch(/Startrekker|AudioSculpture|Audio Sculpture/i);
    expect(r.rms).toBeGreaterThan(0.05);
  }, 60_000);
});

describe('MusicMaker sdata prefix name', () => {
  it('uadePlayerHint maps the prefix form to the name UADE plays; other names are untouched', () => {
    expect(uadePlayerHint('moveback.sdata')).toBe('moveback.sdata');
    expect(uadePlayerHint('dir/sdata.tune')).toBe('dir/tune.sdata');
    expect(uadePlayerHint('mm4.tune')).toBe('mm4.tune');
  });
});
