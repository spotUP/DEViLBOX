/**
 * Seek guard — prevents the position poller from overwriting a manual seek
 * with stale audio player position data.
 *
 * After a manual seek, the audio player's getPosition() may return stale data
 * for 1-2 frames. The poller checks isSeekActive() and skips position updates
 * during that window.
 */

const SUPPRESS_MS = 250;
const seekTimestamps = new Map<string, number>();

export function markSeek(deckId: string): void {
  seekTimestamps.set(deckId, performance.now());
}

export function isSeekActive(deckId: string): boolean {
  const ts = seekTimestamps.get(deckId);
  if (!ts) return false;
  if (performance.now() - ts > SUPPRESS_MS) {
    seekTimestamps.delete(deckId);
    return false;
  }
  return true;
}
