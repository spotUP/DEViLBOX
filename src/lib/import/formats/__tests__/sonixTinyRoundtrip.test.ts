/**
 * Regression: Sonix Music Driver TINY sub-format (tiny.*) used to THROW at parse time
 * ("requires external instrument files; use UADE for playback"), so it had no editable
 * grid and no byte-exact round-trip — only opaque UADE playback.
 *
 * TINY is a synthesis-engine variant whose opcodes DIFFER from SNX (verified against the
 * SonixMusicDriver_v1 ASM + a byte-probe of a real module): 0x80/0x81 are SWAPPED
 * (0x81nn = instrument change, 0x80nn = rest) and the note low byte is DURATION, not
 * volume. Four voice-stream pointers live at file bytes 48/52/56/60 (the 0x140 the
 * detector treats as a marker is voice-0's pointer), and the 4-byte ASCII instrument
 * name table is at 0x40.
 *
 * parseTinyBinary decodes the 4 command streams to a TrackerCell grid and attaches a
 * structural raw-block carrier (blockRawBytes/blockRows) so unedited streams re-export
 * verbatim (byte-exact). On revert (the throw) parseSonixFile rejects the module and
 * both assertions below fail.
 *
 * Fixture: real "It Came From The Desert" main title (maintitle.tiny), 4 valid streams.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSonixFile } from '../SonixMusicDriverParser';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(
  process.cwd(),
  'public/data/songs/sonix/tiny/It Came From The Desert/maintitle.tiny',
);

describe('Sonix TINY sub-format', () => {
  it('decodes an editable 4-voice grid with real notes and named instruments', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await parseSonixFile(ab, 'maintitle.tiny');

    expect(song.numChannels).toBe(4);
    expect(song.name).toContain('[TINY]');

    // Grid deliverable: the decode must surface real notes (not an empty stub grid).
    let noteCells = 0;
    for (const pat of song.patterns) {
      for (const chan of pat.channels) {
        for (const cell of chan.rows) {
          if ((cell.note ?? 0) > 0) noteCells++;
        }
      }
    }
    expect(noteCells, 'grid contains decoded notes').toBeGreaterThan(0);

    // Instrument names come from the 0x40 table (external .instr basenames, e.g. "CE01").
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments.some((i) => /^[A-Za-z]/.test(i.name))).toBe(true);

    // Native playback: file + sidecar wiring rides the same sonixFileData path as SNX.
    expect(song.sonixFileData, 'attaches sonixFileData for the WASM engine').toBeTruthy();
  });

  it('re-exports every unedited voice stream byte-exact via the raw-block carrier', async () => {
    const b = readFileSync(FIXTURE);
    const raw = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const ab = raw.buffer as ArrayBuffer;
    const song = await parseSonixFile(ab, 'maintitle.tiny');

    const layout = song.uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no layout');
    expect(layout.formatId).toBe('sonixMusicDriverTiny');
    expect(layout.blockRawBytes, 'carrier present').toBeTruthy();

    let blocks = 0;
    for (let fp = 0; fp < layout.filePatternAddrs.length; fp++) {
      const addr = layout.filePatternAddrs[fp];
      const size = layout.filePatternSizes[fp];
      if (addr <= 0 || size <= 0 || addr + size > raw.length) continue;
      const orig = raw.subarray(addr, addr + size);
      const rows = layout.blockRows![fp];
      const re = encodeVariableBlock(layout, fp, rows, 0);
      expect([...re], `voice stream ${fp} @${addr}`).toEqual([...orig]);
      blocks++;
    }
    expect(blocks, 'exercised all 4 voice streams').toBe(4);
  });
});
