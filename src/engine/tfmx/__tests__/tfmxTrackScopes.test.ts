/**
 * TFMX scopes follow the grid's tracks, not the Paula voices. turrican_bonus
 * is a 4-voice TFMX song whose grid has 8 tracks (one track can drive several
 * voices). The scope feed must carry 8 channels, and a track above 3 must show
 * the audio of the voice it plays on (owner 2026-11-03: "only 4 channels
 * oscillars shows").
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { startWorklet, loadSharedWorkletScripts, songBuffer, stereoOutputs } from '../../__tests__/workletHarness';

beforeAll(loadSharedWorkletScripts);

describe('TFMX scope feed per grid track', () => {
  it('turrican_bonus streams 8 track scopes and a track above 3 sounds', async () => {
    const { proc, send, posted } = await startWorklet('tfmx', 'TFMX');
    await send({
      type: 'loadModule',
      mdatBuffer: songBuffer('public/data/songs/formats/mdat.turrican_bonus'),
      smplBuffer: songBuffer('public/data/songs/formats/smpl.turrican_bonus'),
      subsong: 0,
    });
    const loaded = posted.find((m) => m.type === 'moduleLoaded') as { voices?: number; scopeChannels?: number } | undefined;
    expect(loaded?.voices).toBe(4);
    expect(loaded?.scopeChannels).toBe(8);
    await send({ type: 'modulePlay' });

    const peaks = new Array<number>(8).fill(0);
    let widths = 0;
    // Up to two minutes of song, stopping once a track above 3 has sounded.
    for (let block = 0; block < 42000 && peaks.slice(4).every((p) => p === 0); block++) {
      const from = posted.length;
      proc.process([], stereoOutputs(37));
      for (const m of posted.slice(from)) {
        if (!m.channels) continue;
        widths = Math.max(widths, m.channels.length);
        m.channels.forEach((ch, c) => { for (const s of ch) peaks[c] = Math.max(peaks[c], Math.abs(s)); });
      }
    }
    expect(widths).toBe(8);
    expect(Math.max(...peaks.slice(4))).toBeGreaterThan(0);
  }, 120000);
});
