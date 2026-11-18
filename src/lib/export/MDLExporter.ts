/**
 * MDLExporter.ts - save a Digitrakker (.mdl) song by re-packing the IN order list, the PA pattern table and the TR track pool.
 *
 * MDL keeps every pattern column as a shared, run-length coded track. The loaded module is re-parsed to get the baseline:
 * a column whose cells equal the baseline keeps its original track number (its bytes stay in the pool); a changed column
 * is encoded as a new track appended to the pool (empty-run and new-note codes only, through the exact inverse of the
 * parser's effect decoders); an all-empty column becomes track 0. Unchanged pattern headers are copied verbatim. Every
 * other chunk (messages, instruments, envelopes, sample info and audio) is copied byte for byte. Song name, speed and tempo
 * are patched in IN. Not rewritten: instruments and samples (edits to them are reported in `warnings`).
 * A value MDL cannot hold is dropped and reported, never silently.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { convertMDLCommand, parseMDLFile } from '@/lib/import/formats/MDLParser';

export interface MDLExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const KEYOFF = 97;
const key = (c: Partial<TrackerCell> | undefined): string =>
  c ? [c.note ?? 0, c.instrument ?? 0, c.volume ?? 0, c.effTyp ?? 0, c.eff ?? 0, c.effTyp2 ?? 0, c.eff2 ?? 0].join(',') : '0,0,0,0,0,0,0';
const EMPTY = key(undefined);

/** (effTyp, eff) -> first (nibble, param) the parser decodes to it, per effect slot. */
const rev: [Map<number, [number, number]> | null, Map<number, [number, number]> | null] = [null, null];
function reverseEffect(slot: 0 | 1, t: number, e: number): [number, number] | null {
  let m = rev[slot];
  if (!m) {
    m = new Map();
    for (let nib = 1; nib < 16; nib++) {
      const cmd = slot === 1 && nib <= 6 ? nib + 15 : nib;
      for (let p = 0; p < 256; p++) {
        const r = convertMDLCommand(cmd, p);
        if ((r.effTyp || r.eff) && !m.has(r.effTyp * 256 + r.eff)) m.set(r.effTyp * 256 + r.eff, [nib, p]);
      }
    }
    rev[slot] = m;
  }
  return m.get(t * 256 + e) ?? null;
}

/** One column of cells to a track byte stream (trailing empty rows are left out). */
function encodeTrack(cells: Array<TrackerCell | undefined>, warn: (m: string) => void): number[] {
  const out: number[] = [];
  let last = cells.length - 1;
  while (last >= 0 && key(cells[last]) === EMPTY) last--;
  let skip = 0;
  const flush = (): void => { while (skip > 0) { const n = Math.min(skip, 64); out.push((n - 1) << 2); skip -= n; } };
  for (let r = 0; r <= last; r++) {
    const c = cells[r];
    if (key(c) === EMPTY) { skip++; continue; }
    flush();
    const note = c?.note ?? 0, instr = c?.instrument ?? 0, vol = c?.volume ?? 0;
    let a: [number, number] | null = null, b: [number, number] | null = null;
    let t1 = c?.effTyp ?? 0, e1 = c?.eff ?? 0;
    const t2 = c?.effTyp2 ?? 0, e2 = c?.eff2 ?? 0;
    if (t1 || e1) {
      a = reverseEffect(0, t1, e1);
      if (!a && !(t2 || e2)) { b = reverseEffect(1, t1, e1); if (b) t1 = e1 = 0; }
      if (!a && !b) warn(`effect ${t1.toString(16)}${e1.toString(16).padStart(2, '0')} cannot be written in MDL and was dropped`);
    }
    if (t2 || e2) {
      b = reverseEffect(1, t2, e2);
      if (!b) warn(`effect ${t2.toString(16)}${e2.toString(16).padStart(2, '0')} cannot be written in MDL and was dropped`);
    }
    let flags = 0;
    const body: number[] = [];
    if (note) {
      if (note === KEYOFF) body.push(0xFF);
      else if (note >= 1 && note <= 120) body.push(note);
      else { warn(`note ${note} is outside MDL's range and was dropped`); body.push(0); }
      flags |= 1;
    }
    if (instr) { flags |= 2; body.push(instr & 0xFF); }
    if (vol) { flags |= 4; body.push(Math.min(255, vol * 4)); }
    if (a || b) {
      flags |= 8; body.push(((b?.[0] ?? 0) << 4) | (a?.[0] ?? 0));
      if (a && a[1]) { flags |= 16; body.push(a[1]); }
      if (b && b[1]) { flags |= 32; body.push(b[1]); }
    }
    out.push((flags << 2) | 3, ...body);
  }
  return out;
}

const u16 = (n: number): number[] => [n & 0xFF, (n >> 8) & 0xFF];
const u32 = (n: number): number[] => [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF];
const rd16 = (d: Uint8Array, o: number): number => d[o] | (d[o + 1] << 8);

export const sameInstr = (a: unknown, b: unknown): boolean => {
  const x = a as { name?: string; volume?: number; sample?: { audioBuffer?: ArrayBuffer } };
  const y = b as typeof x;
  if (x.name !== y.name || x.volume !== y.volume) return false;
  const p = x.sample?.audioBuffer, q = y.sample?.audioBuffer;
  if (!p || !q) return !p === !q;
  return p.byteLength === q.byteLength && Buffer.compare(Buffer.from(p), Buffer.from(q)) === 0;
};

export async function exportMDL(song: TrackerSong): Promise<MDLExportResult> {
  const srcBuf = song.uadeEditableFileData;
  if (!srcBuf) throw new Error('MDL export needs the module the song was loaded from');
  const src = new Uint8Array(srcBuf);
  const name = (song.uadeEditableFileName ?? 'module.mdl').split('/').pop() ?? 'module.mdl';
  const base = await parseMDLFile(srcBuf.slice(0), name);
  const warned = new Map<string, number>();
  const warn = (m: string): void => { warned.set(m, (warned.get(m) ?? 0) + 1); };
  const version = src[4];

  // chunk list in file order
  const chunks: Array<{ id: number; at: number; len: number }> = [];
  for (let o = 5; o + 6 <= src.length;) {
    const len = src[o + 2] | (src[o + 3] << 8) | (src[o + 4] << 16) | (src[o + 5] << 24 >>> 0);
    if (o + 6 + len > src.length) break;
    chunks.push({ id: rd16(src, o), at: o, len });
    o += 6 + len;
  }
  const tail = chunks.length ? chunks[chunks.length - 1].at + 6 + chunks[chunks.length - 1].len : 5;
  const find = (id: number) => chunks.find((c) => c.id === id);
  const IN = find(0x4E49), PA = find(0x4150), TR = find(0x5254);
  if (!IN || !PA || !TR) throw new Error('MDL export needs IN, PA and TR chunks');

  // original track pool
  const nTracksOrig = rd16(src, TR.at + 6);
  const pool: Uint8Array[] = [new Uint8Array(0)];
  for (let i = 0, o = TR.at + 8; i < nTracksOrig; i++) {
    const n = rd16(src, o);
    pool.push(src.subarray(o + 2, o + 2 + n));
    o += 2 + n;
  }
  const added = new Map<string, number>();
  const trackFor = (bytes: number[]): number => {
    if (!bytes.length) return 0;
    if (bytes.length > 0xFFFF) { warn('a track longer than 65535 bytes was cut'); bytes = bytes.slice(0, 0xFFFF); }
    const k = bytes.join(',');
    let n = added.get(k);
    if (n === undefined) {
      if (pool.length > 0xFFFF) { warn('more than 65535 tracks; the column was left empty'); return 0; }
      n = pool.length; pool.push(Uint8Array.from(bytes)); added.set(k, n);
    }
    return n;
  };

  // original patterns: header + table spans
  const paAt = PA.at + 6;
  const origPats = src[paAt];
  const spans: Array<{ from: number; to: number; chans: number; rows: number; name: string }> = [];
  for (let p = 0, o = paAt + 1; p < origPats; p++) {
    const from = o;
    let chans = 32, rows = 64, nm = '';
    if (version >= 0x10) { chans = src[o]; rows = src[o + 1] + 1; nm = String.fromCharCode(...src.subarray(o + 2, o + 18).filter((c) => c)).trim(); o += 18; }
    o += chans * 2;
    spans.push({ from, to: o, chans, rows, name: nm });
  }

  const numPats = Math.min(255, song.patterns.length);
  if (song.patterns.length > 255) warn('patterns beyond MDL limit of 255 were not saved');
  let changed = numPats !== origPats;
  const paParts: number[][] = [];
  const paCopy: Array<Uint8Array | null> = [];
  for (let p = 0; p < numPats; p++) {
    const pat = song.patterns[p];
    const bp = base.patterns[p];
    const sp = spans[p];
    const rows = pat.length ?? pat.channels[0]?.rows.length ?? 64;
    const colTrack: number[] = [];
    let same = !!sp && !!bp && rows === bp.length;
    const maxCh = pat.channels.length;
    let usedCh = sp ? sp.chans : 0;
    for (let ch = maxCh - 1; ch >= usedCh; ch--) {
      if (pat.channels[ch].rows.some((c) => key(c) !== EMPTY)) { usedCh = ch + 1; break; }
    }
    const chans = Math.min(32, version >= 0x10 ? usedCh : 32);
    for (let ch = 0; ch < chans; ch++) {
      const cells = pat.channels[ch]?.rows ?? [];
      const origCol = bp?.channels[ch]?.rows;
      const origTrack = sp && ch < sp.chans ? rd16(src, sp.from + (version >= 0x10 ? 18 : 0) + ch * 2) : 0;
      const eq = !!origCol && cells.length >= rows && Array.from({ length: rows }, (_, r) => key(cells[r]) === key(origCol[r])).every(Boolean);
      if (eq) colTrack.push(origTrack);
      else if (!sp && cells.every((c) => key(c) === EMPTY)) colTrack.push(0);
      else {
        same = false;
        colTrack.push(trackFor(encodeTrack(Array.from({ length: rows }, (_, r) => cells[r]), warn)));
      }
    }
    const wantName = pat.name === `Pattern ${p}` ? '' : (pat.name ?? '');
    if (sp && same && chans === sp.chans && wantName === sp.name) { paCopy.push(src.subarray(sp.from, sp.to)); paParts.push([]); continue; }
    changed = true;
    if (rows > 256) warn('patterns longer than 256 rows were cut to 256');
    const hdr: number[] = [];
    if (version >= 0x10) {
      const nm = Array.from(wantName.slice(0, 16), (c) => c.charCodeAt(0) & 0xFF);
      hdr.push(chans, Math.min(256, rows) - 1, ...nm, ...new Array(16 - nm.length).fill(0));
    } else if (rows !== 64) warn('MDL before version 1.0 has fixed 64-row patterns; rows were not saved');
    paCopy.push(null);
    paParts.push([...hdr, ...colTrack.flatMap(u16)]);
  }
  if (pool.length - 1 !== nTracksOrig) changed = true;

  // IN: order list, name, speed, tempo
  const inAt = IN.at + 6;
  const inBody = src.slice(inAt, inAt + IN.len);
  const origOrds = rd16(inBody, 52);
  const positions = song.songPositions.filter((p) => p < numPats).slice(0, 255);
  if (positions.length !== song.songPositions.length) warn('order entries pointing at missing patterns were dropped');
  const origPos = Array.from(inBody.subarray(91, 91 + origOrds));
  const ordersChanged = positions.length !== origPos.length || positions.some((p, i) => p !== origPos[i]);
  let inNew: Uint8Array = inBody;
  if (ordersChanged) {
    inNew = Uint8Array.from([...inBody.subarray(0, 91), ...positions, ...inBody.subarray(91 + origOrds)]);
    inNew[52] = positions.length & 0xFF; inNew[53] = positions.length >> 8;
    changed = true;
  }
  if (song.name !== base.name) {
    const nm = Array.from((song.name ?? '').slice(0, 32), (c) => c.charCodeAt(0) & 0xFF);
    for (let i = 0; i < 32; i++) inNew[i] = nm[i] ?? 0x20;
    changed = true;
  }
  if (song.initialSpeed !== base.initialSpeed) { inNew[57] = song.initialSpeed & 0xFF; changed = true; }
  if (song.initialBPM !== base.initialBPM) { inNew[58] = song.initialBPM & 0xFF; changed = true; }

  // edits that are not written
  const ins = song.instruments ?? [];
  if (ins.length !== base.instruments.length || ins.some((x, i) => !sameInstr(x, base.instruments[i]))) {
    warn('instrument and sample edits are not written to MDL; the module keeps its loaded instruments and samples');
  }

  const warnings = [...warned].map(([m, n]) => (n > 1 ? `${m} (${n}x)` : m));
  if (!changed) return { data: src.slice(), filename: name, warnings };

  const chunk = (id: number, body: number[] | Uint8Array): number[] => [id & 0xFF, id >> 8, ...u32(body.length), ...body];
  const paBody: number[] = [numPats];
  paCopy.forEach((c, i) => paBody.push(...(c ?? paParts[i])));
  const trBody: number[] = [...u16(pool.length - 1)];
  for (let i = 1; i < pool.length; i++) trBody.push(...u16(pool[i].length), ...pool[i]);
  const outParts: Array<number[] | Uint8Array> = [src.subarray(0, 5)];
  for (const c of chunks) {
    if (c === IN) outParts.push(chunk(c.id, inNew));
    else if (c === PA) outParts.push(chunk(c.id, paBody));
    else if (c === TR) outParts.push(chunk(c.id, trBody));
    else outParts.push(src.subarray(c.at, c.at + 6 + c.len));
  }
  outParts.push(src.subarray(tail));
  const data = new Uint8Array(outParts.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of outParts) { data.set(c, at); at += c.length; }
  return { data, filename: name, warnings };
}
