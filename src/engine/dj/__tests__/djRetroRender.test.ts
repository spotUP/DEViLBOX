/**
 * DJR-retro: a retro platform song renders on the engine the tracker view plays it with, and the deck gets one
 * scope and one stem per voice where that engine can give a voice alone.
 *
 * Before: the render worker threw "Retro platform formats not yet supported in DJ renderer" for every retro file.
 * PT3 -> aylet (Bulba player in the .ay wrapper, one lock-step solo instance per AY channel); KSS -> game-music-emu;
 * SC68 -> sc68 (mix only: Sc68.wasm has no per-voice tap).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { servePublicToFetch } from '@/test/audio/realWebAudio';
import { exposeNodeGlobalsForEmscripten } from '@/test/wasm/webBundle';
import { pt3EditModule, type CreatePt3Edit } from '@/engine/pt3/pt3EditWasm';
import { renderWithRetro } from '@/workers/dj-render/retroRender';

const ROOT = resolve(__dirname, '../../../..');
const SECONDS = 12;
const song = (dir: string, name: string) => {
  const b = readFileSync(resolve(ROOT, 'public/data/songs', dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('a retro platform song renders for the DJ deck', () => {
  beforeAll(async () => {
    servePublicToFetch();
    exposeNodeGlobalsForEmscripten();
    // The worker loads Pt3Edit.js from BASE_URL; node primes the shared module from public/pt3 instead.
    const create: CreatePt3Edit = async () => (await import('../../../../public/pt3/Pt3Edit.js')).default({ locateFile: (f: string) => resolve(ROOT, 'public/pt3', f) });
    await pt3EditModule(create);
  });

  it.each([
    ['pt3', 'D-Juice_-_Plaintive__1999_.pt3'],
    ['kss', 'gradius 2.kss'],
  ])('%s/%s: one scope and one stem per voice, voices carry signal', async (dir, name) => {
    const r = await renderWithRetro(song(dir, name), name, 0, () => {}, SECONDS, true);
    expect(r.left.length).toBeGreaterThan(r.sampleRate * 5);
    expect(peak(r.left)).toBeGreaterThan(0.01);
    const scopes = r.channelScopes!;
    expect(scopes.channels.length).toBeGreaterThanOrEqual(2);
    expect(r.monoStems!.length).toBe(scopes.channels.length);
    expect(scopes.scales.filter((p) => p > 0.01).length).toBeGreaterThanOrEqual(2);
    // int16 stems: a voice peak above 0.01 full scale
    expect(r.monoStems!.filter((s) => s.mono.reduce((m, v) => Math.max(m, Math.abs(v)), 0) > 327).length).toBeGreaterThanOrEqual(2);
  });

  it('sc68: the mix renders on sc68', async () => {
    const name = 'aprentice title.sc68';
    const r = await renderWithRetro(song('sc68', name), name, 0, () => {}, SECONDS, true);
    expect(r.sampleRate).toBe(48000);
    expect(peak(r.left)).toBeGreaterThan(0.01);
  });

  it('a retro format with no engine wired says so by name', async () => {
    await expect(renderWithRetro(new ArrayBuffer(16), 'tune.rmt', 0, () => {}, SECONDS, true)).rejects.toThrow(/\.rmt .*not yet rendered/);
  });
});
