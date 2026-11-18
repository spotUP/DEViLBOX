/**
 * ULTExporter.ts - save an UltraTracker (.ult) song by re-packing it from the edited song.
 *
 * Everything ULTParser reads is written from the song: song name, per-sample name/volume/rate/loop/PCM, the order list,
 * channel panning (v3+), and every (channel, pattern) block as 0xFC run-length rows. Untouched bytes (song message,
 * sample filenames, finetune, tail of the order list) come from the loaded module.
 * Effects are written in the encoding of the module's own version byte, which is kept: tremolo and pan position need v4,
 * arpeggio and key-off need v3. A value ULT cannot hold is dropped or rounded and reported in `warnings`, never silently.
 * The parser maps effects many-to-one, so a block whose cells still equal the loaded ones is copied byte for byte, and in an
 * edited block every unchanged row keeps its original 5 bytes; only changed rows go through the translation below.
 * A song nothing was edited in comes back as the module it was loaded from.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { pcm8ToWAV } from '@/lib/import/formats/AmigaUtils';
import { wavFrames } from './STXExporter';

export interface ULTExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const ROWS = 64;
const KEYOFF = 97;
const V3 = 0x33;
const V4 = 0x34;

/** XM-style effect back to a ULT (nibble, param); null when this ULT version cannot hold it. */
export function encodeULTEffect(effTyp: number, eff: number, version: number, warn: (m: string) => void): [number, number] | null {
  if (effTyp === 0 && eff === 0) return [0, 0];
  const lo = eff & 0x0F, hi = (eff >> 4) & 0x0F;
  switch (effTyp) {
    case 0x00: return version >= V3 ? [0x0, eff] : null;
    case 0x01: return hi === 0xF ? [0xE, 0x10 | lo] : [0x1, eff]; // plain 1Fx is ambiguous with fine slide: fine wins
    case 0x02: return hi === 0xF ? [0xE, 0x20 | lo] : [0x2, eff];
    case 0x03: return [0x3, eff];
    case 0x04: return [0x4, eff];
    case 0x07: return version >= V4 ? [0x7, eff] : null;
    case 0x08: if (eff % 0x11) warn('panning rounded to 16 steps'); return [0xB, Math.min(0x0F, Math.round(eff / 0x11))];
    case 0x09: if (eff % 4 || eff > 0xFF) warn('sample offset rounded to a multiple of 4'); return [0x9, Math.min(0xFF, Math.round(eff / 4))];
    case 0x0A:
      if (lo === 0xF && hi > 0) return [0xE, 0xA0 | hi];
      if (hi === 0xF && lo > 0) return [0xE, 0xB0 | lo];
      if (hi && lo) warn('volume slide with both nibbles keeps the up nibble');
      return hi ? [0xA, hi << 4] : [0xA, lo];
    case 0x0C: return [0xC, Math.min(255, Math.round(eff * 255 / 64))];
    case 0x0D: return eff > 99 ? null : [0xD, ((Math.floor(eff / 10)) << 4) | (eff % 10)];
    case 0x0E:
      if (hi === 0x9 || hi === 0xC || hi === 0xD) return [0xE, eff];
      if (hi === 0x6) return version >= V4 ? [0xE, 0x80 | lo] : null;
      return null;
    case 0x0F: return eff >= 0x20 && eff <= 0x2F ? null : [0xF, eff]; // 0x20-0x2F is speed in ULT but tempo in XM
    default: return null;
  }
}

/** One cell to its 5 row bytes [note, instrument, cmd, param1, param2]. */
export function encodeULTCell(c: TrackerCell, version: number, warn: (m: string) => void): number[] {
  const note = c.note ?? 0;
  let noteByte = 0;
  if (note >= 25 && note <= 120) noteByte = note - 24;
  else if (note !== 0 && note !== KEYOFF) warn(`note ${note} is outside ULT's range and was dropped`);
  if (c.volume) warn('the volume column does not exist in ULT and was dropped');
  const one = (t: number, e: number, n: number): [number, number] => {
    const r = encodeULTEffect(t ?? 0, e ?? 0, version, warn);
    if (r) return r;
    warn(`effect ${t.toString(16)}${(e ?? 0).toString(16).padStart(2, '0')} cannot be written in ULT version ${String.fromCharCode(version)} (slot ${n}) and was dropped`);
    return [0, 0];
  };
  const f1 = one(c.effTyp ?? 0, c.eff ?? 0, 1);
  const f2 = one(c.effTyp2 ?? 0, c.eff2 ?? 0, 2);
  if (note === KEYOFF) {
    // Key-off lives in effect 5 (param 0C); it needs a free effect slot.
    const slot = f1[0] === 0 && f1[1] === 0 ? f1 : f2[0] === 0 && f2[1] === 0 ? f2 : null;
    if (version >= V3 && slot) { slot[0] = 0x5; slot[1] = 0x0C; } else warn('key-off needs ULT v3+ and a free effect slot; it was dropped');
  }
  return [noteByte, (c.instrument ?? 0) & 0xFF, ((f2[0] & 0x0F) << 4) | (f1[0] & 0x0F), f1[1] & 0xFF, f2[1] & 0xFF];
}

/** Expand one on-disk block to its 64 rows of 5 bytes. */
function decodeBlock(raw: Uint8Array): number[][] {
  const rows: number[][] = [];
  let p = 0;
  while (rows.length < ROWS && p < raw.length) {
    let rep = 1;
    let n = raw[p++];
    if (n === 0xFC) { rep = raw[p++]; n = raw[p++]; }
    const row = [n, raw[p++], raw[p++], raw[p++], raw[p++]];
    for (let i = 0; i < rep && rows.length < ROWS; i++) rows.push(row);
  }
  while (rows.length < ROWS) rows.push([0, 0, 0, 0, 0]);
  return rows;
}

function packBlock(rows: number[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < ROWS;) {
    let n = 1;
    while (i + n < ROWS && rows[i + n].every((b, k) => b === rows[i][k])) n++;
    if (n > 1) out.push(0xFC, n);
    out.push(...rows[i]);
    i += n;
  }
  return out;
}

const same = (a: TrackerCell | undefined, b: TrackerCell | undefined): boolean =>
  !!a && !!b && (a.note ?? 0) === (b.note ?? 0) && (a.instrument ?? 0) === (b.instrument ?? 0)
  && (a.effTyp ?? 0) === (b.effTyp ?? 0) && (a.eff ?? 0) === (b.eff ?? 0)
  && (a.effTyp2 ?? 0) === (b.effTyp2 ?? 0) && (a.eff2 ?? 0) === (b.eff2 ?? 0);

const readText = (b: Uint8Array, at: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && b[at + i] !== 0; i++) s += String.fromCharCode(b[at + i]);
  return s.trim();
};
const putText = (b: Uint8Array, at: number, n: number, s: string, pad: number): void => {
  b.fill(pad, at, at + n);
  for (let i = 0; i < Math.min(n, s.length); i++) b[at + i] = s.charCodeAt(i) & 0x7F;
};

export async function exportULT(song: TrackerSong): Promise<ULTExportResult> {
  const srcBuf = song.uadeEditableFileData;
  if (!srcBuf) throw new Error('UltraTracker export needs the module the song was loaded from');
  const src = new Uint8Array(srcBuf);
  const v = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const name = (song.uadeEditableFileName ?? 'module.ult').split('/').pop() ?? 'module.ult';
  const warned = new Map<string, number>();
  const warn = (m: string): void => { warned.set(m, (warned.get(m) ?? 0) + 1); };
  let changed = false;

  const version = src[14];
  let pos = 48 + src[47] * 32;
  const numSamples = src[pos++];
  const hdrSize = version >= V4 ? 66 : 64;
  const smpAt = pos;
  pos += numSamples * hdrSize;
  const orderAt = pos;
  const numChannels = src[orderAt + 256] + 1;
  const origPatterns = src[orderAt + 257] + 1;
  const panAt = orderAt + 258;
  const patStart = panAt + (version >= V3 ? numChannels : 0);
  const head = src.slice(0, patStart);
  const hv = new DataView(head.buffer);

  // Song name (the parser falls back to the file name when the field is empty).
  const origName = readText(src, 15, 32) || (song.uadeEditableFileName ?? '').split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
  if ((song.name ?? '') !== origName) { putText(head, 15, 32, song.name ?? '', 0x20); changed = true; }

  // Order list: positions, then 0xFE when the loop point is the end (what the parser reads), else 0xFF.
  const origOrders: number[] = [];
  for (let i = 0; i < 256 && src[orderAt + i] < 0xFE; i++) origOrders.push(src[orderAt + i]);
  const origRestart = src[orderAt + origOrders.length] === 0xFE ? origOrders.length : 0;
  const numPatterns = Math.max(1, Math.min(256, song.patterns.length));
  if (song.patterns.length > 256) warn('patterns beyond ULT limit of 256 were not saved');
  const positions = song.songPositions.filter((p) => p < numPatterns).slice(0, 255);
  if (positions.length !== song.songPositions.length) warn('order entries pointing at missing patterns or beyond 255 were dropped');
  const restart = song.restartPosition ?? 0;
  if (positions.length !== origOrders.length || positions.some((p, i) => p !== origOrders[i]) || (positions.length && restart !== origRestart && !(restart === 0 && origRestart === 0))) {
    head.fill(0, orderAt, orderAt + 256);
    positions.forEach((p, i) => { head[orderAt + i] = p; });
    head[orderAt + positions.length] = restart > 0 && restart === positions.length ? 0xFE : 0xFF;
    changed = true;
  }
  if (numPatterns !== origPatterns) { head[orderAt + 257] = numPatterns - 1; changed = true; }

  // Channel panning (v3+): nibble per channel, parsed as (nibble*16+8 - 128)/128*50.
  if (version >= V3) {
    for (let ch = 0; ch < numChannels; ch++) {
      const oPan = Math.round((((src[panAt + ch] & 0x0F) * 16 + 8) - 128) / 128 * 50);
      const nPan = song.patterns[0]?.channels[ch]?.pan;
      if (nPan !== undefined && nPan !== oPan) { head[panAt + ch] = Math.max(0, Math.min(15, Math.round(((nPan / 50 * 128 + 128) - 8) / 16))); changed = true; }
    }
  }

  // Original sample PCM: laid out at the end of the file in sample order.
  const sizes = Array.from({ length: numSamples }, (_, s) => {
    const b = smpAt + s * hdrSize;
    const a = v.getUint32(b + 52, true), e = v.getUint32(b + 56, true);
    return e > a ? e - a : 0;
  });
  let cursor = src.length - sizes.reduce((x, y) => x + y, 0);
  const origPcm = sizes.map((n) => { const at = cursor; cursor += n; return n > 0 && at >= 0 && at + n <= src.length ? src.subarray(at, at + n) : null; });
  const newPcm: Array<Uint8Array | null> = origPcm.map((p) => p);
  for (let s = 0; s < numSamples; s++) {
    const inst = song.instruments[s];
    const o = inst?.sample;
    const b = smpAt + s * hdrSize;
    const flags = head[b + 61];
    const is16 = (flags & 4) !== 0;
    const oPcm = origPcm[s];
    const oSpeed = version >= V4 ? v.getUint16(b + 62, true) : 8363;
    const frames = wavFrames(o?.audioBuffer);
    let audioChanged = false;
    if (frames && frames.length > 0) {
      if (oPcm) {
        audioChanged = is16
          ? frames.length !== (oPcm.length >> 1) || frames.some((f, i) => (f & 0xFF) !== oPcm[i * 2] || ((f >> 8) & 0xFF) !== oPcm[i * 2 + 1])
          : !sameBytes(new Uint8Array(o!.audioBuffer!), new Uint8Array(pcm8ToWAV(oPcm, oSpeed * 2)));
      } else audioChanged = true;
    }
    if (audioChanged && frames) {
      const bytes = new Uint8Array(frames.length * (is16 ? 2 : 1));
      frames.forEach((f, i) => { if (is16) { bytes[i * 2] = f & 0xFF; bytes[i * 2 + 1] = (f >> 8) & 0xFF; } else bytes[i] = (f >> 8) & 0xFF; });
      newPcm[s] = bytes;
      const start = v.getUint32(b + 52, true);
      hv.setUint32(b + 56, start + bytes.length, true);
      changed = true;
    }
    const len = (newPcm[s]?.length ?? 0);
    // Loop, volume, rate, name against what the parser read from the module.
    const bpf = is16 ? 2 : 1;
    const oLs = Math.floor(v.getUint32(b + 44, true) / bpf), oLe = Math.min(Math.floor(v.getUint32(b + 48, true) / bpf), Math.floor(len / bpf));
    const oLoop = !!(flags & 8) && oLe > oLs;
    const nLs = Math.round(o?.loopStart ?? 0), nLe = Math.round(o?.loopEnd ?? 0);
    const nLoop = !!o?.loop && nLe > nLs && nLe <= len / bpf;
    if (o && (nLoop !== oLoop || (nLoop && (nLs !== oLs || nLe !== oLe)))) {
      head[b + 61] = nLoop ? (flags | 8) : (flags & ~(8 | 16));
      if (nLoop) { hv.setUint32(b + 44, nLs * bpf, true); hv.setUint32(b + 48, nLe * bpf, true); }
      changed = true;
    }
    const oVol = Math.round(head[b + 60] / 4);
    const nVol = inst?.metadata?.modPlayback?.defaultVolume;
    if (nVol !== undefined && nVol !== oVol) { head[b + 60] = Math.max(0, Math.min(255, Math.round(nVol) * 4)); changed = true; }
    const nRate = o?.sampleRate;
    if (nRate && nRate !== oSpeed * 2) {
      if (version >= V4) { hv.setUint16(b + 62, Math.max(0, Math.min(0xFFFF, Math.round(nRate / 2))), true); changed = true; }
      else warn('sample rate cannot be changed in ULT versions below 4');
    }
    if (inst && (inst.name ?? '') !== readText(src, b, 32)) { putText(head, b, 32, inst.name ?? '', 0); changed = true; }
  }
  if (song.instruments.length > numSamples) warn(`${song.instruments.length - numSamples} instrument(s) beyond the module's sample table were not saved`);

  // Pattern blocks, channel-major.
  const layout = song.uadeVariableLayout;
  const chunks: Uint8Array[] = [head];
  for (let ch = 0; ch < numChannels; ch++) {
    for (let pat = 0; pat < numPatterns; pat++) {
      const fp = ch * origPatterns + pat;
      const rows = song.patterns[pat]?.channels[ch]?.rows ?? [];
      const baseRows = pat < origPatterns ? layout?.blockRows?.[fp] : undefined;
      const raw = pat < origPatterns ? layout?.blockRawBytes?.[fp] : undefined;
      if (baseRows && raw && Array.from({ length: ROWS }, (_, r) => r).every((r) => same(rows[r], baseRows[r]))) { chunks.push(raw); continue; }
      const orig = raw ? decodeBlock(raw) : null;
      const out = Array.from({ length: ROWS }, (_, r) =>
        orig && same(rows[r], baseRows?.[r]) ? orig[r] : encodeULTCell(rows[r] ?? ({} as TrackerCell), version, warn));
      chunks.push(Uint8Array.from(packBlock(out)));
      changed = true;
    }
  }
  if (numPatterns < origPatterns) changed = true;
  for (const p of newPcm) if (p) chunks.push(p);

  const warnings = [...warned].map(([m, n]) => (n > 1 ? `${m} (${n}x)` : m));
  if (!changed) return { data: src.slice(), filename: name, warnings };
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const data = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { data.set(c, at); at += c.length; }
  return { data, filename: name, warnings };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
