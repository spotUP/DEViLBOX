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
 *
 * Tempo: SHDR uint16 is a CIA timer value. We find matching index in TEMPO_TABLE
 *   (128 entries), then extract speed from high nibble for XM speed/BPM.
 *
 * Instruments: external .instr files (SampledSound, Synthesis, IFF 8SVX formats).
 *   We create silent Sampler placeholders -- no bundled .instr files available.
 *
 * Playback: 1 tick = 1 pattern row. Note of duration N = 1 note-on + (N-1) empty cells.
 * Flat cell arrays are split into 64-row patterns.
 *
 * Reference: NostalgicPlayer IffSmusWorker.cs, Tables.cs, EventType.cs by Polycode
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
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
  tempoIndex: number;
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

// -- Tempo table (from Tables.cs) --------------------------------------------

const TEMPO_TABLE: number[] = [
  0xfa83, 0xf525, 0xefe4, 0xeac0, 0xe5b9, 0xe0cc, 0xdbfb, 0xd744,
  0xd2a8, 0xce24, 0xc9b9, 0xc567, 0xc12c, 0xbd08, 0xb8fb, 0xb504,
  0xb123, 0xad58, 0xa9a1, 0xa5fe, 0xa270, 0x9ef5, 0x9b8d, 0x9837,
  0x94f4, 0x91c3, 0x8ea4, 0x8b95, 0x8898, 0x85aa, 0x82cd, 0x8000,
  0x7d41, 0x7a92, 0x77f2, 0x7560, 0x72dc, 0x7066, 0x6dfd, 0x6ba2,
  0x6954, 0x6712, 0x64dc, 0x62b3, 0x6096, 0x5e84, 0x5c7d, 0x5a82,
  0x5891, 0x56ac, 0x54d0, 0x52ff, 0x5138, 0x4f7a, 0x4dc6, 0x4c1b,
  0x4a7a, 0x48e1, 0x4752, 0x45ca, 0x444c, 0x42d5, 0x4166, 0x4000,
  0x3ea0, 0x3d49, 0x3bf9, 0x3ab0, 0x396e, 0x3833, 0x36fe, 0x35d1,
  0x34aa, 0x3389, 0x326e, 0x3159, 0x304b, 0x2f42, 0x2e3e, 0x2d41,
  0x2c48, 0x2b56, 0x2a68, 0x297f, 0x289c, 0x27bd, 0x26e3, 0x260d,
  0x253d, 0x2470, 0x23a9, 0x22e5, 0x2226, 0x216a, 0x20b3, 0x2000,
  0x1f50, 0x1ea4, 0x1dfc, 0x1d58, 0x1cb7, 0x1c19, 0x1b7f, 0x1ae8,
  0x1a55, 0x19c4, 0x1937, 0x18ac, 0x1825, 0x17a1, 0x171f, 0x16a0,
  0x1624, 0x15ab, 0x1534, 0x14bf, 0x144e, 0x13de, 0x1371, 0x1306,
  0x129e, 0x1238, 0x11d4, 0x1172, 0x1113, 0x10b5, 0x1059, 0x1000,
];

function tempoIndexToSpeedBPM(tempoIdx: number): { speed: number; bpm: number } {
  const clamped = Math.max(0, Math.min(127, tempoIdx));
  const tableVal = TEMPO_TABLE[clamped];
  const speed = Math.max(1, (tableVal >> 12) & 0x0f);
  const bpm = Math.max(32, Math.min(255, Math.round(900 / speed)));
  return { speed, bpm };
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

export async function parseIffSmusFile(
  buffer: ArrayBuffer,
  filename: string,
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
    tempoIndex: 0,
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
        const rawTempo = u16BE(buf, chunkStart);
        if (rawTempo >= 0xe11) {
          const findTempo = Math.floor(0xe100000 / rawTempo);
          let i = 0;
          for (; i < 128; i++) { if (findTempo >= TEMPO_TABLE[i]) break; }
          moduleInfo.tempoIndex = Math.min(i, 127);
        } else {
          moduleInfo.tempoIndex = 0;
        }
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
  const { speed, bpm } = tempoIndexToSpeedBPM(moduleInfo.tempoIndex);

  const instrConfigs: InstrumentConfig[] = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
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
    let currentInstrReg = 0;
    for (const ev of track.events) {
      if (ev.type === EVENT_MARK) break;
      if (ev.type <= EVENT_LAST_NOTE) {
        const transposeOff = Math.round(moduleInfo.transpose / 16) - 8;
        const xmNote = smusNoteToXM(ev.type + transposeOff);
        let xmInstr = 0;
        if (currentInstrReg !== 0) {
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
