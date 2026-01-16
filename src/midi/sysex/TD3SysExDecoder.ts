/**
 * TD3SysExDecoder - Decode TD-3 SysEx pattern data
 *
 * Decodes pattern data received from the TD-3 back into usable format.
 */

import type { TD3Step, TD3Note, TD3PatternData } from '../types';
import { TD3_SYSEX } from '../types';

/**
 * Decode a note from TD-3 encoded format
 * Formula: encoded = 12 + noteValue + (octave * 12) + upperC_bit
 */
function decodeNote(highNibble: number, lowNibble: number): TD3Note | null {
  const encoded = (highNibble << 4) | lowNibble;

  // 0 is a rest
  if (encoded === 0) {
    return null;
  }

  // Check for upper C bit
  const upperC = (encoded & 0x80) !== 0;
  const value = encoded & 0x7F;

  // Decode: value - 12 = noteValue + (octave * 12)
  const adjusted = value - 12;
  if (adjusted < 0) {
    return null; // Invalid encoding
  }

  const octave = Math.floor(adjusted / 12);
  const noteValue = adjusted % 12;

  return {
    value: noteValue,
    octave: Math.min(octave, 2), // Clamp to valid range
    upperC: upperC && noteValue === 0,
  };
}

/**
 * Decode 32 bytes of note data into 16 TD3Notes
 */
function decodeNoteData(data: Uint8Array, offset: number): (TD3Note | null)[] {
  const notes: (TD3Note | null)[] = [];

  for (let i = 0; i < 16; i++) {
    const highNibble = data[offset + i * 2];
    const lowNibble = data[offset + i * 2 + 1];
    notes.push(decodeNote(highNibble, lowNibble));
  }

  return notes;
}

/**
 * Decode 32 bytes of boolean flags (accent or slide)
 */
function decodeBooleanFlags(data: Uint8Array, offset: number): boolean[] {
  const flags: boolean[] = [];

  for (let i = 0; i < 16; i++) {
    // MSB is at even index (always 0), flag is at odd index
    flags.push(data[offset + i * 2 + 1] !== 0);
  }

  return flags;
}

/**
 * Decode 4 bytes of bitmask (tie or rest bits)
 */
function decodeBitmask(data: Uint8Array, offset: number): boolean[] {
  // Reconstruct u16 from nibbles
  const bits =
    (data[offset + 1]) |           // Bits 0-3
    (data[offset] << 4) |          // Bits 4-7
    (data[offset + 3] << 8) |      // Bits 8-11
    (data[offset + 2] << 12);      // Bits 12-15

  const flags: boolean[] = [];
  for (let i = 0; i < 16; i++) {
    flags.push((bits & (1 << i)) !== 0);
  }

  return flags;
}

/**
 * Decode active steps from nibbled format
 */
function decodeActiveSteps(data: Uint8Array, offset: number): number {
  return (data[offset] << 4) | data[offset + 1];
}

/**
 * Validate SysEx message is a TD-3 pattern
 */
export function validateTD3PatternSysEx(data: Uint8Array): { valid: boolean; error?: string } {
  // Check minimum length
  if (data.length < TD3_SYSEX.HEADER.length + 5) {
    return { valid: false, error: 'Message too short' };
  }

  // Check header
  for (let i = 0; i < TD3_SYSEX.HEADER.length; i++) {
    if (data[i] !== TD3_SYSEX.HEADER[i]) {
      return { valid: false, error: 'Invalid TD-3 header' };
    }
  }

  // Check command byte
  const command = data[TD3_SYSEX.HEADER.length];
  if (command !== TD3_SYSEX.CMD_SEND_PATTERN) {
    return { valid: false, error: `Invalid command: expected ${TD3_SYSEX.CMD_SEND_PATTERN}, got ${command}` };
  }

  // Check footer
  if (data[data.length - 1] !== TD3_SYSEX.FOOTER) {
    return { valid: false, error: 'Invalid SysEx footer' };
  }

  return { valid: true };
}

/**
 * Decode a TD-3 pattern SysEx message
 */
export function decodePattern(data: Uint8Array): TD3PatternData | null {
  const validation = validateTD3PatternSysEx(data);
  if (!validation.valid) {
    console.warn('[TD3SysExDecoder]', validation.error);
    return null;
  }

  // Calculate offsets (after header + command byte)
  const baseOffset = TD3_SYSEX.HEADER.length + 1;

  // Extract group and pattern
  const group = data[baseOffset];
  const pattern = data[baseOffset + 1];

  // Skip header bytes (00 01) at baseOffset + 2, baseOffset + 3

  // Decode note data (32 bytes starting at baseOffset + 4)
  const notes = decodeNoteData(data, baseOffset + 4);

  // Decode accent flags (32 bytes starting at baseOffset + 36)
  const accents = decodeBooleanFlags(data, baseOffset + 36);

  // Decode slide flags (32 bytes starting at baseOffset + 68)
  const slides = decodeBooleanFlags(data, baseOffset + 68);

  // Decode triplet flag (at baseOffset + 100)
  const triplet = data[baseOffset + 101] !== 0;

  // Decode active steps (at baseOffset + 102)
  const activeSteps = decodeActiveSteps(data, baseOffset + 102);

  // Skip reserved bytes (at baseOffset + 104, baseOffset + 105)

  // Decode tie bits (at baseOffset + 106)
  const ties = decodeBitmask(data, baseOffset + 106);

  // Decode rest bits (at baseOffset + 110)
  // Note: We'll use this to validate, but the notes array already has null for rests

  // Build steps array
  const steps: TD3Step[] = [];
  for (let i = 0; i < 16; i++) {
    steps.push({
      note: notes[i],
      accent: accents[i],
      slide: slides[i],
      tie: ties[i],
    });
  }

  return {
    group,
    pattern,
    steps,
    triplet,
    activeSteps: Math.min(16, Math.max(1, activeSteps)),
  };
}

/**
 * Check if a SysEx message is a TD-3 pattern response
 */
export function isTD3PatternResponse(data: Uint8Array): boolean {
  if (data.length < TD3_SYSEX.HEADER.length + 2) {
    return false;
  }

  // Check header
  for (let i = 0; i < TD3_SYSEX.HEADER.length; i++) {
    if (data[i] !== TD3_SYSEX.HEADER[i]) {
      return false;
    }
  }

  // Check command
  return data[TD3_SYSEX.HEADER.length] === TD3_SYSEX.CMD_SEND_PATTERN;
}

/**
 * Extract pattern location from SysEx data
 */
export function extractPatternLocation(data: Uint8Array): { group: number; pattern: number } | null {
  if (!isTD3PatternResponse(data)) {
    return null;
  }

  const baseOffset = TD3_SYSEX.HEADER.length + 1;
  return {
    group: data[baseOffset],
    pattern: data[baseOffset + 1],
  };
}
