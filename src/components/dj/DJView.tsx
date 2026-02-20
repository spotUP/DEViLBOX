/**
 * DJView - Main DJ mixing interface
 *
 * Layout: Deck A (left) | Mixer (center) | Deck B (right)
 * Inspired by Pioneer DJM-900 hardware mixer aesthetic.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine, disposeDJEngine } from '@/engine/dj/DJEngine';
import { clearSongCache } from '@/engine/dj/DJSongCache';
import type { DJEngine } from '@/engine/dj/DJEngine';
import { useTransportStore, useUIStore } from '@/stores';
import { getToneEngine } from '@/engine/ToneEngine';
import { DJDeck } from './DJDeck';
import { DJMixer } from './DJMixer';
import { DJFileBrowser } from './DJFileBrowser';
import { DJPlaylistPanel } from './DJPlaylistPanel';
import { DJModlandBrowser } from './DJModlandBrowser';
import { DJSeratoBrowser } from './DJSeratoBrowser';
import { MasterEffectsModal } from '@/components/effects';
import { DJFxQuickPresets } from './DJFxQuickPresets';
import { DJControllerSelector } from './DJControllerSelector';
import { useDJKeyboardHandler } from './DJKeyboardHandler';
import type { SeratoTrack } from '@/lib/serato';

// ============================================================================
// MAIN DJ VIEW
// ============================================================================

interface DJViewProps {
  onShowDrumpads?: () => void;
}

export const DJView: React.FC<DJViewProps> = ({ onShowDrumpads }) => {
  const engineRef = useRef<DJEngine | null>(null);
  const setDJModeActive = useDJStore((s) => s.setDJModeActive);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showModland, setShowModland] = useState(false);
  const [showSerato, setShowSerato] = useState(false);
  const [showMasterFX, setShowMasterFX] = useState(false);

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
    };
  }, [setDJModeActive]);

  // DJ keyboard shortcuts
  useDJKeyboardHandler(true);

  // Handle loading a Serato track to a deck
  // Detects audio files vs tracker modules, and parses Serato metadata (cue points, beatgrid)
  const handleSeratoTrackLoad = useCallback(async (track: SeratoTrack, deckId: 'A' | 'B') => {
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
        await engine.loadToDeck(deckId, song);

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
          waveformPeaks: null,
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
              if (val === 'arrangement') {
                useUIStore.getState().setActiveView('arrangement');
              } else if (val !== 'dj') {
                useUIStore.getState().setActiveView('tracker');
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
          <div className={`shrink-0 px-2 pt-2 ${gridClass}`}>
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
        );
      })()}

      {/* ================================================================== */}
      {/* MAIN 3-COLUMN LAYOUT: Deck 1 | Mixer | Deck 2                     */}
      {/* ================================================================== */}
      <div className="flex-1 grid grid-cols-[1fr_280px_1fr] gap-2 p-2 overflow-hidden min-h-0">
        {/* ---- Deck 1 (left) ---- */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          <DJDeck deckId="A" />
        </div>

        {/* ---- Center Mixer ---- */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          <DJMixer />
        </div>

        {/* ---- Deck 2 (right) ---- */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          <DJDeck deckId="B" />
        </div>
      </div>

      {/* Master Effects Modal */}
      <MasterEffectsModal isOpen={showMasterFX} onClose={() => setShowMasterFX(false)} />
    </div>
  );
};
