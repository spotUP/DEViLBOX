/**
 * DJDeck - Single deck panel containing all per-deck controls.
 *
 * Used twice in DJView: once for Deck A (left), once for Deck B (right).
 * Layout mirrors between A (left-aligned) and B (right-aligned).
 */

import React, { useEffect, useRef, useCallback, useState, Suspense, lazy } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { isAudioFile } from '@/lib/audioFileUtils';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { DeckTransport } from './DeckTransport';
import { DeckPitchSlider } from './DeckPitchSlider';
import { DeckNudge } from './DeckNudge';
import { DeckTrackInfo } from './DeckTrackInfo';
import { DeckTrackOverview } from './DeckTrackOverview';
import { DeckVisualizer } from './DeckVisualizer';
import { DeckTurntable } from './DeckTurntable';
import { DeckVinylView } from './DeckVinylView';
import { DeckLoopControls } from './DeckLoopControls';
import { DeckScopes } from './DeckScopes';
import { DeckScratch } from './DeckScratch';
import { DeckFXPads } from './DeckFXPads';
import { DeckCuePoints } from './DeckCuePoints';
import { DeckBeatGrid } from './DeckBeatGrid';
import { DeckAudioWaveform } from './DeckAudioWaveform';
import { DeckPatternDisplay } from './DeckPatternDisplay';

// Lazy-load 3D view to avoid Three.js bundle bloat for users who don't use it
const DeckVinyl3DView = lazy(() => import('./DeckVinyl3DView'));

interface DJDeckProps {
  deckId: 'A' | 'B' | 'C';
}

export const DJDeck: React.FC<DJDeckProps> = ({ deckId }) => {
  const animFrameRef = useRef<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingDrop, setIsLoadingDrop] = useState(false);
  const [vizResetKey, setVizResetKey] = useState(0);
  const dragCountRef = useRef(0);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const hasPatternData = useDJStore((s) => s.decks[deckId].totalPositions > 0);

  // Poll playback position and update store at ~30fps
  useEffect(() => {
    let running = true;

    const poll = () => {
      if (!running) return;

      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const store = useDJStore.getState();

        if (deck.playbackMode === 'audio') {
          // Audio file mode — poll audio player position
          if (deck.audioPlayer.isCurrentlyPlaying()) {
            const pos = deck.audioPlayer.getPosition();
            const dur = deck.audioPlayer.getDuration();
            const update: Record<string, unknown> = {
              audioPosition: pos,
              elapsedMs: pos * 1000,
              durationMs: dur * 1000,
            };
            // Derive pattern position from audio time for pre-rendered modules
            const tp = deck.getPositionAtTime(pos * 1000);
            if (tp) {
              update.songPos = tp.songPos;
              update.pattPos = tp.pattPos;
            }
            store.setDeckState(deckId, update);
          }
          // Detect end of audio playback
          if (!deck.audioPlayer.isCurrentlyPlaying() && store.decks[deckId].isPlaying) {
            store.setDeckPlaying(deckId, false);
          }
        } else {
          // Tracker module mode — poll replayer position
          const replayer = deck.replayer;
          if (replayer.isPlaying()) {
            store.setDeckPosition(deckId, replayer.getSongPos(), replayer.getPattPos());

            // During pattern scratch the sequencer is frozen (tempoMultiplier ≈ 0)
            // so effectiveBPM would read near-zero. Skip BPM/elapsed updates to
            // keep the pre-scratch values visible and prevent sync indicator flickering.
            if (deck.isPatternActive()) {
              // Push scratch velocity + fader gain to store so UI reacts
              const { velocity, faderGain } = deck.getScratchState();
              const prevV = store.decks[deckId].scratchVelocity;
              const prevF = store.decks[deckId].scratchFaderGain;
              const update: Partial<typeof store.decks.A> = {};
              if (Math.abs(velocity - prevV) > 0.05) update.scratchVelocity = velocity;
              if (faderGain !== prevF) update.scratchFaderGain = faderGain;
              if (Object.keys(update).length > 0) {
                store.setDeckState(deckId, update);
              }
            } else {
              const liveBPM = Math.round(replayer.getBPM() * replayer.getTempoMultiplier() * 100) / 100;
              store.setDeckState(deckId, {
                elapsedMs: replayer.getElapsedMs(),
                effectiveBPM: liveBPM,
              });
              // Relay BPM changes to ScratchPlayback for LFO resync
              try { deck.notifyBPMChange(liveBPM); } catch { /* engine not ready */ }

              // Fader LFO without pattern: estimate visual fader state from timing
              const lfoDiv = store.decks[deckId].faderLFODivision;
              if (store.decks[deckId].faderLFOActive && lfoDiv) {
                const divBeats: Record<string, number> = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 };
                const periodMs = (60000 / liveBPM) * (divBeats[lfoDiv] ?? 1);
                const elapsed = replayer.getElapsedMs();
                const posInPeriod = elapsed % periodMs;
                const lfoFaderGain = posInPeriod < periodMs * 0.5 ? 1 : 0;
                if (lfoFaderGain !== store.decks[deckId].scratchFaderGain) {
                  store.setDeckState(deckId, { scratchFaderGain: lfoFaderGain });
                }
              } else if (store.decks[deckId].scratchVelocity !== 0 || store.decks[deckId].scratchFaderGain !== 1) {
                // Clear scratch state when not scratching
                store.setDeckState(deckId, { scratchVelocity: 0, scratchFaderGain: 1 });
              }
            }
          }

          // Auto-clear activePatternName when a one-shot pattern finishes naturally
          if (!deck.isPatternActive() && store.decks[deckId].activePatternName !== null) {
            store.setDeckPattern(deckId, null);
          }
        }
      } catch {
        // Engine might not be initialized yet
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [deckId]);

  // Subscribe to pitch changes in store and propagate to engine
  // This catches ALL pitch sources (slider, keyboard, sync button) in one place
  useEffect(() => {
    let prevPitch = useDJStore.getState().decks[deckId].pitchOffset;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newPitch = state.decks[deckId].pitchOffset;
      if (newPitch !== prevPitch) {
        prevPitch = newPitch;
        try {
          getDJEngine().getDeck(deckId).setPitch(newPitch);
        } catch {
          // Engine might not be initialized yet
        }
      }
    });
    return unsubscribe;
  }, [deckId]);

  // Subscribe to channel mute mask changes and push to the deck's replayer.
  // Each deck owns its own mask so Deck A and Deck B are fully independent.
  useEffect(() => {
    let prevMask = useDJStore.getState().decks[deckId].channelMask;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newMask = state.decks[deckId].channelMask;
      if (newMask !== prevMask) {
        prevMask = newMask;
        try {
          getDJEngine().getDeck(deckId).replayer.setChannelMuteMask(newMask);
        } catch {
          // Engine might not be initialized yet
        }
      }
    });
    return unsubscribe;
  }, [deckId]);

  // Wire replayer callbacks to store
  useEffect(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);

      deck.replayer.onRowChange = (_row, _pattern, _position) => {
        // Position updates handled by RAF polling above
      };

      deck.replayer.onSongEnd = () => {
        useDJStore.getState().setDeckPlaying(deckId, false);
      };
    } catch {
      // Engine might not be initialized yet
    }
  }, [deckId]);

  // ── Drag-and-drop: load file directly to this deck ────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.items && Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCountRef.current = 0;

    const file = Array.from(e.dataTransfer.files)[0];
    if (!file) return;

    setVizResetKey((k) => k + 1);
    setIsLoadingDrop(true);
    try {
      const engine = getDJEngine();

      if (isAudioFile(file.name)) {
        // Audio file mode (MP3, WAV, FLAC, etc.)
        const buffer = await file.arrayBuffer();
        const info = await engine.loadAudioToDeck(deckId, buffer, file.name);

        // Switch to turntable view for audio files
        useDJStore.getState().setDeckViewMode('vinyl');

        // Try to parse Serato metadata (cue points, beatgrid, BPM)
        let seratoBPM = 0;
        let seratoCues: import('@/lib/serato/seratoMetadata').SeratoCuePoint[] = [];
        let seratoLoops: import('@/lib/serato/seratoMetadata').SeratoLoop[] = [];
        let seratoBeatGrid: import('@/lib/serato/seratoMetadata').SeratoBeatMarker[] = [];
        let seratoKey: string | null = null;
        try {
          const { readSeratoMetadata } = await import('@/lib/serato/seratoMetadata');
          const meta = readSeratoMetadata(buffer);
          seratoBPM = meta.bpm ?? 0;
          seratoCues = meta.cuePoints;
          seratoLoops = meta.loops;
          seratoBeatGrid = meta.beatGrid;
          seratoKey = meta.key;
        } catch { /* Not a Serato-analyzed file */ }

        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: file.name.replace(/\.[^.]+$/, ''),
          detectedBPM: seratoBPM,
          effectiveBPM: seratoBPM,
          totalPositions: 0,
          songPos: 0,
          pattPos: 0,
          elapsedMs: 0,
          isPlaying: false,
          playbackMode: 'audio',
          durationMs: info.duration * 1000,
          audioPosition: 0,
          waveformPeaks: info.waveformPeaks,
          seratoCuePoints: seratoCues,
          seratoLoops: seratoLoops,
          seratoBeatGrid: seratoBeatGrid,
          seratoKey: seratoKey,
        });
      } else {
        // Tracker module mode (MOD, XM, IT, S3M, etc.)
        const song = await parseModuleToSong(file);
        cacheSong(file.name, song);
        const bpmResult = detectBPM(song);
        const moduleBuffer = await file.arrayBuffer();

        // Set loading state
        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: song.name || file.name,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: 'rendering',
          isPlaying: false,
        });

        // Render FIRST, then load audio directly (eliminates tracker bugs)
        try {
          const result = await getDJPipeline().loadOrEnqueue(moduleBuffer, file.name, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, file.name, song.name || file.name, result.analysis?.bpm || bpmResult.bpm, song);
          
          // Switch to visualizer view for modules
          useDJStore.getState().setDeckViewMode('visualizer');
          
          console.log(`[DJDeck] Loaded ${file.name} in audio mode (skipped tracker bugs)`);
        } catch (err) {
          console.error(`[DJDeck] Pipeline failed:`, err);
        }
      }
    } catch (err) {
      console.error(`[DJDeck] Failed to load ${file.name} to deck ${deckId}:`, err);
    } finally {
      setIsLoadingDrop(false);
    }
  }, [deckId]);

  const isB = deckId === 'B';
  const deckNum = deckId === 'A' ? '1' : deckId === 'B' ? '2' : '3';
  const deckColor = deckId === 'A' ? 'text-blue-400' : deckId === 'B' ? 'text-red-400' : 'text-emerald-400';
  const deckBorderColor = deckId === 'A' ? 'border-blue-900/30' : deckId === 'B' ? 'border-red-900/30' : 'border-emerald-900/30';
  const deckHighlight = deckId === 'A' ? 'border-blue-500/60' : deckId === 'B' ? 'border-red-500/60' : 'border-emerald-500/60';

  return (
    <div
      className={`relative flex flex-col gap-2 p-3 bg-dark-bg rounded-lg border min-w-0 h-full overflow-hidden transition-all ${
        isDragOver ? deckHighlight : deckBorderColor
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-dj-deck-drop
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 bg-black/70 rounded-lg flex items-center justify-center pointer-events-none">
          <div className={`text-lg font-mono font-bold ${deckColor}`}>
            Drop to load Deck {deckNum}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoadingDrop && (
        <div className="absolute inset-0 z-10 bg-black/70 rounded-lg flex items-center justify-center pointer-events-none">
          <div className={`text-sm font-mono ${deckColor} animate-pulse`}>Loading...</div>
        </div>
      )}

      {/* Track info + turntable */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-mono font-bold tracking-[0.3em] uppercase ${deckColor} opacity-60 mb-1`}>
            Deck {deckNum}
          </div>
          <DeckTrackInfo deckId={deckId} />
        </div>
        <DeckScopes deckId={deckId} size={64} />
        {deckViewMode === 'visualizer' && <DeckTurntable deckId={deckId} />}
      </div>

      {/* Track overview bar (with beatgrid overlay for audio mode) */}
      <div className="relative">
        <DeckTrackOverview deckId={deckId} />
        <DeckBeatGrid deckId={deckId} />
      </div>

      {/* Scrolling audio waveform (audio mode only, shown above the visualizer) */}
      <DeckAudioWaveform deckId={deckId} />

      {/* Main controls area: pattern display / vinyl + pitch slider */}
      <div className={`flex gap-2 flex-1 min-h-0 ${isB ? 'flex-row-reverse' : ''}`}>
        {/* Pattern display / Visualizer / Vinyl */}
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center relative">
          {deckViewMode === '3d' ? (
            <Suspense fallback={
              <div className="flex items-center justify-center w-full h-full text-text-muted text-xs font-mono">
                Loading 3D...
              </div>
            }>
              <DeckVinyl3DView deckId={deckId} />
            </Suspense>
          ) : deckViewMode === 'vinyl' ? (
            <DeckVinylView deckId={deckId} />
          ) : (
            <DeckVisualizer deckId={deckId} resetKey={vizResetKey} />
          )}

          {/* Pattern overlay — shows for tracker modules in any view mode except visualizer (which has its own) */}
          {hasPatternData && deckViewMode !== 'visualizer' && (
            <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.55 }}>
              <DeckPatternDisplay deckId={deckId} />
            </div>
          )}
        </div>

        {/* Pitch slider */}
        <div className="flex-shrink-0 self-stretch">
          <DeckPitchSlider deckId={deckId} />
        </div>
      </div>

      {/* Cue points (audio mode only) */}
      <DeckCuePoints deckId={deckId} />

      {/* Transport + Nudge + Loop */}
      <div className="flex items-center gap-2">
        <DeckTransport deckId={deckId} />
        <DeckNudge deckId={deckId} />
        <DeckLoopControls deckId={deckId} />
      </div>

      {/* Performance FX Pads */}
      <DeckFXPads deckId={deckId} />

      {/* Scratch presets + Fader LFO */}
      <DeckScratch deckId={deckId} />
    </div>
  );
};
