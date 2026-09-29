/**
 * A scratch hands the song back as it found it.
 *
 * Owner, 2026-09-30: after scratching, the song played on but the pattern
 * stopped scrolling. The console showed wasmActive=true and the engine
 * position stuck at row 43. For a song a WASM engine plays, the replayer's
 * notes are suppressed and its row feeds that engine position; leaving a
 * scratch forced suppression OFF, so the feed stopped (and the replayer began
 * firing the song's notes on top of the engine). Leaving now restores it.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../TrackerReplayer', () => ({ getTrackerReplayer: () => null }));
vi.mock('../ToneEngine', () => ({ getToneEngine: () => ({}) }));
vi.mock('../dj/DeckScratchBuffer', () => ({ DeckScratchBuffer: class {}, TRACKER_SCRATCH_BUFFER_ID: 'x' }));

function fakeReplayer(suppressed: boolean) {
  let sup = suppressed;
  return {
    get isSuppressNotes() { return sup; },
    setSuppressNotes: vi.fn((v: boolean) => { sup = v; }),
    isPlaying: () => true,
    getStateAtTime: () => ({ row: 0, pattern: 0 }),
    pauseNativeEnginesForScratch: vi.fn(), resumeNativeEnginesAfterScratch: vi.fn(),
    setTempoMultiplier: vi.fn(), setPitchMultiplier: vi.fn(), resyncSchedulerToNow: vi.fn(),
    getFullOutput: () => ({ gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() } }),
  };
}

describe('scratch and note suppression', () => {
  for (const before of [true, false]) {
    it(`leaves suppression ${before ? 'on' : 'off'} as it was before the scratch`, async () => {
      const { TrackerScratchController } = await import('../TrackerScratchController');
      const sc = new TrackerScratchController() as unknown as {
        enterScratchMode(r: unknown): void; exitScratchMode(r: unknown): void;
        scratchBufferReady: boolean; stopPhysicsLoop(): void; startPhysicsLoop(): void;
      };
      sc.scratchBufferReady = true;            // skip the audio buffer init
      sc.startPhysicsLoop = () => {};           // no rAF in the test
      (sc as unknown as { engageScratchAudio: (r: ReturnType<typeof fakeReplayer>) => void }).engageScratchAudio = (r) => { r.setSuppressNotes(true); };
      const r = fakeReplayer(before);
      sc.enterScratchMode(r);
      expect(r.isSuppressNotes).toBe(true);     // silent while scratching
      sc.exitScratchMode(r);
      expect(r.isSuppressNotes).toBe(before);
    }, 60000);
  }
});
