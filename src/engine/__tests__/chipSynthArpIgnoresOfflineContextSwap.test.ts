/**
 * Regression: SynthBaker and previewGenerator swap the GLOBAL Tone context to an OfflineContext across an
 * async render. A live ChipSynth note started in that window used to build its arpeggio Tone.Clock on the
 * offline context; that clock never ticks on the live one while isPlaying stays true, and every later
 * start() early-returns: the synth is silent. Invariant: the arp clock lives on the synth's own context.
 *
 * Real Tone on real OfflineAudioContexts: A is the synth's context, B stands in for the baker's render context.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import { resolveObjectURL } from 'node:buffer';
import type { InstrumentConfig } from '@typedefs/instrument';
import type * as ToneNS from 'tone';

type Wrapper = {
  triggerAttack: (n: string, t?: number, v?: number) => void;
  connect: (d: unknown) => void;
  isArpeggioPlaying: () => boolean;
  getArpeggioEngine: () => { getClock: () => ToneNS.Clock | null; getDebugState: () => { clockContextIsBound: boolean | null } } | null;
};
let Tone: typeof ToneNS;
let createChipSynth: typeof import('../factories/ToneJSSynthFactory').createChipSynth;

beforeAll(async () => {
  installRealWebAudio();
  resolveWorkletsFromPublic();
  servePublicToFetch();
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
  createChipSynth = (await import('../factories/ToneJSSynthFactory')).createChipSynth;
}, 60000);

const chipCfg = {
  id: 1, synthType: 'ChipSynth', name: 'chip', volume: -10, pan: 0,
  chipSynth: {
    channel: 'pulse1', duty: 25, bitDepth: 8,
    envelope: { attack: 1, decay: 300, sustain: 70, release: 200 },
    arpeggio: { enabled: true, speed: 12, speedUnit: 'hz', mode: 'loop',
      steps: [0, 3, 7, 12].map((noteOffset) => ({ noteOffset })) },
  },
} as unknown as InstrumentConfig;

describe('ChipSynth arpeggio clock is bound to the synth context', () => {
  it('a note started while the global context is an offline render context still ticks on the synth context', async () => {
    const original = Tone.getContext();
    const ctxA = new Tone.OfflineContext(1, 1.0, 44100);
    const ctxB = new Tone.OfflineContext(1, 1.0, 44100);
    let buffer;
    try {
      Tone.setContext(ctxA);
      const w = createChipSynth(chipCfg) as unknown as Wrapper;
      w.connect(Tone.getDestination());

      Tone.setContext(ctxB); // the baker's global swap
      w.triggerAttack('C4'); // live note inside the window
      Tone.setContext(ctxA); // baker restores

      const clock = w.getArpeggioEngine()?.getClock();
      expect(clock).toBeTruthy();
      expect(clock!.context).toBe(ctxA);
      expect(w.getArpeggioEngine()!.getDebugState().clockContextIsBound).toBe(true);

      buffer = await ctxA.render();
    } finally { Tone.setContext(original); }
    const d = buffer.getChannelData(0);
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    expect(Math.sqrt(s / d.length)).toBeGreaterThan(0.001); // the arp stepped and sounded on A
  }, 30000);
});
