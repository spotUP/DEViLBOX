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
import { parseSunTronicFile } from '../SunTronicParser';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const load = (name: string): Uint8Array => new Uint8Array(readFileSync(join(CORPUS, name)));
function readFixture(name: string): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

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

describe('SunTronic ghost-gate — arp/effect opcodes surface as grid cells', () => {
  it('ready voice 1: arp/effect opcodes surface as effect cells (no invisible arp)', () => {
    // Before this fix: walkV13Voice emitted emptyV13Cell with no FX columns, so
    // arps/glides/effects played under the native player but were invisible in the
    // grid. After: decodeSunGroup populates effTyp/effTyp2/… for every control
    // opcode, so fxCells.length > 0.
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const ch1 = song.patterns.flatMap(p => p.channels[1].rows);
    const fxCells = ch1.filter(c => c.effTyp !== 0 || (c.effTyp2 ?? 0) !== 0);
    expect(fxCells.length).toBeGreaterThan(0); // arp/effect opcodes are now visible
  });
});

describe('SunTronic effect columns — channelMeta.effectCols exposes every stacked FX slot', () => {
  it('ready: each channel renders as many effect columns as its rows actually use (>1 somewhere)', () => {
    // A SunTronic group stacks up to 5 effects (effTyp..effTyp5). The grid draws
    // channelMeta.effectCols columns per channel; without it only ONE column
    // renders and every extra FX is invisible/uneditable. Assert each channel is
    // sized to the highest effect slot it uses, and at least one voice exceeds 1.
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    const cols = [0, 1, 2, 3].map((ch) => {
      // Highest 1-based effect slot populated anywhere in this channel.
      let used = 1;
      for (const p of song.patterns) {
        for (const c of p.channels[ch].rows) {
          if ((c.effTyp5 ?? 0) !== 0) used = Math.max(used, 5);
          else if ((c.effTyp4 ?? 0) !== 0) used = Math.max(used, 4);
          else if ((c.effTyp3 ?? 0) !== 0) used = Math.max(used, 3);
          else if ((c.effTyp2 ?? 0) !== 0) used = Math.max(used, 2);
        }
      }
      const meta = song.patterns[0].channels[ch].channelMeta;
      expect(meta, `channel ${ch} has channelMeta`).toBeTruthy();
      const declared = meta?.effectCols ?? 0;
      // The grid must render at least as many columns as the channel actually uses.
      expect(declared, `channel ${ch}: effectCols covers used FX slots`).toBeGreaterThanOrEqual(used);
      return declared;
    });
    // Fails-on-revert: drop channelMeta and every effectCols is undefined → 0.
    expect(Math.max(...cols), 'at least one channel exposes multiple FX columns').toBeGreaterThan(1);
  });
});

describe('SunTronic pool byte-exact — blockRows sunRaw concatenation matches blockRawBytes', () => {
  it('concat(sunRaw) === blockRawBytes for ready, ballblaser.src, snake.src', () => {
    // Fixture 'snake' does not exist; use 'snake.src' (present in corpus).
    for (const name of ['ready', 'ballblaser.src', 'snake.src']) {
      const song = parseSunTronicFile(readFixture(name), name);
      const L = song.uadeVariableLayout;
      expect(L, `${name}: variable layout present`).toBeTruthy();
      if (!L) throw new Error(`${name}: no variable layout`);
      expect(L.blockRows, `${name}: blockRows present`).toBeTruthy();
      expect(L.blockRawBytes, `${name}: blockRawBytes present`).toBeTruthy();
      for (let fp = 0; fp < L.numFilePatterns; fp++) {
        const bytes = L.blockRows![fp].flatMap(c => c.sunRaw ?? []);
        expect(bytes, `${name} fp=${fp}: sunRaw concat matches blockRawBytes`).toEqual(
          Array.from(L.blockRawBytes![fp]),
        );
      }
    }
  });
});

describe('SunTronic provenance coverage — every played row is editable (short-block reuse)', () => {
  // Bug 3: a position can reuse a SHORT pool block (e.g. rowCount=1) yet play
  // `rowsPerPos` rows — the per-voice cursor flows past the block end into the
  // FOLLOWING pool blocks. The old stamp guard `r < blocks[fp].rowCount` only
  // stamped rows inside the START block, so every overflow row was decoded,
  // displayed and PLAYED but carried no provenance → uneditable / skipped by
  // reprojectSunGrid (the "hear notes, grid row blank/frozen" ghost). The fix
  // resolves each row's TRUE owning (block,row) from the cursor offset via
  // buildPoolRowIndex. analgestic2 pos 72-83 reuse a rowCount=1 block across
  // 16-row positions — reverting the fix leaves ~200 noted cells unprovenanced.
  it('analgestic2.src — every noted grid cell carries provenance resolving to its pool cell', () => {
    const song = parseSunTronicFile(readFixture('analgestic2.src'), 'analgestic2.src');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const native = (song as any).sunTronicNative;
    expect(native, 'sunTronicNative present').toBeTruthy();

    let unprovenanced = 0;
    let poolMismatch = 0;
    for (const pat of song.patterns) {
      for (let ch = 0; ch < 4; ch++) {
        for (const cell of pat.channels[ch].rows) {
          if (!cell || !cell.note || cell.note <= 0) continue;
          const bi = cell.sunBlockIndex;
          const ri = cell.sunRowInBlock;
          const pos = cell.sunPosition;
          if (bi === undefined || bi < 0 || ri === undefined || pos === undefined) {
            unprovenanced++;
            continue;
          }
          const block = native.blocks[bi];
          if (!block || ri >= block.length) { unprovenanced++; continue; }
          // Pool decodes at transpose 0; display subtracts the position transpose.
          const poolNote: number = block[ri].note;
          const t: number = native.positions[pos].transpose[ch];
          const expected = poolNote === 0 ? 0 : sunPitchToNote(poolNote - 13 - t);
          // Only count as a mismatch when neither side clamps to a rest (0):
          // near the 1..96 boundary the raw-domain clamp legitimately diverges.
          if (expected !== 0 && cell.note !== 0 && expected !== cell.note) poolMismatch++;
        }
      }
    }
    // Every played/displayed note must be routable back to the pool. Reverting
    // the buildPoolRowIndex stamp restores hundreds of unprovenanced cells here.
    expect(unprovenanced, 'noted cells with no pool provenance').toBe(0);
    // And the provenance must point at the CORRECT pool cell (raw pitch matches).
    expect(poolMismatch, 'noted cells whose provenance resolves to a different pitch').toBe(0);
  });
});
