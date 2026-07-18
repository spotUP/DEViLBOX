/**
 * Regression: SunTronic V1.3 grid note-onsets must match the native player's
 * fire order EXACTLY — no phantom ("ghost") notes shown that the song never
 * plays, and no played onset silently dropped.
 *
 * COORDINATE-FREE ORACLE: the editable grid (walkV13Voice) and the audio player
 * (SunTronicPlayer) decode the SAME command stream. If the grid is display-
 * accurate, the ORDERED per-voice sequence of note-on pitches they produce is
 * identical — no position/row keying needed, just stream order.
 *
 * The bug (reported on analgestic2.src): walkV13Voice OVER-emitted notes:
 *   1. a pitch byte with no instrument ever staged (player note-on gate:
 *      stagedSel==0) set the Paula period only — silent — yet the grid showed a
 *      fresh note (phantom); and
 *   2. a 0x94 tone-porta glide (set-pitch-no-retrigger) fired NO note-on in the
 *      player but was shown as a note.
 * decodeSunGroup now gates the note column on a staged instrument (curInstr!=0)
 * and demotes 0x94 to an effect-only column, so the grid emits exactly the
 * player's onsets.
 *
 * Fails on revert: drop the curInstr note-gate or re-emit 0x94 as a note and
 * analgestic2 diverges (grid onsets != player onsets) on every voice.
 *
 * gliders.src / ballblaser.src are byte-exact controls — they must stay MATCH
 * so the gate can't over-correct and start dropping real onsets.
 */
import { describe, it, expect } from 'vitest';
import { readFixture } from './sunTestUtil';
import { parseSunTronicFile } from '../SunTronicParser';
import { parseSunTronicV13Score, sunPitchToNote } from '../SunTronicV13';
import { SunTronicPlayer } from '../../../../engine/suntronic/SunTronicPlayer';

/** Ordered per-voice note-on pitch sequences: grid (walk) vs player (fire). */
function noteStreams(name: string): { grid: number[][]; play: number[][] } {
  const ab = readFixture(name);
  // Grid: pattern rows are already in stream order per voice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const song: any = parseSunTronicFile(ab, name);
  const grid: number[][] = [[], [], [], []];
  for (const pat of song.patterns) {
    for (let ch = 0; ch < Math.min(4, pat.channels.length); ch++) {
      for (const cell of pat.channels[ch].rows) {
        if (cell && cell.note && cell.note > 0) grid[ch].push(cell.note);
      }
    }
  }

  // Player: fire order via rowRecorder, one CIA loop (stop at position wrap).
  const score = parseSunTronicV13Score(new Uint8Array(ab));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new SunTronicPlayer(score);
  const play: number[][] = [[], [], [], []];
  player.rowRecorder = (ch: number, _pos: number, _row: number, note: number) => {
    if (ch >= 0 && ch < 4) play[ch].push(sunPitchToNote(note));
  };
  let started = false;
  let prevPos0 = 0;
  for (let t = 0; t < 200000; t++) {
    player.stepVblankOnce();
    const pos0 = player.debugVoice(0).position;
    if (pos0 > 0) started = true;
    if (started && pos0 === 0 && prevPos0 > 0) break;
    prevPos0 = pos0;
  }
  return { grid, play };
}

/** Length of the identical ordered prefix, then a MATCH/DIVERGE verdict. */
function verdict(g: number[], p: number[]): { match: boolean; at: number } {
  let i = 0;
  while (i < g.length && i < p.length && g[i] === p[i]) i++;
  return { match: i === g.length && i === p.length, at: i };
}

describe('SunTronic V1.3 ghost-note oracle — grid onsets == player onsets', () => {
  it('analgestic2.src — every voice matches the player fire order (no phantoms)', () => {
    const { grid, play } = noteStreams('analgestic2.src');
    for (let ch = 0; ch < 4; ch++) {
      const v = verdict(grid[ch], play[ch]);
      expect(
        v.match,
        `ch${ch} diverged at ${v.at}: grid ${grid[ch].length} onsets, player ${play[ch].length} onsets`,
      ).toBe(true);
    }
  });

  for (const control of ['gliders.src', 'ballblaser.src']) {
    it(`${control} — byte-exact control stays MATCH (gate does not drop onsets)`, () => {
      const { grid, play } = noteStreams(control);
      for (let ch = 0; ch < 4; ch++) {
        const v = verdict(grid[ch], play[ch]);
        expect(
          v.match,
          `ch${ch} diverged at ${v.at}: grid ${grid[ch].length} onsets, player ${play[ch].length} onsets`,
        ).toBe(true);
      }
    });
  }
});
