/**
 * TFMX grid columns are Paula voices, not trackstep tracks (owner report: "the notes in channel 4
 * for the drums are missing completely", mdat.turrican_bonus). The decoder sends every note to the
 * voice its command names (Chris/TFMXDecoder.cpp noteCmd: channelToVoiceMap[cd & 7], AND 3 for a
 * four-voice module), so Turrican's drum patterns, which sit on tracks 0-2, play on voice 3. The
 * grid must show each note in the column of the voice that sounds it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';

const DIR = resolve(import.meta.dirname, '../../../../public/data/songs/formats');

/** Notes per voice in one TFMX pattern, read from the raw bytes the way the decoder routes them. */
function rawNotesPerVoice(mdat: Uint8Array, patternOffset: number): number[] {
  const perVoice = [0, 0, 0, 0];
  for (let o = patternOffset, i = 0; i < 512 && o + 4 <= mdat.length; i++, o += 4) {
    const aa = mdat[o];
    if (aa === 0xF0 || aa === 0xF4) break;
    if (aa < 0xF0) perVoice[mdat[o + 2] & 3]++;
  }
  return perVoice;
}

describe('TFMX grid: a note sits in the column of the voice it plays on (mdat.turrican_bonus)', () => {
  it('every voice of every step shows the notes the decoder plays on it', async () => {
    const mdatBytes = readFileSync(resolve(DIR, 'mdat.turrican_bonus'));
    const smplBytes = readFileSync(resolve(DIR, 'smpl.turrican_bonus'));
    const mdat = new Uint8Array(mdatBytes);
    const companions = new Map<string, ArrayBuffer>([['smpl.turrican_bonus', smplBytes.buffer.slice(smplBytes.byteOffset, smplBytes.byteOffset + smplBytes.byteLength) as ArrayBuffer]]);
    const file = new File([mdatBytes], 'mdat.turrican_bonus');
    const song = await parseModuleToSong(file, undefined, undefined, undefined, companions);

    const native = song.tfmxNative!;
    expect(native).toBeDefined();
    let voice3Notes = 0;
    native.gridSteps.forEach((step, gridPattern) => {
      const entry = native.tracksteps.find((t) => t.stepIndex === step)!;
      const expected = [0, 0, 0, 0];
      entry.voices.forEach((v) => {
        if (v.patternNum < 0) return;
        rawNotesPerVoice(mdat, native.patternPointers[v.patternNum]).forEach((n, voice) => { expected[voice] += n; });
      });
      const shown = song.patterns[gridPattern].channels.slice(0, 4).map((c) => c.rows.filter((r) => r.note > 0 && r.note < 97).length);
      expect({ step, shown }).toEqual({ step, shown: expected });
      voice3Notes += shown[3];
    });
    // The drums: voice 3 (the owner's "channel 4") carries notes.
    expect(voice3Notes).toBeGreaterThan(0);
    expect(song.patterns[1].channels[3].rows.some((r) => r.note > 0)).toBe(true);
  }, 60_000);
});
