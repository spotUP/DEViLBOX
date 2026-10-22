/**
 * The server's ModArchive genre replaces the audio model's genre in
 * currentAnalysis, whichever arrives first, and only for its own file.
 * The cache keeps the audio result.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackerAnalysisStore, type FullAnalysisResult } from '../useTrackerAnalysisStore';

const AUDIO: FullAnalysisResult = {
  bpm: 125, bpmConfidence: 0.9, musicalKey: 'A minor', keyConfidence: 0.5, rmsDb: -12, peakDb: -1,
  analyzedAt: 0, frequencyPeaks: [],
  genre: {
    primary: 'Electronic', subgenre: 'Techno', confidence: 0.4, mood: 'Driving', energy: 0.7,
    danceability: 0.6, bpm: 125, bpmConfidence: 0.9, musicalKey: 'A minor', keyConfidence: 0.5,
  },
};

const store = () => useTrackerAnalysisStore.getState();
const shown = () => store().currentAnalysis?.genre;

describe('module genre in the tracker analysis store', () => {
  beforeEach(() => {
    useTrackerAnalysisStore.setState({ cache: new Map(), moduleGenre: null });
    store().clearAnalysis();
  });

  it('a tag that arrives before the analysis is applied when the analysis lands', () => {
    store().startCapture('aaaa');
    store().setModuleGenre('aaaa', 'Trance - Dream');
    store().setAnalysis(AUDIO);
    expect([shown()?.primary, shown()?.subgenre, shown()?.confidence]).toEqual(['Trance', 'Dream', 1]);
    expect(shown()?.mood).toBe('Driving');
    expect(store().getCached('aaaa')?.genre.primary).toBe('Electronic');
  });

  it('a tag that arrives after the analysis replaces the shown genre', () => {
    store().startCapture('aaaa');
    store().setAnalysis(AUDIO);
    store().setModuleGenre('aaaa', 'Chiptune');
    expect(shown()?.primary).toBe('Chiptune');
  });

  it('a cached analysis is shown with the tag', () => {
    store().setCached('aaaa', AUDIO);
    store().setModuleGenre('aaaa', 'Chiptune');
    store().startCapture('aaaa');
    expect(shown()?.primary).toBe('Chiptune');
  });

  it('a tag for another file changes nothing', () => {
    store().startCapture('aaaa');
    store().setAnalysis(AUDIO);
    store().setModuleGenre('bbbb', 'Chiptune');
    expect(shown()?.primary).toBe('Electronic');
  });
});
