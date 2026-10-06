/**
 * A channel's sound-shaping slot changes that channel's dub send — and
 * nothing else.
 *
 * Owner, 2026-10-06: "add the sound shaping ones per channel". The slot sits
 * on the channel's send (PerChannelDubFx → ChannelShapeStage), before the
 * signals mix into the bus. This drives it the way the deck does — the mixer
 * store's `setChannelDubShape` → ChannelRoutedEffects → the channel's chain —
 * on the real DubBus, offline-rendered, with two channels sending and each
 * kind in turn on channel 0:
 *
 *  1. the master output changes audibly (the effect is in circuit and the bus
 *     hears it);
 *  2. measured at the two channels' send outputs in the same render, channel
 *     0's send changes and channel 1's send is IDENTICAL to the unshaped
 *     render — the slot is on its own channel's send and nowhere else;
 *  3. with the bus return closed, the master is identical — the slot never
 *     touches the dry channel, only what it sends.
 *
 * Why (2) is measured at the sends rather than on the master with channel 0
 * silent: the master carries the bus's worklets, and a render that starts one
 * more worklet (Ring Mod, Lo-fi) moves them by up to -47 dBFS even though the
 * new one is fed silence — render jitter, not a leak, and as loud as a real
 * leak of the quieter effects would be. The sends are plain Web Audio nodes
 * up to the bus input, so they compare exactly.
 *
 * Sentinel: the channel's stage reports the kind in the graph and that it
 * built an effect, so a pass cannot come from a stage that never ran.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, toDb, releaseDubBusRigClock } from '@/test/audio/dubBusRig';
import { realDelay, audioLoadsSettled } from '@/test/audio/realWebAudio';
import type { ChannelShapeKind } from '@/lib/dub/channelShape';

let bus: import('@/engine/dub/DubBus').DubBus | null = null;
vi.mock('@/hooks/drumpad/useMIDIPadRouting', () => ({
  getDrumPadEngine: () => (bus ? { getDubBus: () => bus } : null),
}));

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

const SECONDS = 2;
const FROM_SEC = 0.8;
/**
 * Least change a shaping effect must make, absolute. At the sends the
 * baseline is exact, so -50 dBFS is far above any jitter. On the master the
 * bus worklets jitter by up to -52 dBFS between renders (see above), so the
 * master floor sits at -45; the six effects measure -35 (Lo-fi) to -14.5
 * (Saturation) dBFS here (2026-10-06). The spring and plate are off for the
 * master renders: they are the jitter's loudest source and not what is
 * measured.
 */
const SEND_CHANGE_DBFS = -50;
const MASTER_CHANGE_DBFS = -45;
/**
 * "Identical": the renders differ only by float summation order, which an
 * extra node in the graph can change (measured -122 dBFS). A leak of the
 * effect onto another path measures -50 dBFS or louder.
 */
const IDENTICAL_DBFS = -100;

type Measure = 'master' | 'sends';

interface Render { out: AudioBuffer; kindInGraph: ChannelShapeKind | null; builds: number }

async function render(opts: { shape: ChannelShapeKind; measure: Measure; returnGain?: number }): Promise<Render> {
  const rig = await makeDubBusRig(SECONDS);
  bus = rig.bus;
  const ctx = rig.ctx;
  const { useFormatStore } = await import('@stores/useFormatStore');
  const { useMixerStore } = await import('@stores/useMixerStore');
  const cre = await import('@engine/tone/ChannelRoutedEffects');
  useFormatStore.setState({ editorMode: 'classic' } as never);
  await realDelay(50);

  // Channel 0: a 110 Hz saw, rich top and a fundamental under the High Pass
  // default. Channel 1: a 660 Hz square, always playing.
  const mk = (type: OscillatorType, hz: number, level: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g);
    o.start(0);
    return g;
  };
  const ch0 = mk('sawtooth', 110, 0.25);
  const ch1 = mk('square', 660, 0.12);

  const masterIn = ctx.createGain();
  masterIn.channelCount = 2;
  masterIn.channelCountMode = 'explicit';
  const dest = rig.node('master');
  masterIn.connect(dest);
  ch0.connect(masterIn);
  ch1.connect(masterIn);
  rig.bus.registerMasterInsertPoint(masterIn, dest);
  rig.bus.registerWholeMixTap('tracker-master-input', masterIn);

  const mgr = cre.getChannelRoutedEffectsManager({} as never);
  mgr.setupDubBusWiring(rig.bus.inputNode, rig.bus);
  cre.setPlayingIsolationEngine(null);
  // An isolation engine rendering each channel into its own dub output.
  const engine = {
    isAvailable: () => true,
    getAudioContext: () => ctx,
    addIsolation() {}, removeIsolation() {},
    getWorkletNode: () => ({
      numberOfOutputs: 40,
      port: { postMessage() {} },
      connect: (d: AudioNode, output?: number) => {
        const src = output === cre.DUB_OUTPUT_BASE ? ch0 : output === cre.DUB_OUTPUT_BASE + 1 ? ch1 : null;
        src?.connect(d);
        return d;
      },
      disconnect() {},
    }),
  };
  cre.registerIsolationEngineResolver(async () => engine as never, 'classic');

  const store = useMixerStore.getState();
  store.setChannelDubSend(0, 1);
  store.setChannelDubSend(1, 1);
  await realDelay(300);
  store.setChannelDubShape(0, opts.shape);
  // The swap runs inside a 6 ms duck on the rig's audio-locked clock; land it,
  // then wait for a worklet effect's module, WASM and 'ready'.
  vi.advanceTimersByTime(20);
  await audioLoadsSettled();
  await realDelay(200);

  if (opts.measure === 'sends') {
    // Left = channel 0's send, right = channel 1's, straight off each
    // channel's chain output; the programme master is silenced.
    const merger = ctx.createChannelMerger(2);
    const fx0 = mgr.getPerChannelFx(0);
    const fx1 = mgr.getPerChannelFx(1);
    if (!fx0 || !fx1) throw new Error('the channel chains were never built');
    fx0.mainOut.connect(merger, 0, 0);
    fx1.mainOut.connect(merger, 0, 1);
    merger.connect(ctx.destination);
    rig.node<GainNode>('master').gain.value = 0;
  }
  const stage = mgr.getPerChannelFx(0)?.shape ?? null;
  const kindInGraph = stage?.kind ?? null;
  const builds = stage?.builds ?? 0;
  const out = await rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true, returnGain: opts.returnGain ?? 0.85, springWet: 0, plateStage: 'off' }) }]);
  void mgr.dispose();
  store.setChannelDubShape(0, 'off');
  store.setChannelDubSend(0, 0);
  store.setChannelDubSend(1, 0);
  return { out, kindInGraph, builds };
}

function diffDb(a: AudioBuffer, b: AudioBuffer): number {
  let sum = 0;
  let n = 0;
  for (let ch = 0; ch < a.numberOfChannels; ch++) {
    const x = a.getChannelData(ch);
    const y = b.getChannelData(ch);
    for (let i = Math.floor(FROM_SEC * a.sampleRate); i < x.length; i++) { const d = x[i] - y[i]; sum += d * d; n++; }
  }
  return toDb(Math.sqrt(sum / n));
}

const KINDS: ChannelShapeKind[] = ['hpf', 'lpf', 'ringMod', 'lofi', 'wobble', 'saturation'];

function channelDiffDb(a: AudioBuffer, b: AudioBuffer, ch: number): number {
  const x = a.getChannelData(ch);
  const y = b.getChannelData(ch);
  let sum = 0;
  let n = 0;
  for (let i = Math.floor(FROM_SEC * a.sampleRate); i < x.length; i++) { const d = x[i] - y[i]; sum += d * d; n++; }
  return toDb(Math.sqrt(sum / n));
}

describe('a channel shaping slot changes only its own channel send', () => {
  let master: AudioBuffer;
  let sends: AudioBuffer;
  let dry: AudioBuffer;
  beforeAll(async () => {
    master = (await render({ shape: 'off', measure: 'master' })).out;
    sends = (await render({ shape: 'off', measure: 'sends' })).out;
    dry = (await render({ shape: 'off', measure: 'master', returnGain: 0 })).out;
  }, 180_000);

  it.each(KINDS)('%s', async (kind) => {
    const shaped = await render({ shape: kind, measure: 'master' });
    expect(shaped.kindInGraph, 'the store action never reached the channel stage').toBe(kind);
    expect(shaped.builds, 'the stage never built the effect').toBeGreaterThan(0);
    const change = diffDb(master, shaped.out);
    console.log(`[shape] ${kind}: ${change.toFixed(1)} dBFS change on the master`);
    expect(change, `${kind} did not reach the master through the bus`).toBeGreaterThan(MASTER_CHANGE_DBFS);

    const atSends = (await render({ shape: kind, measure: 'sends' })).out;
    expect(channelDiffDb(sends, atSends, 0), `${kind} did not change channel 0's send`).toBeGreaterThan(SEND_CHANGE_DBFS);
    expect(channelDiffDb(sends, atSends, 1), `${kind} on channel 0 changed channel 1's send`).toBeLessThan(IDENTICAL_DBFS);

    const dryShaped = await render({ shape: kind, measure: 'master', returnGain: 0 });
    expect(diffDb(dry, dryShaped.out), `${kind} reached the dry channel`).toBeLessThan(IDENTICAL_DBFS);
  }, 180_000);
});
