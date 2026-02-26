/**
 * AMFParser.ts — Advanced Music Format (.amf) parser
 *
 * Handles two format variants that share the .amf extension:
 *
 * === ASYLUM Music Format (AMF0) ===
 * Used in Crusader: No Remorse and Crusader: No Regret.
 * Signature: "ASYLUM Music Format V1.0\0" at offset 0 (25 bytes).
 * Fixed 8-channel MOD-like layout with 64-row patterns.
 * Binary layout:
 *   +0    signature[32]       "ASYLUM Music Format V1.0\0"
 *   +32   defaultSpeed(u8)
 *   +33   defaultTempo(u8)
 *   +34   numSamples(u8)      ≤ 64
 *   +35   numPatterns(u8)
 *   +36   numOrders(u8)
 *   +37   restartPos(u8)
 *   +38   orders[256](u8)     order list
 *   +294  64 × AsylumSampleHeader (37 bytes each = 2368 bytes)
 *   +2662 numPatterns × 64 rows × 8 channels × 4 bytes/cell
 *   Then: sample PCM data (8-bit signed)
 *
 * AsylumSampleHeader (37 bytes):
 *   +0  name[22]      null-terminated
 *   +22 finetune(u8)  MOD finetune nibble 0-15
 *   +23 volume(u8)    0-64
 *   +24 transpose(i8) semitone transpose
 *   +25 length(u32le) total length in bytes
 *   +29 loopStart(u32le)
 *   +33 loopLength(u32le)  > 2 means loop active
 *
 * ASYLUM pattern cell (4 bytes):
 *   [note, instr, command, param]
 *   note: 0 = empty; 1-based octave note, note+12+NOTE_MIN → XM note
 *   command/param: MOD-style effect
 *
 * === DSMI Advanced Music Format (AMF/DMF) ===
 * Used in many DOS games (Pinball World, Webfoot games, etc.).
 * Signature: "AMF" or "DMF" at offset 0 + version byte.
 * AMF valid versions: 1, 8-14. DMF valid versions: 10-14.
 * Track-based layout: patterns reference named tracks via a map table.
 *
 * AMF file structure:
 *   +0    sig[3]          "AMF" or "DMF"
 *   +3    version(u8)
 *   +4    title[32]       (AMF only, not DMF)
 *   +4/36 numSamples(u8)
 *   +next numOrders(u8)
 *   +next numTracks(u16le)
 *   +next numChannels(u8)  (version ≥ 9 only)
 *   +next chanPan[32](i8)  (version ≥ 11: 32 bytes; 9-10: 16 bytes skip)
 *   +next tempo/speed      (version ≥ 13 only: tempo(u8) + speed(u8))
 *   +next order table: numOrders × (2-byte patLen if v≥14, then numChannels × 2-byte track refs)
 *   +next sample headers (old/new/compact depending on version)
 *   +next track map: numTracks × uint16le
 *   +next track data: trackCount entries of uint16le numEvents + u8 type + numEvents*3 bytes
 *   +next sample PCM data
 *
 * AMF track event triplet [row, command, value]:
 *   command 0x00..0x7E: note (command = MIDI note) + volume (value, 0xFF = no vol)
 *   command 0x7F: instrument without note retrigger
 *   command 0x80: instrument (value = instr index + 1)
 *   command 0x81..0x97: effects (see table below)
 *
 * Reference: OpenMPT soundlib/Load_amf.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function i8(v: DataView, off: number): number    { return v.getInt8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── MOD2XMFineTune ─────────────────────────────────────────────────────────────

function mod2xmFineTune(nibble: number): number {
  const n = nibble & 0x0F;
  return (n < 8 ? n : n - 16) * 16;
}

// ── Empty instrument placeholder ────────────────────────────────────────────────

function blankInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Sample ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as InstrumentConfig;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if buffer matches either ASYLUM or DSMI AMF format.
 *
 * ASYLUM: signature "ASYLUM Music Format V1.0\0" at offset 0, numSamples ≤ 64.
 * DSMI AMF: "AMF" at 0 + version (1 or 8-14).
 * DSMI DMF: "DMF" at 0 + version (10-14).
 */
export function isAMFFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const v = new DataView(buffer);

  // ASYLUM check: signature is exactly "ASYLUM Music Format V1.0\0" (25 bytes)
  if (buffer.byteLength >= 38) {
    let match = true;
    const sig = 'ASYLUM Music Format V1.0\0';
    for (let i = 0; i < 25; i++) {
      if (v.getUint8(i) !== sig.charCodeAt(i)) { match = false; break; }
    }
    if (match) {
      const numSamples = v.getUint8(34);
      if (numSamples <= 64) return true;
    }
  }

  // DSMI AMF check
  const c0 = String.fromCharCode(v.getUint8(0));
  const c1 = String.fromCharCode(v.getUint8(1));
  const c2 = String.fromCharCode(v.getUint8(2));
  const ver = v.getUint8(3);

  if (c0 === 'A' && c1 === 'M' && c2 === 'F') {
    if (ver === 1 || (ver >= 8 && ver <= 14)) return true;
  }

  if (c0 === 'D' && c1 === 'M' && c2 === 'F') {
    if (ver >= 10 && ver <= 14) return true;
  }

  return false;
}

// ── ASYLUM parser ─────────────────────────────────────────────────────────────

// MOD effect conversion (ASYLUM uses standard MOD effect numbers)
function convertModCommand(command: number, param: number): { effTyp: number; eff: number } {
  // ASYLUM commands are standard MOD: 0=arpeggio, 1=portaUp, 2=portaDn, 3=tonePorta,
  // 4=vibrato, 5=tonePortaVol, 6=vibratoVol, 7=tremolo, 8=panning (7-bit → 8-bit *2),
  // 9=offset, A=volslide, B=posJump, C=volume, D=patBreak, E=extended, F=speed
  switch (command) {
    case 0x00: return { effTyp: 0x00, eff: param };   // arpeggio
    case 0x01: return { effTyp: 0x01, eff: param };   // porta up
    case 0x02: return { effTyp: 0x02, eff: param };   // porta down
    case 0x03: return { effTyp: 0x03, eff: param };   // tone porta
    case 0x04: return { effTyp: 0x04, eff: param };   // vibrato
    case 0x05: return { effTyp: 0x05, eff: param };   // tone porta + vol slide
    case 0x06: return { effTyp: 0x06, eff: param };   // vibrato + vol slide
    case 0x07: return { effTyp: 0x07, eff: param };   // tremolo
    case 0x08:
      // OpenMPT: in MODPLUG_TRACKER mode, panning is 7-bit → *2
      return { effTyp: 0x08, eff: Math.min(255, param * 2) };
    case 0x09: return { effTyp: 0x09, eff: param };   // sample offset
    case 0x0A: return { effTyp: 0x0A, eff: param };   // volume slide
    case 0x0B: return { effTyp: 0x0B, eff: param };   // position jump
    case 0x0C: return { effTyp: 0x0C, eff: Math.min(64, param) }; // set volume
    case 0x0D: return { effTyp: 0x0D, eff: param };   // pattern break
    case 0x0E: return { effTyp: 0x0E, eff: param };   // extended
    case 0x0F: return { effTyp: 0x0F, eff: param };   // speed/tempo
    default:   return { effTyp: 0x00, eff: 0 };
  }
}

function parseAsylumAMF(v: DataView, raw: Uint8Array, filename: string): TrackerSong {
  // AsylumFileHeader (38 bytes):
  //   +0  signature[32]
  //   +32 defaultSpeed(u8)
  //   +33 defaultTempo(u8)
  //   +34 numSamples(u8)
  //   +35 numPatterns(u8)
  //   +36 numOrders(u8)
  //   +37 restartPos(u8)
  const defaultSpeed  = u8(v, 32);
  const defaultTempo  = u8(v, 33);
  const numSamples    = u8(v, 34);
  const numPatterns   = u8(v, 35);
  const numOrders     = u8(v, 36);
  const restartPos    = u8(v, 37);

  const NUM_CHANNELS = 8;

  // Order list (256 bytes at offset 38)
  const songPositions: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    songPositions.push(u8(v, 38 + i));
  }
  if (songPositions.length === 0) songPositions.push(0);

  // Sample headers: 64 × 37 bytes, starting at offset 294
  // AsylumSampleHeader (37 bytes):
  //   +0  name[22]
  //   +22 finetune(u8)
  //   +23 volume(u8)     0-64
  //   +24 transpose(i8)
  //   +25 length(u32le)
  //   +29 loopStart(u32le)
  //   +33 loopLength(u32le)
  const ASYLUM_SAMPLE_HDR = 37;
  const smpHdrBase = 294;

  interface AsylumSmpHdr {
    name:       string;
    finetune:   number;
    volume:     number;
    transpose:  number;
    length:     number;
    loopStart:  number;
    loopLength: number;
  }

  const sampleHeaders: AsylumSmpHdr[] = [];
  for (let s = 0; s < 64; s++) {
    const off = smpHdrBase + s * ASYLUM_SAMPLE_HDR;
    sampleHeaders.push({
      name:       readString(v, off, 22),
      finetune:   u8(v, off + 22),
      volume:     Math.min(u8(v, off + 23), 64),
      transpose:  i8(v, off + 24),
      length:     u32le(v, off + 25),
      loopStart:  u32le(v, off + 29),
      loopLength: u32le(v, off + 33),
    });
  }

  // Pattern data: numPatterns × 64 rows × 8 channels × 4 bytes
  const patDataBase = smpHdrBase + 64 * ASYLUM_SAMPLE_HDR; // = 294 + 2368 = 2662
  const PATTERN_BYTES = 64 * NUM_CHANNELS * 4;
  const NOTE_MIN = 1; // XM note 1 = C-0

  const patterns: Pattern[] = [];
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patDataBase + pat * PATTERN_BYTES;

    const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch): ChannelData => {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < 64; row++) {
        const cellOff = patBase + row * NUM_CHANNELS * 4 + ch * 4;
        if (cellOff + 3 >= v.byteLength) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const noteRaw = u8(v, cellOff);
        const instr   = u8(v, cellOff + 1);
        const command = u8(v, cellOff + 2);
        const param   = u8(v, cellOff + 3);

        // ASYLUM note encoding from OpenMPT: if(note && note + 12 + NOTE_MIN <= NOTE_MAX)
        //   m.note = note + 12 + NOTE_MIN
        // NOTE_MIN = 1, NOTE_MAX = 120 in OpenMPT → note + 12 + 1 ≤ 120 → note ≤ 107
        let note = 0;
        if (noteRaw > 0 && noteRaw + 12 + NOTE_MIN <= 120) {
          note = noteRaw + 12 + NOTE_MIN;
        }

        const { effTyp, eff } = convertModCommand(command, param);

        rows.push({
          note,
          instrument: instr,
          volume:     0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        });
      }

      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ch < 4 ? (ch % 2 === 0 ? -64 : 64) : (ch % 2 === 0 ? -64 : 64),
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  64,
      channels,
      importMetadata: {
        sourceFormat:            'AMF_ASYLUM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    });
  }

  // Sample data
  let smpDataOff = patDataBase + numPatterns * PATTERN_BYTES;
  const instruments: InstrumentConfig[] = [];
  for (let s = 0; s < numSamples; s++) {
    const sh  = sampleHeaders[s];
    const id  = s + 1;
    const name = sh?.name || `Sample ${id}`;

    if (!sh || sh.length === 0 || smpDataOff + sh.length > v.byteLength) {
      instruments.push(blankInstrument(id, name));
      if (sh && sh.length > 0) smpDataOff += Math.min(sh.length, v.byteLength - smpDataOff);
      continue;
    }

    const pcm = raw.slice(smpDataOff, smpDataOff + sh.length);
    smpDataOff += sh.length;

    const hasLoop    = sh.loopLength > 2 && sh.loopStart + sh.loopLength <= sh.length;
    const loopStart  = hasLoop ? sh.loopStart  : 0;
    const loopEnd    = hasLoop ? sh.loopStart + sh.loopLength : 0;
    const sampleRate = 8363; // ASYLUM uses standard MOD tuning via finetune + transpose
    const finetune   = mod2xmFineTune(sh.finetune);

    const inst = createSamplerInstrument(id, name, pcm, sh.volume, sampleRate, loopStart, loopEnd);
    if (inst.metadata?.modPlayback) {
      inst.metadata.modPlayback.finetune = finetune;
    }
    instruments.push(inst);
  }

  const clampedRestart = restartPos < numOrders ? restartPos : 0;
  const maxPat = Math.max(0, patterns.length - 1);
  const finalPositions = songPositions.map(p => Math.min(p, maxPat));

  return {
    name:            filename.replace(/\.[^/.]+$/i, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   finalPositions,
    songLength:      finalPositions.length,
    restartPosition: clampedRestart,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    Math.max(1, defaultSpeed),
    initialBPM:      Math.max(1, defaultTempo),
    linearPeriods:   false,
  };
}

// ── DSMI AMF/DMF effect conversion ────────────────────────────────────────────
//
// DSMI AMF effect table (masked command & 0x7F):
// 00=none, 01=speed, 02=volslide, 03=volume, 04=portaUp, 05=none,
// 06=tonePorta, 07=tremor, 08=arpeggio, 09=vibrato, 0A=tonePortaVol,
// 0B=vibratoVol, 0C=patBreak, 0D=posJump, 0E=none, 0F=retrig,
// 10=offset, 11=fineVolSlide, 12=finePorta, 13=noteDelay, 14=noteCut,
// 15=tempo, 16=extraFinePorta, 17=panning

function convertAMFDSMIEffect(
  command: number,
  param: number,
  cell: TrackerCell,
): void {
  const masked = command & 0x7F;

  // Effect table matching OpenMPT's effTrans[] in AMFReadPattern
  const effTrans: number[] = [
    0x00,  // 00 none
    0x0F,  // 01 speed
    0x0A,  // 02 volslide
    0x0C,  // 03 volume (CMD_VOLUME → volume column)
    0x01,  // 04 portaUp
    0x00,  // 05 none
    0x03,  // 06 tonePorta
    0x1D,  // 07 tremor
    0x00,  // 08 arpeggio (effTyp 0)
    0x04,  // 09 vibrato
    0x05,  // 0A tonePortaVol
    0x06,  // 0B vibratoVol
    0x0D,  // 0C patBreak
    0x0B,  // 0D posJump
    0x00,  // 0E none
    0x1B,  // 0F retrig
    0x09,  // 10 offset
    0x0A,  // 11 fineVolSlide
    0x01,  // 12 finePorta
    0x0E,  // 13 S3MCmdEx (noteDelay)
    0x0E,  // 14 S3MCmdEx (noteCut)
    0x0F,  // 15 tempo
    0x01,  // 16 extraFinePorta
    0x08,  // 17 panning
  ];

  if (masked >= effTrans.length) return;

  let cmd = effTrans[masked];
  let p   = param;

  // Apply the same transforms as OpenMPT's switch block:
  switch (masked) {
    case 0x02: // Volume slide: positive = up, negative = down
    case 0x0A: // Tone porta + vol slide
    case 0x0B: // Vibrato + vol slide
      if (p & 0x80) {
        p = ((-p) & 0xFF) & 0x0F; // down nibble
      } else {
        p = (p & 0x0F) << 4;      // up nibble
      }
      break;

    case 0x03: // Volume — move to volume column if possible
      p = Math.min(p, 64);
      if (cell.volume === 0) {
        cell.volume = p;
        cmd = 0x00; // consumed by volume column
        p = 0;
      }
      break;

    case 0x04: // Porta up/down: negative = down
      if (p & 0x80) {
        p = ((-p) & 0xFF) & 0x7F;
      } else {
        cmd = 0x02; // portamento down
      }
      break;

    case 0x11: { // Fine volume slide
      if (p === 0) { cmd = 0x00; break; }
      if (p & 0x80) {
        p = 0xF0 | (((-p) & 0xFF) & 0x0F);
      } else {
        p = 0x0F | ((p & 0x0F) << 4);
      }
      break;
    }

    case 0x12: // Fine portamento
    case 0x16: { // Extra fine portamento
      if (p === 0) { cmd = 0x00; break; }
      if (p & 0x80) {
        cmd = 0x01; // porta up
        p = ((-p) & 0xFF) & 0x0F;
      } else {
        cmd = 0x02; // porta down
      }
      p |= (masked === 0x16) ? 0xE0 : 0xF0;
      break;
    }

    case 0x13: // Note delay
      p = 0xD0 | (p & 0x0F);
      break;

    case 0x14: // Note cut
      p = 0xC0 | (p & 0x0F);
      break;

    case 0x17: { // Panning
      if (p === 100) {
        // Surround — maps to S3M 0xA4
        p = 0xA4;
      } else {
        p = Math.max(0, Math.min(128, (p < 128 ? p : p - 256) + 64));
        // If effect slot already taken, move to volume column
        if (cell.effTyp !== 0) {
          if (cell.volume === 0) {
            cell.volume = Math.floor(p / 2); // use VOLCMD_PANNING
          }
          cmd = 0x00;
          p   = 0;
        }
      }
      break;
    }
  }

  if (cmd !== 0x00 || p !== 0) {
    cell.effTyp = cmd;
    cell.eff    = p;
  }
}

// ── DSMI AMF track decoder ─────────────────────────────────────────────────────

/**
 * Read a single AMF track (channel) into a pattern row array.
 * Event triplet: [row(u8), command(u8), value(u8)]
 * Mirrors OpenMPT's AMFReadPattern().
 */
function amfReadTrack(
  trackData: Uint8Array,
  numRows: number,
  rows: TrackerCell[],
): void {
  let pos = 0;
  while (pos + 2 < trackData.length) {
    const row     = trackData[pos];
    const command = trackData[pos + 1];
    const value   = trackData[pos + 2];
    pos += 3;

    if (row >= numRows) break;

    const cell = rows[row];

    if (command < 0x7F) {
      // Note + volume
      if (command === 0 && value === 0) {
        cell.note = 97; // NOTE_NOTECUT
      } else {
        // command = MIDI note (0-based from OpenMPT NOTE_MIN perspective)
        // OpenMPT: m.note = command + NOTE_MIN; where NOTE_MIN=1
        cell.note = command + 1;
        if (value !== 0xFF) {
          cell.volume = value; // volume column
        }
      }
    } else if (command === 0x7F) {
      // Instrument without note retrigger — nothing to store here
      // (the instrument would have been set by a preceding 0x80 command)
    } else if (command === 0x80) {
      // Instrument
      cell.instrument = value + 1;
    } else {
      // Effect — command 0x81..0x97
      convertAMFDSMIEffect(command, value, cell);
    }
  }
}

// ── DSMI AMF/DMF parser ───────────────────────────────────────────────────────

function parseDSMIAMF(v: DataView, raw: Uint8Array, filename: string): TrackerSong {
  const fileLen = v.byteLength;
  let off = 0;

  // Signature (3 bytes) + version (1 byte)
  const sigStr = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2));
  const version = v.getUint8(3);
  const isDMF   = sigStr === 'DMF';
  off = 4;

  // Title (AMF only, 32 bytes)
  let songTitle = '';
  if (!isDMF) {
    if (off + 32 > fileLen) throw new Error('AMFParser(DSMI): truncated at title');
    songTitle = readString(v, off, 32);
    off += 32;
  }

  // File header: numSamples(u8) + numOrders(u8) + numTracks(u16le) [+ numChannels(u8) if v≥9]
  if (off + 4 > fileLen) throw new Error('AMFParser(DSMI): truncated at file header');

  const numSamples = u8(v, off);     off++;
  const numOrders  = u8(v, off);     off++;
  const numTracks  = u16le(v, off);  off += 2;

  let numChannels = 4; // v1-v8: fixed 4 channels
  if (version >= 9) {
    if (off >= fileLen) throw new Error('AMFParser(DSMI): truncated at numChannels');
    numChannels = u8(v, off); off++;
    if (numChannels < 1 || numChannels > 32) throw new Error(`AMFParser(DSMI): invalid numChannels ${numChannels}`);
  }

  // Channel panning (version ≥ 11)
  const channelPan: number[] = Array(numChannels).fill(0);
  if (version >= 11) {
    const readChans = version >= 12 ? 32 : 16;
    for (let c = 0; c < numChannels && c < readChans; c++) {
      if (off >= fileLen) break;
      const pan = i8(v, off + c);
      // 100 = surround → center; else (pan + 64) * 2 clamped to 0-256
      if (pan === 100) {
        channelPan[c] = 0; // centre (surround)
      } else {
        const raw256 = Math.max(0, Math.min(256, (pan + 64) * 2));
        channelPan[c] = raw256 - 128; // -128..+128
      }
    }
    if (off + readChans <= fileLen) off += readChans;
    else off = fileLen;
  } else if (version >= 9) {
    // v9-10: skip 16-byte channel remap table; use standard LRRL panning
    off += 16;
    for (let c = 0; c < numChannels; c++) {
      channelPan[c] = (c & 1) ? 64 : -64; // LRLR
    }
  } else {
    // v1-v8: fixed 4-channel Amiga-style LRRL
    for (let c = 0; c < 4; c++) {
      channelPan[c] = (c & 1) ? 64 : -64;
    }
  }

  // Tempo and speed (version ≥ 13)
  let initialBPM   = 125;
  let initialSpeed = 6;
  if (version >= 13) {
    if (off + 2 > fileLen) throw new Error('AMFParser(DSMI): truncated at tempo');
    let tempo = u8(v, off); off++;
    if (tempo < 32) tempo = 125;
    initialBPM   = tempo;
    initialSpeed = u8(v, off); off++;
  }

  // Order/pattern length table and per-order track assignment table
  // Version ≥ 14: each order entry starts with uint16le patLength
  // Then: numChannels × uint16le track references (1-based index into numTracks)
  const patternLengths: number[] = [];

  // We need to record the file position of each order's track table
  // for later pattern construction. Pre-read the order structure.
  interface OrderEntry {
    patLength: number;
    trackRefs: number[]; // numChannels track indices (1-based into numTracks table)
  }

  // First pass: read all order entries
  const orderEntries: OrderEntry[] = [];
  for (let ord = 0; ord < numOrders; ord++) {
    let patLength = 64;
    if (version >= 14) {
      if (off + 2 > fileLen) break;
      patLength = u16le(v, off); off += 2;
    }
    patternLengths.push(patLength);

    const trackRefs: number[] = [];
    for (let c = 0; c < numChannels; c++) {
      if (off + 2 > fileLen) { trackRefs.push(0); continue; }
      trackRefs.push(u16le(v, off)); off += 2;
    }
    orderEntries.push({ patLength, trackRefs });
  }

  // Sample headers
  // Version < 10: AMFSampleHeaderOld (59 bytes)
  //   type(u8) + name[32] + filename[13] + index(u32le) + length(u16le) +
  //   sampleRate(u16le) + volume(u8) + loopStart(u16le) + loopEnd(u16le)
  //
  // Version 10+ non-DMF: AMFSampleHeaderNew (65 bytes)
  //   type(u8) + name[32] + filename[13] + index(u32le) + length(u32le) +
  //   sampleRate(u16le) + volume(u8) + loopStart(u32le) + loopEnd(u32le)
  //
  // Version 10+ DMF: AMFSampleHeaderCompact (20 bytes)
  //   type(u8) + leftOverFirstChar(u8) + index(u32le) + length(u32le) +
  //   sampleRate(u16le) + volume(u8) + loopStart(u32le) + loopEnd(u24le)

  interface AMFSmpHdr {
    type:       number;
    name:       string;
    index:      number;
    length:     number;
    sampleRate: number;
    volume:     number;
    loopStart:  number;
    loopEnd:    number;
    hasLoop:    boolean;
  }

  // Detect truncated v10 headers (M2AMF 1.3 bug): use old struct length for new headers
  let truncatedHeaders = false;
  if (version === 10 && !isDMF) {
    // Peek: read headers as new and validate each; if invalid, switch to old struct size
    const peekOff = off;
    const AMF_NEW_HDR = 65;
    for (let s = 0; s < numSamples; s++) {
      const hdrOff = peekOff + s * AMF_NEW_HDR;
      if (hdrOff + AMF_NEW_HDR > fileLen) break;
      const type      = u8(v,    hdrOff);
      const idx       = u32le(v, hdrOff + 46);
      const len       = u32le(v, hdrOff + 50);
      const vol       = u8(v,    hdrOff + 56);
      const lstart    = u32le(v, hdrOff + 57);
      const lend      = u32le(v, hdrOff + 61);
      // OpenMPT IsValid check: type <= 1 && index <= numSamples && length <= 0x100000
      //   && volume <= 64 && loopStart <= length && loopEnd <= length
      if (type > 1 || idx > numSamples || len > 0x100000 || vol > 64 ||
          lstart > len || lend > len) {
        truncatedHeaders = true;
        break;
      }
    }
  }

  const sampleHeaders: AMFSmpHdr[] = [];
  const sampleMap: number[] = []; // sampleMap[s-1] = file-order index (1-based)

  for (let s = 0; s < numSamples; s++) {
    if (version < 10) {
      // Old header: 59 bytes
      const AMF_OLD = 59;
      if (off + AMF_OLD > fileLen) break;
      const type      = u8(v,    off);
      const name      = readString(v, off + 1, 32);
      // filename at off+33 (13 bytes) — skip
      const index     = u32le(v, off + 46);
      const length    = u16le(v, off + 50);
      const sr        = u16le(v, off + 52);
      const volume    = u8(v,    off + 54);
      const loopStart = u16le(v, off + 55);
      const loopEnd   = u16le(v, off + 57);
      const hasLoop   = type !== 0 && loopEnd !== 0xFFFF &&
                        loopEnd > loopStart + 2 && loopEnd <= length;
      sampleHeaders.push({
        type, name, index, length, sampleRate: sr, volume: Math.min(volume, 64),
        loopStart: hasLoop ? loopStart : 0,
        loopEnd:   hasLoop ? loopEnd   : 0,
        hasLoop,
      });
      sampleMap.push(index);
      off += AMF_OLD;
    } else if (isDMF) {
      // Compact header: 20 bytes (no name)
      const AMF_COMPACT = 20;
      if (off + AMF_COMPACT > fileLen) break;
      const type      = u8(v,    off);
      // leftOverFirstChar at off+1 — skip
      const index     = u32le(v, off + 2);
      const length    = u32le(v, off + 6);
      const sr        = u16le(v, off + 10);
      const volume    = u8(v,    off + 12);
      const loopStart = u32le(v, off + 13);
      // loopEnd is 24-bit LE
      const loopEndLo = u16le(v, off + 17);
      const loopEndHi = u8(v,    off + 19);
      const loopEnd   = loopEndLo | (loopEndHi << 16);
      const hasLoop   = type !== 0 && loopEnd > loopStart + 2 && loopEnd <= length;
      sampleHeaders.push({
        type, name: '', index, length, sampleRate: sr, volume: Math.min(volume, 64),
        loopStart: hasLoop ? loopStart : 0,
        loopEnd:   hasLoop ? loopEnd   : 0,
        hasLoop,
      });
      sampleMap.push(index);
      off += AMF_COMPACT;
    } else {
      // New header: 65 bytes (or 59 if truncated — read partial, rest zeroed)
      const AMF_NEW = 65;
      const readLen = truncatedHeaders ? 59 : AMF_NEW;
      if (off + readLen > fileLen) break;
      const type   = u8(v,    off);
      const name   = readString(v, off + 1, 32);
      const index  = u32le(v, off + 46);
      const length = u32le(v, off + 50);
      const sr     = u16le(v, off + 54);
      const volume = u8(v,    off + 56);

      let loopStart: number, loopEnd: number, hasLoop: boolean;
      if (truncatedHeaders) {
        // Old-size read: loopStart and loopEnd are 16-bit at different offsets
        // (old struct at those offsets would be 55 and 57 from hdr base)
        // Actually the 59-byte read places: off+50=length(u32le), off+54=sr(u16le),
        // off+56=volume(u8), off+57=loopStart(u16le... but at old format off+55 is vol,
        // off+56=loopStart16, off+58=loopEnd16)
        // For truncated: treat loopStart/loopEnd as unavailable → no loop
        const ls = off + 57 + 2 <= off + readLen ? u16le(v, off + 57) : 0;
        const le = off + 57 + 4 <= off + readLen ? u16le(v, off + 59) : 0;
        hasLoop   = type !== 0 && le > ls + 2 && le <= length;
        loopStart = hasLoop ? ls : 0;
        loopEnd   = hasLoop ? le : 0;
        // For truncated: if loopStart > 0, extend loopEnd to length (OpenMPT)
        if (truncatedHeaders && ls > 0) loopEnd = length;
        off += readLen;
      } else {
        loopStart = u32le(v, off + 57);
        loopEnd   = u32le(v, off + 61);
        hasLoop   = type !== 0 && loopEnd > loopStart + 2 && loopEnd <= length;
        off += AMF_NEW;
      }

      sampleHeaders.push({
        type, name, index, length, sampleRate: sr, volume: Math.min(volume, 64),
        loopStart: hasLoop ? loopStart : 0,
        loopEnd:   hasLoop ? loopEnd   : 0,
        hasLoop,
      });
      sampleMap.push(index);
    }
  }

  // Track mapping table: numTracks × uint16le
  if (off + numTracks * 2 > fileLen) throw new Error('AMFParser(DSMI): truncated at track map');
  const trackMap: number[] = [];
  for (let t = 0; t < numTracks; t++) {
    trackMap.push(u16le(v, off)); off += 2;
  }

  // Find maximum real track index (trackCount)
  let trackCount = 0;
  for (const tm of trackMap) {
    if (tm > trackCount) trackCount = tm;
  }

  // Read track data: trackCount entries
  // Per track: uint16le numEvents + u8 trackType + numEvents*3 bytes
  // Version 1 quirk: numEvents*3 + 3 extra bytes (one extra event)
  const trackData: (Uint8Array | null)[] = [];
  for (let i = 0; i < trackCount && off + 3 <= fileLen; i++) {
    if (off + 3 > fileLen) { trackData.push(null); break; }
    const numEvents = u16le(v, off); off += 2;
    off++; // track type byte (skip)
    const dataLen = numEvents * 3 + (version === 1 ? 3 : 0);
    if (numEvents === 0) {
      trackData.push(null);
    } else {
      const end = Math.min(off + dataLen, fileLen);
      trackData.push(raw.slice(off, end));
      off += dataLen;
    }
  }

  // Sample PCM data
  const sampleDataStart = off;

  // Build patterns from order entries
  const patterns: Pattern[] = [];
  for (let pat = 0; pat < numOrders; pat++) {
    const entry     = orderEntries[pat];
    if (!entry) continue;
    const patLength = entry.patLength;

    // Allocate rows for all channels
    const channelRows: TrackerCell[][] = Array.from(
      { length: numChannels },
      () => Array.from({ length: patLength }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    );

    for (let chn = 0; chn < numChannels; chn++) {
      const trkRef = entry.trackRefs[chn] ?? 0;
      if (trkRef === 0 || trkRef > numTracks) continue;

      const realTrack = trackMap[trkRef - 1];
      if (realTrack === 0 || realTrack > trackCount) continue;

      const td = trackData[realTrack - 1];
      if (!td) continue;

      amfReadTrack(td, patLength, channelRows[chn]);
    }

    const channels: ChannelData[] = Array.from(
      { length: numChannels },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          channelPan[ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows:         channelRows[ch],
      }),
    );

    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  patLength,
      channels,
      importMetadata: {
        sourceFormat:            isDMF ? 'AMF_DMF' : 'AMF_DSMI',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numOrders,
        originalInstrumentCount: numSamples,
      },
    });
  }

  // Song order is sequential 0..numOrders-1 (AMF patterns == orders)
  const songPositions: number[] = Array.from({ length: numOrders }, (_, i) => i);

  // Build instruments from sample data
  // Note: sampleMap[s] = file order index (1-based). We iterate file order 1..numSamples
  // and for each, find which instrument slot maps to it (may be multiple).
  const instruments: InstrumentConfig[] = [];

  let smpReadOff = sampleDataStart;
  for (let fileOrd = 1; fileOrd <= numSamples && smpReadOff < fileLen; fileOrd++) {
    const startPos = smpReadOff;

    for (let target = 0; target < numSamples; target++) {
      if (sampleMap[target] !== fileOrd) continue;

      const sh = sampleHeaders[target];
      if (!sh) continue;

      const id   = target + 1;
      const name = sh.name || `Sample ${id}`;

      if (sh.length === 0) {
        instruments.push(blankInstrument(id, name));
        continue;
      }

      const readLen = Math.min(sh.length, fileLen - startPos);
      if (readLen <= 0) {
        instruments.push(blankInstrument(id, name));
        continue;
      }

      smpReadOff = startPos; // Reset for multiple instruments sharing same file position
      const pcm = raw.slice(startPos, startPos + readLen);

      if (isDMF) {
        // DMF: unsigned delta PCM → decode delta then flip sign bit
        const decoded = new Uint8Array(readLen);
        let acc = 0;
        for (let i = 0; i < readLen; i++) {
          acc = (acc + pcm[i]) & 0xFF;
          decoded[i] = acc ^ 0x80; // flip to signed
        }
        instruments.push(createSamplerInstrument(
          id, name, decoded,
          sh.volume,
          sh.sampleRate || 8363,
          sh.loopStart, sh.loopEnd,
        ));
      } else {
        // AMF: unsigned PCM → convert to signed by XOR 0x80
        const signed = new Uint8Array(readLen);
        for (let i = 0; i < readLen; i++) signed[i] = pcm[i] ^ 0x80;
        instruments.push(createSamplerInstrument(
          id, name, signed,
          sh.volume,
          sh.sampleRate || 8363,
          sh.loopStart, sh.loopEnd,
        ));
      }

      smpReadOff = startPos + sh.length; // advance past this file sample
    }

    // Advance smpReadOff to after this file-order sample
    // Find the sample with this file order to get its length
    let fileLen2 = 0;
    for (let target = 0; target < numSamples; target++) {
      if (sampleMap[target] === fileOrd) {
        fileLen2 = sampleHeaders[target]?.length ?? 0;
        break;
      }
    }
    smpReadOff = startPos + fileLen2;
  }

  // Sort instruments by id for consistent ordering
  instruments.sort((a, b) => a.id - b.id);

  return {
    name:            songTitle || filename.replace(/\.[^/.]+$/i, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse an AMF file (ASYLUM or DSMI/DMF) into a TrackerSong.
 *
 * @throws If the file fails format detection or is fatally malformed.
 */
export async function parseAMFFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isAMFFormat(buffer)) {
    throw new Error('AMFParser: file does not match ASYLUM or DSMI AMF format');
  }

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // Determine which variant
  // ASYLUM: first 25 bytes match "ASYLUM Music Format V1.0\0"
  const sig = 'ASYLUM Music Format V1.0\0';
  let isAsylum = true;
  for (let i = 0; i < 25; i++) {
    if (v.getUint8(i) !== sig.charCodeAt(i)) { isAsylum = false; break; }
  }

  if (isAsylum) {
    return parseAsylumAMF(v, raw, filename);
  } else {
    return parseDSMIAMF(v, raw, filename);
  }
}
