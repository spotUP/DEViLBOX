/**
 * Convert an Amiga Paula period value to a MIDI note number and display string.
 *
 * Amiga PAL clock: 3,546,895 Hz
 * Formula: frequency = clock / (2 * period)
 * MIDI note: 69 + 12 * log2(frequency / 440)
 */

const PAL_CLOCK = 3_546_895;
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export function amigaPeriodToNote(period: number): { note: number; name: string; octave: number } | null {
  if (period <= 0 || period > 65535) return null;
  const frequency = PAL_CLOCK / (2 * period);
  // Use 21 instead of 69 to shift 4 octaves down: the PAL clock formula gives the
  // Paula DMA *sample rate* (4–16 kHz range), not the fundamental pitch frequency.
  // Period 428 (ProTracker C-3) → MIDI 60 → displayed as C-5 in FT2/XM convention.
  const midiNote  = Math.round(21 + 12 * Math.log2(frequency / 440));
  if (midiNote < 0 || midiNote > 127) return null;
  // FT2 convention: octave 5 = middle (C-5 = MIDI 60), so no -1 offset.
  const octave = Math.floor(midiNote / 12);
  const name   = NOTE_NAMES[midiNote % 12] + octave;
  return { note: midiNote, name, octave };
}
