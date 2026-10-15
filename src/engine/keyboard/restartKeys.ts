/**
 * Right Shift (play song from start) and Right Alt (play pattern from start) restart
 * playback when pressed. A held key makes the OS send auto-repeat keydowns after about half
 * a second; each of those restarted the song again, so the first note of the pattern sounded
 * a second time. Only the initial press may start playback; a repeat is swallowed.
 */
export type RestartKeyAction = 'playSong' | 'playPattern' | 'swallow' | null;

export function restartKeyAction(e: { code: string; repeat: boolean }): RestartKeyAction {
  if (e.code !== 'ShiftRight' && e.code !== 'AltRight') return null;
  if (e.repeat) return 'swallow';
  return e.code === 'ShiftRight' ? 'playSong' : 'playPattern';
}
