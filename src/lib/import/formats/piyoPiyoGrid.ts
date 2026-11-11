/**
 * piyoPiyoGrid.ts - PiyoPiyo (.pmd, Studio Pixel) module carrier and grid mapping.
 *
 * File layout (read from public/piyopiyo/PiyoPiyo.worklet.js parsePmd): "PMD"
 * magic, u32 waitMs @8, repeatStart @12, repeatEnd @16, records @20. Three
 * melody blocks of 340 bytes from 0x18 (octave u8 at +0), then the drum volume.
 * Events from 0x418: four tracks (three melody, one drum) of `records` u32. Bits
 * 0-23 of an event are the piano keys down at that step (a chord); bits 24-31 are
 * the pan (0 keeps the running pan).
 *
 * The carrier is the original image; an edit rewrites the event words it touches
 * and nothing else (same length, no record added or removed).
 *
 * Grid mapping:
 *  - One row per record, cut into 64-row patterns. A track owns as many lanes
 *    (channels) as its widest chord; lane l shows the l-th lowest key down.
 *  - note = 13 + key + 12 * octave for melody (the track's own header octave),
 *    13 + key for drums. Measured: octave 0 key 0 is 32.6 Hz = C1, and note 13 is C-1.
 *  - instrument = track + 1. Pan on lane 0: effTyp2 8, eff2 = the raw pan byte.
 */
import type { TrackerCell } from '@/types';

export const PIYOPIYO_ROWS = 64;
export const PIYOPIYO_TRACKS = 4;
export const PIYOPIYO_KEYS = 24;
const EVENTS_AT = 0x418;
const NOTE_BIAS = 13;
const PAN_EFFECT = 8;

export interface PiyoPiyoModule {
  records: number;
  octaves: [number, number, number];
  /** Lanes (channels) each track owns, and the first channel of each. */
  lanes: number[];
  firstChannel: number[];
  channels: number;
  patterns: number;
  image: Uint8Array;
}

const u32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const popcount = (v: number): number => { let n = 0; for (let x = v; x; x &= x - 1) n++; return n; };

export const piyoPiyoEventAt = (image: Uint8Array, records: number, t: number, r: number): number =>
  u32(image, EVENTS_AT + (t * records + r) * 4);

/** The module, or null when the bytes are not a PMD file holding all the records its header announces. */
export function decodePiyoPiyoModule(bytes: Uint8Array): PiyoPiyoModule | null {
  if (bytes.length <= EVENTS_AT || bytes[0] !== 0x50 || bytes[1] !== 0x4d || bytes[2] !== 0x44) return null;
  const records = u32(bytes, 20);
  if (EVENTS_AT + records * 16 > bytes.length) return null;
  const lanes: number[] = new Array<number>(PIYOPIYO_TRACKS).fill(1);
  for (let t = 0; t < PIYOPIYO_TRACKS; t++) {
    for (let r = 0; r < records; r++) {
      const n = popcount(piyoPiyoEventAt(bytes, records, t, r) & 0xffffff);
      if (n > lanes[t]) lanes[t] = n;
    }
  }
  const firstChannel: number[] = [];
  let channels = 0;
  for (let t = 0; t < PIYOPIYO_TRACKS; t++) { firstChannel.push(channels); channels += lanes[t]; }
  return {
    records,
    octaves: [bytes[0x18], bytes[0x18 + 340], bytes[0x18 + 680]],
    lanes, firstChannel, channels,
    patterns: Math.max(1, Math.ceil(records / PIYOPIYO_ROWS)),
    image: bytes.slice(),
  };
}

const keysOf = (ev: number): number[] => {
  const ks: number[] = [];
  for (let k = 0; k < PIYOPIYO_KEYS; k++) if (ev & (1 << k)) ks.push(k);
  return ks;
};
const octaveShift = (m: Pick<PiyoPiyoModule, 'octaves'>, t: number): number => (t < 3 ? 12 * m.octaves[t] : 0);

/** The grid cell lane `lane` of track t shows for event word `ev`. */
export function piyoPiyoEventCell(m: Pick<PiyoPiyoModule, 'octaves'>, t: number, lane: number, ev: number): TrackerCell {
  const cell: TrackerCell = { note: 0, instrument: t + 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const key = keysOf(ev)[lane];
  if (key !== undefined) {
    const note = NOTE_BIAS + key + octaveShift(m, t);
    if (note <= 96) cell.note = note;
  }
  const pan = ev >>> 24;
  if (lane === 0 && pan !== 0) { cell.effTyp2 = PAN_EFFECT; cell.eff2 = pan; }
  return cell;
}

export interface PiyoPiyoGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

/**
 * The file bytes with grid edits written into the events they sit on; the same
 * array when no cell differs from what it shows. A lane edit swaps only that
 * lane's key, so the other keys of the chord (and keys the grid cannot show) stay.
 */
export function applyPiyoPiyoGridEdits(bytes: Uint8Array, edits: readonly PiyoPiyoGridEdit[]): Uint8Array {
  const m = decodePiyoPiyoModule(bytes);
  if (!m) return bytes;
  const out = m.image;
  const original = new Map<string, number>();
  const next = new Map<string, number>();
  const removed = new Map<string, number>();
  const added = new Map<string, number>();
  for (const e of edits) {
    const r = e.pattern * PIYOPIYO_ROWS + e.row;
    if (e.pattern < 0 || e.row < 0 || e.row >= PIYOPIYO_ROWS || r >= m.records) continue;
    let t = PIYOPIYO_TRACKS - 1;
    while (t > 0 && e.channel < m.firstChannel[t]) t--;
    const lane = e.channel - m.firstChannel[t];
    if (e.channel < 0 || lane >= m.lanes[t]) continue;
    const id = `${t}:${r}`;
    if (!original.has(id)) original.set(id, piyoPiyoEventAt(out, m.records, t, r));
    let ev = next.get(id) ?? original.get(id)!;
    const before = piyoPiyoEventCell(m, t, lane, original.get(id)!);
    const c = e.cell;
    if ((c.note ?? 0) !== before.note) {
      const oldKey = keysOf(original.get(id)!)[lane];
      const note = c.note ?? 0;
      const key = note - NOTE_BIAS - octaveShift(m, t);
      // A note outside the track's keys changes nothing; note 0 clears the lane's key.
      if (note === 0 && oldKey !== undefined) removed.set(id, (removed.get(id) ?? 0) | (1 << oldKey));
      else if (note !== 0 && key >= 0 && key < PIYOPIYO_KEYS) {
        if (oldKey !== undefined) removed.set(id, (removed.get(id) ?? 0) | (1 << oldKey));
        added.set(id, (added.get(id) ?? 0) | (1 << key));
      }
    }
    if (lane === 0) {
      if ((c.effTyp2 ?? 0) === PAN_EFFECT && (c.eff2 ?? 0) !== before.eff2) ev = ((ev & 0xffffff) | (((c.eff2 ?? 0) & 0xff) << 24)) >>> 0;
      else if ((c.effTyp2 ?? 0) === 0 && before.effTyp2 === PAN_EFFECT) ev = ev & 0xffffff;
    }
    next.set(id, ev);
  }
  let changed = false;
  for (const [id, ev0] of next) {
    const keys = ((ev0 & ~(removed.get(id) ?? 0)) | (added.get(id) ?? 0)) & 0xffffff;
    const ev = (((ev0 & 0xff000000) | keys) >>> 0);
    if (ev === original.get(id)) continue;
    const [t, r] = id.split(':').map(Number);
    const at = EVENTS_AT + (t * m.records + r) * 4;
    out[at] = ev & 0xff; out[at + 1] = (ev >>> 8) & 0xff; out[at + 2] = (ev >>> 16) & 0xff; out[at + 3] = ev >>> 24;
    changed = true;
  }
  return changed ? out : bytes;
}
