/**
 * A native engine whose song has ended stops the transport too.
 *
 * The silence detector stopped only the engine: the transport kept playing,
 * the grid froze on the last position while the play marker scrolled, and
 * nothing sounded (ghostbattle_gameover.hip7, 2026-09-28).
 */
import { describe, it, expect, vi } from 'vitest';
import { endNativeSong } from '../replayer/NativeEngineRouting';
import { useTransportStore } from '@stores/useTransportStore';

describe('a native song that ends in silence', () => {
  it('stops the engine and the transport', async () => {
    const stop = vi.fn();
    useTransportStore.setState({ isPlaying: true, stop } as never);
    const engine = { stop: vi.fn() };
    await endNativeSong(engine);
    expect(engine.stop).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('leaves an already stopped transport alone', async () => {
    const stop = vi.fn();
    useTransportStore.setState({ isPlaying: false, stop } as never);
    await endNativeSong({ stop: vi.fn() });
    expect(stop).not.toHaveBeenCalled();
  });
});
