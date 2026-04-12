const PAL_CLOCK = 3546895;
const NOTE_NAMES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
function amigaPeriodToNote(period) {
  if (period <= 0 || period > 65535) return null;
  const frequency = PAL_CLOCK / (2 * period);
  const midiNote = Math.round(21 + 12 * Math.log2(frequency / 440));
  if (midiNote < 0 || midiNote > 127) return null;
  const octave = Math.floor(midiNote / 12);
  const name = NOTE_NAMES[midiNote % 12] + octave;
  return { note: midiNote, name, octave };
}
export {
  amigaPeriodToNote as a
};
