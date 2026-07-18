/**
 * Regression: SunTronic V1.3 legato pitches (opcode 0x94, "set pitch without
 * retrigger") must surface in the editable grid as tone-portamento EFFECTS —
 * NOT as note-column onsets.
 *
 * HISTORY: an earlier fix made walkV13Voice emit a NOTE cell for every 0x94 so
 * 0x94-driven melodies were no longer blank. That over-corrected: the player
 * (SunTronicPlayer.controlOpcode case 0x94) sets the Paula pitch WITHOUT a
 * note-on, so showing a note there is a phantom the song never plays — the
 * ghost-note the user reported on analgestic2. Worse, a group carrying BOTH a
 * real note byte (>=0xB8) and a 0x94 could show the glide pitch instead of the
 * real onset (first-note-wins), hiding a played note (shades.src ch3).
 *
 * CORRECT contract (verified against the player note-stream oracle,
 * tools/suntronic-re/probe-note-stream.ts): a 0x94 group produces effTyp 3
 * (tone portamento) in a FX column and leaves the note column BLANK. The glide
 * target byte is carried verbatim as the effect param, so the melody is still
 * fully visible and editable — just in the effect lane, where a non-retriggering
 * pitch change belongs.
 *
 * Fails on revert: re-emit 0x94 as a note and these assertions (note===0 on
 * every glide cell) break, and the note-stream oracle diverges from the player.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../SunTronicParser';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');

function loadModule(name: string): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

/** True if the cell carries a tone-porta (effTyp 3) glide in any FX slot. */
function hasGlide(row: { effTyp?: number; effTyp2?: number; effTyp3?: number; effTyp4?: number; effTyp5?: number }): boolean {
  return [row.effTyp, row.effTyp2, row.effTyp3, row.effTyp4, row.effTyp5].some((t) => t === 3);
}

describe('SunTronic V1.3 legato (0x94) display', () => {
  it('ox.src — 0x94 glides surface as tone-porta EFFECTS with a blank note column', () => {
    const song = parseSunTronicFile(loadModule('ox.src'), 'ox.src');

    let glideCells = 0;   // cells carrying effTyp 3 (from 0x94)
    let glideWithNote = 0; // glide cells that ALSO carry a note (must be zero)
    for (const pat of song.patterns) {
      for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (hasGlide(row)) {
            glideCells++;
            if (row.note > 0) glideWithNote++;
          }
        }
      }
    }

    // ox.src's melody is heavily 0x94 (53 events vs 13 retriggers): the glides
    // must be visible as effect columns — without decoding 0x94 this is 0.
    expect(glideCells).toBeGreaterThan(20);
    // A glide is a non-retriggering pitch change: it must NEVER occupy the note
    // column (that was the phantom ghost-note). The player fires no note-on here.
    expect(glideWithNote).toBe(0);
  });

  it('snake.src — legato glides materialise as effects (no phantom notes)', () => {
    const song = parseSunTronicFile(loadModule('snake.src'), 'snake.src');
    let glideCells = 0;
    let glideWithNote = 0;
    for (const pat of song.patterns) {
      for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (hasGlide(row)) {
            glideCells++;
            if (row.note > 0) glideWithNote++;
          }
        }
      }
    }
    expect(glideCells).toBeGreaterThan(10);
    expect(glideWithNote).toBe(0);
  });
});
