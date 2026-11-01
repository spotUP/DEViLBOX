/**
 * ActivisionProModule.ts - an Activision Pro (Martin Walker) module as a model
 * and its exact inverse.
 *
 * The replayer (activisionpro-wasm, avp_parse_next_track_position) reads a
 * track as a stream of EVENTS. An event holds a duration in steps, a note and
 * a few zero-time operations (set instrument, portamento, volume, ...); the
 * grammar differs per track version (1..5, found by scanning the player code).
 * A track ends with 0xFF. Nothing in a track is a fixed-width cell.
 *
 * Every event keeps the bytes it was read from. `encodeActivisionProModule`
 * writes those bytes back unless the event's meaning was edited, in which case
 * the canonical encoding of the new meaning is written; an unedited module is
 * therefore reproduced byte for byte. Tracks are written in place; an edit that
 * changes a track's length repacks the track region, which grows (and the code's
 * references to the data behind it are rewritten) when the tracks no longer fit.
 *
 * Reference: activisionpro-wasm/src/activisionpro.c, avp_parse_next_track_position.
 * Versions 2..5 follow that source; the only corpus file (gettysburg.avp) is
 * version 1, so those are checked against the source only.
 */
import { extractPlayerInfo, type AvpPlayerInfo } from './ActivisionProParser';

export type AvpOpKind =
  | 'instrument' | 'volume' | 'addVolume' | 'portamento' | 'maxSpeed' | 'mute'
  | 'noRetrigger' | 'speed2' | 'globalTranspose' | 'envelopeReset' | 'unknown';

export interface AvpOp {
  kind: AvpOpKind;
  /** The operation's argument (0 when it has none). */
  value: number;
  /** The raw opcode byte (versions 3..5; 0 for versions 1 and 2). */
  code: number;
}

export interface AvpEvent {
  ops: AvpOp[];
  /** The note byte (versions 1-3: 7 bits; 4-5: the note), -1 for a mute event. */
  note: number;
  /** Versions 1-3: bit 7 of the note byte - keep the playing sample. */
  holdSample: boolean;
  /** Steps the event lasts (0 plays 256). */
  duration: number;
  /** The bytes the event was read from. */
  bytes: number[];
}

export interface AvpTrack {
  fileOffset: number;
  events: AvpEvent[];
}

export interface AvpInstrumentRecord {
  sampleNumber: number;
  /** Version 3 only: added to every note of the instrument. */
  transpose: number;
}

export interface AvpSubsong {
  positionLists: Uint8Array[];
  speedVariation: Int8Array;
}

export interface ActivisionProModule {
  bytes: Uint8Array;
  info: AvpPlayerInfo;
  subsongs: AvpSubsong[];
  /** Track number -> track (null when its offset is negative); tracks at one offset are one object. */
  tracks: (AvpTrack | null)[];
  instruments: AvpInstrumentRecord[];
  /** Speed variation version 2: the initial accumulator increment. */
  speedVariationInit: number;
}

// ---- opcodes -------------------------------------------------------------

const OPS_V3: Record<number, AvpOpKind> = {
  0x80: 'instrument', 0x81: 'volume', 0x82: 'portamento', 0x8a: 'maxSpeed', 0x8e: 'addVolume',
};
const OPS_V4: Record<number, AvpOpKind> = {
  0x80: 'instrument', 0x81: 'mute', 0x82: 'portamento', 0x83: 'speed2', 0x87: 'noRetrigger',
  0x8a: 'maxSpeed', 0x8c: 'volume', 0x8d: 'addVolume',
};
const OPS_V5: Record<number, AvpOpKind> = {
  0x80: 'instrument', 0x81: 'mute', 0x82: 'portamento', 0x83: 'speed2', 0x84: 'noRetrigger',
  0x85: 'maxSpeed', 0x86: 'globalTranspose', 0x87: 'volume', 0x8b: 'addVolume',
};
const opTable = (version: number): Record<number, AvpOpKind> => (version === 3 ? OPS_V3 : version === 4 ? OPS_V4 : OPS_V5);

const opCode = (version: number, kind: AvpOpKind): number | null => {
  const t = opTable(version);
  for (const k of Object.keys(t)) if (t[+k] === kind) return +k;
  return null;
};

// ---- one event -----------------------------------------------------------

/** Read the event at `pos`; null at the terminator or past the data. */
export function decodeAvpEvent(version: number, t: ArrayLike<number>, pos: number): { event: AvpEvent; next: number } | null {
  const start = pos;
  const len = t.length;
  const rd = (): number => { if (pos >= len) throw new RangeError('track data ended inside an event'); return t[pos++]; };
  if (pos >= len || t[pos] === 0xff) return null;
  const ops: AvpOp[] = [];
  let note = 0, holdSample = false, duration = 0;
  try {
    let b = rd();
    if (version === 1) {
      duration = b & 0x3f;
      if (b & 0x40) ops.push({ kind: 'envelopeReset', value: 0, code: 0 });
      if (b & 0x80) {
        const x = rd();
        ops.push(x & 0x80 ? { kind: 'portamento', value: x, code: 0 } : { kind: 'instrument', value: x, code: 0 });
      }
      const n = rd();
      note = n & 0x7f; holdSample = (n & 0x80) !== 0;
    } else if (version === 2) {
      if (b & 0x80) {
        ops.push({ kind: 'instrument', value: b & 0x7f, code: 0 });
        const x = rd();
        ops.push(x & 0x80 ? { kind: 'portamento', value: x, code: 0 } : { kind: 'volume', value: x, code: 0 });
        duration = rd();
      } else duration = b;
      const n = rd();
      note = n & 0x7f; holdSample = (n & 0x80) !== 0;
    } else if (version === 3) {
      const table = opTable(3);
      while (b & 0x80) {
        ops.push({ kind: table[b] ?? 'unknown', value: rd(), code: b });
        b = rd();
      }
      duration = b;
      const n = rd();
      note = n & 0x7f; holdSample = (n & 0x80) !== 0;
    } else {
      const table = opTable(version);
      note = -1;
      for (;;) {
        if (b & 0x80) {
          const kind = table[b] ?? 'unknown';
          if (b === 0x81) { ops.push({ kind: 'mute', value: 0, code: b }); break; }
          ops.push({ kind, value: rd(), code: b });
          b = rd();
        } else { note = b; break; }
      }
      duration = rd();
    }
  } catch {
    return null;
  }
  const bytes: number[] = [];
  for (let i = start; i < pos; i++) bytes.push(t[i]);
  return { event: { ops, note, holdSample, duration, bytes }, next: pos };
}

/** The canonical bytes of an event's meaning; null when the version cannot express it. */
export function encodeAvpEvent(version: number, e: AvpEvent): number[] | null {
  const out: number[] = [];
  const op = (k: AvpOpKind): AvpOp | undefined => e.ops.find((o) => o.kind === k);
  if (e.duration < 0 || e.duration > 255) return null;
  if (version === 1) {
    const env = op('envelopeReset'), porta = op('portamento'), inst = op('instrument');
    if (porta && inst) return null;
    if (e.ops.some((o) => o.kind !== 'envelopeReset' && o.kind !== 'portamento' && o.kind !== 'instrument')) return null;
    if (e.duration > 0x3f) return null;
    const extra = porta ? porta.value | 0x80 : inst ? inst.value & 0x7f : -1;
    out.push(e.duration | (env ? 0x40 : 0) | (extra >= 0 ? 0x80 : 0));
    if (extra >= 0) out.push(extra);
    out.push((e.note & 0x7f) | (e.holdSample ? 0x80 : 0));
    return out;
  }
  if (version === 2) {
    const inst = op('instrument'), porta = op('portamento'), vol = op('volume');
    if (e.ops.some((o) => o.kind !== 'instrument' && o.kind !== 'portamento' && o.kind !== 'volume')) return null;
    if (inst) {
      if (porta && vol) return null;
      out.push(0x80 | (inst.value & 0x7f));
      out.push(porta ? porta.value | 0x80 : (vol ? vol.value & 0x7f : 0));
      out.push(e.duration);
    } else {
      if (porta || vol || e.duration > 0x7f) return null;
      out.push(e.duration);
    }
    out.push((e.note & 0x7f) | (e.holdSample ? 0x80 : 0));
    return out;
  }
  for (const o of e.ops) {
    const code = o.kind === 'unknown' ? o.code : opCode(version, o.kind);
    if (code === null) return null;
    out.push(code);
    if (!(version >= 4 && o.kind === 'mute')) out.push(o.value & 0xff);
  }
  if (version === 3) {
    out.push(e.duration);
    out.push((e.note & 0x7f) | (e.holdSample ? 0x80 : 0));
    return out;
  }
  if (e.ops.some((o) => o.kind === 'mute')) { out.push(e.duration); return out; }
  out.push(e.note & 0x7f);
  out.push(e.duration);
  return out;
}

const sameMeaning = (a: AvpEvent, b: AvpEvent): boolean =>
  a.note === b.note && a.holdSample === b.holdSample && a.duration === b.duration
  && a.ops.length === b.ops.length && a.ops.every((o, i) => o.kind === b.ops[i].kind && o.value === b.ops[i].value && o.code === b.ops[i].code);

// ---- the module ----------------------------------------------------------

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const s16 = (b: Uint8Array, o: number): number => { const v = u16(b, o); return v < 0x8000 ? v : v - 0x10000; };

function readPositionList(b: Uint8Array, off: number): Uint8Array {
  const r: number[] = [];
  let p = off;
  while (p < b.length) {
    const d = b[p++];
    r.push(d);
    if ((d >= 0xfd || (d & 0x40) === 0) && p < b.length) r.push(b[p++]);
    if (d === 0xfe || d === 0xff) break;
  }
  return new Uint8Array(r);
}

export function decodeActivisionProModule(bytes: Uint8Array): ActivisionProModule | null {
  const info = extractPlayerInfo(bytes);
  if (!info || info.subSongListOffset < 0 || info.positionListsOffset <= info.subSongListOffset) return null;
  const version = info.parseTrackVersion;
  const nSub = Math.floor((info.positionListsOffset - info.subSongListOffset) / 16);
  const subsongs: AvpSubsong[] = [];
  for (let i = 0; i < nSub; i++) {
    const base = info.subSongListOffset + i * 16;
    if (base + 16 > bytes.length) break;
    const positionLists: Uint8Array[] = [];
    for (let c = 0; c < 4; c++) positionLists.push(readPositionList(bytes, info.positionListsOffset + u16(bytes, base + c * 2)));
    const speedVariation = new Int8Array(8);
    for (let j = 0; j < 8; j++) { const v = bytes[base + 8 + j]; speedVariation[j] = v < 128 ? v : v - 256; }
    subsongs.push({ positionLists, speedVariation });
  }
  if (subsongs.length === 0 || info.trackOffsetsOffset < 0 || info.tracksOffset < 0) return null;

  // The replayer counts tracks as (tracksOffset - trackOffsetsOffset) / 2.
  const numTracks = Math.max(0, Math.floor((info.tracksOffset - info.trackOffsetsOffset) / 2));
  const byOffset = new Map<number, AvpTrack>();
  const tracks: (AvpTrack | null)[] = [];
  for (let i = 0; i < numTracks; i++) {
    const rel = s16(bytes, info.trackOffsetsOffset + i * 2);
    if (rel < 0) { tracks.push(null); continue; }
    const fileOffset = info.tracksOffset + rel;
    let t = byOffset.get(fileOffset);
    if (!t) {
      const events: AvpEvent[] = [];
      let p = fileOffset;
      for (;;) {
        const d = decodeAvpEvent(version, bytes, p);
        if (!d) break;
        events.push(d.event);
        p = d.next;
      }
      t = { fileOffset, events };
      byOffset.set(fileOffset, t);
    }
    tracks.push(t);
  }

  // Instrument records: only what the walk reads (sample number, version 3 transpose).
  const instruments: AvpInstrumentRecord[] = [];
  if (info.instrumentsOffset >= 0) {
    const ends = [info.trackOffsetsOffset, info.tracksOffset, info.subSongListOffset, info.sampleStartOffsetsOffset]
      .filter((o) => o > info.instrumentsOffset);
    const end = ends.length ? Math.min(...ends) : bytes.length;
    for (let o = info.instrumentsOffset; o + 16 <= end; o += 16) {
      const t = bytes[o + 3];
      instruments.push({ sampleNumber: bytes[o], transpose: info.instrumentFormatVersion === 3 ? (t < 128 ? t : t - 256) : 0 });
    }
  }
  const speedVariationInit = info.speedVariationVersion === 2 && info.speedVariationSpeedIncrementOffset >= 0
    ? bytes[info.speedVariationSpeedIncrementOffset] : 0;
  return { bytes, info, subsongs, tracks, instruments, speedVariationInit };
}

/** File offset of a voice's position list. */
function positionListOffset(m: ActivisionProModule, subsong: number, voice: number): number {
  return m.info.positionListsOffset + u16(m.bytes, m.info.subSongListOffset + subsong * 16 + voice * 2);
}

/** Whether another voice (of any sub-song) reads the same position list as this one. */
export function positionListShared(m: ActivisionProModule, subsong: number, voice: number): boolean {
  const at = positionListOffset(m, subsong, voice);
  return m.subsongs.some((_, s) => [0, 1, 2, 3].some((v) => (s !== subsong || v !== voice) && positionListOffset(m, s, v) === at));
}

/** The first byte after the track data: the next section the module's code points at. */
function trackRegionEnd(m: ActivisionProModule): number {
  const i = m.info;
  const after = [i.subSongListOffset, i.positionListsOffset, i.sampleDataOffset, i.sampleInfoOffset, i.sampleStartOffsetsOffset, i.instrumentsOffset, i.envelopesOffset]
    .filter((o) => o > i.tracksOffset);
  return after.length ? Math.min(...after) : m.bytes.length;
}

const trackBody = (version: number, t: AvpTrack): number[] => {
  const body: number[] = [];
  for (const e of t.events) {
    const orig = decodeAvpEvent(version, e.bytes, 0);
    if (orig && sameMeaning(orig.event, e)) { body.push(...e.bytes); continue; }
    const enc = encodeAvpEvent(version, e);
    if (!enc) throw new RangeError('event cannot be encoded in this track version');
    body.push(...enc);
  }
  body.push(0xff);
  return body;
};

/** The first byte after the position lists: the next section the module's code points at (or the end of the file). */
function positionListRegionEnd(m: ActivisionProModule): number {
  const i = m.info;
  const after = [i.subSongListOffset, i.sampleDataOffset, i.sampleInfoOffset, i.sampleStartOffsetsOffset, i.instrumentsOffset, i.envelopesOffset, i.trackOffsetsOffset, i.tracksOffset]
    .filter((o) => o > i.positionListsOffset);
  return after.length ? Math.min(...after) : m.bytes.length;
}

interface Insertion { at: number; n: number }

/** Where an original offset lands once the insertions (bytes added at `at`, everything from `at` on moves up) are made. */
const mapOffset = (ins: readonly Insertion[], p: number): number => p + ins.reduce((n, x) => (x.at <= p ? n + x.n : n), 0);

/**
 * Whether the 16-bit word before a displacement is a 68000 instruction whose operand is a PC-relative displacement the player
 * uses to reach data: lea d16(pc),An, pea d16(pc), or a move from d16(pc).
 */
const isPcRelativeOperand = (opcode: number): boolean =>
  (opcode & 0x003f) === 0x003a && ((opcode & 0xf1ff) === 0x41fa || opcode === 0x487a || (opcode >> 12) >= 1 && (opcode >> 12) <= 3);

/**
 * Re-point the module's code at data that moved. The player reaches every section through a PC-relative displacement in its
 * code (the same ones extractPlayerInfo reads), so each displacement in the code that targets a moved byte is rewritten to the
 * byte's new place. Throws when a section the module moved is not reached by any displacement found (a reference we cannot see
 * would silently point at the wrong data).
 */
function relocateCodeReferences(src: Uint8Array, out: Uint8Array, info: AvpPlayerInfo, ins: readonly Insertion[]): void {
  const first = Math.min(...ins.map((x) => x.at));
  const codeEnd = Math.min(...[info.subSongListOffset, info.positionListsOffset, info.trackOffsetsOffset, info.tracksOffset, info.instrumentsOffset,
    info.sampleStartOffsetsOffset, info.sampleDataOffset, info.sampleInfoOffset, info.envelopesOffset].filter((o) => o > 0));
  const reached = new Set<number>();
  for (let i = 2; i + 2 <= codeEnd; i += 2) {
    if (!isPcRelativeOperand(u16(src, i - 2))) continue;
    const target = i + s16(src, i);
    if (target < first || target > src.length) continue;
    const moved = mapOffset(ins, target) - i;
    if (moved > 0x7fff) throw new RangeError('a section moved out of the 16-bit reach of the module code');
    out[i] = (moved >> 8) & 0xff;
    out[i + 1] = moved & 0xff;
    reached.add(target);
  }
  for (const section of [info.subSongListOffset, info.positionListsOffset, info.trackOffsetsOffset, info.tracksOffset, info.instrumentsOffset,
    info.sampleStartOffsetsOffset, info.sampleDataOffset, info.sampleInfoOffset, info.envelopesOffset]) {
    if (section >= first && !reached.has(section)) throw new RangeError(`no code reference to the section at ${section} was found, so it cannot be moved`);
  }
}

/**
 * The module's bytes: the source with its tracks and position lists written back.
 *
 * Tracks are written where they were when no track changed length (byte-exact for an unedited module). When one did, the track
 * region is repacked: every distinct track is written one after the other from the region's start, shared tracks once, and the
 * track offset table (s16 offsets from the region start, the only reference to a track) is rewritten. When the repacked tracks
 * need more than the region holds, the region grows: the following bytes move up and every PC-relative reference the player's
 * code holds to them is rewritten (relocateCodeReferences). A position list that was shortened is written in place; one that
 * grew is appended behind the position lists (the old copy stays as dead bytes) and the sub-song list's offset is repointed.
 */
export function encodeActivisionProModule(m: ActivisionProModule): Uint8Array {
  const version = m.info.parseTrackVersion;
  const distinct: AvpTrack[] = [];
  for (const t of m.tracks) if (t && !distinct.includes(t)) distinct.push(t);
  const bodies = new Map<AvpTrack, number[]>(distinct.map((t) => [t, trackBody(version, t)]));
  const inPlace = distinct.every((t) => bodies.get(t)!.length === t.events.reduce((n, e) => n + e.bytes.length, 0) + 1);

  const ins: Insertion[] = [];
  const trackEnd = trackRegionEnd(m);
  if (!inPlace) {
    const needed = distinct.reduce((n, t) => n + bodies.get(t)!.length, 0);
    const room = trackEnd - m.info.tracksOffset;
    if (needed > room) ins.push({ at: trackEnd, n: (needed - room + 1) & ~1 });
  }
  const grown: { s: number; v: number; list: Uint8Array }[] = [];
  m.subsongs.forEach((sub, s) => sub.positionLists.forEach((list, v) => {
    if (list.length > readPositionList(m.bytes, positionListOffset(m, s, v)).length) grown.push({ s, v, list });
  }));
  const listKey = (l: Uint8Array): string => l.join(',');
  const appended = new Map<string, number>();   // list bytes -> offset inside the appended block
  let appendedSize = 0;
  for (const g of grown) {
    const k = listKey(g.list);
    if (!appended.has(k)) { appended.set(k, appendedSize); appendedSize += g.list.length; }
  }
  const listEnd = positionListRegionEnd(m);
  if (appendedSize > 0) ins.push({ at: listEnd, n: (appendedSize + 1) & ~1 });
  ins.sort((a, b) => a.at - b.at);

  const total = ins.reduce((n, x) => n + x.n, 0);
  const out = new Uint8Array(m.bytes.length + total);
  let from = 0, shift = 0;
  for (const x of [...ins, { at: m.bytes.length, n: 0 }]) {
    out.set(m.bytes.subarray(from, x.at), from + shift);
    from = x.at;
    shift += x.n;
  }
  const at = (p: number): number => mapOffset(ins, p);
  if (ins.length) relocateCodeReferences(m.bytes, out, m.info, ins);

  if (inPlace) {
    for (const t of distinct) out.set(bodies.get(t)!, t.fileOffset);
  } else {
    const regionStart = at(m.info.tracksOffset);
    const regionEnd = regionStart + (trackEnd - m.info.tracksOffset) + (ins.find((x) => x.at === trackEnd)?.n ?? 0);
    const newOffset = new Map<AvpTrack, number>();
    let pos = regionStart;
    out.fill(0, regionStart, regionEnd);
    for (const t of [...distinct].sort((a, b) => a.fileOffset - b.fileOffset)) {
      const body = bodies.get(t)!;
      if (pos + body.length > regionEnd) throw new RangeError('the repacked tracks do not fit the track region');
      out.set(body, pos);
      newOffset.set(t, pos);
      pos += body.length;
    }
    m.tracks.forEach((t, i) => {
      const o = at(m.info.trackOffsetsOffset) + i * 2;
      if (!t) { out[o] = 0xff; out[o + 1] = 0xff; return; }
      const rel = newOffset.get(t)! - regionStart;
      if (rel > 0x7fff) throw new RangeError('track offset beyond the 16-bit table');
      out[o] = (rel >> 8) & 0xff;
      out[o + 1] = rel & 0xff;
    });
  }
  const appendBase = at(listEnd) - (ins.find((x) => x.at === listEnd)?.n ?? 0);
  for (const [k, off] of appended) out.set(k.split(',').map(Number), appendBase + off);
  m.subsongs.forEach((sub, s) => sub.positionLists.forEach((list, v) => {
    const original = readPositionList(m.bytes, positionListOffset(m, s, v));
    if (list.length === original.length && list.every((b, i) => b === original[i])) return;
    if (list.length > original.length) {
      const rel = appendBase + appended.get(listKey(list))! - at(m.info.positionListsOffset);
      if (rel > 0xffff) throw new RangeError('position list beyond the 16-bit offset');
      const o = at(m.info.subSongListOffset) + s * 16 + v * 2;
      out[o] = (rel >> 8) & 0xff;
      out[o + 1] = rel & 0xff;
      return;
    }
    out.set(list, at(positionListOffset(m, s, v)));
  }));
  return out;
}
