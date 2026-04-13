/**
 * DJView - Main DJ mixing interface
 *
 * Layout: Deck A (left) | Mixer (center) | Deck B (right)
 * Inspired by Pioneer DJM-900 hardware mixer aesthetic.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { getDJEngine, disposeDJEngine } from '@/engine/dj/DJEngine';
import { clearSongCache } from '@/engine/dj/DJSongCache';
import type { DJEngine } from '@/engine/dj/DJEngine';
import { useTransportStore } from '@/stores';
import { useAudioStore } from '@/stores/useAudioStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { DJDeck } from './DJDeck';
import { DJMixer } from './DJMixer';
import { DJCratePanel } from './DJCratePanel';
import { DJFxQuickPresets } from './DJFxQuickPresets';
import { DJControllerSelector } from './DJControllerSelector';
import { DJAutoDJPanel } from './DJAutoDJPanel';
import { DJAutoMixNowButton } from './DJAutoMixNowButton';
import { DJVocoderControl } from './DJVocoderControl';
import { DJRemoteControlButton } from './DJRemoteControlButton';
import { DeckAudioWaveform } from './DeckAudioWaveform';
import { getPhaseInfo } from '@/engine/dj/DJAutoSync';
import { useDJKeyboardHandler } from './DJKeyboardHandler';
import type { SeratoTrack } from '@/lib/serato';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { useDeckStateSync } from '@/hooks/dj/useDeckStateSync';
import { useDJHealth } from '@/hooks/dj/useDJHealth';
import type { DeckId } from '@/engine/dj/DeckEngine';
import { onNextBeat } from '@/engine/dj/DJAutoSync';
import { CustomSelect } from '@components/common/CustomSelect';

/** Headless bridge — polls engine state and updates the store for one deck. */
function DeckStateSyncBridge({ deckId }: { deckId: DeckId }) {
  useDeckStateSync(deckId);
  return null;
}

// Lazy-load heavy 3D components to avoid bloating the main DJ bundle
const DJ3DOverlay = React.lazy(() => import('./DJ3DOverlay').then(m => ({ default: m.DJ3DOverlay })));


// ============================================================================
// MAIN DJ VIEW
// ============================================================================

interface DJViewProps {
  onShowDrumpads?: () => void;
}

export const DJView: React.FC<DJViewProps> = ({ onShowDrumpads: _onShowDrumpads }) => {
  const djViewRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DJEngine | null>(null);
  const setDJModeActive = useDJStore((s) => s.setDJModeActive);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);
  const setThirdDeckActive = useDJStore((s) => s.setThirdDeckActive);
  const [showCrate, setShowCrate] = useState(false);
  const [showAutoDJ, setShowAutoDJ] = useState(false);
  const autoDJEnabled = useDJStore((s) => s.autoDJEnabled);
  const health = useDJHealth();

  // Sync status: poll phase alignment between decks at 10Hz with hysteresis
  // Uses a rolling average to avoid flickering between green/yellow/red
  const [syncDriftMs, setSyncDriftMs] = useState<number | null>(null);
  const driftHistoryRef = useRef<number[]>([]);
  useEffect(() => {
    const timer = setInterval(() => {
      const s = useDJStore.getState();
      if (!s.decks.A.isPlaying || !s.decks.B.isPlaying || !s.decks.A.beatGrid || !s.decks.B.beatGrid) {
        setSyncDriftMs(null);
        driftHistoryRef.current = [];
        return;
      }
      try {
        const phaseA = getPhaseInfo('A');
        const phaseB = getPhaseInfo('B');
        if (!phaseA || !phaseB) { setSyncDriftMs(null); return; }
        let phaseDiff = Math.abs(phaseA.beatPhase - phaseB.beatPhase);
        if (phaseDiff > 0.5) phaseDiff = 1 - phaseDiff;
        const beatPeriodMs = (60 / (s.decks.A.beatGrid?.bpm ?? 120)) * 1000;
        const rawDrift = Math.round(phaseDiff * beatPeriodMs);

        // Rolling average of last 10 samples (1 second) for stable display
        const history = driftHistoryRef.current;
        history.push(rawDrift);
        if (history.length > 10) history.shift();
        const avgDrift = Math.round(history.reduce((a, b) => a + b, 0) / history.length);

        setSyncDriftMs(avgDrift);
      } catch { setSyncDriftMs(null); }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Initialize DJEngine on mount, silence tracker + dispose on unmount
  useEffect(() => {
    // Stop tracker playback and release all notes before DJ mode starts
    const { isPlaying, stop } = useTransportStore.getState();
    if (isPlaying) stop();
    getToneEngine().releaseAll();

    // Ensure AudioContext is running (browser may have suspended it)
    void Tone.start().catch(() => { /* needs user gesture — togglePlay will retry */ });

    engineRef.current = getDJEngine();
    setDJModeActive(true);

    return () => {
      setDJModeActive(false);
      disposeDJEngine();
      clearSongCache();
      engineRef.current = null;

      // Reset global audio state that DJ mode may have left stale.
      // ToneEngine globals affect ALL sample playback rates and synth detune;
      // if not reset here, the tracker view plays at wrong pitch/BPM.
      const engine = getToneEngine();
      engine.setGlobalPlaybackRate(1.0);
      engine.setGlobalDetune(0);
      engine.releaseAll();

      // Reset transport store pitch display
      useTransportStore.getState().setGlobalPitch(0);
    };
  }, [setDJModeActive]);

  // Subscribe to PFL changes and route to engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const unsubscribePFLA = useDJStore.subscribe(
      (s) => s.decks.A.pflEnabled,
      (enabled) => engine.mixer.setPFL('A', enabled)
    );

    const unsubscribePFLB = useDJStore.subscribe(
      (s) => s.decks.B.pflEnabled,
      (enabled) => engine.mixer.setPFL('B', enabled)
    );

    const unsubscribePFLC = useDJStore.subscribe(
      (s) => s.decks.C.pflEnabled,
      (enabled) => engine.mixer.setPFL('C', enabled)
    );

    const unsubscribeCueVolume = useDJStore.subscribe(
      (s) => s.cueVolume,
      (volume) => engine.cueEngine.setCueVolume(volume)
    );

    const unsubscribeCueMix = useDJStore.subscribe(
      (s) => s.cueMix,
      (mix) => engine.cueEngine.setCueMix(mix)
    );

    const unsubscribeCueDevice = useDJStore.subscribe(
      (s) => s.cueDeviceId,
      (deviceId) => {
        if (deviceId) {
          void engine.cueEngine.setCueDevice(deviceId);
        }
      }
    );

    return () => {
      unsubscribePFLA();
      unsubscribePFLB();
      unsubscribePFLC();
      unsubscribeCueVolume();
      unsubscribeCueMix();
      unsubscribeCueDevice();
    };
  }, []);

  // DJ keyboard shortcuts
  useDJKeyboardHandler();

  // ── Sync master FX presets to DJ mixer ──────────────────────────────────
  // When user selects an FX preset via DJFxQuickPresets or MasterEffectsModal,
  // useAudioStore.masterEffects updates. We watch that and rebuild the DJ mixer's
  // FX chain (inserted between masterGain and limiter).
  const masterEffects = useAudioStore((s) => s.masterEffects);
  const masterEffectsKey = useMemo(
    () => masterEffects.map(e => `${e.id}:${e.enabled}:${e.type}:${(e.selectedChannels ?? []).join(',')}`).join('|'),
    [masterEffects]
  );
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // Sync FX changes to the next beat of the active deck for tight timing.
    // If no deck is playing, apply immediately.
    const store = useDJStore.getState();
    const activeDeck: DeckId = store.decks.A.isPlaying ? 'A' : store.decks.B.isPlaying ? 'B' : 'A';
    const isPlaying = store.decks.A.isPlaying || store.decks.B.isPlaying;
    if (isPlaying) {
      const cancel = onNextBeat(activeDeck, () => {
        engine.mixer.rebuildMasterEffects(masterEffects);
      });
      return cancel;
    } else {
      engine.mixer.rebuildMasterEffects(masterEffects);
    }
  }, [masterEffectsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save master FX to the active playlist whenever they change in DJ view
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  useEffect(() => {
    if (!activePlaylistId) return;
    useDJPlaylistStore.getState().setPlaylistMasterEffects(activePlaylistId, masterEffects);
  }, [masterEffectsKey, activePlaylistId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle loading a Serato track to a deck
  // Detects audio files vs tracker modules, and parses Serato metadata (cue points, beatgrid)
  const handleSeratoTrackLoad = useCallback(async (track: SeratoTrack, deckId: 'A' | 'B' | 'C') => {
    const fs = window.electron?.fs;
    if (!fs) {
      console.warn('[DJView] Electron fs not available for Serato track loading');
      return;
    }

    try {
      const buffer = await fs.readFile(track.filePath);
      const filename = track.filePath.split(/[/\\]/).pop() || track.title;
      const engine = getDJEngine();
      const cacheKey = `serato:${track.filePath}`;

      const { isAudioFile } = await import('@/lib/audioFileUtils');

      if (isAudioFile(filename)) {
        // Audio file mode (MP3, WAV, FLAC, etc.)
        const info = await engine.loadAudioToDeck(deckId, buffer.slice(0), filename);

        // Parse Serato metadata from the file (cue points, beatgrid, BPM)
        const { readSeratoMetadata } = await import('@/lib/serato/seratoMetadata');
        const metadata = readSeratoMetadata(buffer);

        const bpm = metadata.bpm ?? (track.bpm > 0 ? track.bpm : 0);

        useDJStore.getState().setDeckState(deckId, {
          fileName: cacheKey,
          trackName: track.title || filename.replace(/\.[^.]+$/, ''),
          detectedBPM: bpm,
          effectiveBPM: bpm,
          totalPositions: 0,
          songPos: 0,
          pattPos: 0,
          elapsedMs: 0,
          isPlaying: false,
          playbackMode: 'audio',
          durationMs: info.duration * 1000,
          audioPosition: 0,
          waveformPeaks: info.waveformPeaks,
          seratoCuePoints: metadata.cuePoints,
          seratoLoops: metadata.loops,
          seratoBeatGrid: metadata.beatGrid,
          seratoKey: track.key || metadata.key,
        });
      } else {
        // Tracker module mode (MOD, XM, IT, S3M, etc.)
        const { isUADEFormat: checkUADE } = await import('@/lib/import/formats/UADEParser');
        
        if (checkUADE(filename)) {
          // UADE format — use dedicated pre-render path
          const { loadUADEToDeck: loadUADE } = await import('@/engine/dj/DJUADEPrerender');
          await loadUADE(engine, deckId, buffer.slice(0), filename, true, track.bpm > 0 ? track.bpm : undefined, track.title);
          useDJStore.getState().setDeckViewMode('visualizer');
        } else {
          const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
          const { detectBPM } = await import('@/engine/dj/DJBeatDetector');
          const { cacheSong } = await import('@/engine/dj/DJSongCache');

          const blob = new File([buffer], filename, { type: 'application/octet-stream' });
          const song = await parseModuleToSong(blob);
          const bpmResult = detectBPM(song);

          cacheSong(cacheKey, song);

          useDJStore.getState().setDeckState(deckId, {
            fileName: cacheKey,
            trackName: song.name || track.title || filename,
            detectedBPM: track.bpm > 0 ? track.bpm : bpmResult.bpm,
            effectiveBPM: track.bpm > 0 ? track.bpm : bpmResult.bpm,
            analysisState: 'rendering',
            isPlaying: false,
          });

          const result = await getDJPipeline().loadOrEnqueue(buffer.slice(0), filename, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, cacheKey, song.name || filename, result.analysis?.bpm || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode('visualizer');
        }
      }
    } catch (err) {
      console.error(`[DJView] Failed to load Serato track ${track.title}:`, err);
    }
  }, []);

  return (
    <div ref={djViewRef} className="relative flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono">
      {/* Audio health indicator — only visible when AudioContext is not running */}
      {health && health.audioContext !== 'running' && (
        <div style={{
          position: 'absolute', top: 4, right: 4, zIndex: 9999,
          padding: '4px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace',
          background: health.audioContext === 'suspended' ? '#a80' : '#a00',
          color: '#fff', pointerEvents: 'none',
        }}>
          Audio: {health.audioContext}
        </div>
      )}
      {/* Headless state sync — runs in ALL view modes (DOM, Vinyl, 3D) */}
      <DeckStateSyncBridge deckId="A" />
      <DeckStateSyncBridge deckId="B" />
      {thirdDeckActive && <DeckStateSyncBridge deckId="C" />}

      {/* ================================================================== */}
      {/* TOP BAR                                                            */}
      {/* ================================================================== */}
      <div className="flex items-center px-2 py-1.5 shrink-0 bg-dark-bgSecondary border-b border-dark-border overflow-x-auto overflow-y-hidden scrollbar-hidden">
        <div className="flex items-center gap-1.5 flex-nowrap [&>*]:shrink-0">
          <DJControllerSelector />
          <DJFxQuickPresets />
          <CustomSelect
            value={deckViewMode}
            onChange={(v) => useDJStore.getState().setDeckViewMode(v as 'visualizer' | 'vinyl' | '3d')}
            options={[
              { value: 'visualizer', label: 'Deck: Visualizer' },
              { value: 'vinyl', label: 'Deck: Vinyl' },
              { value: '3d', label: 'Deck: 3D' },
            ]}
            className="px-3 py-1.5 rounded-md text-xs font-mono border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"
            title="Select deck view mode"
          />
          <button
            onClick={() => setThirdDeckActive(!thirdDeckActive)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${thirdDeckActive
                ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
            title="Toggle 3rd deck (Deck C)"
          >
            Deck C
          </button>
          <div className="relative">
            <button
              onClick={() => setShowAutoDJ(!showAutoDJ)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
                ${showAutoDJ || autoDJEnabled
                  ? 'border-green-500 bg-green-900/20 text-green-400'
                  : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                }`}
              title="Auto DJ — automatic beatmixed playlist playback"
            >
              Auto DJ{autoDJEnabled ? ' ON' : ''}
            </button>
            {showAutoDJ && (
              <div className="absolute top-full right-0 mt-1 z-[99989] w-80">
                <DJAutoDJPanel onClose={() => setShowAutoDJ(false)} />
              </div>
            )}
          </div>
          {autoDJEnabled && <DJAutoMixNowButton />}
          <DJVocoderControl />
          <DJRemoteControlButton />
          <button
            onClick={() => setShowCrate(!showCrate)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all
              ${showCrate
                ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
                : 'border-accent-primary bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
              }`}
          >
            Crate
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* CRATE PANEL (tabbed: Browser / Playlists / Online / Serato)      */}
      {/* ================================================================== */}
      {showCrate && (
        <div
          className="absolute inset-x-0 top-12 bottom-0 z-[99990] px-2 pt-2"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCrate(false); }}
        >
          <div className="max-h-[50vh]">
            <DJCratePanel
              onClose={() => setShowCrate(false)}
              onLoadSeratoTrack={handleSeratoTrackLoad}
            />
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* AUTO DJ PANEL                                                     */}
      {/* ================================================================== */}
      {/* Auto DJ panel is now a dropdown under the button */}

      {/* ================================================================== */}
      {/* FULL-WIDTH WAVEFORMS — Serato-style stacked at top               */}
      {/* ================================================================== */}
      <div className={`flex flex-col w-full shrink-0 border-b relative transition-shadow duration-300 ${
        syncDriftMs !== null && syncDriftMs < 30
          ? 'border-green-500/50 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
          : syncDriftMs !== null && syncDriftMs > 80
            ? 'border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
            : 'border-dark-border'
      }`}>
        <DeckAudioWaveform deckId="A" />
        <DeckAudioWaveform deckId="B" />
        {/* Sync status badge between the two waveforms */}
        {syncDriftMs !== null && (
          <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-mono font-bold pointer-events-none z-10 ${
            syncDriftMs < 30
              ? 'bg-green-500/80 text-white'
              : syncDriftMs < 80
                ? 'bg-yellow-500/80 text-black'
                : 'bg-red-500/80 text-white'
          }`}>
            {syncDriftMs < 30 ? 'SYNCED' : `${syncDriftMs}ms`}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* MAIN LAYOUT: Deck A | Mixer | Deck B [| Deck C]                   */}
      {/* ================================================================== */}
      <div className={`relative flex-1 grid gap-2 p-2 overflow-hidden min-h-0 ${
        thirdDeckActive
          ? 'grid-cols-[1fr_400px_1fr_1fr]'
          : 'grid-cols-[1fr_400px_1fr]'
      }`}>
        {deckViewMode === '3d' ? (
          /* ── 3D mode: Unified scene with decks + mixer side by side ──── */
          <div className="col-span-full min-h-0 min-w-0 overflow-hidden">
            <Suspense fallback={
              <div className="flex items-center justify-center w-full h-full text-text-muted text-sm">
                Loading 3D scene...
              </div>
            }>
              <DJ3DOverlay />
            </Suspense>
          </div>
        ) : (
          /* ── Standard 2D modes (Visualizer / Vinyl) ──────────────────── */
          <>
            {/* ---- Deck A (left) ---- */}
            <div className="min-h-0 min-w-0 overflow-hidden">
              <DJDeck deckId="A" />
            </div>

            {/* ---- Center Mixer ---- */}
            <div className="min-h-0 min-w-0 overflow-hidden">
              <DJMixer />
            </div>

            {/* ---- Deck B (right) ---- */}
            <div className="min-h-0 min-w-0 overflow-hidden">
              <DJDeck deckId="B" />
            </div>

            {/* ---- Deck C (far right, conditional) ---- */}
            {thirdDeckActive && (
              <div className="min-h-0 min-w-0 overflow-hidden">
                <DJDeck deckId="C" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
