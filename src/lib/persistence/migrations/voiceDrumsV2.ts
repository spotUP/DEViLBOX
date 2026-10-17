/**
 * Voice drum training v1 to v2 (VNR-21, WD-4).
 *
 * v1 stored 6-value hit features without the audio they came from, so the
 * 17-value v2 features cannot be computed from them: the training cannot be
 * upgraded. The migration removes the v1 keys and flags the setup wizard to
 * open once with DRUMS_RESET_MESSAGE; closing the wizard clears the flag.
 * Every storage access is in try/catch; with storage unavailable nothing was
 * stored, so nothing needs migrating.
 */
export const V1_DRUM_KEYS = ['devilbox.voice.drumSamples.v1', 'devilbox.voice.drumModel.v1'] as const;
export const DRUMS_RESET_KEY = 'devilbox.voice.drumsReset.v2';
export const DRUMS_RESET_MESSAGE = 'Drum training was reset for the new detector. Please record the drum steps again.';

/** Removes v1 drum training; returns true when there was some (the wizard is then flagged). */
export function migrateVoiceDrumsV2(): boolean {
  try {
    const found = V1_DRUM_KEYS.filter((k) => localStorage.getItem(k) !== null);
    if (found.length === 0) return false;
    for (const k of found) localStorage.removeItem(k);
    localStorage.setItem(DRUMS_RESET_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function drumsResetPending(): boolean {
  try {
    return localStorage.getItem(DRUMS_RESET_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDrumsReset(): void {
  try {
    localStorage.removeItem(DRUMS_RESET_KEY);
  } catch {
    /* storage unavailable: nothing was flagged */
  }
}
