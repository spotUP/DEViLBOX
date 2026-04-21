/**
 * DJDeck - Single deck panel containing all per-deck controls.
 *
 * Used twice in DJView: once for Deck A (left), once for Deck B (right).
 * Layout mirrors between A (left-aligned) and B (right-aligned).
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { setDeckPitch, setDeckChannelMuteMask } from '@/engine/dj/DJActions';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { isAudioFile } from '@/lib/audioFileUtils';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { loadUADEToDeck } from '@/engine/dj/DJUADEPrerender';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { DeckTransport } from './DeckTransport';
import { DeckPitchSlider } from './DeckPitchSlider';
import { DeckNudge } from './DeckNudge';
import { DeckTrackInfo } from './DeckTrackInfo';
import { DeckTrackOverview } from './DeckTrackOverview';
import { DeckVisualizer } from './DeckVisualizer';
import { DeckTurntable } from './DeckTurntable';
import { DeckCssTurntable } from './DeckCssTurntable';
import { DeckLoopControls } from './DeckLoopControls';
import { DeckScopes } from './DeckScopes';
import { DeckScratch } from './DeckScratch';
import { DeckFXPads } from './DeckFXPads';
import { DeckQuickEQ } from './DeckQuickEQ';
import { DeckCuePoints } from './DeckCuePoints';
import { DeckBeatGrid } from './DeckBeatGrid';
// DeckAudioWaveform moved to full-width strip in DJView
import { DeckPatternDisplay } from './DeckPatternDisplay';

interface DJDeckProps {
  deckId: 'A' | 'B' | 'C';
}

export const DJDeck: React.FC<DJDeckProps> = ({ deckId }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingDrop, setIsLoadingDrop] = useState(false);
  const [vizResetKey, setVizResetKey] = useState(0);
  const dragCountRef = useRef(0);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const hasFileLoaded = useDJStore((s) => !!s.decks[deckId].fileName);
  const hasPatternData = useDJStore((s) => s.decks[deckId].totalPositions > 0);
  const hasAudioWaveform = useDJStore((s) => {
    const peaks = s.decks[deckId].waveformPeaks;
    return !!(peaks && peaks.length > 0);
  });

  // Subscribe to pitch changes in store and propagate to engine
  // This catches ALL pitch sources (slider, keyboard, sync button) in one place
  useEffect(() => {
    let prevPitch = useDJStore.getState().decks[deckId].pitchOffset;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newPitch = state.decks[deckId].pitchOffset;
      if (newPitch !== prevPitch) {
        prevPitch = newPitch;
        setDeckPitch(deckId, newPitch);
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
        setDeckChannelMuteMask(deckId, newMask);
      }
    });
    return unsubscribe;
  }, [deckId]);

  // ── fx-target channels → deck channel taps on the dub bus ──────────
  //
  // When the DJ picks channels in FX mode, we eagerly open a
  // per-channel tap on the deck's replayer and register it with the
  // dub bus. This avoids first-fire latency — by the time the DJ
  // presses a DUB pad the tap is already live. When the set shrinks
  // or empties, we dispose the tap + unregister from the bus.
  //
  // The bus itself lives inside DrumPadEngine (global singleton); we
  // reach it through a dynamic import so this file doesn't acquire a
  // hard dep on the dub subsystem.
  useEffect(() => {
    // live map of ch → source disposer
    const openTaps = new Map<number, { dispose(): void }>();
    let disposed = false;

    const syncTaps = async () => {
      if (disposed) return;
      try {
        const [{ getDJEngine: getEng }, dubModule] = await Promise.all([
          import('@/engine/dj/DJEngine'),
          import('@/hooks/drumpad/useMIDIPadRouting'),
        ]);
        const bus = dubModule.getDrumPadEngine()?.getDubBus();
        const deck = getEng().getDeck(deckId);
        if (!bus || !deck) return;

        const wanted = useDJStore.getState().decks[deckId].fxTargetChannels;

        // Close taps no longer in the wanted set.
        for (const [ch, src] of openTaps) {
          if (!wanted.has(ch)) {
            try { bus.unregisterDeckChannelTap(deckId, ch); } catch { /* ok */ }
            try { src.dispose(); } catch { /* ok */ }
            openTaps.delete(ch);
          }
        }

        // Open taps newly in the set.
        for (const ch of wanted) {
          if (openTaps.has(ch)) continue;
          const tap = deck.openChannelTap(ch);
          if (!tap) continue; // audio mode or out-of-range
          try {
            bus.registerDeckChannelTap(deckId, ch, tap.output);
            openTaps.set(ch, tap);
          } catch (e) {
            console.warn(`[DJDeck] registerDeckChannelTap(${deckId}:${ch}) failed:`, e);
            try { tap.dispose(); } catch { /* ok */ }
          }
        }
      } catch { /* bus not ready yet — retry on next change */ }
    };

    // Subscribe to fxTargetChannels changes. Set identity changes on
    // every immer write so reference equality is enough.
    let prev = useDJStore.getState().decks[deckId].fxTargetChannels;
    void syncTaps();
    const unsubscribe = useDJStore.subscribe((state) => {
      const next = state.decks[deckId].fxTargetChannels;
      if (next !== prev) {
        prev = next;
        void syncTaps();
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
      // Tear down everything we opened.
      for (const [ch, src] of openTaps) {
        try {
          void import('@/hooks/drumpad/useMIDIPadRouting').then(m => {
            m.getDrumPadEngine()?.getDubBus()?.unregisterDeckChannelTap(deckId, ch);
          });
        } catch { /* ok */ }
        try { src.dispose(); } catch { /* ok */ }
      }
      openTaps.clear();
    };
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

      // TD-3 pattern files → route to import dialog (not a DJ-playable format)
      if (/\.(sqs|seq)$/i.test(file.name)) {
        const { useUIStore } = await import('@stores/useUIStore');
        useUIStore.getState().setPendingTD3File(file);
        return;
      }

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
      } else if (isUADEFormat(file.name)) {
        // UADE format — use dedicated pre-render path
        const moduleBuffer = await file.arrayBuffer();
        await loadUADEToDeck(engine, deckId, moduleBuffer, file.name, true);
        useDJStore.getState().setDeckViewMode('visualizer');
      } else {
        // Non-UADE tracker module (XM/IT/S3M/etc.)
        const song = await parseModuleToSong(file);
        cacheSong(file.name, song);
        const bpmResult = detectBPM(song);
        const moduleBuffer = await file.arrayBuffer();

        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: song.name || file.name,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: 'rendering',
          isPlaying: false,
        });

        try {
          const result = await getDJPipeline().loadOrEnqueue(moduleBuffer, file.name, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, file.name, song.name || file.name, result.analysis?.bpm || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode('visualizer');
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

      {/* Deck header + scopes + turntable */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className={`text-xs font-mono font-bold tracking-[0.3em] uppercase ${deckColor} opacity-60 mb-1`}>
            Deck {deckNum}
          </div>
          <DeckScopes deckId={deckId} size={64} />
          <DeckTrackInfo deckId={deckId} />
        </div>
        {deckViewMode === 'visualizer' && <DeckTurntable deckId={deckId} />}
      </div>

      {/* Track overview bar — hidden when combined audio waveform is showing */}
      {!hasAudioWaveform && (
        <div className="relative">
          <DeckTrackOverview deckId={deckId} />
          <DeckBeatGrid deckId={deckId} />
        </div>
      )}

      {/* Waveform moved to full-width strip at top of DJView */}

      {/* Main controls area: pattern display / vinyl + pitch slider */}
      <div className={`flex gap-2 flex-1 min-h-0 ${isB ? 'flex-row-reverse' : ''}`}>
        {/* Pattern display / Visualizer / Vinyl */}
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center relative">
          {deckViewMode === 'vinyl' ? (
            <DeckCssTurntable deckId={deckId} />
          ) : hasFileLoaded && (hasPatternData || hasAudioWaveform) ? (
            <DeckVisualizer deckId={deckId} resetKey={vizResetKey} />
          ) : null}

          {/* Pattern overlay (tracker modules) or oscilloscope (audio-only tracks) */}
          {deckViewMode !== 'visualizer' && hasFileLoaded && (hasPatternData || hasAudioWaveform) && (
            <div className="absolute inset-0 pointer-events-none" style={{ opacity: hasPatternData ? 0.55 : 0.7 }}>
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

      {/* Quick EQ presets */}
      <DeckQuickEQ deckId={deckId} />

      {/* Performance FX Pads */}
      <DeckFXPads deckId={deckId} />

      {/* Scratch presets + Fader LFO */}
      <DeckScratch deckId={deckId} />
    </div>
  );
};
