/**
 * ADLIB-DRO-LOAD (2026-11-25): samurai.dro and dune1.dro gave "AdPlug could not load".
 *
 * Their header has no 4-byte version field after "DBRAWOPL" (8 id + 4 ms + 4 length
 * + 1 hardware byte + data = file size). CdroPlayer::load rejected every version
 * other than 0x10000. Loads every .dro in the song corpus through the real shipped
 * AdPlug WASM; fails on revert of the dro.cpp fallback.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface AdPlugModule {
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(p: number): void;
  _adplug_init(rate: number): number;
  _adplug_load(data: number, len: number, name: number): number;
  _adplug_get_type(): number;
  UTF8ToString(p: number): string;
}

const DRO_DIR = join(process.cwd(), 'public/data/songs/ad-lib/DOSBox/_unknown');

async function loadModule(): Promise<AdPlugModule> {
  const js = readFileSync(join(process.cwd(), 'public/adplug/AdPlugPlayer.js'), 'utf8');
  const factory = new Function(`${js}\nreturn createAdPlugPlayer;`)() as
    (opts: Record<string, unknown>) => Promise<AdPlugModule>;
  // Same shape as AdPlugPlayer.worklet.js: bytes handed in, no fetch.
  return factory({ wasmBinary: readFileSync(join(process.cwd(), 'public/adplug/AdPlugPlayer.wasm')) });
}

describe('AdPlug loads DOSBox Raw OPL files', () => {
  const files = readdirSync(DRO_DIR).filter((f) => f.toLowerCase().endsWith('.dro'));

  it('finds samurai.dro in the corpus', () => {
    expect(files).toContain('samurai.dro');
  });

  it.each(files)('%s loads', async (name) => {
    const m = await loadModule();
    m._adplug_init(44100);
    const data = readFileSync(join(DRO_DIR, name));
    const dp = m._malloc(data.length);
    m.HEAPU8.set(data, dp);
    const nameBytes = new TextEncoder().encode(`${name}\0`);
    const np = m._malloc(nameBytes.length);
    m.HEAPU8.set(nameBytes, np);
    expect(m._adplug_load(dp, data.length, np)).toBe(0);
    expect(m.UTF8ToString(m._adplug_get_type())).toMatch(/^DOSBox Raw OPL/);
  });
});
