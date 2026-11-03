/**
 * Owner 2026-11-03, skyfox2.cus: "it draws a stop button over the play button and i cant stop it with the stop button
 * only space". The song plays as opaque UADE (UADESynth plays it, the tracker replayer stays idle). Stop Song and the
 * keyboard stop command go through triggerElectronicBrake, which returned without stopping when the replayer was not
 * playing, so the transport played on. Space worked because it calls the transport stop directly.
 *
 * Stop means stop: with nothing for the platter to spin down, the brake stops the transport chain at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
let replayerPlaying = false;

vi.mock('../TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ isPlaying: () => replayerPlaying, stop: () => { calls.push('replayer.stop'); } }),
}));
vi.mock('../ToneEngine', () => ({ getToneEngine: () => ({ stop: () => { calls.push('tone.stop'); } }) }));
vi.mock('@/stores/useTransportStore', () => ({
  useTransportStore: { getState: () => ({ stop: () => { calls.push('transport.stop'); } }) },
}));
vi.mock('../dj/DeckScratchBuffer', () => ({ DeckScratchBuffer: class {}, TRACKER_SCRATCH_BUFFER_ID: 'x' }));

describe('Stop Song with the tracker replayer idle (opaque UADE song playing)', () => {
  beforeEach(() => { calls.length = 0; replayerPlaying = false; });

  it('stops the transport chain and then reports done', async () => {
    const { TrackerScratchController } = await import('../TrackerScratchController');
    const done = vi.fn(() => { calls.push('done'); });
    new TrackerScratchController().triggerElectronicBrake(done);
    expect(calls).toEqual(['replayer.stop', 'transport.stop', 'tone.stop', 'done']);
  }, 60000);
});
