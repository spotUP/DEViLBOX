/**
 * XRNS (Renoise) Parser
 * 
 * Parses Renoise .xrns files and extracts:
 * - Song metadata (BPM, LPB, name)
 * - Patterns with note data
 * - Instruments (including WaveSabre VST parameters)
 */

import JSZip from 'jszip';
import type { SlaughterConfig, FalconConfig } from '@typedefs/wavesabreInstrument';
import { DEFAULT_SLAUGHTER_CONFIG, DEFAULT_FALCON_CONFIG } from '@typedefs/wavesabreInstrument';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface XRNSSong {
  name: string;
  artist: string;
  bpm: number;
  lpb: number; // Lines per beat
  ticksPerLine: number;
  patterns: XRNSPattern[];
  instruments: XRNSInstrument[];
  sequence: number[]; // Pattern indices
}

export interface XRNSPattern {
  lines: number;
  tracks: XRNSTrack[];
}

export interface XRNSTrack {
  lines: Map<number, XRNSLine>;
}

export interface XRNSLine {
  noteColumns: XRNSNoteColumn[];
  effectColumns?: XRNSEffectColumn[];
}

export interface XRNSNoteColumn {
  note?: string;        // "C-4", "OFF", etc.
  instrument?: number;  // 0-255
  volume?: number;      // 0-128
  panning?: number;     // 0-128
  delay?: number;       // 0-255
}

export interface XRNSEffectColumn {
  number?: string;  // Effect command (e.g., "0A")
  value?: number;   // Effect value
}

export interface XRNSInstrument {
  name: string;
  pluginIdentifier?: string;  // "Slaughter", "Falcon", "Oidos", "Tunefish", etc.
  parameters: number[];       // 0-1 normalized values
  parameterChunk?: string;    // Base64 encoded chunk data
}

// ═══════════════════════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════════════════════

export async function parseXRNS(data: ArrayBuffer): Promise<XRNSSong> {
  const zip = await JSZip.loadAsync(data);
  const songXml = await zip.file('Song.xml')?.async('string');
  
  if (!songXml) {
    throw new Error('Invalid XRNS file: missing Song.xml');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(songXml, 'text/xml');
  
  // Parse global data
  const globalData = doc.querySelector('GlobalSongData');
  const name = getText(globalData, 'SongName') || 'Untitled';
  const artist = getText(globalData, 'Artist') || 'Unknown';
  const bpm = parseFloat(getText(globalData, 'BeatsPerMin') || '120');
  const lpb = parseInt(getText(globalData, 'LinesPerBeat') || '4');
  const ticksPerLine = parseInt(getText(globalData, 'TicksPerLine') || '12');

  // Parse instruments
  const instruments = parseInstruments(doc);

  // Parse patterns
  const patterns = parsePatterns(doc);

  // Parse sequence
  const sequence = parseSequence(doc);

  return {
    name,
    artist,
    bpm,
    lpb,
    ticksPerLine,
    patterns,
    instruments,
    sequence,
  };
}

function getText(parent: Element | null, selector: string): string | null {
  if (!parent) return null;
  const el = parent.querySelector(selector);
  return el?.textContent || null;
}

function parseInstruments(doc: Document): XRNSInstrument[] {
  const instruments: XRNSInstrument[] = [];
  const instrumentNodes = doc.querySelectorAll('Instruments > Instrument');

  // First pass: extract all instruments and their plugin info
  instrumentNodes.forEach((node) => {
    const name = getText(node, 'Name') || 'Instrument';
    
    // Look for VST plugin inside PluginProperties > PluginDevice
    const pluginProperties = node.querySelector('PluginProperties');
    const pluginDevice = pluginProperties?.querySelector('PluginDevice[type="AudioPluginDevice"]')
      || pluginProperties?.querySelector('PluginDevice')
      || node.querySelector('PluginDevice[type="AudioPluginDevice"]')
      || node.querySelector('PluginDevice');
    
    // Also check PluginGenerator for some plugin types
    const pluginGenerator = node.querySelector('PluginGenerator');
    const generatorPluginDevice = pluginGenerator?.querySelector('PluginDevice');
    
    // Get plugin identifier from various locations
    let pluginIdentifier = getText(pluginDevice, 'PluginIdentifier') || undefined;
    if (!pluginIdentifier && generatorPluginDevice) {
      pluginIdentifier = getText(generatorPluginDevice, 'PluginIdentifier') || undefined;
    }
    // Also try PluginName as fallback
    if (!pluginIdentifier) {
      pluginIdentifier = getText(pluginDevice, 'PluginName') || undefined;
    }
    if (!pluginIdentifier && generatorPluginDevice) {
      pluginIdentifier = getText(generatorPluginDevice, 'PluginName') || undefined;
    }
    
    // Get alias index - instruments can reference another instrument's plugin
    const aliasIndexStr = getText(pluginProperties, 'AliasInstrumentIndex');
    const aliasIndex = aliasIndexStr ? parseInt(aliasIndexStr, 10) : -1;
    
    const parameterChunk = getText(pluginDevice, 'ParameterChunk') 
      || getText(generatorPluginDevice ?? null, 'ParameterChunk') 
      || undefined;
    
    // Extract parameters from various locations
    const parameters: number[] = [];
    const paramNodes = pluginDevice?.querySelectorAll('Parameters > Parameter > Value')
      || generatorPluginDevice?.querySelectorAll('Parameters > Parameter > Value');
    paramNodes?.forEach((paramNode) => {
      const value = parseFloat(paramNode.textContent || '0');
      parameters.push(value);
    });

    instruments.push({
      name,
      pluginIdentifier,
      parameters,
      parameterChunk,
      _aliasIndex: aliasIndex, // Internal: for second pass resolution
    } as XRNSInstrument & { _aliasIndex?: number });
  });

  // Second pass: resolve alias instruments
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i] as XRNSInstrument & { _aliasIndex?: number };
    if (inst._aliasIndex !== undefined && inst._aliasIndex >= 0 && inst._aliasIndex < instruments.length) {
      const source = instruments[inst._aliasIndex];
      // Copy plugin info from source if this instrument has none
      if (!inst.pluginIdentifier && source.pluginIdentifier) {
        inst.pluginIdentifier = source.pluginIdentifier;
        console.log(`[XRNSParser] Instrument ${i} "${inst.name}" inherits plugin "${source.pluginIdentifier}" from instrument ${inst._aliasIndex}`);
      }
      if (inst.parameters.length === 0 && source.parameters.length > 0) {
        inst.parameters = source.parameters;
      }
      if (!inst.parameterChunk && source.parameterChunk) {
        inst.parameterChunk = source.parameterChunk;
      }
    }
    delete inst._aliasIndex; // Clean up internal property
    
    // Debug logging
    if (inst.pluginIdentifier || inst.parameters.length > 0 || inst.parameterChunk) {
      console.log(`[XRNSParser] Instrument ${i} "${inst.name}": plugin=${inst.pluginIdentifier}, params=${inst.parameters.length}, hasChunk=${!!inst.parameterChunk}`);
    }
  }

  return instruments;
}

function parsePatterns(doc: Document): XRNSPattern[] {
  const patterns: XRNSPattern[] = [];
  const patternNodes = doc.querySelectorAll('PatternPool > Patterns > Pattern');
  
  console.log('[XRNSParser] Found', patternNodes.length, 'patterns');

  patternNodes.forEach((patternNode, patIdx) => {
    const lines = parseInt(getText(patternNode, 'NumberOfLines') || '64');
    const tracks: XRNSTrack[] = [];

    const trackNodes = patternNode.querySelectorAll('Tracks > PatternTrack');
    let totalNotes = 0;
    trackNodes.forEach((trackNode) => {
      const track: XRNSTrack = { lines: new Map() };
      
      const lineNodes = trackNode.querySelectorAll('Lines > Line');
      lineNodes.forEach((lineNode) => {
        const index = parseInt(lineNode.getAttribute('index') || '0');
        const noteColumns: XRNSNoteColumn[] = [];
        const effectColumns: XRNSEffectColumn[] = [];

        // Parse note columns
        const noteColNodes = lineNode.querySelectorAll('NoteColumns > NoteColumn');
        noteColNodes.forEach((colNode) => {
          const noteCol: XRNSNoteColumn = {};
          
          const note = getText(colNode, 'Note');
          if (note) noteCol.note = note;
          
          const inst = getText(colNode, 'Instrument');
          if (inst) noteCol.instrument = parseInt(inst, 16);
          
          const vol = getText(colNode, 'Volume');
          if (vol) noteCol.volume = parseInt(vol, 16);
          
          const pan = getText(colNode, 'Panning');
          if (pan) noteCol.panning = parseInt(pan, 16);
          
          const delay = getText(colNode, 'Delay');
          if (delay) noteCol.delay = parseInt(delay, 16);

          noteColumns.push(noteCol);
          if (noteCol.note) totalNotes++;
        });

        // Parse effect columns
        const effectColNodes = lineNode.querySelectorAll('EffectColumns > EffectColumn');
        effectColNodes.forEach((colNode) => {
          const effectCol: XRNSEffectColumn = {};
          
          const num = getText(colNode, 'Number');
          if (num) effectCol.number = num;
          
          const val = getText(colNode, 'Value');
          if (val) effectCol.value = parseInt(val, 16);

          effectColumns.push(effectCol);
        });

        track.lines.set(index, {
          noteColumns,
          effectColumns: effectColumns.length > 0 ? effectColumns : undefined,
        });
      });

      tracks.push(track);
    });

    if (patIdx < 5) {
      console.log(`[XRNSParser] Pattern ${patIdx}: ${lines} lines, ${tracks.length} tracks, ${totalNotes} notes`);
    }
    patterns.push({ lines, tracks });
  });

  return patterns;
}

function parseSequence(doc: Document): number[] {
  const sequence: number[] = [];
  const entryNodes = doc.querySelectorAll('PatternSequence > SequenceEntries > SequenceEntry');

  entryNodes.forEach((node) => {
    const pattern = parseInt(getText(node, 'Pattern') || '0');
    sequence.push(pattern);
  });

  return sequence;
}

// ═══════════════════════════════════════════════════════════════════════════
// Conversion helpers (for use by ModuleConverter)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert XRNS note string to MIDI note number
 * Returns 0 for empty/no note, 97 for note off
 */
export function xrnsNoteToMidi(xrnsNote: string): number {
  if (!xrnsNote || xrnsNote === '---') return 0; // Empty
  if (xrnsNote === 'OFF') return 97; // Note off
  
  // Parse "C-4" format
  const match = xrnsNote.match(/^([A-G])([#-])(\d)$/);
  if (!match) return 0;
  
  const [, noteLetter, accidental, octaveStr] = match;
  const noteMap: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
  };
  
  let midi = noteMap[noteLetter] ?? 0;
  if (accidental === '#') midi += 1;
  midi += (parseInt(octaveStr) + 1) * 12;
  
  // XM format: 1-96 = notes (1 = C-0), 97 = note off
  return Math.min(96, Math.max(1, midi));
}

/**
 * Map WaveSabre Slaughter parameters to our SlaughterConfig
 */
export function mapSlaughterParams(params: number[]): SlaughterConfig {
  const config = { ...DEFAULT_SLAUGHTER_CONFIG };
  
  // WaveSabre Slaughter parameter order (from source):
  // 0: Osc1Waveform, 1: PulseWidth, 2: FilterType, 3: Cutoff
  // 4: Resonance, 5: FilterModAmt, 6: Attack, 7: Decay
  // 8: Sustain, 9: Release, 10: Master, 11: Voices
  // 12: Spread, 13: Detune
  if (params.length >= 14) {
    config.waveform = params[0] ?? 0;
    config.pulseWidth = params[1] ?? 0.5;
    config.filterType = params[2] ?? 0;
    config.cutoff = params[3] ?? 0.5;
    config.resonance = params[4] ?? 0.3;
    config.filterEnvAmount = params[5] ?? 0.5;
    config.ampAttack = params[6] ?? 0.01;
    config.ampDecay = params[7] ?? 0.3;
    config.ampSustain = params[8] ?? 0.7;
    config.ampRelease = params[9] ?? 0.3;
    config.gain = params[10] ?? 0.5;
    config.voices = Math.max(1, Math.floor((params[11] ?? 0) * 8));
    config.spread = params[12] ?? 0.5;
    config.detune = params[13] ?? 0.1;
  }
  
  return config;
}

/**
 * Map WaveSabre Falcon parameters to our FalconConfig
 */
export function mapFalconParams(params: number[]): FalconConfig {
  const config = { ...DEFAULT_FALCON_CONFIG };
  
  // WaveSabre Falcon parameter order (from source):
  if (params.length >= 10) {
    config.osc1Waveform = params[0] ?? 0;
    config.fmAmount = params[1] ?? 0.3;
    config.fmCoarse = params[2] ?? 0.125;
    config.feedback = params[3] ?? 0.1;
    config.attack1 = params[4] ?? 0.01;
    config.decay1 = params[5] ?? 0.3;
    config.sustain1 = params[6] ?? 0.5;
    config.release1 = params[7] ?? 0.3;
    config.gain = params[8] ?? 0.5;
    config.voices = Math.max(1, Math.floor((params[9] ?? 0) * 8));
  }
  
  return config;
}

/**
 * Get synth type from XRNS instrument
 */
export function getXRNSSynthType(xrnsInst: XRNSInstrument): string {
  if (!xrnsInst.pluginIdentifier) return 'sampler';
  
  const pluginName = xrnsInst.pluginIdentifier.toLowerCase();
  
  // WaveSabre synths
  if (pluginName === 'slaughter') return 'wavesabre-slaughter';
  if (pluginName === 'falcon') return 'wavesabre-falcon';
  if (pluginName === 'adultery') return 'wavesabre-adultery';
  if (pluginName === 'specimen') return 'wavesabre-specimen'; // sampler
  
  // Demoscene synths
  if (pluginName.includes('oidos')) return 'oidos';
  if (pluginName.includes('tunefish')) return 'tunefish';
  
  console.log(`[XRNSParser] Unknown plugin: ${xrnsInst.pluginIdentifier}`);
  return 'sampler';
}
