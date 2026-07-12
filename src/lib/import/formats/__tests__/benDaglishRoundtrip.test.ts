/**
 * Regression: Ben Daglish was an encode-pattern stub — its variable encoder
 * re-derived a BD track byte stream from the EDITABLE display grid (note→BD
 * note + synthesised duration bytes), which does not reproduce the real
 * variable-length track block (matchPct 0.0000: not one track matched).
 *
 * A BD track is a per-channel command byte stream (note+duration, rest+duration,
 * 0x80+ effect commands up to 4 bytes, 0xFF terminator), not a fixed grid, so
 * the only faithful byte-exact inverse is a whole-block carrier encoder. The
 * parser now decodes each track into PER-BYTE carrier cells (cutoff=1,
 * period=byte) exposed on `layout.blockRows` — per-byte because BD commands run
 * 1..4 bytes, exceeding the 3 dedicated carrier fields — and
 * `benDaglishEncoder.encodePattern` concatenates the carriers to reproduce every
 * track verbatim. The display grid stays carrier-less and editable.
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised
 * stream that differs from the source, so no track matches and this test fails.
 *
 * Fixture: public/data/songs/ben-daglish/motorhead-titleandingame.bd (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBenDaglishFile } from '../BenDaglishParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/ben-daglish/motorhead-titleandingame.bd');

describe('Ben Daglish pattern codec', () => {
  it('the variable encoder reproduces every track block byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseBenDaglishFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'motorhead-titleandingame.bd',
    );
    expect(song, 'parse succeeds').toBeTruthy();

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('benDaglish');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has track blocks').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the BD track is a command stream
    // that straddles the display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per track block').toBe(filePatternAddrs.length);

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
