/**
 * Which layer the X-Touch Compact is showing.
 *
 * The device has two layers, and a control carries a different CC or note on
 * each — `echoThrow` is note 32 on Layer A and note 72 on Layer B. The lamps
 * therefore need to know which layer is in front of the performer, and the
 * first version lit BOTH notes on the grounds that the device does not say.
 *
 * It does say. The LAYER buttons are not notes: they send a PROGRAM CHANGE,
 * which `controllerLayouts.ts` has recorded all along in the descriptors for
 * `layer-a` and `layer-b` ("program change, not note"). `MIDIManager` already
 * decodes it. Nothing had ever listened.
 *
 * Until a layer message is seen, the answer is `null` — genuinely unknown,
 * because nothing reports the layer at connection time. A caller should light
 * both layers while the answer is unknown rather than guess one, and the first
 * press of LAYER settles it for the rest of the session.
 */
export type XTouchLayer = 'A' | 'B';

let active: XTouchLayer | null = null;

/**
 * A Program Change arrived.
 *
 * Program 0 is Layer A and 1 is Layer B. Anything else is some other device's
 * program change and is ignored rather than taken as a layer.
 */
export function noteLayerProgram(program: number): void {
  if (program === 0) active = 'A';
  else if (program === 1) active = 'B';
}

/** The layer in front of the performer, or null if it has not been reported. */
export function getActiveLayer(): XTouchLayer | null {
  return active;
}

/** Forget the layer — on disconnect, where the next device may be on either. */
export function resetActiveLayer(): void {
  active = null;
}

/**
 * Narrow a control's notes to the layer on show.
 *
 * A mirrored control has its Layer B note ABOVE its Layer A note, which is how
 * the preset lays the second bank out. With no layer reported, every note is
 * returned: lighting a lamp the performer cannot currently see is harmless,
 * and lighting none would be a control that looks dead.
 */
export function notesOnActiveLayer(notes: readonly number[]): number[] {
  if (notes.length < 2 || active === null) return [...notes];
  const sorted = [...notes].sort((a, b) => a - b);
  return active === 'A' ? [sorted[0]] : [sorted[sorted.length - 1]];
}
