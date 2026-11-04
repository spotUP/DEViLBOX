import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({
  batchGetRatings: vi.fn(),
  setRating: vi.fn(),
  removeRating: vi.fn(),
}));
vi.mock('@/lib/ratingsApi', () => api);

import { useRatingsStore, optimisticRating } from '../useRatingsStore';

beforeEach(() => {
  useRatingsStore.setState({ ratings: {} });
  Object.values(api).forEach((f) => f.mockReset());
});

describe('useRatingsStore', () => {
  it('loadMany merges one batch per source under source-qualified ids', async () => {
    api.batchGetRatings.mockResolvedValue({ 'a.mod': { avg: 4, count: 2 }, 'b.mod': { avg: 3, count: 1 } });
    await useRatingsStore.getState().loadMany('modland', ['a.mod', 'b.mod']);
    expect(api.batchGetRatings).toHaveBeenCalledTimes(1);
    expect(useRatingsStore.getState().ratings['modland:a.mod']).toEqual({ avg: 4, count: 2 });
    expect(useRatingsStore.getState().ratings['hvsc:a.mod']).toBeUndefined();
  });

  it('loadMany with no keys does not fetch', async () => {
    await useRatingsStore.getState().loadMany('hvsc', []);
    expect(api.batchGetRatings).not.toHaveBeenCalled();
  });

  it('optimisticRating adds, changes and removes the user vote', () => {
    expect(optimisticRating(undefined, 5)).toEqual({ avg: 5, count: 1, userRating: 5 });
    expect(optimisticRating({ avg: 4, count: 2, userRating: 4 }, 2)).toEqual({ avg: 3, count: 2, userRating: 2 });
    expect(optimisticRating({ avg: 4, count: 2, userRating: 4 }, 0)).toEqual({ avg: 4, count: 1 });
  });

  it('rate shows the optimistic stars, then the server answer', async () => {
    let resolve!: (v: unknown) => void;
    api.setRating.mockReturnValue(new Promise((r) => { resolve = r; }));
    const p = useRatingsStore.getState().rate('modland', 'a.mod', 5);
    expect(useRatingsStore.getState().ratings['modland:a.mod']).toEqual({ avg: 5, count: 1, userRating: 5 });
    resolve({ avg: 4.5, count: 2, userRating: 5 });
    await p;
    expect(useRatingsStore.getState().ratings['modland:a.mod']).toEqual({ avg: 4.5, count: 2, userRating: 5 });
  });

  it('rate rolls back by refetching when the write fails', async () => {
    useRatingsStore.setState({ ratings: { 'hvsc:x.sid': { avg: 3, count: 1 } } });
    api.setRating.mockRejectedValue(new Error('offline'));
    api.batchGetRatings.mockResolvedValue({ 'x.sid': { avg: 3, count: 1 } });
    await useRatingsStore.getState().rate('hvsc', 'x.sid', 5);
    expect(api.batchGetRatings).toHaveBeenCalledWith('hvsc', ['x.sid']);
    expect(useRatingsStore.getState().ratings['hvsc:x.sid']).toEqual({ avg: 3, count: 1 });
  });

  it('rate with 0 removes the vote through removeRating', async () => {
    useRatingsStore.setState({ ratings: { 'modland:a.mod': { avg: 4, count: 2, userRating: 4 } } });
    api.removeRating.mockResolvedValue({ avg: 4, count: 1 });
    await useRatingsStore.getState().rate('modland', 'a.mod', 0);
    expect(api.removeRating).toHaveBeenCalledWith('modland', 'a.mod');
    expect(useRatingsStore.getState().ratings['modland:a.mod']).toEqual({ avg: 4, count: 1 });
  });
});
