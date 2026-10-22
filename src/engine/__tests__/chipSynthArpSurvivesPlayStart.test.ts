/**
 * Regression: a ChipSynth with its arpeggio running under a live keyboard note went permanently silent for live
 * notes once the song was started (ToneEngine.releaseAll runs on play start and fades the instrument's own
 * `volume` Param to -Infinity, restoring it with a setTimeout).
 *
 * Real Tone on a real OfflineAudioContext. The restore's setTimeout is routed onto the audio clock so the
 * 100 ms window is deterministic. ToneEngine.releaseAll is the real method, run on a minimal engine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { resolveObjectURL } from 'node:buffer';
import type { InstrumentConfig } from '@typedefs/instrument';
import type * as ToneNS from 'tone';

type Wrapper = {
  triggerAttack: (n: string, t?: number, v?: number) => void;
  triggerRelease: (n: string, t?: number) => void;
  connect: (d: unknown) => void;
  volume: { value: number };
  isArpeggioPlaying: () => boolean;
};
let Tone: typeof ToneNS;
let ToneEngineCls: typeof import('../ToneEngine').ToneEngine;
let voiceSourceOf: typeof import('../tone/toneVoiceProbe').voiceSourceOf;
let createChipSynth: typeof import('../factories/ToneJSSynthFactory').createChipSynth;
const realSetTimeout = globalThis.setTimeout;

beforeAll(async () => {
  installRealWebAudio();
  resolveWorkletsFromPublic();
  servePublicToFetch();
  // standardized-audio-context fetches Tone's worklet Blob URLs; node's fetch cannot resolve them.
  const g = globalThis as unknown as { fetch: typeof fetch; window?: { fetch: typeof fetch } };
  const served = g.fetch;
  const withBlobs = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (raw.startsWith('blob:')) {
      const blob = resolveObjectURL(raw);
      if (!blob) throw new Error(`unknown blob ${raw}`);
      return new Response(await blob.text(), { status: 200, headers: { 'content-type': 'text/javascript' } });
    }
    return served(input, init);
  }) as typeof fetch;
  g.fetch = withBlobs;
  if (g.window) g.window.fetch = withBlobs;
  (globalThis as unknown as Record<string, unknown>).isSecureContext = true;
  Tone = await import('tone');
  ToneEngineCls = (await import('../ToneEngine')).ToneEngine;
  (await import('../ToneEngine')).getToneEngine();
  voiceSourceOf = (await import('../tone/toneVoiceProbe')).voiceSourceOf;
  createChipSynth = (await import('../factories/ToneJSSynthFactory')).createChipSynth;
}, 60000);
afterAll(() => { globalThis.setTimeout = realSetTimeout; });

const chipCfg = {
  id: 1, synthType: 'ChipSynth', name: 'chip', volume: -10, pan: 0,
  chipSynth: {
    channel: 'pulse1', duty: 25, bitDepth: 8,
    envelope: { attack: 1, decay: 300, sustain: 70, release: 200 },
    arpeggio: { enabled: true, speed: 12, speedUnit: 'hz', mode: 'loop',
      steps: [0, 3, 7, 12].map((noteOffset) => ({ noteOffset })) },
  },
} as unknown as InstrumentConfig;

type Order = 'releaseBeforeStart' | 'releaseAfterStart' | 'releaseInRestoreWindow' | 'startTwice' | 'controlNoStart' | 'startTwice110' | 'startTwice140' | 'startTwice180';

async function run(order: Order, releaseAt = 0.4) {
  const out: { volBefore?: number; volAfter: number; arp: boolean; rmsNew: number; rmsHeld: number; poly?: string } = { volAfter: NaN, arp: false, rmsNew: 0, rmsHeld: 0 };
  // Tone.Offline restores the global context before the clock renders, so Tone.now() inside the scheduled
  // callbacks would read the wrong context: set it for the whole render instead.
  const original = Tone.getContext();
  const ctx = new Tone.OfflineContext(1, 1.5, 44100);
  Tone.setContext(ctx);
  let buffer;
  try {
    await (async () => {
    // releaseAll's restore timer runs on the audio clock (only while releaseAll executes)
    const releaseAll = () => {
      globalThis.setTimeout = ((fn: () => void, ms?: number) => ctx.setTimeout(fn, (ms ?? 0) / 1000)) as unknown as typeof setTimeout;
      try { engine.releaseAll(); } finally { globalThis.setTimeout = realSetTimeout; }
    };
    const w = createChipSynth(chipCfg) as unknown as Wrapper;
    w.connect(Tone.getDestination());
    const engine = Object.create(ToneEngineCls.prototype) as ReturnType<typeof import('../ToneEngine').getToneEngine>;
    const e = engine as unknown as Record<string, unknown>;
    e.instruments = new Map<number, unknown>([[(1 << 16) | 0xffff, w]]);
    for (const m of ['releaseRestoreTimeouts', 'releaseRestoreVolumeDb', 'releaseRestores', 'activeVoices', 'channelActivePlayer', 'channelPitchState', 'slicePlayersMap', 'nativeEngineRouting']) e[m] = new Map();

    w.triggerAttack('C4');
    ctx.setTimeout(() => { out.volBefore = w.volume.value; }, 0.2);
    ctx.setTimeout(() => {
      if (order === 'releaseBeforeStart') w.triggerRelease('C4');
      if (order !== 'controlNoStart') releaseAll();
      else w.triggerRelease('C4');
      if (order.startsWith('startTwice') && order !== 'startTwice') ctx.setTimeout(releaseAll, Number(order.slice(10)) / 1000);
      if (order === 'startTwice') ctx.setTimeout(releaseAll, 0.06);
      if (order === 'releaseInRestoreWindow') ctx.setTimeout(() => w.triggerRelease('C4'), 0.06);
      if (order === 'releaseAfterStart') ctx.setTimeout(() => w.triggerRelease('C4'), 0.01);
    }, releaseAt);
    ctx.setTimeout(() => w.triggerAttack('E4'), 1.0);
    ctx.setTimeout(() => { out.volAfter = w.volume.value; out.arp = w.isArpeggioPlaying();
      const p = voiceSourceOf(w) as unknown as { _voices: unknown[]; _availableVoices: unknown[]; _activeVoices: unknown[] };
      out.poly = `voices=${p._voices.length} avail=${p._availableVoices.length} active=${p._activeVoices.length}`; }, 1.3);
    })();
    buffer = await ctx.render();
  } finally { Tone.setContext(original); }
  const d = buffer.getChannelData(0);
  const rms = (a: number, b: number) => { let s = 0; const i0 = Math.floor(a * 44100), i1 = Math.floor(b * 44100); for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / (i1 - i0)); };
  (out as Record<string, unknown>).bins = Array.from({ length: 15 }, (_, i) => +rms(i * 0.1, i * 0.1 + 0.1).toFixed(3));
  out.rmsHeld = rms(0.1, 0.38); out.rmsNew = rms(1.05, 1.3);
  return out;
}

describe('ChipSynth arpeggio survives song start', () => {
  it.each(['releaseBeforeStart', 'releaseAfterStart', 'releaseInRestoreWindow', 'startTwice', 'controlNoStart', 'startTwice110', 'startTwice140', 'startTwice180'] as const)('%s: level and sound are back for the next live note', async (order) => {
    const r = await run(order);
    expect(r.rmsHeld).toBeGreaterThan(0.001); // the rig itself produces sound
    expect(r.arp).toBe(true);
    expect(r.rmsNew).toBeGreaterThan(0.001);
  }, 30000);
});

describe('ChipSynth arpeggio: release phase sweep', () => {
  it('releaseAll at any arp phase leaves the next live note audible', async () => {
    let worst = Infinity;
    for (let k = 0; k < 12; k++) {
      const at = 0.4 + k * 0.007;
      const r = await run('releaseAfterStart', at);
      expect(r.poly).toMatch(/active=\d+/);
      worst = Math.min(worst, r.rmsNew);
    }
    expect(worst).toBeGreaterThan(0.001);
  }, 120000);
});
