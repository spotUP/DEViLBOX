/**
 * synthDreamEdits.ts - write the SynthDream tick grid's edits back into the sdr. module (phase B).
 *
 * The grid (synthDreamGrid.ts) is the replayer's own walk, and every row records the file offsets of the note and
 * instrument words that set the note and instrument shown there. An edited cell is therefore a same-length patch of
 * one 16-bit word, never a re-pack:
 *   - note: the low byte of the note word, so that the replayer's transposition (entry transpose, unless the
 *     instrument is fixed-pitch) lands on the pitch the cell now shows;
 *   - instrument: the low byte of the instrument word (the entry's substitution is accounted for).
 * A word is shared by every tick that replays its stream (repeats, loops, other entries), so an edit shows
 * wherever the stream plays: that is the module's structure, not a copy.
 * Edits the module cannot hold at its length - a note where no command plays one, a note removed or turned into a
 * rest, a volume or effect (the format has no such column) - and edits the replayer would play differently than the
 * cell shows are refused with a warning; nothing is written for them. After patching, the grid is decoded again and
 * every edited cell must read back as edited, otherwise its patch is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { buildSdrGrid, readSdrTrack, sdrSubsongCount, sdrShownNote, sdrSubstitutedInstrument, type SdrGrid, type SdrRowSource } from './synthDreamGrid';

const NOTE_OFF = 97;
const FIRST_NOTE = 13;
const LAST_NOTE = 96;
/** Tracker note 13 is table note 60 (synthDreamGrid.ts). */
const NOTE_C1 = 60;

export interface SdrEditResult {
  data: Uint8Array;
  /** Words changed in the module. */
  patched: number;
  warnings: string[];
}

interface Edit {
  pattern: number; channel: number; row: number;
  note: number; instrument: number;
  /** The note shown after reading back (a removal reads back as the note off). */
  expectNote?: number;
  /** Word offsets this edit wrote, with the bytes they held before. */
  words: Map<number, number>;
  /** A note on a row the covering command holds: that command is cut short and a note command inserted after it (the stream grows). */
  grow?: { stream: number; cmdEnd: number; durationAt: number; keep: number; insert: number[]; drop?: number };
}

const getWord = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const setWord = (b: Uint8Array, o: number, w: number): void => { b[o] = (w >> 8) & 0xff; b[o + 1] = w & 0xff; };
const ROWS_PER_PATTERN = 64;
/** synthdream.c command form 'duration, note' (command_forms[5]). */
const CMD_DURATION_NOTE = 0x0a;
/** command_forms[11]: duration, note, instrument. */
const CMD_DURATION_NOTE_INSTRUMENT = 0x16;
/** command_forms[15]: duration, rest (DMA off for the duration); 4 bytes against the 6 of 'duration, note'. */
const CMD_DURATION_REST = 0x1e;

/**
 * The module with each grown stream copied to the file end (cut command shortened, new command inserted) and every track
 * entry of every subsong that reaches the stream repointed there; the old bytes stay as dead data.
 */
function growStreams(out: Uint8Array, base: SdrGrid, edits: Edit[]): Uint8Array {
  const byStream = new Map<number, Edit[]>();
  for (const e of edits) if (e.grow) byStream.set(e.grow.stream, [...(byStream.get(e.grow.stream) ?? []), e]);
  let data = out;
  for (const [stream, list] of byStream) {
    const s = base.streams.find((x) => x.offset === stream);
    if (!s) continue;
    const bytes = Array.from(data.subarray(stream, stream + s.size));
    // highest position first, so the insert of one does not move the offsets of the next
    for (const e of [...list].sort((a, b) => b.grow!.cmdEnd - a.grow!.cmdEnd)) {
      const g = e.grow!;
      bytes[g.durationAt - stream] = (g.keep >> 8) & 0xff;
      bytes[g.durationAt - stream + 1] = g.keep & 0xff;
      bytes.splice(g.cmdEnd - stream, g.drop ?? 0, ...g.insert);
    }
    const newAt = (data.length + 1) & ~1;
    const next = new Uint8Array(newAt + bytes.length);
    next.set(data); next.set(bytes, newAt);
    for (let sub = 0; sub < sdrSubsongCount(next); sub++) {
      for (let v = 0; v < 4; v++) for (const en of readSdrTrack(next, sub, v).entries) {
        if (en.commands === stream) { setWord(next, en.at, newAt >>> 16); setWord(next, en.at + 2, newAt & 0xffff); }
      }
    }
    data = next;
  }
  return data;
}

/** True when a cell differs in a field other than note and instrument (SynthDream has no volume or effect column). */
function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument' || k === 'extraNotes') continue;
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  // further note columns are read-only here: any change in them counts as an edit that is not written
  const ea = JSON.stringify(a.extraNotes ?? []);
  const eb = JSON.stringify(b.extraNotes ?? []);
  return ea !== eb;
}

function where(e: { pattern: number; channel: number; row: number }): string {
  return `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;
}

/** The edits of `patterns` against the grid decoded from the untouched module, as byte patches in `data`. */
export function applySdrGridEdits(original: Uint8Array, patterns: readonly Pattern[], subsong = 0): SdrEditResult {
  let data: Uint8Array = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildSdrGrid(original, subsong);
  if (!base) return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`SynthDream: the grid has ${patterns.length} patterns, the module decodes to ${base.patterns.length}; nothing was written.`);
    return { data, patched: 0, warnings };
  }

  const claimed = new Map<number, number>(); // word offset -> value an accepted edit wants
  const accepted: Edit[] = [];

  patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base.patterns[pi]?.channels[c]?.rows[r];
    if (!was) return;
    const noteChanged = cell.note !== was.note;
    const instChanged = cell.instrument !== was.instrument;
    const otherChanged = otherFieldsDiffer(cell, was);
    if (!noteChanged && !instChanged && !otherChanged) return;
    const at = { pattern: pi, channel: c, row: r };
    if (otherChanged) {
      warnings.push(`SynthDream ${where(at)}: volume and effect columns are not stored in this format; that change was not written.`);
      if (!noteChanged && !instChanged) return;
    }
    const src = base.rowSources[pi]?.[c]?.[r];
    const wants = new Map<number, number>();

    let grow: Edit['grow'];
    if (noteChanged && !src && was.note === 0 && cell.note >= FIRST_NOTE && cell.note <= LAST_NOTE) {
      // a row inside a command's duration: cut that command at this row and start a note command for the rest
      let cover: SdrRowSource = null as SdrRowSource;
      const T = (pi * ROWS_PER_PATTERN + r) * base.step;
      for (const x of base.voiceCommands[c] ?? []) if (x.tick < T) cover = x; else break;
      const keep = cover ? T - cover.tick : 0;
      if (!cover || cover.durationAt < 0 || keep <= 0 || keep >= cover.duration || keep > 0xffff) {
        warnings.push(`SynthDream ${where(at)}: the command holding this row has no duration word of its own to cut; the note was not written.`);
        return;
      }
      const inForce = cover.instrumentAt >= 0 ? sdrSubstitutedInstrument(getWord(original, cover.instrumentAt), cover.substituteOf, cover.substituteBy) + 1 : 0;
      const newInst = cell.instrument !== 0 && cell.instrument !== inForce ? cell.instrument - 1 : -1;
      const instWord = ((cover.instrumentAt >= 0 ? getWord(original, cover.instrumentAt) : 0) & 0xff00) | (newInst & 0xff);
      if (newInst >= 0 && (newInst > 0xff || sdrSubstitutedInstrument(instWord, cover.substituteOf, cover.substituteBy) !== newInst)) {
        warnings.push(`SynthDream ${where(at)}: the track entry replaces instrument ${newInst + 1}; it cannot be written here.`);
        return;
      }
      const index = cell.note - FIRST_NOTE + NOTE_C1;
      const low = cover.fixedPitch ? index : (index - cover.transpose) & 0xff;
      const high = (cover.noteAt >= 0 ? getWord(original, cover.noteAt) : 0) & 0xff00;
      const rest = cover.duration - keep;
      grow = {
        stream: base.streams[cover.stream].offset, cmdEnd: cover.offset + cover.length, durationAt: cover.durationAt, keep,
        insert: [0, newInst >= 0 ? CMD_DURATION_NOTE_INSTRUMENT : CMD_DURATION_NOTE, (rest >> 8) & 0xff, rest & 0xff, (high | low) >> 8, low,
          ...(newInst >= 0 ? [instWord >> 8, instWord & 0xff] : [])],
      };
      if (accepted.some((a) => a.grow?.cmdEnd === grow!.cmdEnd && a.grow.stream === grow!.stream)) {
        warnings.push(`SynthDream ${where(at)}: another edited row already cut this command; this note was not written.`);
        return;
      }
      accepted.push({ ...at, note: cell.note, instrument: newInst >= 0 ? cell.instrument : inForce, words: new Map(), grow });
      return;
    }
    if (noteChanged && src && was.note >= 1 && was.note < NOTE_OFF && (cell.note === 0 || cell.note === NOTE_OFF)) {
      // note removed: the whole command (word, parameters, modifiers) becomes 'duration, rest' (4 B) with the same duration; the stream is re-laid at the file end and the read-back check refuses it when a later command inherited from the dropped one
      const length = src.length;
      if (src.durationAt < 0 || src.duration > 0xffff || instChanged) {
        warnings.push(`SynthDream ${where(at)}: only a command with its own duration word can become a rest; the note was not removed.`);
        return;
      }
      if (accepted.some((a) => a.grow?.stream === base.streams[src.stream].offset && a.grow.cmdEnd === src.offset)) return;
      const grow = {
        stream: base.streams[src.stream].offset, cmdEnd: src.offset, durationAt: src.durationAt, keep: getWord(original, src.durationAt),
        insert: [0, CMD_DURATION_REST, (src.duration >> 8) & 0xff, src.duration & 0xff], drop: length,
      };
      accepted.push({ ...at, note: cell.note, expectNote: NOTE_OFF, instrument: was.instrument, words: new Map(), grow });
      return;
    }
    if (noteChanged) {
      if (!src || was.note < 1 || was.note >= NOTE_OFF) {
        warnings.push(`SynthDream ${where(at)}: no note command plays on this row, and adding one would lengthen the stream; the note was not written.`);
        return;
      }
      if (cell.note < FIRST_NOTE || cell.note > LAST_NOTE) {
        warnings.push(`SynthDream ${where(at)}: a note can only be changed to another note from C-1 to B-7; removing a note or making it a rest would change the stream length, so it was not written.`);
        return;
      }
      if (src.noteAt < 0) { warnings.push(`SynthDream ${where(at)}: the note word of this row was not found; the note was not written.`); return; }
      const index = cell.note - FIRST_NOTE + NOTE_C1;
      const low = src.fixedPitch ? index : (index - src.transpose) & 0xff;
      const old = getWord(original, src.noteAt);
      const word = (old & 0xff00) | low;
      if (sdrShownNote(word, src.transpose, src.fixedPitch) !== cell.note) {
        warnings.push(`SynthDream ${where(at)}: the replayer cannot play note ${cell.note} here; the note was not written.`);
        return;
      }
      wants.set(src.noteAt, word);
    }

    if (instChanged) {
      const number = cell.instrument - 1;
      if (!src || was.note < 1 || was.note >= NOTE_OFF || src.instrumentAt < 0 || number < 0 || number > 0xff) {
        warnings.push(`SynthDream ${where(at)}: this row has no instrument word to change in place; the instrument was not written.`);
        return;
      }
      const old = getWord(original, src.instrumentAt);
      const word = (old & 0xff00) | number;
      if (sdrSubstitutedInstrument(word, src.substituteOf, src.substituteBy) !== number) {
        warnings.push(`SynthDream ${where(at)}: the track entry replaces instrument ${number + 1}; it cannot be written here.`);
        return;
      }
      wants.set(src.instrumentAt, word);
    }

    for (const [off, w] of wants) {
      const other = claimed.get(off);
      if (other !== undefined && other !== w) {
        warnings.push(`SynthDream ${where(at)}: another edited row shares this command word with a different value; this edit was not written.`);
        return;
      }
    }
    for (const [off, w] of wants) claimed.set(off, w);
    accepted.push({ ...at, note: cell.note, instrument: cell.instrument, words: wants });
  })));

  const writeAll = (edits: Edit[]): void => {
    data = new Uint8Array(original);
    for (const e of edits) for (const [off, w] of e.words) setWord(data, off, w);
    data = growStreams(data, base, edits);
  };

  // Decode again: every edited cell must read back as edited, or its patch comes out.
  let live = accepted;
  for (let pass = 0; pass < 3 && live.length > 0; pass++) {
    writeAll(live);
    const again: SdrGrid | null = buildSdrGrid(data, subsong);
    const failed = live.filter((e) => {
      const got = again?.patterns[e.pattern]?.channels[e.channel]?.rows[e.row];
      const was = base.patterns[e.pattern].channels[e.channel].rows[e.row];
      const noteOk = got?.note === (e.expectNote ?? e.note);
      const instOk = e.instrument === was.instrument || got?.instrument === e.instrument;
      return !(noteOk && instOk);
    });
    // a cut command changes the duration, note and instrument that commands without their own words inherit: no other cell may move
    if (live.some((e) => e.grow)) {
      const edited = new Set(live.map((e) => `${e.pattern}/${e.channel}/${e.row}`));
      const moved = !again || again.patterns.length !== base.patterns.length || base.patterns.some((bp, pi) => bp.channels.some((bc, ci) => bc.rows.some((br, ri) =>
        !edited.has(`${pi}/${ci}/${ri}`) && br.note > 0 && (again.patterns[pi].channels[ci].rows[ri]?.note !== br.note || again.patterns[pi].channels[ci].rows[ri]?.instrument !== br.instrument))));
      if (moved) {
        for (const e of live.filter((x) => x.grow)) warnings.push(`SynthDream ${where(e)}: the cut would change other rows (they inherit this command's duration or note); it was not written.`);
        live = live.filter((e) => !e.grow);
        pass = -1; continue;
      }
    }
    if (failed.length === 0) break;
    for (const e of failed) warnings.push(`SynthDream ${where(e)}: the replayer would play this row differently than it is shown after the change; it was not written.`);
    live = live.filter((e) => !failed.includes(e));
  }
  writeAll(live);
  const patched = new Set(live.flatMap((e) => [...e.words.keys()])).size;
  return { data, patched, warnings };
}
