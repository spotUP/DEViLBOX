/**
 * soundMonExport.ts — Build a SoundMon V2 (.bp) file from TrackerSong
 *
 * Produces a valid SoundMon V2 ("V.2") binary from any 4-channel TrackerSong
 * whose patterns use 16-row blocks.
 *
 * File layout:
 *   Song title (26 bytes)
 *   Magic "V.2\0" at offset 26 (4 bytes)
 *   Synth tables count (byte 29)  — part of magic 4 bytes
 *   Song length (u16BE at offset 30)
 *   15 instruments × 32 bytes (offset 32)
 *   Track table: songLength × 4 channels × 4 bytes
 *   Pattern data: higherPattern × 16 rows × 3 bytes/cell
 *   Synth waveform tables: nTables × 64 bytes
 *   Sample PCM data: concatenated 8-bit signed
 *
 * SoundMon patterns are 16-row single-channel blocks. Each sequence step
 * references one block per channel (with transposes). Our TrackerSong patterns
 * (one per sequence step, 4 channels, 16 rows each) get decomposed back.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import type { SoundMonConfig } from '@/types/instrument/exotic';

export interface SoundMonExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Binary write helpers ──────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeS8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val < 0 ? (val + 256) & 0xFF : val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── Note conversion ─────────────────────────────────────────────────────

/** XM note → SoundMon note index.
 *  Parser bpNoteToXM: SM note 1 → PERIODS[36]=856 → C-1 → XM 13.
 *  So reverse: SM note = XM note - 12. Range: 1-48 (4 octaves). */
function xmNoteToSM(xmNote: number): number {
  if (xmNote === 0 || xmNote === 97) return 0;
  const smNote = xmNote - 12;
  if (smNote < 1 || smNote > 48) return 0;
  return smNote;
}

// ── Effect reverse-mapping (XM → SoundMon) ─────────────────────────────

/** Map XM effect type → SoundMon effect number.
 *  Parser mapping (SM → XM): 0→0x00, 1→vol, 2→0x0F, 3→0x0E, 4→0x01, 5→0x02, 6→0x04, 7→0x0B
 *  Reverse:
 */
function xmEffectToSM(xmEffTyp: number, xmEff: number): { smOpt: number; smParam: number } {
  switch (xmEffTyp) {
    case 0x00: // Arpeggio → SM 0
      return { smOpt: xmEff !== 0 ? 0 : 0, smParam: xmEff };
    case 0x01: // Porta up → SM 4
      return { smOpt: 4, smParam: xmEff };
    case 0x02: // Porta down → SM 5
      return { smOpt: 5, smParam: xmEff };
    case 0x04: // Vibrato → SM 6
      return { smOpt: 6, smParam: xmEff };
    case 0x0B: // Position jump → SM 7
      return { smOpt: 7, smParam: xmEff };
    case 0x0E: // Filter → SM 3
      return { smOpt: 3, smParam: xmEff ? 1 : 0 };
    case 0x0F: // Speed → SM 2
      return { smOpt: 2, smParam: xmEff };
    default:
      return { smOpt: 0, smParam: 0 };
  }
}

// ── Cell encoding ───────────────────────────────────────────────────────

/** Encode TrackerCell → 3 bytes at offset in buf. */
function encodeCell(cell: TrackerCell, buf: Uint8Array, off: number): void {
  const note = xmNoteToSM(cell.note ?? 0);
  writeS8(buf, off, note);

  const instr = (cell.instrument ?? 0) & 0x0F;
  const xmEffTyp = cell.effTyp ?? 0;
  const xmEff = cell.eff ?? 0;

  // Volume column takes priority if set (SoundMon effect 1 = set volume)
  const vol = cell.volume ?? 0;
  if (vol >= 0x10 && vol <= 0x50) {
    buf[off + 1] = (instr << 4) | 1;  // SM effect 1 = set volume
    writeS8(buf, off + 2, (vol - 0x10));
  } else if (xmEffTyp !== 0 || xmEff !== 0) {
    const { smOpt, smParam } = xmEffectToSM(xmEffTyp, xmEff);
    buf[off + 1] = (instr << 4) | (smOpt & 0x0F);
    writeS8(buf, off + 2, smParam);
  } else {
    buf[off + 1] = (instr << 4);
    buf[off + 2] = 0;
  }
}

/** Check if a 16-row channel block is entirely empty. */
function isBlockEmpty(rows: TrackerCell[]): boolean {
  for (const cell of rows) {
    if ((cell.note ?? 0) !== 0 || (cell.instrument ?? 0) !== 0 ||
        (cell.effTyp ?? 0) !== 0 || (cell.eff ?? 0) !== 0) return false;
  }
  return true;
}

/** Check if two 16-row blocks are identical. */
function blocksEqual(a: TrackerCell[], b: TrackerCell[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i].note ?? 0) !== (b[i].note ?? 0) ||
        (a[i].instrument ?? 0) !== (b[i].instrument ?? 0) ||
        (a[i].effTyp ?? 0) !== (b[i].effTyp ?? 0) ||
        (a[i].eff ?? 0) !== (b[i].eff ?? 0)) return false;
  }
  return true;
}

// ── PCM extraction ──────────────────────────────────────────────────────

function extractPCM8FromWAV(audioBuffer: ArrayBuffer): Int8Array<ArrayBuffer> {
  const view = new DataView(audioBuffer);
  if (audioBuffer.byteLength < 44) return new Int8Array(0);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    result[i] = view.getInt16(44 + i * 2, true) >> 8;
  }
  return result;
}

// ── Built-in waveform generation ─────────────────────────────────────────

/** Generate a 64-byte waveform table for a SoundMon waveType (0-15). */
function generateBuiltinWave(waveType: number): Uint8Array {
  const wave = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const t = i / 64;
    let val = 0;
    switch (waveType & 0x0F) {
      case 0: // Sawtooth
        val = 127 - Math.round(254 * t);
        break;
      case 1: // Square
        val = t < 0.5 ? 127 : -128;
        break;
      case 2: // Triangle
        val = t < 0.25 ? Math.round(t * 4 * 127) :
              t < 0.75 ? Math.round((0.5 - t) * 4 * 127) :
              Math.round((t - 1) * 4 * 127);
        break;
      case 3: // Sine
        val = Math.round(Math.sin(t * Math.PI * 2) * 127);
        break;
      default: // Fallback to sine
        val = Math.round(Math.sin(t * Math.PI * 2) * 127);
    }
    wave[i] = val < 0 ? (val + 256) & 0xFF : val & 0xFF;
  }
  return wave;
}

// ── Main export ─────────────────────────────────────────────────────────

export function exportSongToSoundMon(song: TrackerSong): SoundMonExportResult {
  const warnings: string[] = [];
  const ROWS_PER_BLOCK = 16;
  const CHANNELS = 4;
  const MAX_INSTRUMENTS = 15;

  // ── Decompose TrackerSong patterns into SoundMon blocks ───────────────
  // Each TrackerSong pattern becomes one sequence step.
  // Each channel in a step becomes a SoundMon block (16 rows).
  // We de-duplicate identical blocks.

  const songLength = song.patterns.length || 1;
  const blockPool: TrackerCell[][] = [];  // unique blocks
  const trackTable: Array<{ pattern: number; soundTranspose: number; transpose: number }> = [];

  for (let seqIdx = 0; seqIdx < songLength; seqIdx++) {
    const pat = song.patterns[seqIdx];
    for (let ch = 0; ch < CHANNELS; ch++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < ROWS_PER_BLOCK; row++) {
        rows.push(pat?.channels[ch]?.rows[row] ?? {
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        });
      }

      if (isBlockEmpty(rows)) {
        // Pattern 0 = empty (no data)
        trackTable.push({ pattern: 0, soundTranspose: 0, transpose: 0 });
      } else {
        // Check if this block already exists in the pool
        let found = -1;
        for (let i = 0; i < blockPool.length; i++) {
          if (blocksEqual(blockPool[i], rows)) { found = i; break; }
        }
        if (found >= 0) {
          trackTable.push({ pattern: found + 1, soundTranspose: 0, transpose: 0 });
        } else {
          blockPool.push(rows);
          trackTable.push({ pattern: blockPool.length, soundTranspose: 0, transpose: 0 });
        }
      }
    }
  }

  const higherPattern = blockPool.length;

  // ── Instruments ───────────────────────────────────────────────────────
  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  const nInstruments = 15; // SoundMon always has exactly 15 slots

  // Collect synth table data (for synth instruments)
  const synthTables: Uint8Array[] = [];

  // Prepare per-instrument data
  type InstrData = { isSynth: boolean; name: string; pcm: Int8Array; volume: number;
    loop: number; repeat: number; smConfig?: SoundMonConfig; tableIdx: number;
    adsrTableIdx?: number };
  const instrData: InstrData[] = [];

  for (let i = 0; i < nInstruments; i++) {
    const inst = instruments[i];
    if (!inst) {
      instrData.push({ isSynth: false, name: '', pcm: new Int8Array(0), volume: 0,
        loop: 0, repeat: 2, tableIdx: 0 });
      continue;
    }

    const smConfig = (inst as unknown as Record<string, unknown>).soundMon as SoundMonConfig | undefined;

    if (smConfig && inst.synthType === 'SoundMonSynth') {
      // Synth instrument — add waveform table to pool
      const tableIdx = synthTables.length;

      // Main waveform table (64 bytes) — generate from waveType
      const wave = generateBuiltinWave(smConfig.waveType);
      synthTables.push(wave);

      // ADSR table: simple ramp from attackVolume → sustainVolume (64 bytes)
      const adsrTableIdx = synthTables.length;
      const adsrTable = new Uint8Array(64);
      for (let j = 0; j < 64; j++) {
        const t = j / 63;
        adsrTable[j] = Math.round(smConfig.attackVolume * (1 - t) + smConfig.sustainVolume * t) & 0xFF;
      }
      synthTables.push(adsrTable);

      instrData.push({ isSynth: true, name: inst.name || '', pcm: new Int8Array(0),
        volume: smConfig.sustainVolume ?? 64, loop: 0, repeat: 0, smConfig,
        tableIdx, adsrTableIdx });
    } else {
      // Sample instrument
      let pcm = new Int8Array(0);
      if (inst.sample?.audioBuffer) {
        try { pcm = extractPCM8FromWAV(inst.sample.audioBuffer); }
        catch { warnings.push(`Instrument ${i + 1}: PCM extraction failed.`); }
      }
      const loop = inst.sample?.loopStart ?? 0;
      const repeat = inst.sample?.loopEnd ? Math.max(2, (inst.sample.loopEnd - loop)) : 2;
      instrData.push({ isSynth: false, name: inst.name || '', pcm,
        volume: Math.min(64, Math.round((inst.volume ?? -6) > -60 ? 64 : 0)),
        loop, repeat, tableIdx: 0 });
    }
  }

  const nTables = synthTables.length;

  // ── Calculate sizes ───────────────────────────────────────────────────
  const HEADER_SIZE = 32;                             // title(26) + magic(4) + songLength(2)
  const INSTR_SIZE = nInstruments * 32;               // 15 × 32 = 480
  const TRACK_SIZE = songLength * CHANNELS * 4;       // track entries
  const PATTERN_DATA_SIZE = higherPattern * ROWS_PER_BLOCK * 3; // 3 bytes/cell
  const SYNTH_TABLE_SIZE = nTables * 64;

  let sampleDataSize = 0;
  for (const d of instrData) {
    if (!d.isSynth) sampleDataSize += d.pcm.length;
  }

  const totalSize = HEADER_SIZE + INSTR_SIZE + TRACK_SIZE +
    PATTERN_DATA_SIZE + SYNTH_TABLE_SIZE + sampleDataSize;

  // ── Build binary ──────────────────────────────────────────────────────
  const output = new Uint8Array(totalSize);
  let pos = 0;

  // Song title (26 bytes)
  const title = (song.name || 'Untitled').slice(0, 25);
  writeString(output, 0, title, 26);
  pos = 26;

  // Magic "V.2" + synth table count at byte 29
  writeU8(output, pos, 0x56); pos++;  // 'V'
  writeU8(output, pos, 0x2E); pos++;  // '.'
  writeU8(output, pos, 0x32); pos++;  // '2'
  writeU8(output, pos, nTables); pos++; // synth tables count

  // Song length
  writeU16BE(output, pos, songLength);
  pos += 2;

  // ── Instrument table (15 × 32 bytes) ─────────────────────────────────
  for (let i = 0; i < nInstruments; i++) {
    const d = instrData[i];
    const base = pos;

    if (d.isSynth && d.smConfig) {
      const sm = d.smConfig;
      writeU8(output, base, 0xFF);                     // synth marker
      writeU8(output, base + 1, d.tableIdx);            // wave table index
      writeU16BE(output, base + 2, 32);                 // length in words (64 bytes / 2)
      // ADSR: control=1 (enabled), table index, length=32 words, speed
      writeU8(output, base + 4, sm.attackSpeed > 0 ? 1 : 0); // adsrControl
      writeU8(output, base + 5, d.adsrTableIdx ?? 0);         // adsrTable (raw index, not shifted)
      writeU16BE(output, base + 6, 32);                        // adsrLen in words
      writeU8(output, base + 8, Math.min(63, sm.attackSpeed));
      // LFO: control, table (reuse wave table), depth, length
      const hasVib = sm.vibratoSpeed > 0 && sm.vibratoDepth > 0;
      writeU8(output, base + 9, hasVib ? 1 : 0);       // lfoControl
      writeU8(output, base + 10, d.tableIdx);            // lfoTable
      writeU8(output, base + 11, Math.min(64, sm.vibratoDepth));
      writeU16BE(output, base + 12, 32);                 // lfoLen
      // V2 layout continuation
      writeU8(output, base + 14, 0);                     // skip
      writeU8(output, base + 15, sm.vibratoDelay);       // lfoDelay
      writeU8(output, base + 16, Math.min(63, sm.vibratoSpeed)); // lfoSpeed
      writeU8(output, base + 17, 0);                     // egControl
      writeU8(output, base + 18, 0);                     // egTable
      writeU8(output, base + 19, 0);                     // skip
      writeU16BE(output, base + 20, 0);                  // egLen
      writeU8(output, base + 22, 0);                     // skip
      writeU8(output, base + 23, 0);                     // egDelay
      writeU8(output, base + 24, 1);                     // egSpeed
      writeU8(output, base + 25, d.volume);
      // 6 padding bytes (already zero)
    } else {
      // Sample instrument
      writeString(output, base, d.name.slice(0, 24), 24);
      const lenWords = Math.floor(d.pcm.length / 2);
      writeU16BE(output, base + 24, lenWords);
      if (d.pcm.length > 0) {
        writeU16BE(output, base + 26, Math.floor(d.loop / 2));
        writeU16BE(output, base + 28, Math.max(1, Math.floor(d.repeat / 2)));
        writeU16BE(output, base + 30, Math.min(64, d.volume));
      }
      // else all zeros (already)
    }
    pos += 32;
  }

  // ── Track table ───────────────────────────────────────────────────────
  for (let i = 0; i < trackTable.length; i++) {
    const t = trackTable[i];
    writeU16BE(output, pos, t.pattern);
    writeS8(output, pos + 2, t.soundTranspose);
    writeS8(output, pos + 3, t.transpose);
    pos += 4;
  }

  // ── Pattern data (higherPattern × 16 rows × 3 bytes) ─────────────────
  for (let blockIdx = 0; blockIdx < higherPattern; blockIdx++) {
    const block = blockPool[blockIdx];
    for (let row = 0; row < ROWS_PER_BLOCK; row++) {
      const cell = block[row] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      encodeCell(cell, output, pos);
      pos += 3;
    }
  }

  // ── Synth tables (nTables × 64 bytes) ─────────────────────────────────
  for (let t = 0; t < nTables; t++) {
    output.set(synthTables[t], pos);
    pos += 64;
  }

  // ── Sample PCM data ───────────────────────────────────────────────────
  for (let i = 0; i < nInstruments; i++) {
    const d = instrData[i];
    if (!d.isSynth && d.pcm.length > 0) {
      for (let j = 0; j < d.pcm.length; j++) {
        output[pos + j] = d.pcm[j] & 0xFF;
      }
      pos += d.pcm.length;
    }
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([output.slice(0, pos)], { type: 'application/octet-stream' }),
    filename: `${baseName}.bp`,
    warnings,
  };
}
