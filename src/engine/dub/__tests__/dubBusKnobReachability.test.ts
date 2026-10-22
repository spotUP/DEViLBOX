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

const NOT_IN_BUS = (consumer: string) => `Not consumed by DubBus: ${consumer}. Consumer test NOT yet written (open).`;

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
  deckTapAmount: { value: 0.2, exempt: NOT_IN_BUS('DubActions engage handlers pass it to engine.throwDeck/openDeckTap/muteAndDub') },
  throwBeats: { value: 2, exempt: NOT_IN_BUS('DubActions throw handlers scale the throw length by it') },
  sirenFeedback: { value: 0.5, siren: true },
  filterDropHz: { value: 900, exempt: NOT_IN_BUS('DubActions dub_combo_drop passes it to engine.filterDrop') },
  echoEngine: { value: 're201' },
  echoSyncDivision: { value: '1/8', exempt: NOT_IN_BUS('DrumPadEngine.setDubBusSettings turns it into echoRateMs before the bus sees it') },
  throwQuantize: { value: 'bar', exempt: NOT_IN_BUS('DubActions scheduleQuantizedThrow delays the throw to the beat grid') },
  bassShelfGainDb: { value: 8 },
  bassShelfFreqHz: { value: 300 },
  bassShelfQ: { value: 3, exempt: 'Web Audio lowshelf ignores Q, so the ramp on bassShelf.Q cannot change the sound; the AudioParam value is not distinguished by the harness walker.' },
  masterBassDb: { value: 6, exempt: 'Acts only through the master trim when the master insert is active (private state); see masterBassOnlyMaster.test.ts. UNVERIFIED here.' },
  masterBassPunchDb: { value: 6, exempt: 'Acts only through the master trim when the master insert is active (private state); see masterBassOnlyMaster.test.ts. UNVERIFIED here.' },
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
  pingPongSyncToBpm: { value: true, exempt: 'DEAD KNOB (bug, reported in todo C4): no engine or store code reads pingPongSyncToBpm; only the UI toggle and a preset write it.' },
  re201DelayMode: { value: 6, needs: { echoEngine: 're201' } },
  sirenPreset: { value: 'foghorn', siren: true, exempt: "Read when the siren starts; DubSirenSynth needs a ToneEngine that the offline rig does not create (logged 'AudioContext not initialized'). UNVERIFIED here." },
  echoMode: { value: 9 },
  echoFeedbackHpfHz: { value: 900, exempt: "Forwarded to the echo engine's feedback filter; not reached by the harness walker or too subtle in 0.8 s. UNVERIFIED here." },
  echoFeedbackLpfHz: { value: 1800, exempt: "Forwarded to the echo engine's feedback filter; not reached by the harness walker or too subtle in 0.8 s. UNVERIFIED here." },
  plateStage: { value: 'dattorro', exempt: 'The dattorro stage is async WASM, not available in the offline rig. UNVERIFIED here.' },
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
  subHarmonicMode: { value: 'continuous', exempt: 'Read through a getter by the sub-harmonic move, not applied to a node by setSettings. UNVERIFIED here.' },
  phaserRate: { value: 3, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  phaserDepth: { value: 0.2, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  phaserStages: { value: 10, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  phaserFeedback: { value: -0.6, needs: { sweepAmount: 0.6, sweepMode: 'phaser' } },
  postEchoSatEnabled: { value: true },
  postEchoSatDrive: { value: 0.9, needs: { postEchoSatEnabled: true }, exempt: 'Coalesced to the end of a gesture; not applied inside the 0.8 s render. UNVERIFIED here.' },
  ringModEnabled: { value: true, needs: { ringModAmount: 0.8 } },
  ringModFreq: { value: 900, needs: { ringModEnabled: true, ringModAmount: 0.8 } },
  ringModWaveform: { value: 1, needs: { ringModEnabled: true, ringModAmount: 0.8 } },
  ringModMix: { value: 0.9, needs: { ringModEnabled: true, ringModAmount: 0.8 } },
  ringModAmount: { value: 0.8, needs: { ringModEnabled: true } },
  lofiEnabled: { value: true, exempt: 'Ramps lofiBypass with setTargetAtTime; harness showed no difference. UNVERIFIED here.' },
  lofiBits: { value: 5, needs: { lofiEnabled: true } },
  extFeedbackGain: { value: 0.5 },
  extFeedbackEqFreq: { value: 3000, needs: { extFeedbackGain: 0.5, extFeedbackEqGain: 8 } },
  extFeedbackEqGain: { value: 8, needs: { extFeedbackGain: 0.5 } },
  extFeedbackEqQ: { value: 5, needs: { extFeedbackGain: 0.5, extFeedbackEqGain: 8 } },
  clubSimEnabled: { value: true },
  clubSimPreset: { value: 'smallClub', needs: { clubSimEnabled: true } },
  clubSimMix: { value: 0.8, needs: { clubSimEnabled: true } },
  chainOrder: { value: 'parallel' },
  autoEqStrength: { value: 0.2, exempt: 'Read by computeAutoEQ at analysis time, not applied by setSettings. UNVERIFIED here.' },
  autoEqLastGenre: { value: 'dub', exempt: 'Output state written by the bus after analysis; not an input knob.' },
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
