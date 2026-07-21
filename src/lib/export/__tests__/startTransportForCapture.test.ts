/**
 * Regression: silent audio export for native-engine songs (2026-07-22).
 *
 * captureLiveSong used to start playback with TrackerReplayer.play(), which
 * silently no-ops for native-engine songs (libopenmpt sample MODs, UADE,
 * Hively, ...): it resolves immediately, isPlaying stays false, and the
 * whole capture window records silence. Playback for capture must go
 * through the transport store — the same entry point as the play button
 * and the working MCP export path. startTransportForCapture encodes that
 * orchestration; these tests pin its contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { startTransportForCapture, type CaptureTransport } from '../audioExport';

function makeTransport(overrides: Partial<CaptureTransport> = {}): CaptureTransport {
  return {
    isLooping: true,
    stop: vi.fn(),
    play: vi.fn(),
    setCurrentRow: vi.fn(),
    setCurrentPattern: vi.fn(),
    setIsLooping: vi.fn(),
    ...overrides,
  };
}

describe('startTransportForCapture', () => {
  it('rewinds to bar 1 and disables looping so the song plays through', () => {
    const t = makeTransport();
    startTransportForCapture(() => t);

    expect(t.stop).toHaveBeenCalled();
    expect(t.setCurrentRow).toHaveBeenCalledWith(0);
    expect(t.setCurrentPattern).toHaveBeenCalledWith(0);
    expect(t.setIsLooping).toHaveBeenCalledWith(false);
  });

  it('restore() stops playback and restores the previous looping state', () => {
    const t = makeTransport({ isLooping: true });
    const restore = startTransportForCapture(() => t);
    (t.stop as ReturnType<typeof vi.fn>).mockClear();

    restore();

    expect(t.stop).toHaveBeenCalledTimes(1);
    expect(t.setIsLooping).toHaveBeenLastCalledWith(true);
  });

  it('does not re-enable looping on restore when it was off before capture', () => {
    const t = makeTransport({ isLooping: false });
    const restore = startTransportForCapture(() => t);

    restore();

    expect(t.setIsLooping).toHaveBeenLastCalledWith(false);
  });

  it('survives a transport whose stop() throws (nothing was playing)', () => {
    const t = makeTransport({ stop: vi.fn(() => { throw new Error('not playing'); }) });

    expect(() => {
      const restore = startTransportForCapture(() => t);
      restore();
    }).not.toThrow();
    expect(t.setIsLooping).toHaveBeenCalledWith(false);
  });
});
