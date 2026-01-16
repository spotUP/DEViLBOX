/**
 * TD3SysExEncoder - Encode patterns to TD-3 SysEx format
 *
 * SysEx format:
 * F0 00 20 32 00 01 0A 78 [GROUP] [PATTERN] [DATA...] F7
 *
 * Data layout (115 bytes after command):
 * - Bytes 0-1: Group, Pattern
 * - Bytes 2-3: 00 01 (header)
 * - Bytes 4-35: Note data (32 bytes = 16 steps x 2)
 * - Bytes 36-67: Accent flags (32 bytes)
 * - Bytes 68-99: Slide flags (32 bytes)
 * - Bytes 100-101: Triplet flag (2 bytes)
 * - Bytes 102-103: Active steps (nibbled)
 * - Bytes 104-105: Reserved (00 00)
 * - Bytes 106-109: Tie bits (4 bytes from u16)
 * - Bytes 110-113: Rest bits (4 bytes from u16)
 */

import type { TD3Step, TD3PatternData } from '../types';
import { TD3_SYSEX } from '../types';

/**
 * Encode a note value to TD-3 format
 * Formula: 12 + noteValue + (octave * 12) + upperC_bit
 */
function encodeNote(step: TD3Step): number {
  if (!step.note) {
    return 0; // Rest
  }

  const { value, octave, upperC } = step.note;

  // Base encoding: 12 + note + octave * 12
  let encoded = 12 + value + (octave * 12);

  // Set high bit for upper C
  if (upperC) {
    encoded |= 0x80;
  }

  return encoded;
}

/**
 * Encode 16 steps of note data as 32 bytes (nibbled format)
 */
function encodeNoteData(steps: TD3Step[]): Uint8Array {
  const data = new Uint8Array(32);

  for (let i = 0; i < 16; i++) {
    const step = steps[i] || { note: null, accent: false, slide: false, tie: false };
    const encoded = encodeNote(step);

    // Split into high and low nibbles
    // High nibble at even index, low nibble at odd index
    data[i * 2] = (encoded >> 4) & 0x0F;
    data[i * 2 + 1] = encoded & 0x0F;
  }

  return data;
}

/**
 * Encode accent flags as 32 bytes
 */
function encodeAccentData(steps: TD3Step[]): Uint8Array {
  const data = new Uint8Array(32);

  for (let i = 0; i < 16; i++) {
    const step = steps[i] || { note: null, accent: false, slide: false, tie: false };
    // MSB is always 0, LSB is accent flag
    data[i * 2] = 0x00;
    data[i * 2 + 1] = step.accent ? 0x01 : 0x00;
  }

  return data;
}

/**
 * Encode slide flags as 32 bytes
 */
function encodeSlideData(steps: TD3Step[]): Uint8Array {
  const data = new Uint8Array(32);

  for (let i = 0; i < 16; i++) {
    const step = steps[i] || { note: null, accent: false, slide: false, tie: false };
    data[i * 2] = 0x00;
    data[i * 2 + 1] = step.slide ? 0x01 : 0x00;
  }

  return data;
}

/**
 * Encode tie bits as 4 bytes (u16 bitmask, nibbled)
 */
function encodeTieBits(steps: TD3Step[]): Uint8Array {
  let bits = 0;

  for (let i = 0; i < 16; i++) {
    const step = steps[i];
    if (step?.tie) {
      bits |= (1 << i);
    }
  }

  // Split u16 into 4 nibbles (little-endian nibble order)
  return new Uint8Array([
    (bits >> 4) & 0x0F,   // Bits 4-7
    bits & 0x0F,          // Bits 0-3
    (bits >> 12) & 0x0F,  // Bits 12-15
    (bits >> 8) & 0x0F,   // Bits 8-11
  ]);
}

/**
 * Encode rest bits as 4 bytes (u16 bitmask, nibbled)
 */
function encodeRestBits(steps: TD3Step[]): Uint8Array {
  let bits = 0;

  for (let i = 0; i < 16; i++) {
    const step = steps[i];
    // A step is a rest if it has no note
    if (!step?.note) {
      bits |= (1 << i);
    }
  }

  // Split u16 into 4 nibbles
  return new Uint8Array([
    (bits >> 4) & 0x0F,
    bits & 0x0F,
    (bits >> 12) & 0x0F,
    (bits >> 8) & 0x0F,
  ]);
}

/**
 * Encode active steps count (nibbled format)
 */
function encodeActiveSteps(count: number): Uint8Array {
  const clamped = Math.max(1, Math.min(16, count));
  return new Uint8Array([
    (clamped >> 4) & 0x0F,
    clamped & 0x0F,
  ]);
}

/**
 * Build a complete SysEx message for sending a pattern to TD-3
 */
export function encodePattern(data: TD3PatternData): Uint8Array {
  // Validate inputs
  const group = Math.max(0, Math.min(3, data.group));
  const pattern = Math.max(0, Math.min(15, data.pattern));
  const steps = data.steps.slice(0, 16);

  // Pad steps to 16 if needed
  while (steps.length < 16) {
    steps.push({ note: null, accent: false, slide: false, tie: false });
  }

  // Build payload
  const noteData = encodeNoteData(steps);
  const accentData = encodeAccentData(steps);
  const slideData = encodeSlideData(steps);
  const tripletFlag = new Uint8Array([0x00, data.triplet ? 0x01 : 0x00]);
  const activeSteps = encodeActiveSteps(data.activeSteps);
  const reserved = new Uint8Array([0x00, 0x00]);
  const tieBits = encodeTieBits(steps);
  const restBits = encodeRestBits(steps);

  // Calculate total message size
  const headerSize = TD3_SYSEX.HEADER.length;
  const payloadSize = 1 + 2 + 2 + 32 + 32 + 32 + 2 + 2 + 2 + 4 + 4; // 115 bytes
  const messageSize = headerSize + payloadSize + 1; // +1 for footer

  // Allocate message buffer
  const message = new Uint8Array(messageSize);
  let offset = 0;

  // Write header
  message.set(TD3_SYSEX.HEADER, offset);
  offset += TD3_SYSEX.HEADER.length;

  // Write command
  message[offset++] = TD3_SYSEX.CMD_SEND_PATTERN;

  // Write group and pattern
  message[offset++] = group;
  message[offset++] = pattern;

  // Write header bytes (00 01)
  message[offset++] = 0x00;
  message[offset++] = 0x01;

  // Write note data
  message.set(noteData, offset);
  offset += noteData.length;

  // Write accent data
  message.set(accentData, offset);
  offset += accentData.length;

  // Write slide data
  message.set(slideData, offset);
  offset += slideData.length;

  // Write triplet flag
  message.set(tripletFlag, offset);
  offset += tripletFlag.length;

  // Write active steps
  message.set(activeSteps, offset);
  offset += activeSteps.length;

  // Write reserved
  message.set(reserved, offset);
  offset += reserved.length;

  // Write tie bits
  message.set(tieBits, offset);
  offset += tieBits.length;

  // Write rest bits
  message.set(restBits, offset);
  offset += restBits.length;

  // Write footer
  message[offset] = TD3_SYSEX.FOOTER;

  return message;
}

/**
 * Build a pattern request SysEx message
 */
export function encodePatternRequest(group: number, pattern: number): Uint8Array {
  const g = Math.max(0, Math.min(3, group));
  const p = Math.max(0, Math.min(15, pattern));

  const message = new Uint8Array(TD3_SYSEX.HEADER.length + 4);

  message.set(TD3_SYSEX.HEADER, 0);
  message[TD3_SYSEX.HEADER.length] = TD3_SYSEX.CMD_REQUEST_PATTERN;
  message[TD3_SYSEX.HEADER.length + 1] = g;
  message[TD3_SYSEX.HEADER.length + 2] = p;
  message[TD3_SYSEX.HEADER.length + 3] = TD3_SYSEX.FOOTER;

  return message;
}

/**
 * Get human-readable pattern location string
 */
export function formatPatternLocation(group: number, pattern: number): string {
  const groupLetter = ['A', 'B', 'C', 'D'][group] || '?';
  const patternNum = (pattern % 8) + 1;
  const bank = pattern < 8 ? 'A' : 'B';
  return `${groupLetter}${bank}${patternNum}`;
}
