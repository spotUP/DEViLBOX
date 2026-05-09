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

// ── Batch 4: pushUndo + Immer Draft proxy crashes ─────────────────────────

describe('pushUndo Immer Draft safety (batch 4)', () => {
  const storeSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../stores/useDJPlaylistStore.ts'),
    'utf-8',
  );

  it('pushUndo uses current() to unwrap Immer Draft before deepClone', () => {
    // pushUndo must call current(state) before passing playlists to
    // deepClonePlaylists. Without this, structuredClone throws on Draft
    // proxies → "Oh Snap" crash on every store mutation.
    expect(storeSrc).toMatch(/current\(state\)\.playlists/);
    // Must NOT pass raw state.playlists to deepClonePlaylists inside pushUndo
    const pushUndoBlock = storeSrc.split('function pushUndo')[1]?.split(/^(?:function |const |export )/m)[0] ?? '';
    expect(pushUndoBlock).not.toMatch(/deepClonePlaylists\(state\.playlists\)/);
  });

  it('clonePlaylist uses current() to unwrap Draft source', () => {
    // clonePlaylist must not cast Draft to PlaylistTrack — use current()
    expect(storeSrc).toMatch(/current\(source\)/);
    expect(storeSrc).not.toMatch(/source as unknown as DJPlaylist/);
  });

  it('undo() uses current() before deepClone', () => {
    // undo must unwrap Draft before cloning current playlists to redo stack
    const undoMatch = storeSrc.match(/undo:\s*\(\)\s*=>\s*\{[\s\S]*?syncPlaylists\(\)/);
    expect(undoMatch).not.toBeNull();
    const undoBlock = undoMatch![0];
    expect(undoBlock).toMatch(/current\(state\)\.playlists/);
    expect(undoBlock).not.toMatch(/deepClonePlaylists\(state\.playlists\)/);
  });

  it('redo() uses current() before deepClone', () => {
    // redo must unwrap Draft before cloning current playlists to undo stack
    const redoMatch = storeSrc.match(/redo:\s*\(\)\s*=>\s*\{[\s\S]*?syncPlaylists\(\)/);
    expect(redoMatch).not.toBeNull();
    const redoBlock = redoMatch![0];
    expect(redoBlock).toMatch(/current\(state\)\.playlists/);
    expect(redoBlock).not.toMatch(/deepClonePlaylists\(state\.playlists\)/);
  });

  it('imports current from immer', () => {
    expect(storeSrc).toMatch(/import\s*\{[^}]*current[^}]*\}\s*from\s*['"]immer['"]/);
  });
});

describe('DJPlaylistModal keyboard safety (batch 4)', () => {
  const modalSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../components/dj/DJPlaylistModal.tsx'),
    'utf-8',
  );

  it('registers with useUIStore.openModal to block global keyboard handler', () => {
    // The modal must call openModal('dj-playlist') so the global keyboard
    // handler skips tracker shortcuts while the user types in inputs.
    expect(modalSrc).toContain("openModal('dj-playlist')");
    expect(modalSrc).toContain('closeModal()');
  });

  it('uses memoized virtualItems instead of duplicate getVirtualItems() call', () => {
    // The JSX render must use the memoized virtualItems variable,
    // not call virtualizer.getVirtualItems() again (duplicate allocation).
    // Check the render section (after the last SortableContext usage in JSX)
    const renderSection = modalSrc.split('<SortableContext').pop() ?? '';
    expect(renderSection).not.toMatch(/virtualizer\.getVirtualItems\(\)\.map/);
    expect(renderSection).toMatch(/virtualItems\.map/);
  });
});

describe('DJPlaylistPanel memoized virtualItems (batch 4)', () => {
  it('uses memoized virtualItems in JSX render', () => {
    const panelSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../components/dj/DJPlaylistPanel.tsx'),
      'utf-8',
    );
    const renderSection = panelSrc.split('<SortableContext').pop() ?? '';
    expect(renderSection).not.toMatch(/virtualizer\.getVirtualItems\(\)\.map/);
    expect(renderSection).toMatch(/virtualItems\.map/);
  });
});

// ── Pipeline cache hit with empty audioData ─────────────────────────────────

describe('DJPipeline cache hit must require non-empty audioData', () => {
  it('loadOrEnqueue checks audioData.byteLength > 0 for Full cache hit', () => {
    // Regression: stub entries from cacheSourceFile have audioData = new ArrayBuffer(0)
    // but updateCacheAnalysis adds beatGrid+bpm. Without byteLength check, the pipeline
    // returns 0-byte audio as "Full cache hit" and loadAudioToDeck fails.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJPipeline.ts'),
      'utf-8',
    );
    const cacheCheck = src.match(/if\s*\(cached\s*&&.*Full cache hit/s);
    expect(cacheCheck).not.toBeNull();
    expect(cacheCheck![0]).toContain('audioData.byteLength');
  });
});

// ── DJTrackLoader companion handling in live load path ───────────────────────

describe('DJTrackLoader live load path handles companions', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../DJTrackLoader.ts'),
    'utf-8',
  );

  // The loadPlaylistTrackToDeckInternal function (live load path)
  const liveLoadSection = src.slice(src.indexOf('loadPlaylistTrackToDeckInternal'));

  it('downloads TFMX companions in the live load modland path', () => {
    expect(liveLoadSection).toContain('downloadTFMXCompanion');
  });

  it('downloads UADE companions in the live load modland path', () => {
    expect(liveLoadSection).toContain('downloadUADECompanions');
  });

  it('passes companions to loadOrEnqueue in the live load path', () => {
    const modlandSection = liveLoadSection.slice(
      liveLoadSection.indexOf("startsWith('modland:')"),
    );
    expect(modlandSection).toMatch(/loadOrEnqueue\([^)]*companions/s);
  });

  it('uses .wav filename for loadAudioToDeck to avoid UADE re-init', () => {
    const modlandSection = liveLoadSection.slice(
      liveLoadSection.indexOf("startsWith('modland:')"),
    );
    expect(modlandSection).toContain("replace(/\\.[^.]+$/, '.wav')");
  });
});

// ── Crossfader store property name ──────────────────────────────────────────

describe('Crossfader animation regression', () => {
  it('DJActions.setCrossfader uses direct setState, not batchDJSet', () => {
    // Bug 1: DJActions.setCrossfader wrote `state.crossfader` instead of `state.crossfaderPosition`
    // Bug 2: Using batchDJSet (rAF-deferred) causes React to reset the controlled
    // <input type="range"> slider to the stale value, making it appear frozen.
    // Fix: use direct useDJStore.getState().setCrossfader() for immediate update.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJActions.ts'),
      'utf-8',
    );
    const fnBody = src.slice(
      src.indexOf('export function setCrossfader'),
      src.indexOf('export function setCrossfaderCurve'),
    );
    // Must NOT call batchDJSet( for crossfader (causes controlled input to freeze)
    expect(fnBody).not.toMatch(/batchDJSet\(/);
    // Must use direct store action
    expect(fnBody).toContain('setCrossfader(clamped)');
  });

  it('useDJStore exposes crossfaderPosition (not crossfader) as the store property', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../stores/useDJStore.ts'),
      'utf-8',
    );
    expect(src).toContain('crossfaderPosition:');
    // The store should NOT have a plain `crossfader:` property
    expect(src).not.toMatch(/^\s+crossfader:\s+number/m);
  });
});

// ── DJ mode ToneEngine master mute ──────────────────────────────────────────

describe('DJ mode echo prevention', () => {
  it('ToneEngine has setDJMode method that mutes masterChannel', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../ToneEngine.ts'),
      'utf-8',
    );
    // Must have setDJMode method
    expect(src).toContain('public setDJMode(active: boolean)');
    // Must set volume to -Infinity when active
    const fnBody = src.slice(
      src.indexOf('public setDJMode(active: boolean)'),
      src.indexOf('}', src.indexOf('public setDJMode(active: boolean)') + 200),
    );
    expect(fnBody).toContain('-Infinity');
    expect(fnBody).toContain('_masterVolumeDb');
  });

  it('stop() respects _djModeActive flag and does not restore volume in DJ mode', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../ToneEngine.ts'),
      'utf-8',
    );
    const stopBody = src.slice(
      src.indexOf('public stop(): void'),
      src.indexOf('Tone.getTransport().stop()'),
    );
    expect(stopBody).toContain('_djModeActive');
  });

  it('useUIStore calls setDJMode(true) when entering DJ view', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../stores/useUIStore.ts'),
      'utf-8',
    );
    expect(src).toContain('setDJMode(true)');
    expect(src).toContain('setDJMode(false)');
  });
});

// ── Auto DJ deck detection and advancement ──────────────────────────────────

describe('Auto DJ deck detection and skip advancement', () => {
  it('DJAutoDJ has syncDeckState method that checks actual deck playing state', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJAutoDJ.ts'),
      'utf-8',
    );
    expect(src).toContain('private syncDeckState()');
    // Must check both decks
    expect(src).toContain('decks.A.isPlaying');
    expect(src).toContain('decks.B.isPlaying');
  });

  it('skip() calls syncDeckState before starting new transition', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJAutoDJ.ts'),
      'utf-8',
    );
    const skipBody = src.slice(
      src.indexOf('async skip():'),
      src.indexOf('async skip():') + 2000,
    );
    expect(skipBody).toContain('syncDeckState()');
  });

  it('skip() force-completes in-progress transition to advance indices', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DJAutoDJ.ts'),
      'utf-8',
    );
    const skipBody = src.slice(
      src.indexOf('async skip():'),
      src.indexOf('async skip():') + 2000,
    );
    // When a transition is in progress, skip must complete it before starting new one
    expect(skipBody).toContain('completeTransition()');
    expect(skipBody).toContain('cancelTransition()');
  });
});

// ── File size limit ─────────────────────────────────────────────────────────

describe('DJ deck file size limit', () => {
  it('DeckAudioPlayer allows files up to 200MB', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DeckAudioPlayer.ts'),
      'utf-8',
    );
    // Must be at least 200MB (200 * 1024 * 1024)
    expect(src).toMatch(/MAX_FILE_SIZE\s*=\s*200\s*\*\s*1024\s*\*\s*1024/);
  });
});

// ── Transition sweep guard ──────────────────────────────────────────────────

describe('Auto DJ transition sweep guard (prevents premature completeTransition)', () => {
  const autoDJSrc = fs.readFileSync(
    path.resolve(__dirname, '../DJAutoDJ.ts'),
    'utf-8',
  );

  it('DJAutoDJ has transitionSweepStarted field', () => {
    expect(autoDJSrc).toContain('private transitionSweepStarted');
  });

  it('triggerTransition resets transitionSweepStarted = false before awaits', () => {
    // Use the method definition to isolate the body (not call-sites)
    const triggerMatch = autoDJSrc.match(/private async triggerTransition\([^)]*\)[^{]*\{([\s\S]+?)\n  \}/);
    expect(triggerMatch).not.toBeNull();
    const triggerBody = triggerMatch![1];
    const flagResetIdx = triggerBody.indexOf('this.transitionSweepStarted = false');
    const firstAwaitIdx = triggerBody.indexOf('await import');
    expect(flagResetIdx).toBeGreaterThan(-1);
    expect(firstAwaitIdx).toBeGreaterThan(-1);
    expect(flagResetIdx).toBeLessThan(firstAwaitIdx);
  });

  it('triggerTransition sets transitionSweepStarted = true after sweep starts', () => {
    const triggerMatch = autoDJSrc.match(/private async triggerTransition\([^)]*\)[^{]*\{([\s\S]+?)\n  \}/);
    expect(triggerMatch).not.toBeNull();
    const triggerBody = triggerMatch![1];
    const sweepStartIdx = triggerBody.indexOf('this.transitionSweepStarted = true');
    expect(sweepStartIdx).toBeGreaterThan(-1);
    const skipTransitionIdx = triggerBody.indexOf('skipTransition(');
    const beatMatchedIdx = triggerBody.indexOf('beatMatchedTransition(');
    expect(sweepStartIdx).toBeGreaterThan(skipTransitionIdx);
    expect(sweepStartIdx).toBeGreaterThan(beatMatchedIdx);
  });

  it('poll loop transitioning case requires transitionSweepStarted for completion', () => {
    const transitioningCase = autoDJSrc.split("case 'transitioning'")[1];
    expect(transitioningCase).toBeDefined();
    expect(transitioningCase).toContain('crossfaderDone && !outgoingPlaying && this.transitionSweepStarted');
  });

  it('poll loop checks incoming deck is playing before completing', () => {
    const transitioningCase = autoDJSrc.split("case 'transitioning'")[1];
    expect(transitioningCase).toBeDefined();
    expect(transitioningCase).toContain('incomingPlaying');
    expect(transitioningCase).toContain('force completing');
  });

  it('completeTransition resets transitionSweepStarted', () => {
    const completeBody = autoDJSrc.split('completeTransition(): void')[1];
    expect(completeBody).toBeDefined();
    expect(completeBody!.substring(0, 200)).toContain('this.transitionSweepStarted = false');
  });

  it('cancelTransition resets transitionSweepStarted', () => {
    const cancelBody = autoDJSrc.split('cancelTransition(): void')[1];
    expect(cancelBody).toBeDefined();
    expect(cancelBody!.substring(0, 200)).toContain('this.transitionSweepStarted = false');
  });

  it('TRANSITION_TIMEOUT_MS is 45 seconds (not 180)', () => {
    expect(autoDJSrc).toMatch(/TRANSITION_TIMEOUT_MS\s*=\s*45[_,]?000/);
  });

  it('triggerTransition pre-starts incoming deck for skip transitions', () => {
    const triggerMatch = autoDJSrc.match(/private async triggerTransition\([^)]*\)[^{]*\{([\s\S]+?)\n  \}/);
    expect(triggerMatch).not.toBeNull();
    const triggerBody = triggerMatch![1];
    const preStartIdx = triggerBody.indexOf('await getDJEngine().getDeck(this.idleDeck).play()');
    expect(preStartIdx).toBeGreaterThan(-1);
    const skipTransitionIdx = triggerBody.indexOf('skipTransition(');
    expect(preStartIdx).toBeLessThan(skipTransitionIdx);
  });

  it('enable() resets transitionSweepStarted', () => {
    const enableBody = autoDJSrc.split('async enable(')[1];
    expect(enableBody).toBeDefined();
    expect(enableBody).toContain('this.transitionSweepStarted = false');
  });
});

// ── Scratch-buffer priming race fix ─────────────────────────────────────────
//
// Root cause: _primeScratchBuffer() fire-and-forgets a resume()/pause() cycle.
// If play() fires between resume() and pause(), it sees state='started' and
// no-ops, then priming's pause() kills the player → silence during crossfade.
// Fix: play() must cancel priming before proceeding.

describe('Scratch-buffer priming vs play() race fix', () => {
  const deckEngineSrc = fs.readFileSync(
    path.resolve(__dirname, '../DeckEngine.ts'), 'utf-8',
  );

  it('DeckEngine has _primingCancelRequested flag', () => {
    expect(deckEngineSrc).toContain('_primingCancelRequested');
  });

  it('DeckEngine has _cancelPrimingIfActive method', () => {
    expect(deckEngineSrc).toContain('_cancelPrimingIfActive');
  });

  it('play() calls _cancelPrimingIfActive before proceeding', () => {
    // Extract the play() method body
    const playMatch = deckEngineSrc.match(/async play\(\)[\s\S]*?\n  \}/m);
    expect(playMatch).not.toBeNull();
    const playBody = playMatch![0];
    // _cancelPrimingIfActive must appear before any audioPlayer.play or replayer.play
    const cancelIdx = playBody.indexOf('_cancelPrimingIfActive');
    const audioPlayIdx = playBody.indexOf('audioPlayer.play()');
    const replayerPlayIdx = playBody.indexOf('replayer.play()');
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeLessThan(audioPlayIdx);
    expect(cancelIdx).toBeLessThan(replayerPlayIdx);
  });

  it('_primeScratchBuffer checks _primingCancelRequested in worklet wait loop', () => {
    // Extract the priming method
    const primingMatch = deckEngineSrc.match(
      /private async _primeScratchBuffer\(\)[\s\S]*?\n  \}/m,
    );
    expect(primingMatch).not.toBeNull();
    const primingBody = primingMatch![0];
    // Must check cancel flag inside the wait-for-worklet loop
    const workletLoopMatch = primingBody.match(
      /for \(let t = 0;[^)]*scratchBufferReady[^)]*\)[^{]*\{([^}]*)\}/,
    );
    expect(workletLoopMatch).not.toBeNull();
    expect(workletLoopMatch![1]).toContain('_primingCancelRequested');
  });

  it('_primeScratchBuffer checks cancel before calling resume()', () => {
    const primingMatch = deckEngineSrc.match(
      /private async _primeScratchBuffer\(\)[\s\S]*?\n  \}/m,
    );
    expect(primingMatch).not.toBeNull();
    const primingBody = primingMatch![0];
    // There must be a cancel check between scratchBufferReady guard and resume()
    const readyGuardIdx = primingBody.indexOf('if (!this.scratchBufferReady) return');
    const resumeIdx = primingBody.indexOf('.resume()');
    expect(readyGuardIdx).toBeGreaterThan(-1);
    expect(resumeIdx).toBeGreaterThan(-1);
    const between = primingBody.slice(readyGuardIdx, resumeIdx);
    expect(between).toContain('_primingCancelRequested');
  });

  it('priming uses breakable wait loop instead of single 150ms sleep', () => {
    const primingMatch = deckEngineSrc.match(
      /private async _primeScratchBuffer\(\)[\s\S]*?\n  \}/m,
    );
    expect(primingMatch).not.toBeNull();
    const primingBody = primingMatch![0];
    // Must NOT have `await new Promise(r => setTimeout(r, 150))` — the old
    // single-shot sleep. Should instead have a loop that checks cancel flag.
    expect(primingBody).not.toContain('setTimeout(r, 150)');
    // Must have a loop with cancel check for the fill-buffer wait
    expect(primingBody).toMatch(/for \(let t = 0; t < 15/);
  });

  it('beatMatchedTransition catches async play() rejections', () => {
    const fxSrc = fs.readFileSync(
      path.resolve(__dirname, '../DJQuantizedFX.ts'), 'utf-8',
    );
    // The play() call inside the downbeat callback must have .catch()
    expect(fxSrc).toContain('incoming.play().catch(');
  });
});

// ── Fader range fix ─────────────────────────────────────────────────────────

describe('Fader range — thumb height accounting', () => {
  it('MixerChannelStrip getVolumeFromY accounts for THUMB_HEIGHT', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../components/dj/MixerChannelStrip.tsx'), 'utf-8',
    );
    const fnMatch = src.match(/getVolumeFromY[\s\S]*?return 1 - Math/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toContain('THUMB_HEIGHT');
  });
});

// ── DubBus wireMasterInsert race fix ────────────────────────────────────────

describe('DubBus wireMasterInsert stale connection cleanup', () => {
  const dubBusSrc = fs.readFileSync(
    path.resolve(__dirname, '../../dub/DubBus.ts'), 'utf-8',
  );

  it('wireMasterInsert completes stale disconnect when cancelling pending timer', () => {
    const wireMatch = dubBusSrc.match(
      /wireMasterInsert\(source: AudioNode[\s\S]*?\n  \}/m,
    );
    expect(wireMatch).not.toBeNull();
    const wireBody = wireMatch![0];
    expect(wireBody).toContain('staleSrc');
    expect(wireBody).toContain('staleDest');
    expect(wireBody).toContain('disconnect(this.masterInsertHead)');
  });
});

// ── Deck 2 cached audio song data fix ───────────────────────────────────────

describe('Cached audio path passes song data for pattern display', () => {
  const loaderSrc = fs.readFileSync(
    path.resolve(__dirname, '../DJTrackLoader.ts'), 'utf-8',
  );

  it('imports getCachedSong from DJSongCache', () => {
    expect(loaderSrc).toContain('getCachedSong');
    expect(loaderSrc).toMatch(/import.*getCachedSong.*from.*DJSongCache/);
  });

  it('loadPlaylistTrackToDeckInternal cached path sets totalPositions', () => {
    const cachedBlock = loaderSrc.split('Using cached audio for')[1];
    expect(cachedBlock).toBeDefined();
    const nextSetDeck = cachedBlock.split('setDeckState(deckId')[1];
    expect(nextSetDeck).toBeDefined();
    const stateBlock = nextSetDeck.split(');')[0];
    expect(stateBlock).toContain('totalPositions');
  });

  it('loadPlaylistTrackToDeckInternal cached path passes song to loadAudioToDeck', () => {
    const cachedBlock = loaderSrc.split('Using cached audio for')[1];
    expect(cachedBlock).toBeDefined();
    const loadCall = cachedBlock.split('loadAudioToDeck(')[1]?.split(');')[0] ?? '';
    expect(loadCall).toContain('cachedSong');
  });

  it('preRenderTrackInternal cached path includes song in result', () => {
    const preRenderBlock = loaderSrc.split('Pre-render cache hit')[1];
    expect(preRenderBlock).toBeDefined();
    const returnBlock = preRenderBlock.split('return {')[1]?.split('}')[0] ?? '';
    expect(returnBlock).toContain('song');
  });
});

// ── Audio levels gain staging ───────────────────────────────────────────────

describe('Audio levels — gain staging defaults prevent clipping', () => {
  it('masterVolume defaults to 1.0 (not 2.0)', () => {
    const storeSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../stores/useDJStore.ts'), 'utf-8',
    );
    const match = storeSrc.match(/masterVolume:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBeLessThanOrEqual(1.0);
  });

  it('channel fader clamps to 1.0 max (not 1.5)', () => {
    const deckSrc = fs.readFileSync(
      path.resolve(__dirname, '../DeckEngine.ts'), 'utf-8',
    );
    const setVolumeMatch = deckSrc.match(/setVolume\(value[\s\S]*?Math\.min\(([\d.]+)/);
    expect(setVolumeMatch).not.toBeNull();
    expect(parseFloat(setVolumeMatch![1])).toBeLessThanOrEqual(1.0);
  });

  it('master gain clamps to 1.5 max (not 2.0)', () => {
    const mixerSrc = fs.readFileSync(
      path.resolve(__dirname, '../DJMixerEngine.ts'), 'utf-8',
    );
    const setMasterMatch = mixerSrc.match(/setMasterVolume[\s\S]*?Math\.min\(([\d.]+)/);
    expect(setMasterMatch).not.toBeNull();
    expect(parseFloat(setMasterMatch![1])).toBeLessThanOrEqual(1.5);
  });

  it('deck brick-wall limiter threshold is -3 dBFS or lower', () => {
    const deckSrc = fs.readFileSync(
      path.resolve(__dirname, '../DeckEngine.ts'), 'utf-8',
    );
    const threshMatch = deckSrc.match(/limiter\.threshold\.value\s*=\s*(-[\d.]+)/);
    expect(threshMatch).not.toBeNull();
    expect(parseFloat(threshMatch![1])).toBeLessThanOrEqual(-3);
  });
});

// ── Playlist preview play/stop ──────────────────────────────────────────────

describe('Playlist preview — deck-based stop mechanism', () => {
  const panelSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../components/dj/DJPlaylistPanel.tsx'), 'utf-8',
  );

  it('uses previewDeckRef instead of orphaned AudioBufferSourceNode refs', () => {
    expect(panelSrc).toContain('previewDeckRef');
    expect(panelSrc).not.toContain('previewPlayerRef');
    expect(panelSrc).not.toContain('previewGainRef');
  });

  it('stopPreview stops the deck via getDJEngine', () => {
    const stopBlock = panelSrc.split('stopPreview')[1];
    expect(stopBlock).toBeDefined();
    expect(stopBlock).toContain('previewDeckRef.current');
    expect(stopBlock).toContain('getDJEngine()');
  });

  it('handlePreview saves the idle deck to previewDeckRef', () => {
    const handleBlock = panelSrc.split('handlePreview')[1];
    expect(handleBlock).toBeDefined();
    expect(handleBlock).toContain('previewDeckRef.current = idleDeck');
  });
});

// ── MIDI volume routing — no 1.5x multiplier ───────────────────────────────

describe('MIDI DJ volume routes use unity gain (no 1.5x multiplier)', () => {
  const routerSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../midi/performance/parameterRouter.ts'), 'utf-8',
  );

  it('deckA.volume route does not multiply by 1.5', () => {
    const match = routerSrc.match(/'dj\.deckA\.volume':\s*\(v\)\s*=>\s*[^,]+/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toContain('1.5');
  });

  it('deckB.volume route does not multiply by 1.5', () => {
    const match = routerSrc.match(/'dj\.deckB\.volume':\s*\(v\)\s*=>\s*[^,]+/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toContain('1.5');
  });

  it('masterVolume route does not multiply by 1.5', () => {
    const match = routerSrc.match(/'dj\.masterVolume':\s*\(v\)\s*=>\s*[^,]+/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toContain('1.5');
  });
});

// ── MPK Mini — dedicated profile with volume on knobs ───────────────────────

describe('MPK Mini has dedicated profile with volume on knobs', () => {
  const genericSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../midi/djGenericControllers.ts'), 'utf-8',
  );

  it('MPK_MINI preset exists and is exported', () => {
    expect(genericSrc).toContain('export const MPK_MINI');
  });

  it('MPK Mini detect pattern is separate from GENERIC_8x8', () => {
    const generic8x8Match = genericSrc.match(/GENERIC_8x8[\s\S]*?detectPatterns:\s*\[([^\]]+)\]/);
    expect(generic8x8Match).not.toBeNull();
    expect(generic8x8Match![1]).not.toContain('mpk');
  });

  it('MPK Mini maps CC 70 to deckA.volume (not filter)', () => {
    const mpkBlock = genericSrc.split('MPK_MINI')[1]?.split('export const')[0] ?? '';
    const cc70Line = mpkBlock.match(/cc:\s*70,\s*param:\s*'([^']+)'/);
    expect(cc70Line).not.toBeNull();
    expect(cc70Line![1]).toBe('dj.deckA.volume');
  });

  it('MPK Mini maps CC 77 to crossfader', () => {
    const mpkBlock = genericSrc.split('MPK_MINI')[1]?.split('export const')[0] ?? '';
    const cc77Line = mpkBlock.match(/cc:\s*77,\s*param:\s*'([^']+)'/);
    expect(cc77Line).not.toBeNull();
    expect(cc77Line![1]).toBe('dj.crossfader');
  });

  it('MPK Mini is listed before GENERIC_8x8 in DJ_GENERIC_CONTROLLERS', () => {
    const arrMatch = genericSrc.match(/DJ_GENERIC_CONTROLLERS[\s\S]*?\[([^\]]+)\]/);
    expect(arrMatch).not.toBeNull();
    const mpkIdx = arrMatch![1].indexOf('MPK_MINI');
    const genericIdx = arrMatch![1].indexOf('GENERIC_8x8');
    expect(mpkIdx).toBeGreaterThan(-1);
    expect(mpkIdx).toBeLessThan(genericIdx);
  });
});

// ── Analysis cache uses relative URL ────────────────────────────────────────

describe('Analysis cache — relative URL for dev proxy', () => {
  it('analysisCache.ts defaults to /api (not absolute URL)', () => {
    const cacheSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../lib/analysisCache.ts'), 'utf-8',
    );
    const urlMatch = cacheSrc.match(/const API_URL\s*=.*\|\|\s*'([^']+)'/);
    expect(urlMatch).not.toBeNull();
    expect(urlMatch![1]).toBe('/api');
    expect(cacheSrc).not.toContain('devilbox.uprough.net');
  });
});

// ── Sammy Blammy samples on One-Shots Live bank B ───────────────────────────

describe('One-Shots Live preset — Sammy Blammy on bank B', () => {
  const presetSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../constants/djPadPresets.ts'), 'utf-8',
  );

  it('imports SAMMY_BLAMMY_PACK', () => {
    expect(presetSrc).toMatch(/import.*SAMMY_BLAMMY_PACK.*from.*samplePacks/);
  });

  it('oneshots-live creates bank A synths + bank B Sammy Blammy', () => {
    const block = presetSrc.split("id: 'oneshots-live'")[1]?.split('onApply')[0] ?? '';
    expect(block).toContain('applyOneShotPads(program, 0, 16)');
    expect(block).toContain('applySammyBlammyPads(program, 16)');
  });

  it('applySammyBlammyPads sets pad metadata from SAMMY_BLAMMY_PACK', () => {
    // getSammyBlammySamples() pulls from SAMMY_BLAMMY_PACK, applySammyBlammyPads sets playMode
    expect(presetSrc).toContain('SAMMY_BLAMMY_PACK.samples.vocals');
    const fnBlock = presetSrc.split('function applySammyBlammyPads')[1]?.split('function ')[0] ?? '';
    expect(fnBlock).toContain("pad.playMode = 'oneshot'");
  });

  it('onApply triggers async sample loading for bank B', () => {
    const onApplyBlock = presetSrc.split("id: 'oneshots-live'")[1]?.split("id: '")[0] ?? '';
    expect(onApplyBlock).toContain('loadSammyBlammySamples');
  });

  it('loadSammyBlammySamples fetches and decodes audio via loadSampleToPad', () => {
    expect(presetSrc).toContain('loadSampleToPad');
    expect(presetSrc).toContain('decodeAudioData');
    expect(presetSrc).toContain('normalizeUrl');
  });
});
