/**
 * V2M to DEViLBOX Pattern Converter
 * 
 * Converts V2M note events to DEViLBOX tracker patterns.
 * Maps 16 V2M MIDI channels to DEViLBOX channels with V2 synths.
 */

import type { Pattern, ChannelData, TrackerCell } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
import { parseV2M, patchBytesToConfig, globalBytesToEffects, getV2MActiveChannels } from './V2MParser';
import type { V2MFile } from './V2MParser';

/**
 * Options for V2M import
 */
export interface V2MImportOptions {
  /** Target rows per pattern (default: 64) */
  rowsPerPattern?: number;
  /** BPM to use (V2M doesn't store BPM, default: 120) */
  bpm?: number;
  /** Speed/ticks per row (default: 6) */
  speed?: number;
  /** Whether to create instruments for each V2M patch */
  createInstruments?: boolean;
}

/**
 * Result of V2M import
 */
export interface V2MImportResult {
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  globalEffects: ReturnType<typeof globalBytesToEffects>;
  bpm: number;
  speed: number;
  /** Original V2M data for reference */
  v2m: V2MFile;
}

/**
 * Convert MIDI note number to DEViLBOX note value (1-96)
 */
function midiToNoteValue(midi: number): number {
  // MIDI 0-127, DEViLBOX 1-96 (C-0 to B-7)
  // Clamp to valid range
  const clamped = Math.max(0, Math.min(95, midi - 12)); // Shift down an octave
  return clamped + 1; // 1-based
}

/**
 * Create an empty tracker cell
 */
function emptyCell(): TrackerCell {
  return {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  };
}

/**
 * Create an empty channel
 */
function createChannel(id: string, name: string, numRows: number): ChannelData {
  const rows: TrackerCell[] = [];
  for (let r = 0; r < numRows; r++) {
    rows.push(emptyCell());
  }
  return {
    id,
    name,
    rows,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    channelMeta: {
      importedFromMOD: false,
      channelType: 'synth',
    },
  };
}

/**
 * Create an empty pattern
 */
function createPattern(id: string, numRows: number, numChannels: number): Pattern {
  const channels: ChannelData[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(createChannel(`ch${c}`, `V2 Ch ${c + 1}`, numRows));
  }
  return {
    id,
    name: `Pattern ${id}`,
    length: numRows,
    channels,
  };
}

/**
 * Import V2M file into DEViLBOX format
 */
export function importV2M(data: ArrayBuffer, options: V2MImportOptions = {}): V2MImportResult {
  const {
    rowsPerPattern = 64,
    bpm = 120,
    speed = 6,
    createInstruments = true,
  } = options;

  // Parse the V2M file
  const v2m = parseV2M(data);
  
  // Get active channels
  const activeChannels = getV2MActiveChannels(v2m);
  const numChannels = Math.max(activeChannels.length, 1);
  
  // Calculate timing
  // V2M timediv is ticks per beat
  const ticksPerRow = v2m.timediv / 4 * (speed / 6); // Adjusted for speed
  
  // Calculate total rows needed
  const totalTicks = v2m.maxTime;
  const totalRows = Math.ceil(totalTicks / ticksPerRow);
  const numPatterns = Math.ceil(totalRows / rowsPerPattern);
  
  // Create channel mapping (V2M channel -> DEViLBOX channel)
  const channelMap = new Map<number, number>();
  activeChannels.forEach((v2mCh, idx) => {
    channelMap.set(v2mCh, idx);
  });
  
  // Create patterns
  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    patterns.push(createPattern(String(p), rowsPerPattern, numChannels));
  }
  
  // Process each active channel
  for (const v2mChannel of activeChannels) {
    const dbChannel = channelMap.get(v2mChannel)!;
    const channel = v2m.channels[v2mChannel];
    
    // Track current program (instrument) for this channel
    let currentProgram = 0;
    let programIdx = 0;
    
    // Sort notes by time
    const sortedNotes = [...channel.notes].sort((a, b) => a.time - b.time);
    
    for (const note of sortedNotes) {
      // Find current program at this time
      while (programIdx < channel.programChanges.length - 1 &&
             channel.programChanges[programIdx + 1].time <= note.time) {
        programIdx++;
      }
      if (channel.programChanges.length > 0 && 
          channel.programChanges[programIdx].time <= note.time) {
        currentProgram = channel.programChanges[programIdx].program;
      }
      
      // Calculate row position
      const row = Math.floor(note.time / ticksPerRow);
      const patternIdx = Math.floor(row / rowsPerPattern);
      const rowInPattern = row % rowsPerPattern;
      
      if (patternIdx >= patterns.length) continue;
      
      const pattern = patterns[patternIdx];
      const cell = pattern.channels[dbChannel].rows[rowInPattern];
      
      // Set note (1-96 range)
      cell.note = midiToNoteValue(note.note);
      cell.instrument = currentProgram + 1; // 1-based instrument
      
      // Map velocity to volume (0-127 -> 0x10-0x50 volume column)
      if (note.velocity > 0 && note.velocity < 127) {
        cell.volume = 0x10 + Math.round((note.velocity / 127) * 0x40);
      }
    }
    
    // Add pitch bends as effects
    for (const pb of channel.pitchBends) {
      const row = Math.floor(pb.time / ticksPerRow);
      const patternIdx = Math.floor(row / rowsPerPattern);
      const rowInPattern = row % rowsPerPattern;
      
      if (patternIdx >= patterns.length) continue;
      
      const pattern = patterns[patternIdx];
      const cell = pattern.channels[dbChannel].rows[rowInPattern];
      
      // Convert pitch bend (0-16383, center=8192) to effect
      // Use E/F effects for fine slide up/down
      const centered = pb.value - 8192;
      if (centered !== 0) {
        const effType = centered > 0 ? 0x01 : 0x02; // 1=slide up, 2=slide down
        const amount = Math.min(Math.abs(centered) >> 6, 0xFF);
        cell.effTyp = effType;
        cell.eff = amount;
      }
    }
  }
  
  // Create instruments from patches
  const instruments: InstrumentConfig[] = [];
  
  if (createInstruments) {
    for (let i = 0; i < v2m.patches.length; i++) {
      const patchData = v2m.patches[i];
      const v2config = patchBytesToConfig(patchData);
      
      instruments.push({
        id: i + 1, // 1-indexed
        name: `V2 Patch ${i}`,
        type: 'synth',
        synthType: 'V2',
        // V2InstrumentConfig is more detailed than V2Config, cast for compatibility
        v2: v2config as unknown as InstrumentConfig['v2'],
        effects: [],
        volume: 0,
        pan: 0,
      });
    }
  }
  
  // Parse global effects
  const globalEffects = globalBytesToEffects(v2m.globals);
  
  return {
    patterns,
    instruments,
    globalEffects,
    bpm,
    speed,
    v2m,
  };
}

/**
 * Quick summary of V2M file contents
 */
export function getV2MSummary(data: ArrayBuffer): {
  duration: number;
  activeChannels: number[];
  patchCount: number;
  noteCount: number;
  maxTime: number;
  timediv: number;
} {
  const v2m = parseV2M(data);
  const activeChannels = getV2MActiveChannels(v2m);
  
  let noteCount = 0;
  for (const ch of activeChannels) {
    noteCount += v2m.channels[ch].notes.length;
  }
  
  // Estimate duration at 120 BPM
  const ticksPerSecond = (v2m.timediv * 120) / 60;
  const duration = v2m.maxTime / ticksPerSecond;
  
  return {
    duration,
    activeChannels,
    patchCount: v2m.patches.length,
    noteCount,
    maxTime: v2m.maxTime,
    timediv: v2m.timediv,
  };
}
