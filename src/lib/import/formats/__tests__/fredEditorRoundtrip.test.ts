/**
 * Regression: Fred Editor was an encode-pattern stub — its variable encoder
 * re-derived a command byte stream from the EDITABLE display grid (note +
 * synthesised duration/instrument commands), which does not reproduce the real
 * variable-length pattern stream (matchPct 0.0000: not one block matched).
 *
 * A Fred Editor pattern is a per-channel command stream (note 1-127 / duration /
 * 0x83 set-sample / 0x82 set-speed / 0x81 portamento / 0x84 note-off / 0x80 end),
 * not a fixed grid, so the only faithful byte-exact inverse is a whole-block
 * carrier encoder. The parser now decodes each stream into PER-BYTE carrier cells
 * (cutoff=1, period=byte) exposed on `layout.blockRows`, and
 * `fredEditorEncoder.encodePattern` concatenates the carriers to reproduce every
 * stream verbatim. The display grid stays carrier-less and editable.
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised
 * stream that differs from the source, so no block matches and this fails.
 *
 * Fixture: public/data/songs/formats/bomb jack.fred (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFredEditorFile } from '../FredEditorParser';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/bomb jack.fred');

describe('Fred Editor pattern codec', () => {
  it('the variable encoder reproduces every command-stream pattern byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseFredEditorFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'bomb jack.fred',
    );
    expect(song, 'parse succeeds').toBeTruthy();
    if (!song) throw new Error('parse failed');

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('fredEditor');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has command-stream patterns').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the command stream straddles the
    // display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per pattern').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a pattern with real command bytes (not empty)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      if (size <= 0 || addr < 0 || addr + size > raw.length) continue;

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `pattern fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one pattern round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-byte command patterns').toBe(true);
  });
});
