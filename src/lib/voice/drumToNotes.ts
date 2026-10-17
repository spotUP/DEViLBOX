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
import { noteDelayEffect } from './noteEffects';
import { anchorToFirstNote, quantiseTime, type QuantisedNote, type QuantiseSettings } from './quantise';
import type { VoiceEffect } from './voiceEffects';
import { writeNotesToPattern, type TakeWriteResult, type WriteTarget } from './writeToPattern';
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
 * "No instrument": the commit creates the class's TR-808 voice for it. Never
 * a real instrument id (ids start at 1), so it is always a silent target.
 */
export const NEW_808_INSTRUMENT = 0;

/**
 * Default map: the song's TR-808 voice for the class (at C-4), else an
 * instrument whose name mentions the class, else NEW_808_INSTRUMENT. Never
 * the song's current instrument: a playable fallback hid every drum on the
 * melody synth and no 808 got created (owner report 2026-10-17).
 * Silent targets are swapped for 808 voices at commit (commitDrumHits).
 */
export function defaultDrumMap(
  instruments: readonly { id: number; name: string; synthType?: string; parameters?: Record<string, unknown> }[],
): DrumMap {
  const map = {} as DrumMap;
  for (const drum of DRUM_CLASSES) {
    const tr808 = instruments.find((i) => i.synthType === 'TR808' && i.parameters?.io808Type === DRUM_808_VOICE[drum]);
    map[drum] = tr808
      ? { instrumentId: tr808.id, midi: DRUM_808_MIDI }
      : {
          instrumentId: instruments.find((i) => NAME_HINTS[drum].test(i.name))?.id ?? NEW_808_INSTRUMENT,
          midi: DEFAULT_DRUM_NOTES[drum],
        };
  }
  return map;
}

/**
 * Pure part: hits to quantised cells (unique rows, ascending, the first hit
 * on row 0, see anchorToFirstNote). With `flams`,
 * two hits of one class inside a row become the first hit with a retrigger
 * (E9x, x ticks apart); a hit the quantiser pulled onto an earlier row gets a
 * note delay (EDx) so it still sounds where it was heard.
 */
export function quantiseHits(hits: readonly DrumHit[], map: DrumMap, q: QuantiseSettings, flams = true): QuantisedNote[] {
  const byRow = new Map<number, QuantisedNote>();
  const shift = q.latencyNudgeMs / 1000;
  const rowLength = (q.speed * 2.5) / q.bpm;
  const tickLength = 2.5 / q.bpm;
  const sorted = [...hits].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const lastOfClass = new Map<DrumClass, { time: number; note: QuantisedNote }>();
  for (const h of sorted) {
    const target = map[h.drum];
    const heard = h.timeSeconds - shift;
    if (heard + 0.01 <= 0) continue;
    const previous = lastOfClass.get(h.drum);
    if (flams && previous && heard - previous.time < rowLength && q.speed > 1) {
      const ticks = Math.max(1, Math.min(15, Math.round((heard - previous.time) / tickLength)));
      if (!previous.note.effects?.some((e) => e.kind === 'retrigger')) {
        previous.note.effects = [...(previous.note.effects ?? []), { kind: 'retrigger', param: ticks, rowOffset: 0 }];
      }
      continue;
    }
    const time = quantiseTime(Math.max(0, heard), q);
    const prev = byRow.get(time.row);
    if (!prev || prev.velocity < h.strength) {
      const delay = noteDelayEffect(time.offsetRows, q.speed);
      const effects: VoiceEffect[] = delay ? [delay] : [];
      const note: QuantisedNote = {
        row: time.row,
        offsetRows: time.offsetRows,
        heardSeconds: time.heardSeconds,
        lengthRows: 1,
        midi: target.midi,
        velocity: h.strength,
        instrumentId: target.instrumentId,
        ...(effects.length ? { effects } : {}),
        noteOff: false,
      };
      byRow.set(time.row, note);
      lastOfClass.set(h.drum, { time: heard, note });
    } else {
      lastOfClass.set(h.drum, { time: heard, note: prev });
    }
  }
  return anchorToFirstNote([...byRow.values()].sort((a, b) => a.row - b.row));
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
  flams = true,
): (TakeWriteResult & { drumMap: DrumMap }) | null {
  if (quantiseHits(hits, map, quantise, flams).length === 0) return null;
  const drumMap = playableDrumMap(map, usedDrumClasses(hits));
  return { ...writeNotesToPattern(quantiseHits(hits, drumMap, quantise, flams), target), drumMap };
}
