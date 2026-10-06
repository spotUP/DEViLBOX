/**
 * A channel send above zero puts signal into the dub bus, on every playback
 * path; a send of zero does not.
 *
 * Reported 2026-10-06: "the channel sends haven't worked for me for any format
 * for a while". Each row builds the topology one playback path leaves behind
 * (editor mode, the whole-mix tap the path registers, the isolation engine the
 * path resolves, what NativeEngineRouting reports to the bus), sets the send
 * the way the UI does (useMixerStore.setChannelDubSend), renders the REAL
 * DubBus offline and measures what reaches it.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, rmsBetween, toDb, releaseDubBusRigClock, type DubBusRig } from '@/test/audio/dubBusRig';
import { realDelay } from '@/test/audio/realWebAudio';

let bus: import('@/engine/dub/DubBus').DubBus | null = null;
vi.mock('@/hooks/drumpad/useMIDIPadRouting', () => ({
  getDrumPadEngine: () => (bus ? { getDubBus: () => bus } : null),
}));

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

type Path = {
  name: string;
  mode: string;
  /** The whole-mix tap this path leaves registered. */
  wholeMixKey: string;
  /** An isolation engine resolves for the song (its worklet fills dub outputs). */
  isolates: boolean;
  /** What startNativeEngines reports to the bus; undefined when no engine starts. */
  reported?: boolean;
};

const PATHS: Path[] = [
  { name: 'TrackerReplayer (MOD)', mode: 'classic', wholeMixKey: 'tracker-master-input', isolates: false },
  { name: 'libopenmpt', mode: 'classic', wholeMixKey: 'tracker-master-input', isolates: true },
  { name: 'Furnace dispatch', mode: 'furnace', wholeMixKey: 'tracker-master-input', isolates: true },
  { name: 'Hively', mode: 'hively', wholeMixKey: 'tracker-master-input', isolates: true },
  { name: 'UADE song (classic)', mode: 'classic', wholeMixKey: 'tracker-master-input', isolates: false },
  { name: 'registry WASM engine (Fred)', mode: 'classic', wholeMixKey: 'native:FredReplayerWasmSynth2', isolates: false, reported: false },
];

async function measure(path: Path, send: number): Promise<{ dB: number; taps: number; gain: number }> {
  const rig: DubBusRig = await makeDubBusRig(1.5);
  bus = rig.bus;
  const ctx = rig.ctx;
  const { useFormatStore } = await import('@stores/useFormatStore');
  const { useMixerStore } = await import('@stores/useMixerStore');
  const cre = await import('@engine/tone/ChannelRoutedEffects');
  useFormatStore.setState({ editorMode: path.mode } as never);
  await realDelay(50);

  const mix = ctx.createGain();
  mix.gain.value = 0.3;
  const mixOsc = ctx.createOscillator();
  mixOsc.frequency.value = 220;
  mixOsc.connect(mix);
  mixOsc.start(0);
  rig.bus.registerWholeMixTap(path.wholeMixKey, mix as unknown as AudioNode);

  const mgr = cre.getChannelRoutedEffectsManager({} as never);
  mgr.setupDubBusWiring(rig.bus.inputNode, rig.bus);

  cre.registerIsolationEngineResolver(async () => null, path.mode);
  cre.setPlayingIsolationEngine(null);
  if (path.isolates) {
    const chOsc = ctx.createOscillator();
    chOsc.frequency.value = 330;
    chOsc.start(0);
    const engine = {
      isAvailable: () => true,
      getAudioContext: () => ctx,
      addIsolation() {}, removeIsolation() {},
      getWorkletNode: () => ({
        numberOfOutputs: 40,
        port: { postMessage() {} },
        connect: (dest: AudioNode) => { const g = ctx.createGain(); g.gain.value = 0.3; chOsc.connect(g); g.connect(dest); return dest; },
        disconnect() {},
      }),
    };
    cre.registerIsolationEngineResolver(async () => engine as never, path.mode);
  }
  if (path.reported !== undefined) rig.bus.setEngineIsolation(path.reported);

  useMixerStore.getState().setChannelDubSend(0, send);
  await realDelay(300);
  const out = await rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true }) }]);
  const snap = rig.bus.getDiagnosticSnapshot();
  void mgr.dispose();
  useMixerStore.getState().setChannelDubSend(0, 0);
  return {
    dB: toDb(rmsBetween(out, 0.6)),
    taps: Number(snap.registeredChannelTaps),
    gain: Math.max(Number(snap.wholeMixTapGainMax), Number(snap.channelTapGainMax)),
  };
}

describe('a channel send feeds the dub bus on every playback path', () => {
  for (const path of PATHS) {
    it(`${path.name}: send 0.6 reaches the bus, send 0 does not`, async () => {
      const open = await measure(path, 0.6);
      console.log(`[table] ${path.name}: taps=${open.taps} sendGain=${open.gain} busOut=${open.dB.toFixed(1)} dB`);
      expect(open.dB, 'send 0.6 put nothing into the bus').toBeGreaterThan(-70);
      const closed = await measure(path, 0);
      expect(closed.dB, 'send 0 leaked into the bus').toBeLessThan(-90);
    }, 90_000);
  }
});
