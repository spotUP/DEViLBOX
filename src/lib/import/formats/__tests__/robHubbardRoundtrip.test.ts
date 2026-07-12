/**
 * Regression: Rob Hubbard was a fake-grid stub — it emitted a tick-quantized
 * 64-row pattern and a fixed UADEPatternLayout whose getCellFileOffset addressed
 * fabricated row-major offsets into 68k player code (the generic decodeMODCell over
 * those offsets round-tripped ~22% of NON-pattern bytes: matchPct 0.2188).
 *
 * A RH "song" is a per-channel command BYTE STREAM, not a cell grid: each channel
 * steps through an ordered list of blocks, and each block is a contiguous run of
 * variable-length commands ending in the -124 marker. There is no per-cell file
 * offset, so the only faithful byte-exact inverse is a whole-block encoder.
 *
 * Fix: the parser now decodes each block into one carrier-bearing TrackerCell per
 * stream command (cutoff=length, period=b0, pan=b1) and exposes a
 * UADEVariablePatternLayout. robHubbardEncoder.encodePattern concatenates the
 * carrier bytes to reproduce every block byte-for-byte.
 *
 * This test replicates the harness's variable round-trip: for every file-pattern it
 * encodes the mapped channel rows and asserts the bytes equal the original block.
 * On revert (fixed stub layout) song.uadeVariableLayout is undefined → this fails.
 *
 * Fixture: public/data/songs/formats/centurion_battle.rh (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRobHubbardFile } from '../RobHubbardParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/centurion_battle.rh');

describe('Rob Hubbard pattern codec', () => {
  it('the variable encoder reproduces every command block byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseRobHubbardFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'centurion_battle.rh',
    );
    expect(song, 'parse succeeds').toBeTruthy();

    const layout = (song as unknown as { uadeVariableLayout?: import('@/engine/uade/UADEPatternEncoder').UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present (NOT the fixed stub)').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('robHubbard');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has file-pattern blocks').toBeGreaterThan(0);
    // The display grid is a shared tick timeline (a channel's block straddles
    // pattern boundaries), so the byte-exact carriers live on the layout's
    // per-block `blockRows`, NOT in the display cells. The encoder reproduces each
    // block from those canonical carrier rows.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per file-pattern').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a block with real command bytes (not just a bare -124)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      expect(addr).toBeGreaterThanOrEqual(0);
      expect(size).toBeGreaterThan(0);
      expect(addr + size).toBeLessThanOrEqual(raw.length);

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `block fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one block round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-command blocks').toBe(true);
  });

  // Regression: RH channels are INDEPENDENT command streams with different track
  // lengths that each loop independently. The old builder command-indexed the grid
  // (one row per command, one pattern per block-step), which (a) truncated shorter
  // channels so they went silent ("missing notes") and (b) collapsed the grid so a
  // sustained voice showed a few rows then blank under a tick-driven playhead
  // ("hear bass, see no notes"). The tick-timeline builder lays every channel on a
  // shared tick grid, looping each to fill the song, so no active voice ever goes
  // silent in the final third.
  it('every channel loops for the full song (no channel goes silent)', async () => {
    // skateordie.rh has strongly imbalanced channel track-lists ([152,1,75,39]),
    // so it exercises the independent per-channel looping (centurion_battle.rh is
    // a single-pattern module and would not).
    const LOOP_FIXTURE = join(process.cwd(), 'public/data/songs/rob-hubbard/skateordie.rh');
    const raw = new Uint8Array(readFileSync(LOOP_FIXTURE));
    const song = await parseRobHubbardFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'skateordie.rh',
    );
    const layout = (song as unknown as { uadeVariableLayout?: import('@/engine/uade/UADEPatternEncoder').UADEVariablePatternLayout }).uadeVariableLayout;
    if (!layout) throw new Error('no variable layout');

    const numPatterns = song.patterns.length;
    const numChannels = song.patterns[0]?.channels.length ?? 0;
    expect(numPatterns, 'multi-pattern song').toBeGreaterThan(1);

    // A channel counts as "active" if it plays any note anywhere. An active channel
    // that plays in the first third MUST still play in the last third once it loops.
    // On the truncating bug, a short channel is empty in the last third.
    const lastThirdStart = Math.floor((numPatterns * 2) / 3);
    let checkedActive = false;
    for (let ch = 0; ch < numChannels; ch++) {
      let notesEarly = 0;
      let notesLate = 0;
      for (let p = 0; p < numPatterns; p++) {
        const rows = song.patterns[p].channels[ch].rows;
        const n = rows.filter(r => r.note > 0).length;
        if (p < lastThirdStart) notesEarly += n;
        else notesLate += n;
      }
      if (notesEarly > 0) {
        checkedActive = true;
        expect(notesLate, `channel ${ch} plays early but is silent in the final third`).toBeGreaterThan(0);
      }
    }
    expect(checkedActive, 'fixture exercises an active channel').toBe(true);
  });

  // Regression for "hear bass, see no notes": a sustained note must occupy its
  // full duration on the tick grid (note-on cell then blank continuation rows),
  // so the tick-driven playhead sweeps rows that sit under the sounding note. The
  // old command-indexed grid packed notes into adjacent rows regardless of
  // duration, so a long note showed one row then blank while it kept sounding.
  it('lays notes on a real tick timeline (sustained notes span their duration)', async () => {
    const LOOP_FIXTURE = join(process.cwd(), 'public/data/songs/rob-hubbard/skateordie.rh');
    const raw = new Uint8Array(readFileSync(LOOP_FIXTURE));
    const song = await parseRobHubbardFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'skateordie.rh',
    );
    const layout = (song as unknown as { uadeVariableLayout?: import('@/engine/uade/UADEPatternEncoder').UADEVariablePatternLayout }).uadeVariableLayout;
    if (!layout?.blockRows) throw new Error('no blockRows');

    // Patterns are fixed 64-row slices of the shared timeline.
    for (const p of song.patterns) {
      expect(p.length, 'fixed tick-slice height').toBe(64);
      for (const ch of p.channels) expect(ch.rows.length).toBe(64);
    }

    // Flatten one channel's whole timeline and find a note followed by at least one
    // blank continuation row — proof that duration is honoured (not one-row-per-cmd).
    // At least one block in the module must carry a multi-tick note.
    const hasMultiTickNote = layout.blockRows.some(rows =>
      rows.some(c => c.cutoff !== undefined && (c.period ?? 0) < 128 && (c.period ?? 0) > 1),
    );
    expect(hasMultiTickNote, 'fixture has a note longer than one tick').toBe(true);

    let sawSustainGap = false;
    for (let ch = 0; ch < song.patterns[0].channels.length && !sawSustainGap; ch++) {
      const flat = song.patterns.flatMap(p => p.channels[ch].rows);
      for (let i = 0; i < flat.length - 1; i++) {
        if (flat[i].note > 0 && flat[i].note !== 97 && flat[i + 1].note === 0) {
          sawSustainGap = true;
          break;
        }
      }
    }
    expect(sawSustainGap, 'a note is followed by a blank continuation row (sustained)').toBe(true);
  });
});
