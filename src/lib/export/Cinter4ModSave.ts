/**
 * Cinter4ModSave.ts — binary-compatible Cinter / MOD save by patching the original
 *
 * Re-encoding a MOD from DEViLBOX's pattern model can't be byte-identical (note
 * mapping, effect normalization, sample-header drift). For a Cinter song the goal
 * is exactly that — the saved .mod must match what the Amiga Cinter replayer
 * expects, byte-for-byte where it matters. So instead of rebuilding the file we
 * PATCH the original bytes kept at import:
 *
 *   • Cinter save  — zero each Cinter instrument's sample PCM (the replayer
 *                    regenerates it from the sample name; the cruncher compresses
 *                    the zeros away), giving a small, binary-compatible song.
 *   • MOD export   — keep the rendered Cinter PCM so the .mod plays in any player.
 *
 * In both cases title, patterns, order list and raw (non-Cinter) samples stay
 * byte-identical. Only instruments the user actually edited get their sample name
 * re-encoded and their PCM regenerated.
 */

import type { InstrumentConfig } from '@/types';
import type { Pattern } from '@/types/tracker';
import { cinter4ParseSampleName, cinter4ParamsToSampleName, cinter4ParamsToWords, type Cinter4Version } from '@/lib/import/formats/cinter4Params';
import { readCinter4InstrumentParams, cinter4EffectiveWords, renderCinterVoice } from '@/engine/cinter4/cinter4Instrument';

const MOD_HEADER_SIZE = 1084; // title(20) + 31×30 sample headers + 2 + 128 order + 4 tag

const CHANNELS_FOR_TAG: Record<string, number> = {
  'M.K.': 4, 'M!K!': 4, 'FLT4': 4, '4CHN': 4, '6CHN': 6, '8CHN': 8, 'FLT8': 8,
};

/** Decode a 16- or 8-bit mono WAV ArrayBuffer to signed 8-bit PCM. */
function wavToInt8(buf?: ArrayBuffer): Int8Array {
  if (!buf || buf.byteLength < 44) return new Int8Array(0);
  const v = new DataView(buf);
  let off = 12, bits = 16, dataOff = -1, dataLen = 0;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const sz = v.getUint32(off + 4, true);
    if (id === 'fmt ' && off + 8 + 16 <= v.byteLength) bits = v.getUint16(off + 8 + 14, true) || 16;
    if (id === 'data') { dataOff = off + 8; dataLen = sz; break; }
    off += 8 + sz + (sz & 1);
  }
  if (dataOff < 0) return new Int8Array(0);
  if (bits === 8) {
    const out = new Int8Array(dataLen);
    for (let i = 0; i < dataLen; i++) out[i] = (v.getUint8(dataOff + i) << 24) >> 24;
    return out;
  }
  const n = Math.floor(dataLen / 2);
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(-128, Math.min(127, v.getInt16(dataOff + i * 2, true) >> 8));
  return out;
}

/** Encode a Cinter sample name from params, preserving the version label (char 0). */
function cinterName(params: number[], version: Cinter4Version, origName?: string): string {
  const body = cinter4ParamsToSampleName(params).slice(1);
  const first = version === 3
    ? (origName && origName[0] && !/[0-9]/.test(origName[0]) ? origName[0] : 's')
    : '1';
  return (first + body).slice(0, 22);
}

export interface CinterReencodeResult {
  data: Uint8Array;
  cinterCount: number;
}

/**
 * Build a Cinter .mod from an OpenMPT-exported MOD (which carries the EDITED
 * patterns faithfully but writes no sample data) by splicing in the Cinter sample
 * table: 31 sample headers + sample data rebuilt from the current instruments.
 * This is the path that lets pattern edits be saved — OpenMPT owns the patterns,
 * we own the samples.
 *
 *   stripCinter true  → Cinter synth samples cleared (replayer regenerates).
 *   stripCinter false → rendered PCM kept (plays in any MOD player).
 * Raw (non-Cinter) samples are written from their decoded PCM.
 */
export function buildCinterModFromOpenMPT(
  openmptMod: Uint8Array,
  instruments: InstrumentConfig[],
  opts: CinterPatchOptions,
): CinterReencodeResult {
  const tag = String.fromCharCode(openmptMod[1080], openmptMod[1081], openmptMod[1082], openmptMod[1083]);
  const numCh = CHANNELS_FOR_TAG[tag] ?? 4;
  const songLen = openmptMod[950];
  const restart = openmptMod[951];
  const order = openmptMod.slice(952, 952 + 128);
  let maxPat = 0;
  for (let i = 0; i < 128; i++) maxPat = Math.max(maxPat, openmptMod[952 + i]);
  const numPat = maxPat + 1;
  const patBytesPer = numCh * 64 * 4;
  const patterns = openmptMod.slice(1084, 1084 + numPat * patBytesPer);

  const byId = new Map<number, InstrumentConfig>();
  for (const it of instruments) byId.set(it.id, it);

  const headers = new Uint8Array(31 * 30);
  const dataParts: Int8Array[] = [];
  let cinterCount = 0;

  for (let i = 0; i < 31; i++) {
    const inst = byId.get(i + 1);
    let name = '', lengthWords = 0, volume = 64, loopStart = 0, loopLength = 0;
    let pcm: Int8Array = new Int8Array(0);

    const cp = inst ? readCinter4InstrumentParams(inst) : null;
    if (cp) {
      cinterCount++;
      const origName = (inst!.parameters as Record<string, unknown> | undefined)?.sampleName as string | undefined;
      name = cinterName(cp.params, cp.version, origName);
      lengthWords = cp.lengthWords;
      if (cp.replenWords > 0) { loopLength = cp.replenWords; loopStart = cp.lengthWords - cp.replenWords; }
      const sampleBytes = Math.max(2, lengthWords * 2);
      pcm = opts.stripCinter ? new Int8Array(sampleBytes) : renderCinterVoice(cinter4EffectiveWords(cp), sampleBytes, null, cp.version);
    } else if (inst?.type === 'sample' && inst.sample) {
      name = inst.name;
      pcm = wavToInt8(inst.sample.audioBuffer);
      lengthWords = Math.floor(pcm.length / 2);
      if (inst.sample.loop && inst.sample.loopEnd > inst.sample.loopStart) {
        loopStart = Math.floor(inst.sample.loopStart / 2);
        loopLength = Math.floor((inst.sample.loopEnd - inst.sample.loopStart) / 2);
      }
    }

    const ho = i * 30;
    for (let j = 0; j < 22; j++) headers[ho + j] = j < name.length ? name.charCodeAt(j) & 0x7f : 0;
    headers[ho + 22] = (lengthWords >> 8) & 0xff; headers[ho + 23] = lengthWords & 0xff;
    headers[ho + 24] = 0; // finetune
    headers[ho + 25] = Math.max(0, Math.min(64, volume));
    headers[ho + 26] = (loopStart >> 8) & 0xff; headers[ho + 27] = loopStart & 0xff;
    const ll = loopLength > 0 ? loopLength : 1; // MOD spec: minimum loop length 1 word
    headers[ho + 28] = (ll >> 8) & 0xff; headers[ho + 29] = ll & 0xff;
    dataParts.push(pcm);
  }

  let dataLen = 0;
  for (const p of dataParts) dataLen += p.length;
  const out = new Uint8Array(MOD_HEADER_SIZE + patterns.length + dataLen);
  out.set(openmptMod.slice(0, 20), 0);          // title
  out.set(headers, 20);                          // 31 sample headers
  out[950] = songLen; out[951] = restart;
  out.set(order, 952);                           // order table
  out.set(openmptMod.slice(1080, 1084), 1080);   // format tag
  out.set(patterns, 1084);                       // OpenMPT's faithful (edited) patterns
  let off = 1084 + patterns.length;
  for (const p of dataParts) { for (let k = 0; k < p.length; k++) out[off + k] = p[k] & 0xff; off += p.length; }

  return { data: out, cinterCount };
}

export interface CinterPatchOptions {
  /** Zero Cinter sample PCM (replayer regenerates). false → keep rendered PCM. */
  stripCinter: boolean;
}

export interface CinterPatchResult {
  data: Uint8Array;
  cinterCount: number;
  editedCount: number;
}

/**
 * Patch a ProTracker MOD's Cinter instruments in place (on a copy of the original
 * bytes). Returns the patched bytes plus a small report. Instruments are matched
 * to the 31 MOD sample slots by id (slot i ↔ instrument id i+1).
 */
export function cinterPatchMod(
  original: Uint8Array,
  instruments: InstrumentConfig[],
  opts: CinterPatchOptions,
): CinterPatchResult {
  const out = original.slice();
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const byId = new Map<number, InstrumentConfig>();
  for (const it of instruments) byId.set(it.id, it);

  // Pattern count from the order table → start of the sample-data region.
  let maxPat = 0;
  for (let i = 0; i < 128; i++) maxPat = Math.max(maxPat, out[952 + i]);
  const numPatterns = maxPat + 1;
  let dataOff = MOD_HEADER_SIZE + numPatterns * 1024;

  let cinterCount = 0;
  let editedCount = 0;

  for (let i = 0; i < 31; i++) {
    const hoff = 20 + i * 30;
    const lengthWords = v.getUint16(hoff + 22, false);
    const sampleBytes = lengthWords * 2;
    const sampleStart = dataOff;
    dataOff += sampleBytes;

    // Original 22-char sample name from the header.
    let origName = '';
    for (let j = 0; j < 22; j++) { const c = out[hoff + j]; if (c) origName += String.fromCharCode(c); }
    const parsedOrig = cinter4ParseSampleName(origName);
    if (!parsedOrig) continue; // raw / non-Cinter sample — leave entirely untouched
    cinterCount++;

    // Current params (from the live instrument if present, else the original name).
    const inst = byId.get(i + 1);
    const cur = inst ? readCinter4InstrumentParams(inst) : null;
    const curParams = cur ? cur.params : parsedOrig.params;
    const version = cur ? cur.version : parsedOrig.version;
    const edited = !curParams.every((p, k) => p === parsedOrig.params[k]);
    if (edited) editedCount++;

    // Re-encode the sample name only when edited (preserve the version label char 0).
    if (edited) {
      const body = cinter4ParamsToSampleName(curParams).slice(1);
      const first = version === 3
        ? (origName[0] && !/[0-9]/.test(origName[0]) ? origName[0] : 's')
        : '1';
      const newName = (first + body).slice(0, 22);
      for (let j = 0; j < 22; j++) out[hoff + j] = j < newName.length ? newName.charCodeAt(j) & 0x7f : 0;
    }

    // Sample data region.
    if (sampleBytes <= 0) continue;
    if (opts.stripCinter) {
      for (let j = 0; j < sampleBytes && sampleStart + j < out.length; j++) out[sampleStart + j] = 0;
    } else if (edited) {
      // MOD export of an edited voice → regenerate the PCM to match the new params
      // (version-correct synth: v3 float / v4 fixed-point).
      const pcm = renderCinterVoice(cinter4ParamsToWords(curParams, version), sampleBytes, null, version);
      for (let j = 0; j < sampleBytes && sampleStart + j < out.length; j++) out[sampleStart + j] = pcm[j] & 0xff;
    }
    // else (MOD export, unedited) → keep the original rendered PCM untouched.
  }

  return { data: out, cinterCount, editedCount };
}

// ── High-level Cinter .mod export (single source of truth for all call sites) ──

export interface CinterModExportOptions {
  stripCinter: boolean;        // clear synth samples (Cinter format) vs keep rendered PCM
  moduleName?: string;
  bpm?: number;
  speed?: number;
  channels?: number;
}

export interface CinterModExportResult {
  data: Uint8Array;
  filename: string;
  cinterCount: number;
}

/**
 * Produce a Cinter .mod from the current song: OpenMPT writes the (edited)
 * patterns, then we splice in the Cinter sample table. Used by the Export dialog
 * (MOD + Native), the format-aware Save, and anywhere else a Cinter .mod is saved.
 */
export async function exportCinterModFile(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  songPositions: number[],
  opts: CinterModExportOptions,
): Promise<CinterModExportResult> {
  const { exportWithOpenMPT } = await import('./OpenMPTExporter');
  const omptRes = await exportWithOpenMPT(patterns, instruments, songPositions, {
    format: 'mod',
    moduleName: opts.moduleName || 'cinter',
    channelLimit: opts.channels ?? 4,
    initialBPM: opts.bpm ?? 125,
    initialSpeed: opts.speed ?? 6,
  });
  const omptBytes = new Uint8Array(await omptRes.data.arrayBuffer());
  const res = buildCinterModFromOpenMPT(omptBytes, instruments, { stripCinter: opts.stripCinter });
  const filename = `${(opts.moduleName || 'cinter').replace(/[^a-zA-Z0-9._-]/g, '_')}.mod`;
  return { data: res.data, filename, cinterCount: res.cinterCount };
}

/** Trigger a browser download of bytes (copies to a plain ArrayBuffer for Blob). */
export function downloadBytes(data: Uint8Array, filename: string): void {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const url = URL.createObjectURL(new Blob([copy], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface CinterCrunchedResult {
  songdata: Uint8Array;      // the compact CinterConvert music+param binary
  rawSamples: Uint8Array;    // raw (non-Cinter) sample PCM — the separate file
  errors: string[];          // CinterConvert warnings (unsupported commands etc.)
  filename: string;          // <name>.cinter4
}

/**
 * Export the song to the small crunched Cinter format (CinterConvert output).
 * The Cinter PCM is NOT included — the Amiga regenerates it from the param words;
 * only raw (non-Cinter) samples carry over, as a second file.
 *
 * Byte-exactness requires the ORIGINAL .mod: CinterConvert reads exact ProTracker
 * pattern bytes, including out-of-range period cells (note < 0) that DEViLBOX's
 * note model + an OpenMPT re-encode cannot round-trip. So when `originalModBytes`
 * is available we crunch those — patched with the current instrument params via
 * cinterPatchMod (which never touches patterns), so instrument edits are reflected
 * while unedited instruments stay byte-identical. Only fall back to an OpenMPT
 * rebuild for songs with no source .mod (built in-app), which is not guaranteed
 * byte-exact.
 */
export async function exportCinterCrunched(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  songPositions: number[],
  opts: { moduleName?: string; bpm?: number; speed?: number; originalModBytes?: Uint8Array },
): Promise<CinterCrunchedResult> {
  let modBytes: Uint8Array;
  if (opts.originalModBytes && opts.originalModBytes.length > 1084) {
    modBytes = cinterPatchMod(opts.originalModBytes, instruments, { stripCinter: false }).data;
  } else {
    modBytes = (await exportCinterModFile(patterns, instruments, songPositions, {
      stripCinter: false, moduleName: opts.moduleName, bpm: opts.bpm, speed: opts.speed,
    })).data;
  }
  const { encodeCinter4FromMod } = await import('./Cinter4Exporter');
  const c = encodeCinter4FromMod(modBytes);
  const filename = `${(opts.moduleName || 'cinter').replace(/[^a-zA-Z0-9._-]/g, '_')}.cinter4`;
  return { songdata: c.songdata, rawSamples: c.rawSamples, errors: c.errors, filename };
}
