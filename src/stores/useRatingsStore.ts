/**
 * Ratings store - the community rating of rated items (Modland / HVSC), shared by
 * everything that shows a score. Fetching goes through `batchGetRatings` (the ratings
 * API client); the rating write paths call `record` with the server's answer so every
 * reader refreshes without a second fetch.
 */

import { create } from 'zustand';
import { batchGetRatings, setRating, removeRating, type RatingInfo, type RatingSource } from '@/lib/ratingsApi';

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
  /** Fetch many items' ratings in one request and merge them in (always refetches: lists show fresh userRating). */
  loadMany: (source: RatingSource, keys: string[]) => Promise<void>;
  /** Write the user's star (0 removes it): optimistic update, the server's answer replaces it, a failure refetches the truth. */
  rate: (source: RatingSource, key: string, star: number) => Promise<void>;
}

/** The rating after the user sets `star` (0 = remove their vote), computed locally for the optimistic update. */
export function optimisticRating(existing: RatingInfo | undefined, star: number): RatingInfo | undefined {
  if (star === 0) {
    if (!existing) return existing;
    const count = Math.max(0, existing.count - 1);
    const avg = count > 0 ? (existing.avg * existing.count - (existing.userRating || 0)) / count : 0;
    return { avg, count };
  }
  const oldUser = existing?.userRating;
  const oldCount = existing?.count || 0;
  const oldAvg = existing?.avg || 0;
  const count = oldUser ? oldCount : oldCount + 1;
  const avg = oldUser ? (oldAvg * oldCount - oldUser + star) / count : (oldAvg * oldCount + star) / count;
  return { avg, count, userRating: star };
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
  loadMany: async (source, keys) => {
    if (keys.length === 0) return;
    try {
      const map = await batchGetRatings(source, keys);
      set((s) => {
        const next = { ...s.ratings };
        for (const k of Object.keys(map)) next[ratingId(source, k)] = map[k];
        return { ratings: next };
      });
    } catch { /* non-critical: stars keep their last value */ }
  },
  rate: async (source, key, star) => {
    const id = ratingId(source, key);
    const optimistic = optimisticRating(get().ratings[id], star);
    if (optimistic) set((s) => ({ ratings: { ...s.ratings, [id]: optimistic } }));
    try {
      if (star === 0) {
        const res = await removeRating(source, key);
        get().record(source, key, { avg: res.avg, count: res.count });
      } else {
        const res = await setRating(source, key, star);
        get().record(source, key, { avg: res.avg, count: res.count, userRating: res.userRating });
      }
    } catch {
      await get().loadMany(source, [key]);
    }
  },
}));
