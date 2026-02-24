/**
 * DJView - Main DJ mixing interface
 *
 * Layout: Deck A (left) | Mixer (center) | Deck B (right)
 * Inspired by Pioneer DJM-900 hardware mixer aesthetic.
 */

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine, disposeDJEngine } from '@/engine/dj/DJEngine';
import { clearSongCache } from '@/engine/dj/DJSongCache';
import type { DJEngine } from '@/engine/dj/DJEngine';
import { useTransportStore, useUIStore } from '@/stores';
import { useAudioStore } from '@/stores/useAudioStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { DJDeck } from './DJDeck';
import { DJMixer } from './DJMixer';
import { DJFileBrowser } from './DJFileBrowser';
import { DJPlaylistPanel } from './DJPlaylistPanel';
import { DJModlandBrowser } from './DJModlandBrowser';
import { DJSeratoBrowser } from './DJSeratoBrowser';
import { DJCachePanel } from './DJCachePanel';
import { MasterEffectsModal } from '@/components/effects';
import { DJFxQuickPresets } from './DJFxQuickPresets';
import { DJControllerSelector } from './DJControllerSelector';
import { DJSamplerPanel } from './DJSamplerPanel';
import { useDJKeyboardHandler } from './DJKeyboardHandler';
import type { SeratoTrack } from '@/lib/serato';
import { getDJPipeline } from '@/engine/dj/DJPipeline';

const MixerVestax3DView = lazy(() => import('./MixerVestax3DView'));

// ============================================================================
// MAIN DJ VIEW
// ============================================================================

interface DJViewProps {
  onShowDrumpads?: () => void;
}

export const DJView: React.FC<DJViewProps> = ({ onShowDrumpads }) => {
  const engineRef = useRef<DJEngine | null>(null);
  const setDJModeActive = useDJStore((s) => s.setDJModeActive);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const cycleDeckViewMode = useDJStore((s) => s.cycleDeckViewMode);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);
  const setThirdDeckActive = useDJStore((s) => s.setThirdDeckActive);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showModland, setShowModland] = useState(false);
  const [showSerato, setShowSerato] = useState(false);
  const [showMasterFX, setShowMasterFX] = useState(false);
  const [showSampler, setShowSampler] = useState(false);

  // Initialize DJEngine on mount, silence tracker + dispose on unmount
  useEffect(() => {
    // Stop tracker playback and release all notes before DJ mode starts
    const { isPlaying, stop } = useTransportStore.getState();
    if (isPlaying) stop();
    getToneEngine().releaseAll();

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
    () => masterEffects.map(e => `${e.id}:${e.enabled}:${e.type}`).join('|'),
    [masterEffects]
  );
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.mixer.rebuildMasterEffects(masterEffects);
  }, [masterEffectsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
        const { detectBPM } = await import('@/engine/dj/DJBeatDetector');
        const { cacheSong } = await import('@/engine/dj/DJSongCache');

        const blob = new File([buffer], filename, { type: 'application/octet-stream' });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);

        cacheSong(cacheKey, song);
        await engine.loadToDeck(deckId, song, filename, bpmResult.bpm);

        // Fire background pipeline for render + analysis
        void getDJPipeline().loadOrEnqueue(buffer.slice(0), filename, deckId, 'high').catch((err) => {
          console.warn(`[DJView] Pipeline for Serato tracker ${filename}:`, err);
        });

        // Compute note density peaks for overview waveform
        const { computeTrackerPeaks } = await import('@/engine/dj/computeTrackerPeaks');
        const trackerPeaks = computeTrackerPeaks(song, 800);

        useDJStore.getState().setDeckState(deckId, {
          fileName: cacheKey,
          trackName: song.name || track.title || filename,
          detectedBPM: track.bpm > 0 ? track.bpm : bpmResult.bpm,
          effectiveBPM: track.bpm > 0 ? track.bpm : bpmResult.bpm,
          totalPositions: song.songLength,
          songPos: 0,
          pattPos: 0,
          elapsedMs: 0,
          isPlaying: false,
          playbackMode: 'tracker',
          durationMs: 0,
          audioPosition: 0,
          waveformPeaks: trackerPeaks,
          seratoCuePoints: [],
          seratoLoops: [],
          seratoBeatGrid: [],
          seratoKey: null,
        });
      }
    } catch (err) {
      console.error(`[DJView] Failed to load Serato track ${track.title}:`, err);
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono">
      {/* ================================================================== */}
      {/* TOP BAR                                                            */}
      {/* ================================================================== */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-3">
          {/* View switcher dropdown */}
          <select
            value="dj"
            onChange={(e) => {
              const val = e.target.value;
              if (val !== 'dj') {
                // VJ is safe — DJ engine stays alive in background
                if (val !== 'vj') {
                  const { decks } = useDJStore.getState();
                  const anyPlaying = decks.A.isPlaying || decks.B.isPlaying || decks.C.isPlaying;
                  if (anyPlaying && !window.confirm('Audio is playing. Switch view? This will stop DJ playback.')) {
                    e.target.value = 'dj';
                    return;
                  }
                }
                useUIStore.getState().setActiveView(val as any);
              }
            }}
            className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-dark-bgTertiary text-text-muted border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
            title="Switch view"
          >
            <option value="tracker">Tracker</option>
            <option value="grid">Grid</option>
            <option value="pianoroll">Piano Roll</option>
            <option value="tb303">TB-303</option>
            <option value="arrangement">Arrangement</option>
            <option value="dj">DJ Mixer</option>
            <option value="drumpad">Drum Pads</option>
            <option value="vj">VJ View</option>
          </select>
          <div className="h-4 w-px bg-dark-border" />
          <span className="font-mono text-sm font-bold tracking-widest uppercase text-accent-primary">
            DEViLBOX DJ
          </span>
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
            Dual Deck Mixer
          </span>
        </div>

        <div className="flex items-center gap-2">
          <DJControllerSelector />
          <DJFxQuickPresets />
          <button
            onClick={cycleDeckViewMode}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${deckViewMode === 'vinyl'
                ? 'border-amber-500 bg-amber-900/20 text-amber-400'
                : deckViewMode === '3d'
                  ? 'border-purple-500 bg-purple-900/20 text-purple-400'
                  : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
            title="Cycle deck view: Visualizer → Vinyl → 3D"
          >
            {deckViewMode === '3d' ? '3D' : deckViewMode === 'vinyl' ? 'Vinyl' : 'Deck'}
          </button>
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
          <button
            onClick={() => setShowMasterFX(!showMasterFX)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showMasterFX
                ? 'border-accent-primary bg-dark-bgActive text-text-primary'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
            title="Open Master FX editor"
          >
            FX Editor
          </button>
          {onShowDrumpads && (
            <button
              onClick={onShowDrumpads}
              className="px-3 py-1.5 rounded-md text-xs font-mono border transition-all border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"
            >
              Drumpads
            </button>
          )}
          <button
            onClick={() => setShowSampler(!showSampler)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showSampler
                ? 'border-amber-500 bg-amber-900/20 text-amber-400'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
            title="Toggle inline sampler pads (routes through DJ mixer)"
          >
            Sampler
          </button>
          <button
            onClick={() => setShowFileBrowser(!showFileBrowser)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showFileBrowser
                ? 'border-accent-primary bg-dark-bgActive text-text-primary'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
          >
            Browser
          </button>
          <button
            onClick={() => setShowPlaylists(!showPlaylists)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showPlaylists
                ? 'border-accent-primary bg-dark-bgActive text-text-primary'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
          >
            Playlists
          </button>
          <button
            onClick={() => setShowModland(!showModland)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showModland
                ? 'border-green-500 bg-green-900/20 text-green-400'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
          >
            Modland
          </button>
          <button
            onClick={() => setShowSerato(!showSerato)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showSerato
                ? 'border-purple-500 bg-purple-900/20 text-purple-400'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
          >
            Serato
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* FILE BROWSER / PLAYLISTS / MODLAND (collapsible)                  */}
      {/* ================================================================== */}
      {(showFileBrowser || showPlaylists || showModland || showSerato) && (() => {
        const panelCount = [showFileBrowser, showPlaylists, showModland, showSerato].filter(Boolean).length;
        const gridClass = panelCount >= 4
          ? 'grid grid-cols-4 gap-2'
          : panelCount === 3
            ? 'grid grid-cols-3 gap-2'
            : panelCount === 2
              ? 'grid grid-cols-2 gap-2'
              : '';
        return (
          <div className="flex flex-col gap-2 shrink-0 px-2 pt-2">
            {/* Cache status panel */}
            <DJCachePanel />
            
            {/* Browser panels */}
            <div className={gridClass}>
              {showFileBrowser && (
                <DJFileBrowser onClose={() => setShowFileBrowser(false)} />
              )}
              {showPlaylists && (
                <DJPlaylistPanel onClose={() => setShowPlaylists(false)} />
              )}
              {showModland && (
                <DJModlandBrowser onClose={() => setShowModland(false)} />
              )}
              {showSerato && (
                <DJSeratoBrowser
                  onClose={() => setShowSerato(false)}
                  onLoadTrackToDevice={handleSeratoTrackLoad}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* ================================================================== */}
      {/* INLINE SAMPLER (routes through DJ mixer)                          */}
      {/* ================================================================== */}
      {showSampler && (
        <div className="shrink-0 px-2 pt-2">
          <DJSamplerPanel onClose={() => setShowSampler(false)} />
        </div>
      )}

      {/* ================================================================== */}
      {/* MAIN LAYOUT: Deck A | Mixer | Deck B [| Deck C]                   */}
      {/* ================================================================== */}
      <div className={`flex-1 grid gap-2 p-2 overflow-hidden min-h-0 ${
        thirdDeckActive
          ? deckViewMode === '3d'
            ? 'grid-cols-[1fr_1fr_1fr_1fr]'
            : 'grid-cols-[1fr_280px_1fr_1fr]'
          : deckViewMode === '3d'
            ? 'grid-cols-[1fr_1fr_1fr]'
            : 'grid-cols-[1fr_280px_1fr]'
      }`}>
        {/* ---- Deck A (left) ---- */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          <DJDeck deckId="A" />
        </div>

        {/* ---- Center Mixer ---- */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          {deckViewMode === '3d' ? (
            <Suspense fallback={<div className="w-full h-full bg-black flex items-center justify-center text-text-muted text-xs">Loading 3D mixer...</div>}>
              <MixerVestax3DView />
            </Suspense>
          ) : (
            <DJMixer />
          )}
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
      </div>

      {/* Master Effects Modal */}
      <MasterEffectsModal isOpen={showMasterFX} onClose={() => setShowMasterFX(false)} />
    </div>
  );
};
