/**
 * The A/B render pair for the owner's ear (SCR-PHRASING-PARITY): the 32-bar feature the Auto DJ plays at a
 * set's PEAK in PERFORMER - the demo's three-deck routine - rendered by DEViLBOX over the corpus 'drops'
 * track, through the controller (`DJScratchDJ.tick`), the real `ScratchExecutor`, the one action path
 * (`fireDjFx`) and the real voice pool, worklets and bus, offline. It writes the track, this render and
 * the plan the demo side needs; `tools/scratch-fixtures/render_demo_three_deck.py` renders the demo's Deck C
 * from the same plan over the same track.
 *
 * Off by default (a render, not a check): SCRATCH_AB_RENDER=1 VITEST_MAX_WORKERS=2 npx vitest run \
 *   src/engine/dj/__tests__/scratchParityRenderAB.test.ts
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const OUT = join(process.cwd(), 'thoughts', 'spot', 'renders', 'scratch-parity');
const TRACK_GAIN = 0.72; // the demo's mix: 0.72 x the beat
const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown, programme: null as null | ((n: number) => Float32Array) }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/stores/useTransportStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useTransportStore']());
vi.mock('@/stores/useDJStore', () => ({ useDJStore: { getState: () => ({ crossfaderPosition: 0, decks: { A: { effectiveBPM: 130, pitchOffset: 0 }, B: { effectiveBPM: 130, pitchOffset: 0 } } }) } }));
vi.mock('@/engine/dj/DJActions', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJActions']());
vi.mock('@/engine/dj/DJQuantizedFX', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJQuantizedFX']());
vi.mock('@/engine/dj/DJBeatJump', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJBeatJump']());
vi.mock('@/engine/dj/DJAutoSync', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJAutoSync']());
vi.mock('@/hooks/drumpad/useMIDIPadRouting', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/hooks/drumpad/useMIDIPadRouting']());
vi.mock('@engine/ToneEngine', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@engine/ToneEngine']());
/** Deck A plays the track: the scratch level follows its programme meter. */
const deck = { waveformAnalyser: { getValue: () => holder.programme?.(256) ?? new Float32Array(256) }, getEffectiveBPM: () => 130 };
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
  getDJEngineIfActive: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
}));

function wav16(channels: Float32Array[], rate: number): Buffer {
  const n = channels[0]!.length, ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  let peak = 1e-9;
  for (const c of channels) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]!));
  const g = peak > 0.98 ? 0.98 / peak : 1;
  for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[k]![i]! * g)) * 32767), 44 + (i * ch + k) * 2);
  return buf;
}

describe.skipIf(process.env.SCRATCH_AB_RENDER !== '1')('the A/B render pair (SCR-PHRASING-PARITY)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('DEViLBOX plays the three-deck routine at the PEAK over the drops track; the plan and the track go to the demo side', async () => {
    const { corpusTrack, corpusAnalysis } = await import('../autodj/testing/corpus');
    const { DJScratchDJ } = await import('../scratch/DJScratchDJ');
    const { ScratchExecutor } = await import('../scratch/ScratchExecutor');
    const { fireDjFx, releaseDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { getScratchVoicePool, resetScratchVoicePool } = await import('../scratch/scratchVoicePool');
    const { fractionalBeatAt, timeAtBeat, barStartBeat } = await import('../autodj/beatGrid');
    type Perf = import('../autodj/types').DJPerformanceContext;

    const track = corpusTrack('drops');
    const analysis = corpusAnalysis('drops');
    const drop = analysis.sections.find((s) => s.kind === 'drop');
    expect(drop, `sections: ${analysis.sections.map((s) => s.kind).join(', ')}`).toBeDefined();
    const fromBar = drop!.startBar;
    const barT = (b: number) => timeAtBeat(analysis.beatGrid, barStartBeat(analysis.downbeats, b));
    const t0 = barT(fromBar - 1);
    const t1 = Math.min(track.pcm.length / track.sampleRate, barT(fromBar + 32) + 2);
    const len = Math.round((t1 - t0) * SR);

    const ctx = new OfflineAudioContext(2, len, SR);
    holder.ctx = ctx;
    const samplerInput = ctx.createGain();
    samplerInput.connect(ctx.destination);
    holder.samplerInput = samplerInput;
    // the track, from one bar before the drop, at the demo's beat gain
    const buf = ctx.createBuffer(1, Math.round((t1 - t0) * track.sampleRate), track.sampleRate);
    buf.copyToChannel(new Float32Array(track.pcm.subarray(Math.round(t0 * track.sampleRate), Math.round(t1 * track.sampleRate))), 0);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = TRACK_GAIN;
    src.connect(g).connect(ctx.destination); src.start(0);
    holder.programme = (n) => {
      const at = Math.round((t0 + ctx.currentTime) * track.sampleRate);
      return Float32Array.from({ length: n }, (_, i) => TRACK_GAIN * (track.pcm[at + i] ?? 0));
    };
    resetScratchVoicePool();
    await getScratchVoicePool().ready;

    const intervals: Array<() => void> = [];
    const timers = {
      now: () => ctx.currentTime * 1000,
      setInterval: (fn: () => void) => { intervals.push(fn); return fn; },
      clearInterval: (h: unknown) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
      setTimeout: () => null, clearTimeout: () => undefined,
    };
    const pos = () => t0 + ctx.currentTime;
    const seed = 11;
    let plannedSeed: number | null = null;
    const ctrl = new DJScratchDJ({
      seed,
      executorFor: (_d, t) => new ScratchExecutor({
        clock: { beatNow: () => fractionalBeatAt(t.beatGrid, pos()), beatSec: () => 60 / t.bpm }, contextTime: () => ctx.currentTime,
        fire: (id, o) => fireDjFx(id, o), release: (id, o) => releaseDjFx(id, o),
        probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => undefined },
        recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
        timers, tickMs: 5, lookaheadSec: 0.1,
      }),
      onPlan: (p) => { if (p.routine === 'threeDeck') plannedSeed = seed + fromBar; },
    });
    const perf = (): Perf => ({ currentDeck: 'A', currentTrack: analysis, incomingTrack: null, currentPosition: pos(), setPhase: 'PEAK', setEnergy: 0.9, targetEnergy: 0.95, creativeRisk: 0.6 } as unknown as Perf);
    // the poll: every 10 ms of the render the controller ticks and the executor's interval runs
    const step = 0.01;
    for (let t = step; t < (t1 - t0) - 0.05; t += step) {
      void ctx.suspend(Math.round(t * SR) / SR).then(() => {
        ctrl.tick({ perf: perf(), deck: 'A', mode: 'PERFORMER', style: 'boomBap', profile: 'boomBap', scratchPermission: 2 });
        for (const fn of [...intervals]) fn();
        return ctx.resume();
      });
    }
    const { scratchVoiceStats } = await import('../scratch/ScratchRecordVoice');
    const strokes = scratchVoiceStats.strokes;
    const out = await ctx.startRendering();
    expect(plannedSeed).not.toBeNull();
    console.log(`[A/B] strokes ${scratchVoiceStats.strokes - strokes}, refused ${scratchVoiceStats.refused}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'devilbox_three_deck_drops.wav'), wav16([out.getChannelData(0), out.getChannelData(1)], SR));
    // the same span of the track, and the plan the demo side renders from
    writeFileSync(join(OUT, 'track_drops.wav'), wav16([track.pcm.subarray(Math.round(t0 * track.sampleRate), Math.round(t1 * track.sampleRate))], track.sampleRate));
    const downbeats = Array.from({ length: 34 }, (_, k) => barT(fromBar - 1 + k) - t0);
    writeFileSync(join(OUT, 'plan.json'), JSON.stringify({ seed: plannedSeed, bpm: analysis.bpm, routineStartBar: 1, downbeatsSec: downbeats, trackGain: TRACK_GAIN }, null, 1));
  }, 600_000);
});
