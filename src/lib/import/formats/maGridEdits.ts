/**
 * maGridEdits.ts - write the Music Assembler grid's edits back into the module's tracks.
 *
 * The grid is the player's walk (maWalk.ts, maGrid.ts): each note is drawn on the row its track event ran
 * and the grid builder records which event that is (cellSources). An edited cell is a byte patch of that
 * event, never a re-pack, so the module keeps its length and every other byte:
 *   - note: the event's note byte (6 bits), the value whose table index - note + the position's transpose
 *     + the instrument's wave rate for a sampled wave, at most 47 - is the typed note's;
 *   - instrument: the instrument byte of an instrument+note event (6 bits; the note byte is then recomputed
 *     for the new instrument's wave rate and wave kind, so the typed note keeps its pitch).
 * A track event is shared by every row that replays its track (every position that names it, every repeat),
 * so the edit shows wherever the track plays. A note typed on a blank row cuts the rest or held note that covers the row into two events, and a removed note is a track rewrite (rewriteMaTrack): the event
 * leaves the track and its duration joins the event before it, so the song keeps its timing and the track only
 * gets shorter (rewritten in place; the offset table and everything after it stay where they are). Edits that
 * need a longer event (a note-off, an instrument on a note event that carries none)
 * come back as warnings, never as a half-edit.
 */
import type { Pattern } from '@/types';
import { loadMaModule, type MaModuleData } from './maModule';
import { walkMusicAssembler } from './maWalk';
import { buildMaGridFromWalk } from './maGrid';
import { MA_FX } from './maEffectGlyphs';

const hasTranspose = (c: { effTyp?: number; effTyp2?: number; effTyp3?: number; effTyp4?: number; effTyp5?: number }): boolean =>
  c.effTyp === MA_FX.transpose || c.effTyp2 === MA_FX.transpose || c.effTyp3 === MA_FX.transpose || c.effTyp4 === MA_FX.transpose || c.effTyp5 === MA_FX.transpose;

export interface MaEditResult { data: Uint8Array; patched: number; warnings: string[] }

/** The 6-bit note byte whose table index (with `transpose` and the wave rate of `instr`) is `tableIndex`, or -1. */
function noteByteFor(m: MaModuleData, instr: number, transpose: number, synth: boolean, tableIndex: number): number {
  const ins = m.instruments[instr];
  const rate = synth || !ins ? 0 : ins.keyWaveRate;
  for (let x = 0; x < 64; x++) {
    const idx = (((x + transpose) & 0xff) + rate) & 0xff;
    if ((idx >= 48 ? 47 : idx) === tableIndex) return x;
  }
  return -1;
}

/** Whether the voice's wave is a synthesis wave: data of 128 words or less. */
function isSynthWave(m: MaModuleData, instr: number): boolean {
  const ins = m.instruments[instr];
  const sample = ins && ins.sampleNumber < m.samples.length ? m.samples[ins.sampleNumber] : null;
  return sample !== null && sample.dataOffset >= 0 && sample.lengthWords <= 128;
}

interface MaTrackEvent { bytes: number[]; delayAt: number; release: boolean; removed: boolean; start: number }

/** Split a track (events ended by 0xff) into events, the grammar of loadSingleTrack; `offsets` are the events' byte offsets. */
function decodeMaTrack(track: Uint8Array, removeAt: ReadonlySet<number>): MaTrackEvent[] | null {
  const events: MaTrackEvent[] = [];
  let i = 0;
  while (i < track.length && !(i === track.length - 1 && track[i] === 0xff)) {
    const start = i;
    const b0 = track[i++];
    let delayAt: number;
    let release = false;
    if ((b0 & 0x80) === 0) { // note: note byte, duration byte (top bit: a portamento byte follows)
      if (i >= track.length) return null;
      delayAt = i++;
      if (track[delayAt] & 0x80) i++;
    } else if ((b0 & 0x40) === 0) { delayAt = start; release = true; } // release: one byte, duration in the low 6 bits
    else { // instrument + note: instrument byte, note byte, duration byte (+ portamento)
      if (i + 1 >= track.length) return null;
      i++;
      delayAt = i++;
      if (track[delayAt] & 0x80) i++;
    }
    if (i > track.length) return null;
    events.push({ bytes: Array.from(track.subarray(start, i)), delayAt: delayAt - start, release, removed: removeAt.has(start), start });
  }
  return events;
}

/** A note to cut into a rest event: `row` rows after the rest starts, played with `instrument` (0-63) by `noteByte` (6 bits). */
export interface MaNoteInsert {
  row: number; instrument: number; noteByte: number;
  /** The instrument the voice plays at the covering event: the next plain note event after the typed note gets it as an instrument byte, so it does not inherit the typed one. */
  restore: number;
}

/**
 * Rewrite a track without its removed events. An event lasts delay + 1 ticks (the player counts the delay down
 * from the byte); a removed event's ticks are added to the event before it when the sum still fits that event's
 * delay field (127 for a note, 63 for a release), so the previous sound carries on through the blank row; with
 * nothing to extend (the removed event opens the track, or the field is full) they become release events of up
 * to 64 ticks, one byte each. Returns the new track with its 0xff terminator, or null when the track does not parse.
 */
export function rewriteMaTrack(track: Uint8Array, removeAt: ReadonlySet<number>, noteAt: ReadonlyMap<number, ReadonlyArray<MaNoteInsert>> = new Map()): Uint8Array | null {
  const events = decodeMaTrack(track, removeAt);
  if (!events || track[track.length - 1] !== 0xff) return null;
  const out: MaTrackEvent[] = [];
  const delayOf = (e: MaTrackEvent): number => e.bytes[e.delayAt] & (e.release ? 0x3f : 0x7f);
  const setDelay = (e: MaTrackEvent, d: number): void => {
    const at = e.delayAt;
    e.bytes[at] = e.release ? (e.bytes[at] & 0xc0) | d : (e.bytes[at] & 0x80) | d;
  };
  let pending: number | null = null; // an instrument the next plain note event must name again
  for (const e of events) {
    if (pending !== null && !e.removed && !e.release) {
      if ((e.bytes[0] & 0x80) === 0) { e.bytes.unshift(0xc0 | pending); e.delayAt++; }
      pending = null;
    }
    const inserts = noteAt.get(e.start);
    if (inserts && !e.removed) {
      // a note typed on a row an event covers (a rest, or a note held through the row): the event is cut around it
      const span = delayOf(e) + 1;
      const sorted = [...inserts].filter((i) => i.row >= (e.release ? 0 : 1) && i.row < span).sort((a, b) => a.row - b.row);
      if (e.release) {
        const rest = (n: number): void => { if (n > 0) out.push({ bytes: [0x80 | (n - 1)], delayAt: 0, release: true, removed: false, start: -1 }); };
        let at = 0;
        for (const ins of sorted) {
          if (ins.row < at) continue;
          rest(ins.row - at);
          out.push({ bytes: [0xc0 | ins.instrument, ins.noteByte & 0x3f, 0], delayAt: 2, release: false, removed: false, start: -1 });
          at = ins.row + 1;
        }
        rest(span - at);
        if (sorted.length > 0 && sorted[sorted.length - 1].instrument !== sorted[0].restore) pending = sorted[0].restore;
      } else if (sorted.length > 0) {
        // a held note: it keeps the rows before the first typed note, and each typed note holds until the next one (or the end of
        // the span), so the rows that showed nothing still show nothing
        setDelay(e, sorted[0].row - 1);
        out.push(e);
        sorted.forEach((ins, k) => {
          const end = k + 1 < sorted.length ? sorted[k + 1].row : span;
          out.push({ bytes: [0xc0 | ins.instrument, ins.noteByte & 0x3f, end - ins.row - 1], delayAt: 2, release: false, removed: false, start: -1 });
        });
        if (sorted[sorted.length - 1].instrument !== sorted[0].restore) pending = sorted[0].restore;
      } else out.push(e);
      continue;
    }
    if (!e.removed) { out.push(e); continue; }
    let ticks = delayOf(e) + 1;
    const prev = out[out.length - 1];
    if (prev) {
      const room = (prev.release ? 63 : 127) - delayOf(prev);
      const take = Math.min(room, ticks);
      if (take > 0) { setDelay(prev, delayOf(prev) + take); ticks -= take; }
    }
    while (ticks > 0) {
      const chunk = Math.min(64, ticks);
      out.push({ bytes: [0x80 | (chunk - 1)], delayAt: 0, release: true, removed: false, start: -1 });
      ticks -= chunk;
    }
  }
  if (pending !== null) return null; // the typed instrument would carry into the next track
  const bytes: number[] = [];
  for (const e of out) bytes.push(...e.bytes);
  bytes.push(0xff);
  return new Uint8Array(bytes);
}

/** `subsong`: the sub-song the edited grid shows (the song's fileSubsongs.current). */
export function applyMaGridEdits(source: Uint8Array, edited: Pattern[], subsong = 0): MaEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const m = loadMaModule(source);
  const walk = m ? walkMusicAssembler(m, subsong) : null;
  if (!m || !walk || walk.stop === 'ended') return { data: out, patched: 0, warnings: [`the module has no matched grid to write edits into (${walk?.endReason ?? 'no walk'})`] };
  const grid = buildMaGridFromWalk(walk, m);
  const removals = new Map<number, Set<number>>(); // track number -> offsets of the events to drop
  const insertions = new Map<number, Map<number, Map<number, MaNoteInsert>>>(); // track -> rest event offset -> row in the rest -> note
  const wantedTranspose: number[] = []; // file offsets of the position entries whose transpose is cleared
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same byte, kept the first`); return; }
    wanted.set(off, { value: value & 0xff, why });
  };

  for (let p = 0; p < edited.length; p++) {
    const bp = grid.patterns[p];
    if (!bp) { warnings.push(`pattern ${p} is past the end of the module's song; not written`); continue; }
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length; row++) {
        const b = bp.channels[ch].rows[row];
        const c = eRows[row];
        if (!c) continue;
        const dNote = (c.note ?? 0) !== (b.note ?? 0);
        const dIns = (c.instrument ?? 0) !== (b.instrument ?? 0);
        const ts = grid.transposeSources[p][ch][row];
        if (ts && hasTranspose(b) && !hasTranspose(c)) {
          // a removed transpose command is a transpose of 0 in the position entries it stood for (the high nibble of byte 1)
          for (const off of ts) if (!wantedTranspose.includes(off)) wantedTranspose.push(off);
        }
        if (!dNote && !dIns) continue;
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        const src = grid.cellSources[p][ch][row];
        if (!src) {
          const shownNote = c.note ?? 0;
          if (shownNote === 0) continue;
          // a note on a blank row: cut it into the rest or held note that covers the row (the nearest command start at or before it)
          let at = row;
          while (at >= 0 && !grid.commandSources[p][ch][at]) at--;
          const cover = at >= 0 ? grid.commandSources[p][ch][at] : null;
          const coverTrack = cover ? m.tracks[cover.track] : null;
          if (!cover || !coverTrack) { warnings.push(`${where}: no command of the module covers this row; not written`); continue; }
          const idx = (c.instrument ?? 0) - 1;
          if (idx < 0 || idx > 63 || idx >= m.instruments.length) { warnings.push(`${where}: a new note needs an instrument in range; not written`); continue; }
          if (shownNote > 48) { warnings.push(`${where}: a note-off needs a release event; not written`); continue; }
          const x = noteByteFor(m, idx, cover.transpose, isSynthWave(m, idx), shownNote - 1);
          if (x < 0) { warnings.push(`${where}: no note byte plays note ${shownNote} here; not written`); continue; }
          let byOffset = insertions.get(cover.track);
          if (!byOffset) insertions.set(cover.track, byOffset = new Map());
          let byRow = byOffset.get(cover.trackOffset);
          if (!byRow) byOffset.set(cover.trackOffset, byRow = new Map());
          const prev = byRow.get(row - at);
          if (prev && (prev.instrument !== idx || prev.noteByte !== x)) warnings.push(`${where}: conflicts with another voice's note on the same shared track, kept the first`);
          else byRow.set(row - at, { row: row - at, instrument: idx, noteByte: x, restore: cover.instr });
          continue;
        }
        const track = m.tracks[src.track];
        if (dNote && (c.note ?? 0) === 0) {
          let set = removals.get(src.track);
          if (!set) removals.set(src.track, set = new Set());
          set.add(src.trackOffset);
          continue;
        }
        const eventOff = m.tracksStartOffset + m.trackOffsetTable[src.track] + src.trackOffset;
        const b0 = track ? track[src.trackOffset] : 0;
        const hasInstrumentByte = (b0 & 0xc0) === 0xc0;
        const noteOff = hasInstrumentByte ? eventOff + 1 : eventOff;
        const noteByte = (track ? track[hasInstrumentByte ? src.trackOffset + 1 : src.trackOffset] : 0) & 0xff;

        let instr = src.instr;
        let synth = src.synth;
        if (dIns) {
          const idx = (c.instrument ?? 0) - 1;
          if (!hasInstrumentByte) { warnings.push(`${where}: a note event carries no instrument; not written`); continue; }
          if (idx < 0 || idx > 63 || idx >= m.instruments.length) { warnings.push(`${where}: instrument ${c.instrument ?? 0} is out of range; not written`); continue; }
          want(eventOff, (b0 & 0xc0) | idx, `${where} instrument`);
          instr = idx;
          synth = isSynthWave(m, idx);
        }
        const shown = c.note ?? 0;
        if (dNote && (shown < 1 || shown > 48)) { warnings.push(`${where}: a note-off is a release event, which has no note byte to patch; not written`); continue; }
        // the note (the typed one, or the unchanged one when only the instrument moved) keeps its pitch under the new instrument
        const wantNote = dNote ? shown : (b.note ?? 0);
        if (wantNote >= 1 && wantNote <= 48) {
          const x = noteByteFor(m, instr, src.transpose, synth, wantNote - 1);
          if (x < 0) warnings.push(`${where}: no note byte plays note ${wantNote} here; not written`);
          else want(noteOff, (noteByte & 0xc0) | x, `${where} note`);
        }
      }
    }
  }
  let patched = 0;
  for (const off of wantedTranspose) if (out[off + 1] & 0xf0) { out[off + 1] &= 0x0f; patched++; }
  for (const [off, { value }] of wanted) if (out[off] !== value) { out[off] = value; patched++; }
  const touched = new Set<number>([...removals.keys(), ...insertions.keys()]);
  let tail = out; // grows when a track gets longer than its slot and moves to the end of the file
  for (const t of touched) {
    const drop = removals.get(t) ?? new Set<number>();
    const track = m.tracks[t];
    const at = m.tracksStartOffset + m.trackOffsetTable[t];
    // the track as it stands with the byte patches in (a patched event may also be a removed one)
    const cur = track ? tail.slice(at, at + track.length) : null;
    const noteAt = new Map<number, MaNoteInsert[]>();
    for (const [off, byRow] of insertions.get(t) ?? []) noteAt.set(off, [...byRow.values()]);
    const rewritten = cur ? rewriteMaTrack(cur, drop, noteAt) : null;
    if (!track || !rewritten) { warnings.push(`track ${t}: could not be rewritten; its edited notes are not written`); continue; }
    if (rewritten.length <= track.length) {
      // in place: the bytes after the new terminator are left unused (each track is reached through the offset table)
      tail.fill(0xff, at + rewritten.length, at + track.length);
      tail.set(rewritten, at);
    } else {
      // longer than its slot: the track moves to the end of the file and its offset-table entry follows it
      const newOffset = tail.length - m.tracksStartOffset;
      if (newOffset > 0xffff) { warnings.push(`track ${t}: a longer track does not fit the 16-bit offset table; not written`); continue; }
      const grown = new Uint8Array(tail.length + rewritten.length);
      grown.set(tail);
      grown.set(rewritten, tail.length);
      grown[m.moduleStartOffset + t * 2] = newOffset >> 8;
      grown[m.moduleStartOffset + t * 2 + 1] = newOffset & 0xff;
      tail = grown;
    }
    patched += drop.size;
    for (const byRow of (insertions.get(t) ?? new Map()).values()) patched += byRow.size;
  }
  return { data: tail, patched, warnings };
}
