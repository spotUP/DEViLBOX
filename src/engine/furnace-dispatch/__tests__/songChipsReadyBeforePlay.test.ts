/**
 * A freshly opened YM2610 song (arena.fur) played its SSG instruments on the keyboard
 * ~15 dB under its FM ones: the song chip only came up on the first Play, so keyboard
 * notes fell back to a stand-alone Genesis chip (post-amp 2.0) and AY-3-8910 (1.0).
 * Furnace previews on the song chip with the song's flags, so opening the song now
 * brings that chip up with its flags (ssgVol) and mix.
 */
import { describe, it, expect, vi } from 'vitest';
import { FurnaceDispatchEngine } from '../FurnaceDispatchEngine';
import type { FurnaceNativeData } from '@/types/tracker';

describe('song chips ready before the first Play', () => {
  it('creates the song chip with its flags and mix when the song opens', async () => {
    const chips = new Set<number>();
    const postMessage = vi.fn();
    const engine = Object.assign(Object.create(FurnaceDispatchEngine.prototype), {
      initialized: true,
      workletNode: { port: { postMessage } },
      hasChip: (k: number) => chips.has(k),
      createChip: vi.fn(async (k: number) => { chips.add(k); }),
      waitForChipCreated: vi.fn(async () => {}),
      orderChips: vi.fn(),
    }) as FurnaceDispatchEngine;

    await engine.prepareSongChips({ chipIds: [58], chipFlags: ['ssgVol=256\n'], systemVol: [1] } as unknown as FurnaceNativeData);

    expect([...chips]).toEqual([58]);
    const sent = postMessage.mock.calls.map(([m]) => m);
    expect(sent).toContainEqual(expect.objectContaining({ type: 'setChipFlags', flagsStr: 'ssgVol=256\n', platformType: 58 }));
    expect(sent).toContainEqual(expect.objectContaining({ type: 'setMixVolumes', chipIds: [58] }));
  });
});
