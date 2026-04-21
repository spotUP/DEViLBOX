/**
 * DJAutoDJPanel — Controls for automatic beatmixed playlist playback.
 *
 * Toggle Auto DJ, configure transition bars, shuffle, filter, and skip tracks.
 * Reads state from useDJStore, dispatches actions via DJActions.
 */

import React, { useCallback, useRef, useState } from 'react';
import { SkipForward, Shuffle, SlidersHorizontal, Scissors, Zap, Pause, Play } from 'lucide-react';
import { useDJStore, type AutoDJStatus } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { useUIStore } from '@/stores/useUIStore';
import { enableAutoDJ, disableAutoDJ, skipAutoDJ, pauseAutoDJ, resumeAutoDJ, playAutoDJFromIndex } from '@/engine/dj/DJActions';
import { analyzePlaylist, playlistNeedsAnalysis, trackHasRemoteSource, type AnalysisProgress, type ModlandFixCandidate } from '@/engine/dj/DJPlaylistAnalyzer';
import { Modal } from '@/components/ui/Modal';
import { ModalHeader } from '@/components/ui/ModalHeader';
import { Button } from '@/components/ui/Button';

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

const TRANSITION_BAR_OPTIONS = [2, 4, 8, 16, 32] as const;

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
  const smartCuts = useDJStore((s) => s.autoDJSmartCuts);
  const setConfig = useDJStore((s) => s.setAutoDJConfig);

  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const trackCount = activePlaylist?.tracks.length ?? 0;

  const currentTrack = activePlaylist?.tracks[currentIdx];

  const [paused, setPaused] = useState(false);
  const [showAnalyzeWarning, setShowAnalyzeWarning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalysisProgress | null>(null);

  const actuallyEnable = useCallback(async () => {
    const error = await enableAutoDJ(0);
    if (error) {
      useUIStore.getState().setStatusMessage(`Auto DJ: ${error}`, false, 4000);
    } else {
      setPaused(false);
      onClose?.();
    }
  }, [onClose]);

  // Split the "needs analysis" count into two categories so the warning can
  // explain exactly what's missing and why:
  //   - missingBpm: never analyzed (no bpm/key either). Fallback +9 dB trim.
  //   - missingLoudness: analyzed by the old server path (bpm present) but
  //     has no rmsDb — this happens to any track scanned before the
  //     local-pipeline switch. Still plays at the fallback trim.
  const missingBpmCount = activePlaylist
    ? activePlaylist.tracks.filter((t) => trackHasRemoteSource(t) && t.bpm === 0).length
    : 0;
  const missingLoudnessCount = activePlaylist
    ? activePlaylist.tracks.filter((t) => trackHasRemoteSource(t) && t.bpm > 0 && (t.rmsDb === undefined || t.rmsDb === null)).length
    : 0;
  const unanalyzedCount = missingBpmCount + missingLoudnessCount;

  const handleToggle = useCallback(async () => {
    if (enabled) {
      disableAutoDJ();
      setPaused(false);
      return;
    }
    if (activePlaylist && (playlistNeedsAnalysis(activePlaylist) || unanalyzedCount > 0)) {
      setShowAnalyzeWarning(true);
      return;
    }
    await actuallyEnable();
  }, [enabled, activePlaylist, unanalyzedCount, actuallyEnable]);

  const handleAnalyzeAndPlay = useCallback(async () => {
    if (!activePlaylistId) return;
    setAnalyzing(true);
    try {
      // Targeted re-analyze: the set of tracks missing bpm OR missing loudness.
      // Using trackIds (instead of force=true) scopes the run to only the rows
      // that actually need work, so already-complete tracks aren't re-scanned.
      const pl = useDJPlaylistStore.getState().playlists.find(p => p.id === activePlaylistId);
      const targetIds = pl
        ? pl.tracks
            .filter((t) => trackHasRemoteSource(t) && (t.bpm === 0 || t.rmsDb === undefined || t.rmsDb === null))
            .map((t) => t.id)
        : [];
      await analyzePlaylist(
        activePlaylistId,
        (p) => setAnalyzeProgress(p),
        undefined,
        targetIds.length > 0 ? { trackIds: targetIds, force: true } : undefined,
      );
    } catch (err) {
      useUIStore.getState().setStatusMessage(`Analyze failed: ${err}`, false, 4000);
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
      setShowAnalyzeWarning(false);
    }
    await actuallyEnable();
  }, [activePlaylistId, actuallyEnable]);

  const handlePlayAnyway = useCallback(async () => {
    setShowAnalyzeWarning(false);
    await actuallyEnable();
  }, [actuallyEnable]);

  const handlePauseResume = useCallback(() => {
    if (paused) {
      resumeAutoDJ();
      setPaused(false);
    } else {
      pauseAutoDJ();
      setPaused(true);
    }
  }, [paused]);

  const handleSkip = useCallback(async () => {
    setPaused(false);
    await skipAutoDJ();
  }, []);

  const handlePlayFromHere = useCallback(async (index: number) => {
    setPaused(false);
    await playAutoDJFromIndex(index);
  }, []);

  // Analysis
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const analyzingRef = useRef(false);
  const needsAnalysis = activePlaylist ? playlistNeedsAnalysis(activePlaylist) : false;
  const analyzedCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.bpm > 0 && t.musicalKey).length
    : 0;
  const skippedCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.analysisSkipped).length
    : 0;
  const localCount = activePlaylist
    ? activePlaylist.tracks.filter(t => !t.analysisSkipped && !trackHasRemoteSource(t) && (t.bpm === 0 || !t.musicalKey || t.energy == null)).length
    : 0;
  const pendingCount = trackCount - analyzedCount - skippedCount - localCount;

  // 404 fix dialog state
  const [fixDialog, setFixDialog] = useState<{
    trackName: string;
    originalPath: string;
    candidates: ModlandFixCandidate[];
    resolve: (path: string | null) => void;
  } | null>(null);

  const handleFixNeeded = useCallback(
    (trackName: string, originalPath: string, candidates: ModlandFixCandidate[]): Promise<string | null> => {
      return new Promise((resolve) => {
        setFixDialog({ trackName, originalPath, candidates, resolve });
      });
    },
    [],
  );

  const handleAnalyze = useCallback(async () => {
    if (analyzingRef.current || !activePlaylistId) return;
    // Reset stuck state from previous run (e.g. unresolved fix dialog)
    setFixDialog(null);

    analyzingRef.current = true;
    setAnalysisProgress({ current: 0, total: 1, analyzed: 0, failed: 0, trackName: 'Starting...', status: 'analyzing' });
    try {
      await analyzePlaylist(
        activePlaylistId,
        (p) => setAnalysisProgress({ ...p }),
        handleFixNeeded,
      );
    } finally {
      analyzingRef.current = false;
      setAnalysisProgress(null);
    }
  }, [activePlaylistId, handleFixNeeded]);

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

      {/* Main toggle + pause + skip */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={handleToggle}
          disabled={!activePlaylist || trackCount < 2}
          className={`px-3 py-2 rounded-md font-bold uppercase tracking-wider transition-all border ${
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
          <>
            <button
              onClick={handlePauseResume}
              className={`px-3 py-2 rounded-md border transition-all ${
                paused
                  ? 'border-amber-500 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40'
                  : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
              title={paused ? 'Resume auto transitions' : 'Pause auto transitions'}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              onClick={handleSkip}
              className="px-3 py-2 rounded-md border border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-all"
              title="Skip to next track"
            >
              <SkipForward size={14} />
            </button>
          </>
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
                <span className="text-cyan-400">{analysisProgress.current}/{analysisProgress.total}</span>
                <span className="text-green-400 ml-1">{analysisProgress.analyzed} ok</span>
                {analysisProgress.failed > 0 && <span className="text-red-400 ml-1">{analysisProgress.failed} fail</span>}
                <span className="text-text-tertiary truncate ml-2 flex-1 text-right">{analysisProgress.trackName}</span>
              </div>
              <div className="h-1 bg-dark-bgTertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Status bar */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-green-400">{analyzedCount} analyzed</span>
                {skippedCount > 0 && <span className="text-red-400/60">{skippedCount} skipped</span>}
                {pendingCount > 0 && <span className="text-yellow-400">{pendingCount} pending</span>}
                {!needsAnalysis && pendingCount === 0 && (
                  <span className="text-green-500/80 ml-auto">Ready</span>
                )}
              </div>
              {/* Progress bar showing ratio */}
              <div className="h-1 bg-dark-bgTertiary rounded-full overflow-hidden flex">
                {analyzedCount > 0 && (
                  <div className="h-full bg-green-500" style={{ width: `${(analyzedCount / trackCount) * 100}%` }} />
                )}
                {skippedCount > 0 && (
                  <div className="h-full bg-red-500/40" style={{ width: `${(skippedCount / trackCount) * 100}%` }} />
                )}
              </div>
              {/* Analyze button if needed */}
              {needsAnalysis && (
                <button
                  onClick={handleAnalyze}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-700 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 transition-all text-[10px]"
                >
                  <Zap size={10} />
                  Analyze ({pendingCount} tracks)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Track info + upcoming queue */}
      {enabled && activePlaylist && (
        <div className="space-y-1 mb-3 text-[10px]">
          {/* Current track */}
          <div className="flex items-center gap-2">
            <span className="text-green-400 w-8 flex-shrink-0">NOW</span>
            <span className="text-text-primary truncate flex-1">
              {currentTrack?.trackName ?? '—'}
            </span>
            <span className="text-text-tertiary flex-shrink-0">{currentIdx + 1}/{trackCount}</span>
          </div>
          {/* Upcoming tracks (next 4) */}
          {Array.from({ length: Math.min(4, trackCount - currentIdx - 1) }, (_, i) => {
            const idx = (currentIdx + 1 + i) % trackCount;
            const track = activePlaylist.tracks[idx];
            const isNext = idx === nextIdx;
            return (
              <div key={idx} className="flex items-center gap-2 group">
                <span className={`w-8 flex-shrink-0 ${isNext ? 'text-blue-400' : 'text-text-tertiary'}`}>
                  {isNext ? 'NEXT' : `${idx + 1}`}
                </span>
                <span className={`truncate flex-1 ${isNext ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                  {track?.trackName ?? '—'}
                </span>
                <button
                  onClick={() => handlePlayFromHere(idx)}
                  className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded border border-dark-borderLight
                             text-accent-primary hover:bg-accent-primary/10 transition-all flex-shrink-0"
                  title={`Play from "${track?.trackName}"`}
                >
                  Play
                </button>
              </div>
            );
          })}
          {paused && (
            <div className="text-amber-400/80 text-center py-0.5 text-[9px] uppercase tracking-wider">
              Paused — transitions stopped
            </div>
          )}
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

        {/* Smart Cuts — pattern-data-aware transitions (opt-in).
            Enables drum-break hard-cut + chord-change-aware crossfade
            fallback + deterministic harmonic bass-swap. Only effective
            when both decks carry tracker-format songs (MOD/XM/IT/etc);
            audio-file decks fall through to the default transition
            picker. Off by default per the 2026-04-18 gig-fix rule. */}
        <button
          onClick={() => setConfig({ smartCuts: !smartCuts })}
          className={`p-1.5 rounded border transition-all ${
            smartCuts
              ? 'border-violet-500 bg-violet-900/20 text-violet-400'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary'
          }`}
          title={
            smartCuts
              ? 'Smart Cuts ON — drum-break cuts + chord-aware fades + harmonic bass-swap'
              : 'Smart Cuts OFF — click to enable pattern-data-driven transitions (tracker songs only)'
          }
        >
          <Scissors size={12} />
        </button>
      </div>

      {/* 404 fix dialog — pick correct Modland match */}
      {fixDialog && (
        <div className="mt-3 border border-amber-700 bg-amber-900/10 rounded-md p-2">
          <div className="text-[10px] text-amber-400 mb-1.5 font-bold">
            404: "{fixDialog.trackName}" not found
          </div>
          <div className="text-[9px] text-text-tertiary mb-2 truncate">
            {fixDialog.originalPath}
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {fixDialog.candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => { fixDialog.resolve(c.full_path); setFixDialog(null); }}
                className="w-full text-left px-2 py-1 rounded text-[10px] border border-dark-borderLight bg-dark-bgTertiary hover:bg-dark-bgHover hover:border-amber-600 transition-all"
              >
                <div className="text-text-primary truncate">{c.filename}</div>
                <div className="text-text-tertiary truncate">{c.author} / {c.format}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => { fixDialog.resolve(null); setFixDialog(null); }}
            className="mt-1.5 w-full px-2 py-1 rounded text-[10px] border border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-red-400 transition-all"
          >
            Skip this track
          </button>
        </div>
      )}

      <Modal isOpen={showAnalyzeWarning} onClose={() => !analyzing && setShowAnalyzeWarning(false)} size="sm">
        <ModalHeader title="Unanalyzed tracks" onClose={() => !analyzing && setShowAnalyzeWarning(false)} />
        <div className="p-4 text-xs font-mono space-y-3">
          <p className="text-text-primary">
            <span className="text-accent-warning font-bold">{unanalyzedCount}</span> of{' '}
            <span className="text-text-primary font-bold">{trackCount}</span> tracks in{' '}
            <span className="text-accent-primary">{activePlaylist?.name ?? 'this playlist'}</span>{' '}
            need (re-)analysis.
          </p>
          {missingBpmCount > 0 && (
            <p className="text-text-muted">
              <span className="text-text-primary font-bold">{missingBpmCount}</span> track{missingBpmCount === 1 ? '' : 's'} never analyzed — missing BPM, key, and loudness data.
            </p>
          )}
          {missingLoudnessCount > 0 && (
            <p className="text-text-muted">
              <span className="text-text-primary font-bold">{missingLoudnessCount}</span> track{missingLoudnessCount === 1 ? ' has' : 's have'} BPM/key but no loudness data
              (scanned before the local-pipeline switch) — will play at a fixed +9 dB fallback trim
              instead of per-track loudness matching.
            </p>
          )}
          <p className="text-text-muted">
            Re-analyzing fills in the missing values so every track hits the same volume target.
          </p>
          {analyzing && analyzeProgress && (
            <div className="pt-2 border-t border-dark-borderLight">
              <div className="flex justify-between text-text-muted mb-1">
                <span>Analyzing track {analyzeProgress.current} of {analyzeProgress.total}</span>
                <span>{Math.round((analyzeProgress.current / analyzeProgress.total) * 100)}%</span>
              </div>
              <div className="h-1 bg-dark-bgTertiary rounded overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all"
                  style={{ width: `${(analyzeProgress.current / analyzeProgress.total) * 100}%` }}
                />
              </div>
              {analyzeProgress.trackName && (
                <div className="text-[10px] text-text-muted mt-1 truncate">{analyzeProgress.trackName}</div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAnalyzeWarning(false)} disabled={analyzing}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handlePlayAnyway} disabled={analyzing}>
              Play anyway
            </Button>
            <Button variant="primary" size="sm" onClick={handleAnalyzeAndPlay} disabled={analyzing}>
              {analyzing ? 'Analyzing…' : 'Analyze & play'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
