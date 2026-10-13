/**
 * The Three Deck Showcase is the demo's three_deck render (ledger J1-J10, X8, D1, D3-D6; owner decision 2026-10-13):
 * `three_deck.render_from_params({})` - the hip-hop records juggled on A/B with the small room, the classic bank
 * on Deck C through its worklet chain, the level / duck / headroom / 0.94 normalisation - and dj_viz's 50 Hz
 * streams of the same render, against the demo's own output (tools/scratch-fixtures/gen_three_deck_showcase.py).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import fixture from './fixtures/three_deck_showcase.json';

vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => { throw new Error('no DJ engine in the showcase render'); }, getDJEngineIfActive: () => null }));

interface Sub { n: number; keep: number; x: number[]; ss: number }
const F = fixture as unknown as {
  rate: number; bpm: number; keep: number; small: Sub; smallProbe: { n: number; f: number; tau: number; click: [number, number] };
  juggle: Sub; mix: Sub; nTicks: number; streams: Record<string, number[]>;
  scratchEvents: Array<[number, number, string, string, number]>; deckActive: Array<[number, number, number]>;
};

function residualDb(ours: ArrayLike<number>, ref: Sub): number {
  expect(ours.length).toBe(ref.n);
  let e = 0, s = 0;
  ref.x.forEach((v, i) => { const d = ours[i * ref.keep]! - v; e += d * d; s += v * v; });
  return 10 * Math.log10(e / s + 1e-300);
}

const RECS = join(process.cwd(), 'public/data/samples/packs/juggle-records');
const juggleRecordBytes = async (f: string): Promise<ArrayBuffer> => { const b = readFileSync(join(RECS, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

describe('the Three Deck Showcase is the demo render', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('X8: sampler.reverb small_room = the demo', async () => {
    const { samplerReverb } = await import('../refDsp');
    const { n, f, tau, click } = F.smallProbe;
    const x = new Float64Array(n);
    for (let t = 0; t < n; t++) x[t] = Math.sin(2 * Math.PI * f * t / F.rate) * Math.exp(-t / tau);
    x[click[0]] = x[click[0]]! + click[1];
    expect(residualDb(samplerReverb(x, F.rate, 'small_room', 1.0), F.small)).toBeLessThan(-200);
  });

  it('J10 + X8: the A/B bus (two records a section, the small-room send) = the demo; the whole render nulls three_deck.render_from_params; the 17 dj_viz streams are the demo\'s bytes', async () => {
    const { renderThreeDeckShowcase, showcaseStats } = await import('../threeDeckShowcase');
    const { ScratchVoicePool } = await import('../scratchVoicePool');
    const ctx = new OfflineAudioContext(1, 128, F.rate);
    const pool = new ScratchVoicePool(ctx, ctx.destination);
    const before = showcaseStats.strokes;
    const r = await renderThreeDeckShowcase({ juggleRecordBytes, strokes: pool, offline: (n, rate) => new OfflineAudioContext(1, n, rate) });
    expect(showcaseStats.strokes - before).toBe(F.scratchEvents.length);
    expect(r.events.length).toBe(F.scratchEvents.length);
    expect(residualDb(r.juggle, F.juggle)).toBeLessThan(-120);
    const mixDb = residualDb(r.mix, F.mix);
    console.log(`[showcase] whole render residual ${mixDb.toFixed(1)} dB`);
    expect(mixDb).toBeLessThan(-100);
    expect(r.nTicks).toBe(F.nTicks);
    for (const [name, ref] of Object.entries(F.streams)) {
      const ours = Array.from(r.streams[name as keyof typeof r.streams]);
      const diff = ours.reduce((k, v, i) => k + (v !== ref[i] ? 1 : 0), 0);
      expect(diff, `${name}: ${diff} ticks differ`).toBe(0);
    }
  }, 300_000);
});
