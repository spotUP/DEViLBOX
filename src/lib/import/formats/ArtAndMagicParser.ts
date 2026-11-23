/**
 * ArtAndMagicParser.ts - Art and Magic (.aam) module layout and note-stream codec. Layout from nuade
 * players/artandmagic/artandmagic.c (locate_layout, next_track_entry, read_note).
 *
 * An .aam file is a relocatable 68k program: driver code, song tables, 8SVX sample forms. The table addresses come
 * from the driver's pc-relative `lea` instructions; stored addresses are of the original link and map to file
 * offsets through the relocation origin (A - word at origin + instruments).
 *
 * Status: codec skeleton. Not routed yet (the app still loads SimpleAmigaStubParser.parseArtAndMagicFile, UADE
 * playback). The editable grid follows docs/FORMAT_COMMAND_STREAM_GRID.md: the note streams are variable-length
 * per-voice command streams, so the commands below are the byte-exact carriers (blockRows) and the display grid is
 * built on a tick timeline from them.
 */

const LEA_PC_MASK = 0xf1ff;
const LEA_PC_OPCODE = 0x41fa;
const BUILD_MARK_OFFSET = 0x20e;
const BUILD_MARK = 0x01020408;
const VOICE_TABLE_ENTRY_SIZE = 8;
const VOICE_TABLE_ENTRIES = 5;
const ORIGIN_BEFORE_INSTRUMENTS = 9;
const PITCH_SEQS = 32;

/** Note-stream bytes (artandmagic.c NoteByte_*). Below 0x60 a byte is a note. */
export const AAM_PITCH_SEQ = 0x60;
export const AAM_DURATION = 0x80;
export const AAM_INSTRUMENT = 0xc0;
export const AAM_REST = 0xf0;
export const AAM_LEGATO = 0xfb;
export const AAM_LEVEL = 0xfc;
export const AAM_PORTAMENTO = 0xfd;
export const AAM_STOP = 0xfe;
export const AAM_PATTERN_END = 0xff;

export interface AamLayout {
  firstForm: number;
  sampleTable: number;
  voiceTable: number;
  firstNote: number;
  instruments: number;
  periods: number;
  patterns: number;
  pitchSeqs: number;
  origin: number;
  pointersEnd: number;
}

// lea site of each field in the first and the second driver build (artandmagic.c s_layout_sites).
const SITES: [keyof AamLayout, number, number][] = [
  ['firstForm', 0x0a, 0x0a],
  ['sampleTable', 0x12, 0x12],
  ['voiceTable', 0xe0, 0xe0],
  ['firstNote', 0xfc, 0xfc],
  ['instruments', 0x15c, 0x15c],
  ['periods', 0x39e, 0x3a0],
  ['patterns', 0x472, 0x476],
  ['pitchSeqs', 0x4e4, 0x4e8],
];

const rd16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
const rd32 = (b: Uint8Array, o: number): number => ((rd16(b, o) << 16) | rd16(b, o + 2)) >>> 0;

/** The table addresses, or null when no known driver build fits. */
export function locateAamLayout(b: Uint8Array): AamLayout | null {
  const build = rd32(b, BUILD_MARK_OFFSET) === BUILD_MARK ? 1 : 0;
  const l = {} as AamLayout;
  for (const [field, s0, s1] of SITES) {
    const site = build ? s1 : s0;
    if ((rd16(b, site) & LEA_PC_MASK) !== LEA_PC_OPCODE) return null;
    const target = site + 2 + ((rd16(b, site + 2) << 16) >> 16);
    if (target < 0 || target >= b.length) return null;
    l[field] = target;
  }
  l.origin = l.instruments - ORIGIN_BEFORE_INSTRUMENTS;
  if (l.instruments < ORIGIN_BEFORE_INSTRUMENTS || l.origin < l.patterns
    || l.patterns !== l.voiceTable + VOICE_TABLE_ENTRY_SIZE * VOICE_TABLE_ENTRIES) return null;
  l.pointersEnd = l.patterns + 4 * (((l.origin - l.patterns) >> 2) + 1);
  if (l.pitchSeqs < l.patterns || l.pitchSeqs + 4 * PITCH_SEQS > l.pointersEnd) return null;
  return l;
}

/** File offset of the stored (unrelocated) address at `at`. */
export function aamPointer(b: Uint8Array, l: AamLayout, at: number): number {
  return (rd32(b, at) - rd32(b, l.origin) + l.instruments) >>> 0;
}

export interface AamTrackEntry {
  /** File offset of the entry's first byte. */
  offset: number;
  noteBase?: number;
  instrumentBase?: number;
  repeats: number;
  pattern: number;
}

/** A voice's track list (channels 1..3), up to its loop byte (0xFF + restart offset). */
export function readAamTrackList(b: Uint8Array, l: AamLayout, channel: number): AamTrackEntry[] {
  let pos = aamPointer(b, l, l.voiceTable + VOICE_TABLE_ENTRY_SIZE * channel);
  const out: AamTrackEntry[] = [];
  while (pos < b.length && b[pos] !== 0xff) {
    const e: AamTrackEntry = { offset: pos, repeats: 0, pattern: 0 };
    let x = b[pos++];
    if (x >= 0x80) { e.noteBase = x & 0x7f; x = b[pos++]; }
    if (x >= 0x70) { e.instrumentBase = x & 0xf; x = b[pos++]; }
    if (x >= 0x60) { e.repeats = x & 0xf; x = b[pos++]; }
    e.pattern = x;
    out.push(e);
  }
  return out;
}

/** Bytes of the note-stream command at `pos`: the wire grammar, one place. */
export function aamCommandLen(b: Uint8Array, pos: number): number {
  const x = b[pos];
  if (x === AAM_PORTAMENTO) return 4; // params (speed << 4 | start step), from note, to note
  if (x === AAM_LEVEL) return 2;
  return 1;
}

export interface AamCommand { offset: number; bytes: number[] }

/** A pattern's note stream as commands, to and including its 0xFF / 0xFE terminator. Null when it runs off the file. */
export function splitAamPattern(b: Uint8Array, start: number): AamCommand[] | null {
  const out: AamCommand[] = [];
  let pos = start;
  while (pos < b.length) {
    const len = aamCommandLen(b, pos);
    if (pos + len > b.length) return null;
    out.push({ offset: pos, bytes: Array.from(b.subarray(pos, pos + len)) });
    const x = b[pos];
    pos += len;
    if (x === AAM_PATTERN_END || x === AAM_STOP) return out;
  }
  return null;
}

/** Concatenated command bytes: the encoder side of the carrier codec. */
export function encodeAamCommands(cmds: AamCommand[]): Uint8Array {
  return Uint8Array.from(cmds.flatMap((c) => c.bytes));
}

/** Indices of the patterns the three voices' track lists use, ascending. */
export function aamUsedPatterns(b: Uint8Array, l: AamLayout): number[] {
  const used = new Set<number>();
  for (let ch = 1; ch <= 3; ch++) for (const e of readAamTrackList(b, l, ch)) used.add(e.pattern);
  return [...used].sort((x, y) => x - y);
}

/** File offset of pattern `index`'s note stream. */
export function aamPatternOffset(b: Uint8Array, l: AamLayout, index: number): number {
  return aamPointer(b, l, l.patterns + 4 * index);
}
