/**
 * PTMExporter.ts - save a PolyTracker (.ptm) song by re-packing it from the edited song.
 *
 * Layout written: the original 608-byte header and sample headers (names, volume, speed, loop), the order list from
 * song.songPositions, every pattern re-packed (S3M-style rows: per row the cells in channel order, then a 0 byte), then each
 * sample's stored delta PCM copied from the original with its header offset moved. A song nothing was edited in comes back as the
 * module it was loaded from. Sample audio edits are not carried (the parser keeps the delta bytes only in the original module).
 * Cell mapping inverts PTMParser: note 97 -> 254, effect 0x53/0x8x (panning) -> command 8.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import { gridIsEdited } from '@/lib/song/gridBaseline';

export interface PTMExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const HEADER = 608;
const SAMPLE_HDR = 80;
const ROWS = 64;
const align16 = (n: number): number => (n + 15) & ~15;

/** Effect (effTyp, eff) back to a PTM (command, param); null when PTM has no such command. */
function ptmEffect(effTyp: number, eff: number): [number, number] | null {
  if (effTyp === 0 && eff === 0) return null;
  if (effTyp === 0x53 && (eff & 0xF0) === 0x80) return [0x08, ((eff & 0x0F) + 1) << 3];
  if (effTyp <= 0x0F) return [effTyp, eff & 0xFF];
  return null;
}

/** One pattern in PTM's packed form. */
export function packPTMPattern(pattern: Pattern, numChannels: number): Uint8Array {
  const out: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const cell: TrackerCell | undefined = pattern.channels[ch]?.rows[row];
      if (!cell) continue;
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const fx = ptmEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const vol = Math.min(64, cell.volume ?? 0);
      const hasNote = note !== 0 || instr !== 0;
      if (!hasNote && !fx && vol === 0) continue;
      out.push(ch | (hasNote ? 0x20 : 0) | (fx ? 0x40 : 0) | (vol ? 0x80 : 0));
      if (hasNote) out.push(note === 97 ? 254 : note >= 1 && note <= 120 ? note : 0, instr & 0xFF);
      if (fx) out.push(fx[0], fx[1]);
      if (vol) out.push(vol);
    }
    out.push(0);
  }
  return new Uint8Array(out);
}

export async function exportPTM(song: TrackerSong): Promise<PTMExportResult> {
  const srcBuf = song.uadeEditableFileData;
  if (!srcBuf) throw new Error('PolyTracker export needs the module the song was loaded from');
  const src = new Uint8Array(srcBuf);
  const v = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const name = (song.uadeEditableFileName ?? 'module.ptm').split('/').pop() ?? 'module.ptm';
  const warnings: string[] = [];

  const numSamples = v.getUint16(34, true);
  const numChannels = v.getUint16(38, true);
  const origOrders: number[] = [];
  let origRestart = 0;
  for (let i = 0; i < v.getUint16(32, true); i++) {
    const o = src[96 + i];
    if (o === 0xFF) break;
    if (o === 0xFE) { origRestart = origOrders.length; continue; }
    origOrders.push(o);
  }
  const ordersSame = origRestart === song.restartPosition && origOrders.length === song.songPositions.length && origOrders.every((o, i) => o === song.songPositions[i]);
  if (!gridIsEdited(song.patterns) && ordersSame && song.patterns.length === v.getUint16(36, true)) return { data: src.slice(), filename: name, warnings };

  const numPatterns = Math.min(128, song.patterns.length);
  if (song.patterns.length > 128) warnings.push(`${song.patterns.length - 128} pattern(s) beyond PTM's limit of 128 were not saved`);

  // Order list: a 0xFE loop marker at the restart position, 0xFF to end when there is room.
  const orders: number[] = [];
  song.songPositions.forEach((p, i) => { if (i === song.restartPosition && i > 0) orders.push(0xFE); orders.push(p); });
  if (orders.length < 256) orders.push(0xFF);
  if (orders.length > 256) { orders.length = 256; warnings.push('Order list longer than PTM allows; the tail was dropped'); }

  const patBytes = song.patterns.slice(0, numPatterns).map((p) => packPTMPattern(p, numChannels));
  const head = src.slice(0, HEADER + numSamples * SAMPLE_HDR);
  const hv = new DataView(head.buffer);
  hv.setUint16(32, orders.length, true);
  hv.setUint16(36, numPatterns, true);
  head.fill(0xFF, 96 + orders.length, 96 + 256);
  head.set(orders, 96);
  head.fill(0, 352, 352 + 256);

  let pos = align16(head.length);
  patBytes.forEach((b, i) => { hv.setUint16(352 + i * 2, pos / 16, true); pos = align16(pos + b.length); });
  const patRegionEnd = pos;
  const pcm: Array<{ at: number; bytes: Uint8Array }> = [];
  for (let s = 0; s < numSamples; s++) {
    const h = HEADER + s * SAMPLE_HDR;
    const off = v.getUint32(h + 18, true);
    const len = v.getUint32(h + 22, true);
    if (off === 0 || len === 0 || off + len > src.length) { hv.setUint32(h + 18, 0, true); continue; }
    hv.setUint32(h + 18, pos, true);
    pcm.push({ at: pos, bytes: src.subarray(off, off + len) });
    pos += len;
  }
  const out = new Uint8Array(pos);
  out.set(head, 0);
  let at = align16(head.length);
  for (let i = 0; i < patBytes.length; i++) { out.set(patBytes[i], at); at = align16(at + patBytes[i].length); }
  if (at !== patRegionEnd) throw new Error('PTM pattern layout mismatch');
  for (const p of pcm) out.set(p.bytes, p.at);
  return { data: out, filename: name, warnings };
}
