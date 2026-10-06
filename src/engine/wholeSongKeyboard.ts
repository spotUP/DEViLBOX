/**
 * A key on an instrument of a whole-song player.
 *
 * Klystrack, MaxTrax, PreTracker, Symphonie and UADE play the file with one
 * replayer that owns every channel: there is no note-on voice for a single
 * instrument. A key used to call engine.play() / engine.stop(), so any key
 * started the song and the key-up (or the next key) stopped it. A key now plays
 * nothing and says why, once per player and session.
 */
import { notify } from '@stores/useNotificationStore';

const told = new Set<string>();

export function keyOnWholeSongPlayer(playerName: string): void {
  if (told.has(playerName)) return;
  told.add(playerName);
  notify.info(`${playerName} plays the whole song with its own player, so a single instrument has no keyboard voice. Use Play to hear it.`);
}

/** For tests: forget which players were told. */
export function resetWholeSongKeyNotices(): void { told.clear(); }
