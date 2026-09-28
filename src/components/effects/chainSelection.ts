/**
 * What selecting an effect in the master chain does to a pending preview.
 *
 * A browser preview adds the effect to the chain at once, so it also shows as
 * a chain card. Selecting any card used to remove the pending preview first -
 * including when the card clicked WAS the preview, which deleted the effect the
 * user was trying to open (2026-09-29: "I can't click the effects to bring up
 * their UI").
 */
export function previewToRemoveOnSelect(previewId: string | null, selectedId: string): string | null {
  return previewId !== null && previewId !== selectedId ? previewId : null;
}
