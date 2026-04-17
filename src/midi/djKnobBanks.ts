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
export const DJ_KNOB_PAGE_NAMES = ['DJ EQ', 'DJ Mixer', 'DJ FX'];

export const DJ_KNOB_BANKS: DJKnobAssignment[][] = [
  // Page 0: EQ — row 1 = Deck A, row 2 = Deck B (Flt, Hi, Mid, Lo)
  [
    { cc: 70, param: 'dj.deckA.filter', label: 'Filt A' },
    { cc: 71, param: 'dj.deckA.eqHi', label: 'Hi A' },
    { cc: 72, param: 'dj.deckA.eqMid', label: 'Mid A' },
    { cc: 73, param: 'dj.deckA.eqLow', label: 'Lo A' },
    { cc: 74, param: 'dj.deckB.filter', label: 'Filt B' },
    { cc: 75, param: 'dj.deckB.eqHi', label: 'Hi B' },
    { cc: 76, param: 'dj.deckB.eqMid', label: 'Mid B' },
    { cc: 77, param: 'dj.deckB.eqLow', label: 'Lo B' },
  ],
  // Page 1: Mixer — row 1 = levels, row 2 = pitch/Q
  [
    { cc: 70, param: 'dj.crossfader', label: 'X-Fade' },
    { cc: 71, param: 'dj.deckA.volume', label: 'Vol A' },
    { cc: 72, param: 'dj.deckB.volume', label: 'Vol B' },
    { cc: 73, param: 'dj.masterVolume', label: 'Master' },
    { cc: 74, param: 'dj.deckA.pitch', label: 'Pitch A' },
    { cc: 75, param: 'dj.deckB.pitch', label: 'Pitch B' },
    { cc: 76, param: 'dj.deckA.filterQ', label: 'Flt Q A' },
    { cc: 77, param: 'dj.deckB.filterQ', label: 'Flt Q B' },
  ],
  // Page 2: FX — scratch, filters, bass, master
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
