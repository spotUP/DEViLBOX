/**
 * The one decision "this song has no drawn grid, open the scope view".
 * Owner, 2026-10-06: "guessing is pointless" - a grid that is not the
 * replayer's own is never shown.
 *
 *  - gridEstimated: the grid was rebuilt from the player's Paula output (UADE scan).
 *  - gridUnmatchedReason: a native parser walked the replayer and could not match
 *    its grid to the walk; the reason is shown/logged. Typed on TrackerSong.
 */
export interface GridMatchFields {
  gridEstimated?: boolean;
  gridUnmatchedReason?: string;
}

export function gridOpensInScopeView(song: GridMatchFields): boolean {
  return !!song.gridEstimated || !!song.gridUnmatchedReason;
}
