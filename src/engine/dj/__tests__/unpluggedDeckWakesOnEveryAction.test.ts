/**
 * DJ-IDLE-CPU: a stopped deck in a silent app is unplugged from the mixer, so
 * Chrome stops processing its chain. An unplugged deck cannot make the sound
 * that would wake the signal gate, so the wake comes from intent: every deck
 * action that is not a reader (get*, is*, has*) or dispose plugs the deck in
 * synchronously before it runs.
 *
 * - Every such action of DeckEngine goes through the wake, so a method added
 *   later cannot start sound into an unplugged deck.
 * - A deck played from the unplugged state is heard from the very sample a
 *   deck that was never unplugged is: the wake adds no latency.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import { SR } from '@/test/audio/masterChainRig';

afterEach(async () => {
  const { _setSoundingForTest } = await import('@/engine/audio/signalPresence');
  _setSoundingForTest(false);
});

/** Render a deck that plays a tone; returns the first audible sample index of the output. */
async function onsetSample(unplugFirst: boolean): Promise<{ onset: number; wasUnplugged: boolean }> {
  installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
  const Tone = await import('tone');
  const { _setSoundingForTest } = await import('@/engine/audio/signalPresence');
  const length = Math.round(SR * 0.5);
  const ctx = new OfflineAudioContext(2, length, SR);
  Tone.setContext(ctx as never);
  const { DeckEngine } = await import('../DeckEngine');
  const out = new Tone.Gain(1);
  out.connect(Tone.getDestination().input as never);
  const deck = new DeckEngine({ id: 'A', outputNode: out });
  await audioLoadsSettled(400, 20000);

  const tone = ctx.createBuffer(2, SR, SR);
  const x = new Float32Array(SR);
  for (let i = 0; i < SR; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / SR);
  tone.copyToChannel(x, 0); tone.copyToChannel(x, 1);
  await deck.loadDecodedAudio(tone, null);
  // A load primes the scratch capture by playing briefly; offline, no time
  // passes before the render, so stop it the way the priming ends.
  deck.stop();

  let wasUnplugged = false;
  if (unplugFirst) {
    // The app goes silent with the deck stopped: the deck leaves the graph.
    _setSoundingForTest(true);
    _setSoundingForTest(false);
    wasUnplugged = !deck.isPluggedIn;
  }
  await deck.play();
  const rendered = await ctx.startRendering();
  const ch = rendered.getChannelData(0);
  let onset = -1;
  for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) > 1e-4) { onset = i; break; }
  deck.dispose();
  return { onset, wasUnplugged };
}

describe('an unplugged deck', () => {
  it('is heard from the same sample as a deck that was never unplugged (the wake adds 0 ms)', async () => {
    const plugged = await onsetSample(false);
    const woken = await onsetSample(true);
    expect(woken.wasUnplugged).toBe(true);
    expect(plugged.onset).toBeGreaterThanOrEqual(0);
    expect(woken.onset).toBe(plugged.onset);
  }, 600_000);

  it('every action that can make sound passes the wake; only readers and dispose do not', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
    const Tone = await import('tone');
    const ctx = new OfflineAudioContext(2, SR, SR);
    Tone.setContext(ctx as never);
    const { DeckEngine, deckActionIsSilent } = await import('../DeckEngine');
    const out = new Tone.Gain(1);
    const deck = new DeckEngine({ id: 'B', outputNode: out });
    const proto = DeckEngine.prototype as unknown as Record<string, unknown>;
    const actions = Object.getOwnPropertyNames(proto).filter((n) => {
      const d = Object.getOwnPropertyDescriptor(proto, n);
      return n !== 'constructor' && !n.startsWith('_') && typeof d?.value === 'function';
    });
    const unwrapped = actions.filter((n) => !deckActionIsSilent(n) && !Object.prototype.hasOwnProperty.call(deck, n));
    expect(unwrapped).toEqual([]);
    for (const n of ['play', 'resume', 'cue', 'cueSeconds', 'startScratch', 'setScratchVelocity', 'playPattern', 'nudge', 'holdNudge', 'setAudioLoop', 'restoreScratchSnapshot', 'recueScratch']) {
      expect(actions, n).toContain(n);
      expect(deckActionIsSilent(n), n).toBe(false);
    }
    // The per-frame readers never keep a deck plugged in.
    for (const n of ['getWaveform', 'getFFT', 'getLevel', 'getChannelWaveforms', 'getHeardPosition', 'isPlaying', 'isPatternActive']) {
      expect(deckActionIsSilent(n), n).toBe(true);
    }
    deck.dispose();
  }, 600_000);
});
