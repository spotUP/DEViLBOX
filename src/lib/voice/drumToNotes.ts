/**
 * drumToNotes.ts - classified drum hits to pattern cells, through the same
 * quantiser and writer as melody notes (one undo step).
 *
 * Hits become one-row "notes" per class, are quantised per class (the nearest
 * row, swing, latency nudge), merged onto one channel (the louder hit wins a
 * shared row) and written with the class's instrument. Drum hits get no
 * note-off.
 */
import { DRUM_CLASSES, type DrumClass, type DrumHit } from './drumHits';
import { quantiseNotes, type QuantisedNote, type QuantiseSettings } from './quantise';
import { writeNotesToPattern, type WriteResult, type WriteTarget } from './writeToPattern';
import { playableDrumMap, DRUM_808_VOICE, DRUM_808_MIDI } from './voiceInstruments';

export interface DrumTarget {
  instrumentId: number;
  /** MIDI note the hit is written as (60 = C-4) */
  midi: number;
}

export type DrumMap = Record<DrumClass, DrumTarget>;

/** General-MIDI-style default notes: kick C-2, snare D-2, hat F#-2, clap D#-2. */
export const DEFAULT_DRUM_NOTES: Record<DrumClass, number> = { kick: 36, snare: 38, hat: 42, clap: 39 };

const NAME_HINTS: Record<DrumClass, RegExp> = {
  kick: /kick|bd|bass\s*drum/i,
  snare: /snare|sd/i,
  hat: /hat|hh|hihat/i,
  clap: /clap|cp/i,
};

/**
 * Default map: the song's TR-808 voice for the class (at C-4), else an
 * instrument whose name mentions the class, else `fallbackInstrumentId`.
 * Silent targets are swapped for 808 voices at commit (commitDrumHits).
 */
export function defaultDrumMap(
  instruments: readonly { id: number; name: string; synthType?: string; parameters?: Record<string, unknown> }[],
  fallbackInstrumentId: number,
): DrumMap {
  const map = {} as DrumMap;
  for (const drum of DRUM_CLASSES) {
    const tr808 = instruments.find((i) => i.synthType === 'TR808' && i.parameters?.io808Type === DRUM_808_VOICE[drum]);
    map[drum] = tr808
      ? { instrumentId: tr808.id, midi: DRUM_808_MIDI }
      : {
          instrumentId: instruments.find((i) => NAME_HINTS[drum].test(i.name))?.id ?? fallbackInstrumentId,
          midi: DEFAULT_DRUM_NOTES[drum],
        };
  }
  return map;
}

/** Pure part: hits to quantised cells (unique rows, ascending). */
export function quantiseHits(hits: readonly DrumHit[], map: DrumMap, q: QuantiseSettings): QuantisedNote[] {
  const byRow = new Map<number, QuantisedNote>();
  for (const drum of DRUM_CLASSES) {
    const target = map[drum];
    const notes = hits
      .filter((h) => h.drum === drum)
      .map((h) => ({ startTimeSeconds: h.timeSeconds, durationSeconds: 0.01, pitchMidi: target.midi, amplitude: h.strength }));
    for (const n of quantiseNotes(notes, q)) {
      const prev = byRow.get(n.row);
      if (!prev || prev.velocity < n.velocity) {
        byRow.set(n.row, { ...n, lengthRows: 1, instrumentId: target.instrumentId, noteOff: false });
      }
    }
  }
  return [...byRow.values()].sort((a, b) => a.row - b.row);
}

/** The drum classes the take has hits for. */
export function usedDrumClasses(hits: readonly DrumHit[]): DrumClass[] {
  return DRUM_CLASSES.filter((d) => hits.some((h) => h.drum === d));
}

/**
 * Quantise and write; null when there is nothing to write. A class mapped to a
 * silent or missing instrument plays its TR-808 voice at C-4; `drumMap` is the
 * map the hits were written with.
 */
export function commitDrumHits(
  hits: readonly DrumHit[],
  map: DrumMap,
  quantise: QuantiseSettings,
  target: WriteTarget,
): (WriteResult & { drumMap: DrumMap }) | null {
  if (quantiseHits(hits, map, quantise).length === 0) return null;
  const drumMap = playableDrumMap(map, usedDrumClasses(hits));
  return { ...writeNotesToPattern(quantiseHits(hits, drumMap, quantise), target), drumMap };
}
