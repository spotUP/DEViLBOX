/**
 * DJ Knob Banks - MIDI knob assignments for DJ mode
 *
 * 4 pages of 8 knobs (CC 70-77) for DJ mixer, per-deck EQ/filter/pitch, and FX.
 * Used when isDJContext() is true in useMIDIStore.
 */

export interface DJKnobAssignment {
  cc: number;
  param: string; // DJ parameter path (e.g., 'dj.crossfader')
  label: string;
}

/** Page names for LCD display */
export const DJ_KNOB_PAGE_NAMES = ['DJ Mixer', 'Deck A', 'Deck B', 'DJ FX'];

export const DJ_KNOB_BANKS: DJKnobAssignment[][] = [
  // Page 0: Mixer
  [
    { cc: 70, param: 'dj.crossfader', label: 'X-Fade' },
    { cc: 71, param: 'dj.deckA.volume', label: 'Vol A' },
    { cc: 72, param: 'dj.deckB.volume', label: 'Vol B' },
    { cc: 73, param: 'dj.deckA.filter', label: 'Filt A' },
    { cc: 74, param: 'dj.deckB.filter', label: 'Filt B' },
    { cc: 75, param: 'dj.masterVolume', label: 'Master' },
    { cc: 76, param: 'dj.deckA.pitch', label: 'Pitch A' },
    { cc: 77, param: 'dj.deckB.pitch', label: 'Pitch B' },
  ],
  // Page 1: Deck A
  [
    { cc: 70, param: 'dj.deckA.eqHi', label: 'EQ Hi A' },
    { cc: 71, param: 'dj.deckA.eqMid', label: 'EQ Mid A' },
    { cc: 72, param: 'dj.deckA.eqLow', label: 'EQ Lo A' },
    { cc: 73, param: 'dj.deckA.pitch', label: 'Pitch A' },
    { cc: 74, param: 'dj.deckA.volume', label: 'Vol A' },
    { cc: 75, param: 'dj.deckA.filter', label: 'Filt A' },
    { cc: 76, param: 'dj.deckA.filterQ', label: 'Flt Q A' },
    { cc: 77, param: 'dj.crossfader', label: 'X-Fade' },
  ],
  // Page 2: Deck B
  [
    { cc: 70, param: 'dj.deckB.eqHi', label: 'EQ Hi B' },
    { cc: 71, param: 'dj.deckB.eqMid', label: 'EQ Mid B' },
    { cc: 72, param: 'dj.deckB.eqLow', label: 'EQ Lo B' },
    { cc: 73, param: 'dj.deckB.pitch', label: 'Pitch B' },
    { cc: 74, param: 'dj.deckB.volume', label: 'Vol B' },
    { cc: 75, param: 'dj.deckB.filter', label: 'Filt B' },
    { cc: 76, param: 'dj.deckB.filterQ', label: 'Flt Q B' },
    { cc: 77, param: 'dj.crossfader', label: 'X-Fade' },
  ],
  // Page 3: DJ FX (scratch patterns + effects)
  [
    { cc: 70, param: 'dj.deckA.scratchVelocity', label: 'Scr A' },
    { cc: 71, param: 'dj.deckB.scratchVelocity', label: 'Scr B' },
    { cc: 72, param: 'dj.deckA.filter', label: 'Filt A' },
    { cc: 73, param: 'dj.deckB.filter', label: 'Filt B' },
    { cc: 74, param: 'dj.deckA.eqLow', label: 'Lo A' },
    { cc: 75, param: 'dj.deckB.eqLow', label: 'Lo B' },
    { cc: 76, param: 'dj.masterVolume', label: 'Master' },
    { cc: 77, param: 'dj.crossfader', label: 'X-Fade' },
  ],
];
