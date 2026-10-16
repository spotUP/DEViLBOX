import type { PitchModelOutput } from '../pitchNotes';

/**
 * Basic Pitch output shaped on a measured sung take: onsets peak ~0.52,
 * frames sit ~0.35-0.4 and sag inside each note. Three notes: 52, 48, 43.
 */
export const SUNG_TAKE_PITCHES = [52, 48, 43];

export function sungTakeModelOutput(): PitchModelOutput {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  const sung = [
    { start: 10, end: 30, midi: 52 },
    { start: 40, end: 60, midi: 48 },
    { start: 70, end: 90, midi: 43 },
  ];
  for (let f = 0; f < 100; f++) {
    const fr = new Array(88).fill(0);
    const on = new Array(88).fill(0);
    for (const s of sung) {
      if (f >= s.start && f < s.end) fr[s.midi - 21] = f % 2 ? 0.35 : 0.4;
      if (f === s.start) on[s.midi - 21] = 0.52;
    }
    frames.push(fr);
    onsets.push(on);
    contours.push(new Array(264).fill(0));
  }
  return { frames, onsets, contours };
}
