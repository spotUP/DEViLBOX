/**
 * A Tone.js synth note on a tracker channel plays as loud as the same note from the keyboard preview, and a
 * stereo source keeps its stereo through the channel strip.
 *
 * The bug: the per-voice Tone.Panner and the strip's Tone.Channel used Tone's default channelCount 1 (explicit),
 * so each stage downmixed to mono and applied the equal-power centre gain (0.707). Two stages in series made
 * pattern playback exactly 6 dB quieter than the key preview (WobbleBass "weaker, missing attack") and collapsed
 * every channel strip to mono. Real ToneEngine on node-web-audio-api, rendered offline.
 */
import { describe, it, expect } from 'vitest';
import type { InstrumentConfig } from '@typedefs/instrument';
import { renderOnEngine, type PlayOnEngine, type Stereo } from './offlineEngineRender';

const SR = 48000;
const SECS = 1.2;

async function render(synthType: string, play: PlayOnEngine): Promise<Stereo> {
  const { getInitialConfig } = await import('@stores/instrument/presetOps');
  const config = { ...getInitialConfig(synthType), id: 1, name: synthType, pan: 0 } as InstrumentConfig;
  return renderOnEngine(config, play, SECS, SR);
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const db = (a: number, b: number) => 20 * Math.log10((a + 1e-12) / (b + 1e-12));
const NOTE_AT = 0.1;
const NOTE_LEN = 0.6;
const span = (x: Float32Array) => rms(x, Math.floor(SR * NOTE_AT), Math.floor(SR * (NOTE_AT + NOTE_LEN)));

describe('a Tone.js synth on a tracker channel plays at key-preview level', () => {
  it.each(['WobbleBass', 'Synth'])('%s: the channel note is within 0.5 dB of the key preview', async (synthType) => {
    const key = await render(synthType, (engine, cfg) => {
      engine.triggerNoteAttack(cfg.id, 'C3', NOTE_AT, 1, cfg, undefined, false, false); // as useNoteInput's keydown
      engine.triggerNoteRelease(cfg.id, 'C3', NOTE_AT + NOTE_LEN, cfg);
    });
    const channel = await render(synthType, (engine, cfg) => {
      engine.triggerNote(cfg.id, 'C3', NOTE_LEN, NOTE_AT, 1, cfg, false, false, 0); // as the replayer's channel 0
    });
    const keyLevel = span(key[0]);
    expect(keyLevel, 'the key preview sounds').toBeGreaterThan(1e-3);
    expect(Math.abs(db(span(channel[0]), keyLevel)), 'channel minus key, dB').toBeLessThan(0.5);
  }, 60000);

  it('a left-only source on the channel strip stays left-only', async () => {
    const out = await render('Synth', (engine, _cfg, Tone) => {
      const raw = Tone.getContext().rawContext as unknown as OfflineAudioContext;
      const osc = raw.createOscillator();
      const merge = raw.createChannelMerger(2);
      osc.connect(merge, 0, 0); // left only
      const strip = engine.getChannelOutput(0);
      Tone.connect(merge, strip);
      osc.start(NOTE_AT); osc.stop(NOTE_AT + NOTE_LEN);
    });
    const left = span(out[0]);
    expect(left, 'left sounds').toBeGreaterThan(1e-3);
    expect(db(span(out[1]), left), 'right relative to left, dB').toBeLessThan(-40);
  }, 60000);
});
