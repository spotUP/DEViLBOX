/**
 * chipRamEncoders.ts — Binary encoders for writing instrument parameters
 * back into UADE chip RAM.
 *
 * These functions produce the native binary format that UADE's replayer expects
 * so that knob changes in the UI take effect during live playback.
 */

import type { FCConfig, SoundMonConfig } from '@/types/instrument';

// ── FC Vol-Envelope Opcode Encoder ─────────────────────────────────────────────
//
// FC vol macro layout (64 bytes):
//   [0]      volSpeed (ticks per step for direct values)
//   [1]      freqMacroIdx
//   [2]      vibSpeed
//   [3]      vibDepth
//   [4]      vibDelay
//   [5..63]  vol envelope opcodes (59 bytes max)
//
// Opcodes:
//   0x00-0xDF  Direct volume (set volume = byte value, max 64)
//   0xE0 +off  Loop to absolute offset (off & 0x3F)
//   0xE1       End (hold current volume forever)
//   0xE8 +cnt  Sustain (pause for cnt ticks)
//   0xEA +spd +dur  Volume slide (speed is signed int8, applied every other tick)

/**
 * Encode FCConfig ADSR parameters into FC vol-envelope opcodes.
 * Returns a Uint8Array of up to 59 bytes for positions [5..63] of the vol macro.
 *
 * Envelope shape:
 *   Attack:  0 → atkVolume  over atkLength ticks
 *   Decay:   atkVolume → decVolume  over decLength ticks
 *   Sustain: hold at sustVolume (with transition from decVolume if different)
 *   Release: sustVolume → 0  over relLength ticks
 *   End:     vol=0, 0xE1
 */
export function encodeFCVolEnvelope(cfg: FCConfig): Uint8Array {
  const buf = new Uint8Array(59);
  let pos = 0;

  const volSpeed = Math.max(1, cfg.synthSpeed ?? 1);
  const atkVol   = Math.min(64, Math.max(0, cfg.atkVolume ?? 0));
  const decVol   = Math.min(64, Math.max(0, cfg.decVolume ?? 0));
  const susVol   = Math.min(64, Math.max(0, cfg.sustVolume ?? 0));
  const atkLen   = Math.max(0, cfg.atkLength ?? 0);
  const decLen   = Math.max(0, cfg.decLength ?? 0);
  const relLen   = Math.max(0, cfg.relLength ?? 0);

  // Attack: 0 → atkVol
  pos = encodeRamp(buf, pos, 0, atkVol, atkLen, volSpeed);

  // Ensure we hit exact attack volume
  if (pos < 57 && atkVol > 0) {
    buf[pos++] = atkVol;
  }

  // Decay: atkVol → decVol
  if (decLen > 0 && atkVol !== decVol) {
    pos = encodeRamp(buf, pos, atkVol, decVol, decLen, volSpeed);
  }

  // Transition to sustain volume if different from decay target
  if (pos < 57 && decVol !== susVol) {
    buf[pos++] = susVol;
  }

  // Sustain: hold at sustVolume
  if (pos < 56) {
    buf[pos++] = susVol;
    buf[pos++] = 0xE8; // sustain opcode
    buf[pos++] = 0xFF; // hold for 255 ticks (max)
  }

  // Release: sustVol → 0
  if (relLen > 0 && susVol > 0) {
    pos = encodeRamp(buf, pos, susVol, 0, relLen, volSpeed);
  }

  // End
  if (pos < 58) buf[pos++] = 0;    // vol=0
  if (pos < 59) buf[pos++] = 0xE1; // end marker

  return buf.subarray(0, pos);
}

/**
 * Encode a volume ramp (ascending or descending) into the opcode buffer.
 * Uses direct volume values for short ramps (≤20 steps), volume slide for long.
 */
function encodeRamp(
  buf: Uint8Array,
  pos: number,
  fromVol: number,
  toVol: number,
  durationTicks: number,
  volSpeed: number,
): number {
  if (durationTicks <= 0 || fromVol === toVol) return pos;

  const steps = Math.max(1, Math.round(durationTicks / volSpeed));

  if (steps <= 20 && pos + steps < 56) {
    // Direct volume values — one per step
    for (let i = 1; i <= steps && pos < 56; i++) {
      const v = Math.round(fromVol + ((toVol - fromVol) * i) / steps);
      buf[pos++] = Math.max(0, Math.min(64, v));
    }
  } else if (pos + 4 < 56) {
    // Volume slide: [0xEA, speed(signed), duration]
    // Slide applies every other tick, so effective change = speed * ceil(duration/2)
    // We want: speed * ceil(duration/2) = (toVol - fromVol)
    const delta = toVol - fromVol;
    const halfDur = Math.max(1, Math.ceil(durationTicks / 2));
    let speed = Math.round(delta / halfDur);
    // Ensure minimum speed of ±1 for non-zero deltas
    if (speed === 0) speed = delta > 0 ? 1 : -1;
    // Clamp to signed byte range
    speed = Math.max(-128, Math.min(127, speed));

    buf[pos++] = 0xEA;
    buf[pos++] = speed < 0 ? (speed + 256) & 0xFF : speed & 0xFF;
    buf[pos++] = Math.min(255, durationTicks) & 0xFF;
  }

  return pos;
}


// ── SoundMon ADSR Volume Sequence Encoder ──────────────────────────────────────
//
// SoundMon stores ADSR as a sequence of unsigned volume bytes in the synth table
// data region. The instrument header points to this data:
//   +5: adsrTable index (raw byte << 6 = offset into synth table data)
//   +6-7: adsrLen (uint16 BE) = max sequence length
//   +8: adsrSpeed = playback rate
//
// The UADE replayer steps through these bytes at adsrSpeed rate.
// Each byte is a target volume value (0-64).

/**
 * Encode SoundMonConfig ADSR parameters into a flat volume sequence.
 * Returns a Uint8Array of volume values (0-64) of length maxLen.
 *
 * Envelope shape:
 *   Attack:  0 → attackVolume  over attackSpeed steps
 *   Decay:   attackVolume → decayVolume  over decaySpeed steps
 *   Sustain: hold decayVolume/sustainVolume  for sustainLength steps
 *   Release: sustainVolume → releaseVolume  over releaseSpeed steps
 *   Tail:    fill with releaseVolume to end of sequence
 */
export function encodeSoundMonADSR(cfg: SoundMonConfig, maxLen: number): Uint8Array {
  const len = Math.max(1, Math.min(256, maxLen));
  const buf = new Uint8Array(len);

  const atkVol  = Math.min(64, Math.max(0, cfg.attackVolume ?? 64));
  const decVol  = Math.min(64, Math.max(0, cfg.decayVolume ?? 32));
  const susVol  = Math.min(64, Math.max(0, cfg.sustainVolume ?? 32));
  const relVol  = Math.min(64, Math.max(0, cfg.releaseVolume ?? 0));
  const atkSpd  = Math.max(1, cfg.attackSpeed ?? 4);
  const decSpd  = Math.max(1, cfg.decaySpeed ?? 4);
  const susLen  = Math.max(0, cfg.sustainLength ?? 0);
  const relSpd  = Math.max(1, cfg.releaseSpeed ?? 4);

  let pos = 0;

  // Attack: ramp from 0 to atkVol
  for (let i = 0; i < atkSpd && pos < len; i++) {
    buf[pos++] = Math.round((atkVol * (i + 1)) / atkSpd);
  }

  // Decay: ramp from atkVol to decVol
  if (atkVol !== decVol) {
    for (let i = 0; i < decSpd && pos < len; i++) {
      buf[pos++] = Math.round(atkVol + ((decVol - atkVol) * (i + 1)) / decSpd);
    }
  }

  // Sustain: hold at susVol (transition from decVol if different)
  const holdVol = susVol;
  const holdLen = susLen > 0 ? susLen : Math.max(1, len - pos - relSpd - 1);
  for (let i = 0; i < holdLen && pos < len; i++) {
    buf[pos++] = holdVol;
  }

  // Release: ramp from susVol to relVol
  if (susVol !== relVol) {
    for (let i = 0; i < relSpd && pos < len; i++) {
      buf[pos++] = Math.round(susVol + ((relVol - susVol) * (i + 1)) / relSpd);
    }
  }

  // Fill remaining with release volume
  while (pos < len) {
    buf[pos++] = relVol;
  }

  return buf;
}


// ── FC Freq-Macro Encoder ──────────────────────────────────────────────────────
//
// FC freq macros are 64-byte opcode streams that control waveform selection,
// transposition, pitch bends, and looping. Each vol macro (instrument) references
// a freq macro by index (byte[1] of the vol macro).
//
// Key opcodes:
//   0xE0 +off    Loop to offset within this macro
//   0xE1         End
//   0xE2 +wave   Set waveform + reset volume position (wave = index + 10)
//   0xE3 +lo +hi Set transposition offset (signed 16-bit)
//   0xE4 +wave   Set waveform (no vol reset) (wave = index + 10)
//   0xE7 +idx    Jump to different freq macro
//   0xE8 +cnt    Sustain (hold for cnt ticks)
//   0xEA +spd +dur  Pitch bend

/**
 * Encode FCConfig synthTable into FC freq macro opcodes (64 bytes).
 * Each synthTable step maps to an E2 or E4 opcode + waveRef byte.
 * Arpeggio transpositions are encoded as E3 opcodes between waveform steps.
 *
 * @param synthTable — array of { waveNum, transposition, effect } steps
 * @param arpTable — 16 semitone offsets (signed), encoded as E3 opcodes
 * @returns 64-byte Uint8Array for the freq macro
 */
export function encodeFCFreqMacro(
  synthTable: FCConfig['synthTable'],
  arpTable: number[],
): Uint8Array {
  const buf = new Uint8Array(64);
  let pos = 0;

  // Encode synth table steps as waveform selection opcodes
  for (let i = 0; i < synthTable.length && pos < 60; i++) {
    const step = synthTable[i];

    // Transposition via E3 opcode (signed 16-bit)
    if (step.transposition !== 0 && pos + 3 < 62) {
      buf[pos++] = 0xE3;
      const t = step.transposition & 0xFFFF;
      buf[pos++] = t & 0xFF;        // low byte
      buf[pos++] = (t >> 8) & 0xFF;  // high byte
    }

    // Waveform selection: E2 (reset vol) or E4 (no reset)
    if (pos + 2 < 62) {
      buf[pos++] = step.effect === 1 ? 0xE2 : 0xE4;
      buf[pos++] = Math.min(56, Math.max(0, step.waveNum)) + 10; // waveRef = index + 10
    }
  }

  // Encode arpeggio table as transposition sequence
  // Only if there are non-zero arp entries and space remains
  const hasArp = arpTable.some(v => v !== 0);
  if (hasArp && pos < 58) {
    const loopStart = pos; // remember position for loop-back
    for (let i = 0; i < arpTable.length && pos + 3 < 60; i++) {
      if (arpTable[i] !== 0) {
        buf[pos++] = 0xE3;
        const t = arpTable[i] & 0xFFFF;
        buf[pos++] = t & 0xFF;
        buf[pos++] = (t >> 8) & 0xFF;
      }
    }
    // Loop back to arp start
    if (pos + 2 < 62) {
      buf[pos++] = 0xE0;
      buf[pos++] = loopStart & 0x3F;
    }
  }

  // End marker
  if (pos < 64) buf[pos++] = 0xE1;

  // Fill remaining with 0xE1
  while (pos < 64) buf[pos++] = 0xE1;

  return buf;
}
