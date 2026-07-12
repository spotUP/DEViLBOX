/**
 * Regression: Jochen Hippel CoSo was an encode-pattern stub — its variable
 * encoder re-derived a CoSo byte stream from the EDITABLE display grid
 * (xmNoteToCoSo + a synthesised info byte), which does not reproduce the real
 * variable-length pattern block (matchPct 0.0000: not one block matched).
 *
 * A CoSo pattern is a per-channel command byte stream (note = note+info[+infoPrev],
 * -1 = end, -2/-3 = repeat), not a fixed grid, so the only faithful byte-exact
 * inverse is a whole-block carrier encoder. The parser now decodes each block
 * into carrier-bearing cells (cutoff=len, period=b0, pan=b1, resonance=b2) exposed
 * on `layout.blockRows`, and `hippelCoSoEncoder.encodePattern` concatenates the
 * carriers to reproduce every block verbatim. The display grid stays carrier-less
 * and editable (edits export via buildCoSoFile, a separate path).
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised stream
 * that differs from the source, so no block matches and this test fails.
 *
 * Fixture: public/data/songs/formats/prehistoric_tale.hipc (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHippelCoSoFile } from '../HippelCoSoParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/prehistoric_tale.hipc');

describe('Hippel CoSo pattern codec', () => {
  it('the variable encoder reproduces every pattern block byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseHippelCoSoFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'prehistoric_tale.hipc',
    );
    expect(song, 'parse succeeds').toBeTruthy();

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('hippelCoSo');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has file-pattern blocks').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the CoSo block is a command stream
    // that straddles the display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per file-pattern').toBe(filePatternAddrs.length);

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
    expect(sawCommands, 'fixture exercises multi-byte command blocks').toBe(true);
  });
});
