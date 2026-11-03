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
 *   [Headers: empty — the from-scratch writer has no sample bank]
 *   [Samples: empty]
 *
 * Priority chain:
 *   1. The loaded module (`song.hippelFileData`) with the grid edits written in
 *      (rebuildHippelSong) — keeps the TFMX block, sample headers and PCM.
 *   2. From-scratch TS serializer — songs that carry no CoSo module
 *   3. UADE chip RAM readback — fallback for runtime-edited modules
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { HippelCoSoConfig, HippelCoSoSampleData } from '@/types/instrument/exotic';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { isCoSo, rebuildHippelSong } from '@/engine/hippel/rebuildHippelModule';
import { cosoIndexForXM } from '@lib/import/formats/HippelCoSoParser';

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

// ── From-scratch serializer ─────────────────────────────────────────────────

/** Sample headers + PCM of the loaded COSO module (empty when there is none). */
function sourceSampleBank(song: TrackerSong): { headers: Uint8Array; pcm: Uint8Array; count: number } {
  const empty = { headers: new Uint8Array(0), pcm: new Uint8Array(0), count: 0 };
  if (!song.hippelFileData) return instrumentSampleBank(song);
  const src = new Uint8Array(song.hippelFileData);
  if (src.length < 0x34 || !isCoSo(src)) return empty;
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const headersOff = dv.getUint32(24);
  const samplesOff = dv.getUint32(28);
  if (headersOff === 0 || headersOff > samplesOff || samplesOff > src.length) return empty;
  const hasTfmx = String.fromCharCode(src[0x20], src[0x21], src[0x22], src[0x23]) === 'TFMX';
  const count = hasTfmx ? dv.getUint16(0x32) : Math.max(0, Math.floor((samplesOff - headersOff) / 10) - 1);
  return { headers: src.slice(headersOff, samplesOff), pcm: src.slice(samplesOff), count };
}

/**
 * A song with no loaded module (a New Song with CoSo starter instruments) carries each
 * instrument's sample data in its config. The bank is rebuilt from those: one 10-byte
 * header per sample index (pointer into the PCM section, length and repeat in words, loop
 * start), a sample used by several instruments written once, unused indices left empty,
 * and the closing empty header the player's count (headers - 1) expects.
 */
function instrumentSampleBank(song: TrackerSong): { headers: Uint8Array; pcm: Uint8Array; count: number } {
  const byIndex = new Map<number, HippelCoSoSampleData>();
  for (const inst of song.instruments) {
    const hc = (inst as unknown as Record<string, unknown>).hippelCoso as HippelCoSoConfig | undefined;
    for (const smp of hc?.samples ?? []) if (!byIndex.has(smp.index)) byIndex.set(smp.index, smp);
  }
  if (byIndex.size === 0) return { headers: new Uint8Array(0), pcm: new Uint8Array(0), count: 0 };
  const count = Math.max(...byIndex.keys()) + 1;
  const headers = new Uint8Array((count + 1) * 10);
  const pcmParts: number[][] = [];
  let pcmLen = 0;
  for (const [index, smp] of byIndex) {
    const dv = new DataView(headers.buffer, index * 10, 10);
    dv.setUint32(0, pcmLen);
    dv.setUint16(4, smp.length >> 1);
    dv.setUint16(6, smp.loopStart);
    dv.setUint16(8, smp.repeatLength >> 1);
    pcmParts.push(smp.pcm);
    pcmLen += smp.pcm.length;
  }
  const pcm = new Uint8Array(pcmLen);
  let at = 0;
  for (const part of pcmParts) { pcm.set(part, at); at += part.length; }
  return { headers, pcm, count };
}

function buildCoSoFile(song: TrackerSong): { data: Uint8Array; warnings: string[] } {
  const warnings: string[] = [];
  const CHANNELS = 4;
  // COSO header (32 bytes) + TFMX count block at 0x20 (32 bytes); the decoder
  // (libtfmxaudiodecoder COSO_detect) requires "TFMX" at +0x20.
  const HEADER_SIZE = 64;

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
  // Pattern streams are not deduplicated (see below)
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
        // CoSo plays 36 notes (C-1 to B-3). A note outside them has no CoSo index: it is written as a rest and reported,
        // never as a different pitch.
        const cosoNote = cell && (cell.note ?? 0) > 0 ? cosoIndexForXM(cell.note) : null;
        if (cell && (cell.note ?? 0) > 0 && cosoNote === null) {
          warnings.push(`Pattern ${p} voice ${ch} row ${r}: note ${cell.note} is outside C-1 to B-3, the notes CoSo plays; written as a rest.`);
        }
        if (!cell || cosoNote === null) {
          // Empty row. CoSo note byte 0 is a REAL sub-bass note (decodes to xmNote 13), so an empty row is the
          // FD n "set row speed and wait" command with n = 0: the voice holds what it plays for one step and every
          // later event keeps lasting one step. Never FE n: FE sets the row speed and reads on in the SAME step,
          // so a pattern of FE rows takes no time and the player runs through the whole song in one step (the New
          // Song playhead stuck between positions 0 and 1). The parser reads both as one 2-byte empty row.
          // The grid is time-aligned (one row per replayer step), so every row lasts one step: row speed 0.
          bytes.push(s8toByte(-3)); // FD: set row speed, wait
          bytes.push(0);
        } else {
          // A note row follows the FD 0 rows before it, so the row speed in force is 0: it lasts one step.
          bytes.push(s8toByte(cosoNote));
          const volseqIdx = Math.max(0, ((cell.instrument ?? 1) - 1)) & 0x1F;
          bytes.push(volseqIdx);
        }
      }
      bytes.push(s8toByte(-1)); // end marker

      const encoded = new Uint8Array(bytes);
      // One block per step and voice, never shared: the grid shows a copy per cell, and a block shared by cells the user
      // never linked would carry the next edit to all of them (G29).
      chIndices.push(patternPool.length);
      patternPool.push(encoded);
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

  // ── Build songs (6 bytes each: 1 subsong, then the all-zero end entry) ─
  // Real COSO files close the song table with an empty 6-byte entry, and the
  // nuade / UADE player counts subsongs as (samples - songs) / 6 - 1: a table
  // without it has 0 subsongs and the player refuses the module (N12i).
  const songsSectionSize = 12;

  // ── Headers + Samples: the loaded module's sample bank, verbatim ─────
  // Header pointers are relative to the sample data section, and fseqs name
  // samples by index, so the bank stays valid when copied as-is.
  const bank = sourceSampleBank(song);
  const headersSectionSize = bank.headers.length;
  const samplesSectionSize = bank.pcm.length;

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
  writeString(output, 0x20, 'TFMX', 4);
  writeU16BE(output, 0x24, Math.max(0, nFseqs - 1));
  writeU16BE(output, 0x26, Math.max(0, nVolseqs - 1));
  writeU16BE(output, 0x28, Math.max(0, nPatterns - 1));
  writeU16BE(output, 0x2a, Math.max(0, songSteps - 1));
  writeU16BE(output, 0x30, 1);
  writeU16BE(output, 0x32, bank.count);
  output.set(bank.headers, headersOff);
  output.set(bank.pcm, samplesOff);

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

/**
 * The CoSo module a song plays and saves as: the loaded module with the grid edits patched in place when every edit fits,
 * else the module written again from the grid. The one source for live playback and export, so what is heard is what is
 * saved. Null when the song has no loaded CoSo module or the from-scratch writer produced nothing.
 */
export function hippelCoSoModule(song: TrackerSong): { bytes: Uint8Array; warnings: string[]; fromGrid: boolean } | null {
  // The from-scratch writer keeps only what the grid and instruments show, so the loaded bytes (with their track
  // transposes and effects) are kept whenever the patcher can write every edit; edits it refuses (a block shared by several steps or voices, a
  // longer encoding, a cleared note) need the module laid out again from the grid.
  const rebuilt = song.hippelFileData && isCoSo(new Uint8Array(song.hippelFileData)) ? rebuildHippelSong(song) : null;
  if (rebuilt && rebuilt.refused.length === 0) return { bytes: rebuilt.bytes, warnings: [], fromGrid: false };
  const result = buildCoSoFile(song);
  return result.data.length > 0 ? { bytes: result.data, warnings: result.warnings, fromGrid: true } : null;
}

export async function exportAsHippelCoSo(song: TrackerSong): Promise<HippelCoSoExportResult> {
  const warnings: string[] = [];
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. The loaded module with the grid edits patched in place, or written again from the grid (hippelCoSoModule).
  try {
    const module = hippelCoSoModule(song);
    if (module) {
      return {
        data: new Blob([module.bytes as unknown as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
        filename: `${baseName}.hipc`,
        warnings: module.warnings,
      };
    }
    warnings.push('From-scratch build returned empty data.');
  } catch (e) {
    warnings.push(`From-scratch build failed: ${(e as Error).message}.`);
  }

  // 3. Fallback: UADE chip RAM readback
  try {
    const moduleSize = song.instruments?.[0]?.uadeChipRam?.moduleSize;
    if (moduleSize && moduleSize > 0) {
      const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
      const chipData = await chipEditor.readEditedModule(moduleSize);
      if (chipData && chipData.byteLength > 0) {
        warnings.push('Exported from UADE chip RAM (runtime state).');
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
