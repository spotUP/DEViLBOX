/**
 * ADLIB-STALE-PATTERNS: the extractor's AdPlug WASM instance is shared across
 * songs. Capture/D00 state must not survive adplug_load, or song B reports
 * song A's pattern count. Load A then B; B must match B extracted alone.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { extractAdPlugPatterns, invalidateAdPlugModule } from '../AdPlugWasmExtractor';

const root = path.resolve(__dirname, '../../../../..');
const adlib = path.join(root, 'public/data/songs/Ad Lib');
const SONGS = {
  rad: path.join(adlib, 'Reality AdLib Tracker/Void (AU)/waterfall.rad'),
  a2m: path.join(adlib, 'AdLib Tracker 2/Kvee/the sweetest sin.a2m'),
  cmf: path.join(adlib, 'Creative Music File/Alexandr Chistyakov/circus - 10.cmf'),
};

function bytes(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function patternCount(p: string): Promise<number> {
  const song = await extractAdPlugPatterns(bytes(p), path.basename(p));
  return song ? song.patterns.length : -1;
}

describe('AdPlug extraction carries no state between songs', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url: string) => {
      const file = path.join(root, 'public', url.split('?')[0]);
      const type = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
      return new Response(readFileSync(file), { headers: { 'Content-Type': type } });
    });
  });
  afterAll(() => { invalidateAdPlugModule(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('a2m and cmf report their own pattern count after another song', async () => {
    const alone: Record<string, number> = {};
    for (const [k, p] of Object.entries(SONGS)) {
      invalidateAdPlugModule();
      alone[k] = await patternCount(p);
    }
    expect(alone.a2m).toBeGreaterThan(0);
    expect(alone.cmf).toBeGreaterThan(0);

    invalidateAdPlugModule();
    const seq: Array<[string, number]> = [];
    for (const k of ['rad', 'a2m', 'cmf', 'a2m', 'rad', 'cmf'] as const) {
      seq.push([k, await patternCount(SONGS[k])]);
    }
    expect(seq).toEqual(seq.map(([k]) => [k, alone[k]]));
  }, 60_000);
});
