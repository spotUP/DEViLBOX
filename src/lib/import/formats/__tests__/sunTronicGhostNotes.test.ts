/**
 * SunTronic "ghost notes" — notes that PLAY under the native player but were
 * INVISIBLE in the editable pattern grid. Root cause: the grid decode and the
 * audio player were two decoders of the same command stream that disagreed on
 * two things, so the grid dropped notes the player fired.
 *
 * Bug 2 (within-song, this file's main subject): the grid's command-length
 * (sunCommandLen) used FIXED operand widths for 0x9a (vol-slide) and 0x9b (pitch
 * slide), but the real widths are driver-variant-dependent (0x9a +rate byte when
 * volSlideRateFromStream; 0x9b WORD when arpShift>=4). On a variant the fixed
 * table got wrong, the grid walk consumed the wrong number of bytes, desynced
 * from the stream mid-position, stopped groups early and never reached later note
 * bytes — those notes played but had no grid cell. Affected corpus files:
 *   magnum2 / time15   — 0x9a should be 2 bytes (table had 1)
 *   suntronic-30 / tsm-first — 0x9b should be 1 byte (table had 2)
 *
 * Bug 1 (stop-song tail): a 'stop' song past its last position kept a stale
 * cursor and streamed phantom retriggers forever. loadPosition now idles the
 * voice at song end. Asserted here too (time0003).
 *
 * The invariant both assertions lock: EVERY note the player fires is visible in
 * the grid, and the player fires NOTHING past a stop-song's end. Revert either
 * fix (fixed sunCommandLen widths / the loadPosition idle) and this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseSunTronicV13Score,
  sunCommandLen,
  sunPitchToNote,
  type SunV13Score,
} from '../SunTronicV13';
import { SunTronicPlayer } from '../../../../engine/suntronic/SunTronicPlayer';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const load = (name: string): Uint8Array => new Uint8Array(readFileSync(join(CORPUS, name)));

/** Set of `voice:position:rowWithinPosition` keys the editable grid shows a note
 * for. Mirrors walkV13Voice's per-position stream consumption — crucially it goes
 * through the SAME production sunCommandLen, so reverting the width fix desyncs
 * this walk exactly as it desyncs the real grid. */
function gridNoteKeys(score: SunV13Score): Set<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = score as any;
  const h1: Uint8Array = s.h1;
  const bmap: Map<number, number> = s.blockIndexByOffset;
  const sub = s.subsongs[0];
  const widths = { arpShift: s.arpShift, volSlideRateFromStream: s.volSlideRateFromStream };
  const keys = new Set<string>();
  if (!sub) return keys;
  for (let voice = 0; voice < 4; voice++) {
    let rowsPerPos = s.rowsPerPositionDefault;
    for (let posIdx = 0; posIdx < sub.entries.length; posIdx++) {
      const entry = sub.entries[posIdx];
      const ptr = entry.trackPtrs[voice] >>> 0;
      const transpose = entry.transposes[voice];
      const fp = bmap.get(ptr) ?? -1;
      if (fp < 0 || ptr >= h1.length) continue;
      let pos = ptr;
      for (let r = 0; r < rowsPerPos; r++) {
        for (;;) {
          if (pos >= h1.length) break;
          const b = h1[pos];
          const len = sunCommandLen(h1, pos, widths);
          if (b === 0x00) { pos += len; break; }
          if (b >= 0xb8) {
            const note = sunPitchToNote(((~b) & 0xff) - transpose);
            if (note !== 0) keys.add(`${voice}:${posIdx}:${r}`);
          } else if (b === 0x8c || b === 0x8b) {
            const a = h1[pos + 1]; if (a >= 1) rowsPerPos = a;
          }
          pos += len;
        }
      }
    }
  }
  return keys;
}

/** Count player note-fires whose grid cell is absent (real ghost notes), over one
 * loop (voice-0 position wraps to 0). Player tempoNote is incremented before the
 * getNextNote fire (1-based) vs the grid's 0-based r → map row-1. */
function ghostCount(name: string): number {
  const score = parseSunTronicV13Score(load(name));
  const grid = gridNoteKeys(score);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new SunTronicPlayer(score);
  let ghosts = 0;
  player.rowRecorder = (ch: number, position: number, row: number) => {
    if (!grid.has(`${ch}:${position}:${row - 1}`)) ghosts++;
  };
  let started = false, prevPos0 = 0;
  for (let t = 0; t < 30000; t++) {
    player.stepVblankOnce();
    const pos0 = player.debugVoice(0).position;
    if (pos0 > 0) started = true;
    if (started && pos0 === 0 && prevPos0 > 0) break;
    prevPos0 = pos0;
  }
  return ghosts;
}

describe('SunTronic ghost notes — grid shows every note the player fires', () => {
  // Bug 2: variant-dependent 0x9a / 0x9b operand widths.
  it('magnum2.src — 0x9a vol-slide is 2 bytes (volSlideRateFromStream), no ghosts', () => {
    expect(ghostCount('magnum2.src')).toBe(0);
  });
  it('time15.src — 0x9a vol-slide is 2 bytes, no ghosts', () => {
    expect(ghostCount('time15.src')).toBe(0);
  });
  it('suntronic-30.src — 0x9b pitch-slide is 1 byte (arpShift<4), no ghosts', () => {
    expect(ghostCount('suntronic-30.src')).toBe(0);
  });
  it('tsm-first.src — 0x9b pitch-slide is 1 byte, no ghosts', () => {
    expect(ghostCount('tsm-first.src')).toBe(0);
  });
  // Control: files whose fixed widths already matched — stay clean.
  it('ox.src / snake.src — controls stay ghost-free', () => {
    expect(ghostCount('ox.src')).toBe(0);
    expect(ghostCount('snake.src')).toBe(0);
  });
});

describe('SunTronic stop-song tail — no phantom notes past song end', () => {
  it('time0003.src — stop song idles at end, fires nothing past the last position', () => {
    const score = parseSunTronicV13Score(load('time0003.src'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = score as any;
    const nEntries: number = s.subsongs[0].entries.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player: any = new SunTronicPlayer(score);
    let pastEndFires = 0;
    player.rowRecorder = (_ch: number, position: number) => {
      if (position >= nEntries) pastEndFires++;
    };
    for (let t = 0; t < 20000; t++) player.stepVblankOnce();
    expect(pastEndFires).toBe(0);
  });
});
