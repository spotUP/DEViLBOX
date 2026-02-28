/**
 * SoundMonParser.ts -- SoundMon / Brian Postma (.bp, .bp3, .sndmon) format parser
 *
 * SoundMon is a 4-channel Amiga tracker by Brian Postma featuring synth instruments
 * with ADSR, LFO, EG (envelope generator), FX, and modulation tables in addition
 * to regular PCM samples. Three versions exist:
 *   V1: magic "BPSM" at offset 26
 *   V2: magic "V.2" at offset 26
 *   V3: magic "V.3" at offset 26
 *
 * Binary layout (from FlodJS BPPlayer.js):
 *   [0..25]   26-byte title
 *   [26..29]  Format identifier ("BPSM" or "V.2\0" or "V.3\0")
 *   [29]      Number of synth tables (V2/V3 only)
 *   [30..31]  Song length (number of sequence steps)
 *   [32..]    15 instrument definitions (synth or sample)
 *   [..]      Track/sequence data (songLength * 4 entries, 4 bytes each)
 *   [..]      Pattern data (3 bytes per row: note, sample|effect, param)
 *   [..]      Synth table data (tables * 64 bytes, V2/V3 only)
 *   [..]      Sample PCM data (8-bit signed)
 *
 * Reference: FlodJS BPPlayer.js by Christian Corti (Neoart)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { SoundMonConfig, UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Utility functions ─────────────────────────────────────────────────────

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function u8(buf: Uint8Array, off: number): number {
  return buf[off];
}

function s8(buf: Uint8Array, off: number): number {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

// ── SoundMon period table (from FlodJS BPPlayer PERIODS) ─────────────────
// 84 entries covering 7 octaves. The player indexes with note+35.

const PERIODS = [
  6848, 6464, 6080, 5760, 5440, 5120, 4832, 4576, 4320, 4064, 3840, 3616,
  3424, 3232, 3040, 2880, 2720, 2560, 2416, 2288, 2160, 2032, 1920, 1808,
  1712, 1616, 1520, 1440, 1360, 1280, 1208, 1144, 1080, 1016,  960,  904,
   856,  808,  760,  720,  680,  640,  604,  572,  540,  508,  480,  452,
   428,  404,  380,  360,  340,  320,  302,  286,  270,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   107,  101,   95,   90,   85,   80,   76,   72,   68,   64,   60,   57,
];

// Standard ProTracker periods for note mapping
const PT_PERIODS = [
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2 (C-2 to B-2)
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3 (C-3 to B-3)
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  // Octave 4 (C-4 to B-4)
  107, 101,  95,  90,  85,  80,  76,  72,  68,  64,  60,  57,
];

/**
 * Map a SoundMon note value + transpose to an XM note number.
 * The BPPlayer uses PERIODS[note + 35] for period lookup.
 * SoundMon note 1 with transpose 0 → PERIODS[36] = 856 = C-1 in ProTracker.
 * XM note 13 = C-1, 25 = C-2, etc.
 */
function bpNoteToXM(note: number, transpose: number): number {
  if (note === 0) return 0;
  const periodsIdx = note + transpose + 35;
  if (periodsIdx < 0 || periodsIdx >= PERIODS.length) return 0;
  const period = PERIODS[periodsIdx];
  if (period <= 0) return 0;

  // Find closest match in ProTracker period table
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // PT_PERIODS[0] = C-1 = XM note 13
  const xmNote = bestIdx + 13;
  return Math.max(1, Math.min(96, xmNote));
}

// ── SoundMon version constants ─────────────────────────────────────────────

const BPSOUNDMON_V1 = 1;
const BPSOUNDMON_V2 = 2;
const BPSOUNDMON_V3 = 3;

// ── Instrument types ───────────────────────────────────────────────────────

interface BPSynthInstrument {
  synth: true;
  table: number;
  length: number;       // waveform length in bytes (raw value << 1)
  volume: number;
  adsrControl: number;
  adsrTable: number;
  adsrLen: number;
  adsrSpeed: number;
  lfoControl: number;
  lfoTable: number;
  lfoDepth: number;
  lfoLen: number;
  lfoDelay: number;
  lfoSpeed: number;
  egControl: number;
  egTable: number;
  egLen: number;
  egDelay: number;
  egSpeed: number;
  fxControl: number;
  fxSpeed: number;
  fxDelay: number;
  modControl: number;
  modTable: number;
  modLen: number;
  modDelay: number;
  modSpeed: number;
}

interface BPSampleInstrument {
  synth: false;
  name: string;
  length: number;       // sample length in bytes (raw value << 1)
  loop: number;
  repeat: number;       // repeat length in bytes (raw value << 1)
  volume: number;
  pointer: number;      // offset into PCM data (set during sample loading)
}

type BPInstrument = BPSynthInstrument | BPSampleInstrument;

// ── Track step (sequence entry) ─────────────────────────────────────────────

interface BPStep {
  pattern: number;
  soundTranspose: number;
  transpose: number;
}

// ── Pattern row ──────────────────────────────────────────────────────────────

interface BPRow {
  note: number;
  sample: number;       // high nybble of byte 2
  effect: number;       // low nybble of byte 2
  param: number;        // byte 3 (signed in FlodJS, but we keep raw)
}

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Detect whether the buffer contains a SoundMon module.
 * Checks for magic bytes at offset 26: "BPSM" (V1), "V.2" (V2), or "V.3" (V3).
 */
export function isSoundMonFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 32) return false;
  const buf = new Uint8Array(buffer);
  const id = readString(buf, 26, 4);
  if (id === 'BPSM') return true;
  const id3 = id.substring(0, 3);
  if (id3 === 'V.2' || id3 === 'V.3') return true;
  return false;
}

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a SoundMon (.bp, .bp3, .sndmon) file into a TrackerSong.
 * Returns format 'MOD' so it's fully editable in the tracker.
 */
export async function parseSoundMonFile(
  buffer: ArrayBuffer,
  filename: string,
  moduleBase = 0,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  if (buf.length < 32) throw new Error('File too small to be a SoundMon module');

  // ── Header ───────────────────────────────────────────────────────────────
  const title = readString(buf, 0, 26);
  const id = readString(buf, 26, 4);

  let version: number;
  let tables = 0;

  if (id === 'BPSM') {
    version = BPSOUNDMON_V1;
  } else {
    const id3 = id.substring(0, 3);
    if (id3 === 'V.2') version = BPSOUNDMON_V2;
    else if (id3 === 'V.3') version = BPSOUNDMON_V3;
    else throw new Error(`Not a SoundMon file: id="${id}"`);
    // V2/V3: byte at offset 29 = number of synth wave tables
    tables = u8(buf, 29);
  }

  let pos = 30;
  const songLength = u16BE(buf, pos); pos += 2;

  // ── 15 Instruments ─────────────────────────────────────────────────────
  // Instruments are 1-indexed in the player (samples[1..15])
  const instruments: BPInstrument[] = [];
  const instrTableOffset = pos; // = 32 (start of instrument table in file)
  // Track per-instrument file offsets for chip RAM info
  const instrFileOffsets: Array<{ base: number; size: number }> = [];

  for (let i = 0; i < 15; i++) {
    const instrStartPos = pos;
    const firstByte = u8(buf, pos);

    if (firstByte === 0xff) {
      // Synth instrument
      pos++; // skip the 0xFF marker
      const table = u8(buf, pos); pos++;
      const length = u16BE(buf, pos) << 1; pos += 2;
      const adsrControl = u8(buf, pos); pos++;
      const adsrTable = u8(buf, pos) << 6; pos++;
      const adsrLen = u16BE(buf, pos); pos += 2;
      const adsrSpeed = u8(buf, pos); pos++;
      const lfoControl = u8(buf, pos); pos++;
      const lfoTable = u8(buf, pos) << 6; pos++;
      const lfoDepth = u8(buf, pos); pos++;
      const lfoLen = u16BE(buf, pos); pos += 2;

      let lfoDelay: number;
      let lfoSpeed: number;
      let egControl: number;
      let egTable: number;
      let egLen: number;
      let egDelay: number;
      let egSpeed: number;
      let fxControl = 0;
      let fxSpeed = 1;
      let fxDelay = 0;
      let modControl = 0;
      let modTable = 0;
      let modSpeed = 1;
      let modDelay = 0;
      let volume: number;
      let modLen = 0;

      if (version < BPSOUNDMON_V3) {
        // V1/V2: different byte layout with padding bytes
        pos++; // skip byte
        lfoDelay = u8(buf, pos); pos++;
        lfoSpeed = u8(buf, pos); pos++;
        egControl = u8(buf, pos); pos++;
        egTable = u8(buf, pos) << 6; pos++;
        pos++; // skip byte
        egLen = u16BE(buf, pos); pos += 2;
        pos++; // skip byte
        egDelay = u8(buf, pos); pos++;
        egSpeed = u8(buf, pos); pos++;
        fxSpeed = 1;
        modSpeed = 1;
        volume = u8(buf, pos); pos++;
        pos += 6; // skip 6 bytes
      } else {
        // V3: all fields present, no padding
        lfoDelay = u8(buf, pos); pos++;
        lfoSpeed = u8(buf, pos); pos++;
        egControl = u8(buf, pos); pos++;
        egTable = u8(buf, pos) << 6; pos++;
        egLen = u16BE(buf, pos); pos += 2;
        egDelay = u8(buf, pos); pos++;
        egSpeed = u8(buf, pos); pos++;
        fxControl = u8(buf, pos); pos++;
        fxSpeed = u8(buf, pos); pos++;
        fxDelay = u8(buf, pos); pos++;
        modControl = u8(buf, pos); pos++;
        modTable = u8(buf, pos) << 6; pos++;
        modSpeed = u8(buf, pos); pos++;
        modDelay = u8(buf, pos); pos++;
        volume = u8(buf, pos); pos++;
        modLen = u16BE(buf, pos); pos += 2;
      }

      instruments.push({
        synth: true,
        table,
        length,
        volume,
        adsrControl, adsrTable, adsrLen, adsrSpeed,
        lfoControl, lfoTable, lfoDepth, lfoLen, lfoDelay, lfoSpeed,
        egControl, egTable, egLen, egDelay, egSpeed,
        fxControl, fxSpeed, fxDelay,
        modControl, modTable, modLen, modDelay, modSpeed,
      });
      instrFileOffsets.push({ base: instrStartPos, size: pos - instrStartPos });
    } else {
      // Regular sample instrument
      const name = readString(buf, pos, 24); pos += 24;
      const length = u16BE(buf, pos) << 1; pos += 2;

      let loop = 0;
      let repeat = 2;
      let volume = 0;

      if (length > 0) {
        loop = u16BE(buf, pos) << 1; pos += 2;  // words → bytes (same as repeat below)
        repeat = u16BE(buf, pos) << 1; pos += 2;
        volume = u16BE(buf, pos); pos += 2;

        if ((loop + repeat) >= length) {
          repeat = length - loop;
        }
      } else {
        repeat = 2;
        pos += 6;
      }

      instruments.push({
        synth: false,
        name,
        length,
        loop,
        repeat,
        volume,
        pointer: -1,
      });
      instrFileOffsets.push({ base: instrStartPos, size: pos - instrStartPos });
    }
  }

  // ── Track / sequence data ──────────────────────────────────────────────
  // songLength * 4 entries (one per channel), each entry = 4 bytes
  const trackLen = songLength * 4;
  const tracks: BPStep[] = [];
  let higherPattern = 0;
  const trackDataOffset = pos; // file offset of track/sequence data

  for (let i = 0; i < trackLen; i++) {
    const pattern = u16BE(buf, pos); pos += 2;
    const soundTranspose = s8(buf, pos); pos++;
    const transpose = s8(buf, pos); pos++;
    if (pattern > higherPattern) higherPattern = pattern;
    tracks.push({ pattern, soundTranspose, transpose });
  }

  // ── Pattern data ────────────────────────────────────────────────────────
  // higherPattern patterns, each 16 rows, 3 bytes per row
  const patternDataLen = higherPattern * 16;
  const patternRows: BPRow[] = [];
  const patternDataOffset = pos; // file offset of pattern data

  for (let i = 0; i < patternDataLen; i++) {
    const note = s8(buf, pos); pos++;
    const sampleByte = u8(buf, pos); pos++;
    const effect = sampleByte & 0x0f;
    const sample = (sampleByte & 0xf0) >> 4;
    const param = s8(buf, pos); pos++;
    patternRows.push({ note, sample, effect, param });
  }

  // ── Synth table data (V2/V3 only) ──────────────────────────────────────
  // `tables` entries of 64 bytes each — raw waveform data for synth instruments
  const synthTableData = new Uint8Array(tables * 64);
  const synthTablesOffset = pos; // file offset of synth table data
  if (tables > 0) {
    const end = Math.min(pos + tables * 64, buf.length);
    synthTableData.set(buf.subarray(pos, end));
    pos = end;
  }

  // ── Sample PCM data ─────────────────────────────────────────────────────
  const sampleDataOffset = pos; // file offset of sample PCM data
  for (let i = 0; i < 15; i++) {
    const inst = instruments[i];
    if (inst.synth || inst.length === 0) continue;
    const sampleInst = inst as BPSampleInstrument;
    sampleInst.pointer = pos;
    pos += sampleInst.length;
  }

  // ── Create InstrumentConfigs ───────────────────────────────────────────
  const instrConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < 15; i++) {
    const inst = instruments[i];
    const id = i + 1; // 1-indexed

    const instrOff = instrFileOffsets[i] ?? { base: instrTableOffset, size: 0 };
    const chipRam: UADEChipRamInfo = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + instrOff.base,
      instrSize: instrOff.size,
      sections: {
        instrTable: moduleBase + instrTableOffset,
        trackData: moduleBase + trackDataOffset,
        patternData: moduleBase + patternDataOffset,
        synthTables: moduleBase + synthTablesOffset,
        sampleData: moduleBase + sampleDataOffset,
      },
    };

    if (inst.synth) {
      // Synth instrument: create a SoundMonConfig for real-time WASM synthesis
      const synthInst = inst as BPSynthInstrument;

      // Extract waveform from synth table data for the WASM module
      const tableOffset = synthInst.table << 6;
      const waveLen = 64; // SoundMon uses 64-sample waveforms
      let waveData: Uint8Array | undefined;

      if (tableOffset + waveLen <= synthTableData.length) {
        waveData = synthTableData.slice(tableOffset, tableOffset + waveLen);
      } else if (tableOffset < synthTableData.length) {
        waveData = new Uint8Array(waveLen);
        waveData.set(synthTableData.subarray(tableOffset));
      }
      // If no waveData, the C synth falls back to built-in waveType waveform

      // Map SoundMon ADSR parameters to SoundMonConfig fields.
      // SoundMon ADSR tables are sequences of signed volume values; we extract
      // the first entry of each phase table as the target volume level.
      const adsrTableOff = synthInst.adsrTable;
      const attackVol = adsrTableOff < synthTableData.length
        ? Math.abs(synthTableData[adsrTableOff] < 128
            ? synthTableData[adsrTableOff]
            : synthTableData[adsrTableOff] - 256)
        : synthInst.volume;
      const sustainVol = Math.max(0, Math.min(64, synthInst.volume));

      // LFO table provides vibrato parameters
      const hasLfo = synthInst.lfoControl > 0 && synthInst.lfoDepth > 0;

      const smConfig: SoundMonConfig = {
        type: 'synth',
        waveType: synthInst.table & 0x0F, // lower nibble as wave type index
        waveSpeed: 0,
        arpTable: new Array(16).fill(0), // SoundMon MOD table could populate this
        arpSpeed: 0,
        attackVolume: Math.min(64, Math.max(0, attackVol)),
        decayVolume: Math.min(64, sustainVol),
        sustainVolume: sustainVol,
        releaseVolume: 0,
        attackSpeed: Math.min(63, synthInst.adsrSpeed > 0 ? synthInst.adsrSpeed : 4),
        decaySpeed: 4,
        sustainLength: 0, // hold until note-off
        releaseSpeed: 4,
        vibratoDelay: hasLfo ? synthInst.lfoDelay : 0,
        vibratoSpeed: hasLfo ? Math.min(63, synthInst.lfoSpeed) : 0,
        vibratoDepth: hasLfo ? Math.min(63, synthInst.lfoDepth) : 0,
        portamentoSpeed: 0,
      };

      instrConfigs.push({
        id,
        name: `Synth ${i + 1}`,
        type: 'synth' as const,
        synthType: 'SoundMonSynth' as const,
        soundMon: smConfig,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam,
      } as InstrumentConfig);
    } else {
      // Regular PCM sample
      const sampleInst = inst as BPSampleInstrument;
      if (sampleInst.length > 0 && sampleInst.pointer >= 0 && sampleInst.pointer + sampleInst.length <= buf.length) {
        const pcm = buf.slice(sampleInst.pointer, sampleInst.pointer + sampleInst.length);
        const hasLoop = sampleInst.repeat > 2;
        const loopStart = hasLoop ? sampleInst.loop : 0;
        const loopEnd = hasLoop ? sampleInst.loop + sampleInst.repeat : 0;

        const instr = createSamplerInstrument(
          id,
          sampleInst.name || `Sample ${i + 1}`,
          pcm,
          sampleInst.volume,
          8287,
          loopStart,
          loopEnd,
        );
        instr.uadeChipRam = chipRam;
        instrConfigs.push(instr);
      } else {
        // Empty sample placeholder
        const placeholder = makePlaceholder(id, sampleInst.name || `Sample ${i + 1}`);
        placeholder.uadeChipRam = chipRam;
        instrConfigs.push(placeholder);
      }
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────
  // SoundMon has a sequence table of songLength steps; each step references
  // a pattern for each of the 4 channels. Each pattern is 16 rows.
  // We create one TrackerSong pattern per sequence step.

  const trackerPatterns: Pattern[] = [];

  for (let seqIdx = 0; seqIdx < songLength; seqIdx++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let row = 0; row < 16; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const step = tracks[seqIdx * 4 + ch];
        if (!step || step.pattern === 0) {
          // Pattern 0 or missing: empty row
          channelRows[ch].push(emptyCell());
          continue;
        }

        // Pattern data index: (pattern - 1) * 16 + row
        const rowIdx = ((step.pattern - 1) * 16) + row;
        if (rowIdx < 0 || rowIdx >= patternRows.length) {
          channelRows[ch].push(emptyCell());
          continue;
        }

        const bpRow = patternRows[rowIdx];
        const note = bpRow.note;
        const option = bpRow.effect;
        const data = bpRow.param;

        let xmNote = 0;
        let xmInstrument = 0;

        if (note !== 0) {
          // Apply transpose from step
          xmNote = bpNoteToXM(note, step.transpose);

          // Instrument: apply sound transpose
          let instr = bpRow.sample;
          if (instr > 0) {
            instr += step.soundTranspose;
            if (instr >= 1 && instr <= 15) {
              xmInstrument = instr;
            }
          }
        }

        // Map SoundMon effects to XM effects
        let effTyp = 0;
        let eff = 0;
        const absData = data < 0 ? -data : data;

        switch (option) {
          case 0: // Arpeggio (same as MOD 0xy)
            if (data !== 0) {
              effTyp = 0x00;
              eff = data & 0xFF;
            }
            break;

          case 1: // Set volume
            // Volume is set directly; use volume column instead
            // XM volume column: 0x10 + vol (0-64)
            break;

          case 2: // Set speed
            effTyp = 0x0F;
            eff = absData & 0xFF;
            break;

          case 3: // Set filter (Amiga LED filter)
            effTyp = 0x0E; // Exy
            eff = data ? 0x01 : 0x00; // E01 = filter on, E00 = filter off
            break;

          case 4: // Portamento up
            effTyp = 0x01;
            eff = absData & 0xFF;
            break;

          case 5: // Portamento down
            effTyp = 0x02;
            eff = absData & 0xFF;
            break;

          case 6: // Set vibrato (V3) / repeat counter (V1/V2)
            if (version === BPSOUNDMON_V3) {
              effTyp = 0x04; // Vibrato
              // Encode data as both speed and depth
              const vSpeed = Math.min((absData >> 4) & 0x0F, 15);
              const vDepth = Math.min(absData & 0x0F, 15);
              eff = (vSpeed << 4) | vDepth;
            }
            break;

          case 7: // Position jump (V3) / set repeat position (V1/V2)
            if (version === BPSOUNDMON_V3) {
              effTyp = 0x0B; // Position jump
              eff = absData & 0xFF;
            }
            break;

          case 8: // Set auto slide
            if (data > 0) {
              effTyp = 0x02; // Portamento down (positive = period increases)
              eff = absData & 0xFF;
            } else if (data < 0) {
              effTyp = 0x01; // Portamento up (negative = period decreases)
              eff = absData & 0xFF;
            }
            break;

          case 9: // Set auto arpeggio
            if (data !== 0) {
              effTyp = 0x00; // Arpeggio
              eff = data & 0xFF;
            }
            break;

          case 10: // unused / special transpose handling (not an audible effect)
            break;

          case 11: // Change FX (synth only)
            break;

          case 12: // unused
            break;

          case 13: // Change inversion (synth only)
            break;

          case 14: // No EG reset (synth only)
            break;

          case 15: // No EG and no ADSR reset (synth only)
            break;
        }

        // Volume handling: effect 1 = set volume
        let xmVolume = 0;
        if (option === 1) {
          const vol = Math.max(0, Math.min(64, absData));
          xmVolume = 0x10 + vol;
        } else if (note !== 0 && xmInstrument > 0 && xmInstrument <= instruments.length) {
          // On note trigger, set volume from instrument default
          const inst = instruments[xmInstrument - 1];
          const instVol = Math.max(0, Math.min(64, inst.volume));
          xmVolume = 0x10 + instVol;
        }

        channelRows[ch].push({
          note: xmNote,
          instrument: xmInstrument,
          volume: xmVolume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }

    trackerPatterns.push({
      id: `pattern-${seqIdx}`,
      name: `Pattern ${seqIdx}`,
      length: 16,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: higherPattern,
        originalInstrumentCount: 15,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename));
  }

  const moduleName = title.trim() || filename.replace(/\.[^/.]+$/, '');
  const versionStr = version === BPSOUNDMON_V1 ? 'V1' : version === BPSOUNDMON_V2 ? 'V2' : 'V3';

  return {
    name: `${moduleName} [SoundMon ${versionStr}]`,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Helper functions ─────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makePlaceholder(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name.replace(/\0/g, '').trim() || `Sample ${id}`,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig;
}

function createEmptyPattern(filename: string): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 16,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}
