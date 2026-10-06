/**
 * A channel send at max puts an audible echo of that channel on the master;
 * a send of zero puts none.
 *
 * Owner, 2026-10-06: "i still dont hear any delay or something when i pull
 * them [channel dub sends] to max". Every earlier failure of this path was a
 * different stage: sends created at 0 and never seeded (59ec947fe), the return
 * governor holding the wet 18 dB down (3e393efcf), an +11 dB wet make-up the
 * owner never had (7c4b46206), classic mode presuming channel isolation
 * (32b2d9eaa). Each had a test of its own stage; none measured the thing the
 * owner listens to. This one does, end to end: the real DubBus with its
 * master insert spliced (BASS lift, clipper, width), ChannelRoutedEffects
 * wiring the send the way the mixer does, offline-rendered.
 *
 * WHAT IS MEASURED. The master output with the bus return open, minus the
 * same render with the return closed (returnGain 0): the difference is
 * exactly what the return adds — the echo. It is compared with the dry master
 * output (return closed) above 200 Hz. Below that the dry carries the Master
 * BASS lift and the return, by design, bypasses it (5d8eb2dee: echo tails must
 * not come back bass-boosted), so a full-band ratio would score the BASS
 * fader, not the echo.
 *
 * THE MARGIN: -15 dB < echo - dry < -3 dB. Measured in this rig (renders vary
 * by about 0.5 dB run to run):
 *
 *   -1.3 dB  defaults with the +11 dB wet make-up of 2026-10-02 (owner: "way
 *            too strong", "buried the bass") — trips the ceiling
 *   -5.9 dB  the Tubby preset the owner heard the echo on, 2026-10-06 (RE-201
 *            JS fallback here; the rig cannot load the RE-201 worklet)
 *   -8.1 dB  the default bus
 *  -13.8 dB  the owner's bus at the report (Return 0.431, Space Echo wet 0.55)
 *
 * The floor is the wet path's designed staging at the quietest Return the
 * owner runs: channel tap 0.7 (-3.1 dB), echo chain about 4.7 dB under its
 * input (51c4c0d52), Return 0.431 (-7.3 dB) = -15.1 dB. A -6 dB loss in the
 * wet chain puts the owner's bus at -17.4 dB and fails it.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, toDb, releaseDubBusRigClock, RIG_SAMPLE_RATE } from '@/test/audio/dubBusRig';
import { realDelay } from '@/test/audio/realWebAudio';
import type { DubBusSettings } from '@/types/dub';

let bus: import('@/engine/dub/DubBus').DubBus | null = null;
vi.mock('@/hooks/drumpad/useMIDIPadRouting', () => ({
  getDrumPadEngine: () => (bus ? { getDubBus: () => bus } : null),
}));

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

const SECONDS = 4;
/** Measured from here: the echo has had two note periods to build. */
const FROM_SEC = 1.5;
/** Echo floor and ceiling relative to the dry master output above 200 Hz, dB. */
const ECHO_FLOOR_DB = -15;
const ECHO_CEILING_DB = -3;
/** Send 0: what the return adds must be silence. */
const NO_WET_DB = -90;

type Stereo = [Float32Array, Float32Array];

/** 2nd-order Butterworth high-pass, in place. */
function highPass(x: Float32Array, hz: number, sr: number): Float32Array {
  const w = 2 * Math.PI * hz / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0;
  const a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** RMS above 200 Hz from FROM_SEC, both channels; `minus` subtracted first. */
function bandDb(a: Stereo, minus?: Stereo): number {
  let s = 0; let n = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(a[ch].length);
    for (let i = 0; i < d.length; i++) d[i] = a[ch][i] - (minus ? minus[ch][i] : 0);
    const f = highPass(d, 200, RIG_SAMPLE_RATE);
    for (let i = Math.floor(FROM_SEC * RIG_SAMPLE_RATE); i < f.length; i++) { s += f[i] * f[i]; n++; }
  }
  return toDb(Math.sqrt(s / n));
}

/**
 * The master output for one channel at `send`, on the libopenmpt path (an
 * isolation engine renders the channel into its dub output), the song's mix
 * being that channel plus a bass line, all through the spliced master insert.
 */
async function renderMaster(settings: Partial<DubBusSettings>, send: number): Promise<Stereo> {
  const rig = await makeDubBusRig(SECONDS);
  bus = rig.bus;
  const ctx = rig.ctx;
  const { useFormatStore } = await import('@stores/useFormatStore');
  const { useMixerStore } = await import('@stores/useMixerStore');
  const cre = await import('@engine/tone/ChannelRoutedEffects');
  useFormatStore.setState({ editorMode: 'classic' } as never);
  await realDelay(50);

  // The channel: a 330 Hz saw note, 120 ms every 600 ms; the repeats land in the gaps.
  const note = ctx.createOscillator();
  note.type = 'sawtooth';
  note.frequency.value = 330;
  const channel = ctx.createGain();
  channel.gain.value = 0;
  for (let t = 0; t < SECONDS; t += 0.6) {
    channel.gain.setValueAtTime(0.25, t);
    channel.gain.setValueAtTime(0, t + 0.12);
  }
  note.connect(channel);
  note.start(0);
  // The rest of the song: a bass line, what the Master BASS lift works on.
  const bassOsc = ctx.createOscillator();
  bassOsc.frequency.value = 55;
  const bassLine = ctx.createGain();
  bassLine.gain.value = 0.2;
  bassOsc.connect(bassLine);
  bassOsc.start(0);

  // The master insert point, as ToneEngine registers masterEffectsInput -> blepInput.
  // Stereo, like masterEffectsInput: a mono node here leaves the splitter's
  // right channel silent until the stereo return joins and upmixes the dry.
  const masterIn = ctx.createGain();
  masterIn.channelCount = 2;
  masterIn.channelCountMode = 'explicit';
  const dest = rig.node('master');
  masterIn.connect(dest);
  channel.connect(masterIn);
  bassLine.connect(masterIn);
  rig.bus.registerMasterInsertPoint(masterIn, dest);
  rig.bus.registerWholeMixTap('tracker-master-input', masterIn);

  const mgr = cre.getChannelRoutedEffectsManager({} as never);
  mgr.setupDubBusWiring(rig.bus.inputNode, rig.bus);
  cre.setPlayingIsolationEngine(null);
  const engine = {
    isAvailable: () => true,
    getAudioContext: () => ctx,
    addIsolation() {}, removeIsolation() {},
    getWorkletNode: () => ({
      numberOfOutputs: 40,
      port: { postMessage() {} },
      connect: (d: AudioNode) => { channel.connect(d); return d; },
      disconnect() {},
    }),
  };
  cre.registerIsolationEngineResolver(async () => engine as never, 'classic');

  useMixerStore.getState().setChannelDubSend(0, send);
  await realDelay(300);
  const out = await rig.render([{ at: 0, run: () => rig.bus.setSettings({ ...settings, enabled: true }) }]);
  void mgr.dispose();
  useMixerStore.getState().setChannelDubSend(0, 0);
  return [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
}

/** The owner's bus when the report came in (get_dub_bus_state, 2026-10-06). */
const OWNER_LIVE: Partial<DubBusSettings> = {
  echoEngine: 'spaceEcho',
  echoWet: 0.55,
  returnGain: 0.431,
  masterBassDb: 11.5,
  masterBassPunchDb: 4,
  autoEqStrength: 0.85,
  sweepFeedback: 0.72,
};

const CASES: Array<[string, Partial<DubBusSettings>]> = [
  ['the default bus', {}],
  ["the owner's bus (Master BASS +11.5, Return 0.431, Space Echo)", OWNER_LIVE],
];

describe('a channel send at max is heard as an echo on the master', () => {
  for (const [name, settings] of CASES) {
    it(`${name}: send 1 puts the echo within ${-ECHO_FLOOR_DB} dB of the dry, send 0 puts none`, async () => {
      const dry = await renderMaster({ ...settings, returnGain: 0 }, 1);
      const open = await renderMaster(settings, 1);
      const dryDb = bandDb(dry);
      const echoDb = bandDb(open, dry);
      console.log(`[echo] ${name}: dry ${dryDb.toFixed(1)} dB, echo ${echoDb.toFixed(1)} dB, margin ${(echoDb - dryDb).toFixed(1)} dB`);
      expect(echoDb - dryDb, 'the echo of a send at max is buried under the dry').toBeGreaterThan(ECHO_FLOOR_DB);
      expect(echoDb - dryDb, 'the echo swamps the dry it echoes').toBeLessThan(ECHO_CEILING_DB);

      const dryClosed = await renderMaster({ ...settings, returnGain: 0 }, 0);
      const closed = await renderMaster(settings, 0);
      expect(bandDb(closed, dryClosed), 'send 0 still put wet on the master').toBeLessThan(NO_WET_DB);
    }, 180_000);
  }
});
