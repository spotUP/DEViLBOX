/**
 * Reachability for the server genre (G11'): loading a module makes
 * useTrackerAnalysis ask GET /api/genre/:key with the module's uade key, file
 * name, size and md5, and the ModArchive tag replaces the audio model's
 * genre in the analysis every consumer reads (badge, AutoDub, AutoEQ).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { FullAnalysisResult } from '@/stores/useTrackerAnalysisStore';

const AUDIO: FullAnalysisResult = {
  bpm: 125, bpmConfidence: 0.9, musicalKey: 'A minor', keyConfidence: 0.5, rmsDb: -12, peakDb: -1,
  analyzedAt: 0, frequencyPeaks: [],
  genre: {
    primary: 'Electronic', subgenre: 'Techno', confidence: 0.4, mood: 'Driving', energy: 0.7,
    danceability: 0.6, bpm: 125, bpmConfidence: 0.9, musicalKey: 'A minor', keyConfidence: 0.5,
  },
};

// The audio side: capture is idle, and the module has an earlier audio analysis on disk.
vi.mock('@/engine/TrackerAudioCapture', () => ({
  startCapture: vi.fn(), stopCapture: vi.fn(), finishCaptureEarly: vi.fn(() => null),
  isCurrentlyCapturing: vi.fn(() => false), getCurrentFileHash: vi.fn(() => null),
}));
vi.mock('@/engine/TrackerAnalysisCache', () => ({
  cacheAnalysis: vi.fn(async () => {}),
  getCachedAnalysis: vi.fn(async () => AUDIO),
  loadAllCachedAnalyses: vi.fn(async () => []),
}));
vi.mock('@/engine/TrackerAnalysisPipeline', () => ({ analyzeAudio: vi.fn(), extractGenreResult: vi.fn() }));

import { useTrackerAnalysis } from '../useTrackerAnalysis';
import { useTrackerAnalysisStore } from '@/stores/useTrackerAnalysisStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { computeUadeKey } from '@/lib/moduleGenre';
import type { Pattern } from '@/types/tracker';

describe('tracker analysis uses the server genre', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a loaded module shows its ModArchive genre in place of the audio guess', async () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 13) & 255);
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(
      { key: computeUadeKey(bytes), genre: 'Electronic - Ambient', source: 'modarchive', modarchiveId: 100721 },
    )));
    vi.stubGlobal('fetch', fetchMock);

    useTrackerStore.setState({
      patterns: [{ importMetadata: { sourceFile: 'chemical_emotion.mod' } } as unknown as Pattern],
    });
    useFormatStore.setState({ libopenmptFileData: bytes.buffer });

    renderHook(() => useTrackerAnalysis());

    await waitFor(() => expect(useTrackerAnalysisStore.getState().currentAnalysis?.genre.subgenre).toBe('Ambient'));
    await act(async () => { await Promise.resolve(); });

    const genreCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/genre/'));
    expect(genreCalls).toHaveLength(1);
    const url = new URL(String(genreCalls[0][0]));
    expect(url.pathname.endsWith(`/genre/${computeUadeKey(bytes)}`)).toBe(true);
    expect(url.searchParams.get('name')).toBe('chemical_emotion.mod');
    expect(url.searchParams.get('size')).toBe('70000');
    expect(url.searchParams.get('md5')).toMatch(/^[0-9a-f]{32}$/);

    const genre = useTrackerAnalysisStore.getState().currentAnalysis?.genre;
    expect([genre?.primary, genre?.subgenre, genre?.confidence, genre?.mood]).toEqual(['Electronic', 'Ambient', 1, 'Driving']);
  });
});
