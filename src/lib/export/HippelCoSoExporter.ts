/**
 * HippelCoSoExporter.ts — Export TrackerSong as Jochen Hippel CoSo (.coso) format
 *
 * Builds a valid COSO binary from TrackerSong data, including:
 *   - Volume/frequency sequences from HippelCoSoConfig on instruments
 *   - Pattern data encoded via the variable-length CoSo byte stream
 *   - Track table and song definition
 *
 * File layout:
 *   "COSO" magic (4 bytes)
 *   7 × uint32 BE section offsets (28 bytes)
 *   [FreqSeqs: pointer table + sequence data]
 *   [VolSeqs: pointer table + header+data per instrument]
 *   [Patterns: pointer table + encoded pattern bytes]
 *   [Tracks: 12 bytes per song step (4ch × 3 bytes)]
 *   [Songs: 6 bytes per subsong]
 *   [Headers: empty — sample metadata, not used for synth-only songs]
 *   [Samples: empty — no PCM data for synth-only songs]
 *
 * Priority chain:
 *   1. From-scratch TS serializer — builds from TrackerSong data
 *   2. UADE chip RAM readback — fallback for runtime-edited modules
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { HippelCoSoConfig } from '@/types/instrument/exotic';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

export interface HippelCoSoExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Binary helpers ──────────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

function s8toByte(v: number): number { return v < 0 ? v + 256 : v & 0xFF; }

// ── Note conversion ─────────────────────────────────────────────────────────

const PT_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  107, 101,  95,  90,  85,  80,  76,  72,  68,  64,  60,  57,
];

const COSO_PERIODS = [
  1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,960,906,
  856,808,762,720,678,640,604,570,538,508,480,453,
  428,404,381,360,339,320,302,285,269,254,240,226,
  214,202,190,180,170,160,151,143,135,127,120,113,
  107,101,95,90,85,80,76,72,68,64,60,57,
  54,51,48,45,43,40,38,36,34,32,30,28,
  27,25,24,23,21,20,19,18,17,16,15,14,
];

function xmNoteToCoSo(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) {
    return Math.max(0, Math.min(83, xmNote - 1));
  }
  const period = PT_PERIODS[ptIdx];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < COSO_PERIODS.length; i++) {
    const d = Math.abs(COSO_PERIODS[i] - period);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// ── From-scratch serializer ─────────────────────────────────────────────────

function buildCoSoFile(song: TrackerSong): { data: Uint8Array; warnings: string[] } {
  const warnings: string[] = [];
  const CHANNELS = 4;
  const HEADER_SIZE = 32;

  // ── Extract instrument configs ──────────────────────────────────────────
  const hcConfigs: (HippelCoSoConfig | null)[] = [];
  for (const inst of song.instruments) {
    const hc = (inst as unknown as Record<string, unknown>).hippelCoso as HippelCoSoConfig | undefined;
    hcConfigs.push(hc ?? null);
  }

  // Ensure at least 1 instrument with a default config
  if (hcConfigs.length === 0 || hcConfigs.every(c => c === null)) {
    hcConfigs.length = 0;
    hcConfigs.push({
      fseq: [0, -31],
      vseq: [64, -31],
      volSpeed: 1,
      vibSpeed: 0,
      vibDepth: 0,
      vibDelay: 0,
    });
  }

  // ── Build frequency sequences ─────────────────────────────────────────
  // Deduplicate: collect unique fseq arrays
  const fseqPool: number[][] = [];
  const instrFseqIdx: number[] = [];

  for (const hc of hcConfigs) {
    if (!hc) {
      instrFseqIdx.push(0);
      continue;
    }
    const fseq = hc.fseq && hc.fseq.length > 0 ? hc.fseq : [0, -31];
    // Check for existing identical fseq
    let found = -1;
    for (let i = 0; i < fseqPool.length; i++) {
      if (fseqPool[i].length === fseq.length && fseqPool[i].every((v, j) => v === fseq[j])) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      instrFseqIdx.push(found);
    } else {
      instrFseqIdx.push(fseqPool.length);
      fseqPool.push(fseq);
    }
  }

  // Build fseq section: pointer table (nFseqs × 2 bytes) + data
  const nFseqs = fseqPool.length || 1;
  if (fseqPool.length === 0) fseqPool.push([0, -31]);
  const fseqPtrTableSize = nFseqs * 2;
  let fseqDataSize = 0;
  const fseqDataOffsets: number[] = [];
  for (const seq of fseqPool) {
    fseqDataOffsets.push(fseqPtrTableSize + fseqDataSize);
    fseqDataSize += seq.length;
  }
  const fseqSectionSize = fseqPtrTableSize + fseqDataSize;

  // ── Build volume sequences ────────────────────────────────────────────
  // Each volseq: 5-byte header + vseq data
  const nVolseqs = hcConfigs.length;
  const volseqPtrTableSize = nVolseqs * 2;
  let volseqDataSize = 0;
  const volseqDataOffsets: number[] = [];
  for (const hc of hcConfigs) {
    volseqDataOffsets.push(volseqPtrTableSize + volseqDataSize);
    const vseq = hc?.vseq ?? [64, -31];
    volseqDataSize += 5 + vseq.length; // 5-byte header + data
  }
  const volseqSectionSize = volseqPtrTableSize + volseqDataSize;

  // ── Encode patterns ───────────────────────────────────────────────────
  // Each TrackerSong pattern → up to 4 CoSo pattern streams (one per channel)
  // Deduplicate pattern streams across the song
  const patternPool: Uint8Array[] = [];
  // For each (trackerPattern, channel) → index into patternPool
  const patternMap: number[][] = []; // [patIdx][ch] = poolIdx

  for (let p = 0; p < song.patterns.length; p++) {
    const pat = song.patterns[p];
    const chIndices: number[] = [];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const rows = pat?.channels[ch]?.rows ?? [];
      // Encode this channel's pattern
      const bytes: number[] = [];
      for (let r = 0; r < (pat?.length ?? 16); r++) {
        const cell = rows[r];
        if (!cell || (cell.note ?? 0) <= 0) {
          bytes.push(0);    // note 0
          bytes.push(0);    // info 0
        } else {
          const cosoNote = xmNoteToCoSo(cell.note);
          bytes.push(s8toByte(cosoNote));
          const volseqIdx = Math.max(0, ((cell.instrument ?? 1) - 1)) & 0x1F;
          bytes.push(volseqIdx);
        }
      }
      bytes.push(s8toByte(-1)); // end marker

      const encoded = new Uint8Array(bytes);
      // Check for duplicate
      let found = -1;
      for (let i = 0; i < patternPool.length; i++) {
        const existing = patternPool[i];
        if (existing.length === encoded.length &&
            existing.every((v, j) => v === encoded[j])) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        chIndices.push(found);
      } else {
        chIndices.push(patternPool.length);
        patternPool.push(encoded);
      }
    }
    patternMap.push(chIndices);
  }

  const nPatterns = patternPool.length;
  const patPtrTableSize = nPatterns * 2;
  let patDataSize = 0;
  const patDataOffsets: number[] = [];
  for (const pat of patternPool) {
    patDataOffsets.push(patPtrTableSize + patDataSize);
    patDataSize += pat.length;
  }
  const patternSectionSize = patPtrTableSize + patDataSize;

  // ── Build tracks (12 bytes per song step) ─────────────────────────────
  const songSteps = song.patterns.length || 1;
  const tracksSectionSize = songSteps * 12;

  // ── Build songs (6 bytes each, just 1 subsong) ────────────────────────
  const songsSectionSize = 6;

  // ── Headers + Samples (empty for synth-only songs) ────────────────────
  const headersSectionSize = 0;
  const samplesSectionSize = 0;

  // ── Compute offsets ───────────────────────────────────────────────────
  const frqseqsOff  = HEADER_SIZE;
  const volseqsOff  = frqseqsOff + fseqSectionSize;
  const patternsOff = volseqsOff + volseqSectionSize;
  const tracksOff   = patternsOff + patternSectionSize;
  const songsOff    = tracksOff + tracksSectionSize;
  const headersOff  = songsOff + songsSectionSize;
  const samplesOff  = headersOff + headersSectionSize;

  const totalSize = samplesOff + samplesSectionSize;
  const output = new Uint8Array(totalSize);

  // ── Write header ──────────────────────────────────────────────────────
  writeString(output, 0, 'COSO', 4);
  writeU32BE(output, 4, frqseqsOff);
  writeU32BE(output, 8, volseqsOff);
  writeU32BE(output, 12, patternsOff);
  writeU32BE(output, 16, tracksOff);
  writeU32BE(output, 20, songsOff);
  writeU32BE(output, 24, headersOff);
  writeU32BE(output, 28, samplesOff);

  // ── Write freq sequences ──────────────────────────────────────────────
  // Pointer table: each entry is absolute offset into file
  for (let i = 0; i < nFseqs; i++) {
    writeU16BE(output, frqseqsOff + i * 2, frqseqsOff + fseqDataOffsets[i]);
  }
  // Data
  let fPos = frqseqsOff + fseqPtrTableSize;
  for (const seq of fseqPool) {
    for (const v of seq) {
      writeU8(output, fPos++, s8toByte(v));
    }
  }

  // ── Write volume sequences ────────────────────────────────────────────
  // Pointer table
  for (let i = 0; i < nVolseqs; i++) {
    writeU16BE(output, volseqsOff + i * 2, volseqsOff + volseqDataOffsets[i]);
  }
  // Data: 5-byte header + vseq bytes
  let vPos = volseqsOff + volseqPtrTableSize;
  for (let i = 0; i < nVolseqs; i++) {
    const hc = hcConfigs[i];
    const volSpeed = hc?.volSpeed ?? 1;
    const fseqIdx = instrFseqIdx[i] ?? 0;
    const vibSpeed = hc?.vibSpeed ?? 0;
    const vibDepth = hc?.vibDepth ?? 0;
    const vibDelay = hc?.vibDelay ?? 0;
    const vseq = hc?.vseq ?? [64, -31];

    writeU8(output, vPos, volSpeed & 0xFF); vPos++;
    writeU8(output, vPos, s8toByte(fseqIdx)); vPos++;
    writeU8(output, vPos, s8toByte(vibSpeed)); vPos++;
    writeU8(output, vPos, s8toByte(vibDepth)); vPos++;
    writeU8(output, vPos, vibDelay & 0xFF); vPos++;
    for (const v of vseq) {
      writeU8(output, vPos++, s8toByte(v));
    }
  }

  // ── Write patterns ────────────────────────────────────────────────────
  // Pointer table: absolute offsets
  for (let i = 0; i < nPatterns; i++) {
    writeU16BE(output, patternsOff + i * 2, patternsOff + patDataOffsets[i]);
  }
  // Data
  let pPos = patternsOff + patPtrTableSize;
  for (const pat of patternPool) {
    output.set(pat, pPos);
    pPos += pat.length;
  }

  // ── Write tracks ──────────────────────────────────────────────────────
  for (let step = 0; step < songSteps; step++) {
    const tBase = tracksOff + step * 12;
    const chIndices = patternMap[step] ?? [0, 0, 0, 0];
    for (let ch = 0; ch < CHANNELS; ch++) {
      writeU8(output, tBase + ch * 3, chIndices[ch] & 0xFF);     // patternIndex
      writeU8(output, tBase + ch * 3 + 1, 0);                     // trackTranspose = 0
      writeU8(output, tBase + ch * 3 + 2, 0);                     // volTranspose = 0
    }
  }

  // ── Write songs ───────────────────────────────────────────────────────
  writeU16BE(output, songsOff, 0);                     // first track index
  writeU16BE(output, songsOff + 2, songSteps - 1);     // last track index
  writeU16BE(output, songsOff + 4, song.initialSpeed || 6);    // speed

  return { data: output, warnings };
}

// ── Public export function ──────────────────────────────────────────────────

export async function exportAsHippelCoSo(song: TrackerSong): Promise<HippelCoSoExportResult> {
  const warnings: string[] = [];

  // 1. Build from TrackerSong data
  try {
    const result = buildCoSoFile(song);
    if (result.data.length > 0) {
      const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
      return {
        data: new Blob([result.data as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
        filename: `${baseName}.coso`,
        warnings: [...warnings, ...result.warnings],
      };
    }
    warnings.push('From-scratch build returned empty data.');
  } catch (e) {
    warnings.push(`From-scratch build failed: ${(e as Error).message}.`);
  }

  // 2. Fallback: UADE chip RAM readback
  try {
    const moduleSize = song.instruments?.[0]?.uadeChipRam?.moduleSize;
    if (moduleSize && moduleSize > 0) {
      const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
      const chipData = await chipEditor.readEditedModule(moduleSize);
      if (chipData && chipData.byteLength > 0) {
        warnings.push('Exported from UADE chip RAM (runtime state).');
        const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
        return {
          data: new Blob([chipData as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
          filename: `${baseName}.coso`,
          warnings,
        };
      }
    }
  } catch (e) {
    warnings.push(`Chip RAM readback failed: ${(e as Error).message}.`);
  }

  throw new Error('No export method available for HippelCoSo: ' + warnings.join(' '));
}
