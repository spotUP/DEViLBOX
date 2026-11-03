/**
 * Play / Play Pattern on a classic-UADE song starts at the replayer's position, not the song start (2026-11-03).
 *
 * The transport start (startNativeEngines, as TrackerReplayer.play calls it with its songPos / pattPos) resolves the
 * grid row to an output frame with the row-preview search and posts UADEEngine.seek(frame) (worklet fast-forwards silently on play, C uade_wasm_skip_frames) before play(). Position 0
 * row 0 is the plain play path. Sentinel: the mock engine's seek and play calls, in order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const targets = vi.hoisted(() => [] as { songPos: number; row: number }[]);
const engine = vi.hoisted(() => ({
  ready: async () => {},
  loadTune: async () => {},
  setGrid: () => {},
  setMuteMask: () => {},
  playRowClip: () => {},
  rowClipMask: 0xffff,
  output: { context: { sampleRate: 48000 } },
  targetOf: (_s: unknown, songPos: number, row: number) => { targets.push({ songPos, row }); return { kind: 'orderRow', order: songPos, row }; },
  seek: (frame: number) => { calls.push(`seek:${frame}`); },
  play: () => { calls.push('play'); },
}));
vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: { hasInstance: () => true, getInstance: () => engine },
}));
vi.mock('@/engine/ToneEngine', () => {
  const t = { releaseAll: vi.fn(), getInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => t };
});

const song = {
  format: 'MOD', instruments: [], patterns: [], songPositions: [0, 1, 2, 3, 4, 5],
  uadeEditableFileData: new Uint8Array(16).buffer, uadeEditableFileName: 'x.mod',
};

async function start(songPos: number, row: number) {
  const { startNativeEngines, clearRunningEngineKeys } = await import('@/engine/replayer/NativeEngineRouting');
  clearRunningEngineKeys();
  calls.length = 0;
  await startNativeEngines(song as never, {} as never, false, false, new Set(), { songPos, row });
}

describe('UADE transport start', () => {
  beforeEach(async () => {
    targets.length = 0;
    const { setRowPreviewClient } = await import('@engine/rowPreview/rowPreviewClient');
    setRowPreviewClient({
      // The search answers with the frame its target row starts at: order 5 -> 5000 frames, 2 -> 2000, plus the row.
      request: async (req) => {
        const t = req.target as { order: number; row: number };
        return { kind: 'clip', clip: { startFrame: t.order * 1000 + t.row, sampleRate: 48000, frames: 1, stereo: new Float32Array(2), voices: null, panSteps: [], fadeFrames: 0 } };
      },
      prepare: async () => ({ kind: 'skipped' }),
    });
  });

  it('seeks to the frame of the position before play, and only then', async () => {
    await start(5, 0);
    expect(targets).toEqual([{ songPos: 5, row: 0 }]);
    expect(calls).toEqual(['seek:5000', 'play']);
  });

  it('seeks for a row inside position 0', async () => {
    await start(0, 7);
    expect(calls).toEqual(['seek:7', 'play']);
  });

  it('plays plainly from position 0 row 0', async () => {
    await start(0, 0);
    expect(calls).toEqual(['play']);
    expect(targets).toEqual([]);
  });
});
