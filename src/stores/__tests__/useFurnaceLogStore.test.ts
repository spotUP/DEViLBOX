import { describe, it, expect } from 'vitest';
import { useFurnaceLogStore, FURNACE_LOG_LIMIT } from '../useFurnaceLogStore';

describe('useFurnaceLogStore', () => {
  it('keeps only the newest entries and clears', () => {
    const batch = Array.from({ length: FURNACE_LOG_LIMIT + 10 }, (_, i) => ({ tick: i, cmd: 0, channel: 0, value1: 0, value2: 0 }));
    useFurnaceLogStore.getState().append(batch);
    const { entries } = useFurnaceLogStore.getState();
    expect(entries).toHaveLength(FURNACE_LOG_LIMIT);
    expect(entries[entries.length - 1].tick).toBe(FURNACE_LOG_LIMIT + 9);
    useFurnaceLogStore.getState().clear();
    expect(useFurnaceLogStore.getState().entries).toHaveLength(0);
  });
});
