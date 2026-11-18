/**
 * AMSExporter.ts - save a Velvet Studio (AMS 2.x) song by re-packing its patterns and order list from the edited song.
 *
 * The header up to the order list, the instruments/samples and the description are copied from the loaded module; the
 * order list, the pattern count and every pattern record (u32 length, rows-1, channel byte, name, event stream) are
 * rebuilt. The event stream is row-major: per row the non-empty channels as flag/note/instrument/command bytes, 0xFF
 * for an empty row. The parser maps effects many-to-one, so a pattern whose cells equal the loaded ones is copied byte
 * for byte, and in an edited pattern every unchanged row keeps its original bytes; only changed rows are re-encoded,
 * through the exact inverse of the parser's effect decoders. Not rewritten: song name, instruments, samples (copied).
 * Extreme's Tracker (AMS 1.x) is returned as loaded, with a warning (no song of that variant is in the repo to measure).
 * A value AMS cannot hold is dropped and reported in `warnings`, never silently.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { decodeExtEffect, decodeModEffect, parseAMSPattern } from '@/lib/import/formats/AMSParser';

export interface AMSExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const CHANNELS = 32;
const KEYOFF = 97;

/** (effTyp, eff) -> first (command, param) the parser decodes to it; MOD commands win over extended ones. */
let reverse: Map<number, [number, number]> | null = null;
function reverseEffect(effTyp: number, eff: number): [number, number] | null {
  if (!reverse) {
    reverse = new Map();
    for (let cmd = 0; cmd < 0x40; cmd++) {
      for (let p = 0; p < 256; p++) {
        const [t, e] = cmd < 0x10 ? decodeModEffect(cmd, p) : decodeExtEffect(cmd, p);
        if ((t || e) && !reverse.has(t * 256 + e)) reverse.set(t * 256 + e, [cmd, p]);
      }
    }
  }
  return reverse.get(effTyp * 256 + eff) ?? null;
}

const cellKey = (c: Partial<TrackerCell> | undefined): string =>
  c ? [c.note ?? 0, c.instrument ?? 0, c.volume ?? 0, c.effTyp ?? 0, c.eff ?? 0, c.effTyp2 ?? 0, c.eff2 ?? 0].join(',') : '0,0,0,0,0,0,0';

/** One row (all channels) to event bytes. */
function encodeRow(cells: Array<TrackerCell | undefined>, warn: (m: string) => void): number[] {
  const events: number[][] = [];
  cells.slice(0, CHANNELS).forEach((c, ch) => {
    if (!c) return;
    const note = c.note ?? 0, instr = c.instrument ?? 0, vol = c.volume ?? 0;
    const cmds: Array<[boolean, number, number]> = [];
    if (vol > 0) {
      if (vol > 63) warn('volume column above 63 was clamped');
      cmds.push([true, Math.min(63, vol), 0]);
    }
    for (const [t, e, n] of [[c.effTyp ?? 0, c.eff ?? 0, 1], [c.effTyp2 ?? 0, c.eff2 ?? 0, 2]] as const) {
      if (!t && !e) continue;
      const r = reverseEffect(t, e);
      if (r) cmds.push([false, r[0], r[1]]);
      else warn(`effect ${t.toString(16)}${e.toString(16).padStart(2, '0')} cannot be written in AMS (slot ${n}) and was dropped`);
    }
    const hasNote = note !== 0 || instr !== 0;
    if (!hasNote && cmds.length === 0) return;
    const ev: number[] = [ch | (hasNote ? 0 : 0x40)];
    if (hasNote) {
      let nv = 0;
      if (note === KEYOFF) nv = 1;
      else if (note >= 1 && note <= 120) nv = note + 1;
      else if (note !== 0) warn(`note ${note} is outside AMS's range and was dropped`);
      ev.push(nv | (cmds.length ? 0x80 : 0), instr & 0xFF);
    }
    cmds.forEach(([isVol, cmd, p], i) => {
      const more = i < cmds.length - 1 ? 0x80 : 0;
      ev.push((cmd & 0x3F) | (isVol ? 0x40 : 0) | more);
      if (!isVol) ev.push(p);
    });
    events.push(ev);
  });
  if (!events.length) return [0xFF];
  events[events.length - 1][0] |= 0x80;
  return events.flat();
}

/** Byte span [start,end) of every row of an event stream, walked with the parser's own rules. */
function rowSpans(d: Uint8Array, rows: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let p = 0;
  for (let r = 0; r < rows; r++) {
    const start = p;
    while (p < d.length) {
      const flags = d[p++];
      if (flags === 0xFF) break;
      let more = true;
      if (!(flags & 0x40)) { more = (d[p++] & 0x80) !== 0; p++; }
      while (more) {
        const cmd = d[p++];
        more = (cmd & 0x80) !== 0;
        if (!(cmd & 0x40)) p++;
      }
      if (flags & 0x80) break;
    }
    spans.push([start, Math.min(p, d.length)]);
  }
  return spans;
}

const u32 = (n: number): number[] => [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF];

export async function exportAMS(song: TrackerSong): Promise<AMSExportResult> {
  const srcBuf = song.uadeEditableFileData;
  if (!srcBuf) throw new Error('AMS export needs the module the song was loaded from');
  const src = new Uint8Array(srcBuf);
  const name = (song.uadeEditableFileName ?? 'module.ams').split('/').pop() ?? 'module.ams';
  const orderAt = (song as unknown as { metadata?: { amsOrderAt?: number } }).metadata?.amsOrderAt;
  if (orderAt === undefined) {
    return { data: src.slice(), filename: name, warnings: ['Extreme\'s Tracker (AMS 1.x) cannot be re-packed; the module was saved as loaded and edits were not written'] };
  }
  const warned = new Map<string, number>();
  const warn = (m: string): void => { warned.set(m, (warned.get(m) ?? 0) + 1); };

  const nameLen = src[7];
  const hdr = 8 + nameLen;
  const numPatsAt = hdr + 3, numOrdsAt = hdr + 5;
  const origPats = src[numPatsAt] | (src[numPatsAt + 1] << 8);
  const origOrds = src[numOrdsAt] | (src[numOrdsAt + 1] << 8);

  const numPats = Math.min(0xFFFF, song.patterns.length);
  if (song.patterns.length > 0xFFFF) warn('patterns beyond AMS limit of 65535 were not saved');
  const positions = song.songPositions.filter((p) => p < numPats).slice(0, 0xFFFF);
  if (positions.length !== song.songPositions.length) warn('order entries pointing at missing patterns were dropped');

  // Pattern records of the loaded module.
  let pos = orderAt + origOrds * 2;
  const recs: Array<{ from: number; to: number }> = [];
  for (let p = 0; p < origPats; p++) {
    if (pos + 4 > src.length) break;
    const len = src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16) | (src[pos + 3] << 24 >>> 0);
    const to = Math.min(src.length, pos + 4 + len);
    recs.push({ from: pos, to });
    pos = to;
  }
  const tailAt = pos;

  let changed = numPats !== origPats || positions.length !== origOrds
    || positions.some((p, i) => p !== (src[orderAt + i * 2] | (src[orderAt + i * 2 + 1] << 8)));

  const patChunks: Uint8Array[] = [];
  for (let p = 0; p < numPats; p++) {
    const pat = song.patterns[p];
    const rows = pat.length ?? pat.channels[0]?.rows.length ?? 64;
    const rec = recs[p];
    let byte2 = src[recs[0]?.from + 5] ?? 0, origName = '', dataAt = 0, origRows = 0;
    let body: Uint8Array | null = null;
    if (rec && rec.to - rec.from >= 6) {
      body = src.subarray(rec.from + 4, rec.to);
      origRows = body[0] + 1; byte2 = body[1];
      const nl = body[2];
      origName = String.fromCharCode(...body.subarray(3, 3 + nl)).trim();
      dataAt = 3 + nl;
    }
    const cellsAt = (r: number, ch: number): TrackerCell | undefined => pat.channels[ch]?.rows[r];
    let spans: Array<[number, number]> = [];
    let orig: ReturnType<typeof parseAMSPattern> | null = null;
    if (body) {
      const data = body.subarray(dataAt);
      spans = rowSpans(data, origRows);
      orig = parseAMSPattern(data, origRows, CHANNELS, true);
    }
    const rowSame = (r: number): boolean => {
      if (!orig || r >= origRows) return false;
      for (let ch = 0; ch < CHANNELS; ch++) {
        const o = orig[r][ch];
        const oc = { note: o.note, instrument: o.instr, volume: o.volume > 0 ? o.volume - 1 : 0, effTyp: o.effTyp, eff: o.eff, effTyp2: o.effTyp2, eff2: o.eff2 };
        if (cellKey(oc) !== cellKey(cellsAt(r, ch))) return false;
      }
      return true;
    };
    const wantName = pat.name ?? `Pattern ${p}`;
    const nameSame = !body || wantName === (origName || `Pattern ${p}`);
    if (body && rows === origRows && nameSame && Array.from({ length: rows }, (_, r) => r).every(rowSame)) {
      patChunks.push(src.subarray(rec.from, rec.to));
      continue;
    }
    changed = true;
    if (rows > 256) warn('patterns longer than 256 rows were cut to 256');
    const nRows = Math.min(256, rows);
    const nm = wantName === `Pattern ${p}` ? [] : Array.from(wantName.slice(0, 255), (c) => c.charCodeAt(0) & 0xFF);
    const out: number[] = [nRows - 1, byte2, nm.length, ...nm];
    for (let r = 0; r < nRows; r++) {
      if (body && rowSame(r)) out.push(...body.subarray(dataAt + spans[r][0], dataAt + spans[r][1]));
      else out.push(...encodeRow(Array.from({ length: CHANNELS }, (_, ch) => cellsAt(r, ch)), warn));
    }
    patChunks.push(Uint8Array.from([...u32(out.length), ...out]));
  }
  if (recs.length > 0 && numPats < origPats) changed = true;

  const warnings = [...warned].map(([m, n]) => (n > 1 ? `${m} (${n}x)` : m));
  if (!changed) return { data: src.slice(), filename: name, warnings };

  const head = src.slice(0, orderAt);
  head[numPatsAt] = numPats & 0xFF; head[numPatsAt + 1] = numPats >> 8;
  head[numOrdsAt] = positions.length & 0xFF; head[numOrdsAt + 1] = positions.length >> 8;
  const orders = new Uint8Array(positions.length * 2);
  positions.forEach((p, i) => { orders[i * 2] = p & 0xFF; orders[i * 2 + 1] = p >> 8; });
  const chunks = [head, orders, ...patChunks, src.subarray(tailAt)];
  const data = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { data.set(c, at); at += c.length; }
  return { data, filename: name, warnings };
}
