/**
 * davidWhittakerEdits.ts - write the tick grid's edits back into the David Whittaker module.
 *
 * The grid (davidWhittakerGrid.ts) is the replayer's own walk: every cell is made of walk events,
 * and every event names the file byte of the command that ran (block + pos). An edited cell is
 * therefore a byte patch, in place, never a re-pack:
 *   - note: the note byte of the command that played it, the byte that plays the named pitch with the cell's sample
 *     (davidWhittakerPitch.ts, the same map the grid names it by);
 *   - instrument: the sample-change command that was in force for that note (its byte is
 *     sampleBase + index, the base read off the module's own byte and the replayer's index);
 *   - a removed note: the mute command (0x82) over the note byte, same length, same timing (a rest);
 *   - an effect column: the argument byte(s) of the command that ran, or the index inside an
 *     envelope / arpeggio select byte.
 * A command is shared by every tick that replays its block, so an edit shows wherever the block
 * plays: that is the module's structure, not a copy. Edits that would change a block's length
 * (a note where the replayer ran none, a different command) cannot be written in
 * place and come back as warnings, never as a half-edit.
 */
import type { Pattern } from '@/types';
import { DW_FX } from './davidWhittakerEffectGlyphs';
import { DW_WALK, type DwWalk, type DwWalkEvent } from './DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, dwEventEffects, dwRowClock, FX_SPEED, SLOT_KEYS } from './davidWhittakerGrid';
import type { RowClock } from './stepRowClock';
import { dwNoteToByte, dwWalkTransposes, type DwTransposes } from './davidWhittakerPitch';

const ROWS_PER_PATTERN = 64;
const NO_BLOCK = 0xffffffff;
const SLOTS = SLOT_KEYS;

export interface DwEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

type CellRec = Record<string, number | undefined>;

/** Where in the command (relative to its command byte) the argument an effect id edits lives; null: not editable in place. */
function argOffset(typ: number): number | null {
  switch (typ) {
    case DW_FX.slideSpeed: case DW_FX.vibratoSpeed: return 1;
    case DW_FX.slideDelay: case DW_FX.vibratoDepth: return 2;
    case DW_FX.globalTranspose: case DW_FX.channelTranspose: case DW_FX.volumeFade:
    case DW_FX.globalVolumeFade: case DW_FX.globalVolume: case FX_SPEED: case DW_FX.delaySpeed:
    case DW_FX.soundEffect:
      return 1;
    default: return null;
  }
}

/** The commands that end a read run and time themselves with the wait in force: a note, a mute (0x82) and a hold (0x83). */
function isNoteSlot(e: DwWalkEvent): boolean {
  return e.kind === DW_WALK.note || e.kind === DW_WALK.mute || e.kind === DW_WALK.waitRow;
}

/** A note put on a row the replayer runs no note on (G5). */
interface DwAdd { ch: number; row: number; note: number; instrument: number; where: string }

/** The mute track command: 0x80 | effect 2 (DW_EFFECT_MUTE). Silences the voice and, like a note, ends the read run. */
const DW_MUTE_BYTE = 0x82;

/** Wait commands are 0xe0 + units - 1 (1..32 speed units). */
const WAIT_BASE = 0xdf;

/**
 * Notes on rows no note starts on. A note command ends a read run and times itself with the wait in force (a wait
 * persists until the next one), so a note put inside the note covering its row is made by splitting that note:
 *   [wait D][A]            ->  [wait k][A][wait D-k][Z][wait D]
 * A keeps its start and lasts k rows, Z starts on the row and lasts the rest, and the final wait puts the duration back
 * for the notes that follow and rely on it. A different instrument for Z is a sample command before it and the sample
 * in force after it. The block grows, so it is copied to the end of the module and every position-list entry that names
 * it is repointed (the loader finds a track by the offset its entry holds; the old copy stays unused).
 */
function growBlocks(
  source: Uint8Array, walk: DwWalk, clock: RowClock, adds: DwAdd[], noteSample: Map<DwWalkEvent, DwWalkEvent | null>, warnings: string[],
  transposes: Map<DwWalkEvent, DwTransposes>,
): { data: Uint8Array; patched: number } {
  const { layout } = walk;
  if (layout.oldPlayer) { for (const a of adds) warnings.push(`${a.where}: this player's notes carry their sample; not written`); return { data: source, patched: 0 }; }
  const byBlock = new Map<number, Array<{ pos: number; before: number[]; after: number[] }>>();
  const taken = new Set<DwWalkEvent>();
  // The speed in force at a tick: the last speed command at or before it, else the subsong's.
  const speedAt = (tick: number): number => {
    let sp = walk.speed;
    for (const e of walk.events) { if (e.ptick > tick) break; if (e.kind === DW_WALK.speed) sp = e.a; }
    return sp;
  };
  for (const a of adds) {
    const aTick = clock.rowToTick(a.row);
    // The note running on the voice at the row (the last one that started before it) and the wait in force when it started.
    let coverIdx = -1;
    for (let i = 0; i < walk.events.length; i++) {
      const e = walk.events[i];
      if (e.channel !== a.ch || e.block === NO_BLOCK) continue;
      if (e.ptick >= aTick) break;
      if (isNoteSlot(e)) coverIdx = i;
    }
    const cover = coverIdx >= 0 ? walk.events[coverIdx] : null;
    let wait: DwWalkEvent | null = null;
    for (let i = 0; i < coverIdx; i++) if (walk.events[i].channel === a.ch && walk.events[i].kind === DW_WALK.wait) wait = walk.events[i];
    if (!cover || !wait) { warnings.push(`${a.where}: no note of this voice covers the row, so there is nothing to split; not written`); continue; }
    if (taken.has(cover)) { warnings.push(`${a.where}: the note covering this row is already split by another edit; not written`); continue; }
    const speed = speedAt(cover.ptick);
    const durationUnits = wait.a;                     // the wait in force is the one last read at or before the covering note
    if (speedAt(aTick) !== speed || speedAt(wait.ptick) !== speed) { warnings.push(`${a.where}: the speed changes inside the note covering this row; not written`); continue; }
    const k = aTick - cover.ptick;
    if (k % speed !== 0) { warnings.push(`${a.where}: the note covering this row lasts in speed units of ${speed} ticks; this row is between them; not written`); continue; }
    const ku = k / speed;
    const rest = durationUnits - ku;
    if (ku < 1 || rest < 1 || durationUnits > 32) { warnings.push(`${a.where}: the row is outside the covering note's ${durationUnits} unit wait; not written`); continue; }
    // The sample for Z: the one in force at the covering note unless the typed instrument is another.
    const inForce = noteSample.get(cover) ?? null;
    const zSample = a.instrument > 0 ? a.instrument - 1 : cover.kind === DW_WALK.note ? cover.a : (inForce?.a ?? -1);
    const noteByte = dwNoteToByte(layout.pitch, a.note, zSample, transposes.get(cover));
    if (noteByte === null) { warnings.push(`${a.where}: no note byte plays ${a.note} with sample ${zSample + 1}; not written`); continue; }
    const middle: number[] = [];
    const afterZ: number[] = [];
    if (a.instrument > 0 && inForce && a.instrument - 1 !== inForce.a) {
      const sampleBase = (source[cover.block + inForce.pos] ?? 0) - inForce.a;
      if (a.instrument > walk.samples) { warnings.push(`${a.where}: instrument ${a.instrument} is not one of the module's ${walk.samples} samples; not written`); continue; }
      middle.push((sampleBase + a.instrument - 1) & 0xff);
      afterZ.push((sampleBase + inForce.a) & 0xff);
    } else if (a.instrument > 0 && !inForce) {
      warnings.push(`${a.where}: no sample command is in force for the covering note, so the instrument cannot be set; not written`); continue;
    }
    taken.add(cover);
    const list = byBlock.get(cover.block) ?? [];
    list.push({
      pos: cover.pos,
      before: [WAIT_BASE + ku],
      after: [WAIT_BASE + rest, ...middle, noteByte, ...afterZ, WAIT_BASE + durationUnits],
    });
    byBlock.set(cover.block, list);
  }

  let data = source;
  let patched = 0;
  for (const [block, inserts] of byBlock) {
    const track = layout.tracks.find((t) => t.offset === block);
    if (!track) { warnings.push(`block ${block}: the module's layout does not list it; not written`); continue; }
    const bytes = Array.from(data.slice(block, block + track.length));
    // Insert behind later positions first, so the earlier positions stay valid.
    for (const ins of inserts.sort((x, y) => y.pos - x.pos)) {
      bytes.splice(ins.pos + 1, 0, ...ins.after);
      bytes.splice(ins.pos, 0, ...ins.before);
    }
    const at = data.length;
    const pointer = at - layout.startOffset;
    if (layout.pointerWidth === 2 && pointer >= 0x8000) { warnings.push(`block ${block}: the grown track would lie past the 32 KiB a 16-bit pointer reaches; not written`); continue; }
    // Two spare bytes behind the block: the loader treats a read that ends exactly at the end of the file as a failure.
    const next = new Uint8Array(data.length + bytes.length + 2);
    next.set(data);
    next.set(bytes, at);
    for (const e of layout.entries) {
      if (e.track !== block) continue;
      for (let i = 0; i < layout.pointerWidth; i++) next[e.at + i] = (pointer >>> (8 * (layout.pointerWidth - 1 - i))) & 0xff;
    }
    data = next;
    patched += bytes.length;
  }
  return { data, patched };
}

/**
 * Apply the differences between `edited` (the grid as it is now) and the grid the module's own walk
 * draws to the module bytes. `walk` is the walk of `source`.
 */
export function applyDwGridEdits(source: Uint8Array, walk: DwWalk, edited: Pattern[]): DwEditResult {
  const base = buildDWGridFromWalk(walk).patterns;
  const clock = dwRowClock(walk);
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    if (off < 0 || off >= out.length) { warnings.push(`${why}: byte ${off} is outside the module`); return; }
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same command byte, kept the first`); return; }
    wanted.set(off, { value: value & 0xff, why });
  };

  // events by (channel, row), in execution order; the sample command in force per note
  const at = new Map<string, DwWalkEvent[]>();
  const lastSample: Array<DwWalkEvent | null> = new Array(Math.max(1, walk.channels)).fill(null);
  const noteSample = new Map<DwWalkEvent, DwWalkEvent | null>();
  for (const e of walk.events) {
    if (e.channel >= walk.channels) continue;
    const key = `${e.channel}:${clock.tickToRow(e.ptick).row}`;
    const list = at.get(key);
    if (list) list.push(e); else at.set(key, [e]);
    if (e.kind === DW_WALK.sample) lastSample[e.channel] = e;
    else if (isNoteSlot(e)) noteSample.set(e, lastSample[e.channel]);
  }
  const adds: DwAdd[] = [];
  const restedCells = new Set<string>();   // cells whose note became a mute: the sample no longer plays, its instrument is moot
  const transposes = dwWalkTransposes(walk);
  const cmdOffset = (e: DwWalkEvent): number => (e.block === NO_BLOCK ? -1 : e.block + e.pos);

  for (let p = 0; p < edited.length; p++) {
    if (p >= base.length) { warnings.push(`pattern ${p} is past the end of the module's walk; not written`); continue; }
    const bp = base[p];
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length && row < ROWS_PER_PATTERN; row++) {
        const b = bp.channels[ch].rows[row] as unknown as CellRec;
        const c = eRows[row] as unknown as CellRec | undefined;
        if (!c) continue;
        const events = at.get(`${ch}:${p * ROWS_PER_PATTERN + row}`) ?? [];
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        // A mute or a hold is a note slot too: one byte that ends the read run and times itself with the wait in force, so
        // a typed note replaces it in place (the New Song template is all holds; a note-off row is a mute).
        const noteEv = events.find((e) => e.kind === DW_WALK.note) ?? events.find((e) => e.kind === DW_WALK.mute) ?? events.find((e) => e.kind === DW_WALK.waitRow);

        if ((c.note ?? 0) !== (b.note ?? 0)) {
          const n = c.note ?? 0;
          if (!noteEv) {
            if (n >= 1 && n <= 96 && (b.note ?? 0) === 0) adds.push({ ch, row: p * ROWS_PER_PATTERN + row, note: n, instrument: c.instrument ?? 0, where });
            else warnings.push(`${where}: a note removed or turned into a note-off needs a different command; not written`);
          }
          else if (n < 1 || n > 96) {
            // A note removed or turned into a note-off is the mute command (0x82, effect 2 of the track command table,
            // davidwhittaker.c do_effects DW_EFFECT_MUTE): one byte that ends the read run and times itself with the wait in
            // force, exactly like the note byte it replaces, so the block keeps its length and the later notes their ticks.
            // The old player has no mute command (a zero note mutes there), so nothing is written for it.
            if (noteEv.kind !== DW_WALK.note) warnings.push(`${where}: a note removed or turned into a note-off needs a different command; not written`);
            else if (walk.layout.oldPlayer) warnings.push(`${where}: this player has no mute command; not written`);
            else { want(cmdOffset(noteEv), DW_MUTE_BYTE, `${where} note removed`); restedCells.add(where); }
          }
          else {
            const ins = c.instrument ?? 0;
            const sample = ins > 0 ? ins - 1 : noteEv.kind === DW_WALK.note ? noteEv.a : (noteSample.get(noteEv)?.a ?? -1);
            const byte = dwNoteToByte(walk.layout.pitch, n, sample, transposes.get(noteEv));
            if (byte === null) warnings.push(`${where}: no note byte plays ${n} with sample ${sample + 1}; not written`);
            else want(cmdOffset(noteEv), byte, `${where} note`);
          }
        }
        if ((c.instrument ?? 0) !== (b.instrument ?? 0) && !restedCells.has(where)) {
          const ins = c.instrument ?? 0;
          const sc = noteEv ? noteSample.get(noteEv) : null;
          if (!noteEv) { if (!adds.some((a) => a.where === where)) warnings.push(`${where}: an instrument without a note is not part of the module; not written`); }
          else if (!sc) warnings.push(`${where}: no sample-change command is in force for this note (old player or the voice's first sample); not written`);
          else if (ins < 1 || ins > walk.samples) warnings.push(`${where}: instrument ${ins} is not one of the module's ${walk.samples} samples; not written`);
          else {
            const off = cmdOffset(sc);
            const sampleBase = (source[off] ?? 0) - sc.a;
            want(off, sampleBase + ins - 1, `${where} instrument`);
          }
        }
        // effect columns: slot k of the cell is the k-th effect the events of the tick showed
        const fxEvents: Array<{ e: DwWalkEvent; typ: number }> = [];
        // the row offset leads the list when the cell's commands ran past the row's first tick (as the grid draws it)
        if (events.length > 0 && clock.tickToRow(events[0].ptick).offset > 0) fxEvents.push({ e: events[0], typ: DW_FX.rowOffset });
        for (const e of events) for (const [typ] of dwEventEffects(e)) fxEvents.push({ e, typ });
        for (let s = 0; s < SLOTS.length; s++) {
          const [kt, kv] = SLOTS[s];
          const bt = b[kt] ?? 0, bv = b[kv] ?? 0, ct = c[kt] ?? 0, cv = c[kv] ?? 0;
          if (bt === ct && bv === cv) continue;
          const src = fxEvents[s];
          if (!src || bt !== ct) { warnings.push(`${where}: effect column ${s + 1} changed to another command; not written`); continue; }
          const off = cmdOffset(src.e);
          if (src.typ === DW_FX.envelope || src.typ === DW_FX.arpeggio) {
            const idxBase = (source[off] ?? 0) - src.e.a;
            const nb = idxBase + (cv & 0xff);
            if (nb < idxBase || nb >= 0xe0) warnings.push(`${where}: ${cv} is past the select range; not written`);
            else want(off, nb, `${where} effect ${s + 1}`);
            continue;
          }
          const a = argOffset(src.typ);
          if (src.typ === FX_SPEED && (cv < 1 || cv > 31)) warnings.push(`${where}: speed ${cv} is outside 1..31; not written`);
          else if (a === null) warnings.push(`${where}: this command carries no argument byte; not written`);
          else want(off + a, cv, `${where} effect ${s + 1}`);
        }
      }
    }
  }

  let patched = 0;
  for (const [off, { value }] of wanted) {
    if (out[off] !== value) { out[off] = value; patched++; }
  }
  if (adds.length > 0) {
    const grown = growBlocks(out, walk, clock, adds, noteSample, warnings, transposes);
    return { data: grown.data, patched: patched + grown.patched, warnings };
  }
  return { data: out, patched, warnings };
}

