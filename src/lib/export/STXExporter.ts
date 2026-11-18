/**
 * STXExporter.ts - save a Scream Tracker Music Interface Kit (.stx) song by re-packing it from the edited song.
 *
 * Everything STXParser reads is written from the song: the order records (song.songPositions), every pattern re-packed as
 * S3M-style rows, and per sample the PCM from the instrument's current audio (length, loop, volume, rate, name written only
 * where they differ from the loaded module, so untouched fields keep their original bytes). The 64-byte file header, the
 * channel table and the other sample-header bytes come from the loaded module. A song nothing was edited in comes back as
 * the module it was loaded from.
 * Layout written: header | pattern table | sample table | channel/order table | sample headers | patterns | PCM (all 16-byte aligned).
 * Cell mapping inverts STXParser: note 97 -> 0xFE, effect via the STM command table (speed keeps its high nibble only).
 * 8-bit PCM is stored the way the parser reads it (the file byte as an Int8), so parse -> export is byte-exact.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';
import { gridIsEdited } from '@/lib/song/gridBaseline';

export interface STXExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const HEADER = 64;
const SAMPLE_HDR = 80;
const ROWS = 64;
const para = (n: number): number => (n + 15) & ~15;

/** XM effect (effTyp, eff) back to an STM (command, param); null when STX has no such command. */
function stmEffect(effTyp: number, eff: number): [number, number] | null {
  switch (effTyp) {
    case 0x0F: return eff >= 1 && eff <= 15 ? [1, eff << 4] : null;
    case 0x0B: return [2, eff & 0xFF];
    case 0x0D: return [3, (Math.floor(eff / 10) << 4) | (eff % 10)];
    case 0x0A: return eff ? [4, eff & 0xFF] : null;
    case 0x02: return eff ? [5, eff & 0xFF] : null;
    case 0x01: return eff ? [6, eff & 0xFF] : null;
    case 0x03: return eff ? [7, eff & 0xFF] : null;
    case 0x04: return eff ? [8, eff & 0xFF] : null;
    case 0x1D: return eff ? [9, eff & 0xFF] : null;
    default: return null;
  }
}

/** One pattern as S3M packed rows (4 channels). */
export function packSTXPattern(pattern: Pattern): Uint8Array {
  const out: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let ch = 0; ch < 4; ch++) {
      const cell = pattern.channels[ch]?.rows[row];
      if (!cell) continue;
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const fx = stmEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const vol = Math.min(64, cell.volume ?? 0);
      const hasNote = note !== 0 || instr !== 0;
      if (!hasNote && !fx && vol === 0) continue;
      out.push(ch | (hasNote ? 0x20 : 0) | (vol ? 0x40 : 0) | (fx ? 0x80 : 0));
      if (hasNote) out.push(note === 97 ? 0xFE : note >= 1 && note <= 96 ? (((note - 1) / 12 | 0) << 4) | ((note - 1) % 12) : 0xFF, instr & 0xFF);
      if (vol) out.push(vol);
      if (fx) out.push(fx[0], fx[1]);
    }
    out.push(0);
  }
  return new Uint8Array(out);
}

/** 16-bit mono frames of a 8/16-bit PCM WAV (the instrument's audioBuffer), or null. */
function wavFrames(wav: ArrayBuffer | undefined): Int16Array | null {
  if (!wav || wav.byteLength < 44) return null;
  const v = new DataView(wav);
  if (v.getUint32(0) !== 0x52494646) return null;
  const channels = v.getUint16(22, true) || 1;
  const bits = v.getUint16(34, true);
  if (bits !== 8 && bits !== 16) return null;
  for (let o = 12; o + 8 <= v.byteLength;) {
    const len = v.getUint32(o + 4, true);
    if (v.getUint32(o) === 0x64617461) {
      const data = o + 8;
      const step = channels * (bits / 8);
      const n = Math.floor(Math.min(len, v.byteLength - data) / step);
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) out[i] = bits === 16 ? v.getInt16(data + i * step, true) : (v.getUint8(data + i * step) - 128) * 256;
      return out;
    }
    o += 8 + len + (len & 1);
  }
  return null;
}

const readName = (b: Uint8Array, at: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && b[at + i]; i++) s += String.fromCharCode(b[at + i]);
  return s;
};

export async function exportSTX(song: TrackerSong): Promise<STXExportResult> {
  const srcBuf = song.uadeEditableFileData;
  if (!srcBuf) throw new Error('STX export needs the module the song was loaded from');
  const src = new Uint8Array(srcBuf);
  const v = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const name = (song.uadeEditableFileName ?? 'module.stx').split('/').pop() ?? 'module.stx';
  const warnings: string[] = [];

  const origPatterns = v.getUint16(48, true);
  const origSamples = v.getUint16(50, true);
  const origOrders = v.getUint16(52, true);
  const patternSize = v.getUint16(28, true);
  const chnBase = v.getUint16(36, true) << 4;
  const origPatPtr = (i: number): number => v.getUint16((v.getUint16(32, true) << 4) + i * 2, true);
  const origSmpPtr = (i: number): number => (i < origSamples ? v.getUint16((v.getUint16(34, true) << 4) + i * 2, true) << 4 : 0);
  // Version 0 stores a u16 size before each pattern; the parser detects it by that size equalling the header's patternSize.
  const sized = origPatterns > 0 && patternSize !== 0x1A && v.getUint16(origPatPtr(0) << 4, true) === patternSize;

  const numPatterns = Math.min(64, song.patterns.length);
  if (song.patterns.length > 64) warnings.push(`${song.patterns.length - 64} pattern(s) beyond STX's limit of 64 were not saved`);
  const positions = song.songPositions.filter((p) => p < numPatterns).slice(0, 0x81);
  if (positions.length !== song.songPositions.length) warnings.push('Song positions beyond the pattern or order limit were dropped');
  const numSamples = Math.min(96, song.instruments.length);

  // Samples: header bytes + PCM, written only where the instrument differs from the module.
  let samplesSame = numSamples === origSamples;
  const smp = Array.from({ length: numSamples }, (_, s) => {
    const inst = song.instruments[s];
    const oh = origSmpPtr(s);
    const hasOrig = oh !== 0 && oh + SAMPLE_HDR <= src.length;
    const hdr = hasOrig ? src.slice(oh, oh + SAMPLE_HDR) : new Uint8Array(SAMPLE_HDR);
    const hv = new DataView(hdr.buffer);
    if (!hasOrig) { hdr[0] = 1; hdr.set([0x53, 0x43, 0x52, 0x53], 76); hv.setUint32(32, 8363, true); }
    const frames = wavFrames(inst?.sample?.audioBuffer);
    const origType = hasOrig ? hdr[0] : 0;
    const dp = (hdr[13] << 16 | hdr[15] << 8 | hdr[14]) * 16;
    const origLen = hv.getUint32(16, true);
    const bytes16 = !!(hdr[31] & 4);
    let pcm: Uint8Array | null = null;
    if (frames && frames.length > 0 && origType !== 0 && !(hasOrig && hdr[30] === 1)) {
      pcm = new Uint8Array(frames.length * (bytes16 ? 2 : 1));
      frames.forEach((f, i) => { if (bytes16) { pcm![i * 2] = f & 0xFF; pcm![i * 2 + 1] = (f >> 8) & 0xFF; } else pcm![i] = (f >> 8) & 0xFF; });
    } else if (frames && frames.length > 0 && !hasOrig) {
      pcm = new Uint8Array(frames.length);
      frames.forEach((f, i) => { pcm![i] = (f >> 8) & 0xFF; });
    }
    const origPcm = hasOrig && origType === 1 && dp > 0 && dp < src.length ? src.subarray(dp, dp + origLen * (bytes16 ? 2 : 1)) : null;
    if (!pcm && origPcm) pcm = origPcm.slice(); // slot the instrument has no audio for (packed or unreadable): keep the module's bytes
    let changed = !hasOrig && !!pcm;
    if (pcm && !(origPcm && pcm.length === origPcm.length && pcm.every((b, i) => b === origPcm[i]))) {
      changed = true;
      hv.setUint32(16, pcm.length / (bytes16 ? 2 : 1), true);
    }
    const length = hv.getUint32(16, true);
    // Loop, volume, rate, name against what the parser would have read from the module.
    const o = inst?.sample;
    const oLs = hv.getUint32(20, true), oLe = hv.getUint32(24, true);
    const oLoop = !!(hdr[31] & 1) && oLe > oLs && oLe <= origLen;
    const nLs = Math.round(o?.loopStart ?? 0), nLe = Math.round(o?.loopEnd ?? 0);
    const nLoop = !!o?.loop && nLe > nLs && nLe <= length;
    if (frames && pcm && (nLoop !== oLoop || (nLoop && (nLs !== oLs || nLe !== oLe)) || (!hasOrig && nLoop))) {
      changed = true;
      hdr[31] = nLoop ? hdr[31] | 1 : hdr[31] & ~1;
      hv.setUint32(20, nLoop ? nLs : 0, true);
      hv.setUint32(24, nLoop ? nLe : 0, true);
    }
    const oVol = Math.min(hdr[28], 64);
    const nVol = inst?.metadata?.modPlayback?.defaultVolume;
    if (frames && pcm && nVol !== undefined && nVol !== oVol) { changed = true; hdr[28] = Math.max(0, Math.min(64, Math.round(nVol))); }
    const oRate = hv.getUint32(32, true) || 8363;
    const nRate = o?.sampleRate;
    if (frames && pcm && nRate && nRate !== oRate) { changed = true; hv.setUint32(32, Math.round(nRate), true); }
    const oName = readName(hdr, 48, 28).trim() || readName(hdr, 1, 12).trim();
    if (frames && pcm && inst && (inst.name ?? '') !== oName) {
      changed = true;
      hdr.fill(0, 48, 76);
      for (let i = 0; i < Math.min(27, inst.name.length); i++) hdr[48 + i] = inst.name.charCodeAt(i) & 0x7F;
    }
    if (changed) samplesSame = false;
    return { hdr, pcm, has: hasOrig || !!pcm };
  });

  const origRaw: number[] = [];
  for (let i = 0; i < origOrders; i++) {
    const p = src[(chnBase) + 32 + i * 5];
    if (p === 99 || p === 255) break;
    if (p <= 63) origRaw.push(p);
  }
  if (!gridIsEdited(song.patterns) && samplesSame && song.patterns.length === origPatterns
    && positions.length === (origRaw.length || 1) && positions.every((p, i) => p === (origRaw[i] ?? 0))) return { data: src.slice(), filename: name, warnings };

  const patBytes = song.patterns.slice(0, numPatterns).map((p) => {
    const b = packSTXPattern(p);
    if (!sized) return b;
    const sizedBytes = new Uint8Array(2 + b.length);
    new DataView(sizedBytes.buffer).setUint16(0, b.length, true);
    sizedBytes.set(b, 2);
    return sizedBytes;
  });
  if (sized && patBytes.length > 0) {
    // Header patternSize must equal the first pattern's size prefix (and stay within 64..0x840) for the parser to detect the sized layout.
    const first = patBytes[0];
    if (first.length - 2 < 64) { const padded = new Uint8Array(66); padded.set(first.subarray(2), 2); patBytes[0] = padded; new DataView(padded.buffer).setUint16(0, 64, true); }
  }

  const patTable = HEADER;
  const smpTable = para(patTable + numPatterns * 2);
  const chnTable = para(smpTable + numSamples * 2);
  let pos = para(chnTable + 32 + positions.length * 5);
  const smpHdrAt = smp.map((s) => { const at = s.has ? pos : 0; if (s.has) pos += SAMPLE_HDR; return at; });
  pos = para(pos);
  const patAt = patBytes.map((b) => { const at = pos; pos = para(pos + b.length); return at; });
  const pcmAt = smp.map((s) => { if (!s.pcm) return 0; const at = pos; pos = para(pos + s.pcm.length); return at; });
  if (pos > 0xFFFF * 16 && patAt.some((a) => a > 0xFFFF * 16)) throw new Error('STX layout exceeds the 1 MB parapointer range');

  const out = new Uint8Array(pos);
  const ov = new DataView(out.buffer);
  out.set(src.subarray(0, HEADER));
  ov.setUint16(32, patTable >> 4, true);
  ov.setUint16(34, smpTable >> 4, true);
  ov.setUint16(36, chnTable >> 4, true);
  ov.setUint16(48, numPatterns, true);
  ov.setUint16(50, numSamples, true);
  ov.setUint16(52, positions.length, true);
  if (sized && patBytes.length > 0) ov.setUint16(28, new DataView(patBytes[0].buffer).getUint16(0, true), true);
  patAt.forEach((a, i) => { ov.setUint16(patTable + i * 2, a >> 4, true); out.set(patBytes[i], a); });
  smp.forEach((s, i) => {
    ov.setUint16(smpTable + i * 2, smpHdrAt[i] >> 4, true);
    if (!s.has) return;
    const p = pcmAt[i] >> 4;
    if (s.pcm) { s.hdr[13] = p >> 16; s.hdr[14] = p & 0xFF; s.hdr[15] = (p >> 8) & 0xFF; out.set(s.pcm, pcmAt[i]); }
    out.set(s.hdr, smpHdrAt[i]);
  });
  if (chnBase + 32 <= src.length) out.set(src.subarray(chnBase, chnBase + 32), chnTable);
  positions.forEach((p, i) => {
    const rec = chnTable + 32 + i * 5;
    if (i < origOrders && chnBase + 32 + (i + 1) * 5 <= src.length) out.set(src.subarray(chnBase + 32 + i * 5, chnBase + 32 + (i + 1) * 5), rec);
    out[rec] = p;
  });
  return { data: out, filename: name, warnings };
}
