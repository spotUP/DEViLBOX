/**
 * Images Music System note index <-> tracker note: the one mapping the IMS
 * parser, its pattern codec and IMSEncoder share.
 *
 * An IMS cell holds a note index 0..47 (63 = no note). Index 0 plays period
 * 1712 and each index is one semitone higher, up to 47 = 113 (the extended
 * table in NostalgicPlayer ProWizardConverter ImagesMusicSystemFormat.cs).
 * In the one Amiga naming (src/lib/amiga/periodNotes.ts, 1712 = note 1 =
 * C-0, 428 = 25 = C-2) index i is note i + 1.
 */

/** Note index of an empty IMS cell. */
export const IMS_NO_NOTE = 63;
/** Number of playable note indices (0..47). */
export const IMS_NOTE_COUNT = 48;

/** Tracker note for an IMS note index; 0 for empty, -1 for an invalid index. */
export function imsIndexToNote(index: number): number {
  if (index === IMS_NO_NOTE) return 0;
  if (index >= 0 && index < IMS_NOTE_COUNT) return index + 1;
  return -1;
}

/** IMS note index for a tracker note; IMS_NO_NOTE for no note or a note IMS cannot hold. */
export function noteToImsIndex(note: number): number {
  const index = note - 1;
  return index >= 0 && index < IMS_NOTE_COUNT ? index : IMS_NO_NOTE;
}
