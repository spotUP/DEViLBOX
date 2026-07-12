/**
 * Regression: Dave Lowe was an encode-pattern stub — its variable encoder
 * re-derived a command byte stream from the EDITABLE display grid (note→period
 * word + synthesised duration word), which reproduced only a handful of blocks
 * (matchPct 0.0625).
 *
 * A Dave Lowe section is a per-channel command stream (variable-length word
 * pairs: period+duration, rest+duration, sequence commands), not a fixed grid,
 * so the only faithful byte-exact inverse is a whole-block carrier encoder. The
 * parser now decodes each section into PER-BYTE carrier cells (cutoff=1,
 * period=byte) exposed on `layout.blockRows`, and the encoder concatenates the
 * carriers to reproduce every section verbatim. The display grid stays
 * carrier-less and editable (edits export via the grid re-encode path).
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised
 * stream that differs from the source, so most blocks mismatch and this fails.
 *
 * Fixture: public/data/songs/dave-lowe/incredibleshrinkingsphere.dl (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDaveLoweFile } from '../DaveLoweParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/dave-lowe/incredibleshrinkingsphere.dl');

describe('Dave Lowe pattern codec', () => {
  it('the variable encoder reproduces every command-stream section byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseDaveLoweFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'incredibleshrinkingsphere.dl',
    );
    expect(song, 'parse succeeds').toBeTruthy();
    if (!song) throw new Error('parse failed');

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('daveLowe');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has command-stream sections').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the section is a command stream that
    // straddles the display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per section').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a section with real command bytes (not empty)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      if (size <= 0 || addr < 0 || addr + size > raw.length) continue;

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `section fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one section round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-byte command sections').toBe(true);
  });
});
