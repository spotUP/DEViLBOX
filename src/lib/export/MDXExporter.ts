/**
 * MDX (Sharp X68000) Exporter
 * Converts TrackerSong pattern data to native MDX format
 *
 * MDX is a note-data format (not register dumps) native to the Sharp X68000.
 * It encodes MML-style commands for the YM2151 (OPM) FM synth chip.
 *
 * File structure:
 *   - Title string (null-terminated ASCII)
 *   - PDX filename (null-terminated, can be empty)
 *   - 0x0D 0x0A line ending
 *   - Channel offset table (8-9 × uint16 LE)
 *   - Channel MML command sequences
 *
 * Supports 8 FM channels (A-H) plus optional ADPCM channel (P).
 */

import type { TrackerSong } from '../../engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';

// MML command bytes
const MDX_CMD = {
  REST: 0x80,
  // Notes: 0x81-0xDF (value = octave*12 + semitone + 0x81)
  NOTE_MIN: 0x81,
  NOTE_MAX: 0xDF,

  SET_TEMPO: 0xFF,
  SET_VOICE: 0xFD,
  SET_PAN: 0xFC,
  SET_VOLUME: 0xFB,
  STACCATO: 0xF8,
  KEY_ON_DELAY: 0xF2,
  LOOP_BACK: 0xE9,
  OPM_WRITE: 0xFE,
} as const;

// YM2151 operator index mapping: M1=0, C1=1, M2=2, C2=3
const OPM_OP_OFFSETS = [0, 2, 1, 3]; // Slot order: M1, M2, C1, C2

// OPM register bases per operator parameter
const OPM_REG = {
  RL_FB_CON: 0x20,
  DT1_MUL: 0x40,
  TL: 0x60,
  KS_AR: 0x80,
  AMS_D1R: 0xA0,
  DT2_D2R: 0xC0,
  D1L_RR: 0xE0,
} as const;

const MAX_FM_CHANNELS = 8;
const MAX_CHANNELS_WITH_ADPCM = 9;

export interface MDXExportOptions {
  title?: string;
  pdxFilename?: string;
  loopEnabled?: boolean;
  ticksPerRow?: number;
}

/**
 * Check whether a song can be exported to MDX
 * Returns true if ≤ 9 channels and instruments are OPM-compatible
 */
export function canExportMDX(song: TrackerSong): boolean {
  if (song.numChannels > MAX_CHANNELS_WITH_ADPCM) return false;

  // Check instruments are OPM-compatible (FM-based synths)
  for (const inst of song.instruments) {
    if (!isOPMCompatible(inst)) return false;
  }
  return true;
}

/**
 * Export TrackerSong to MDX format
 */
export function exportToMDX(
  song: TrackerSong,
  options: MDXExportOptions = {}
): Uint8Array {
  const title = options.title || song.name || 'DEViLBOX Export';
  const pdxFilename = options.pdxFilename || '';
  const ticksPerRow = options.ticksPerRow || 6;
  const numChannels = Math.min(song.numChannels, MAX_CHANNELS_WITH_ADPCM);

  // --- Build header ---
  const header = buildHeader(title, pdxFilename);

  // --- Build per-channel data ---
  const channelData: Uint8Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(
      buildChannelData(song, ch, ticksPerRow, options.loopEnabled && ch === 0)
    );
  }

  // Pad to at least 8 channels (empty channels get zero-length data)
  while (channelData.length < MAX_FM_CHANNELS) {
    channelData.push(new Uint8Array(0));
  }

  // --- Compute offset table ---
  const offsetTableSize = numChannels * 2;
  // Offsets are relative to the start of the tone data area (right after offset table)
  let runningOffset = 0;
  const offsets: number[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    offsets.push(runningOffset);
    runningOffset += channelData[ch].length;
  }

  // --- Assemble final file ---
  const toneDataSize = runningOffset;
  const totalSize = header.length + offsetTableSize + toneDataSize;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // Write header
  out.set(header, 0);
  let pos = header.length;

  // Write offset table (uint16 LE)
  for (let ch = 0; ch < numChannels; ch++) {
    view.setUint16(pos, offsets[ch], true);
    pos += 2;
  }

  // Write channel data
  for (let ch = 0; ch < numChannels; ch++) {
    out.set(channelData[ch], pos);
    pos += channelData[ch].length;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the MDX file header: title + null + PDX filename + null + CR LF */
function buildHeader(title: string, pdxFilename: string): Uint8Array {
  const bytes: number[] = [];

  // Title (ASCII, null-terminated)
  for (let i = 0; i < title.length; i++) {
    bytes.push(title.charCodeAt(i) & 0x7F);
  }
  bytes.push(0x00);

  // PDX filename (ASCII, null-terminated)
  for (let i = 0; i < pdxFilename.length; i++) {
    bytes.push(pdxFilename.charCodeAt(i) & 0x7F);
  }
  bytes.push(0x00);

  // Line ending
  bytes.push(0x0D, 0x0A);

  return new Uint8Array(bytes);
}

/** Build MML command stream for one channel */
function buildChannelData(
  song: TrackerSong,
  ch: number,
  ticksPerRow: number,
  emitLoop: boolean | undefined
): Uint8Array {
  const cmds: number[] = [];
  const patterns = expandSongOrder(song);

  // --- Preamble: tempo, voice, volume ---
  emitTempo(cmds, song.initialBPM);
  emitVoice(cmds, ch, song, patterns);
  emitVolume(cmds, 15); // Max volume
  emitPan(cmds, 0xC0); // Both speakers

  // Emit OPM register writes for the channel's instrument patch
  emitVoiceRegisters(cmds, ch, song, patterns);

  // --- Walk rows ---
  let pendingDuration = 0;
  let lastWasNote = false;

  for (const pattern of patterns) {
    if (ch >= pattern.channels.length) {
      // Channel doesn't exist in this pattern — emit rests
      pendingDuration += pattern.length * ticksPerRow;
      continue;
    }

    const rows = pattern.channels[ch].rows;
    for (let row = 0; row < pattern.length; row++) {
      const cell: TrackerCell | undefined = rows[row];

      if (!cell || cell.note === 0) {
        // Empty row — accumulate duration
        pendingDuration += ticksPerRow;
        continue;
      }

      if (cell.note === 97) {
        // Note-off — flush any held note, then start accumulating rest
        if (lastWasNote && pendingDuration > 0) {
          // Previous note duration already flushed
        }
        flushDuration(cmds, lastWasNote, pendingDuration);
        pendingDuration = ticksPerRow;
        lastWasNote = false;
        continue;
      }

      // Note-on (1-96)
      flushDuration(cmds, lastWasNote, pendingDuration);

      // Instrument change?
      if (cell.instrument > 0) {
        const voiceIdx = cell.instrument - 1;
        cmds.push(MDX_CMD.SET_VOICE, voiceIdx & 0xFF);
      }

      // Volume column (rough map: XM 0x10-0x50 → MDX 0-15)
      if (cell.volume >= 0x10 && cell.volume <= 0x50) {
        const mdxVol = Math.round(((cell.volume - 0x10) / 0x40) * 15);
        emitVolume(cmds, mdxVol);
      }

      // Encode note byte
      const noteVal = xmNoteToMDX(cell.note);
      cmds.push(noteVal);

      pendingDuration = ticksPerRow;
      lastWasNote = true;
    }
  }

  // Flush trailing duration
  flushDuration(cmds, lastWasNote, pendingDuration);

  // Loop marker
  if (emitLoop) {
    cmds.push(MDX_CMD.LOOP_BACK);
  }

  return new Uint8Array(cmds);
}

/** Flush accumulated duration for the current note or rest */
function flushDuration(cmds: number[], isNote: boolean, ticks: number): void {
  if (ticks <= 0) return;

  if (!isNote && cmds.length > 0) {
    // Emit rest
    while (ticks > 0) {
      const dur = Math.min(ticks, 255);
      cmds.push(MDX_CMD.REST, dur);
      ticks -= dur;
    }
  } else if (isNote) {
    // Duration byte follows the note that was already pushed
    // Clamp to 1-255 (split if longer)
    const dur = Math.min(ticks, 255);
    cmds.push(dur);
    ticks -= dur;
    // Any overflow becomes rest
    while (ticks > 0) {
      const d = Math.min(ticks, 255);
      cmds.push(MDX_CMD.REST, d);
      ticks -= d;
    }
  }
}

/**
 * Convert XM note value (1-96) to MDX note byte.
 * XM: 1=C-0, 2=C#0, … 12=B-0, 13=C-1, …
 * MDX: byte = octave*12 + semitone + 0x81
 */
function xmNoteToMDX(note: number): number {
  const n = note - 1; // 0-based: 0=C-0
  const val = n + 0x81;
  return Math.min(val, MDX_CMD.NOTE_MAX);
}

/** BPM → MDX tempo byte: tempo_byte = 256 - 78125 / (16 * BPM) */
function bpmToTempoByte(bpm: number): number {
  if (bpm <= 0) bpm = 120;
  const raw = Math.round(256 - 78125 / (16 * bpm));
  return Math.max(0, Math.min(255, raw));
}

function emitTempo(cmds: number[], bpm: number): void {
  cmds.push(MDX_CMD.SET_TEMPO, bpmToTempoByte(bpm));
}

function emitVoice(
  cmds: number[],
  ch: number,
  _song: TrackerSong,
  patterns: Pattern[]
): void {
  // Find the first instrument used on this channel
  const instIdx = findFirstInstrument(ch, patterns);
  cmds.push(MDX_CMD.SET_VOICE, instIdx & 0xFF);
}

function emitVolume(cmds: number[], vol: number): void {
  cmds.push(MDX_CMD.SET_VOLUME, Math.max(0, Math.min(15, vol)));
}

function emitPan(cmds: number[], pan: number): void {
  cmds.push(MDX_CMD.SET_PAN, pan & 0xFF);
}

/** Emit OPM register writes (0xFE) for the FM voice patch on a channel */
function emitVoiceRegisters(
  cmds: number[],
  ch: number,
  song: TrackerSong,
  patterns: Pattern[]
): void {
  const instIdx = findFirstInstrument(ch, patterns);
  const inst = song.instruments[instIdx];
  if (!inst) return;

  // Extract OPM-compatible params (furnace FM or fallback defaults)
  const patch = extractOPMPatch(inst);
  if (!patch) return;

  const chReg = ch & 0x07; // Channel 0-7

  // Connection / feedback / panning
  const rlFbCon = 0xC0 | ((patch.feedback & 0x07) << 3) | (patch.algorithm & 0x07);
  cmds.push(MDX_CMD.OPM_WRITE, OPM_REG.RL_FB_CON + chReg, rlFbCon);

  // Per-operator registers
  for (let opIdx = 0; opIdx < 4; opIdx++) {
    const op = patch.operators[opIdx];
    const slot = OPM_OP_OFFSETS[opIdx] * 8;

    cmds.push(
      MDX_CMD.OPM_WRITE,
      OPM_REG.DT1_MUL + chReg + slot,
      ((op.dt1 & 0x07) << 4) | (op.mul & 0x0F)
    );
    cmds.push(MDX_CMD.OPM_WRITE, OPM_REG.TL + chReg + slot, op.tl & 0x7F);
    cmds.push(
      MDX_CMD.OPM_WRITE,
      OPM_REG.KS_AR + chReg + slot,
      ((op.ks & 0x03) << 6) | (op.ar & 0x1F)
    );
    cmds.push(
      MDX_CMD.OPM_WRITE,
      OPM_REG.AMS_D1R + chReg + slot,
      ((op.amsEn & 0x01) << 7) | (op.d1r & 0x1F)
    );
    cmds.push(
      MDX_CMD.OPM_WRITE,
      OPM_REG.DT2_D2R + chReg + slot,
      ((op.dt2 & 0x03) << 6) | (op.d2r & 0x1F)
    );
    cmds.push(
      MDX_CMD.OPM_WRITE,
      OPM_REG.D1L_RR + chReg + slot,
      ((op.d1l & 0x0F) << 4) | (op.rr & 0x0F)
    );
  }
}

// ---------------------------------------------------------------------------
// Patch extraction
// ---------------------------------------------------------------------------

interface OPMOperator {
  dt1: number;
  mul: number;
  tl: number;
  ks: number;
  ar: number;
  amsEn: number;
  d1r: number;
  dt2: number;
  d2r: number;
  d1l: number;
  rr: number;
}

interface OPMPatch {
  algorithm: number;
  feedback: number;
  operators: [OPMOperator, OPMOperator, OPMOperator, OPMOperator];
}

/** Extract an OPM patch from an InstrumentConfig, or return a sine default */
function extractOPMPatch(inst: InstrumentConfig): OPMPatch {
  // Try Furnace FM operators first
  const fc = inst.furnace;
  if (fc && fc.operators && fc.operators.length >= 4) {
    return {
      algorithm: fc.algorithm ?? 0,
      feedback: fc.feedback ?? 0,
      operators: [0, 1, 2, 3].map((i) => {
        const op = fc.operators[i];
        return {
          dt1: op.dt ?? 0,
          mul: op.mult ?? 1,
          tl: op.tl ?? (i === 3 ? 0 : 127), // Carrier audible, modulators silent
          ks: op.rs ?? 0,
          ar: op.ar ?? 31,
          amsEn: op.am ? 1 : 0,
          d1r: op.dr ?? 0,
          dt2: op.dt2 ?? 0,
          d2r: op.d2r ?? 0,
          d1l: op.sl ?? 0,
          rr: op.rr ?? 7,
        };
      }) as [OPMOperator, OPMOperator, OPMOperator, OPMOperator],
    };
  }

  // Default: simple sine voice (algorithm 7 = all carriers)
  const defaultOp: OPMOperator = {
    dt1: 0, mul: 1, tl: 127, ks: 0,
    ar: 31, amsEn: 0, d1r: 0, dt2: 0, d2r: 0, d1l: 0, rr: 7,
  };
  const carrierOp: OPMOperator = { ...defaultOp, tl: 0 };
  return {
    algorithm: 7,
    feedback: 0,
    operators: [defaultOp, defaultOp, defaultOp, carrierOp],
  };
}

/** Check if an instrument is OPM-compatible */
function isOPMCompatible(inst: InstrumentConfig): boolean {
  // Furnace FM instruments, chip synths, and basic oscillator types are fine
  if (inst.furnace) return true;
  if (inst.chipSynth) return true;
  // Allow generic synth types — they get a default OPM patch
  if (inst.type === 'synth') return true;
  // Sample-based instruments are not directly OPM-compatible
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
