/**
 * Cinter4 decode ↔ encode losslessness proof.
 *
 * `decodeCinter4Music` and `Cinter4Exporter.encodeFromStreams` must be exact inverses:
 * decoding a canonical `.cinter4` file into per-tick streams and re-encoding those
 * streams must reproduce the original songdata byte-for-byte. This is the correctness
 * anchor for editable-Cinter — it holds independently of any pattern representation, so
 * an unedited import round-trips perfectly and edits only change what the user touched.
 *
 * Fixtures are canonical (produced by the current exporter == upstream CinterConvert.py):
 *  - JazzCat-Automatic: has raw instruments (exercises the raw-header path)
 *  - CurtCool-BackInSpace: all-generated (exercises the loop-restart path, restart tick 7)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { decodeCinter4Music, rebuildCinter4Streams, foldCinter4ToPatterns } from '@/lib/import/formats/cinter4Music';
import { encodeFromStreams, encodeCinter4FromSong, type StreamInstrument } from '@/lib/export/Cinter4Exporter';
import type { Pattern } from '@/types/tracker';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const FX = resolve(__dirname, '../../../export/__tests__/fixtures/cinter4');
const read = (name: string) => new Uint8Array(readFileSync(resolve(FX, name)));

// Build the LOSSLESS tick-level representation (speed-1) directly, independent of the
// parser (which now decodes to lossy MOD-like patterns — see the 2026-07-02 plan Rev 2).
// This keeps the decode↔encode round-trip machinery under test on its own terms.
function buildTickSong(bytes: Uint8Array): TrackerSong {
  const d = decodeCinter4Music(bytes)!;
  const folded = foldCinter4ToPatterns(d);
  return {
    name: 'test', format: 'Cinter4', numChannels: 4,
    instruments: [], initialSpeed: 1, initialBPM: 125, linearPeriods: false,
    patterns: folded.patterns as unknown as TrackerSong['patterns'],
    songPositions: folded.songPositions,
    songLength: folded.songPositions.length,
    restartPosition: folded.restartPosition,
    cinter4FileData: new Uint8Array(bytes).buffer as ArrayBuffer,
    cinter4Music: { ticksPerTrack: d.ticksPerTrack, restartTick: d.restartTick },
  } as unknown as TrackerSong;
}

function reencode(bytes: Uint8Array): Uint8Array {
  const d = decodeCinter4Music(bytes);
  if (!d) throw new Error('decode returned null');
  // Instrument accessor: emit each header's stored words verbatim (byte-exact section),
  // in the file's own order (raw-first, then generated).
  // notedata / instListOverride are 1-based (0 = no trigger); header is instHeaders[i-1].
  const instrument = (i: number): StreamInstrument => {
    const h = d.instHeaders[i - 1];
    return {
      version: h.isRaw ? null : 4,
      length: h.words[0],
      repoffset: 0,
      replen: h.words[1],
      params: h.isRaw ? null : [],
      samples: new Uint8Array(0),
      instWords: h.words,
    };
  };
  const r = encodeFromStreams({
    notedata: d.notedata,
    perioddata: d.perioddata,
    volumedata: d.volumedata,
    offsetdata: d.offsetdata,
    stopped: false,
    restart: d.restartTick,
    instrument,
    instListOverride: d.instHeaders.map((_, idx) => idx + 1),
  });
  return r.songdata;
}

describe('Cinter4 decode → encode is byte-exact', () => {
  it('round-trips JazzCat-Automatic (raw instruments) losslessly', () => {
    const orig = read('JazzCat-Automatic.golden.cinter4');
    expect(Array.from(reencode(orig))).toEqual(Array.from(orig));
  });

  it('round-trips CurtCool-BackInSpace (all-generated, looped) losslessly', () => {
    const orig = read('CurtCool-BackInSpace.golden.cinter4');
    expect(Array.from(reencode(orig))).toEqual(Array.from(orig));
  });
});

// Re-encode via the EDITABLE pattern representation: parse → rebuild streams from the
// decompiled patterns → encode. Proves the pattern layer is also lossless, so an
// unedited Cinter import re-exports byte-identically.
function reencodeViaPatterns(bytes: Uint8Array): Uint8Array {
  const song = buildTickSong(bytes);
  const d = decodeCinter4Music(bytes)!;
  const streams = rebuildCinter4Streams(
    song.patterns as unknown as Pattern[],
    song.songPositions,
    song.cinter4Music!.ticksPerTrack,
  );
  const instrument = (i: number): StreamInstrument => {
    const h = d.instHeaders[i - 1];
    return {
      version: h.isRaw ? null : 4,
      length: h.words[0], repoffset: 0, replen: h.words[1],
      params: h.isRaw ? null : [], samples: new Uint8Array(0), instWords: h.words,
    };
  };
  return encodeFromStreams({
    ...streams,
    stopped: false,
    restart: song.cinter4Music!.restartTick,
    instrument,
    instListOverride: d.instHeaders.map((_, idx) => idx + 1),
  }).songdata;
}

describe('Cinter4 tick-level patterns → encode is byte-exact', () => {
  it('round-trips JazzCat-Automatic through the tick-level pattern representation', () => {
    const orig = read('JazzCat-Automatic.golden.cinter4');
    expect(Array.from(reencodeViaPatterns(orig))).toEqual(Array.from(orig));
  });

  it('round-trips CurtCool-BackInSpace through the tick-level pattern representation', () => {
    const orig = read('CurtCool-BackInSpace.golden.cinter4');
    expect(Array.from(reencodeViaPatterns(orig))).toEqual(Array.from(orig));
  });
});

// Full song-level re-export (the path an editor uses): parse → encodeCinter4FromSong.
describe('Cinter4 encodeCinter4FromSong (tick-level song)', () => {
  it('re-exports an unedited BackInSpace tick-level song byte-identically', () => {
    const orig = read('CurtCool-BackInSpace.golden.cinter4');
    const song = buildTickSong(orig);
    expect(Array.from(encodeCinter4FromSong(song).songdata)).toEqual(Array.from(orig));
  });

  it('re-exports an unedited JazzCat tick-level song (raw instruments) byte-identically', () => {
    const orig = read('JazzCat-Automatic.golden.cinter4');
    const song = buildTickSong(orig);
    expect(Array.from(encodeCinter4FromSong(song).songdata)).toEqual(Array.from(orig));
  });

  it('propagates an edited trigger note into the exported songdata', () => {
    const orig = read('CurtCool-BackInSpace.golden.cinter4');
    const song = buildTickSong(orig);
    const before = encodeCinter4FromSong(song).songdata;

    // Find the first trigger cell (instrument != 0) and transpose it by one semitone.
    let edited = false;
    for (const pat of song.patterns as unknown as Pattern[]) {
      for (const ch of pat.channels) {
        for (const cell of ch.rows) {
          if (cell.instrument !== 0 && cell.note > 13 && cell.note < 48) {
            cell.note += 1;
            edited = true;
            break;
          }
        }
        if (edited) break;
      }
      if (edited) break;
    }
    expect(edited).toBe(true);

    const after = encodeCinter4FromSong(song).songdata;
    expect(Array.from(after)).not.toEqual(Array.from(before));
  });
});

// Phase A: MOD-like decompile — recover speed and place every trigger as a note cell on a row.
import { parseCinter4File } from '@/lib/import/formats/Cinter4Parser';
import { recoverCinter4Speed } from '@/lib/import/formats/cinter4Music';

describe('Cinter4 MOD-like decompile (Phase A)', () => {
  for (const name of ['CurtCool-BackInSpace.golden.cinter4', 'JazzCat-Automatic.golden.cinter4']) {
    it(`${name}: folds at recovered speed with no triggers lost`, () => {
      const bytes = read(name);
      const d = decodeCinter4Music(bytes)!;
      const speed = recoverCinter4Speed(d);
      expect(speed).toBeGreaterThan(1); // real Cinter songs are speed 3/6, never per-tick

      // Every trigger in the stream must land on a row boundary (multiple of speed) and
      // become exactly one note cell — no note dropped by the fold.
      let triggers = 0;
      let offRow = 0;
      for (let t = 0; t < 4; t++) {
        for (let i = 0; i < d.notedata[t].length; i++) {
          if (d.notedata[t][i] !== 0) { triggers++; if (i % speed !== 0) offRow++; }
        }
      }
      expect(offRow).toBe(0);

      const song = parseCinter4File(bytes, name)!;
      expect(song.initialSpeed).toBe(speed);
      let noteCells = 0;
      for (const pat of song.patterns as unknown as Pattern[]) {
        for (const ch of pat.channels) {
          for (const cell of ch.rows) if (cell.instrument !== 0) noteCells++;
        }
      }
      expect(noteCells).toBe(triggers);
    });
  }
});

describe('Cinter4 MOD-like decompile (Phase B — effect recovery)', () => {
  it('recovers volume-slide/porta/arp effects with valid effect types', () => {
    const bytes = read('CurtCool-BackInSpace.golden.cinter4');
    const song = parseCinter4File(bytes, 'x')!;
    const VALID = new Set([0x0, 0x1, 0x2, 0x9, 0xa]); // arp, porta up/down, 9xx offset, Axy
    let effectCells = 0;
    let volumeSlides = 0;
    for (const pat of song.patterns as unknown as Pattern[]) {
      for (const ch of pat.channels) {
        for (const cell of ch.rows) {
          if (cell.effTyp !== 0 || cell.eff !== 0) {
            effectCells++;
            expect(VALID.has(cell.effTyp)).toBe(true);
            if (cell.effTyp === 0xa) volumeSlides++;
          }
        }
      }
    }
    // BackInSpace uses volume slides heavily — we must recover a meaningful number.
    expect(volumeSlides).toBeGreaterThan(50);
    expect(effectCells).toBeGreaterThan(50);
  });
});
