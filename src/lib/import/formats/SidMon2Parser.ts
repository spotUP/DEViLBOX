/**
 * SidMon2Parser.ts -- SidMon II (.sid2, .smn) Amiga format parser
 *
 * SidMon II ("SIDMON II - THE MIDI VERSION") is a 4-channel Amiga tracker
 * featuring wavetable-based synthesis with per-instrument ADSR envelopes,
 * arpeggio tables, vibrato tables, and sample negation effects.
 *
 * Binary format details:
 *   - Magic: "SIDMON II - THE MIDI VERSION" at offset 58 (28 bytes)
 *   - Header offsets store lengths for tracks, waves, arpeggios, vibratos,
 *     patterns, and sample metadata
 *   - Track data stored in 3 interleaved passes (pattern#, transpose, soundTranspose)
 *   - 32-byte instrument definitions with wave/arpeggio/vibrato/ADSR params
 *   - Compact variable-length pattern encoding
 *   - PCM sample data with negation parameters
 *
 * Reference: FlodJS S2Player.js by Christian Corti (Neoart)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// -- SidMon II period table (from S2Player.js) --------------------------------
// Index 0 is unused (0). Indices 1-72 cover 6 octaves (C-1 to B-6).

const PERIODS = [
  0,
  5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3616, 3424, 3232, 3048,
  2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808, 1712, 1616, 1524,
  1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,  856,  808,  762,
   720,  678,  640,  604,  570,  538,  508,  480,  453,  428,  404,  381,
   360,  339,  320,  302,  285,  269,  254,  240,  226,  214,  202,  190,
   180,  170,  160,  151,  143,  135,  127,  120,  113,  107,  101,   95,
];

// -- Internal data structures -------------------------------------------------

interface S2Step {
  pattern: number;
  transpose: number;
  soundTranspose: number;
}

interface S2Instrument {
  wave: number;          // wave table offset (value << 4)
  waveLen: number;
  waveSpeed: number;
  waveDelay: number;
  arpeggio: number;      // arpeggio table offset (value << 4)
  arpeggioLen: number;
  arpeggioSpeed: number;
  arpeggioDelay: number;
  vibrato: number;       // vibrato table offset (value << 4)
  vibratoLen: number;
  vibratoSpeed: number;
  vibratoDelay: number;
  pitchBend: number;     // signed
  pitchBendDelay: number;
  attackMax: number;
  attackSpeed: number;
  decayMin: number;
  decaySpeed: number;
  sustain: number;
  releaseMin: number;
  releaseSpeed: number;
}

interface S2Row {
  note: number;
  sample: number;
  effect: number;
  param: number;
  speed: number;
}

interface S2Sample {
  name: string;
  length: number;   // in bytes (already <<1)
  loop: number;      // loop offset in bytes
  repeat: number;    // loop repeat length in bytes
  pointer: number;   // byte offset into sample data block
  loopPtr: number;   // absolute loop start offset
  // Negation params (for reference, not used in static import)
  negStart: number;
  negLen: number;
  negSpeed: number;
  negDir: number;
  negOffset: number;
  negPos: number;
  negCtr: number;
}

// -- Utility ------------------------------------------------------------------

function readString(data: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    const c = data[offset + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function readUbyte(data: Uint8Array, pos: number): number {
  return data[pos];
}

function readByte(data: Uint8Array, pos: number): number {
  const v = data[pos];
  return v < 128 ? v : v - 256;
}

function readUshort(data: Uint8Array, pos: number): number {
  return (data[pos] << 8) | data[pos + 1];
}

function readShort(data: Uint8Array, pos: number): number {
  const v = (data[pos] << 8) | data[pos + 1];
  return v < 32768 ? v : v - 65536;
}

function readUint(data: Uint8Array, pos: number): number {
  return ((data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]) >>> 0;
}

/**
 * Map a SidMon II period to an XM note number (1-96).
 * SidMon II uses its own period table (indices 1-72). We find the closest
 * period and map it to XM note space where C-1 = 13.
 */
function sidmonPeriodToXMNote(period: number): number {
  if (period <= 0) return 0;

  // Find closest match in the PERIODS table
  let bestIdx = 1;
  let bestDist = Math.abs(PERIODS[1] - period);
  for (let i = 2; i <= 72; i++) {
    const d = Math.abs(PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  // SidMon note 1 = C-1 (period 5760), note 13 = C-2 (period 2880), etc.
  // XM note 1 = C-0, XM note 13 = C-1.
  // SidMon note 1 (C-1) -> XM note 13
  return bestIdx + 12;
}

/**
 * Map a SidMon II note index (1-72) + transpose to an XM note.
 */
function sidmonNoteToXM(note: number, transpose: number): number {
  if (note <= 0 || note > 72) return 0;
  const transposed = note + transpose;
  if (transposed < 1 || transposed > 72) return 0;
  const period = PERIODS[transposed];
  if (!period) return 0;
  return sidmonPeriodToXMNote(period);
}

// -- Format detection ---------------------------------------------------------

/**
 * Detect whether a buffer contains a SidMon II module.
 * Checks for the magic string "SIDMON II - THE MIDI VERSION" at offset 58.
 */
export function isSidMon2Format(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 90) return false;
  const data = new Uint8Array(buffer);
  const magic = readString(data, 58, 28);
  return magic === 'SIDMON II - THE MIDI VERSION';
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a SidMon II module file into a TrackerSong.
 * Follows the S2Player.js loader logic exactly.
 */
export async function parseSidMon2File(
  buffer: ArrayBuffer,
  filename: string
): Promise<TrackerSong> {
  const data = new Uint8Array(buffer);

  // Validate magic
  const magic = readString(data, 58, 28);
  if (magic !== 'SIDMON II - THE MIDI VERSION') {
    throw new Error(`Not a SidMon II file: magic="${magic}"`);
  }

  // -- Header fields ----------------------------------------------------------

  let pos = 2;
  const length = readUbyte(data, pos); pos++;       // number of track positions
  const speedDef = readUbyte(data, pos); pos++;      // default speed
  const sampleCount = readUshort(data, pos) >> 6; pos += 2; // offset 4-5, >>6

  // offset 14: track data length (4 bytes)
  const trackDataLen = readUint(data, 14);

  // offset 26: wave data total length (4 bytes) -- used for instrument count
  const waveDataLen = readUint(data, 26);

  // offset 30: arpeggio data length
  // offset 34: vibrato data length
  // offset 50: pattern data length

  // -- Track data (starts at offset 90) ---------------------------------------

  pos = 90;
  const trackLen = trackDataLen;
  const tracks: S2Step[] = new Array(trackLen);

  // Higher pattern index tracker (for pointer array sizing)
  let higher = 0;

  // Pass 1: pattern numbers
  for (let i = 0; i < trackLen; i++) {
    const step: S2Step = { pattern: 0, transpose: 0, soundTranspose: 0 };
    step.pattern = readUbyte(data, pos); pos++;
    if (step.pattern > higher) higher = step.pattern;
    tracks[i] = step;
  }

  // Pass 2: transposes
  for (let i = 0; i < trackLen; i++) {
    tracks[i].transpose = readByte(data, pos); pos++;
  }

  // Pass 3: sound transposes
  for (let i = 0; i < trackLen; i++) {
    tracks[i].soundTranspose = readByte(data, pos); pos++;
  }

  // -- Instruments (32 bytes each) --------------------------------------------
  // Instrument count = (waveDataLen >> 5) + 1 (including empty instrument 0)

  const instrPosition = pos;
  const numInstruments = (waveDataLen >> 5) + 1;
  const instruments: S2Instrument[] = new Array(numInstruments);

  // Instrument 0 is empty/default
  instruments[0] = {
    wave: 0, waveLen: 0, waveSpeed: 0, waveDelay: 0,
    arpeggio: 0, arpeggioLen: 0, arpeggioSpeed: 0, arpeggioDelay: 0,
    vibrato: 0, vibratoLen: 0, vibratoSpeed: 0, vibratoDelay: 0,
    pitchBend: 0, pitchBendDelay: 0,
    attackMax: 0, attackSpeed: 0,
    decayMin: 0, decaySpeed: 0,
    sustain: 0, releaseMin: 0, releaseSpeed: 0,
  };

  pos = instrPosition;
  for (let i = 1; i < numInstruments; i++) {
    const wave           = readUbyte(data, pos) << 4; pos++;
    const waveLen        = readUbyte(data, pos); pos++;
    const waveSpeed      = readUbyte(data, pos); pos++;
    const waveDelay      = readUbyte(data, pos); pos++;
    const arpeggio       = readUbyte(data, pos) << 4; pos++;
    const arpeggioLen    = readUbyte(data, pos); pos++;
    const arpeggioSpeed  = readUbyte(data, pos); pos++;
    const arpeggioDelay  = readUbyte(data, pos); pos++;
    const vibrato        = readUbyte(data, pos) << 4; pos++;
    const vibratoLen     = readUbyte(data, pos); pos++;
    const vibratoSpeed   = readUbyte(data, pos); pos++;
    const vibratoDelay   = readUbyte(data, pos); pos++;
    const pitchBend      = readByte(data, pos); pos++;
    const pitchBendDelay = readUbyte(data, pos); pos++;
    pos++; // skip 1 byte
    pos++; // skip 1 byte
    const attackMax      = readUbyte(data, pos); pos++;
    const attackSpeed    = readUbyte(data, pos); pos++;
    const decayMin       = readUbyte(data, pos); pos++;
    const decaySpeed     = readUbyte(data, pos); pos++;
    const sustain        = readUbyte(data, pos); pos++;
    const releaseMin     = readUbyte(data, pos); pos++;
    const releaseSpeed   = readUbyte(data, pos); pos++;
    pos += 9; // skip remaining 9 bytes to fill 32-byte record

    instruments[i] = {
      wave, waveLen, waveSpeed, waveDelay,
      arpeggio, arpeggioLen, arpeggioSpeed, arpeggioDelay,
      vibrato, vibratoLen, vibratoSpeed, vibratoDelay,
      pitchBend, pitchBendDelay,
      attackMax, attackSpeed,
      decayMin, decaySpeed,
      sustain, releaseMin, releaseSpeed,
    };
  }

  // -- Wave table data --------------------------------------------------------

  const wavePosition = pos;
  const waveTotalLen = readUint(data, 30);
  const waves = new Uint8Array(waveTotalLen);
  pos = wavePosition;
  for (let i = 0; i < waveTotalLen; i++) {
    waves[i] = readUbyte(data, pos); pos++;
  }

  // -- Arpeggio table data ----------------------------------------------------

  const arpeggioPosition = pos;
  const arpeggioLen = readUint(data, 34);
  const arpeggios = new Int8Array(arpeggioLen);
  pos = arpeggioPosition;
  for (let i = 0; i < arpeggioLen; i++) {
    arpeggios[i] = readByte(data, pos); pos++;
  }

  // -- Vibrato table data -----------------------------------------------------

  const vibratoPosition = pos;
  const vibratoLen = readUint(data, 38);
  const vibratos = new Int8Array(vibratoLen);
  pos = vibratoPosition;
  for (let i = 0; i < vibratoLen; i++) {
    vibratos[i] = readByte(data, pos); pos++;
  }

  // -- Sample metadata --------------------------------------------------------

  const samples: S2Sample[] = new Array(sampleCount);
  let sampleDataPosition = 0; // running byte offset into sample data block

  for (let i = 0; i < sampleCount; i++) {
    pos += 4; // skip 4 bytes (unused Uint)
    const smpLength  = readUshort(data, pos) << 1; pos += 2;
    const smpLoop    = readUshort(data, pos) << 1; pos += 2;
    const smpRepeat  = readUshort(data, pos) << 1; pos += 2;
    const negStart   = sampleDataPosition + (readUshort(data, pos) << 1); pos += 2;
    const negLen     = readUshort(data, pos) << 1; pos += 2;
    const negSpeed   = readUshort(data, pos); pos += 2;
    const negDir     = readUshort(data, pos); pos += 2;
    const negOffset  = readShort(data, pos); pos += 2;
    const negPos     = readUint(data, pos); pos += 4;
    const negCtr     = readUshort(data, pos); pos += 2;
    pos += 6; // skip 6 bytes
    const smpName    = readString(data, pos, 32); pos += 32;

    samples[i] = {
      name: smpName,
      length: smpLength,
      loop: smpLoop,
      repeat: smpRepeat,
      pointer: sampleDataPosition,
      loopPtr: sampleDataPosition + smpLoop,
      negStart,
      negLen,
      negSpeed,
      negDir,
      negOffset,
      negPos,
      negCtr,
    };
    sampleDataPosition += smpLength;
  }

  // -- Pattern pointer table --------------------------------------------------
  // higher+1 pointers (Uint16 each), mapping pattern index -> row offset in
  // the decoded pattern data array. The S2Player reads (higher+1) values and
  // uses the stream position to calculate absolute offsets.

  const numPointers = higher + 1;
  const pointers = new Uint16Array(numPointers + 1);
  for (let i = 0; i < numPointers; i++) {
    pointers[i] = readUshort(data, pos); pos += 2;
  }

  // -- Pattern data (variable-length encoded) ---------------------------------

  const patternDataStart = pos;
  const patternDataLen = readUint(data, 50);
  const patternRows: S2Row[] = [];
  let rowIdx = 0;
  let pointerJ = 1;

  for (let i = 0; i < patternDataLen; /* i incremented inside */) {
    const row: S2Row = { note: 0, sample: 0, effect: 0, param: 0, speed: 0 };
    const value = readByte(data, pos); pos++; i++;

    if (value === 0) {
      // No note: effect + param follow
      row.effect = readByte(data, pos); pos++; i++;
      row.param = readUbyte(data, pos); pos++; i++;
    } else if (value < 0) {
      // Negative: speed change (bitwise NOT)
      row.speed = ~value;
    } else if (value < 112) {
      // Note value (1-111)
      row.note = value;
      const next = readByte(data, pos); pos++; i++;

      if (next < 0) {
        row.speed = ~next;
      } else if (next < 112) {
        // Sample number
        row.sample = next;
        const next2 = readByte(data, pos); pos++; i++;

        if (next2 < 0) {
          row.speed = ~next2;
        } else {
          row.effect = next2;
          row.param = readUbyte(data, pos); pos++; i++;
        }
      } else {
        // Effect (>= 112)
        row.effect = next;
        row.param = readUbyte(data, pos); pos++; i++;
      }
    } else {
      // Effect only (>= 112)
      row.effect = value;
      row.param = readUbyte(data, pos); pos++; i++;
    }

    patternRows[rowIdx++] = row;

    // Check if the current stream position matches the next pointer offset
    if (pointerJ < numPointers && (patternDataStart + pointers[pointerJ]) === pos) {
      pointers[pointerJ] = rowIdx;
      pointerJ++;
    }
  }
  pointers[pointerJ] = patternRows.length;

  // Align to word boundary after pattern data
  if ((pos & 1) !== 0) pos++;

  // -- Sample PCM data --------------------------------------------------------

  const sampleDataStart = pos;
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const smp = samples[i];
    if (smp.length > 0 && sampleDataStart + smp.pointer + smp.length <= data.length) {
      samplePCMs.push(data.slice(sampleDataStart + smp.pointer, sampleDataStart + smp.pointer + smp.length));
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }

  // -- Resolve track pattern pointers -----------------------------------------
  // Replace raw pattern indices with decoded row offsets

  for (let i = 0; i < trackLen; i++) {
    tracks[i].pattern = pointers[tracks[i].pattern];
  }

  const songLength = length + 1; // S2Player increments length by 1

  // -- Build TrackerSong instruments ------------------------------------------

  const trackerInstruments: InstrumentConfig[] = [];
  const sampleToInstrId = new Map<number, number>();
  let nextInstrId = 1;

  // Create instruments for PCM samples
  for (let i = 0; i < sampleCount; i++) {
    const smp = samples[i];
    const id = nextInstrId++;
    sampleToInstrId.set(i, id);

    if (smp.length > 0 && samplePCMs[i].length > 0) {
      const loopStart = smp.repeat > 2 ? smp.loop : 0;
      const loopEnd = smp.repeat > 2 ? smp.loop + smp.repeat : 0;
      trackerInstruments.push(
        createSamplerInstrument(
          id,
          smp.name || `Sample ${i + 1}`,
          samplePCMs[i],
          64,
          8287,
          loopStart,
          loopEnd
        )
      );
    } else {
      // Empty sample placeholder
      trackerInstruments.push({
        id,
        name: smp.name || `Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // -- Simulate playback to extract pattern data ------------------------------
  // We walk through the track sequence and pattern data, simulating the
  // S2Player's process() loop to produce 64-row patterns for the TrackerSong.

  const PATTERN_LEN = 64; // SidMon II default pattern length
  const trackerPatterns: Pattern[] = [];

  // Voice state for simulation
  interface VoiceState {
    step: S2Step | null;
    patternPtr: number;
    speed: number;         // per-voice row speed counter
    note: number;
    instrument: number;    // instrument index (SidMon)
    instr: S2Instrument;
    sampleIdx: number;     // resolved sample index
    volume: number;
    adsrPos: number;
    sustainCtr: number;
  }

  const voiceStates: VoiceState[] = Array.from({ length: 4 }, () => ({
    step: null,
    patternPtr: 0,
    speed: 0,
    note: 0,
    instrument: 0,
    instr: instruments[0],
    sampleIdx: -1,
    volume: 0,
    adsrPos: 0,
    sustainCtr: 0,
  }));

  let globalSpeed = speedDef;

  for (let trackPos = 0; trackPos < songLength; trackPos++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let patRow = 0; patRow < PATTERN_LEN; patRow++) {
      for (let ch = 0; ch < 4; ch++) {
        const voice = voiceStates[ch];

        let noteTriggered = false;
        let effectType = 0;
        let effectParam = 0;
        let xmNote = 0;
        let instrId = 0;

        // Load step data at pattern start
        if (patRow === 0) {
          const trackIdx = trackPos + ch * songLength;
          if (trackIdx < tracks.length) {
            voice.step = tracks[trackIdx];
            voice.patternPtr = voice.step.pattern;
          }
          voice.speed = 0;
        }

        // Decrement row speed; only read new row data when speed <= 0
        voice.speed--;
        if (voice.speed < 0) {
          const rowData = voice.patternPtr < patternRows.length
            ? patternRows[voice.patternPtr]
            : null;

          if (rowData) {
            voice.patternPtr++;
            voice.speed = rowData.speed;

            if (rowData.note > 0) {
              noteTriggered = true;
              const step = voice.step;
              const transpose = step ? step.transpose : 0;
              const soundTranspose = step ? step.soundTranspose : 0;
              voice.note = rowData.note + transpose;

              if (rowData.sample > 0) {
                voice.instrument = rowData.sample;
                const instrIdx = voice.instrument + soundTranspose;
                if (instrIdx >= 0 && instrIdx < numInstruments) {
                  voice.instr = instruments[instrIdx];
                }

                // Resolve the sample from the wave table
                const waveIdx = voice.instr.wave;
                if (waveIdx < waves.length) {
                  voice.sampleIdx = waves[waveIdx];
                }
              }

              // Map note to XM using period table for accuracy
              xmNote = sidmonNoteToXM(voice.note, 0);

              // Map sample to instrument
              if (voice.sampleIdx >= 0 && sampleToInstrId.has(voice.sampleIdx)) {
                instrId = sampleToInstrId.get(voice.sampleIdx)!;
              }

              // Reset ADSR
              voice.adsrPos = 4;
              voice.volume = 0;
              voice.sustainCtr = 0;
            }

            // Handle effects
            if (rowData.effect) {
              const eff = rowData.effect;
              const param = rowData.param;

              switch (eff) {
                case 0x70: // Arpeggio
                  effectType = 0x00; // XM arpeggio
                  effectParam = param;
                  break;
                case 0x71: // Pitch up
                  effectType = 0x01; // XM portamento up
                  effectParam = param;
                  break;
                case 0x72: // Pitch down
                  effectType = 0x02; // XM portamento down
                  effectParam = param;
                  break;
                case 0x73: // Volume up
                  effectType = 0x0A; // XM volume slide (Axy, x=up)
                  effectParam = (param & 0x0F) << 4;
                  break;
                case 0x74: // Volume down
                  effectType = 0x0A; // XM volume slide (Axy, y=down)
                  effectParam = param & 0x0F;
                  break;
                case 0x75: // Set ADSR attack
                  // No direct XM equivalent -- skip
                  break;
                case 0x76: // Set pattern length
                  // This modifies internal patternLen; we handle it at song level
                  // Could map to pattern break, but skip for simplicity
                  break;
                case 0x7C: // Set volume
                  effectType = 0x0C; // XM set volume
                  effectParam = Math.min(param, 64);
                  break;
                case 0x7F: // Set speed
                  effectType = 0x0F; // XM set speed/tempo
                  effectParam = param & 0x0F;
                  if (effectParam > 0) globalSpeed = effectParam;
                  break;
                default:
                  // Note slide: effect < 0x70 with param != 0 means slide to note
                  if (eff > 0 && eff < 0x70 && param > 0) {
                    effectType = 0x03; // XM tone portamento
                    effectParam = param;
                  }
                  break;
              }
            }
          }
        }

        // Simulate one step of ADSR for volume tracking
        const instr = voice.instr;
        switch (voice.adsrPos) {
          case 4: // Attack
            voice.volume += instr.attackSpeed;
            if (voice.volume >= instr.attackMax) {
              voice.volume = instr.attackMax;
              voice.adsrPos = 3;
            }
            break;
          case 3: // Decay
            if (!instr.decaySpeed) {
              voice.adsrPos = 2;
            } else {
              voice.volume -= instr.decaySpeed;
              if (voice.volume <= instr.decayMin) {
                voice.volume = instr.decayMin;
                voice.adsrPos = 2;
              }
            }
            break;
          case 2: // Sustain
            if (voice.sustainCtr >= instr.sustain) {
              voice.adsrPos = 1;
            } else {
              voice.sustainCtr++;
            }
            break;
          case 1: // Release
            voice.volume -= instr.releaseSpeed;
            if (voice.volume <= instr.releaseMin) {
              voice.volume = instr.releaseMin;
              voice.adsrPos = 0;
            }
            break;
          case 0:
          default:
            break;
        }

        // Build XM volume column (0x10-0x50 range for volume, 0=empty)
        const clampedVol = Math.max(0, Math.min(255, voice.volume));
        const xmVol = noteTriggered ? (0x10 + Math.min(64, clampedVol >> 2)) : 0;

        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: xmVol,
          effTyp: effectType,
          eff: effectParam,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }

    // Emit speed effect on row 0, channel 0 if not already set
    if (trackPos === 0) {
      const cell = channelRows[0][0];
      if (cell.effTyp === 0 && cell.eff === 0) {
        cell.effTyp = 0x0F;
        cell.eff = globalSpeed;
      }
    }

    trackerPatterns.push({
      id: `pattern-${trackPos}`,
      name: `Pattern ${trackPos}`,
      length: PATTERN_LEN,
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
        sourceFormat: 'SIDMON2',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPointers,
        originalInstrumentCount: numInstruments - 1,
      },
    });
  }

  // Fallback: ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: PATTERN_LEN,
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
        rows: Array.from({ length: PATTERN_LEN }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'SIDMON2',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: trackerInstruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speedDef || 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
