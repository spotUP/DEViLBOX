/**
 * TD-3 Pattern Loader (.sqs and .seq formats)
 * Parses Behringer Synthtribe pattern files for the TD-3 (303 clone)
 * .sqs = Single pattern export (Legacy format)
 * .seq = Sequence export (Modern Synthtribe format)
 */

import type { TD3Step } from '@/midi/types';

export interface TD3Pattern {
  index: number;
  name: string;
  steps: TD3Step[];
  length: number;    // Active steps (1-16)
  tempo: number;     // BPM
  triplet: boolean;
}

export interface TD3File {
  name: string;
  version: string;
  patterns: TD3Pattern[];
}

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Check if a file is a TD-3 .sqs or .seq pattern file
 */
export function isTD3File(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.sqs') || lower.endsWith('.seq');
}

/**
 * Decode 16 bits from 4 nibbled bytes (Behringer format)
 * Structure: [HighNibble0-7, LowNibble0-7, HighNibble8-15, LowNibble8-15]
 */
function decodeNibbledBits(bytes: Uint8Array, offset: number): boolean[] {
  const bits: boolean[] = [];
  
  // First 8 bits: byte0=high nibble, byte1=low nibble
  const byte0 = bytes[offset];
  const byte1 = bytes[offset + 1];
  const word0 = (byte0 << 4) | (byte1 & 0x0F);
  
  // Next 8 bits: byte2=high nibble, byte3=low nibble
  const byte2 = bytes[offset + 2];
  const byte3 = bytes[offset + 3];
  const word1 = (byte2 << 4) | (byte3 & 0x0F);
  
  const fullWord = (word1 << 8) | word0;
  
  for (let i = 0; i < 16; i++) {
    bits.push(((fullWord >> i) & 1) !== 0);
  }
  
  return bits;
}

/**
 * Parse a TD-3 .sqs or .seq pattern file
 */
export async function parseTD3File(buffer: ArrayBuffer): Promise<TD3File> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Check magic bytes
  const magic = view.getUint32(0, false);
  const isSEQ = magic === 0x23985476;
  const isSQS = magic === 0x87439102;
  
  if (!isSEQ && !isSQS) {
    throw new Error(`Invalid TD-3 file: bad magic bytes (0x${magic.toString(16).toUpperCase()})`);
  }

  // Read device name (UTF-16BE for SEQ, or null-interleaved ASCII)
  let deviceName = '';
  for (let i = 8; i < 20; i += 2) {
    const char = view.getUint16(i, false); // Big Endian
    if (char === 0) break;
    deviceName += String.fromCharCode(char);
  }

  // Read version (UTF-16BE)
  let version = '';
  for (let i = 20; i < 32; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    version += String.fromCharCode(char);
  }

  console.log(`[TD3Loader] Parsing ${deviceName} file, version ${version}`);

  const patterns: TD3Pattern[] = [];
  
    if (isSEQ) {
  
      // .seq file: Fixed structure, typically one pattern per file (146 bytes)
  
      let offset = 32;
  
      
  
      while (offset <= buffer.byteLength - 114) {
  
        const dataOffset = offset + 4;
  
        const steps: TD3Step[] = [];
  
        
  
        const notesBase = dataOffset;
  
        const accentsBase = dataOffset + 32;
  
        const slidesBase = dataOffset + 64;
  
        
  
        const triplet = ((bytes[dataOffset + 96] << 4) | (bytes[dataOffset + 97] & 0x0F)) !== 0;
  
        const length = (bytes[dataOffset + 98] << 4) | (bytes[dataOffset + 99] & 0x0F);
  
        
  
        const tieBits = decodeNibbledBits(bytes, dataOffset + 102);
  
        const restBits = decodeNibbledBits(bytes, dataOffset + 106);
  
        
  
        let triggerIdx = 0;
  
        let lastStep: TD3Step | null = null;
  
  
  
        for (let i = 0; i < 16; i++) {
  
          // tieBits[i] === true means Step i+1 is a new trigger (New Pitch)
  
          // tieBits[i] === false means Step i+1 is a sustain of the previous note
  
          const isTrigger = tieBits[i];
  
          
  
          if (isTrigger) {
  
            const nOffset = notesBase + (triggerIdx * 2);
  
            // Note = MSB * 16 + LSB
  
            const noteVal = (bytes[nOffset] << 4) | (bytes[nOffset + 1] & 0x0F);
  
            
  
            const octave = Math.floor(noteVal / 12);
  
            const note = noteVal % 12;
  
            const upperC = noteVal === 60;
  
            
  
            // restBits[i] === true means Step i+1 is a rest?
  
            // Based on binary analysis of valid patterns where rest is all 0, 
  
            // we assume 1 = Rest, 0 = Note Enabled.
  
            const isRest = restBits[i];
  
            
  
            const step: TD3Step = {
  
              note: isRest ? null : {
  
                value: note,
  
                octave: Math.max(0, Math.min(2, octave - 2)), 
  
                upperC
  
              },
  
              accent: bytes[accentsBase + triggerIdx * 2 + 1] !== 0,
  
              slide: bytes[slidesBase + triggerIdx * 2 + 1] !== 0,
  
              tie: false
  
            };
  
            
  
            steps.push(step);
  
            lastStep = step;
  
            triggerIdx++;
  
          } else {
  
            // Sustain last note
  
            if (lastStep && lastStep.note) {
  
              steps.push({
  
                ...lastStep,
  
                tie: true // Sustain flag
  
              });
  
            } else {
  
              // No last note? Must be a rest
  
              steps.push({
  
                note: null,
  
                accent: false,
  
                slide: false,
  
                tie: false
  
              });
  
            }
  
          }
  
        }
  
        
  
        patterns.push({
  
          index: patterns.length,
  
          name: `Pattern ${patterns.length + 1}`,
  
          steps,
  
          length: length || 16,
  
          tempo: 120,
  
          triplet
  
        });
  
        
  
        offset += 114; 
  
      }
  
    }
  
   else {
    // .sqs file: Single pattern export (Legacy format)
    // For now, keep some version of the old searching logic but corrected
    let offset = 32;
    while (offset < buffer.byteLength - 100) {
      if (bytes[offset + 2] === 0x00 && bytes[offset + 3] === 0x70) {
        // ... (Legacy SQS logic if needed)
        offset += 126;
      } else {
        offset++;
      }
    }
  }

  console.log(`[TD3Loader] Found ${patterns.length} patterns`);

  return {
    name: deviceName,
    version,
    patterns,
  };
}

/**
 * Convert a TD3Pattern to DEViLBOX format
 */
export function convertTD3PatternToDbox(
  td3Pattern: TD3Pattern,
  baseOctave: number = 2
): {
  rows: Array<{
    note: string | null;
    instrument: number;
    volume: number | null;
    effect: string | null;
    accent: boolean;
    slide: boolean;
  }>;
} {
  const rows = td3Pattern.steps.map((step) => {
    if (!step.note) {
      return {
        note: null,
        instrument: 1,
        volume: null,
        effect: null,
        accent: false,
        slide: false,
      };
    }

    const noteName = NOTE_NAMES[step.note.value];
    const octave = baseOctave + step.note.octave + (step.note.upperC ? 1 : 0);
    const noteStr = `${noteName}${octave}`;

    return {
      note: noteStr,
      instrument: 1, // TB-303 instrument
      volume: null,
      effect: null,
      accent: step.accent,
      slide: step.slide,
    };
  });

  return { rows };
}

/**
 * Convert entire TD3File to a DEViLBOX project
 */
export function convertTD3FileToDbox(td3File: TD3File, filename: string): object {
  const patterns = td3File.patterns.map((td3Pattern, idx) => {
    const converted = convertTD3PatternToDbox(td3Pattern);

    return {
      id: `td3-pattern-${idx}`,
      name: td3Pattern.name,
      length: 16,
      channels: [
        {
          id: `ch-303-${idx}`,
          name: 'TB-303',
          muted: false,
          solo: false,
          volume: 80,
          pan: 0,
          instrumentId: 1,
          color: '#ec4899',
          rows: converted.rows,
        },
      ],
    };
  });

  // Create TB-303 instrument
  const instruments = [
    {
      id: 1,
      name: 'TB-303',
      synthType: 'TB303',
      tb303: {
        oscillator: { type: 'sawtooth' },
        filter: { cutoff: 800, resonance: 70 },
        filterEnvelope: { envMod: 80, decay: 200 },
        accent: { amount: 85 },
        slide: { time: 50, mode: 'exponential' },
        overdrive: { amount: 25 },
      },
      effects: [],
      volume: -6,
      pan: 0,
    },
  ];

  return {
    format: 'devilbox-dbox',
    version: '1.0.0',
    metadata: {
      id: `td3-${Date.now()}`,
      name: filename.replace('.sqs', '').replace('.seq', '') || 'TD-3 Patterns',
      author: 'TD-3 Import',
      description: `Imported from ${td3File.name} v${td3File.version}`,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    },
    bpm: 125,
    instruments,
    patterns,
    sequence: patterns.map(p => p.id),
    masterVolume: 0,
    masterEffects: [],
  };
}