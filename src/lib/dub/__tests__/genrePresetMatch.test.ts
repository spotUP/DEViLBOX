/**
 * The active genre curve is read off the bands, not remembered.
 */
import { describe, it, expect } from 'vitest';
import { computeGenreBaseline } from '@/engine/dub/AutoEQ';
import type { Fil4Params } from '@/engine/effects/Fil4EqEffect';
import { genreOfParams, paramsMatchGenre, GENRE_PRESET_NAMES, GENRE_PRESET_ENERGY, GENRE_PRESET_DANCEABILITY } from '../genrePresetMatch';

/** The parameters the EQ tab ends up with after applying `genre`. */
function applied(genre: string): Fil4Params {
  const c = computeGenreBaseline(genre, GENRE_PRESET_ENERGY, GENRE_PRESET_DANCEABILITY);
  const band = (b: { enabled: boolean; freq: number; gain?: number; bw?: number }) => ({ enabled: b.enabled, freq: b.freq, bw: b.bw ?? 1.2, gain: b.gain ?? 0 });
  return {
    hp: { enabled: c.hp.enabled, freq: c.hp.freq, q: c.hp.q },
    lp: { enabled: false, freq: 20000, q: 0.7 },
    ls: { enabled: c.ls.enabled, freq: c.ls.freq, gain: c.ls.gain ?? 0, q: c.ls.q ?? 0.8 },
    hs: { enabled: c.hs.enabled, freq: c.hs.freq, gain: c.hs.gain ?? 0, q: c.hs.q ?? 0.8 },
    p: [band(c.p0), band(c.p1), band(c.p2), band(c.p3)],
    masterGain: 1.0,
  };
}

describe('genreOfParams', () => {
  it('names the genre whose curve the bands carry', () => {
    for (const g of ['Reggae', 'Rock', 'Jazz']) expect(genreOfParams(applied(g)), g).toBe(g);
  });

  it('answers none once a band is moved, and none for a flat EQ', () => {
    const p = applied('Reggae');
    p.p[1].gain += 1.5;
    expect(genreOfParams(p)).toBeNull();
    const flat: Fil4Params = { ...applied('Reggae'), hp: { enabled: false, freq: 25, q: 0.7 }, ls: { enabled: false, freq: 80, gain: 0, q: 0.8 }, hs: { enabled: false, freq: 10000, gain: 0, q: 0.8 }, p: [200, 500, 2000, 8000].map((f) => ({ enabled: false, freq: f, bw: 1.0, gain: 0 })) };
    expect(genreOfParams(flat)).toBeNull();
  });

  it('every offered genre is recognisable after it is applied', () => {
    for (const g of GENRE_PRESET_NAMES) expect(paramsMatchGenre(applied(g), g), g).toBe(true);
  });
});
