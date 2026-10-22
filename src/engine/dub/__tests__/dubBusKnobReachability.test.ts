/**
 * C4 KNOB REACHABILITY. Every `DubBusSettings` knob, set to a non-default
 * value, must move something: an AudioParam, a node property, the set of
 * nodes in the graph, the sidechain tap, or the rendered audio.
 *
 * Counted from `DEFAULT_DUB_BUS` (91 keys, equal to the 91 members of the
 * `DubBusSettings` interface in src/types/dub.ts). The count is asserted, so a
 * knob added without a row in `CASES` fails here.
 *
 * Path: real DubBus on node-web-audio-api, driven through `bus.setSettings`
 * (the engine entry every store/pad/MCP write reaches). Four knobs are not
 * consumed by the bus at all but by the pad action table (`DubActions`), and
 * `echoSyncDivision` is consumed by DrumPadEngine; those carry a written
 * exemption below and, where they can, a direct test of the real consumer.
 *
 * Two arms per knob, same prerequisites in both, differing only in the knob:
 * (A) snapshot of every AudioParam / node property reachable from the bus
 * after the render, and (B) the rendered audio itself.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { loadDubBus, makeDubBusRig, releaseDubBusRigClock, feedTone } from '@/test/audio/dubBusRig';
import { makeTapeSatCurve } from '@/lib/dub/tapeSatCurve';
import { DEFAULT_DUB_BUS, type DubBusSettings } from '@/types/dub';

const addSidechainTap = vi.fn(async (_ch: number, _node: AudioNode) => true);
const removeSidechainTap = vi.fn((_ch: number, _node: AudioNode) => {});
vi.mock('@/engine/tone/ChannelRoutedEffects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/tone/ChannelRoutedEffects')>()),
  getChannelRoutedEffectsManager: () => ({ addSidechainTap, removeSidechainTap }),
}));

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());
beforeEach(() => { addSidechainTap.mockClear(); removeSidechainTap.mockClear(); });

type Key = keyof DubBusSettings;
interface Case {
  /** Non-default value under test. */
  value: unknown;
  /** Prerequisite settings applied in BOTH arms (the knob only acts when these hold). */
  needs?: Partial<DubBusSettings>;
  /** Hold the siren during the render (the knob only acts while it sounds). */
  siren?: boolean;
  /** Fire startPingPong() during the render (ping-pong values are read at trigger time). */
  ping?: boolean;
  /** Written exemption: the bus cannot show this knob, and why. */
  exempt?: string;
}

const NOT_IN_BUS = (consumer: string, proof: string) => `Not consumed by DubBus: ${consumer}. Proven below: ${proof}.`;

const CASES: Record<Key, Case> = {
  enabled: { value: true },
  returnGain: { value: 0.4 },
  hpfCutoff: { value: 300 },
  springWet: { value: 0.9 },
  echoIntensity: { value: 0.9 },
  echoWet: { value: 0.9 },
  echoRateMs: { value: 600 },
  sidechainAmount: { value: 0.8 },
  sidechainSource: { value: 'channel' },
  sidechainChannelIndex: { value: 4, needs: { sidechainSource: 'channel' } },
  deckTapAmount: { value: 0.2, exempt: NOT_IN_BUS('DubActions engage handlers pass it to engine.throwDeck/openDeckTap/muteAndDub', "'deckTapAmount' describe, deck tap gain AudioParam through the real handler and DrumPadEngine") },
  throwBeats: { value: 2, exempt: NOT_IN_BUS('DubActions throw handlers scale the throw length by it', "'throwBeats' describe, deck tap gain closes later") },
  sirenFeedback: { value: 0.5, siren: true },
  filterDropHz: { value: 900, exempt: NOT_IN_BUS('DubActions dub_combo_drop passes it to engine.filterDrop', "'filterDropHz' describe, return lowpass frequency AudioParam") },
  echoEngine: { value: 're201' },
  echoSyncDivision: { value: '1/8', exempt: NOT_IN_BUS('DrumPadEngine.startDubSettingsMirror turns it into echoRateMs before the bus sees it', "'echoSyncDivision' describe, through the real mirror into the echo delay AudioParam") },
  throwQuantize: { value: 'bar', exempt: NOT_IN_BUS('DubActions scheduleQuantizedThrow delays the throw to the beat grid', "'throwQuantize' describe, deck tap opens later") },
  bassShelfGainDb: { value: 8 },
  bassShelfFreqHz: { value: 300 },
  bassShelfQ: { value: 3, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: bassShelf, both feedback shelf comps and masterBassPunch Q AudioParams move (DubBus.ts:4630-4645)' },
  masterBassDb: { value: 6, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: wireMasterInsert then lowDrive/lowOut change (DubBus.ts:5542-5648)' },
  masterBassPunchDb: { value: 6, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: wireMasterInsert then masterBassPunch.gain rises (DubBus.ts:5542-5648)' },
  midScoopGainDb: { value: -8 },
  midScoopFreqHz: { value: 1500, needs: { midScoopGainDb: -8 } },
  midScoopQ: { value: 4, needs: { midScoopGainDb: -8 } },
  stereoWidth: { value: 0.2 },
  characterPreset: { value: 'tubby' },
  glueBypass: { value: true },
  hpfStepped: { value: true },
  hpfResonanceDb: { value: 8 },
  sweepAmount: { value: 0.6 },
  sweepRateHz: { value: 1.5, needs: { sweepAmount: 0.6 } },
  sweepDepthMs: { value: 9, needs: { sweepAmount: 0.6 } },
  sweepFeedback: { value: 0.3, needs: { sweepAmount: 0.6 } },
  tapeSatMode: { value: 'stack' },
  pingPongLMs: { value: 200, ping: true },
  pingPongRMs: { value: 700, ping: true },
  pingPongFeedback: { value: 0.8, ping: true, needs: { pingPongLMs: 100, pingPongRMs: 150, pingPongWet: 0.8 } },
  pingPongWet: { value: 0.2, ping: true },
  pingPongSyncToBpm: { value: true, exempt: 'Not consumed by DubBus: DrumPadEngine.startDubSettingsMirror turns it into pingPongLMs/RMs from the active BPM before the bus sees it. Proven below through the real mirror into bus.setSettings -> startPingPong -> delay AudioParam.' },
  re201DelayMode: { value: 6, needs: { echoEngine: 're201' } },
  sirenPreset: { value: 'foghorn', siren: true, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: startSiren plays a different note per preset (DubBus.ts:3587-3620)' },
  echoMode: { value: 9 },
  echoFeedbackHpfHz: { value: 900, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: echo.fx.feedbackHpf.frequency moves (DubBus.ts:4690-4694)' },
  echoFeedbackLpfHz: { value: 1800, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: echo.fx.feedbackLpf.frequency moves (DubBus.ts:4690-4694)' },
  plateStage: { value: 'dattorro', exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: bus swaps MadProfessor/Dattorro/off plate node (DubBus.ts setPlateStage; was a dead knob before the installed-kind guard)' },
  plateStageMix: { value: 0.9 },
  returnEqEnabled: { value: false, needs: { returnEqGain: 6 } },
  returnEqFreq: { value: 2000, needs: { returnEqGain: 6 } },
  returnEqGain: { value: 9 },
  returnEqQ: { value: 6, needs: { returnEqGain: 6 } },
  returnEqB1Freq: { value: 250, needs: { returnEqB1Gain: 6 } },
  returnEqB1Gain: { value: 8 },
  returnEqB1Q: { value: 4, needs: { returnEqB1Gain: 6 } },
  returnEqB3Freq: { value: 4000, needs: { returnEqB3Gain: 6 } },
  returnEqB3Gain: { value: 8 },
  returnEqB3Q: { value: 4, needs: { returnEqB3Gain: 6 } },
  returnEqB4Freq: { value: 4000 },
  returnEqB4Gain: { value: -6 },
  returnEqB4Q: { value: 4 },
  returnEqHpEnabled: { value: true },
  returnEqHpFreq: { value: 400, needs: { returnEqHpEnabled: true } },
  returnEqHpQ: { value: 4, needs: { returnEqHpEnabled: true } },
  returnEqLpEnabled: { value: true },
  returnEqLpFreq: { value: 2000, needs: { returnEqLpEnabled: true } },
  returnEqLpQ: { value: 4, needs: { returnEqLpEnabled: true } },
  sweepMode: { value: 'phaser', needs: { sweepAmount: 0.6 } },
  subHarmonicMode: { value: 'continuous', exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: subHarmonic.execute starts pulse vs bed (moves/subHarmonic.ts:42, getter DubBus.ts:3040)' },
  phaserRate: { value: 3, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  phaserDepth: { value: 0.2, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  phaserStages: { value: 10, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  phaserFeedback: { value: -0.6, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  postEchoSatEnabled: { value: true },
  postEchoSatDrive: { value: 0.9, needs: { postEchoSatEnabled: true }, exempt: 'Rig limit: the offline WaveShaperNode rejects a second curve assignment ("cannot assign curve twice"), which DubBus.ts:4829 swallows, so the rebuilt curve never lands on the node. Partly proven: the 60 ms timer fires and makeTapeSatCurve differs per drive (postEchoSatDrive test, consumer DubBus.ts:4809-4832).' },
  ringModEnabled: { value: true, needs: { ringModAmount: 0.8 } },
  ringModFreq: { value: 900, needs: { ringModEnabled: true, ringModAmount: 0.8 } },
  ringModWaveform: { value: 1, needs: { ringModEnabled: true, ringModAmount: 0.8 } },
  ringModMix: { value: 0.9, needs: { ringModEnabled: true, ringModAmount: 0.8 } },
  ringModAmount: { value: 0.8, needs: { ringModEnabled: true } },
  lofiEnabled: { value: true, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: lofiBypass.gain 1 to 0 and lofiSend.gain 0 to 1 (DubBus.ts:4846-4850)' },
  lofiBits: { value: 5, needs: { lofiEnabled: true } },
  extFeedbackGain: { value: 0.5 },
  extFeedbackEqFreq: { value: 3000, needs: { extFeedbackGain: 0.5, extFeedbackEqGain: 8 } },
  extFeedbackEqGain: { value: 8, needs: { extFeedbackGain: 0.5 } },
  extFeedbackEqQ: { value: 5, needs: { extFeedbackGain: 0.5, extFeedbackEqGain: 8 } },
  clubSimEnabled: { value: true },
  clubSimPreset: { value: 'smallClub', needs: { clubSimEnabled: true } },
  clubSimMix: { value: 0.8, needs: { clubSimEnabled: true } },
  chainOrder: { value: 'parallel' },
  autoEqStrength: { value: 0.2, exempt: 'Not visible to the snapshot walker; proven in the knobs the snapshot walker cannot show, read at their consumer describe: _applyAutoEQ sets a larger returnEQ low-shelf gain at strength 1 than 0.2 (DubBus.ts:8639-8663)' },
  autoEqLastGenre: { value: 'dub', exempt: 'Output state, not an input knob: written by _applyAutoEQ at DubBus.ts:8663, cleared at 2945-2946, never read by the audio path. Proven written back in the autoEq test of the consumer describe.' },
};

const NODE_PROPS = ['type', 'oversample', 'fftSize', 'channelCount', 'channelInterpretation'] as const;

/** Every AudioParam value and node property reachable from `root`, plus how many nodes there are. */
function snapshot(root: object): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<object>();
  let nodes = 0;
  const isCtx = (o: object) => /Context$/.test(o.constructor?.name ?? '');
  const visit = (o: unknown, path: string, depth: number): void => {
    if (!o || typeof o !== 'object' || depth > 6 || seen.has(o) || isCtx(o)) return;
    seen.add(o);
    const name = o.constructor?.name ?? '';
    if (name === 'AudioParam') { out[path] = String((o as AudioParam).value); return; }
    if (/Node$/.test(name)) {
      nodes++;
      for (const p of NODE_PROPS) { try { const v = (o as unknown as Record<string, unknown>)[p]; if (v !== undefined) out[`${path}.${p}`] = String(v); } catch { /* getter */ } }
      try { const c = (o as unknown as { curve?: Float32Array }).curve; if (c) out[`${path}.curve`] = `${c.length}:${c[0]}:${c[c.length >> 1]}`; } catch { /* */ }
      try { (o as unknown as { parameters?: Map<string, AudioParam> }).parameters?.forEach((p, k) => { out[`${path}.p.${k}`] = String(p.value); }); } catch { /* */ }
    }
    if (o instanceof Map || o instanceof Set) { let i = 0; for (const v of o) visit(Array.isArray(v) ? v[1] : v, `${path}[${i++}]`, depth + 1); return; }
    for (const k of Object.keys(o)) {
      if (depth === 0 && (k === 'settings' || k.startsWith('_settings'))) continue;
      let v: unknown;
      try { v = (o as Record<string, unknown>)[k]; } catch { continue; }
      visit(v, `${path}.${k}`, depth + 1);
    }
  };
  visit(root, 'bus', 0);
  out['#nodes'] = String(nodes);
  return out;
}

interface Result { snap: Record<string, string>; audio: Float32Array[]; taps: string }

async function run(settings: Partial<DubBusSettings>, siren: boolean, ping = false): Promise<Result> {
  addSidechainTap.mockClear();
  const rig = await makeDubBusRig(0.8);
  rig.bus.setSettings(settings);
  feedTone(rig, 110, 0.3);
  const actions = [
    ...(siren ? [{ at: 0.1, run: () => { rig.bus.startSiren(); } }] : []),
    ...(ping ? [{ at: 0.1, run: () => { rig.bus.startPingPong(); } }] : []),
  ];
  const buf = await rig.render(actions);
  return {
    snap: snapshot(rig.bus),
    audio: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()],
    taps: JSON.stringify(addSidechainTap.mock.calls.map((c) => c[0])),
  };
}

function differences(a: Result, b: Result): string[] {
  const why: string[] = [];
  const keys = new Set([...Object.keys(a.snap), ...Object.keys(b.snap)]);
  const changed = [...keys].filter((k) => a.snap[k] !== b.snap[k]);
  if (changed.length) why.push(`param/node: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ` (+${changed.length - 3})` : ''}`);
  if (a.taps !== b.taps) why.push(`sidechain tap ${a.taps} -> ${b.taps}`);
  let peak = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < a.audio[c].length; i++) peak = Math.max(peak, Math.abs(a.audio[c][i] - b.audio[c][i]));
  if (peak > 1e-5) why.push(`audio differs by ${peak.toExponential(2)}`);
  return why;
}

const baselines = new Map<string, Promise<Result>>();
const baseline = (s: Partial<DubBusSettings>, siren: boolean, ping: boolean): Promise<Result> => {
  const id = JSON.stringify([s, siren, ping]);
  if (!baselines.has(id)) baselines.set(id, run(s, siren, ping));
  return baselines.get(id)!;
};

describe('every DubBusSettings knob is reachable', () => {
  it('has one row per knob (91, counted from DEFAULT_DUB_BUS)', () => {
    const defaults = Object.keys(DEFAULT_DUB_BUS).sort();
    expect(defaults).toHaveLength(91);
    expect(Object.keys(CASES).sort()).toEqual(defaults);
  });

  it('every non-default value really differs from the default', () => {
    for (const k of Object.keys(CASES) as Key[]) expect(CASES[k].value, k).not.toEqual(DEFAULT_DUB_BUS[k]);
  });

  const live = (Object.keys(CASES) as Key[]).filter((k) => !CASES[k].exempt);
  it.each(live)('%s moves the graph or the audio', { timeout: 30_000, retry: 4 }, async (key) => {
    const c = CASES[key];
    const base: Partial<DubBusSettings> = { ...(key === 'enabled' ? {} : { enabled: true }), ...c.needs };
    // The knob's own prerequisite keys are in both arms; the knob itself only in B.
    delete (base as Record<string, unknown>)[key];
    const a = await baseline(base, !!c.siren, !!c.ping);
    const b = await run({ ...base, [key]: c.value }, !!c.siren, !!c.ping);
    const why = differences(a, b);
    expect(why, `${key} = ${JSON.stringify(c.value)} moved nothing`).not.toHaveLength(0);
  // The offline rig occasionally hangs a render (a different knob each run, all pass alone):
  // a short timeout plus retries keeps a rig hang from reading as a dead knob. A dead knob
  // fails every attempt.
  });
});

// pingPongSyncToBpm: the bus never sees the flag. DrumPadEngine's settings mirror derives
// pingPongLMs/RMs from the active BPM and hands them to bus.setSettings; startPingPong then
// reads them into the two delay nodes. Driven here through the real mirror (sentinel: the
// pushed L time equals the BPM-derived value) and compared on the bus snapshot.
describe('pingPongSyncToBpm reaches the ping-pong delay AudioParam through the engine mirror', () => {
  async function pingRun(sync: boolean, bpm: number) {
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    const { useTransportStore } = await import('@/stores/useTransportStore');
    const store = useDrumPadStore.getState();
    const prevDub = store.dubBus;
    const prevBpm = useTransportStore.getState().bpm;
    useTransportStore.setState({ bpm });
    store.setDubBus({ enabled: true, pingPongSyncToBpm: sync, pingPongLMs: 200, pingPongRMs: 700, pingPongFeedback: 0.8, pingPongWet: 0.2 });
    const rig = await makeDubBusRig(0.8);
    const { DrumPadEngine } = await import('@/engine/drumpad/DrumPadEngine');
    const pushed: Array<{ pingPongLMs: number }> = [];
    const engine = Object.assign(Object.create(DrumPadEngine.prototype), {
      _dubMirrorOff: null,
      _dubMirrorTimer: null,
      dubBus: rig.bus,
      setDubBusSettings: (s: DubBusSettings) => { pushed.push(s); rig.bus.setSettings(s); },
    }) as { startDubSettingsMirror(): void; _dubMirrorOff: (() => void) | null };
    engine.startDubSettingsMirror();
    engine._dubMirrorOff?.();
    feedTone(rig, 110, 0.3);
    const buf = await rig.render([{ at: 0.1, run: () => { rig.bus.startPingPong(); } }]);
    const res: Result = { snap: snapshot(rig.bus), audio: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()], taps: '' };
    useDrumPadStore.setState({ dubBus: prevDub });
    useTransportStore.setState({ bpm: prevBpm });
    return { res, pushedL: pushed.at(-1)?.pingPongLMs };
  }

  it('on: follows the BPM (sentinel + delay param moves); off: keeps the fixed ms', { timeout: 60_000, retry: 4 }, async () => {
    const off = await pingRun(false, 140);
    const on = await pingRun(true, 140);
    const on90 = await pingRun(true, 90);
    expect(off.pushedL).toBe(200);
    expect(on.pushedL).toBe(Math.round((60000 / 140) * 0.75));
    expect(on90.pushedL).toBe(Math.round((60000 / 90) * 0.75));
    expect(differences(off.res, on.res), 'sync on vs off moved nothing').not.toHaveLength(0);
    expect(differences(on.res, on90.res), 'BPM change moved nothing').not.toHaveLength(0);
  });
});

// deckTapAmount, throwBeats, throwQuantize, filterDropHz: the bus never sees them. DubActions
// handlers read them from the settings and call the engine (the real DrumPadEngine delegators,
// pointed at the rig's bus), which moves the deck tap gain / return lowpass AudioParams on the
// bus. Sentinel: the tap gain / lowpass frequency is sampled at fixed audio times and must differ.
describe('DubActions consumers move the bus AudioParams they drive', () => {
  interface Sample { tapA: Record<string, number>; lpf: Record<string, number> }

  async function actionRun(
    handlerId: 'dub_throw_a' | 'dub_throw_all' | 'dub_combo_drop',
    settings: Partial<DubBusSettings>,
    times: number[],
    bpm = 140,
  ): Promise<Sample> {
    const { DUB_ACTION_HANDLERS } = await import('@/engine/dub/DubActions');
    const { DrumPadEngine } = await import('@/engine/drumpad/DrumPadEngine');
    const { useDJStore } = await import('@/stores/useDJStore');
    const { useTransportStore } = await import('@/stores/useTransportStore');
    const prevDj = useDJStore.getState();
    const prevBpm = useTransportStore.getState().bpm;
    useTransportStore.setState({ bpm });
    if (handlerId === 'dub_combo_drop') {
      useDJStore.setState({ crossfaderPosition: 0, decks: { ...prevDj.decks, A: { ...prevDj.decks.A, isPlaying: true, volume: 1 } } });
    }
    try {
      const rig = await makeDubBusRig(0.8);
      rig.bus.setSettings({ enabled: true });
      const engine = Object.assign(Object.create(DrumPadEngine.prototype), { dubBus: rig.bus }) as InstanceType<typeof DrumPadEngine>;
      const full = { ...DEFAULT_DUB_BUS, enabled: true, ...settings };
      const tap = () => rig.node<Map<string, GainNode>>('deckTaps').get('A')!.gain.value;
      const lpf = () => rig.node<BiquadFilterNode>('lpf').frequency.value;
      const out: Sample = { tapA: {}, lpf: {} };
      const fired: string[] = [];
      const actions = [
        { at: 0.1, run: () => { fired.push(String(DUB_ACTION_HANDLERS[handlerId].engage?.(engine, full, bpm) !== undefined)); } },
        ...times.map((t) => ({ at: t, run: () => { out.tapA[t] = tap(); out.lpf[t] = lpf(); } })),
      ];
      await rig.render(actions);
      expect(fired, 'handler engage ran').toHaveLength(1);
      return out;
    } finally {
      useDJStore.setState({ crossfaderPosition: prevDj.crossfaderPosition, decks: prevDj.decks });
      useTransportStore.setState({ bpm: prevBpm });
    }
  }

  describe('deckTapAmount', () => {
    it('sets the level the deck tap opens to', { timeout: 60_000, retry: 4 }, async () => {
      const lo = await actionRun('dub_throw_a', { deckTapAmount: 0.2 }, [0.2]);
      const hi = await actionRun('dub_throw_a', { deckTapAmount: 0.9 }, [0.2]);
      expect(lo.tapA[0.2]).toBeCloseTo(0.2, 2);
      expect(hi.tapA[0.2]).toBeCloseTo(0.9, 2);
    });
  });

  describe('throwBeats', () => {
    it('sets how long the deck tap stays open', { timeout: 60_000, retry: 4 }, async () => {
      // 140 BPM: 0.5 beat = 0.214 s hold, closed (after the 0.25 s release) by 0.6; 2 beats = 0.857 s, still open.
      const short = await actionRun('dub_throw_a', { deckTapAmount: 0.8, throwBeats: 0.5 }, [0.6]);
      const long = await actionRun('dub_throw_a', { deckTapAmount: 0.8, throwBeats: 2 }, [0.6]);
      expect(short.tapA[0.6]).toBeLessThan(0.05);
      expect(long.tapA[0.6]).toBeCloseTo(0.8, 2);
    });
  });

  describe('throwQuantize', () => {
    it('delays the deck tap opening to the beat grid', { timeout: 60_000, retry: 4 }, async () => {
      // No deck playing: scheduleQuantizedThrow falls back to the transport BPM. 140 BPM: 1/8 = 0.214 s, bar = 1.71 s.
      const now = await actionRun('dub_throw_all', { deckTapAmount: 0.8, throwBeats: 2, throwQuantize: 'off' }, [0.2]);
      const eighth = await actionRun('dub_throw_all', { deckTapAmount: 0.8, throwBeats: 2, throwQuantize: '1/8' }, [0.2, 0.5]);
      const bar = await actionRun('dub_throw_all', { deckTapAmount: 0.8, throwBeats: 2, throwQuantize: 'bar' }, [0.2, 0.5]);
      expect(now.tapA[0.2]).toBeCloseTo(0.8, 2);
      expect(eighth.tapA[0.2]).toBe(0);
      expect(eighth.tapA[0.5]).toBeCloseTo(0.8, 2);
      expect(bar.tapA[0.5]).toBe(0);
    });
  });

  describe('filterDropHz', () => {
    it('sets where the return lowpass drops to', { timeout: 60_000, retry: 4 }, async () => {
      const low = await actionRun('dub_combo_drop', { filterDropHz: 120 }, [0.6]);
      const high = await actionRun('dub_combo_drop', { filterDropHz: 1500 }, [0.6]);
      expect(low.lpf[0.6]).toBeCloseTo(120, 0);
      expect(high.lpf[0.6]).toBeCloseTo(1500, -1);
    });
  });
});

// echoSyncDivision: DrumPadEngine's settings mirror turns the division into echoRateMs (the BPM
// divides a beat) and hands it to bus.setSettings; the echo delay AudioParam moves with it.
describe('echoSyncDivision reaches the echo rate through the engine mirror', () => {
  async function echoRun(division: DubBusSettings['echoSyncDivision'], bpm: number) {
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    const { useTransportStore } = await import('@/stores/useTransportStore');
    const store = useDrumPadStore.getState();
    const prevDub = store.dubBus;
    const prevBpm = useTransportStore.getState().bpm;
    useTransportStore.setState({ bpm });
    store.setDubBus({ enabled: true, echoSyncDivision: division, echoRateMs: 600 });
    const rig = await makeDubBusRig(0.8);
    const { DrumPadEngine } = await import('@/engine/drumpad/DrumPadEngine');
    const pushed: DubBusSettings[] = [];
    const engine = Object.assign(Object.create(DrumPadEngine.prototype), {
      _dubMirrorOff: null,
      _dubMirrorTimer: null,
      dubBus: rig.bus,
      setDubBusSettings: (s: DubBusSettings) => { pushed.push(s); rig.bus.setSettings(s); },
    }) as { startDubSettingsMirror(): void; _dubMirrorOff: (() => void) | null };
    engine.startDubSettingsMirror();
    engine._dubMirrorOff?.();
    feedTone(rig, 110, 0.3);
    const buf = await rig.render();
    const res: Result = { snap: snapshot(rig.bus), audio: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()], taps: '' };
    useDrumPadStore.setState({ dubBus: prevDub });
    useTransportStore.setState({ bpm: prevBpm });
    return { res, pushedMs: pushed.at(-1)?.echoRateMs };
  }

  it("'off' keeps the fixed ms; a division follows the BPM and moves the echo delay", { timeout: 60_000, retry: 4 }, async () => {
    const off = await echoRun('off', 120);
    const eighth = await echoRun('1/8', 120);
    const eighth90 = await echoRun('1/8', 90);
    expect(off.pushedMs).toBe(600);
    expect(eighth.pushedMs).toBe(250);
    expect(eighth90.pushedMs).toBeCloseTo(60000 / 90 * 0.5, 5);
    expect(differences(off.res, eighth.res), 'division vs off moved nothing').not.toHaveLength(0);
    expect(differences(eighth.res, eighth90.res), 'BPM change moved nothing').not.toHaveLength(0);
  });
});

// The twelve knobs the snapshot walker could not show: each is read directly off the node,
// curve or call its consumer drives, after the real setSettings (or the real consumer).
// The walker misses them because the nodes sit in private fields past its depth limit, or
// because the effect lives behind a timer or a lazily-built stage.
describe('knobs the snapshot walker cannot show, read at their consumer', () => {
  type Priv = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const priv = (o: unknown): Priv => o as Priv;

  async function withBus(settings: Partial<DubBusSettings>, seconds = 0.4) {
    const rig = await makeDubBusRig(seconds);
    rig.bus.setSettings({ enabled: true, ...settings });
    feedTone(rig, 110, 0.3);
    return rig;
  }

  it('bassShelfQ ramps the Q of the echo-input shelf, the feedback compensators and the master punch shelf', async () => {
    const read = async (q: number) => {
      const rig = await withBus({ bassShelfQ: q });
      await rig.render();
      const b = priv(rig.bus);
      return [b.bassShelf.Q.value, b.feedbackShelfComp.Q.value, b.extFeedbackShelfComp.Q.value, b.masterBassPunch.Q.value];
    };
    const base = await read(DEFAULT_DUB_BUS.bassShelfQ);
    const moved = await read(3);
    expect(base[0]).toBeCloseTo(DEFAULT_DUB_BUS.bassShelfQ, 3);
    for (const v of moved) expect(v).toBeCloseTo(3, 3);
  });

  it('echoFeedbackHpfHz and echoFeedbackLpfHz ramp the SpaceEcho feedback filters', async () => {
    const read = async (s: Partial<DubBusSettings>) => {
      const rig = await withBus(s);
      await rig.render();
      const fx = priv(rig.bus).echo.fx;
      return [fx.feedbackHpf.frequency.value, fx.feedbackLpf.frequency.value];
    };
    const base = await read({});
    const moved = await read({ echoFeedbackHpfHz: 900, echoFeedbackLpfHz: 1800 });
    expect(base[0]).toBeCloseTo(DEFAULT_DUB_BUS.echoFeedbackHpfHz, 0);
    expect(base[1]).toBeCloseTo(DEFAULT_DUB_BUS.echoFeedbackLpfHz, 0);
    expect(moved[0]).toBeCloseTo(900, 0);
    expect(moved[1]).toBeCloseTo(1800, 0);
  });

  it('lofiEnabled closes lofiBypass and opens lofiSend', async () => {
    const read = async (on: boolean) => {
      const rig = await withBus({ lofiEnabled: on });
      await rig.render();
      const b = priv(rig.bus);
      return [b.lofiBypass.gain.value, b.lofiSend.gain.value];
    };
    const off = await read(false);
    const on = await read(true);
    expect(off[0]).toBeCloseTo(1, 2); expect(off[1]).toBeCloseTo(0, 2);
    expect(on[0]).toBeCloseTo(0, 2); expect(on[1]).toBeCloseTo(1, 2);
  });

  it('postEchoSatDrive reaches the curve builder through the 60 ms timer (the node itself cannot be shown on this rig)', async () => {
    // node-web-audio-api lets a WaveShaperNode.curve be assigned once ("cannot assign curve twice"), and
    // DubBus swallows that error, so the rebuilt curve never lands on the rig node. What the rig can show:
    // the knob drives the drive-tracking state, the coalescing timer fires, and the curve builder gives a
    // different table for each drive.
    const read = async (drive: number) => {
      const rig = await withBus({ postEchoSatEnabled: true, postEchoSatDrive: drive }, 1);
      await rig.render();
      const b = priv(rig.bus);
      return { last: b._lastPostEchoSatDrive as number, pending: b._postEchoSatCurvePending as unknown };
    };
    const soft = await read(0.1);
    const hard = await read(0.9);
    expect(soft.last).toBeCloseTo(0.1, 5); expect(hard.last).toBeCloseTo(0.9, 5);
    expect(soft.pending).toBeNull(); expect(hard.pending).toBeNull();
    const a = makeTapeSatCurve(soft.last), c = makeTapeSatCurve(hard.last);
    let peak = 0;
    for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i] - c[i]));
    expect(peak).toBeGreaterThan(0.01);
  });

  it('plateStage swaps the plate node the bus owns', async () => {
    const stage = async (s: DubBusSettings['plateStage']) => {
      const rig = await withBus({ plateStage: s }, 1);
      await rig.render();
      return priv(rig.bus).plateStage;
    };
    const before = (await stage('madprofessor'))?.constructor?.name;
    const after = (await stage('dattorro'))?.constructor?.name;
    const none = await stage('off');
    expect({ before, after, none }).toEqual({ before: 'MadProfessorPlateEffect', after: 'DattorroPlateEffect', none: null });
  });

  it('subHarmonicMode is what the subHarmonic move reads to choose the sub bed over the pulse', async () => {
    const { subHarmonic } = await import('@/engine/dub/moves/subHarmonic');
    const run = async (mode: 'pulse' | 'continuous') => {
      const rig = await withBus({ subHarmonicMode: mode });
      const calls: string[] = [];
      priv(rig.bus).startSubBassBed = () => { calls.push('bed'); return () => {}; };
      priv(rig.bus).startSubHarmonic = () => { calls.push('pulse'); return () => {}; };
      subHarmonic.execute({ bus: rig.bus, params: {} } as never);
      return calls;
    };
    expect(await run('pulse')).toEqual(['pulse']);
    expect(await run('continuous')).toEqual(['bed']);
  });

  it('sirenPreset picks the note the siren synth is attacked with', async () => {
    const run = async (preset: DubBusSettings['sirenPreset']) => {
      const rig = await withBus({ sirenPreset: preset });
      const notes: number[] = [];
      const synth = { output: rig.ctx.createGain(), triggerAttack: (_t: unknown, n: number) => { notes.push(n); }, triggerRelease: () => {} };
      priv(rig.bus)._ensureSirenSynth = async () => synth;
      const stop = rig.bus.startSiren();
      await vi.advanceTimersByTimeAsync(5);
      stop();
      return notes;
    };
    expect(await run('rasta')).toEqual([36]);
    expect(await run('foghorn')).toEqual([24]);
  });

  it('masterBassDb and masterBassPunchDb reach the master punch shelf and the low band once the master insert is wired', async () => {
    const read = async (s: Partial<DubBusSettings>) => {
      const rig = await withBus(s);
      const src = rig.ctx.createGain();
      const dst = rig.ctx.createGain();
      dst.connect(rig.ctx.destination);
      const wiring = rig.bus.wireMasterInsert(src, dst);
      await vi.advanceTimersByTimeAsync(50);
      await wiring;
      await rig.render();
      const b = priv(rig.bus);
      return { punch: b.masterBassPunch.gain.value as number, drive: b.lowDrive.gain.value as number, out: b.lowOut.gain.value as number };
    };
    const flat = await read({});
    const punch = await read({ masterBassPunchDb: 6 });
    const bass = await read({ masterBassDb: 6 });
    expect(punch.punch).toBeGreaterThan(flat.punch + 1);
    expect(bass.drive !== flat.drive || bass.out !== flat.out).toBe(true);
  });

  it('autoEqStrength scales the EQ the bus applies, and autoEqLastGenre is written back after analysis', async () => {
    const analysis = {
      bpm: 90, bpmConfidence: 0.9, musicalKey: 'C', keyConfidence: 0.8, rmsDb: -18, peakDb: -6, analyzedAt: 0,
      genre: { primary: 'Reggae', subgenre: '', confidence: 0.8, mood: 'Chill', energy: 0.7, danceability: 0.6, bpm: 90, bpmConfidence: 0.9, musicalKey: 'C', keyConfidence: 0.8 },
      frequencyPeaks: [],
    };
    const run = async (strength: number) => {
      const rig = await withBus({ autoEqStrength: strength });
      const gains: number[] = [];
      const eq = priv(rig.bus).returnEQ;
      const orig = eq.setLowShelf.bind(eq);
      eq.setLowShelf = (e: boolean, f: number, g: number, q: number) => { gains.push(g); return orig(e, f, g, q); };
      await priv(rig.bus)._applyAutoEQ(analysis);
      return { gains, genre: priv(rig.bus).settings.autoEqLastGenre as string };
    };
    const weak = await run(0.2);
    const strong = await run(1);
    expect(weak.gains).toHaveLength(1);
    expect(strong.gains[0]).toBeGreaterThan(weak.gains[0]);
    expect(strong.genre).not.toBe('');
  });
});
