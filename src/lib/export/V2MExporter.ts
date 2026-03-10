/**
 * V2M Exporter
 * 
 * Exports DEViLBOX patterns back to V2M format for use in 4k/64k intros.
 * 
 * V2M binary format (from v2mconv.cpp):
 * - Header: timediv (U32), maxtime (U32), gdnum (U32)
 * - Global timing data: gdnum * 10 bytes
 * - Per channel (16): note events, program changes, pitch bends, 7 CC types
 * - Globals size (U32) + globals data
 * - Patch size (U32) + patch offset table + patch data
 * - Optional speech size (U32) + speech data
 */

import type { Pattern } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
import type { V2InstrumentConfig } from '../../types/v2Instrument';
import { v2ConfigToBytes, DEFAULT_V2_GLOBALS } from '../../types/v2Instrument';

/**
 * Options for V2M export
 */
export interface V2MExportOptions {
  /** BPM (affects timediv calculation) */
  bpm?: number;
  /** Speed/ticks per row */
  speed?: number;
  /** Target timediv (ticks per beat, default: 192) */
  timediv?: number;
}

/**
 * Note event in export format
 */
interface ExportNoteEvent {
  time: number;
  note: number;
  velocity: number;
}

/**
 * Program change in export format
 */
interface ExportProgramChange {
  time: number;
  program: number;
}

/**
 * Convert DEViLBOX note value (1-96) to MIDI number
 */
function noteValueToMidi(noteValue: number): number | null {
  if (noteValue === 0 || noteValue === 97) return null; // Empty or note-off
  // DEViLBOX 1-96 -> MIDI + 12 offset
  return noteValue - 1 + 12;
}

/**
 * Convert global effects to bytes
 */
function globalsToBytes(): Uint8Array {
  const g = DEFAULT_V2_GLOBALS;
  const bytes = new Uint8Array(32);
  let i = 0;
  
  bytes[i++] = g.reverbTime;
  bytes[i++] = g.reverbHighCut;
  bytes[i++] = g.reverbLowCut;
  bytes[i++] = g.reverbVolume;
  bytes[i++] = g.delayVolume;
  bytes[i++] = g.delayFeedback;
  bytes[i++] = g.delayL;
  bytes[i++] = g.delayR;
  bytes[i++] = g.delayModRate;
  bytes[i++] = g.delayModDepth;
  bytes[i++] = g.delayModPhase;
  bytes[i++] = g.lowCut;
  bytes[i++] = g.highCut;
  
  // Sum compressor
  bytes[i++] = ['off', 'peak', 'rms'].indexOf(g.sumCompressor.mode);
  bytes[i++] = g.sumCompressor.stereoLink ? 1 : 0;
  bytes[i++] = g.sumCompressor.autoGain ? 1 : 0;
  bytes[i++] = g.sumCompressor.lookahead;
  bytes[i++] = g.sumCompressor.threshold;
  bytes[i++] = g.sumCompressor.ratio;
  bytes[i++] = g.sumCompressor.attack;
  bytes[i++] = g.sumCompressor.release;
  bytes[i++] = g.sumCompressor.outGain;
  
  return bytes.slice(0, i);
}

/**
 * Export patterns to V2M format
 */
export function exportV2M(
  patterns: Pattern[],
  patternSequence: number[],
  instruments: InstrumentConfig[],
  options: V2MExportOptions = {}
): Uint8Array {
  const {
    timediv = 192, // Standard MIDI resolution
  } = options;
  
  // Calculate timing
  const ticksPerRow = timediv / 4; // Assume 4 rows per beat
  
  // Collect events per channel (max 16 channels)
  const channelNotes: ExportNoteEvent[][] = Array.from({ length: 16 }, () => []);
  const channelPrograms: ExportProgramChange[][] = Array.from({ length: 16 }, () => []);
  
  // Track current instrument per channel for program changes
  const currentInstrument = new Array(16).fill(-1);
  
  // Process pattern sequence
  let globalTime = 0;
  
  for (const patternIdx of patternSequence) {
    const pattern = patterns[patternIdx];
    if (!pattern) continue;
    
    const numChannels = Math.min(pattern.channels.length, 16);
    
    for (let row = 0; row < pattern.length; row++) {
      const time = globalTime + row * ticksPerRow;
      
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pattern.channels[ch].rows[row];
        if (!cell) continue;
        
        const midi = noteValueToMidi(cell.note);
        if (midi !== null) {
          // Check for instrument change
          const inst = cell.instrument > 0 ? cell.instrument - 1 : currentInstrument[ch];
          if (inst !== currentInstrument[ch] && inst >= 0) {
            channelPrograms[ch].push({ time, program: inst });
            currentInstrument[ch] = inst;
          }
          
          // Add note event - convert volume column to velocity
          let velocity = 100;
          if (cell.volume >= 0x10 && cell.volume <= 0x50) {
            velocity = Math.round(((cell.volume - 0x10) / 0x40) * 127);
          }
          
          channelNotes[ch].push({
            time,
            note: midi,
            velocity: Math.min(127, Math.max(1, velocity)),
          });
        }
      }
    }
    
    globalTime += pattern.length * ticksPerRow;
  }
  
  const maxTime = globalTime;
  
  // Build V2M binary
  const chunks: Uint8Array[] = [];
  
  // Header
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, timediv, true);
  headerView.setUint32(4, maxTime, true);
  headerView.setUint32(8, 0, true); // gdnum = 0 (no global timing data)
  chunks.push(header);
  
  // Per-channel data
  for (let ch = 0; ch < 16; ch++) {
    const notes = channelNotes[ch];
    const programs = channelPrograms[ch];
    
    if (notes.length === 0) {
      // Empty channel - just note count = 0
      const empty = new Uint8Array(4);
      new DataView(empty.buffer).setUint32(0, 0, true);
      chunks.push(empty);
      continue;
    }
    
    // Note count
    const noteCount = new Uint8Array(4);
    new DataView(noteCount.buffer).setUint32(0, notes.length, true);
    chunks.push(noteCount);
    
    // Note data (delta-encoded)
    // Format: 3 bytes delta time, 1 byte note, 1 byte velocity (interleaved)
    const noteData = new Uint8Array(5 * notes.length);
    let lastTime = 0;
    
    for (let i = 0; i < notes.length; i++) {
      const dt = notes[i].time - lastTime;
      lastTime = notes[i].time;
      
      // Delta time in 3 separate arrays
      noteData[i] = dt & 0xFF;
      noteData[notes.length + i] = (dt >> 8) & 0xFF;
      noteData[2 * notes.length + i] = (dt >> 16) & 0xFF;
      noteData[3 * notes.length + i] = notes[i].note;
      noteData[4 * notes.length + i] = notes[i].velocity;
    }
    chunks.push(noteData);
    
    // Program changes
    const pcCount = new Uint8Array(4);
    new DataView(pcCount.buffer).setUint32(0, programs.length, true);
    chunks.push(pcCount);
    
    if (programs.length > 0) {
      const pcData = new Uint8Array(4 * programs.length);
      lastTime = 0;
      let lastProg = 0;
      
      for (let i = 0; i < programs.length; i++) {
        const dt = programs[i].time - lastTime;
        lastTime = programs[i].time;
        
        pcData[i] = dt & 0xFF;
        pcData[programs.length + i] = (dt >> 8) & 0xFF;
        pcData[2 * programs.length + i] = (dt >> 16) & 0xFF;
        pcData[3 * programs.length + i] = programs[i].program - lastProg;
        lastProg = programs[i].program;
      }
      chunks.push(pcData);
    }
    
    // Pitch bends (empty)
    const pbCount = new Uint8Array(4);
    new DataView(pbCount.buffer).setUint32(0, 0, true);
    chunks.push(pbCount);
    
    // 7 CC types (all empty)
    for (let cc = 0; cc < 7; cc++) {
      const ccCount = new Uint8Array(4);
      new DataView(ccCount.buffer).setUint32(0, 0, true);
      chunks.push(ccCount);
    }
  }
  
  // Globals
  const globalsData = globalsToBytes();
  const globalsHeader = new Uint8Array(4);
  new DataView(globalsHeader.buffer).setUint32(0, globalsData.length, true);
  chunks.push(globalsHeader);
  chunks.push(globalsData);
  
  // Patches
  const patchBytes: Uint8Array[] = [];
  const usedInstruments = new Set<number>();
  
  for (const ch of channelPrograms) {
    for (const pc of ch) {
      usedInstruments.add(pc.program);
    }
  }
  
  // Also add instrument 0 if no program changes
  if (usedInstruments.size === 0) {
    usedInstruments.add(0);
  }
  
  const maxInstrument = Math.max(...usedInstruments) + 1;
  
  for (let i = 0; i < maxInstrument; i++) {
    const inst = instruments[i];
    if (inst && inst.synthType === 'V2' && inst.v2) {
      patchBytes.push(v2ConfigToBytes(inst.v2 as unknown as V2InstrumentConfig));
    } else {
      // Default patch
      patchBytes.push(v2ConfigToBytes({} as V2InstrumentConfig));
    }
  }
  
  // Calculate patch offsets
  const patchOffsets = new Uint32Array(patchBytes.length);
  let offset = patchBytes.length * 4; // Offset table size
  for (let i = 0; i < patchBytes.length; i++) {
    patchOffsets[i] = offset;
    offset += patchBytes[i].length;
  }
  
  const patchSize = offset;
  const patchSizeHeader = new Uint8Array(4);
  new DataView(patchSizeHeader.buffer).setUint32(0, patchSize, true);
  chunks.push(patchSizeHeader);
  
  // Patch offset table
  const offsetTable = new Uint8Array(patchOffsets.buffer);
  chunks.push(offsetTable);
  
  // Patch data
  for (const patch of patchBytes) {
    chunks.push(patch);
  }
  
  // Speech data (none)
  const speechHeader = new Uint8Array(4);
  new DataView(speechHeader.buffer).setUint32(0, 0, true);
  chunks.push(speechHeader);
  
  // Combine all chunks
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let writeOffset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  
  return result;
}

/**
 * Create a downloadable V2M file
 */
export function downloadV2M(
  patterns: Pattern[],
  patternSequence: number[],
  instruments: InstrumentConfig[],
  filename: string,
  options?: V2MExportOptions
): void {
  const data = exportV2M(patterns, patternSequence, instruments, options);
  // Create blob from Uint8Array - cast buffer to ArrayBuffer for TypeScript
  const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.v2m') ? filename : `${filename}.v2m`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
