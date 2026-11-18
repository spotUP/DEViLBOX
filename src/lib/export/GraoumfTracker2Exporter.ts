/**
 * GraoumfTracker2Exporter.ts - save a Graoumf Tracker 2 (.gt2) song by re-packing the PATD cells and the SONG order list.
 *
 * The loaded module is re-parsed for the baseline. A cell equal to the baseline keeps its original 5 bytes; a changed cell
 * is re-encoded through the inverse of the parser's effect translation (first source effect that decodes to it) and the
 * pattern's own volume coding. The SONG chunk is rebuilt when the order list changed; every other chunk, the tail after
 * ENDC and the header are copied byte for byte (the song name is patched in the header). Not rewritten: instruments,
 * samples, speed and tempo (edits are reported in `warnings`). A value GT2 cannot hold is dropped and reported.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { parseGraoumfTracker2File, readGT2Chunks, translateEffect } from '@/lib/import/formats/GraoumfTracker2Parser';
import { sameInstr } from './MDLExporter';

export interface GT2ExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const ID_SONG = 0x534F4E47, ID_PATD = 0x50415444;
const u16 = (d: Uint8Array, o: number): number => (d[o] << 8) | d[o + 1];
const key = (c: Partial<TrackerCell> | undefined): string =>
  c ? [c.note ?? 0, c.instrument ?? 0, c.volume ?? 0, c.effTyp ?? 0, c.eff ?? 0].join(',') : '0,0,0,0,0';

let rev: Map<number, [number, number]> | null = null;
/** (effTyp, eff) -> first (effect, param) bytes the parser decodes to it. */
function reverseEffect(t: number, e: number): [number, number] | null {
  if (!rev) {
    rev = new Map();
    for (let fx = 1; fx < 256; fx++) for (let p = 0; p < 256; p++) {
      const r = translateEffect(fx, p, false);
      if ((r.effTyp || r.eff) && !rev.has(r.effTyp * 256 + r.eff)) rev.set(r.effTyp * 256 + r.eff, [fx, p]);
    }
  }
  return rev.get(t * 256 + e) ?? null;
}

export async function exportGraoumfTracker2(song: TrackerSong): Promise<GT2ExportResult> {
  const srcBuf = song.uadeEditableFileData;
  if (!srcBuf) throw new Error('GT2 export needs the module the song was loaded from');
  const src = new Uint8Array(srcBuf.slice(0));
  const name = (song.uadeEditableFileName ?? 'module.gt2').split('/').pop() ?? 'module.gt2';
  const base = parseGraoumfTracker2File(src, name);
  if (!base) throw new Error('GT2 export: the loaded module no longer parses');
  const warned = new Map<string, number>();
  const warn = (m: string): void => { warned.set(m, (warned.get(m) ?? 0) + 1); };

  const chunks = readGT2Chunks(src, Math.max(new DataView(src.buffer).getUint32(4), 236));
  const songCh = chunks.find((c) => c.id === ID_SONG);
  if (!songCh) throw new Error('GT2 export needs a SONG chunk');
  const nOrd = u16(src, songCh.offset);
  const baseOrders = Array.from({ length: Math.min(nOrd, (songCh.length - 4) >> 1) }, (_, i) => u16(src, songCh.offset + 4 + i * 2));
  const patd = new Map<number, { cells: number; tracks: number; rows: number; coding: number }>();
  for (const c of chunks) {
    if (c.id !== ID_PATD || c.length < 24) continue;
    const coding = u16(src, c.offset + 18), rows = u16(src, c.offset + 20), tracks = u16(src, c.offset + 22);
    if (coding > 1 || !rows || !tracks || c.length < 24 + rows * tracks * 5) continue;
    patd.set(u16(src, c.offset), { cells: c.offset + 24, tracks, rows, coding });
  }

  const written = new Map<string, string>();
  const slots = Math.min(song.patterns.length, base.patterns.length);
  if (song.patterns.length !== base.patterns.length) warn('adding or removing patterns is not written to GT2; only the loaded patterns were saved');
  for (let k = 0; k < slots; k++) {
    const sp = song.patterns[k], bp = base.patterns[k];
    const info = patd.get(baseOrders[k]);
    if (!info) continue;
    if (sp.length !== bp.length) warn('changing a pattern length is not written to GT2');
    for (let ch = 0; ch < info.tracks; ch++) for (let r = 0; r < info.rows; r++) {
      const cur = sp.channels[ch]?.rows[r], old = bp.channels[ch]?.rows[r];
      if (key(cur) === key(old)) continue;
      const at = info.cells + (r * info.tracks + ch) * 5;
      const slot = `${baseOrders[k]}:${r}:${ch}`;
      if (written.has(slot) && written.get(slot) !== key(cur)) warn('a pattern used at several order positions was edited differently; the last edit won');
      written.set(slot, key(cur));
      const note = cur?.note ?? 0;
      let nb = 0;
      if (note >= 2 && note <= 121) nb = note - 1;
      else if (note) warn(`note ${note} is outside GT2's range and was dropped`);
      let fx = 0, fp = 0;
      const t = cur?.effTyp ?? 0, e = cur?.eff ?? 0;
      if (t || e) {
        const m = reverseEffect(t, e);
        if (m) [fx, fp] = m; else warn(`effect ${t.toString(16)}${e.toString(16).padStart(2, '0')} cannot be written in GT2 and was dropped`);
      }
      if (cur?.effTyp2 || cur?.eff2) warn('GT2 has one effect per cell; the second effect was dropped');
      const vol = cur?.volume ?? 0;
      // shortcut: volume 64 in coding 0 saves as 255 (decodes to 63), the byte is 6 bits wide of 0..255.
      const vb = vol ? Math.min(255, info.coding === 0 ? vol * 4 : vol + 0x10) : 0;
      src.set([nb, (cur?.instrument ?? 0) & 0xFF, fx, fp, vb], at);
    }
  }

  const positions = song.songPositions.filter((p) => p < baseOrders.length);
  if (positions.length !== song.songPositions.length) warn('order entries pointing at missing patterns were dropped');
  const newOrders = positions.map((p) => baseOrders[p]);
  const ordersChanged = newOrders.length !== baseOrders.length || newOrders.some((o, i) => o !== baseOrders[i]);

  if (song.name !== base.name) {
    const nm = Array.from((song.name ?? '').slice(0, 32), (c) => c.charCodeAt(0) & 0xFF);
    for (let i = 0; i < 32; i++) src[8 + i] = nm[i] ?? 0x20;
  }
  if (song.initialSpeed !== base.initialSpeed || song.initialBPM !== base.initialBPM) warn('speed and tempo edits are not written to GT2');
  const ins = song.instruments ?? [];
  if (ins.length !== base.instruments.length || ins.some((x, i) => !sameInstr(x, base.instruments[i]))) {
    warn('instrument and sample edits are not written to GT2; the module keeps its loaded instruments and samples');
  }

  const warnings = [...warned].map(([m, n]) => (n > 1 ? `${m} (${n}x)` : m));
  if (!ordersChanged) return { data: src, filename: name, warnings };
  const keep = src.subarray(songCh.offset + 4 + baseOrders.length * 2, songCh.offset + songCh.length);
  const body = new Uint8Array(4 + newOrders.length * 2 + keep.length);
  body.set(src.subarray(songCh.offset, songCh.offset + 4));
  body[0] = newOrders.length >> 8; body[1] = newOrders.length & 0xFF;
  newOrders.forEach((o, i) => { body[4 + i * 2] = o >> 8; body[5 + i * 2] = o & 0xFF; });
  body.set(keep, 4 + newOrders.length * 2);
  const hdr = src.slice(songCh.offset - 8, songCh.offset);
  new DataView(hdr.buffer).setUint32(4, body.length + 8);
  const end = songCh.offset + songCh.length;
  const out = new Uint8Array(songCh.offset - 8 + 8 + body.length + (src.length - end));
  out.set(src.subarray(0, songCh.offset - 8));
  out.set(hdr, songCh.offset - 8);
  out.set(body, songCh.offset);
  out.set(src.subarray(end), songCh.offset + body.length);
  return { data: out, filename: name, warnings };
}
