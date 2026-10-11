/**
 * DJ view: the CSS turntable's platter and tonearm read the player's RAW
 * position (audioPlayer.getPosition() / replayer.getElapsedMs()), which runs
 * ahead of what the listener hears by the output latency. They now read the
 * heard position: the deck's clock anchor extrapolated to the frame.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW_POSITION = 30.0333; // where the player has rendered to
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => ({ playbackMode: 'audio', audioPlayer: { getPosition: () => RAW_POSITION }, replayer: { getElapsedMs: () => RAW_POSITION * 1000 } }) }),
}));

import { platterPositionSec } from '@/components/dj/DeckCssTurntable';
import { useDJStore } from '@/stores/useDJStore';
import { clockNowMs } from '@/engine/audioLatency';

describe('the CSS turntable turns with the heard position, not ahead of it', () => {
  it('the platter position is the heard clock, not the raw player position', () => {
    useDJStore.getState().setDeckState('A', {
      playbackMode: 'audio', isPlaying: true, durationMs: 300_000,
      positionAnchor: { positionSec: 30, rate: 1, anchorMs: clockNowMs() },
    });
    const pos = platterPositionSec('A');
    expect(pos).toBeGreaterThanOrEqual(30);
    expect(pos).toBeLessThan(30.02);
  });

  it('no angle or tonearm source reads the raw player or replayer position', () => {
    const src = readFileSync(resolve(__dirname, '../../components/dj/DeckCssTurntable.tsx'), 'utf8');
    expect(src).not.toMatch(/audioPlayer\.getPosition\(\)/);
    expect(src).not.toMatch(/replayer\.getElapsedMs\(\)/);
    expect(src.match(/platterPositionSec\(deckId\)/g)?.length).toBe(3);
  });
});
