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

    const { filePatternAddrs, filePatternSizes, trackMap, encoder } = layout;
    expect(filePatternAddrs.length, 'has file-pattern blocks').toBeGreaterThan(0);

    let checked = 0;
    let sawCommands = false; // a block with real command bytes (not just a bare -124)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      let mapped: { tp: number; ch: number } | null = null;
      for (let tp = 0; tp < trackMap.length && !mapped; tp++) {
        const row = trackMap[tp];
        if (!row) continue;
        for (let ch = 0; ch < row.length; ch++) {
          if (row[ch] === fp) { mapped = { tp, ch }; break; }
        }
      }
      expect(mapped, `file-pattern ${fp} is referenced by the trackMap`).toBeTruthy();
      if (!mapped) continue;

      const rows = song.patterns[mapped.tp]?.channels[mapped.ch]?.rows;
      expect(rows, `rows for tp${mapped.tp} ch${mapped.ch}`).toBeTruthy();
      if (!rows) continue;

      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      expect(addr).toBeGreaterThanOrEqual(0);
      expect(size).toBeGreaterThan(0);
      expect(addr + size).toBeLessThanOrEqual(raw.length);

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(rows, mapped.ch);
      expect([...re], `block fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one block round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-command blocks').toBe(true);
  });

  // Regression: RH channels have DIFFERENT track-list lengths and each loops
  // independently (the replayer restarts a channel from block 0 when its list
  // hits the null terminator). The old builder truncated shorter channels —
  // emitting empty rows past their block count — so those channels went silent
  // partway through the song ("missing notes"). The fix wraps each channel with
  // `step % list.length`. This asserts no channel is truncated: every channel
  // that plays any note must still play notes in the final third of the song.
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

    // A channel counts as "active" if it has ANY note anywhere in the song.
    // Split the song into the first third and last third; an active channel
    // that plays in the first third MUST still play in the last third once it
    // loops. On the truncating bug, a short channel is empty in the last third.
    const lastThirdStart = Math.floor((numPatterns * 2) / 3);
    let checkedImbalanced = false;
    for (let ch = 0; ch < numChannels; ch++) {
      let notesEarly = 0;
      let notesLate = 0;
      for (let p = 0; p < numPatterns; p++) {
        const rows = song.patterns[p].channels[ch].rows;
        const n = rows.filter(r => r.note > 0).length;
        if (p < lastThirdStart) notesEarly += n;
        else notesLate += n;
      }
      // trackMap: does this channel loop (repeat a filePattern) within the song?
      const fpsForCh = layout.trackMap.map(row => row[ch]).filter(v => v >= 0);
      const distinct = new Set(fpsForCh).size;
      const loops = fpsForCh.length > distinct; // channel repeated a block => it looped
      if (loops && notesEarly > 0) {
        checkedImbalanced = true;
        expect(notesLate, `channel ${ch} loops but has no notes in the final third (truncated)`).toBeGreaterThan(0);
      }
      // No channel should ever be assigned -1 (silent) if it has any blocks.
      const hasBlocks = layout.trackMap.some(row => row[ch] >= 0);
      if (hasBlocks) {
        const anyMinus1 = layout.trackMap.some(row => row[ch] === -1);
        expect(anyMinus1, `channel ${ch} has silent (-1) steps despite having blocks`).toBe(false);
      }
    }
    expect(checkedImbalanced, 'fixture exercises a looping (shorter) channel').toBe(true);
  });
});
