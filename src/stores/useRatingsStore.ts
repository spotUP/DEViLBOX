/**
 * Ratings store - the community rating of rated items (Modland / HVSC), shared by
 * everything that shows a score. Fetching goes through `batchGetRatings` (the ratings
 * API client); the rating write paths call `record` with the server's answer so every
 * reader refreshes without a second fetch.
 */

import { create } from 'zustand';
import { batchGetRatings, type RatingInfo, type RatingSource } from '@/lib/ratingsApi';

/** The rating key of a playlist/deck file name (`modland:<path>` / `hvsc:<path>`), or null for any other source. */
export function ratingTargetOfFileName(fileName: string | null | undefined): { source: RatingSource; key: string } | null {
  if (!fileName) return null;
  const m = /^(modland|hvsc):(.+)$/i.exec(fileName);
  return m ? { source: m[1].toLowerCase() as RatingSource, key: m[2] } : null;
}

export const ratingId = (source: RatingSource, key: string): string => `${source}:${key}`;

interface RatingsState {
  ratings: Record<string, RatingInfo>;
  /** Fetch the item's rating unless it is already known or in flight. */
  load: (source: RatingSource, key: string) => Promise<void>;
  /** Store a rating the caller already has (a rating write's response, a batch fetch). */
  record: (source: RatingSource, key: string, info: RatingInfo) => void;
}

const inFlight = new Set<string>();

export const useRatingsStore = create<RatingsState>((set, get) => ({
  ratings: {},
  load: async (source, key) => {
    const id = ratingId(source, key);
    if (get().ratings[id] || inFlight.has(id)) return;
    inFlight.add(id);
    try {
      const map = await batchGetRatings(source, [key]);
      const info = map[key];
      if (info) set((s) => ({ ratings: { ...s.ratings, [id]: info } }));
    } catch { /* non-critical: the score just stays hidden */ } finally {
      inFlight.delete(id);
    }
  },
  record: (source, key, info) =>
    set((s) => ({ ratings: { ...s.ratings, [ratingId(source, key)]: info } })),
}));
