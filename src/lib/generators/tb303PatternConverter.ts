/**
 * TB-303 Pattern Converter
 * Converts ML-303 pattern charts to DEViLBOX TrackerCell format
 */

import type { TrackerCell } from '@typedefs/tracker';
import { stringNoteToXM } from '@/lib/xmConversions';

export interface TB303PatternStep {
  note: string | null;        // e.g., "C", "C#", "D#"
  octaveUp: boolean;          // UP flag
  octaveDown: boolean;        // DOWN flag
  accent: boolean;            // ACC flag
  slide: boolean;             // SLIDE flag
  gate: boolean;              // Filled circle (note on)
  off: boolean;               // Empty circle (note off)
}

export interface TB303Pattern {
  name: string;
  waveform: 'SAW' | 'SQUARE';
  bpm?: number;
  steps: TB303PatternStep[];
}

/**
 * Convert note name + octave modifiers to full note name
 */
function getFullNoteName(note: string, octaveUp: boolean, octaveDown: boolean, baseOctave: number = 2): string {
  let octave = baseOctave;
  if (octaveUp) octave++;
  if (octaveDown) octave--;

  // Normalize note name (add hyphen if needed)
  const normalizedNote = note.length === 2 ? note : `${note}-`;

  return `${normalizedNote}${octave}`;
}

/**
 * Convert TB-303 pattern to TrackerCell array
 */
export function convertTB303Pattern(pattern: TB303Pattern, instrumentId: number = 0): TrackerCell[] {
  const baseOctave = 2; // TB-303 typically plays in octave 2-3 range

  return pattern.steps.map((step): TrackerCell => {
    // Empty step (rest)
    if (!step.note || !step.gate) {
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

    // Note step
    const noteName = getFullNoteName(step.note, step.octaveUp, step.octaveDown, baseOctave);
    const xmNote = stringNoteToXM(noteName);
    const volumeValue = step.accent ? 64 : 48; // 0x40 (max) : 0x30 (normal)
    const volume = 0x10 + volumeValue; // 0x10-0x50 = XM set volume range

    return {
      note: xmNote,
      instrument: instrumentId,
      volume,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
      flag1: step.accent ? 1 : undefined,
      flag2: step.slide ? 2 : undefined,
    };
  });
}

/**
 * Pad pattern to specified length
 */
export function padPattern(cells: TrackerCell[], targetLength: number): TrackerCell[] {
  const padded = [...cells];
  while (padded.length < targetLength) {
    padded.push({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
    });
  }
  return padded.slice(0, targetLength);
}
