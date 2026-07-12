/**
 * Regression: Music Assembler was an encode-pattern stub — its variable encoder
 * re-derived a command byte stream from the EDITABLE display grid (note +
 * synthesised instrument/delay events), which does not reproduce the real
 * variable-length track stream (matchPct 0.0000: not one track matched).
 *
 * A Music Assembler track is a per-channel command stream (events run 1..4 bytes
 * — note / release / instrument+note — with a 0xff terminator), not a fixed grid,
 * so the only faithful byte-exact inverse is a whole-block carrier encoder. The
 * parser now decodes each track into PER-BYTE carrier cells (cutoff=1, period=byte)
 * exposed on `layout.blockRows`, and `musicAssemblerEncoder.encodePattern`
 * concatenates the carriers to reproduce every track verbatim. The display grid
 * stays carrier-less and editable.
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised
 * stream that differs from the source, so no track matches and this fails.
 *
 * Fixture: public/data/songs/music-assembler/thanatos.ma (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMusicAssemblerFile } from '../MusicAssemblerParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/music-assembler/thanatos.ma');

describe('Music Assembler pattern codec', () => {
  it('the variable encoder reproduces every command-stream track byte-for-byte', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseMusicAssemblerFile(raw, 'thanatos.ma');
    expect(song, 'parse succeeds').toBeTruthy();
    if (!song) throw new Error('parse failed');

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('musicAssembler');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has command-stream tracks').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the command stream straddles the
    // display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per track').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a track with real command bytes (not empty)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      if (size <= 0 || addr < 0 || addr + size > raw.length) continue;

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `track fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one track round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-byte command tracks').toBe(true);
  });
});
