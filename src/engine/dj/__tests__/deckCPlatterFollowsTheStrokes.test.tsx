/**
 * D1 (owner 2026-10-12: "activated deck 3 and saw no animated scratching"): Deck C's platter, crossfader and slip
 * follow the Auto Scratch strokes from the same render (three_deck.render's viz capture, dj_viz's 50 Hz sampling):
 *
 *   demo      render_gesture(collect_viz=True)'s record velocity, slip and fade = renderGesture's `viz`; strokes
 *             overwritten into a nominal-forward track, a needle opening the fader, the angle integrated: at each
 *             50 Hz tick the platter = the demo's cumsum within 1e-6 revolution at 33 1/3 rpm, the fader and slip lanes
 *             = the demo's (fixture tools/scratch-fixtures/gen_deck_c_motion.py)
 *   reach     a stroke fired through the registry (fireDjFx, the entry every Auto Scratch stroke takes) lands on the
 *             Deck C motion with the stroke's own render; Deck C's lanes view is the one consumer and moves with it
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, cleanup, act } from '@testing-library/react';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import fixture from '@/engine/dj/scratch/__tests__/fixtures/deck_c_motion.json';

const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/stores/useTransportStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useTransportStore']());
vi.mock('@/stores/useDJStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useDJStore']());
vi.mock('@/engine/dj/DJActions', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJActions']());
vi.mock('@/engine/dj/DJQuantizedFX', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJQuantizedFX']());
vi.mock('@/engine/dj/DJBeatJump', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJBeatJump']());
vi.mock('@/engine/dj/DJAutoSync', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJAutoSync']());
vi.mock('@/hooks/drumpad/useMIDIPadRouting', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/hooks/drumpad/useMIDIPadRouting']());
vi.mock('@engine/ToneEngine', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@engine/ToneEngine']());
vi.mock('@/engine/dj/DJEngine', () => {
  const deck = { id: 'A', setScratchVelocity() {}, playPattern() {}, stopPattern() {}, finishPatternCycle() {}, getEffectiveBPM: () => 92 };
  const engine = () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } });
  return { getDJEngine: engine, getDJEngineIfActive: engine };
});

interface FStroke { record: string | null; gesture: string; velocity?: number; seed: number; steps?: number; start: number; n: number; recordVel?: number[]; slipVel?: number[]; fade?: number[] }
const F = fixture as unknown as { rate: number; stepSec: number; n: number; strokes: FStroke[]; ticks: number[]; revolutions: number[]; fader: number[]; slip: number[] };

async function recordSource(id: string) {
  const { getScratchRecord } = await import('@/engine/dj/scratch/scratchCatalogue');
  const { demoRecordPcm } = await import('@/engine/dj/scratch/scratchGrit');
  const rec = getScratchRecord(id)!;
  const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file));
  return { sig: demoRecordPcm(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), anchor: rec.demoCue.anchor, safe: rec.demoCue.safe };
}

const maxDiff = (ours: ArrayLike<number>, ref: number[], keep: number) => ref.reduce((m, v, i) => Math.max(m, Math.abs(ours[i * keep]! - v)), 0);

describe('Deck C\'s platter, fader and slip follow the strokes (D1)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('demo: the strokes\' viz and the 50 Hz platter angle, fader and slip = three_deck + dj_viz', async () => {
    const { renderGesture, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const { needleLift } = await import('@/engine/turntable/turntableSim');
    const { DeckCMotion, angleToRevolutions } = await import('@/engine/dj/scratch/deckCMotion');
    const m = new DeckCMotion();
    for (const s of F.strokes) {
      if (!s.record) { m.addNeedle(s.start, needleLift(F.rate, s.seed).length); continue; }
      const r = renderGesture(await recordSource(s.record), s.gesture, s.steps! * F.stepSec, F.rate, { velocity: s.velocity, profile: DEMO_DECK_PROFILES.boombap, seed: s.seed });
      expect(r.viz.recordVel.length, s.gesture).toBe(s.n);
      expect(maxDiff(r.viz.recordVel, s.recordVel!, 7), `${s.gesture} record velocity`).toBeLessThan(1e-9);
      expect(maxDiff(r.viz.slipVel, s.slipVel!, 7), `${s.gesture} slip`).toBeLessThan(1e-9);
      expect(maxDiff(r.viz.fade, s.fade!, 7), `${s.gesture} fade`).toBeLessThan(1e-9);
      m.addStroke(s.start, r.viz);
    }
    F.ticks.forEach((t, k) => {
      const x = m.sampleAt(t);
      expect(Math.abs(angleToRevolutions(x.angle) - F.revolutions[k]!), `tick ${k}`).toBeLessThan(1e-6);
      expect(x.fade, `fader tick ${k}`).toBeCloseTo(F.fader[k]!, 9);
      expect(x.slip, `slip tick ${k}`).toBeCloseTo(F.slip[k]!, 9);
    });
  }, 120_000);

  it('reach: a registry stroke drives the Deck C motion from its own render; the Deck C lanes are its one consumer', async () => {
    const { fireDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { resetScratchVoicePool, getScratchVoicePool } = await import('@/engine/dj/scratch/scratchVoicePool');
    const { getDeckCMotion, resetDeckCMotion, deckCMotionStats, deckCMotionNow } = await import('@/engine/dj/scratch/deckCMotion');
    const { DeckCScratchLanes } = await import('@/components/dj/DeckCScratchLanes');
    const ctx = new OfflineAudioContext(1, 22050, 22050);
    holder.ctx = ctx;
    const samplerInput = ctx.createGain();
    samplerInput.connect(ctx.destination);
    holder.samplerInput = samplerInput;
    resetScratchVoicePool();
    resetDeckCMotion();
    const pool = getScratchVoicePool();
    const before = deckCMotionStats.strokes;
    expect(fireDjFx('fx_scratch_crab', { source: 'mcp', record: 'A_YEAH', bpm: 92, at: 0.1 })).toBe(true);
    await pool.settled();
    expect(deckCMotionStats.strokes - before).toBe(1);
    // the stroke's own record velocity drives the platter: at its middle the platter is off its nominal spin
    const start = Math.trunc(0.1 * 22050);
    const mid = getDeckCMotion().sampleAt(start + 2000);
    expect(mid.active).toBe(true);
    let moved = false;
    for (let s = start; s < start + 4000; s += 50) if (Math.abs(getDeckCMotion().sampleAt(s).recordVel - 1) > 0.2) moved = true;
    expect(moved).toBe(true);
    // the view: one consumer, its fader lane at the stroke's hand position at the clock's time
    const clock = { currentTime: 0.1 + 1500 / 22050 };
    holder.ctx = clock;
    const consumers = deckCMotionStats.consumers;
    const view = render(<DeckCScratchLanes />);
    expect(deckCMotionStats.consumers - consumers).toBe(1);
    const lanes: string[] = [];
    for (let k = 0; k < 6; k++) {
      clock.currentTime += 0.02;
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      lanes.push(view.getByTestId('deck-c-fader').style.left);
    }
    const want = deckCMotionNow(clock.currentTime)!;
    expect(view.getByTestId('deck-c-fader').style.left).toBe(`${(want.position * 100).toFixed(2)}%`);
    expect(new Set(lanes).size).toBeGreaterThan(1);
    cleanup();
    expect(deckCMotionStats.consumers).toBe(consumers);
  }, 120_000);
});
