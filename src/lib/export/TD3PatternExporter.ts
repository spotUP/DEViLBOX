/**
 * TD-3 Pattern Exporter (.seq format)
 * Generates Behringer Synthtribe compatible pattern files
 */

import type { TD3PatternData } from '@/midi/types';

/**
 * Encode 16 bits into 4 nibbled bytes (Behringer format)
 * Structure: [HighNibble0-7, LowNibble0-7, HighNibble8-15, LowNibble8-15]
 */
function encodeNibbledBits(bits: boolean[]): Uint8Array {
  let word0 = 0;
  let word1 = 0;
  
  for (let i = 0; i < 8; i++) {
    if (bits[i]) word0 |= (1 << i);
  }
  for (let i = 8; i < 16; i++) {
    if (bits[i]) word1 |= (1 << (i - 8));
  }
  
  // Format used in Synthtribe files: [HighNibble0-7, LowNibble0-7, HighNibble8-15, LowNibble8-15]
  return new Uint8Array([
    (word0 >> 4) & 0x0F,
    word0 & 0x0F,
    (word1 >> 4) & 0x0F,
    word1 & 0x0F
  ]);
}

/**
 * Export a TD-3 pattern to a .seq file (146 bytes)
 */
export function exportTD3PatternToSeq(data: TD3PatternData): Uint8Array {
  const buffer = new Uint8Array(146);
  const view = new DataView(buffer.buffer);
  
  // Magic bytes: 0x23985476 (Big Endian)
  view.setUint32(0, 0x23985476, false);
  
  // Header: "TD-3" and version
  const header = new Uint8Array([
    0x00, 0x00, 0x00, 0x08,
    0x00, 0x54, 0x00, 0x44, 0x00, 0x2d, 0x00, 0x33, // "T.D.-.3"
    0x00, 0x00, 0x00, 0x0a, 0x00, 0x31, 0x00, 0x2e, 
    0x00, 0x33, 0x00, 0x2e, 0x00, 0x37, 0x00, 0x00  // Version 1.3.7
  ]);
  buffer.set(header, 4);
  
  // Offset 32-35: Length field (usually 00 70 00 00)
  buffer[32] = 0x00;
  buffer[33] = 0x70;
  buffer[34] = 0x00;
  buffer[35] = 0x00;
  
  const dataOffset = 36;
  
  const tieBits: boolean[] = Array(16).fill(false);
  const restBits: boolean[] = Array(16).fill(false);
  const pitchSequence: number[] = [];
  const accentSequence: boolean[] = [];
  const slideSequence: boolean[] = [];
  
  for (let i = 0; i < 16; i++) {
    const step = data.steps[i] || { note: null, accent: false, slide: false, tie: false };
    
    // In .seq format: 
    // Tie Bit = 1 means Trigger (New Pitch)
    // Tie Bit = 0 means Sustain
    // Rest Bit = 1 means Rest
    // Rest Bit = 0 means Note Enabled
    
    if (i > 0 && step.tie) {
      // Sustain last note
      tieBits[i] = false;
      restBits[i] = step.note === null;
    } else {
      // New Pitch Trigger
      tieBits[i] = true;
      restBits[i] = step.note === null;
      
      // Pitch encoding: (octave * 12) + noteValue. 
      // Based on our import logic, C2 is 24.
      let noteVal = 0;
      if (step.note) {
        noteVal = 24 + step.note.value + (step.note.octave * 12);
        if (step.note.upperC) noteVal = 60; // Upper C
      }
      
      pitchSequence.push(noteVal);
      accentSequence.push(step.accent);
      slideSequence.push(step.slide);
    }
  }
  
  // Write packed notes (nibbled)
  for (let i = 0; i < 16; i++) {
    const val = pitchSequence[i] || 0;
    buffer[dataOffset + i * 2] = (val >> 4) & 0x0F;
    buffer[dataOffset + i * 2 + 1] = val & 0x0F;
  }
  
  // Write packed accents (nibbled)
  for (let i = 0; i < 16; i++) {
    const val = accentSequence[i] ? 0x01 : 0x00;
    buffer[dataOffset + 32 + i * 2] = 0x00;
    buffer[dataOffset + 32 + i * 2 + 1] = val;
  }
  
  // Write packed slides (nibbled)
  for (let i = 0; i < 16; i++) {
    const val = slideSequence[i] ? 0x01 : 0x00;
    buffer[dataOffset + 64 + i * 2] = 0x00;
    buffer[dataOffset + 64 + i * 2 + 1] = val;
  }
  
  // Triplet
  buffer[dataOffset + 96] = 0x00;
  buffer[dataOffset + 97] = data.triplet ? 0x01 : 0x00;
  
  // Length (Active steps)
  buffer[dataOffset + 98] = 0x00; // High nibble
  buffer[dataOffset + 99] = data.activeSteps & 0x0F; // Low nibble (1-16)
  
  // Tie and Rest bits (16 bits each, nibbled)
  buffer.set(encodeNibbledBits(tieBits), dataOffset + 102);
  buffer.set(encodeNibbledBits(restBits), dataOffset + 106);
  
  return buffer;
}