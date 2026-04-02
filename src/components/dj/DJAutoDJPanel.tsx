/**
 * DJAutoDJPanel — Controls for automatic beatmixed playlist playback.
 *
 * Toggle Auto DJ, configure transition bars, shuffle, filter, and skip tracks.
 * Reads state from useDJStore, dispatches actions via DJActions.
 */

import React, { useCallback, useRef, useState } from 'react';
import { SkipForward, Shuffle, SlidersHorizontal, Zap } from 'lucide-react';
import { useDJStore, type AutoDJStatus } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { enableAutoDJ, disableAutoDJ, skipAutoDJ } from '@/engine/dj/DJActions';
import { analyzePlaylist, playlistNeedsAnalysis, type AnalysisProgress } from '@/engine/dj/DJPlaylistAnalyzer';

const STATUS_LABELS: Record<AutoDJStatus, string> = {
  idle: 'OFF',
  playing: 'Playing',
  preloading: 'Loading next...',
  'preload-failed': 'Load failed',
  'transition-pending': 'Ready to mix',
  transitioning: 'Mixing...',
};

const STATUS_COLORS: Record<AutoDJStatus, string> = {
  idle: 'bg-gray-600',
  playing: 'bg-green-500',
  preloading: 'bg-yellow-500',
  'preload-failed': 'bg-red-500',
  'transition-pending': 'bg-blue-500',
  transitioning: 'bg-cyan-500 animate-pulse',
};

const TRANSITION_BAR_OPTIONS = [4, 8, 16, 32] as const;

interface DJAutoDJPanelProps {
  onClose?: () => void;
}

export const DJAutoDJPanel: React.FC<DJAutoDJPanelProps> = ({ onClose }) => {
  const enabled = useDJStore((s) => s.autoDJEnabled);
  const status = useDJStore((s) => s.autoDJStatus);
  const currentIdx = useDJStore((s) => s.autoDJCurrentTrackIndex);
  const nextIdx = useDJStore((s) => s.autoDJNextTrackIndex);
  const transitionBars = useDJStore((s) => s.autoDJTransitionBars);
  const shuffle = useDJStore((s) => s.autoDJShuffle);
  const withFilter = useDJStore((s) => s.autoDJWithFilter);
  const setConfig = useDJStore((s) => s.setAutoDJConfig);

  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const trackCount = activePlaylist?.tracks.length ?? 0;

  const currentTrack = activePlaylist?.tracks[currentIdx];
  const nextTrack = activePlaylist?.tracks[nextIdx];

  const handleToggle = useCallback(async () => {
    if (enabled) {
      disableAutoDJ();
    } else {
      if (!activePlaylist || trackCount < 2) return;
      await enableAutoDJ(0);
    }
  }, [enabled, activePlaylist, trackCount]);

  const handleSkip = useCallback(async () => {
    await skipAutoDJ();
  }, []);

  // Analysis
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const analyzingRef = useRef(false);
  const needsAnalysis = activePlaylist ? playlistNeedsAnalysis(activePlaylist) : false;
  const analyzedCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.bpm > 0 && t.musicalKey).length
    : 0;

  const handleAnalyze = useCallback(async () => {
    if (!activePlaylistId || analyzingRef.current) return;
    analyzingRef.current = true;
    setAnalysisProgress({ current: 0, total: 1, trackName: 'Starting...', status: 'analyzing' });
    try {
      await analyzePlaylist(activePlaylistId, (p) => setAnalysisProgress({ ...p }));
    } finally {
      analyzingRef.current = false;
      setAnalysisProgress(null);
    }
  }, [activePlaylistId]);

  return (
    <div className="bg-dark-bgSecondary border border-dark-borderLight rounded-lg p-3 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="text-text-primary font-bold uppercase tracking-wider">Auto DJ</span>
          <span className="text-text-tertiary">{STATUS_LABELS[status]}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            X
          </button>
        )}
      </div>

      {/* Main toggle + skip */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={handleToggle}
          disabled={!activePlaylist || trackCount < 2}
          className={`flex-1 px-3 py-2 rounded-md font-bold uppercase tracking-wider transition-all border ${
            enabled
              ? 'bg-green-600 border-green-500 text-white hover:bg-green-700'
              : activePlaylist && trackCount >= 2
                ? 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                : 'bg-dark-bgTertiary border-dark-borderLight text-text-tertiary cursor-not-allowed opacity-50'
          }`}
        >
          {enabled ? 'Stop Auto DJ' : 'Start Auto DJ'}
        </button>
        {enabled && (
          <button
            onClick={handleSkip}
            className="px-3 py-2 rounded-md border border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-all"
            title="Skip to next track"
          >
            <SkipForward size={14} />
          </button>
        )}
      </div>

      {/* No playlist warning */}
      {(!activePlaylist || trackCount < 2) && !enabled && (
        <div className="text-yellow-500/80 text-center py-1 mb-2">
          Select a playlist with 2+ tracks
        </div>
      )}

      {/* Analysis */}
      {activePlaylist && trackCount >= 2 && !enabled && (
        <div className="mb-3">
          {analysisProgress ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-cyan-400">Analyzing {analysisProgress.current}/{analysisProgress.total}</span>
                <span className="text-text-tertiary truncate ml-2">{analysisProgress.trackName}</span>
              </div>
              <div className="h-1 bg-dark-bgTertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : needsAnalysis ? (
            <button
              onClick={handleAnalyze}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-700 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 transition-all text-[10px]"
            >
              <Zap size={10} />
              Analyze Playlist ({trackCount - analyzedCount} tracks need BPM/key)
            </button>
          ) : (
            <div className="text-green-500/60 text-center text-[10px] py-0.5">
              All {trackCount} tracks analyzed
            </div>
          )}
        </div>
      )}

      {/* Track info */}
      {enabled && (
        <div className="space-y-1 mb-3 text-[10px]">
          <div className="flex items-center gap-2">
            <span className="text-green-400 w-12">NOW</span>
            <span className="text-text-primary truncate flex-1">
              {currentTrack?.trackName ?? '—'} <span className="text-text-tertiary">({currentIdx + 1}/{trackCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400 w-12">NEXT</span>
            <span className="text-text-secondary truncate flex-1">
              {nextTrack?.trackName ?? '—'}
            </span>
          </div>
        </div>
      )}

      {/* Config row */}
      <div className="flex items-center gap-2">
        {/* Transition bars */}
        <div className="flex items-center gap-1">
          <span className="text-text-tertiary mr-1">Bars:</span>
          {TRANSITION_BAR_OPTIONS.map((bars) => (
            <button
              key={bars}
              onClick={() => setConfig({ transitionBars: bars })}
              className={`px-2 py-1 rounded text-[10px] border transition-all ${
                transitionBars === bars
                  ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
                  : 'border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {bars}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Shuffle */}
        <button
          onClick={() => setConfig({ shuffle: !shuffle })}
          className={`p-1.5 rounded border transition-all ${
            shuffle
              ? 'border-amber-500 bg-amber-900/20 text-amber-400'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary'
          }`}
          title="Shuffle"
        >
          <Shuffle size={12} />
        </button>

        {/* Filter toggle */}
        <button
          onClick={() => setConfig({ withFilter: !withFilter })}
          className={`p-1.5 rounded border transition-all ${
            withFilter
              ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary'
          }`}
          title="HPF sweep on outgoing track"
        >
          <SlidersHorizontal size={12} />
        </button>
      </div>
    </div>
  );
};
