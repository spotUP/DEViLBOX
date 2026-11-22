/**
 * SeanConnollyGrid.ts - the tick grid of the Sean Connolly sampler family (v2, "Surf Ninjas").
 * Grammar (third-party/nuade/players/seanconnolly/sc_module.c, sc_v2.c): the tables are the targets of `lea d16(pc)`
 * slots of the driver code (`entry = 2 + int16 at 2`, target = slot word address + its signed displacement); every slot of
 * a role names the same address, which identifies the build. Subsong 0: voice i reads its stream at
 * streams + u32(songs + i*4). Stream: $FE end, $FD n fade, $Fx speed, $Cx transposition, $8x pattern repeat, $6x/$7x
 * instrument offset, otherwise a pattern number (pattern = pattern_data + u32(pattern_table + n*4)); a $FF after it jumps.
 * Pattern (ends $FF): $FE start rate note slide, $FD n, $FC rest, $FB hi lo, $FA/$F9, $F8 n, $Cx instrument, $8x length,
 * $6x/$7x hold, otherwise a note (period table word at (note + transposition) * 2). A note or a rest ends an event.
 * Each pattern is a file block whose `blockRows` carry its bytes; `noteBytes` name the note byte of the first event that
 * plays at each grid cell (docs/FORMAT_COMMAND_STREAM_GRID.md).
 * shortcut: v2 only (the v3 Sequencer builds fall back to the placeholder grid); the grid plays each voice up to its first
 * jump or end; an event lasts length * speed * (hold + 1) ticks and the idle tick between two patterns is not counted; a
 * pattern played again shows on every play but only its first play writes back.
 */
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { seanConnollyEncoder } from '@/engine/uade/encoders/SeanConnollyEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const NUM_CHANNELS = 4;
const MAX_TICKS = 24000;
const MAX_ROWS = 4096;
const MAX_STEPS = 4096;
const CODE_LEN = 0xef6;

type Role = 'songs' | 'streams' | 'patternTable' | 'patternData' | 'period' | 'other';
/** The slots of the Surf Ninjas build (sco_surf_slots), by offset from the entry. */
const SLOTS: Array<[Role, number]> = [
  ['songs', 0x8], ['songs', 0xc0], ['other', 0x386], ['other', 0x428], ['other', 0x54e], ['other', 0x58c], ['other', 0x5c0],
  ['other', 0x5c8], ['period', 0x63e], ['period', 0x660], ['other', 0x6b8], ['other', 0x6c4], ['other', 0x774], ['other', 0x7b8],
  ['period', 0x7e6], ['other', 0x82e], ['other', 0x836], ['period', 0x880], ['period', 0x8b2], ['period', 0x914],
  ['streams', 0x95e], ['patternTable', 0xa98], ['patternData', 0xaa0], ['period', 0xad8], ['period', 0xc6a], ['other', 0xca2],
  ['other', 0xd40], ['other', 0xd66], ['other', 0xd6e], ['other', 0xde2], ['other', 0xe0a], ['period', 0xe1e], ['other', 0xed0],
  ['other', 0xed8],
];

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : -1);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);

export interface ScV2Tables { songs: number; streams: number; patternTable: number; patternData: number; period: number }

export function seanConnollyV2Tables(b: Uint8Array): ScV2Tables | null {
  if (b.length < 0x1000 || b[0] !== 0x60 || b[1] !== 0) return null;
  const entry = 2 + s16(b, 2);
  if (entry < 0 || entry + CODE_LEN > b.length) return null;
  const found = new Map<string, number>();
  for (const [role, at] of SLOTS) {
    const word = entry + at;
    const target = word + s16(b, word);
    if (target < entry + CODE_LEN || target > b.length) return null;
    const key = role === 'other' ? `other${at}` : role;
    if (found.has(key) && found.get(key) !== target) return null;
    found.set(key, target);
  }
  return {
    songs: found.get('songs')!, streams: found.get('streams')!, patternTable: found.get('patternTable')!,
    patternData: found.get('patternData')!, period: found.get('period')!,
  };
}

interface ScEvent { tick: number; at: number; period: number; inst: number }

const NOTE_LIMIT = 0x60;

/** End offset (after the $FF) of the pattern at `p`, or -1. */
function patternEnd(b: Uint8Array, p: number): number {
  for (let n = 0; n < 4096 && p >= 0 && p < b.length; n++) {
    const e = b[p];
    if (e === 0xff) return p + 1;
    if (e === 0xfe) p += 4;
    else if (e === 0xfd || e === 0xf8) p += 2;
    else if (e === 0xfb) p += 3;
    else p += 1;
  }
  return -1;
}

interface Walk { events: ScEvent[]; patterns: number[] }

function walkVoice(b: Uint8Array, t: ScV2Tables, stream: number): Walk | null {
  const events: ScEvent[] = [];
  const patterns: number[] = [];
  let pos = 0;
  let tick = 0;
  let speed = 6;
  let transpose = 0;
  let instOffset = 0;
  const period = (note: number): number => { const w = u16(b, t.period + ((note + transpose) & 0xff) * 2); return w > 0 ? w : 0; };
  for (let n = 0; n < MAX_STEPS && tick < MAX_TICKS; n++) {
    let byte = b[stream + pos];
    if (byte === undefined) return null;
    if (byte === 0xfe) break;
    if (byte === 0xfd) { pos += 2; byte = b[stream + pos]; }
    if ((byte & 0xf0) === 0xf0) { speed = Math.max(1, byte & 0xf); byte = b[++pos + stream]; }
    let repeat = 0;
    for (let g = 0; g < 16; g++) {
      if ((byte & 0xc0) === 0xc0) { transpose = byte & 0x3f; byte = b[++pos + stream]; }
      if ((byte & 0x80) === 0x80) { repeat = byte & 0x3f; byte = b[++pos + stream]; }
      if ((byte & 0x70) === 0x70 || (byte & 0x60) === 0x60) { instOffset = byte & 0x1f; byte = b[++pos + stream]; continue; }
      break;
    }
    const jump = b[stream + pos + 1] === 0xff;
    const addr = t.patternData + u32(b, t.patternTable + (byte & 0x7f) * 4);
    const end = patternEnd(b, addr);
    if (end < 0) return null;
    patterns.push(addr);
    for (let r = 0; r <= repeat; r++) {
      let length = 1;
      let hold = 0;
      let inst = 0;
      for (let p = addr; p < end - 1;) {
        const e = b[p];
        if (e === 0xfe) {
          events.push({ tick, at: p + 3, period: period(b[p + 1]), inst });
          tick += speed * length * (hold + 1); hold = 0; p += 4;
        } else if (e === 0xfc) {
          tick += speed * length * (hold + 1); hold = 0; p += 1;
        } else if (e === 0xfd || e === 0xf8) p += 2;
        else if (e === 0xfb) p += 3;
        else if (e >= 0xf9) p += 1;
        else if ((e & 0xc0) === 0xc0) { inst = (e & 0x3f) + instOffset; p += 1; }
        else if (e & 0x80) { length = e - 0x7f; p += 1; }
        else if ((e & 0x70) === 0x70 || (e & 0x60) === 0x60) { hold = (e - 0x5d) & 0x3f; p += 1; }
        else {
          events.push({ tick, at: p, period: period(e), inst });
          tick += speed * length * (hold + 1); hold = 0; p += 1;
        }
      }
    }
    if (jump) break;
    pos += 1;
  }
  return { events, patterns };
}

const gcd = (a: number, c: number): number => (c === 0 ? a : gcd(c, a % c));
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function carrierRows(b: Uint8Array, start: number, size: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p < start + size;) {
    const n = Math.min(3, start + size - p);
    rows.push({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
    } as TrackerCell);
    p += n;
  }
  return rows;
}

export interface ScGrid { pattern: Pattern; layout: UADEVariablePatternLayout; rowTicks: number }

/** The grid and layout of subsong 0 of a v2 module, or null when it is not one or leaves the file. */
export function buildSeanConnollyGrid(buf: Uint8Array): ScGrid | null {
  const t = seanConnollyV2Tables(buf);
  if (!t) return null;
  const voices: ScEvent[][] = [];
  const addrs = new Set<number>();
  for (let v = 0; v < NUM_CHANNELS; v++) {
    const stream = t.streams + u32(buf, t.songs + v * 4);
    if (stream < 0 || stream >= buf.length) return null;
    const w = walkVoice(buf, t, stream);
    if (!w) return null;
    voices.push(w.events);
    w.patterns.forEach((a) => addrs.add(a));
  }
  const blocks = [...addrs].sort((a, c) => a - c).map((start) => ({ start, size: patternEnd(buf, start) - start }));
  for (let i = 1; i < blocks.length; i++) if (blocks[i - 1].start + blocks[i - 1].size > blocks[i].start) return null;
  if (!blocks.length) return null;

  const all = voices.flat();
  const durations = all.flatMap((e, i, l) => [e.tick, l[i + 1] && l[i + 1].tick > e.tick ? l[i + 1].tick - e.tick : 0]);
  const rowTicks = Math.max(1, durations.reduce(gcd, 0));
  const lastTick = Math.max(0, ...all.map((e) => e.tick));
  const rowCount = Math.min(MAX_ROWS, Math.max(1, Math.floor(lastTick / rowTicks) + 1));
  const pattern: Pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: rowCount,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: rowCount }, emptyCell),
    })),
  };
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const written = new Set<number>();
  voices.forEach((events, channel) => {
    for (const e of events) {
      const row = Math.floor(e.tick / rowTicks);
      if (row >= rowCount) break;
      const cell = pattern.channels[channel].rows[row];
      const note = e.period ? periodToGridNote(e.period) : 0;
      if (cell.note !== 0 || note === 0) continue;
      cell.note = note;
      cell.instrument = e.inst + 1;
      if (!written.has(e.at) && buf[e.at] < NOTE_LIMIT) { written.add(e.at); noteBytes.push({ pattern: 0, channel, row, offset: e.at, note }); }
    }
  });
  const layout: UADEVariablePatternLayout = {
    formatId: 'seanConnolly', numChannels: NUM_CHANNELS, numFilePatterns: blocks.length, rowsPerPattern: rowCount,
    moduleSize: buf.length, encoder: seanConnollyEncoder,
    filePatternAddrs: blocks.map((x) => x.start), filePatternSizes: blocks.map((x) => x.size),
    trackMap: [Array.from({ length: NUM_CHANNELS }, () => -1)],
    blockRows: blocks.map((x) => carrierRows(buf, x.start, x.size)),
    noteBytes,
  };
  return { pattern, layout, rowTicks };
}
