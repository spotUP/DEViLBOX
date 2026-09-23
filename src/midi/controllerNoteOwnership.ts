/**
 * Does the active controller preset own this note as a BUTTON?
 *
 * A mixer surface is not a keyboard. The X-Touch Compact sends a note-on at
 * velocity 127 for every button, and `useMIDIStore`'s note path treated any
 * note that was not a bank switch as "play this on the current instrument".
 * So each dub button also struck the tracker's instrument — and on 2026-09-23
 * one of those notes landed after the Hively player had been torn down by a
 * song load (`noteOn handle=0 note=60 vel=127 players=[]`), so nothing was
 * left to receive the note-off. The result was a ringing beep the owner had to
 * kill with the panic button, which then reported `activeReleasers: 0` because
 * the dub bus had never been involved.
 *
 * `DJControllerMapper` already handles preset notes as buttons; the gap was
 * only that the store had no way to ask it "is this note yours?" —
 * `hasActivePreset()` was its one public query, and the CC path used that to
 * dodge the same double-handling on lines 624-690 while the note path had
 * nothing.
 *
 * Pure, so it can be proven without the 400-line handler closure it guards.
 */

export interface OwnedNoteKey {
  channel: number;
  note: number;
}

/**
 * @param owned the preset's note table as "channel:note" keys — the same
 *              shape `DJControllerMapper.noteLookup` and `jogTouchNotes` use
 * @param msg   the incoming note, channel 0-15
 */
export function controllerOwnsNote(
  owned: ReadonlySet<string>,
  msg: OwnedNoteKey,
): boolean {
  if (owned.size === 0) return false;
  return owned.has(`${msg.channel}:${msg.note}`);
}
