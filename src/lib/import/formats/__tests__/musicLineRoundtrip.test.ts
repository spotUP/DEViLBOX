/**
 * Regression: MusicLine was an encode-pattern stub — its variable encoder always
 * emitted the DECOMPRESSED 128×12 PART grid (1536 bytes), but a MusicLine PART is
 * RLE-COMPRESSED on disk, so the file block is smaller and completely different
 * (matchPct 0.0000: not one block matched).
 *
 * The on-disk truth is the compressed PART block, not the decompressed grid, so
 * the only faithful byte-exact inverse is a whole-block carrier encoder. The
 * parser now decodes each block into PER-BYTE carrier cells (cutoff=1, period=byte)
 * exposed on `layout.blockRows`, and `musicLineEncoder.encodePattern` concatenates
 * the carriers to reproduce every compressed block verbatim. The display grid
 * stays carrier-less and editable (edits export via the whole-file builder).
 *
 * On revert (grid re-encode / no blockRows) the encoder emits the 1536-byte
 * decompressed PART that differs from the compressed source, so no block matches
 * and this test fails.
 *
 * Fixture: public/data/songs/formats/harmonic disorder.ml (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMusicLineFile } from '../MusicLineParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/harmonic disorder.ml');

describe('MusicLine pattern codec', () => {
  it('the variable encoder reproduces every compressed PART block byte-for-byte', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseMusicLineFile(raw);
    expect(song, 'parse succeeds').toBeTruthy();
    if (!song) throw new Error('parse failed');

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('musicLine');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has PART blocks').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the PART block is RLE-compressed on
    // disk, not the decompressed grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per PART block').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a block with real command bytes (not empty)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      if (size <= 0 || addr < 0 || addr + size > raw.length) continue;

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `block fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one block round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-byte compressed blocks').toBe(true);
  });
});
