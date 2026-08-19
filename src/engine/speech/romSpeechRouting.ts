/**
 * Who owns playback when both a text field and a ROM word list are on screen.
 *
 * The Speak button used to hand a non-zero ROM Speech selection precedence over the text
 * field, so once a recording had been picked, typed text could never be spoken again —
 * the only way back was setting the list to "(Text-to-Speech)". Auditioning belongs to
 * the list instead: picking a word plays it, and the Speak button always speaks text.
 */

export interface RomSelectionChange {
  /** The selection before this write. 0 means "(Text-to-Speech)". */
  previous: number;
  /** The selection being written. */
  next: number;
  /** Whether the ROM has reached the WASM side and can be played from. */
  romReady: boolean;
  /**
   * False for the first write after an instrument loads, which is the stored value being
   * restored rather than a pick — restoring a project must not blurt speech.
   */
  restored: boolean;
}

/** True when a ROM Speech write is a user picking a word that should be heard now. */
export function shouldAuditionRomSelection({ previous, next, romReady, restored }: RomSelectionChange): boolean {
  return restored && romReady && next > 0 && next !== previous;
}
