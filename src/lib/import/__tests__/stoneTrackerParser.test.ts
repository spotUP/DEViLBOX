/**
 * StoneTrackerParser draws the grid of a StoneTracker song, and the import
 * route hands the song plus its SPS bank to the StoneTracker engine.
 *
 * Corpus: hypnosphere.spm + hypnosphere.sps (Aminet stonefree2's
 * SPM./SPS.Hypnosphere): song 1 has 8 tracks, 63 positions, 64-line
 * patterns, BPM 123. Expected cells read from the file with the player's own
 * pattern rules (StonePlayer_Hard.bin $1730; see
 * thoughts/shared/research/2026-10-05_stonetracker-replayer.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStoneTrackerFile, isStoneTrackerFormat, decodeStoneTrackerPattern } from '../formats/StoneTrackerParser';
import { parseModuleToSong } from '../parseModuleToSong';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';

const DIR = resolve(__dirname, '../../../../public/data/songs/stonetracker');
const spm = () => new Uint8Array(readFileSync(resolve(DIR, 'hypnosphere.spm')));
const sps = () => new Uint8Array(readFileSync(resolve(DIR, 'hypnosphere.sps')));

describe('StoneTrackerParser', () => {
  it('draws song 1: eight tracks of notes in position order', () => {
    const song = parseStoneTrackerFile(spm(), 'hypnosphere.spm', sps());
    expect(song.format).toBe('StoneTracker');
    expect(song.numChannels).toBe(8);
    expect(song.songLength).toBe(63);
    expect(song.initialBPM).toBe(123);
    expect(song.patterns.every((p) => p.length === 64 && p.channels.length === 8)).toBe(true);

    // Notes on at least seven of the eight tracks across the song.
    const tracksWithNotes = new Set<number>();
    let notes = 0;
    for (const p of song.patterns) {
      p.channels.forEach((ch, i) => ch.rows.forEach((c) => { if (c.note) { tracksWithNotes.add(i); notes++; } }));
    }
    expect(tracksWithNotes.size).toBeGreaterThanOrEqual(7);
    expect(notes).toBeGreaterThan(1000);

    // Position 0: track 4 plays StoneTracker note 22 (A-2 in ProTracker
    // naming, DEViLBOX note 34) of sample 17 with 0C08 on line 0; track 2's
    // first note is note 26 of sample 14 on line 12.
    const first = song.patterns[song.songPositions[0]];
    expect(first.channels[3].rows[0]).toMatchObject({ note: 34, instrument: 17, effTyp: 0x0c, eff: 0x08 });
    expect(first.channels[1].rows[12]).toMatchObject({ note: 38, instrument: 14 });
    expect(first.channels[1].rows.slice(0, 12).every((c) => c.note === 0)).toBe(true);
    // Track 1's pattern 0 only sets the tempo: 0F7B.
    expect(first.channels[0].rows[0]).toMatchObject({ note: 0, effTyp: 0x0f, eff: 0x7b });

    // Sample names come from the bank.
    expect(song.instruments.find((i) => i.id === 17)?.synthType).toBe('StoneTrackerSynth');
    expect(song.stoneTrackerFileData?.byteLength).toBe(10918);
    expect(song.stoneTrackerSampleData?.byteLength).toBe(440186);
  });

  it('decodes an empty-run word as that row plus n more empty rows', () => {
    // C-1 sample 1 (row end), $FF 02 (empty + 2 more), D-1 sample 2 (row end)
    const bytes = new Uint8Array([0x81, 0x01, 0xff, 0x02, 0x83, 0x02]);
    const rows = decodeStoneTrackerPattern(bytes, 0, 6);
    expect(rows.map((r) => r.note)).toEqual([1, 0, 0, 0, 3, 0]);
  });

  it('refuses a song without its sample bank, naming the file it wants', () => {
    expect(isStoneTrackerFormat(spm())).toBe(true);
    expect(() => parseStoneTrackerFile(spm(), 'hypnosphere.spm')).toThrow(/SPS/);
  });

  it('the import route pairs the bank and the song plays on the StoneTracker engine', async () => {
    const file = new File([spm()], 'hypnosphere.spm');
    const companions = new Map<string, ArrayBuffer>([['hypnosphere.sps', sps().buffer as ArrayBuffer]]);
    const song = await parseModuleToSong(file, 0, undefined, undefined, companions);
    expect(song.format).toBe('StoneTracker');
    expect(song.stoneTrackerSampleData?.byteLength).toBe(440186);
    expect(playingEngineFor(song)).toBe('StoneTracker');
  });
});
