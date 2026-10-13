/**
 * The keyboard copy of a song played by nuade (NUADE-PREVIEW). Some formats play a key on a song instrument through
 * their own song replayer, which runs the key on the module it holds (SoundMon sm_preview_note_on, SidMon II
 * sd2_preview_note_on). A song on nuade is never loaded into that replayer, so the synth hands it the song's module as
 * a keyboard copy first (as InStereo1Synth always does with its own copy).
 */
import { useFormatStore } from '@/stores/useFormatStore';

type KeyboardField = 'soundMonFileData' | 'sd2FileData';

/** The module for the keyboard copy when the loaded song plays on nuade; null when it plays on its own replayer. */
export function keyboardModuleOnNuade(field: KeyboardField): ArrayBuffer | null {
  const f = useFormatStore.getState();
  if (!f.nuadeFileData) return null;
  return f[field] ?? f.nuadeFileData;
}
