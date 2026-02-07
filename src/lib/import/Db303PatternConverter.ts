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
}

/**
 * Parse db303 pattern XML string into Pattern format
 */
export function parseDb303Pattern(xmlString: string, patternName: string = 'DB303 Pattern'): Pattern {
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

    steps.push({ index, key, octave, gate, accent, slide });
  });

  // Sort by index to ensure correct order
  steps.sort((a, b) => a.index - b.index);

  // Convert steps array to Map for O(1) lookup (performance optimization)
  const stepMap = new Map(steps.map(s => [s.index, s]));

  // Convert steps to TrackerCell format
  const rows: TrackerCell[] = [];
  for (let i = 0; i < numSteps; i++) {
    const step = stepMap.get(i);
    if (step) {
      // Convert db303 format to tracker note format
      // db303: octave -2 to +2, key 0-11
      // Tracker: C-0 = 1, C-1 = 13, C-2 = 25, etc.
      // Map db303 octave 0 to tracker octave 3 (C-3 = 37)
      let note: number = 0;
      if (step.gate) {
        const trackerOctave = step.octave + 3; // -2 → 1, -1 → 2, 0 → 3, 1 → 4, 2 → 5
        note = trackerOctave * 12 + step.key + 1;

        // Clamp to valid range (1-96)
        note = Math.max(1, Math.min(96, note));
      }

      rows.push({
        note: note as any,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
        flag1: step.accent ? 1 : undefined,
        flag2: step.slide ? 2 : undefined,
      });
    } else {
      // Empty step
      rows.push({
        note: 0 as any,
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
        instrumentId: null,
        color: '#22c55e', // Green for 303
      },
    ],
  };

  return pattern;
}

/**
 * Convert DEViLBOX Pattern to db303 XML pattern string
 * Takes the first channel's data
 */
export function convertToDb303Pattern(pattern: Pattern): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Validate pattern has at least one channel
  const channel = pattern.channels?.[0];
  if (!channel) {
    throw new Error('Pattern has no channels to export');
  }

  const numSteps = Math.min(pattern.length, 32); // db303 supports up to 32 steps

  lines.push(`<db303-pattern version="1.0" numSteps="${numSteps}">`);

  // Convert each row to a step
  for (let i = 0; i < numSteps; i++) {
    const cell = channel?.rows[i];
    if (!cell) {
      // Empty step
      lines.push(`  <step index="${i}" key="0" octave="0" gate="false" accent="false" slide="false"/>`);
      continue;
    }

    const hasNote = cell.note > 0 && cell.note <= 96;
    const gate = hasNote;
    const accent = (cell.flag1 === 1 || cell.flag2 === 1);
    const slide = (cell.flag1 === 2 || cell.flag2 === 2);

    let key = 0;
    let octave = 0;

    if (hasNote) {
      // Convert tracker note to db303 format
      // Tracker: C-0 = 1, C-1 = 13, C-2 = 25, etc.
      // db303: octave -2 to +2, key 0-11
      const noteValue = cell.note - 1; // Convert to 0-based
      const trackerOctave = Math.floor(noteValue / 12);
      key = noteValue % 12;
      octave = trackerOctave - 3; // Map tracker octave 3 to db303 octave 0

      // Clamp octave to valid range
      octave = Math.max(-2, Math.min(2, octave));
    }

    lines.push(`  <step index="${i}" key="${key}" octave="${octave}" gate="${gate}" accent="${accent}" slide="${slide}"/>`);
  }

  lines.push('</db303-pattern>');
  return lines.join('\n');
}

/**
 * Helper to create an empty db303 pattern
 */
export function createEmptyDb303Pattern(numSteps: number = 16, name: string = 'New Pattern'): Pattern {
  const rows: TrackerCell[] = [];
  for (let i = 0; i < numSteps; i++) {
    rows.push({
      note: 0 as any,
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
