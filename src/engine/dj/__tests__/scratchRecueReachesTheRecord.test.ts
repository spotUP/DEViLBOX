/**
 * SCR-P3.R3 reachability (owner scratch plan sections 18, 60, 91): four
 * stabs planned as `ScratchEvent`s run through the REAL executor, the real
 * registry (`fireDjFx('fx_scratch_forwardStab', {source: 'autodj', record})`),
 * pool, voice, worklet and scratch bus on the offline context. Each stab is
 * re-cued: the voice's cue sentinel counts 4, the ring drops the needle on
 * the same frame every time, the executor's restore runs once per release
 * (4), and the bus carries > -40 dBFS inside every stab's open window.
 * (The ledger names record COUNT; the record is ONE, a COUNT record whose
 * reference gestures list forward_stab - see SCR-P2.R2.)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const holder = vi.hoisted(() => ({ ctx: null as unknown, deck: null as unknown, samplerInput: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => holder.deck, mixer: { samplerInput: holder.samplerInput } }),
  getDJEngineIfActive: () => ({ getDeck: () => holder.deck, mixer: { samplerInput: holder.samplerInput } }),
}));

function fakeDeck() {
  return {
    id: 'A' as const, velocityCalls: 0,
    setScratchVelocity() { this.velocityCalls++; }, playPattern() {}, stopPattern() {}, finishPatternCycle() {},
    getEffectiveBPM: () => 125,
  };
}

describe('four planned stabs re-cue the record through the executor and the registry (SCR-P3.R3)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('cue x4 on one frame, restore x4, bus > -40 dBFS in each open window, deck untouched', async () => {
    const LENGTH_SEC = 1.3;
    const ctx = new OfflineAudioContext(2, Math.round(SR * LENGTH_SEC), SR);
    holder.ctx = ctx;
    const samplerInput = ctx.createGain();
    samplerInput.connect(ctx.destination);
    holder.samplerInput = samplerInput;
    const deck = fakeDeck();
    holder.deck = deck;

    const { fireDjFx, releaseDjFx, djFxFireCounts, clearDjFxFireLog } = await import('@/engine/drumpad/DjFxActions');
    const { getScratchVoicePool, resetScratchVoicePool } = await import('../scratch/scratchVoicePool');
    const { scratchVoiceStats } = await import('../scratch/ScratchRecordVoice');
    const { scratchRingStats } = await import('../DeckScratchBuffer');
    const { ScratchExecutor, scratchExecutorStats } = await import('../scratch/ScratchExecutor');
    const { getScratchRecord } = await import('../scratch/scratchCatalogue');
    const { getGesture } = await import('../scratch/scratchGestureCatalog');
    const { cycleMs } = await import('../scratch/scratchFaderModel');
    resetScratchVoicePool();
    clearDjFxFireLog();
    Object.assign(scratchVoiceStats, { strokes: 0, cues: 0 });
    Object.assign(scratchExecutorStats, { started: 0, released: 0, restores: 0 });
    scratchRingStats.loads = 0; scratchRingStats.seekFrames.length = 0;

    // a manual 120 BPM clock; the executor runs on it, the audio on the offline context
    let sec = 0;
    const intervals: Array<() => void> = [];
    const snapshot = { rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 };
    let captures = 0, restoresSeen = 0;
    const executor = new ScratchExecutor({
      clock: { beatNow: () => sec / 0.5, beatSec: () => 0.5 },
      contextTime: () => sec,
      fire: (id, o) => fireDjFx(id, o),
      release: (id, o) => releaseDjFx(id, o),
      probe: { capture: () => { captures++; return { ...snapshot }; }, restore: () => { restoresSeen++; } },
      timers: {
        now: () => sec * 1000,
        setInterval: (fn) => { intervals.push(fn); return fn; },
        clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
        setTimeout: () => null, clearTimeout: () => undefined,
      },
      tickMs: 5, lookaheadSec: 0.1,
    });
    const advance = (to: number) => { while (sec < to - 1e-9) { sec = Math.min(to, sec + 0.005); for (const f of [...intervals]) f(); } };

    const record = getScratchRecord('ONE')!;
    const starts = [0.15, 0.45, 0.75, 1.05]; // seconds = beats 0.3, 0.9, 1.5, 2.1 at 120 BPM
    const source = { type: 'CRATE' as const, recordId: 'ONE', anchor: record.anchor };
    for (const t of starts) {
      executor.schedule({
        executeAtBeat: t / 0.5, durationBeats: 0.4, role: 'ACCENT', source, anchor: record.anchor,
        gesture: 'forwardStab', velocity: 0.8, humanizeMs: 0, intensity: 0.5, returnToAnchor: true,
      });
    }
    // drive the clock a stab at a time, letting the record load and the gesture start between steps
    for (const t of starts) {
      advance(t - 0.09);
      await getScratchVoicePool().settled();
      advance(t + 0.25);
    }
    await getScratchVoicePool().settled();

    expect(djFxFireCounts.fx_scratch_forwardStab).toBe(4);
    expect(scratchExecutorStats.started).toBe(4);
    expect(scratchVoiceStats.cues, 'ScratchRecordVoice.cue sentinel').toBe(4);
    expect(scratchVoiceStats.strokes).toBe(4);
    expect(scratchRingStats.loads).toBe(1);
    const vowelFrames = Math.round(3300 / 22050 * SR);
    const drops = scratchRingStats.seekFrames.filter((f) => Math.abs(f - vowelFrames) <= 1);
    expect(drops.length, `needle drops at ${vowelFrames} +-1 (got ${scratchRingStats.seekFrames.join(',')})`).toBeGreaterThanOrEqual(4);
    expect(new Set(drops).size, 'identical positionFrames on every stab').toBe(1);
    expect(captures).toBe(4);
    expect(restoresSeen, 'restore once per release').toBe(4);
    expect(scratchExecutorStats.restores).toBe(4);
    expect(scratchExecutorStats.released).toBe(4);

    const out = (await ctx.startRendering()).getChannelData(0);
    const stab = getGesture('forwardStab');
    const cycleSec = cycleMs(stab, 125) / 1000;
    const open = stab.faderWindows[0]!.open;
    for (const t of starts) {
      const from = Math.round((t + open[0] * cycleSec + 0.005) * SR);
      const to = Math.round((t + Math.min(open[1] * cycleSec, 0.2) - 0.005) * SR);
      let sq = 0;
      for (let i = from; i < to; i++) sq += out[i]! * out[i]!;
      const rmsDb = 20 * Math.log10(Math.sqrt(sq / (to - from)));
      expect(rmsDb, `scratch bus in the open window of the stab at ${t} s`).toBeGreaterThan(-40);
    }
    expect(deck.velocityCalls, 'deck A setScratchVelocity').toBe(0);
  }, 300_000);
});
