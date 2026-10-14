/**
 * The A/B render pair for the owner's ear (SCR-PHRASING-PARITY): the 32-bar feature the Auto DJ plays at a
 * set's PEAK in PERFORMER - the demo's three-deck routine - rendered by DEViLBOX over the corpus 'drops'
 * track, through the controller (`DJScratchDJ.tick`), the real `ScratchExecutor`, the one action path
 * (`fireDjFx`) and the real pool, worklet and Deck C bus, offline. It writes the track, this render and
 * the plan the demo side needs; `tools/scratch-fixtures/render_demo_three_deck.py` renders the demo's Deck C
 * from the same plan over the same track.
 *
 * The render is off by default (a render, not a check): SCRATCH_AB_RENDER=1 VITEST_MAX_WORKERS=2 npx vitest run \
 *   src/engine/dj/__tests__/scratchParityRenderAB.test.ts
 *
 * The check that runs in test:ci: every stroke the executor hands the voice is HEARD. The owner heard
 * "like 5 % of the moves the demo has" in the first pair - a stroke's stop is scheduled ahead on the voice,
 * the next stroke on that voice starts at that stop, and the old stop silenced it in the worklet.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR_DEFAULT = 48000;
const OUT = join(process.cwd(), 'thoughts', 'spot', 'renders', 'scratch-parity');
const TRACK_GAIN = 0.72; // the demo's mix: 0.72 x the beat
const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));

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
/** Deck A plays the track (its level is the routine's shape, read from the track's audio). */
const deck = { getEffectiveBPM: () => 130 };
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

interface Fired { at: number; beats: number; gesture: string; record?: string }

/** The three-deck routine at the PEAK over the drops track, offline, from one bar before the drop for `bars` bars. */
/** `layers`: channel 0 = the scratch bus's output (mono), channel 1 silent. */
async function renderRoutine(opts: { bars: number; withTrack: boolean; layers?: boolean; rate?: number }) {
  const SR = opts.rate ?? SR_DEFAULT;
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
  const t1 = Math.min(track.pcm.length / track.sampleRate, barT(fromBar - 1 + opts.bars) + 2);
  const len = Math.round((t1 - t0) * SR);

  const ctx = new OfflineAudioContext(2, len, SR);
  holder.ctx = ctx;
  const samplerInput = ctx.createGain();
  const merger = opts.layers ? ctx.createChannelMerger(2) : null;
  if (merger) { samplerInput.connect(merger, 0, 0); merger.connect(ctx.destination); } else samplerInput.connect(ctx.destination);
  holder.samplerInput = samplerInput;
  if (opts.withTrack) {
    // the track, from one bar before the drop, at the demo's beat gain
    const buf = ctx.createBuffer(1, Math.round((t1 - t0) * track.sampleRate), track.sampleRate);
    buf.copyToChannel(new Float32Array(track.pcm.subarray(Math.round(t0 * track.sampleRate), Math.round(t1 * track.sampleRate))), 0);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = TRACK_GAIN;
    src.connect(g).connect(ctx.destination); src.start(0);
  }
  resetScratchVoicePool();

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
  const fired: Fired[] = [];
  const shaped: Array<Promise<unknown>> = [];
  const ctrl = new DJScratchDJ({
    seed,
    executorFor: (_d, t) => new ScratchExecutor({
      clock: { beatNow: () => fractionalBeatAt(t.beatGrid, pos()), beatSec: () => 60 / t.bpm }, contextTime: () => ctx.currentTime,
      fire: (id, o) => {
        const ok = fireDjFx(id, o);
        if (ok && o.at !== undefined) fired.push({ at: o.at, beats: o.beats ?? 0, gesture: id.replace('fx_scratch_', ''), record: o.record });
        return ok;
      },
      release: (id, o) => releaseDjFx(id, o),
      probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => undefined },
      recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
      timers, tickMs: 5, lookaheadSec: 0.1,
    }),
    onPlan: (p) => { if (p.routine === 'threeDeck') plannedSeed = seed + fromBar; },
    // as the Auto DJ wires it: the routine's records are read before their first stroke
    prepareRecords: (ids) => getScratchVoicePool().prepareRecords(ids),
    // as the Auto DJ wires it: three_deck's level and duck against the deck's audio (here the track, deck A)
    shapeRoutine: (shape) => { shaped.push(getScratchVoicePool().shapeRoutinePlan(shape, [{ audio: { sampleRate: track.sampleRate, numberOfChannels: 1, length: track.pcm.length, getChannelData: () => track.pcm as Float32Array<ArrayBuffer> }, trackFromSec: shape.trackFromSec, gain: 1 }])); },
  });
  const perf = (): Perf => ({ currentDeck: 'A', currentTrack: analysis, incomingTrack: null, currentPosition: pos(), setPhase: 'PEAK', setEnergy: 0.9, targetEnergy: 0.95, creativeRisk: 0.6 } as unknown as Perf);
  // the poll: every 10 ms of the render the controller ticks and the executor's interval runs
  const step = 0.01;
  for (let t = step; t < (t1 - t0) - 0.05; t += step) {
    void ctx.suspend(Math.round(t * SR) / SR).then(() => {
      ctrl.tick({ perf: perf(), deck: 'A', mode: 'PERFORMER', style: 'boomBap', profile: 'boomBap', scratchPermission: 2, render: 'three_deck' });
      for (const fn of [...intervals]) fn();
      // the routine's shape (an offline render of the planned layer) lands before the render goes on: live it
      // has the bar of lookahead the plan is made in
      return Promise.all(shaped).then(() => ctx.resume());
    });
  }
  const out = await ctx.startRendering();
  expect(plannedSeed).not.toBeNull();
  return { out, fired, track, analysis, t0, t1, plannedSeed: plannedSeed!, barT, fromBar };
}

/** RMS of both channels over [from, to) seconds. */
function rmsAt(out: AudioBuffer, from: number, to: number): number {
  const a = Math.max(0, Math.round(from * out.sampleRate)), b = Math.min(out.length, Math.round(to * out.sampleRate));
  let s = 0;
  for (let c = 0; c < out.numberOfChannels; c++) { const x = out.getChannelData(c); for (let i = a; i < b; i++) s += x[i]! * x[i]!; }
  return Math.sqrt(s / Math.max(1, (b - a) * out.numberOfChannels));
}

describe('the A/B routine: every stroke the executor plays is heard (SCR-PHRASING-PARITY)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('eight bars of the three-deck routine: at least 90 % of the strokes handed to the voice are heard in their own window', async () => {
    const { deckCStats } = await import('../scratch/scratchDeckC');
    const before = deckCStats.strokes;
    // eight routine bars: the routine plays half-time over the 130 BPM drops track (scratchTempoFold), 16 of its bars
    const r = await renderRoutine({ bars: 17, withTrack: false });
    // every stroke the executor fired is the demo's render on the routine's Deck C bus (SCR-NULL-TEST)
    expect(deckCStats.strokes - before, 'strokes summed on the Deck C bus').toBe(r.fired.length);
    const strokes = r.fired.filter((f) => f.gesture !== 'needleDrop' && f.gesture !== 'needleLift' && f.at < r.out.duration - 0.3);
    expect(strokes.length, 'the routine fired its strokes').toBeGreaterThan(40);
    // a stroke is heard when its own first 60 ms (the attack of the move, before the next one can start)
    // carries the scratch at -40 dBFS or more - a stroke silenced by a stale stop sits at the room tail's level
    const levels = strokes.map((f) => rmsAt(r.out, f.at + 0.005, f.at + 0.065));
    const heard = levels.filter((l) => l > 0.01).length;
    expect(heard / strokes.length, `heard ${heard} of ${strokes.length}; levels ${levels.map((l) => l.toFixed(3)).join(' ')}`).toBeGreaterThanOrEqual(0.9);
  }, 300_000);
});

describe.skipIf(process.env.SCRATCH_AB_RENDER !== '1')('the A/B render pair (SCR-PHRASING-PARITY)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('DEViLBOX plays the three-deck routine at the PEAK over the drops track; the plan and the track go to the demo side', async () => {
    const { deckCStats } = await import('../scratch/scratchDeckC');
    const before = deckCStats.strokes;
    const r = await renderRoutine({ bars: 65, withTrack: true, rate: Number(process.env.SCRATCH_AB_RATE ?? SR_DEFAULT) });
    console.log(`[A/B] Deck C strokes ${deckCStats.strokes - before}`);
    mkdirSync(OUT, { recursive: true });
    const name = process.env.SCRATCH_AB_NAME ?? 'devilbox_three_deck_drops';
    writeFileSync(join(OUT, `${name}.wav`), wav16([r.out.getChannelData(0), r.out.getChannelData(1)], r.out.sampleRate));
    // the same span of the track, and the plan the demo side renders from
    const { track, t0, t1 } = r;
    const span = track.pcm.subarray(Math.round(t0 * track.sampleRate), Math.round(t1 * track.sampleRate));
    writeFileSync(join(OUT, 'track_drops.wav'), wav16([span], track.sampleRate));
    // the demo side reads the track exactly (the WAV is peak-normalised to 16 bits, which moves its RMS)
    writeFileSync(join(OUT, 'track_drops.f32'), Buffer.from(Float32Array.from(span).buffer));
    const downbeats = Array.from({ length: 34 }, (_, k) => r.barT(r.fromBar - 1 + k) - t0);
    writeFileSync(join(OUT, 'plan.json'), JSON.stringify({ seed: r.plannedSeed, bpm: r.analysis.bpm, routineStartBar: 1, downbeatsSec: downbeats, trackGain: TRACK_GAIN, trackRate: track.sampleRate }, null, 1));
  }, 600_000);
});

describe.skipIf(process.env.SCRATCH_AB_LAYERS !== '1')('the isolated scratch layers for per-stroke comparison with the demo (SCR-AB-TAIL)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('writes the bus output (no track) and the strokes the executor fired', async () => {
    const r = await renderRoutine({ bars: 65, withTrack: false, layers: true, rate: Number(process.env.SCRATCH_AB_RATE ?? SR_DEFAULT) });
    mkdirSync(OUT, { recursive: true });
    const name = process.env.SCRATCH_AB_NAME ?? 'devilbox_layers';
    writeFileSync(join(OUT, `${name}.wav`), wav16([r.out.getChannelData(0), r.out.getChannelData(1)], r.out.sampleRate));
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ fired: r.fired, rate: r.out.sampleRate }, null, 1));
    // the bus output as float32, unscaled: the null test's input (a 16-bit WAV floors it at -90 dB)
    writeFileSync(join(OUT, `${name}.bus.f32`), Buffer.from(r.out.getChannelData(0).slice().buffer));
  }, 600_000);
});
