/**
 * StartrekkerAMExporter.ts — Export TrackerSong as StarTrekker AM format
 *
 * StarTrekker AM is a two-file format:
 *   - .mod file: standard ProTracker MOD with FLT4/FLT8 signature
 *   - .nt file: AM synthesis instrument definitions
 *
 * The exporter produces both files bundled together. The .mod file follows
 * standard ProTracker layout. The .nt file contains the "ST1.2 ModuleINFO"
 * header followed by up to 31 × 120-byte AM instrument blocks.
 *
 * Export strategy:
 *   1. If `startrekkerAMFileData` exists, return it as the .mod file.
 *      Optionally rebuild the .nt file from instrument configs.
 *   2. If no original data, build the full MOD from pattern data.
 *
 * Reference: StartrekkerAMParser.ts (import), StartrekkerAMEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { StartrekkerAMConfig } from '@/types/instrument/exotic';
import { encodeStartrekkerAMCell } from '@/engine/uade/encoders/StartrekkerAMEncoder';

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_INSTRUMENTS = 31;
const NUM_CHANNELS    = 4;
const ROWS_PER_PAT    = 64;
const BYTES_PER_CELL  = 4;
const PATTERN_SIZE    = ROWS_PER_PAT * NUM_CHANNELS * BYTES_PER_CELL; // 1024

const NT_MAGIC       = 'ST1.2 ModuleINFO';
const NT_HEADER_SIZE = 24;  // 16-byte magic + 8-byte padding
const NT_INSTR_SIZE  = 120;
const AM_MAGIC       = 0x414D; // "AM"

// ── Result type ─────────────────────────────────────────────────────────────

export interface StartrekkerAMExportResult {
  /** The .mod file data */
  modData: Blob;
  /** The .nt companion file data */
  ntData: Blob;
  modFilename: string;
  ntFilename: string;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}

function writeS16BE(view: DataView, off: number, val: number): void {
  view.setInt16(off, val, false);
}

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

function sanitizeName(name: string): string {
  return name
    .replace(/\s*\[StarTrekker AM\].*$/i, '')
    .replace(/[^\w\s.-]/g, '')
    .trim() || 'untitled';
}

// ── Build NT file ───────────────────────────────────────────────────────────

function buildNTFile(song: TrackerSong): Uint8Array {
  // NT file: header (24 bytes) + 31 instruments × 120 bytes = 3744 bytes total
  const ntSize = NT_HEADER_SIZE + MAX_INSTRUMENTS * NT_INSTR_SIZE;
  const nt = new Uint8Array(ntSize);
  const ntView = new DataView(nt.buffer);

  // Write magic header
  writeStr(nt, 0, NT_MAGIC, 16);
  // Bytes 16-23: padding (zeros)

  // Write instrument blocks
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const base = NT_HEADER_SIZE + i * NT_INSTR_SIZE;
    const inst = i < song.instruments.length ? song.instruments[i] : undefined;
    const amCfg = inst?.startrekkerAM as StartrekkerAMConfig | undefined;

    if (amCfg) {
      // AM synthesis instrument
      writeU16BE(ntView, base, AM_MAGIC);             // "AM" magic
      // Bytes 2-5: reserved/padding
      writeU16BE(ntView, base + 6, amCfg.basePeriod);
      writeS16BE(ntView, base + 8, amCfg.attackTarget);
      writeS16BE(ntView, base + 10, amCfg.attackRate);
      writeS16BE(ntView, base + 12, amCfg.attack2Target);
      writeS16BE(ntView, base + 14, amCfg.attack2Rate);
      writeS16BE(ntView, base + 16, amCfg.decayTarget);
      writeS16BE(ntView, base + 18, amCfg.decayRate);
      writeU16BE(ntView, base + 20, amCfg.sustainCount);
      // Bytes 22-23: reserved
      writeS16BE(ntView, base + 24, amCfg.releaseRate);
      writeU16BE(ntView, base + 26, amCfg.waveform & 0x03);
      writeU16BE(ntView, base + 28, amCfg.vibFreqStep);
      writeS16BE(ntView, base + 30, amCfg.vibAmplitude);
      // Bytes 32-33: reserved
      writeU16BE(ntView, base + 34, amCfg.periodShift);
    }
    // Non-AM instruments: leave as zeros (no AM magic = PCM sample)
  }

  return nt;
}

// ── Build MOD file ──────────────────────────────────────────────────────────

function buildMODFile(song: TrackerSong): Uint8Array {
  const numPatterns = Math.max(1, song.patterns.length);

  // MOD header: 20 (title) + 31×30 (samples) + 1 (songlen) + 1 (restart) + 128 (order) + 4 (tag) = 1084
  const MOD_HEADER_SIZE = 1084;

  // Collect sample PCM data
  const samplePCMs: Uint8Array[] = [];
  const sampleLens: number[] = [];
  const sampleVols: number[] = [];
  const sampleLoopStarts: number[] = [];
  const sampleLoopLens: number[] = [];

  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const inst = i < song.instruments.length ? song.instruments[i] : undefined;

    if (inst?.sample?.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frames  = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm[j] = (s16 >> 8) & 0xFF; // signed 8-bit
      }
      samplePCMs.push(pcm);
      sampleLens.push(Math.ceil(frames / 2)); // length in words
      sampleVols.push(Math.min(64, inst.volume ?? 64));
      sampleLoopStarts.push(Math.ceil((inst.sample?.loopStart ?? 0) / 2));
      const loopEnd = inst.sample?.loopEnd ?? 0;
      const loopStart = inst.sample?.loopStart ?? 0;
      sampleLoopLens.push(loopEnd > loopStart ? Math.ceil((loopEnd - loopStart) / 2) : 1);
    } else {
      samplePCMs.push(new Uint8Array(0));
      sampleLens.push(0);
      sampleVols.push(0);
      sampleLoopStarts.push(0);
      sampleLoopLens.push(1);
    }
  }

  const totalSampleBytes = samplePCMs.reduce((a, p) => a + ((p.length + 1) & ~1), 0);
  const totalSize = MOD_HEADER_SIZE + numPatterns * PATTERN_SIZE + totalSampleBytes;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Title (20 bytes) ──────────────────────────────────────────────────
  const title = sanitizeName(song.name).substring(0, 20);
  writeStr(output, 0, title, 20);

  // ── Sample headers (31 × 30 bytes) ────────────────────────────────────
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const base = 20 + i * 30;
    const inst = i < song.instruments.length ? song.instruments[i] : undefined;
    const name = (inst?.name ?? '').substring(0, 22);
    writeStr(output, base, name, 22);
    writeU16BE(view, base + 22, sampleLens[i]);
    output[base + 24] = 0;                          // finetune
    output[base + 25] = sampleVols[i] & 0x3F;       // volume (0-64)
    writeU16BE(view, base + 26, sampleLoopStarts[i]);
    writeU16BE(view, base + 28, sampleLoopLens[i]);
  }

  // ── Song length + restart + order table ───────────────────────────────
  const songLen = Math.min(128, song.songPositions.length);
  output[950] = songLen;
  output[951] = song.restartPosition ?? 0;

  for (let i = 0; i < 128; i++) {
    output[952 + i] = i < songLen ? (song.songPositions[i] ?? 0) : 0;
  }

  // ── Format tag (FLT4 for StarTrekker) ─────────────────────────────────
  writeStr(output, 1080, 'FLT4', 4);

  // ── Pattern data ──────────────────────────────────────────────────────
  let offset = MOD_HEADER_SIZE;
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];

    for (let row = 0; row < ROWS_PER_PAT; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (pat && ch < pat.channels.length && row < pat.length) {
          const cell = pat.channels[ch].rows[row];
          const encoded = encodeStartrekkerAMCell(cell);
          output.set(encoded, offset);
        }
        offset += BYTES_PER_CELL;
      }
    }
  }

  // ── Sample data ───────────────────────────────────────────────────────
  for (const pcm of samplePCMs) {
    output.set(pcm, offset);
    offset += pcm.length;
    if (pcm.length & 1) offset++; // word align
  }

  return output;
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportStartrekkerAM(
  song: TrackerSong,
): Promise<StartrekkerAMExportResult> {
  const warnings: string[] = [];

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `StarTrekker AM supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }
  if (song.instruments.length > MAX_INSTRUMENTS) {
    warnings.push(
      `StarTrekker AM supports max ${MAX_INSTRUMENTS} instruments; ${song.instruments.length - MAX_INSTRUMENTS} will be dropped.`
    );
  }

  // Build the .mod file
  let modBuf: Uint8Array;
  const fileData = song.startrekkerAMFileData;
  if (fileData && fileData.byteLength > 0) {
    modBuf = new Uint8Array(fileData);
  } else {
    modBuf = buildMODFile(song);
  }

  // Build the .nt companion file
  const ntBuf = buildNTFile(song);

  const baseName = sanitizeName(song.name);
  const modFilename = baseName.endsWith('.mod') ? baseName : `${baseName}.mod`;
  const ntFilename = modFilename.replace(/\.mod$/i, '.nt');

  return {
    modData: new Blob([new Uint8Array(modBuf) as BlobPart], { type: 'application/octet-stream' }),
    ntData: new Blob([new Uint8Array(ntBuf) as BlobPart], { type: 'application/octet-stream' }),
    modFilename,
    ntFilename,
    warnings,
  };
}
