/**
 * DB303 Pattern Converter
 * Utilities for importing/exporting db303.pages.dev XML patterns
 */

import type { Pattern, TrackerCell } from '@typedefs/tracker';

interface Db303Step {
  index: number;
  key: number;        // 0-11 (C=0, C#=1, ..., B=11)
  octave: number;     // -2 to +2 (relative to base)
  gate: boolean;      // Note on/off
  accent: boolean;
  slide: boolean;
  mute: boolean;      // Muted step (no sound)
  hammer: boolean;    // Hammer-on (legato without pitch glide)
}

/**
 * Parse db303 pattern XML string into Pattern format
 * @param xmlString - The XML string to parse
 * @param patternName - Name for the pattern
 * @param instrumentId - Optional instrument ID to assign to notes (default: 1)
 * @returns Object with pattern and optional tempo/swing settings
 */
export function parseDb303Pattern(xmlString: string, patternName: string = 'DB303 Pattern', instrumentId: number = 1): { pattern: Pattern; tempo?: number; swing?: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parsing errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid XML: ' + parserError.textContent);
  }

  const patternNode = doc.querySelector('db303-pattern');
  if (!patternNode) {
    throw new Error('Invalid pattern XML: missing db303-pattern element');
  }

  // Parse and validate numSteps (1-256 range)
  const rawNumSteps = parseInt(patternNode.getAttribute('numSteps') || '16', 10);
  const numSteps = Math.max(1, Math.min(256, isNaN(rawNumSteps) ? 16 : rawNumSteps));
  
  // Parse rootNote (default: 36 = C2)
  const rootNote = parseInt(patternNode.getAttribute('rootNote') || '36', 10);
  
  // Parse tempo (BPM) and swing (0-1)
  const tempo = patternNode.getAttribute('tempo') ? parseInt(patternNode.getAttribute('tempo')!, 10) : undefined;
  const swing = patternNode.getAttribute('swing') ? parseFloat(patternNode.getAttribute('swing')!) : undefined;
  
  const steps: Db303Step[] = [];

  // Parse all step elements
  const stepNodes = doc.querySelectorAll('step');
  stepNodes.forEach((stepNode) => {
    const index = parseInt(stepNode.getAttribute('index') || '0', 10);
    const key = parseInt(stepNode.getAttribute('key') || '0', 10);
    const octave = parseInt(stepNode.getAttribute('octave') || '0', 10);
    const gate = stepNode.getAttribute('gate') === 'true';
    const accent = stepNode.getAttribute('accent') === 'true';
    const slide = stepNode.getAttribute('slide') === 'true';
    const mute = stepNode.getAttribute('mute') === 'true';
    const hammer = stepNode.getAttribute('hammer') === 'true';

    steps.push({ index, key, octave, gate, accent, slide, mute, hammer });
  });

  // Sort by index to ensure correct order
  steps.sort((a, b) => a.index - b.index);

  // Convert steps array to Map for O(1) lookup (performance optimization)
  const stepMap = new Map(steps.map(s => [s.index, s]));

  // Convert steps to TrackerCell format
  // DB303 behavior: gate=false (REST) immediately releases the note.
  // We insert note-off (value 97) on REST steps to match this behavior.
  const rows: TrackerCell[] = [];
  let lastGatedStep = -1; // Track if we need to release on REST
  
  for (let i = 0; i < numSteps; i++) {
    const step = stepMap.get(i);
    if (step) {
      // Convert db303 format to tracker note format
      // db303: rootNote (MIDI note) + key (0-11) + octave (-2 to +2) * 12
      // 
      // XM note format: 1 = C-0 (MIDI 12), so XM = MIDI - 11
      // Example: MIDI 36 (C2) → XM 25 (C-2)
      let note: number = 0;
      
      if (step.gate) {
        // Calculate MIDI note: rootNote + key + (octave * 12)
        const midiNote = rootNote + step.key + (step.octave * 12);
        // Convert MIDI to XM note: MIDI 12 = XM 1 (C-0)
        note = midiNote - 11;

        // Clamp to valid range (1-96)
        note = Math.max(1, Math.min(96, note));
        lastGatedStep = i;
      } else {
        // REST (gate=false) - ALWAYS releases the note in DB303!
        // DB303 sequencer behavior: A rest immediately releases regardless of slide flag.
        // The slide flag on the previous step doesn't cause sustain through a rest.
        if (lastGatedStep >= 0) {
          // Insert note-off (97) to release the note
          note = 97;
        }
        // else: leave as 0 (empty) if we're already silent
      }

      rows.push({
        note,
        instrument: step.gate ? instrumentId : 0, // Only set instrument on gated notes
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
        // DB303 flags: 1=accent, 2=slide, 3=mute, 4=hammer
        flag1: step.accent ? 1 : (step.mute ? 3 : (step.hammer ? 4 : undefined)),
        flag2: step.slide ? 2 : (step.hammer && !step.accent && !step.mute ? 4 : undefined),
      });
    } else {
      // Empty step
      rows.push({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
      });
    }
  }

  // Create pattern with single channel
  // Note: instrumentId will be set by the loader to the first TB-303 instrument
  const pattern: Pattern = {
    id: `db303-${Date.now()}`,
    name: patternName,
    length: numSteps,
    channels: [
      {
        id: 'ch-1',
        name: 'TB-303',
        rows: rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null, // Will be set by loader
        color: '#22c55e', // Green for 303
      },
    ],
  };

  return { pattern, tempo, swing };
}

/**
 * Convert DEViLBOX Pattern to db303 XML pattern string
 * Takes the first channel's data
 * @param pattern - The pattern to convert
 * @param tempo - BPM (default: 120)
 * @param swing - Swing amount 0-1 (default: 0)
 * @param rootNote - MIDI root note (default: 36 = C2)
 */
export function convertToDb303Pattern(
  pattern: Pattern,
  tempo: number = 120,
  swing: number = 0,
  rootNote: number = 36
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Validate pattern has at least one channel
  const channel = pattern.channels?.[0];
  if (!channel) {
    throw new Error('Pattern has no channels to export');
  }

  const numSteps = Math.min(pattern.length, 32); // db303 supports up to 32 steps

  // Format swing to 2 decimal places if non-zero
  const swingStr = swing > 0 ? ` swing="${swing.toFixed(2)}"` : '';
  
  lines.push(`<db303-pattern version="1.0" numSteps="${numSteps}" tempo="${Math.round(tempo)}"${swingStr} rootNote="${rootNote}">`);

  // Convert each row to a step
  for (let i = 0; i < numSteps; i++) {
    const cell = channel?.rows[i];
    if (!cell) {
      // Empty step
      lines.push(`  <step index="${i}" key="0" octave="0" gate="false" accent="false" slide="false" mute="false" hammer="false"/>`);
      continue;
    }

    const hasNote = cell.note > 0 && cell.note <= 96;
    const gate = hasNote;
    const accent = (cell.flag1 === 1 || cell.flag2 === 1);
    const slide = (cell.flag1 === 2 || cell.flag2 === 2);
    const mute = (cell.flag1 === 3 || cell.flag2 === 3);
    const hammer = (cell.flag1 === 4 || cell.flag2 === 4);

    let key = 0;
    let octave = 0;

    if (hasNote) {
      // Convert tracker note to db303 format
      // Tracker note is 1-based MIDI note (C-0 = 1)
      // db303: key (0-11) + octave relative to rootNote
      const midiNote = cell.note - 1; // Convert to 0-based MIDI
      
      // Calculate relative to rootNote
      const relativeNote = midiNote - rootNote;
      octave = Math.floor(relativeNote / 12);
      key = ((relativeNote % 12) + 12) % 12; // Handle negative modulo
      
      // Clamp octave to valid range (-1 to +1 for db303 standard)
      octave = Math.max(-1, Math.min(1, octave));
    }

    lines.push(`  <step index="${i}" key="${key}" octave="${octave}" gate="${gate}" accent="${accent}" slide="${slide}" mute="${mute}" hammer="${hammer}"/>`);
  }

  lines.push('</db303-pattern>');
  return lines.join('\n');
}

/**
 * Download a pattern as db303 XML file
 * @param pattern - The pattern to export
 * @param filename - Filename (without extension)
 * @param tempo - BPM
 * @param swing - Swing amount 0-1
 * @param rootNote - MIDI root note (default: 36 = C2)
 */
export function downloadDb303Pattern(
  pattern: Pattern,
  filename: string = 'pattern',
  tempo: number = 120,
  swing: number = 0,
  rootNote: number = 36
): void {
  const xml = convertToDb303Pattern(pattern, tempo, swing, rootNote);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Helper to create an empty db303 pattern
 */
export function createEmptyDb303Pattern(numSteps: number = 16, name: string = 'New Pattern'): Pattern {
  const rows: TrackerCell[] = [];
  for (let i = 0; i < numSteps; i++) {
    rows.push({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
    });
  }

  return {
    id: `db303-${Date.now()}`,
    name: name,
    length: numSteps,
    channels: [
      {
        id: 'ch-1',
        name: 'TB-303',
        rows: rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: '#22c55e',
      },
    ],
  };
}

/**
 * Export the current pattern from the tracker to db303 XML format.
 * Call from browser console: exportCurrentPatternToDb303()
 * 
 * @param channelIndex - Which channel to export (default: 0, the first 303 channel)
 * @param filename - Optional filename (default: pattern name)
 */
export async function exportCurrentPatternToDb303(
  channelIndex: number = 0,
  filename?: string
): Promise<void> {
  // Dynamically import stores to avoid circular dependencies
  const { useTrackerStore } = await import('@stores/useTrackerStore');
  const { useTransportStore } = await import('@stores/useTransportStore');
  
  const trackerState = useTrackerStore.getState();
  const transportState = useTransportStore.getState();
  
  const patterns = trackerState.patterns;
  const currentPatternIndex = trackerState.currentPatternIndex;
  
  if (!patterns || patterns.length === 0) {
    console.error('No patterns loaded');
    return;
  }
  
  const pattern = patterns[currentPatternIndex];
  if (!pattern) {
    console.error(`Pattern ${currentPatternIndex} not found`);
    return;
  }
  
  // If channelIndex is specified and > 0, create a modified pattern with just that channel
  let exportPattern = pattern;
  if (channelIndex > 0 && pattern.channels[channelIndex]) {
    exportPattern = {
      ...pattern,
      channels: [pattern.channels[channelIndex]]
    };
  }
  
  const tempo = transportState.bpm || 120;
  const swing = transportState.swing || 0;
  
  // Use rootNote 36 (C2) as default - this matches the db303 default
  const rootNote = 36;
  
  const exportFilename = filename || pattern.name?.replace(/[^a-zA-Z0-9-_]/g, '_') || 'pattern';
  
  console.log(`Exporting pattern "${pattern.name}" (${pattern.length} steps) at ${tempo} BPM, swing ${(swing * 100).toFixed(0)}%`);
  
  downloadDb303Pattern(exportPattern, exportFilename, tempo, swing, rootNote);
  
  console.log(`Downloaded: ${exportFilename}.xml`);
  console.log('You can import this file at https://db303.pages.dev/');
}

// Expose export function to browser console
if (typeof window !== 'undefined') {
  const win = window as Window & {
    exportCurrentPatternToDb303?: typeof exportCurrentPatternToDb303;
    convertToDb303Pattern?: typeof convertToDb303Pattern;
    downloadDb303Pattern?: typeof downloadDb303Pattern;
  };
  win.exportCurrentPatternToDb303 = exportCurrentPatternToDb303;
  win.convertToDb303Pattern = convertToDb303Pattern;
  win.downloadDb303Pattern = downloadDb303Pattern;
}
