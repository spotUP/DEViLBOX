/**
 * IffSmusParser.ts -- IFF SMUS / Sonix Music Driver (.smus, .snx, .tiny) format parser
 *
 * SMUS (Standard MUSic) is an IFF-chunked Amiga music format from Electronic Arts.
 * Stores music as scored events (note + duration pairs), not pattern/row data.
 * Each TRAK chunk is one voice/channel; instruments reference external .instr files.
 *
 * IFF chunk structure:
 *   FORM size SMUS -- outer IFF container
 *   NAME -- song name string (optional)
 *   AUTH -- author string (optional)
 *   SHDR -- score header: uint16 tempo, uint8 globalVol, uint8 numChannels
 *   INS1 -- instrument: uint8 register, uint8 type, data1, data2, string name
 *   TRAK -- track event stream (2 bytes per event: type byte + data byte)
 *   SNX1..SNX9 -- Sonix extension: transpose, tune, per-channel tracksEnabled
 *
 * TRAK event encoding:
 *   type 0-127  = MIDI note number
 *   type 128    = rest
 *   type 129    = instrument change (data = register number)
 *   type 130    = time signature change
 *   type 132    = per-track volume change
 *   type 255    = end-of-track mark
 *   For notes/rests: data masked to nibble (0x0F), then DURATION_TABLE ticks.
 *   DURATION_TABLE: [32,16,8,4,2,-1,-1,-1, 48,24,12,6,3,-1,-1,-1] (neg=skip)
 *
 * Note conversion: SMUS EventType = MIDI note number.
 *   XM note = MIDInote - 11, clamped 1-96.
 *   MIDI 60 (middle C) -> XM 49. MIDI 12 -> XM 1 (C-0).
 *   Pitch: Standard ProTracker periods via replayer's noteToPeriod (no custom Sonix periods).
 *   The .ss multi-octave sample data encodes the octave; sampleRate compensates.
 *
 * Tempo: SHDR uint16 = divisions per minute * 128 (division = quarter note).
 *   Quarter note = 8 rows. BPM = rawTempo / 64, XM speed = 6.
 *
 * Instruments: external .instr files (SampledSound, Synthesis, IFF 8SVX formats).
 *   We create silent Sampler placeholders -- no bundled .instr files available.
 *
 * Playback: 1 tick = 1 pattern row. Note of duration N = 1 note-on + (N-1) empty cells.
 * Flat cell arrays are split into 64-row patterns.
 *
 * Reference: SonixMusicDriver_v1.asm (Eagle Player), NostalgicPlayer IffSmusWorker.cs
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { iffSmusEncoder } from '@/engine/uade/encoders/IffSmusEncoder';
import { createSamplerInstrument } from './AmigaUtils';

// -- Utility functions -------------------------------------------------------

function readFourCC(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function u8(buf: Uint8Array, off: number): number { return buf[off]; }
function u16BE(buf: Uint8Array, off: number): number { return (buf[off] << 8) | buf[off + 1]; }

// -- Duration table (from Tables.cs) ----------------------------------------
// Index 0-15: negative = skip. Positive = tick count.
//   0=32, 1=16, 2=8, 3=4, 4=2  (whole..sixteenth)
//   8=48, 9=24, 10=12, 11=6, 12=3  (dotted versions)

const DURATION_TABLE: number[] = [
  32, 16, 8, 4, 2, -1, -1, -1,
  48, 24, 12, 6, 3, -1, -1, -1,
];

// -- EventType constants (from EventType.cs) ---------------------------------

const EVENT_LAST_NOTE = 127;
const EVENT_REST = 128;
const EVENT_INSTRUMENT = 129;
const EVENT_TIME_SIG = 130;
const EVENT_VOLUME = 132;
const EVENT_MARK = 255;
// -- Internal structures ----------------------------------------------------

interface SmusEvent {
  type: number;  // EventType byte (0-255)
  data: number;  // Data byte (mapped through DURATION_TABLE for notes/rests)
}

interface SmusTrack {
  events: SmusEvent[];
}

interface SmusModuleInfo {
  globalVolume: number;
  rawTempo: number;
  transpose: number;
  tune: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
  trackVolumes: number[];
  tracksEnabled: number[];
  tracks: (SmusTrack | null)[];
  instrumentMapper: number[];
  numChannels: number;
}

interface SmusInstrument {
  name: string;
}

// -- Tempo table (from SonixMusicDriver_v1.asm, lbW000CAE) -------------------
// 128 entries. Used to convert SHDR raw tempo to a speed + CIA timer pair.
// Each entry encodes: speed = entry >> 12, CIA timer derived from remainder.
// Proven by ASM trace: SHDR 0x1F57 → table[36] = 0x72DC → speed=7, BPM≈145.

const TEMPO_TABLE: number[] = [
  0xFA83, 0xF525, 0xEFE4, 0xEAC0, 0xE5B9, 0xE0CC, 0xDBFB, 0xD744,
  0xD2A8, 0xCE24, 0xC9B9, 0xC567, 0xC12C, 0xBD08, 0xB8FB, 0xB504,
  0xB123, 0xAD58, 0xA9A1, 0xA5FE, 0xA270, 0x9EF5, 0x9B8D, 0x9837,
  0x94F4, 0x91C3, 0x8EA4, 0x8B95, 0x8898, 0x85AA, 0x82CD, 0x8000,
  0x7D41, 0x7A92, 0x77F2, 0x7560, 0x72DC, 0x7066, 0x6DFD, 0x6BA2,
  0x6954, 0x6712, 0x64DC, 0x62B3, 0x6096, 0x5E84, 0x5C7D, 0x5A82,
  0x5891, 0x56AC, 0x54D0, 0x52FF, 0x5138, 0x4F7A, 0x4DC6, 0x4C1B,
  0x4A7A, 0x48E1, 0x4752, 0x45CA, 0x444C, 0x42D5, 0x4166, 0x4000,
  0x3EA0, 0x3D49, 0x3BF9, 0x3AB0, 0x396E, 0x3833, 0x36FE, 0x35D1,
  0x34AA, 0x3389, 0x326E, 0x3159, 0x304B, 0x2F42, 0x2E3E, 0x2D41,
  0x2C48, 0x2B56, 0x2A68, 0x297F, 0x289C, 0x27BD, 0x26E3, 0x260D,
  0x253D, 0x2470, 0x23A9, 0x22E5, 0x2226, 0x216A, 0x20B3, 0x2000,
  0x1F50, 0x1EA4, 0x1DFC, 0x1D58, 0x1CB7, 0x1C19, 0x1B7F, 0x1AE8,
  0x1A55, 0x19C4, 0x1937, 0x18AC, 0x1825, 0x17A1, 0x171F, 0x16A0,
  0x1624, 0x15AB, 0x1534, 0x14BF, 0x144E, 0x13DE, 0x1371, 0x1306,
  0x129E, 0x1238, 0x11D4, 0x1172, 0x1113, 0x10B5, 0x1059, 0x1000,
];

// -- Tempo conversion ---------------------------------------------------------
// Mirrors the Eagle Player ASM (SonixMusicDriver_v1.asm) exactly:
//
// SHDR parsing (lbC000388):
//   1. If rawTempo < 0xE11 (3601) → tempoIndex = 0 (slowest)
//   2. quotient = 0x0E100000 / rawTempo
//   3. Search TEMPO_TABLE for first entry where quotient >= entry
//   4. Store byte offset as tempoIndex
//
// Playback handler (lbC0007F2):
//   1. tableVal = TEMPO_TABLE[tempoIndex]
//   2. speed = tableVal >> 12
//   3. calculatedTempo = (tableVal << 15) / (speed << 12)
//   4. ciaTimer = (calculatedTempo * 0x2E9C) >> 15
//   5. Eagle Player sets dtg_Timer → CIA interrupt rate = 709379 / ciaTimer Hz
//   6. Events fire every `speed` CIA ticks
//
// XM mapping:
//   eventRate = (709379 / ciaTimer) / speed  [events per second]
//   XM eventRate = (2 * BPM) / (5 * xmSpeed) [events per second]
//   We set xmSpeed = speed, so: BPM = eventRate * 5 * speed / 2
//   Simplifies to: BPM = 709379 * 5 / (2 * ciaTimer)

function smusTempoToSpeedBPM(rawTempo: number): { speed: number; bpm: number } {
  if (rawTempo === 0) return { speed: 6, bpm: 125 };

  // Step 1: SHDR → tempo table index (ASM lbC000388)
  let tempoIndex = 0;
  if (rawTempo >= 0xE11) {
    const quotient = Math.floor(0x0E100000 / rawTempo);
    for (let i = 0; i < TEMPO_TABLE.length; i++) {
      if (quotient >= TEMPO_TABLE[i]) {
        tempoIndex = i;
        break;
      }
      if (i === TEMPO_TABLE.length - 1) tempoIndex = i;
    }
  }

  // Step 2: Table entry → speed + CIA timer (ASM lbC0007F2)
  const tableVal = TEMPO_TABLE[tempoIndex];
  const speed = tableVal >>> 12;
  if (speed === 0) return { speed: 6, bpm: 125 };

  const speedShifted = speed << 12;  // speed * 4096
  // ASM: SWAP D1; CLR.W D1; LSR.L #1,D1 → (tableVal << 16) >>> 1 = tableVal << 15
  // Then DIVU.W by speedShifted
  const calculatedTempo = Math.floor((tableVal * 32768) / speedShifted);
  const ciaTimer = Math.floor((calculatedTempo * 0x2E9C) / 32768);

  if (ciaTimer === 0) return { speed: 6, bpm: 125 };

  // Step 3: CIA timer → XM BPM
  // eventRate = 709379 / ciaTimer / speed
  // XM: eventRate = 2*BPM / (5*speed)
  // → BPM = eventRate * 5 * speed / 2 = 709379 * 5 / (2 * ciaTimer)
  const bpm = Math.round((709379 * 5) / (2 * ciaTimer));

  return {
    speed: Math.max(1, Math.min(31, speed)),
    bpm: Math.max(32, Math.min(255, bpm)),
  };
}

function smusNoteToXM(midiNote: number): number {
  return Math.max(1, Math.min(96, midiNote - 11));
}

export function isIffSmusFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const buf = new Uint8Array(buffer);
  if (readFourCC(buf, 0) !== 'FORM') return false;
  const type = readFourCC(buf, 8);
  return type === 'SMUS' || type === 'TINY';
}

// -- Sonix .ss sample file parser ---------------------------------------------
// Reference: NostalgicPlayer SampledSoundFormat.cs
//
// Header: 0x3E (62) bytes.
//   Offset 0: u16BE LengthOfOctaveOne — byte length of the smallest (highest-pitch) octave
//   Offset 2: u16BE LoopOffsetOfOctaveOne — non-looping portion length (loop starts after this)
//   Offset 4: u8    StartOctave — smallest octave index (highest pitch, shortest data)
//   Offset 5: u8    EndOctave — largest octave index (lowest pitch, longest data)
//   Offset 6..0x3D: padding / instrument data (ignored here)
//
// Data at 0x3E: octaves stored shortest first. Octave O has LengthOfOctaveOne * 2^O bytes.
// Offset for octave O = (2^O - 2^StartOctave) * LengthOfOctaveOne.
//
// Sonix driver selects per-note octave data: octaveIdx = 10 - floor(midiNote/12).
// Since we can only have one sample per instrument, we extract a single middle octave
// and calibrate sampleRate so standard ProTracker periods produce correct pitch.
const SS_HEADER_SIZE = 0x3E; // 62 bytes

interface SonixSampleResult {
  pcm: Uint8Array;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
}

function parseSonixSampleFile(data: Uint8Array): SonixSampleResult | null {
  if (data.length < SS_HEADER_SIZE + 4) return null;

  const lengthOfOctaveOne = u16BE(data, 0);
  const loopOffsetOfOctaveOne = u16BE(data, 2);
  const startOctave = data[4];
  const endOctave = data[5];

  if (lengthOfOctaveOne === 0) return null;
  if (startOctave > 10 || endOctave > 10) return null;

  // Single-octave or out-of-range: treat as one block
  const isSingleOctave = (startOctave === endOctave) || (startOctave >= 8);

  let extractOctave: number;
  if (isSingleOctave) {
    extractOctave = startOctave;
  } else {
    if (startOctave > endOctave) return null;
    // Pick the middle available octave
    extractOctave = Math.round((startOctave + endOctave) / 2);
  }

  // Data offset: (2^O - 2^start) * lengthOfOctaveOne
  const octaveOffsetMul = (1 << extractOctave) - (1 << startOctave);
  const dataOffset = SS_HEADER_SIZE + octaveOffsetMul * lengthOfOctaveOne;
  const octaveLength = lengthOfOctaveOne * (1 << extractOctave);

  const availableData = data.length - dataOffset;
  if (availableData < 4) return null;
  const pcmLen = Math.min(octaveLength, availableData);

  const pcm = data.slice(dataOffset, dataOffset + pcmLen);

  // Loop: loopOffsetOfOctaveOne is the non-looping (one-shot) portion length.
  // If it differs from lengthOfOctaveOne, the sample loops from that offset to end.
  let loopStart = 0;
  let loopEnd = 0;
  if (lengthOfOctaveOne !== loopOffsetOfOctaveOne && loopOffsetOfOctaveOne > 0) {
    const scaledLoopOffset = loopOffsetOfOctaveOne * (1 << extractOctave);
    if (scaledLoopOffset < pcmLen) {
      loopStart = scaledLoopOffset;
      loopEnd = pcmLen;
    }
  }

  // SampleRate calibration: octave 6 maps to 8287 Hz with the smusNoteToXM
  // mapping (MIDI-11). For other octaves, shift by one factor of 2 per octave.
  // This makes standard ProTracker periods produce correct pitch.
  const sampleRate = Math.round(8287 * Math.pow(2, 6 - extractOctave));

  return { pcm, loopStart, loopEnd, sampleRate };
}

export async function parseIffSmusFile(
  buffer: ArrayBuffer,
  filename: string,
  companionFiles?: Map<string, ArrayBuffer>,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  if (buf.length < 12) { const _m = 'File too small to be an IFF SMUS module'; throw new Error(_m); }
  if (readFourCC(buf, 0) !== 'FORM') { const _m = 'Not an IFF FORM file'; throw new Error(_m); }
  const formType = readFourCC(buf, 8);
  if (formType !== 'SMUS' && formType !== 'TINY') {
    throw new Error(`Not an IFF SMUS file: FORM type is ${formType}`);
  }

  let pos = 12;
  const fileLen = buf.length;
  let songName = '';
  let author = '';

  const moduleInfo: SmusModuleInfo = {
    globalVolume: 0xff,
    rawTempo: 0,
    transpose: 0,
    tune: 0x80,
    timeSigNumerator: 4,
    timeSigDenominator: 4,
    trackVolumes: [],
    tracksEnabled: [],
    tracks: [],
    instrumentMapper: new Array(256).fill(0),
    numChannels: 0,
  };
  const instruments: SmusInstrument[] = [];
  let trackNumber = 0;
  const trackChunkOffsets: number[] = [];
  const trackChunkSizes: number[] = [];

  while (pos + 8 <= fileLen) {
    const chunkId = readFourCC(buf, pos); pos += 4;
    const chunkSize = (buf[pos] << 24 | buf[pos + 1] << 16 | buf[pos + 2] << 8 | buf[pos + 3]) >>> 0;
    pos += 4;
    const chunkStart = pos;

    switch (chunkId) {
      case 'NAME': {
        if (chunkStart + chunkSize <= fileLen) {
          songName = readString(buf, chunkStart, chunkSize);
        }
        break;
      }

      case 'AUTH': {
        if (chunkStart + chunkSize <= fileLen) {
          author = readString(buf, chunkStart, chunkSize);
        }
        break;
      }

      case 'SHDR': {
        if (chunkStart + 4 > fileLen) break;
        moduleInfo.rawTempo = u16BE(buf, chunkStart);
        let globalVol = u8(buf, chunkStart + 2);
        if (globalVol < 128) globalVol *= 2;
        moduleInfo.globalVolume = globalVol;
        moduleInfo.numChannels = u8(buf, chunkStart + 3);
        moduleInfo.trackVolumes = new Array(moduleInfo.numChannels).fill(0xff);
        moduleInfo.tracksEnabled = new Array(moduleInfo.numChannels).fill(1);
        moduleInfo.tracks = new Array(moduleInfo.numChannels).fill(null);
        break;
      }
      case 'INS1': {
        if (chunkStart + 4 > fileLen) break;
        const register_ = u8(buf, chunkStart);
        const instrType = u8(buf, chunkStart + 1);
        if (instrType !== 0) break;
        if (moduleInfo.instrumentMapper[register_] !== 0) break;
        const nameLen = chunkSize - 4;
        if (nameLen <= 0 || chunkStart + 4 + nameLen > fileLen) break;
        const instrName = readString(buf, chunkStart + 4, nameLen);
        if (!instrName) break;
        instruments.push({ name: instrName });
        moduleInfo.instrumentMapper[register_] = instruments.length;
        break;
      }
      case 'TRAK': {
        if (moduleInfo.numChannels === 0) break;
        if (trackNumber >= moduleInfo.numChannels) break;
        const numEvents = Math.floor(chunkSize / 2);
        const events: SmusEvent[] = [];
        for (let i = 0; i < numEvents; i++) {
          const evOff = chunkStart + i * 2;
          if (evOff + 2 > fileLen) break;
          const evType = u8(buf, evOff);
          let evData = u8(buf, evOff + 1);
          if (evType === EVENT_MARK) break;
          if (evType <= EVENT_LAST_NOTE || evType === EVENT_REST) {
            evData &= 0x0f;
            const dur = DURATION_TABLE[evData];            if (dur < 0) continue;
            evData = dur;
          } else if (evType === EVENT_INSTRUMENT) {
            // pass
          } else if (evType === EVENT_TIME_SIG) {
            moduleInfo.timeSigNumerator = ((evData >> 3) & 0x1f) + 1;
            moduleInfo.timeSigDenominator = 1 << (evData & 0x07);
            continue;
          } else if (evType === EVENT_VOLUME) {
            if (trackNumber < moduleInfo.trackVolumes.length) {
              moduleInfo.trackVolumes[trackNumber] = (evData & 0x7f) * 2;
            }
            continue;
          } else { continue; }
          events.push({ type: evType, data: evData });
        }
        events.push({ type: EVENT_MARK, data: 0xff });
        moduleInfo.tracks[trackNumber] = { events };
        trackChunkOffsets.push(chunkStart);
        trackChunkSizes.push(chunkSize);
        trackNumber++;
        break;
      }
      case 'SNX1':
      case 'SNX2':
      case 'SNX3':
      case 'SNX4':
      case 'SNX5':
      case 'SNX6':
      case 'SNX7':
      case 'SNX8':
      case 'SNX9': {
        if (moduleInfo.numChannels === 0) break;
        if (chunkStart + 8 + moduleInfo.numChannels * 4 > fileLen) break;
        moduleInfo.transpose = u16BE(buf, chunkStart);
        moduleInfo.tune = u16BE(buf, chunkStart + 2);
        for (let i = 0; i < moduleInfo.numChannels; i++) {
          const off = chunkStart + 8 + i * 4;
          moduleInfo.tracksEnabled[i] =
            (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
        }
        break;
      }

      default:
        break;
    }

    let advance = chunkSize;
    if ((advance & 1) !== 0) advance++;
    pos = chunkStart + advance;
  }
  const numCh = Math.max(1, moduleInfo.numChannels);
  const { speed, bpm } = smusTempoToSpeedBPM(moduleInfo.rawTempo);

  // Build a lookup of companion files by lowercase basename (without extension)
  const companionByBase = new Map<string, { instr?: Uint8Array; ss?: Uint8Array }>();
  if (companionFiles) {
    for (const [name, buf] of companionFiles) {
      const lower = name.toLowerCase();
      const dotIdx = lower.lastIndexOf('.');
      const base = dotIdx > 0 ? lower.slice(0, dotIdx) : lower;
      const ext = dotIdx > 0 ? lower.slice(dotIdx) : '';
      if (!companionByBase.has(base)) companionByBase.set(base, {});
      const entry = companionByBase.get(base)!;
      if (ext === '.instr') entry.instr = new Uint8Array(buf);
      else if (ext === '.ss') entry.ss = new Uint8Array(buf);
    }
  }

  const instrConfigs: InstrumentConfig[] = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
    const instrNameLower = instr.name.toLowerCase();

    // Try to load PCM data from companion .ss file
    const companion = companionByBase.get(instrNameLower);
    if (companion?.ss) {
      const parsed = parseSonixSampleFile(companion.ss);
      if (parsed && parsed.pcm.length > 2) {
        instrConfigs.push(createSamplerInstrument(
          id, instr.name || `Instrument ${id}`,
          parsed.pcm, 64, parsed.sampleRate, parsed.loopStart, parsed.loopEnd,
        ));
        continue;
      }
    }

    // Fallback: silent placeholder
    const silentPcm = new Uint8Array(2);
    instrConfigs.push(createSamplerInstrument(
      id, instr.name || `Instrument ${id}`,
      silentPcm, 64, 8287, 0, 0,
    ));
  }
  const channelFlat: TrackerCell[][] = [];
  for (let ch = 0; ch < numCh; ch++) {
    const track = ch < moduleInfo.tracks.length ? moduleInfo.tracks[ch] : null;
    const cells: TrackerCell[] = [];
    if (!track) { channelFlat.push(cells); continue; }
    let currentInstrReg = -1;

    // Transpose: asm uses ASR.W #4 (signed shift right 4) then subtract 8.
    // moduleInfo.transpose is unsigned u16; convert to signed int16 first.
    const transposeS16 = moduleInfo.transpose >= 0x8000
      ? moduleInfo.transpose - 0x10000
      : moduleInfo.transpose;
    const transposeOff = (transposeS16 >> 4) - 8;

    for (const ev of track.events) {
      if (ev.type === EVENT_MARK) break;
      if (ev.type <= EVENT_LAST_NOTE) {
        const transposedMidi = ev.type + transposeOff;
        const xmNote = smusNoteToXM(transposedMidi);
        let xmInstr = 0;
        if (currentInstrReg >= 0) {
          const mapped = moduleInfo.instrumentMapper[currentInstrReg];
          if (mapped !== 0) xmInstr = mapped;
        }
        const trackVol = ch < moduleInfo.trackVolumes.length
          ? moduleInfo.trackVolumes[ch] : 0xff;
        const xmVol = trackVol === 0xff ? 0
          : 0x10 + Math.min(64, Math.round((trackVol / 254) * 64));
        const dur = Math.max(1, ev.data);
        cells.push({ note: xmNote, instrument: xmInstr, volume: xmVol,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        for (let k = 1; k < dur; k++) cells.push(emptyCell());
      } else if (ev.type === EVENT_REST) {
        const dur = Math.max(1, ev.data);
        for (let k = 0; k < dur; k++) cells.push(emptyCell());
      } else if (ev.type === EVENT_INSTRUMENT) {
        currentInstrReg = ev.data;
      }
    }
    channelFlat.push(cells);
  }
  let totalRows = 0;
  for (const ch of channelFlat) {
    if (ch.length > totalRows) totalRows = ch.length;
  }
  if (totalRows === 0) totalRows = 64;
  for (const ch of channelFlat) {
    while (ch.length < totalRows) ch.push(emptyCell());
  }

  const PATTERN_LENGTH = 64;
  const numPatterns = Math.max(1, Math.ceil(totalRows / PATTERN_LENGTH));
  const patterns: Pattern[] = [];

  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * PATTERN_LENGTH;
    const endRow = Math.min(startRow + PATTERN_LENGTH, totalRows);
    const patLen = endRow - startRow;

    const channels: ChannelData[] = channelFlat.map((cells, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: channelPan(ch),
      instrumentId: null, color: null,
      rows: cells.slice(startRow, endRow),
    }));

    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p + 1}`,
      length: patLen,
      channels,
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: numCh,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length,
      },
    });
  }
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const displayName = songName
    ? (author ? `${songName} (${author})` : songName)
    : baseName;

  // Build UADEVariablePatternLayout for editing infrastructure.
  // SMUS tracks are event streams (variable-length); patterns in TrackerSong
  // are derived by splitting flat cell arrays into 64-row patterns.
  // Each TRAK chunk in the file is one channel's event stream.
  // trackMap[patIdx][ch] = ch (each pattern covers all channels).
  const smusTrackMap: number[][] = patterns.map(() =>
    Array.from({ length: numCh }, (_, ch) => ch)
  );

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'iffSmus',
    numChannels: numCh,
    numFilePatterns: trackChunkOffsets.length,
    rowsPerPattern: 64,
    moduleSize: buffer.byteLength,
    encoder: iffSmusEncoder,
    filePatternAddrs: trackChunkOffsets,
    filePatternSizes: trackChunkSizes,
    trackMap: smusTrackMap,
  };

  return {
    name: `${displayName} [SMUS]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: instrConfigs,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadeVariableLayout,
  };
}

// -- Helper functions --------------------------------------------------------

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/**
 * Amiga LRRL panning: channels 0,3 = left (-50); 1,2 = right (+50).
 */
function channelPan(ch: number): number {
  const pattern = [-50, 50, 50, -50];
  return pattern[ch % 4];
}
