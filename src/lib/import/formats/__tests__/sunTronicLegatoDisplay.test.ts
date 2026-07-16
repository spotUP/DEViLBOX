/**
 * Regression: SunTronic V1.3 legato pitches (opcode 0x94, "set pitch without
 * retrigger") must appear in the editable grid.
 *
 * BUG: walkV13Voice emitted a note cell only for retrigger bytes (>= 0xB8) and
 * ignored 0x94, which sets the voice pitch WITHOUT a note-on (tone portamento /
 * legato — SunTronicPlayer.controlOpcode case 0x94). Songs whose melody is
 * carried by 0x94 rendered as almost-empty grids: ox.src has only 13 retrigger
 * bytes but 53 0x94 events, snake.src has 134 vs 64. The user reported "snake
 * shows almost no notes and many other songs have notes missing here and there."
 *
 * FIX: walkV13Voice now maps 0x94 to a note cell (same `~arg - transpose` pitch
 * mapping as a note byte) tagged with effTyp 3 (tone portamento) so the glide
 * reads distinctly from a retrigger. Display-only — the byte-exact round-trip
 * uses blockRawBytes carriers and is unaffected (sunTronicRoundtrip.test.ts).
 *
 * Fails on revert: dropping the 0x94 branch removes every tone-porta cell, so
 * the effTyp-3 count falls to zero.
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

describe('SunTronic V1.3 legato (0x94) display', () => {
  it('ox.src — 0x94-driven melody shows as tone-porta notes, not blank rows', () => {
    const song = parseSunTronicFile(loadModule('ox.src'), 'ox.src');

    let tonePortaNotes = 0; // note + effTyp 3 (from 0x94)
    let totalNotes = 0;
    for (const pat of song.patterns) {
      for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (row.note > 0) {
            totalNotes++;
            if (row.effTyp === 3) tonePortaNotes++;
          }
        }
      }
    }

    // ox.src's melody is almost entirely 0x94 (53 events vs 13 retriggers). The
    // grid must surface a substantial number of them — without the fix this is 0.
    expect(tonePortaNotes).toBeGreaterThan(20);
    // A tone-porta note carries the same pitch mapping as a retrigger note, so it
    // must be a valid tracker note, and it must not swallow the retrigger notes.
    expect(totalNotes).toBeGreaterThan(tonePortaNotes);
  });

  it('snake.src — legato notes materialise (grid is not near-empty)', () => {
    const song = parseSunTronicFile(loadModule('snake.src'), 'snake.src');
    const tonePorta = song.patterns.reduce(
      (n, p) => n + p.channels.reduce(
        (m, c) => m + c.rows.filter((r) => r.note > 0 && r.effTyp === 3).length, 0), 0);
    expect(tonePorta).toBeGreaterThan(10);
  });
});
