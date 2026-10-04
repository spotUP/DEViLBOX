/**
 * An analysis that finished while the bus was off is applied when the bus
 * comes on.
 *
 * The bus subscribed to the analysis store and applied the auto EQ on the
 * transition to `ready` - only if it was enabled at that moment. Enable it
 * later and nothing applied: the EQ tab kept saying "no analysis" for a song
 * whose analysis was ready (owner, 2026-10-04; ledger L25).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { loadDubBus, makeDubBusRig, releaseDubBusRigClock } from '@/test/audio/dubBusRig';
import { useTrackerAnalysisStore, type FullAnalysisResult } from '@/stores/useTrackerAnalysisStore';

const analysis = (primary: string): FullAnalysisResult => ({
  bpm: 90, bpmConfidence: 0.9, musicalKey: 'C', keyConfidence: 0.8, rmsDb: -18, peakDb: -6, analyzedAt: Date.now(),
  genre: { primary, subgenre: '', confidence: 0.8, mood: 'Chill', energy: 0.7, danceability: 0.6, bpm: 90, bpmConfidence: 0.9, musicalKey: 'C', keyConfidence: 0.8 },
  frequencyPeaks: [],
});

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

describe('Auto EQ and a bus enabled after the analysis', () => {
  it('applies the ready analysis when the bus is switched on', async () => {
    const rig = await makeDubBusRig(0.5);
    useTrackerAnalysisStore.setState({ analysisState: 'ready', currentAnalysis: analysis('Reggae'), currentFileHash: 'song-a', error: null });
    expect(rig.bus.getSettings().autoEqLastGenre ?? '').toBe('');
    await rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true }) }]);
    await vi.advanceTimersByTimeAsync(60);
    expect(rig.bus.getSettings().autoEqLastGenre).toBe('Reggae');
  }, 60_000);

  it('forgets the shown genre when a new song starts capturing, and applies the new one once', async () => {
    const rig = await makeDubBusRig(0.5);
    useTrackerAnalysisStore.setState({ analysisState: 'ready', currentAnalysis: analysis('Reggae'), currentFileHash: 'song-a', error: null });
    await rig.render([{ at: 0, run: () => rig.bus.setSettings({ enabled: true }) }]);
    await vi.advanceTimersByTimeAsync(60);
    expect(rig.bus.getSettings().autoEqLastGenre).toBe('Reggae');
    useTrackerAnalysisStore.setState({ analysisState: 'capturing', currentAnalysis: null, currentFileHash: 'song-b' });
    expect(rig.bus.getSettings().autoEqLastGenre).toBe('');
    useTrackerAnalysisStore.setState({ analysisState: 'ready', currentAnalysis: analysis('Rock'), currentFileHash: 'song-b' });
    await vi.advanceTimersByTimeAsync(60);
    expect(rig.bus.getSettings().autoEqLastGenre).toBe('Rock');
  }, 60_000);
});
