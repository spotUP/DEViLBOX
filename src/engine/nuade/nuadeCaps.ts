/**
 * What each nuade player reported at load (nw_caps), remembered per player id. A leaf module with no imports: the
 * registry decides the live-edit route from it, and the registry may import nothing that pulls an engine in.
 */
const CELL_WRITE = 2;
const capsByPlayer = new Map<string, number>();

/** Remember what a player reported at load (moduleLoaded.caps). */
export function recordNuadePlayerCaps(playerId: string, caps: number): void { capsByPlayer.set(playerId, caps); }
export function nuadePlayerCaps(playerId: string | undefined | null): number { return playerId ? capsByPlayer.get(playerId) ?? 0 : 0; }
/** For tests: forget what was recorded. */
export function resetNuadePlayerCaps(): void { capsByPlayer.clear(); }

/** Whether the grid's cell edits can be written into the running nuade player of this song. */
export function nuadeSongHasCellWrite(song: { nuadePlayerId?: string }): boolean {
  return (nuadePlayerCaps(song.nuadePlayerId) & CELL_WRITE) !== 0;
}
