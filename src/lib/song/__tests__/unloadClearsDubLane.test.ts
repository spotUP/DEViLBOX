/** The outgoing song's dub lane must not keep firing moves (ghostReverb muted CH 2 of the next song). */
import { describe, it, expect, vi } from 'vitest';

const { fire } = vi.hoisted(() => ({ fire: vi.fn(() => null) }));
vi.mock('@/engine/dub/DubRouter', () => ({ fire, subscribeDubRouter: () => () => {} }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ releaseAll: vi.fn() }) }));
vi.mock('@/lib/uprough/auditionPlayer', () => ({ stopAudition: vi.fn() }));
vi.mock('@/engine/replayer/NativeEngineRouting', () => ({ releaseEngineSubscriptions: vi.fn() }));
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: vi.fn(), releaseSong: vi.fn() }) }));
vi.mock('@/lib/import/AdPlugPlayer', () => ({ getAdPlugPlayer: () => ({ stop: vi.fn() }) }));

import { dubLanePlayer } from '@/engine/dub/DubLanePlayer';
import { unloadSong } from '../songLifecycle';
import type { DubLane } from '@/types/dub';

describe('unloadSong', () => {
  it('drops the dub lane so it stops firing', async () => {
    const lane = { enabled: true, kind: 'row', events: [{ id: 'e', moveId: 'ghostReverb', channelId: 1, row: 0, params: {} }] } as unknown as DubLane;
    dubLanePlayer.setLane(lane);
    await unloadSong();
    dubLanePlayer.onTick(0);
    expect(fire).not.toHaveBeenCalled();
  });
});
