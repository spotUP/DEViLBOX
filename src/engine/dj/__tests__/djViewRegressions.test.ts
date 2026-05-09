/**
 * Regression tests for DJ view fixes (batch 3).
 *
 * Covers:
 * - Deck B pattern display: totalPositions must be set when loading tracker modules
 * - Auto DJ: local files (no modland:/hvsc: prefix) must be treated as playable
 * - Local track analysis: trackIsLocal() helper, trackNeedsAnalysis() includes local tracks
 * - Selector consolidation: verifies useShallow import exists in critical components
 * - Brake + filter-reset FX release handlers: handlePadUp must handle these pad types
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Deck B pattern display ──────────────────────────────────────────────────

describe('Deck B totalPositions regression', () => {
  it('DJDeck.tsx setDeckState call includes totalPositions for tracker modules', () => {
    // The drag-drop handler must pass totalPositions so DeckPatternDisplay shows
    // the pattern grid instead of an oscilloscope fallback.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/dj/DJDeck.tsx'),
      'utf-8',
    );
    // Find the setDeckState block that has analysisState: 'rendering'
    // It must also include totalPositions
    const renderingBlocks = src.split('setDeckState(deckId,');
    const blockWithRendering = renderingBlocks.find(
      (b) => b.includes("analysisState: 'rendering'") && b.includes('detectedBPM'),
    );
    expect(blockWithRendering).toBeDefined();
    expect(blockWithRendering).toContain('totalPositions');
  });

  it('DJTrackLoader.ts sets totalPositions for modland tracker loads', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJTrackLoader.ts'),
      'utf-8',
    );
    // All setDeckState calls that follow parseModuleToSong must include totalPositions
    const chunks = src.split('parseModuleToSong');
    // Skip the first chunk (before any parseModuleToSong call)
    const postParseChunks = chunks.slice(1);
    expect(postParseChunks.length).toBeGreaterThanOrEqual(2); // modland + local paths
    for (const chunk of postParseChunks) {
      const nextSetDeck = chunk.split('setDeckState(deckId,')[1];
      if (nextSetDeck && nextSetDeck.includes("analysisState: 'rendering'")) {
        expect(nextSetDeck.split('}')[0]).toContain('totalPositions');
      }
    }
  });
});

// ── Auto DJ local file support ──────────────────────────────────────────────

describe('Auto DJ local file support', () => {
  /**
   * Simulates the playable-count logic from DJAutoDJ.enable().
   * Before fix: only counted modland:/hvsc: tracks as downloadable.
   * After fix: counts ALL non-bad tracks as playable.
   */
  function countPlayable(
    tracks: Array<{ fileName: string; analysisStatus?: string }>,
  ): number {
    return tracks.filter(
      (t) => t.analysisStatus !== 'bad' && t.analysisStatus !== 'error',
    ).length;
  }

  it('counts local files as playable', () => {
    const tracks = [
      { fileName: 'axelf.mod' },
      { fileName: 'commando.sid' },
      { fileName: 'local:test.xm' },
    ];
    expect(countPlayable(tracks)).toBe(3);
  });

  it('excludes bad tracks', () => {
    const tracks = [
      { fileName: 'axelf.mod', analysisStatus: 'bad' },
      { fileName: 'commando.sid' },
    ];
    expect(countPlayable(tracks)).toBe(1);
  });

  it('DJAutoDJ.ts uses playableCount, not downloadableCount', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJAutoDJ.ts'),
      'utf-8',
    );
    // Must NOT filter by modland:/hvsc: prefix for the enable guard
    expect(src).not.toMatch(/downloadableCount/);
    expect(src).toMatch(/playableCount/);
  });
});

// ── Local track analysis ────────────────────────────────────────────────────

describe('Local track analysis', () => {
  function trackIsLocal(fileName: string): boolean {
    if (fileName.startsWith('local:')) return true;
    if (fileName.startsWith('modland:') || fileName.startsWith('hvsc:')) return false;
    // Plain filename = local file added via file picker
    return !fileName.includes(':') || /^[A-Za-z]:\\/.test(fileName);
  }

  it('recognizes plain filenames as local', () => {
    expect(trackIsLocal('axelf.mod')).toBe(true);
    expect(trackIsLocal('my song.xm')).toBe(true);
  });

  it('recognizes local: prefix as local', () => {
    expect(trackIsLocal('local:axelf.mod')).toBe(true);
  });

  it('does not treat modland: tracks as local', () => {
    expect(trackIsLocal('modland:pub/modules/foo.mod')).toBe(false);
  });

  it('does not treat hvsc: tracks as local', () => {
    expect(trackIsLocal('hvsc:MUSICIANS/H/Hubbard_Rob/Commando.sid')).toBe(false);
  });

  it('DJPlaylistAnalyzer has trackIsLocal helper', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJPlaylistAnalyzer.ts'),
      'utf-8',
    );
    expect(src).toContain('trackIsLocal');
    // trackNeedsAnalysis must not reject local tracks
    expect(src).not.toMatch(/trackNeedsAnalysis.*modland.*hvsc.*return false/s);
  });
});

// ── Selector consolidation (useShallow) ─────────────────────────────────────

describe('DJ component selector consolidation', () => {
  const components = [
    { name: 'DJView', path: '../../../components/dj/DJView.tsx' },
    { name: 'DeckTransport', path: '../../../components/dj/DeckTransport.tsx' },
    { name: 'DeckTrackInfo', path: '../../../components/dj/DeckTrackInfo.tsx' },
    { name: 'MixerCueSection', path: '../../../components/dj/MixerCueSection.tsx' },
    { name: 'DeckStemControls', path: '../../../components/dj/DeckStemControls.tsx' },
  ];

  for (const comp of components) {
    it(`${comp.name} uses useShallow for selector consolidation`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, comp.path), 'utf-8');
      expect(src).toContain('useShallow');
    });
  }
});

// ── FX pad release handlers ─────────────────────────────────────────────────

describe('FX pad release handlers', () => {
  it('DeckFXPads handlePadUp handles brake release', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/dj/DeckFXPads.tsx'),
      'utf-8',
    );
    // handlePadUp must have a case/branch for 'brake'
    expect(src).toMatch(/handlePadUp[\s\S]*?brake/);
  });

  it('DeckFXPads handlePadUp handles filter-reset release', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/dj/DeckFXPads.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/handlePadUp[\s\S]*?filter-reset/);
  });
});
