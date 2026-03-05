/**
 * PMD (Professional Music Driver) Exporter
 * Converts TrackerSong pattern data to PMD binary format for the PC-98 YM2608 (OPNA)
 *
 * PMD is a note-data MML format native to NEC PC-9801 / PC-8801.
 * It encodes MML-style commands for the YM2608 (OPNA) with:
 *   - 6 FM channels (A-F)
 *   - 3 SSG/PSG channels (G-I)
 *   - 1 ADPCM channel (J)
 *   - 1 Rhythm channel (K)
 *
 * File structure:
 *   - Header: "PMD" magic + version + channel count + tempo
 *   - Channel offset table (11 × uint16 LE, relative to data start)
 *   - Per-channel MML command streams
 */

import type { RegisterWrite } from './VGMExporter';
import type { TrackerSong } from '../../engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';

// Suppress unused import warning — RegisterWrite is re-exported for consumers
void (undefined as unknown as RegisterWrite);

// PMD MML command bytes
const PMD_CMD = {
  REST: 0x80,
  NOTE_MIN: 0x81,
  NOTE_MAX: 0xDF,

  SET_TEMPO: 0xFF,
  OPN_WRITE: 0xFE,
  SET_VOICE: 0xFD,
  SET_VOLUME: 0xFC,
  SET_PAN: 0xF4,
  DETUNE: 0xFA,
  LFO: 0xF6,
  PORTAMENTO: 0xF3,
  LOOP_START: 0xE6,
  LOOP_END: 0xE7,
} as const;

// PMD header layout
const PMD_MAGIC = [0x50, 0x4D, 0x44]; // "PMD"
const PMD_VERSION = 0x40; // Version 4.x

// Channel layout
const FM_CHANNELS = 6;
const SSG_CHANNELS = 3;
const ADPCM_CHANNELS = 1;
const RHYTHM_CHANNELS = 1;
const TOTAL_CHANNELS = FM_CHANNELS + SSG_CHANNELS + ADPCM_CHANNELS + RHYTHM_CHANNELS; // 11

// OPN register bases per operator parameter (YM2608 shares OPN2 register map)
const OPN_REG = {
  DT_ML: 0x30,
  TL: 0x40,
  KS_AR: 0x50,
  DR: 0x60,     // AM-EN + D1R (decay rate)
  SR: 0x70,     // D2R (sustain rate)
  SL_RR: 0x80,
  FB_ALG: 0xB0,
} as const;

// OPN operator slot order: Op1, Op2, Op3, Op4
const OPN_OP_OFFSETS = [0, 8, 4, 12]; // Register offsets for each operator slot

// Chips that support PMD export
const PMD_SUPPORTED_CHIPS = new Set([
  FurnaceChipType.OPNA,  // YM2608 — native
  FurnaceChipType.OPN,   // YM2203 — subset (FM + SSG only)
  FurnaceChipType.AY,    // AY-3-8910 — SSG only
]);

export interface PMDExportOptions {
  title?: string;
  ticksPerRow?: number;
  loopEnabled?: boolean;
}

/**
 * Check whether a song can be exported to PMD format.
 * Returns true if the song has OPNA/OPN/AY-compatible instruments.
 */
export function canExportPMD(song: TrackerSong): boolean {
  if (song.instruments.length === 0) return false;

  // At least one instrument must be OPN-compatible
  return song.instruments.some(inst => isOPNCompatible(inst));
}

/**
 * Export TrackerSong to PMD binary format
 */
export function exportToPMD(
  song: TrackerSong,
  options: PMDExportOptions = {}
): ArrayBuffer {
  const ticksPerRow = options.ticksPerRow || 6;
  const numChannels = Math.min(song.numChannels, TOTAL_CHANNELS);

  // --- Build per-channel MML data ---
  const channelData: Uint8Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(
      buildChannelData(song, ch, ticksPerRow, options.loopEnabled ?? false)
    );
  }

  // Pad to full 11 channels (empty channels emit a single rest)
  while (channelData.length < TOTAL_CHANNELS) {
    channelData.push(new Uint8Array([PMD_CMD.REST, 1]));
  }

  // --- Header ---
  // PMD header: magic(3) + version(1) + channelCount(1) + tempo(1) = 6 bytes
  const headerSize = 6;
  const offsetTableSize = TOTAL_CHANNELS * 2; // 11 × uint16 LE
  const dataStart = headerSize + offsetTableSize;

  // Compute channel offsets (relative to data start)
  let runningOffset = 0;
  const offsets: number[] = [];
  for (let ch = 0; ch < TOTAL_CHANNELS; ch++) {
    offsets.push(runningOffset);
    runningOffset += channelData[ch].length;
  }

  const toneDataSize = runningOffset;
  const totalSize = dataStart + toneDataSize;

  // --- Assemble binary ---
  const buffer = new ArrayBuffer(totalSize);
  const out = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Write header
  out[0] = PMD_MAGIC[0]; // 'P'
  out[1] = PMD_MAGIC[1]; // 'M'
  out[2] = PMD_MAGIC[2]; // 'D'
  out[3] = PMD_VERSION;
  out[4] = numChannels & 0xFF;
  out[5] = bpmToTempoByte(song.initialBPM);

  // Write offset table
  let pos = headerSize;
  for (let ch = 0; ch < TOTAL_CHANNELS; ch++) {
    view.setUint16(pos, offsets[ch], true);
    pos += 2;
  }

  // Write channel data
  for (let ch = 0; ch < TOTAL_CHANNELS; ch++) {
    out.set(channelData[ch], dataStart + offsets[ch]);
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build MML command stream for one channel */
function buildChannelData(
  song: TrackerSong,
  ch: number,
  ticksPerRow: number,
  emitLoop: boolean
): Uint8Array {
  const cmds: number[] = [];
  const patterns = expandSongOrder(song);
  const isFM = ch < FM_CHANNELS;

  // --- Preamble: tempo, voice, volume, pan ---
  emitTempo(cmds, song.initialBPM);
  emitVoice(cmds, ch, song, patterns);
  emitVolume(cmds, isFM ? 127 : 15);
  if (isFM) {
    emitPan(cmds, 0xC0); // Both speakers
  }

  // Emit OPN register writes for FM voice patches
  if (isFM) {
    emitVoiceRegisters(cmds, ch, song, patterns);
  }

  // Loop start marker
  if (emitLoop) {
    cmds.push(PMD_CMD.LOOP_START);
  }

  // --- Walk rows ---
  let pendingDuration = 0;
  let lastWasNote = false;

  for (const pattern of patterns) {
    if (ch >= pattern.channels.length) {
      pendingDuration += pattern.length * ticksPerRow;
      continue;
    }

    const rows = pattern.channels[ch].rows;
    for (let row = 0; row < pattern.length; row++) {
      const cell: TrackerCell | undefined = rows[row];

      if (!cell || cell.note === 0) {
        pendingDuration += ticksPerRow;
        continue;
      }

      if (cell.note === 97) {
        // Note-off
        flushDuration(cmds, lastWasNote, pendingDuration);
        pendingDuration = ticksPerRow;
        lastWasNote = false;
        continue;
      }

      // Note-on (1-96)
      flushDuration(cmds, lastWasNote, pendingDuration);

      // Instrument change
      if (cell.instrument > 0) {
        const voiceIdx = cell.instrument - 1;
        cmds.push(PMD_CMD.SET_VOICE, voiceIdx & 0xFF);
      }

      // Volume column (XM 0x10-0x50 → PMD volume)
      if (cell.volume >= 0x10 && cell.volume <= 0x50) {
        if (isFM) {
          const vol = Math.round(((cell.volume - 0x10) / 0x40) * 127);
          emitVolume(cmds, vol);
        } else {
          const vol = Math.round(((cell.volume - 0x10) / 0x40) * 15);
          emitVolume(cmds, vol);
        }
      }

      // Effect column → PMD MML commands
      if (cell.effTyp > 0) {
        emitPMDEffect(cmds, cell.effTyp, cell.eff, isFM);
      }

      // Encode note
      const noteVal = xmNoteToPMD(cell.note);
      cmds.push(noteVal);

      pendingDuration = ticksPerRow;
      lastWasNote = true;
    }
  }

  // Flush trailing duration
  flushDuration(cmds, lastWasNote, pendingDuration);

  // Loop end marker
  if (emitLoop) {
    cmds.push(PMD_CMD.LOOP_END);
  }

  return new Uint8Array(cmds);
}

/** Flush accumulated duration for the current note or rest */
function flushDuration(cmds: number[], isNote: boolean, ticks: number): void {
  if (ticks <= 0) return;

  if (!isNote) {
    // Emit rest(s)
    while (ticks > 0) {
      const dur = Math.min(ticks, 255);
      cmds.push(PMD_CMD.REST, dur);
      ticks -= dur;
    }
  } else {
    // Duration byte follows the note already pushed
    const dur = Math.min(ticks, 255);
    cmds.push(dur);
    ticks -= dur;
    // Overflow becomes rest
    while (ticks > 0) {
      const d = Math.min(ticks, 255);
      cmds.push(PMD_CMD.REST, d);
      ticks -= d;
    }
  }
}

/**
 * Convert XM note value (1-96) to PMD note byte.
 * XM: 1=C-0, 2=C#0, … 12=B-0, 13=C-1, …
 * PMD: byte = octave*12 + semitone + 0x81
 */
function xmNoteToPMD(note: number): number {
  const n = note - 1; // 0-based: 0=C-0
  const val = n + 0x81;
  return Math.min(val, PMD_CMD.NOTE_MAX);
}

/** BPM → PMD tempo byte (matches OPNA timer-B formula) */
function bpmToTempoByte(bpm: number): number {
  if (bpm <= 0) bpm = 120;
  // PMD tempo byte: 256 - (78125 / (16 * BPM))
  const raw = Math.round(256 - 78125 / (16 * bpm));
  return Math.max(0, Math.min(255, raw));
}

function emitTempo(cmds: number[], bpm: number): void {
  cmds.push(PMD_CMD.SET_TEMPO, bpmToTempoByte(bpm));
}

function emitVoice(
  cmds: number[],
  ch: number,
  _song: TrackerSong,
  patterns: Pattern[]
): void {
  const instIdx = findFirstInstrument(ch, patterns);
  cmds.push(PMD_CMD.SET_VOICE, instIdx & 0xFF);
}

function emitVolume(cmds: number[], vol: number): void {
  cmds.push(PMD_CMD.SET_VOLUME, vol & 0xFF);
}

function emitPan(cmds: number[], pan: number): void {
  cmds.push(PMD_CMD.SET_PAN, pan & 0xFF);
}

/**
 * Map XM effect type + param to PMD MML commands.
 * PMD supports: volume, panning, tempo, detune, LFO (vibrato), portamento.
 */
function emitPMDEffect(cmds: number[], effTyp: number, eff: number, isFM: boolean): void {
  switch (effTyp) {
    case 0x1: // Portamento up — positive detune
      if (eff > 0) {
        const offset = eff * 4;
        cmds.push(PMD_CMD.DETUNE, offset & 0xFF, (offset >> 8) & 0xFF);
      }
      break;
    case 0x2: // Portamento down — negative detune
      if (eff > 0) {
        const offset = -(eff * 4);
        cmds.push(PMD_CMD.DETUNE, offset & 0xFF, (offset >> 8) & 0xFF);
      }
      break;
    case 0x3: // Tone portamento
      if (eff > 0) {
        cmds.push(PMD_CMD.PORTAMENTO, 0x00, eff & 0xFF);
      }
      break;
    case 0x4: { // Vibrato — PMD LFO (0xF6 + delay + speed + depth + waveform)
      const speed = (eff >> 4) & 0x0F;
      const depth = eff & 0x0F;
      if (speed > 0 || depth > 0) {
        cmds.push(PMD_CMD.LFO,
          0,                                // delay
          Math.max(1, 16 - speed),          // speed
          Math.max(1, depth * 8),           // depth
          0,                                // waveform (0=sine)
        );
      }
      break;
    }
    case 0x8: // Set panning
      if (eff < 64) cmds.push(PMD_CMD.SET_PAN, 0x80);
      else if (eff < 192) cmds.push(PMD_CMD.SET_PAN, 0xC0);
      else cmds.push(PMD_CMD.SET_PAN, 0x40);
      break;
    case 0xC: { // Set volume
      const maxVol = isFM ? 127 : 15;
      const vol = Math.round((Math.min(64, eff) / 64) * maxVol);
      cmds.push(PMD_CMD.SET_VOLUME, vol);
      break;
    }
    case 0xF: // Set speed/tempo
      if (eff >= 32) {
        cmds.push(PMD_CMD.SET_TEMPO, bpmToTempoByte(eff));
      }
      break;
  }
}

/** Emit OPN register writes (0xFE) for the FM voice patch on a channel */
function emitVoiceRegisters(
  cmds: number[],
  ch: number,
  song: TrackerSong,
  patterns: Pattern[]
): void {
  const instIdx = findFirstInstrument(ch, patterns);
  const inst = song.instruments[instIdx];
  if (!inst) return;

  const patch = extractOPNPatch(inst);
  if (!patch) return;

  const chReg = ch % 3; // OPN channel within port (0-2)

  // Feedback / algorithm
  const fbAlg = ((patch.feedback & 0x07) << 3) | (patch.algorithm & 0x07);
  cmds.push(PMD_CMD.OPN_WRITE, OPN_REG.FB_ALG + chReg, fbAlg);

  // Per-operator registers
  for (let opIdx = 0; opIdx < 4; opIdx++) {
    const op = patch.operators[opIdx];
    const slot = OPN_OP_OFFSETS[opIdx];

    // DT/ML
    cmds.push(
      PMD_CMD.OPN_WRITE,
      OPN_REG.DT_ML + chReg + slot,
      ((op.dt & 0x07) << 4) | (op.mul & 0x0F)
    );
    // TL
    cmds.push(
      PMD_CMD.OPN_WRITE,
      OPN_REG.TL + chReg + slot,
      op.tl & 0x7F
    );
    // KS/AR
    cmds.push(
      PMD_CMD.OPN_WRITE,
      OPN_REG.KS_AR + chReg + slot,
      ((op.ks & 0x03) << 6) | (op.ar & 0x1F)
    );
    // DR (AM-EN + D1R)
    cmds.push(
      PMD_CMD.OPN_WRITE,
      OPN_REG.DR + chReg + slot,
      ((op.amEn & 0x01) << 7) | (op.dr & 0x1F)
    );
    // SR (D2R / sustain rate)
    cmds.push(
      PMD_CMD.OPN_WRITE,
      OPN_REG.SR + chReg + slot,
      op.sr & 0x1F
    );
    // SL/RR
    cmds.push(
      PMD_CMD.OPN_WRITE,
      OPN_REG.SL_RR + chReg + slot,
      ((op.sl & 0x0F) << 4) | (op.rr & 0x0F)
    );
  }
}

// ---------------------------------------------------------------------------
// OPN patch extraction
// ---------------------------------------------------------------------------

interface OPNOperator {
  dt: number;
  mul: number;
  tl: number;
  ks: number;
  ar: number;
  amEn: number;
  dr: number;
  sr: number;
  sl: number;
  rr: number;
}

interface OPNPatch {
  algorithm: number;
  feedback: number;
  operators: [OPNOperator, OPNOperator, OPNOperator, OPNOperator];
}

/** Extract an OPN patch from an InstrumentConfig, or return a sine default */
function extractOPNPatch(inst: InstrumentConfig): OPNPatch {
  const fc = inst.furnace;
  if (fc && fc.operators && fc.operators.length >= 4) {
    return {
      algorithm: fc.algorithm ?? 0,
      feedback: fc.feedback ?? 0,
      operators: [0, 1, 2, 3].map((i) => {
        const op = fc.operators[i];
        return {
          dt: op.dt ?? 0,
          mul: op.mult ?? 1,
          tl: op.tl ?? (i === 3 ? 0 : 127),
          ks: op.rs ?? 0,
          ar: op.ar ?? 31,
          amEn: op.am ? 1 : 0,
          dr: op.dr ?? 0,
          sr: op.d2r ?? 0,
          sl: op.sl ?? 0,
          rr: op.rr ?? 7,
        };
      }) as [OPNOperator, OPNOperator, OPNOperator, OPNOperator],
    };
  }

  // Default: simple sine voice (algorithm 7 = all carriers)
  const defaultOp: OPNOperator = {
    dt: 0, mul: 1, tl: 127, ks: 0,
    ar: 31, amEn: 0, dr: 0, sr: 0, sl: 0, rr: 7,
  };
  const carrierOp: OPNOperator = { ...defaultOp, tl: 0 };
  return {
    algorithm: 7,
    feedback: 0,
    operators: [defaultOp, defaultOp, defaultOp, carrierOp],
  };
}

/** Check if an instrument is OPN-compatible */
function isOPNCompatible(inst: InstrumentConfig): boolean {
  if (inst.furnace) return true;
  if (inst.chipSynth) return true;
  if (inst.type === 'synth') return true;
  if (inst.type === 'sample' && inst.sample?.audioBuffer) return false;
  return true;
}

/** Expand song order into a flat list of patterns */
function expandSongOrder(song: TrackerSong): Pattern[] {
  const result: Pattern[] = [];
  const positions = song.songPositions.slice(0, song.songLength);
  for (const pos of positions) {
    if (pos >= 0 && pos < song.patterns.length) {
      result.push(song.patterns[pos]);
    }
  }
  return result.length > 0 ? result : song.patterns.slice(0, 1);
}

/** Find the 0-based instrument index first used on a channel */
function findFirstInstrument(ch: number, patterns: Pattern[]): number {
  for (const pat of patterns) {
    if (ch >= pat.channels.length) continue;
    for (const cell of pat.channels[ch].rows) {
      if (cell && cell.instrument > 0) {
        return cell.instrument - 1; // XM is 1-indexed
      }
    }
  }
  return 0;
}

// Re-export chip set for use by callers checking compatibility
export { PMD_SUPPORTED_CHIPS };
