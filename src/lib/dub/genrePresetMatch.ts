/**
 * Which genre curve the EQ currently sits on.
 *
 * The Fil4 EQ tab's preset picker applied a genre curve and then reset
 * itself to "Select genre curve..." - a one-shot button with no state, so the
 * active curve was never shown (owner, 2026-10-04). Storing a name beside the
 * bands would drift the moment a band is dragged. Instead the active preset
 * is DERIVED: the genre whose baseline curve the current parameters still
 * equal, or none. A manual edit or Flat deselects by itself.
 */
import { computeGenreBaseline } from '@/engine/dub/AutoEQ';
import type { Fil4Params } from '@/engine/effects/Fil4EqEffect';

/** The curves the EQ tab offers, in menu order. */
export const GENRE_PRESET_NAMES: readonly string[] = ['Reggae', 'Electronic', 'Hip-Hop', 'Rock', 'Jazz', 'Classical', 'Blues', 'Folk', 'Unknown'];

/** The energy / danceability the EQ tab applies a genre curve with. */
export const GENRE_PRESET_ENERGY = 0.7;
export const GENRE_PRESET_DANCEABILITY = 0.6;

const EPS = 1e-3;
const near = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) <= EPS;

/** True when `params` carry exactly the curve `genre` applies. */
export function paramsMatchGenre(params: Fil4Params, genre: string): boolean {
  const c = computeGenreBaseline(genre, GENRE_PRESET_ENERGY, GENRE_PRESET_DANCEABILITY);
  if (params.hp.enabled !== c.hp.enabled || !near(params.hp.freq, c.hp.freq) || !near(params.hp.q, c.hp.q)) return false;
  if (params.ls.enabled !== c.ls.enabled || !near(params.ls.freq, c.ls.freq) || !near(params.ls.gain, c.ls.gain ?? 0) || !near(params.ls.q, c.ls.q ?? 0.8)) return false;
  if (params.hs.enabled !== c.hs.enabled || !near(params.hs.freq, c.hs.freq) || !near(params.hs.gain, c.hs.gain ?? 0) || !near(params.hs.q, c.hs.q ?? 0.8)) return false;
  const bands = [c.p0, c.p1, c.p2, c.p3];
  for (let i = 0; i < 4; i++) {
    const p = params.p[i]; const b = bands[i];
    if (!p || !b) return false;
    if (p.enabled !== b.enabled || !near(p.freq, b.freq) || !near(p.bw, b.bw ?? 1.2) || !near(p.gain, b.gain ?? 0)) return false;
  }
  return near(params.masterGain, 1.0);
}

/** The genre whose curve `params` equal, or null when the EQ is somewhere of its own. */
export function genreOfParams(params: Fil4Params, genres: readonly string[] = GENRE_PRESET_NAMES): string | null {
  for (const g of genres) if (paramsMatchGenre(params, g)) return g;
  return null;
}
