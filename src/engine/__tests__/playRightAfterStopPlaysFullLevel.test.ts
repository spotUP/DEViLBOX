/**
 * Play Song right after Stop plays the first note at full level.
 *
 * The bug: the toolbar's Play Song calls engine.stop(), waits 60 ms and starts playback. stop() runs releaseAll,
 * which ramps every instrument to -Infinity over 50 ms and restores the level only from a 100 ms timer. Playback
 * that started inside that window put its first notes on a silenced instrument ("weaker, missing attack"), while
 * the master tail mute was already ended at playback start. Playback start now ends the release fades as well.
 *
 * The restore timers are held (never fired), so the render shows only what playback start itself restores. The
 * channel's instrument is built before Stop, as earlier playback leaves it in a session, so Stop's fade reaches the
 * instance that plays the note. Real ToneEngine on node-web-audio-api, rendered offline.
 */
import { describe, it, expect, vi } from 'vitest';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { ToneEngine } from '@engine/ToneEngine';
import { renderOnEngine, type PlayOnEngine, type Stereo } from './offlineEngineRender';

const SR = 48000;
const SECS = 0.8;
const NOTE_AT = 0.1;
const NOTE_LEN = 0.4;

async function render(synthType: string, play: PlayOnEngine): Promise<Stereo> {
  const { getInitialConfig } = await import('@stores/instrument/presetOps');
  const config = { ...getInitialConfig(synthType), id: 1, name: synthType, pan: 0 } as InstrumentConfig;
  const realSetTimeout = globalThis.setTimeout;
  // The 50 ms tail-mute and 100 ms release-restore timers stay pending for the whole render.
  const held = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
    (ms ?? 0) >= 50 ? (0 as unknown as ReturnType<typeof setTimeout>) : realSetTimeout(fn, ms, ...args)) as typeof setTimeout);
  try {
    return await renderOnEngine(config, async (engine, cfg, Tone) => {
      engine.getInstrument(cfg.id, cfg, 0); // the channel 0 instance the note plays on
      await play(engine, cfg, Tone);
    }, SECS, SR);
  } finally {
    held.mockRestore();
  }
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const db = (a: number, b: number) => 20 * Math.log10((a + 1e-12) / (b + 1e-12));
/** The first 50 ms of the note: the attack the bug swallowed. */
const onset = (x: Float32Array) => rms(x, Math.floor(SR * NOTE_AT), Math.floor(SR * (NOTE_AT + 0.05)));

const note = (engine: ToneEngine, cfg: InstrumentConfig) =>
  engine.triggerNote(cfg.id, 'C3', NOTE_LEN, NOTE_AT, 1, cfg, false, false, 0);

/** Both ways playback starts: the song transport (Play Song) and ToneEngine.start(). */
const starts: Record<string, (engine: ToneEngine) => Promise<void>> = {
  'the song transport': async () => {
    const { useTransportStore } = await import('@stores/useTransportStore');
    await new Promise((r) => setTimeout(r, 0)); // the engine's transport subscription is in place
    useTransportStore.setState({ isPlaying: true });
  },
  'ToneEngine.start': (engine) => engine.start(),
};

describe('Play right after Stop plays the first note at full level', () => {
  it.each(['Synth', 'WobbleBass'].flatMap((s) => Object.keys(starts).map((how) => [s, how])))(
    '%s, started by %s: the first note onset is within 0.5 dB of a play without Stop',
    async (synthType, how) => {
      const plain = await render(synthType, (engine, cfg) => note(engine, cfg));
      const restarted = await render(synthType, async (engine, cfg) => {
        engine.stop();
        await starts[how](engine);
        note(engine, cfg);
      });
      const level = onset(plain[0]);
      expect(level, 'the note sounds without Stop').toBeGreaterThan(1e-3);
      expect(Math.abs(db(onset(restarted[0]), level)), 'restarted minus plain onset, dB').toBeLessThan(0.5);
    },
    60000,
  );
});
