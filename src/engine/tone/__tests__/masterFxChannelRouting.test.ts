/**
 * Master effects aimed at channels never go silent.
 *
 * Owner, 2026-10-08: "the master effects still often die if i click the
 * channel buttons" (AmbientDelay on channel 2: Active, Mix 30 %, scope flat).
 *
 * Picking channels takes an effect off the whole-mix chain and puts it in an
 * isolation slot of the playing engine. The chain and the slot builder decided
 * separately whether that was possible - the chain by a static editor-mode
 * check, the slot builder by the engine - so the chain could hand an effect
 * over that the slot builder then refused (no engine, an engine without
 * isolation slots, hybrid playback): the effect was in neither place.
 *
 * Offline, real nodes: the real rebuildMasterEffects and the real slot
 * builder, a stand-in engine whose "worklet" splits two sines (100 Hz = channel
 * 1, 3 kHz = channel 2) into isolation outputs the way the real ones do. The
 * effect is a low-pass at 300 Hz, so what it reaches is read off the output.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type * as ToneNS from 'tone';
import { installRealWebAudio, realDelay } from '@/test/audio/realWebAudio';

const SR = 48000;
const SECONDS = 1;
let chain: {
  rebuild: (effects: unknown[]) => Promise<void>;
  masterIn: ToneNS.Gain;
  routeStrip: (channel: number, destination: AudioNode | null) => void;
} | null = null;
let replaced = false;

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({
    get masterEffectsInput() { return chain!.masterIn; },
    rebuildMasterEffects: (effects: unknown[]) => chain!.rebuild(effects),
    setChannelStripDestination: (channel: number, destination: AudioNode | null) => chain!.routeStrip(channel, destination),
  }),
}));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ hasReplacedInstruments: replaced }),
}));

function levelDb(x: Float32Array, hz: number): number {
  let re = 0, im = 0;
  for (let i = SR / 4; i < x.length; i++) { const ph = 2 * Math.PI * hz * i / SR; re += x[i] * Math.cos(ph); im += x[i] * Math.sin(ph); }
  return 20 * Math.log10(2 * Math.hypot(re, im) / (x.length - SR / 4) + 1e-12);
}

const LOWPASS = (selectedChannels: number[]) => ({
  id: 'fx1', category: 'tonejs', type: 'Filter', enabled: true, wet: 100,
  parameters: { type: 'lowpass', frequency: 300, rolloff: -24, Q: 0.7, gain: 0 },
  selectedChannels,
});

/** A song of two channels (0: 100 Hz, 1: 3 kHz) whose engine may or may not isolate. */
function buildSong(ctx: OfflineAudioContext, mode: 'isolating' | 'no-slots') {
  const main = ctx.createGain();
  const slotOut = [0, 1, 2, 3].map(() => ctx.createGain());
  const masks: number[] = [0, 0, 0, 0];
  const channels = [100, 3000].map((hz) => {
    const osc = ctx.createOscillator(); osc.frequency.value = hz;
    const g = ctx.createGain(); g.gain.value = 0.25;
    osc.connect(g); g.connect(main); osc.start();
    return g;
  });
  const worklet = {
    numberOfOutputs: 37,
    port: { postMessage() {} },
    connect(dest: AudioNode, output: number) { slotOut[output - 1].connect(dest); },
    disconnect() {},
  };
  const engine = {
    addIsolation(slot: number, mask: number) {
      masks[slot] = mask;
      channels.forEach((g, c) => { if (mask & (1 << c)) { g.disconnect(main); g.connect(slotOut[slot]); } });
    },
    removeIsolation(slot: number) {
      const mask = masks[slot]; masks[slot] = 0;
      channels.forEach((g, c) => { if (mask & (1 << c)) { g.disconnect(slotOut[slot]); g.connect(main); } });
    },
    getWorkletNode: () => worklet as unknown as AudioWorkletNode,
    getAudioContext: () => ctx as unknown as AudioContext,
    isAvailable: () => true,
    supportsIsolationSlots: () => mode === 'isolating',
  };
  return { main, engine };
}

/** Click: select channels on the effect, let the chain and the slots settle, render. */
async function playWithEffectOn(selected: number[], mode: 'isolating' | 'no-slots', engineRunning = true) {
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(2, SR * SECONDS, SR);
  Tone.setContext(ctx as never);
  const { rebuildMasterEffects } = await import('../MasterEffectsChain');
  const { setPlayingIsolationEngine, disposeChannelRoutedEffectsManager } = await import('../ChannelRoutedEffects');
  const { useAudioStore } = await import('@/stores/useAudioStore');
  const { scheduleWasmEffectRebuild } = await import('@/stores/useMixerStore');
  // Nothing left over from the last song: no engine, no effects, and the
  // rebuilds that going away sets off have run.
  useAudioStore.setState({ masterEffects: [] });
  setPlayingIsolationEngine(null);
  await realDelay(400);
  disposeChannelRoutedEffectsManager();

  const masterIn = new Tone.Gain(1);
  const blep = new Tone.Gain(1);
  Tone.connect(blep as never, ctx.destination as never);
  masterIn.connect(blep);                // the engine wires the empty chain like this at start
  const mctx = {
    masterEffectsInput: masterIn, blepInput: blep, masterEffectsNodes: [], masterEffectConfigs: new Map(),
    masterEffectAnalysers: new Map(), masterEffectsRebuildVersion: 0, _isPlaying: false,
    _notifyNoiseEffectsPlaying() {}, applyEffectParametersDiff() {}, updateBpmSyncedEffects: async () => {},
  };
  // Hybrid playback: each channel's synth plays into its Tone strip (2 kHz on
  // channel 1, 5 kHz on channel 2), which feeds the master input unless the
  // slot builder routes it into the channel's effect.
  const strips = new Map<number, GainNode>();
  if (replaced) {
    [2000, 5000].forEach((hz, c) => {
      const osc = ctx.createOscillator(); osc.frequency.value = hz;
      const strip = ctx.createGain(); strip.gain.value = 0.25;
      osc.connect(strip); Tone.connect(strip as never, masterIn as never); osc.start();
      strips.set(c, strip);
    });
  }
  const routeStrip = (c: number, destination: AudioNode | null) => {
    const strip = strips.get(c);
    if (!strip) return;
    strip.disconnect();
    if (destination) strip.connect(destination); else Tone.connect(strip as never, masterIn as never);
  };
  chain = { masterIn, routeStrip, rebuild: (effects) => rebuildMasterEffects(mctx as never, effects as never) };

  const { main, engine } = buildSong(ctx, mode);
  Tone.connect(main as never, masterIn as never);
  const effects = [LOWPASS(selected)];
  useAudioStore.setState({ masterEffects: effects as never });
  if (engineRunning) setPlayingIsolationEngine(engine as never);
  await chain.rebuild(effects);          // the hook behind the panel
  scheduleWasmEffectRebuild();           // the store's updateMasterEffect
  await realDelay(1000);                 // debounce + async slot build

  const out = (await ctx.startRendering()).getChannelData(0);
  return { low: levelDb(out, 100), high: levelDb(out, 3000), synth1: levelDb(out, 2000), synth2: levelDb(out, 5000) };
}

const DRY_DB = 20 * Math.log10(0.25);

describe('master effect aimed at channels', () => {
  // Before anything imports Tone, which reads the audio globals when it loads.
  beforeAll(() => { installRealWebAudio(); });
  beforeEach(async () => {
    replaced = false;
    await import('@/engine/registry/effects');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('on an engine that cannot isolate channels the effect still processes the whole mix', async () => {
    // Channel 1 selected, but the engine has no isolation slots (TFMX: dub sends only).
    const r = await playWithEffectOn([0], 'no-slots');
    expect(r.low).toBeGreaterThan(DRY_DB - 1.5);   // 100 Hz passes a 300 Hz low-pass
    expect(r.high).toBeLessThan(DRY_DB - 25);       // 3 kHz is cut: the effect IS running, on everything
  }, 120000);

  it('with no engine playing the effect still processes the whole mix', async () => {
    const r = await playWithEffectOn([0], 'isolating', false);
    expect(r.high).toBeLessThan(DRY_DB - 25);
  }, 120000);

  it('during hybrid playback the effect processes the chosen channel\'s samples and synth, nothing else', async () => {
    // Owner precheck 2026-10-18: a channel effect on a synth song processed the
    // whole mix ("channels cannot be isolated" whenever instruments were replaced).
    replaced = true;
    const r = await playWithEffectOn([0], 'isolating');
    expect(r.low).toBeGreaterThan(DRY_DB - 1.5);     // channel 1 sample passes the low-pass
    expect(r.synth1).toBeLessThan(DRY_DB - 25);      // channel 1 synth is cut: it reaches the effect
    expect(r.high).toBeGreaterThan(DRY_DB - 1.5);    // channel 2 sample untouched
    expect(r.synth2).toBeGreaterThan(DRY_DB - 1.5);  // channel 2 synth untouched
  }, 120000);

  it('on an isolating engine the effect processes only the chosen channel', async () => {
    const onFirst = await playWithEffectOn([0], 'isolating');
    // Channel 1 (100 Hz) is low-passed unharmed; channel 2 (3 kHz) is not touched.
    expect(onFirst.low).toBeGreaterThan(DRY_DB - 1.5);
    expect(onFirst.high).toBeGreaterThan(DRY_DB - 1.5);

    const onSecond = await playWithEffectOn([1], 'isolating');
    // Channel 2 is the one cut now, in its slot; channel 1 stays.
    expect(onSecond.high).toBeLessThan(DRY_DB - 25);
    expect(onSecond.low).toBeGreaterThan(DRY_DB - 1.5);
  }, 240000);
});
