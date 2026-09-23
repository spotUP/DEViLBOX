/**
 * Moves the PERFORMER latches rather than holds.
 *
 * Most dub moves are momentary: you push, the mix changes, you let go, it
 * comes back. Mute is the exception in practice. "I have to click the mute
 * buttons many times for them to stick ... and i cant get back audio when i
 * unmute" (2026-09-24) — the button was built as "silence this channel while
 * held", and a mute you have to keep your finger on is not how anyone mutes a
 * channel.
 *
 * Latching belongs to the LIVE surfaces — the deck's buttons and the
 * controller's pads — and not to the move itself. AutoDub punching a hole in
 * the mix still wants a momentary hold, and a recorded lane replays a rise and
 * a fall that must mean down and up, not two toggles. So the engine keeps
 * `channelMute` as a hold and this names the surfaces' exception, once, for
 * both of them to read.
 */
export const LATCHING_MOVES: ReadonlySet<string> = new Set(['channelMute']);

/** Does a live press of this move latch, rather than hold while down? */
export function isLatchingMove(moveId: string): boolean {
  return LATCHING_MOVES.has(moveId);
}
