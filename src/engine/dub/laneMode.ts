/**
 * laneMode — single source of truth for "should the dub lane on this song
 * be row-indexed or time-indexed?"
 *
 * Row-mode: lane events live on tracker rows. Works for every editable format
 *   (MOD/XM/IT via openmpt, Furnace, Hively, Klystrack, GoatTracker,
 *   CheeseCutter, SidFactory2, JamCracker, MusicLine, TFMX).
 *
 * Time-mode: lane events live on song-time seconds. Used for formats that
 *   play via opaque register emulation with no structured pattern data —
 *   raw .sid (WebSID/jsSID path, distinct from editable CheeseCutter/
 *   SidFactory2/GoatTracker variants), SC68/SNDH, and any future "black-box"
 *   replayer. The dub deck still works because DubBus hooks onto the audio
 *   output; the only question is how to persist the performance.
 *
 * The decision belongs to ONE helper so recorder, player, and UI all agree.
 */

import type { EditorMode } from '@/types/tracker';

/** Editor modes whose "pattern" is a synthetic stub (no rows to target). */
const NON_EDITABLE_MODES: readonly EditorMode[] = ['sc68'];

/**
 * Does this song render its dub lane as time-indexed events?
 *
 * @param editorMode   Active editor mode from useFormatStore.
 * @param hasSidData   Whether a raw SID blob is the active song (useFormatStore.c64SidFileData).
 *                     Raw SID is ONLY the non-editor path — CheeseCutter /
 *                     SidFactory2 / GoatTracker are separate editorModes and
 *                     stay row-mode even though they also emit SID audio.
 */
export function isTimeBasedLaneMode(
  editorMode: EditorMode,
  hasSidData: boolean,
): boolean {
  if (NON_EDITABLE_MODES.includes(editorMode)) return true;
  // Raw SID path: `classic` editorMode + c64SidFileData present. Editable SID
  // trackers set their own editorMode ('cheesecutter' / 'sidfactory2' /
  // 'goattracker') so they won't fall in here.
  if (editorMode === 'classic' && hasSidData) return true;
  return false;
}

/** Cheap read from the format store without creating a React subscription. */
export function currentSongIsTimeBasedLane(): boolean {
  try {
    // Lazy require to avoid circular imports — this helper is imported by
    // engine-layer files (recorder/player) that would otherwise pull the
    // store tree at module eval time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useFormatStore } = require('@/stores/useFormatStore');
    const s = useFormatStore.getState();
    return isTimeBasedLaneMode(s.editorMode, !!s.c64SidFileData);
  } catch {
    return false;
  }
}
