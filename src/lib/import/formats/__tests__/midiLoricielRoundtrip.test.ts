/**
 * Regression: MIDI Loriciel (.midi) exposed a STUB pattern layout — a 64-row grid over
 * 4 channels decoded with the generic MOD codec at a fixed offset 1084, so pattern
 * write-back matched 0% of cells and never touched the real MThd/MTrk track stream.
 *
 * A MIDI Loriciel module is a Standard MIDI File: a 14-byte MThd header followed by one
 * or more 'MTrk' chunks (4-byte id + u32BE length + payload) carrying variable-length
 * delta-time + running-status event bytes — no clean note/effect grid. The faithful
 * byte-exact inverse is a per-byte carrier over the located track region: decodeCell
 * stashes the exact source byte in the invisible `period` carrier and
 * encodeMIDILoricielCell reproduces it verbatim.
 *
 * On revert (stub layout at offset 1084 / MOD codec) the encoder rewrites the stream
 * bytes, so the event bytes no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/formats/Michel Winogradoff/MIDI.Bumpy'sArcadeFantasy
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMIDILoricielFile } from '../MIDILoricielParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), "public/data/songs/formats/Michel Winogradoff/MIDI.Bumpy'sArcadeFantasy");

describe('MIDI Loriciel pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every MTrk stream byte', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseMIDILoricielFile(ab, "MIDI.Bumpy'sArcadeFantasy");
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('midiLoriciel');
    // Must point at the real track region, not the stub offset 1084.
    expect(layout.patternDataFileOffset).toBe(14);
    expect(layout.bytesPerCell).toBe(1);
    expect(layout.numChannels).toBe(1);

    let checked = 0;
    let sawHighByte = false; // an event byte the note-only view can't reconstruct
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0x7f) sawHighByte = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawHighByte, 'fixture exercises high event bytes').toBe(true);
  });
});
