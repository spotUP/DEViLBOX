/**
 * Reachability for the server genre (G11'): loading a module from any source
 * (ModArchive, Modland, HVSC, a local file) makes useTrackerAnalysis ask
 * GET /api/genre/:key with the module's uade key, the name it was opened under
 * (format store sourceFileName), size and md5, and the ModArchive tag replaces
 * the audio model's genre in the analysis every consumer reads (badge, AutoDub,
 * AutoEQ).
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
import { computeUadeKey } from '@/lib/moduleGenre';

describe('tracker analysis uses the server genre', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useFormatStore.getState().reset();
    useTrackerAnalysisStore.getState().clearAnalysis();
  });

  it('a loaded module shows its ModArchive genre in place of the audio guess', async () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 13) & 255);
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(
      { key: computeUadeKey(bytes), genre: 'Electronic - Ambient', source: 'modarchive', modarchiveId: 100721 },
    )));
    vi.stubGlobal('fetch', fetchMock);

    useFormatStore.setState({ libopenmptFileData: bytes.buffer, sourceFileName: 'chemical_emotion.mod' });

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

  it('a song from Modland on its own replayer asks for the genre under its file name', async () => {
    const bytes = Uint8Array.from({ length: 4321 }, (_, i) => (i * 7) & 255);
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(
      { key: computeUadeKey(bytes), genre: null, source: 'none' },
    )));
    vi.stubGlobal('fetch', fetchMock);

    // InStereo! 1.0 plays on its own WASM replayer: its bytes sit in inStereo1FileData, a field the genre lookup never read.
    useFormatStore.setState({ inStereo1FileData: bytes.buffer, sourceFileName: 'fantasi8.is' });
    renderHook(() => useTrackerAnalysis());

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/genre/'))).toBe(true));
    const url = new URL(String(fetchMock.mock.calls.find(([u]) => String(u).includes('/genre/'))![0]));
    expect(url.searchParams.get('name')).toBe('fantasi8.is');
    expect(url.searchParams.get('size')).toBe('4321');
  });

  it('asks nothing until the song has a file name, so a wrong name never reaches the server cache', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    useFormatStore.setState({ libopenmptFileData: new Uint8Array(100).buffer, sourceFileName: null });
    renderHook(() => useTrackerAnalysis());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/genre/'))).toHaveLength(0);
  });
});
