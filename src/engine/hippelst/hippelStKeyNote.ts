/**
 * The pattern note byte a MIDI key plays on a Hippel ST instrument: the grid shows byte + 13
 * (HST_NOTE_BASE) and the key stands for grid note key - 11, so the byte is key - 24. The player
 * reads bytes 2..$7F as notes ($80 and up start no sound, 1 ends a pattern).
 */
export function hippelStNoteForKey(midi: number): number {
  return Math.max(2, Math.min(0x7f, Math.round(midi) - 24));
}
