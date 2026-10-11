/**
 * DJAutoDJPanel — Controls for automatic beatmixed playlist playback.
 *
 * Toggle Auto DJ, configure transition bars, shuffle, filter, and skip tracks.
 * Reads state from useDJStore, dispatches actions via DJActions.
 */

import React, { useCallback, useRef, useState } from 'react';
import { SkipForward, Shuffle, SlidersHorizontal, Scissors, Zap, Pause, Play, Layers, Wand2 } from 'lucide-react';
import { useDJStore, type AutoDJStatus } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { useUIStore } from '@/stores/useUIStore';
import { enableAutoDJ, disableAutoDJ, skipAutoDJ, pauseAutoDJ, resumeAutoDJ, playAutoDJFromIndex } from '@/engine/dj/DJActions';
import { analyzePlaylist, playlistNeedsAnalysis, trackHasRemoteSource, type AnalysisProgress, type ModlandFixCandidate } from '@/engine/dj/DJPlaylistAnalyzer';
import { Modal } from '@/components/ui/Modal';
import { ModalHeader } from '@/components/ui/ModalHeader';
import { Button } from '@/components/ui/Button';
import { CustomSelect } from '@components/common/CustomSelect';
import { DJ_STYLE_NAMES } from '@/engine/dj/autodj/types';
import { DJAutoDJDebugPanel } from './DJAutoDJDebugPanel';
import { JUGGLE_MODES, type JuggleMode } from '@/engine/dj/autodj/juggle/juggleTypes';

const JUGGLE_MODE_LABELS: Record<JuggleMode, string> = { OFF: 'Off', SAFE: 'Safe', MUSICAL: 'Musical', PERFORMER: 'Performer', AGGRESSIVE: 'Aggressive', CHAOS: 'Chaos' };

const STATUS_LABELS: Record<AutoDJStatus, string> = {
  idle: 'OFF',
  playing: 'Playing',
  preloading: 'Loading next...',
  'preload-failed': 'Load failed',
  'transition-pending': 'Ready to mix',
  transitioning: 'Mixing...',
};

const STATUS_COLORS: Record<AutoDJStatus, string> = {
  idle: 'bg-dark-bgActive',
  playing: 'bg-accent-primary',
  preloading: 'bg-text-muted',
  'preload-failed': 'bg-accent-error',
  'transition-pending': 'bg-accent-primary/50',
  transitioning: 'bg-accent-primary animate-pulse',
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
  const stemPreSep = useDJStore((s) => s.stemPreSeparation);
  const stemModel = useDJStore((s) => s.stemModel);
  const streamAutoDub = useDJStore((s) => s.streamAutoDub);
  const setConfig = useDJStore((s) => s.setAutoDJConfig);
  const djStyle = useDJStore((s) => s.autoDJStyle);
  const juggleMode = useDJStore((s) => s.autoDJJuggleMode);
  const juggleIntensity = useDJStore((s) => s.autoDJJuggleIntensity);
  const creativeRisk = useDJStore((s) => s.autoDJCreativeRisk);
  const [showDebug, setShowDebug] = useState(false);

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
          <span className="text-text-muted">{STATUS_LABELS[status]}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
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
              ? 'bg-accent-primary border-accent-primary text-text-inverse hover:bg-accent-primary/80'
              : activePlaylist && trackCount >= 2
                ? 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted cursor-not-allowed opacity-50'
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
                  ? 'border-accent-primary bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30'
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
        <div className="text-text-secondary/80 text-center py-1 mb-2">
          Select a playlist with 2+ tracks
        </div>
      )}

      {/* Analysis */}
      {activePlaylist && trackCount >= 2 && !enabled && (
        <div className="mb-3">
          {analysisProgress ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-text-secondary">{analysisProgress.current}/{analysisProgress.total}</span>
                <span className="text-accent-success ml-1">{analysisProgress.analyzed} ok</span>
                {analysisProgress.failed > 0 && <span className="text-accent-error ml-1">{analysisProgress.failed} fail</span>}
                <span className="text-text-muted truncate ml-2 flex-1 text-right">{analysisProgress.trackName}</span>
              </div>
              <div className="h-1 bg-dark-bgTertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-dark-bgActive transition-all duration-300"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Status bar */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-accent-success">{analyzedCount} analyzed</span>
                {skippedCount > 0 && <span className="text-accent-error/60">{skippedCount} skipped</span>}
                {pendingCount > 0 && <span className="text-text-secondary">{pendingCount} pending</span>}
                {!needsAnalysis && pendingCount === 0 && (
                  <span className="text-accent-success/80 ml-auto">Ready</span>
                )}
              </div>
              {/* Progress bar showing ratio */}
              <div className="h-1 bg-dark-bgTertiary rounded-full overflow-hidden flex">
                {analyzedCount > 0 && (
                  <div className="h-full bg-accent-success" style={{ width: `${(analyzedCount / trackCount) * 100}%` }} />
                )}
                {skippedCount > 0 && (
                  <div className="h-full bg-accent-error/20" style={{ width: `${(skippedCount / trackCount) * 100}%` }} />
                )}
              </div>
              {/* Analyze button if needed */}
              {needsAnalysis && (
                <button
                  onClick={handleAnalyze}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-dark-borderLight bg-dark-bgTertiary/20 text-text-secondary hover:bg-dark-bgHover transition-all text-[10px]"
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
            <span className="text-text-secondary w-8 flex-shrink-0">NOW</span>
            <span className="text-text-primary truncate flex-1">
              {currentTrack?.trackName ?? '—'}
            </span>
            <span className="text-text-muted flex-shrink-0">{currentIdx + 1}/{trackCount}</span>
          </div>
          {/* Upcoming tracks (next 4) */}
          {Array.from({ length: Math.min(4, trackCount - currentIdx - 1) }, (_, i) => {
            const idx = (currentIdx + 1 + i) % trackCount;
            const track = activePlaylist.tracks[idx];
            const isNext = idx === nextIdx;
            return (
              <div key={idx} className="flex items-center gap-2 group">
                <span className={`w-8 flex-shrink-0 ${isNext ? 'text-accent-primary' : 'text-text-muted'}`}>
                  {isNext ? 'NEXT' : `${idx + 1}`}
                </span>
                <span className={`truncate flex-1 ${track?.isBad ? 'text-text-muted line-through' : isNext ? 'text-text-secondary' : 'text-text-muted'}`}>
                  {track?.trackName ?? '—'}
                </span>
                {track?.isBad && (
                  <span className="text-[9px] text-accent-error flex-shrink-0" title="This track could not be loaded; Auto DJ skips it">
                    Cannot load
                  </span>
                )}
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
            <div className="text-text-secondary/80 text-center py-0.5 text-[9px] uppercase tracking-wider">
              Paused — transitions stopped
            </div>
          )}
        </div>
      )}

      {/* Config row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Transition bars */}
        <div className="flex items-center gap-1">
          <span className="text-text-muted mr-1">Bars:</span>
          {TRANSITION_BAR_OPTIONS.map((bars) => (
            <button
              key={bars}
              onClick={() => setConfig({ transitionBars: bars })}
              className={`px-2 py-1 rounded text-[10px] border transition-all ${
                transitionBars === bars
                  ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
                  : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
          }`}
          title={
            smartCuts
              ? 'Smart Cuts ON — drum-break cuts + chord-aware fades + harmonic bass-swap'
              : 'Smart Cuts OFF — click to enable pattern-data-driven transitions (tracker songs only)'
          }
        >
          <Scissors size={12} />
        </button>
        {/* Pre-separate stems for upcoming tracks */}
        <button
          onClick={() => {
            const next = !stemPreSep;
            setConfig({ stemPreSeparation: next });
            import('@/engine/dj/DJStemPreloader').then(({ setStemPreSeparation }) => {
              setStemPreSeparation(next);
            });
          }}
          className={`p-1.5 rounded border transition-all ${
            stemPreSep
              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
          }`}
          title={
            stemPreSep
              ? 'Stem Pre-separation ON — upcoming tracks will be separated in the background'
              : 'Stem Pre-separation OFF — click to pre-separate stems for upcoming playlist tracks'
          }
        >
          <Layers size={12} />
        </button>
        {/* Stem model selector — 4s (drums/bass/vocals/other) or 6s (+ guitar/piano) */}
        <button
          onClick={() => setConfig({ stemModel: stemModel === '4s' ? '6s' : '4s' })}
          className={`px-1.5 py-1 rounded border transition-all text-[9px] font-bold tracking-wider ${
            stemModel === '6s'
              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
          }`}
          title={
            stemModel === '6s'
              ? '6-Stem mode — drums, bass, vocals, guitar, piano, other (~120MB model)'
              : '4-Stem mode — drums, bass, vocals, other (~80MB model). Click for 6-stem.'
          }
        >
          {stemModel === '6s' ? '6S' : '4S'}
        </button>
        <button
          onClick={() => {
            const next = !streamAutoDub;
            setConfig({ streamAutoDub: next });
            import('@/engine/dub/StreamAutoDub').then(({ startStreamAutoDub, stopAllStreamAutoDub }) => {
              if (next) {
                // Start on all playing decks
                const decks = useDJStore.getState().decks;
                for (const id of ['A', 'B', 'C'] as const) {
                  if (decks[id].isPlaying) startStreamAutoDub(id);
                }
              } else {
                stopAllStreamAutoDub();
              }
            });
          }}
          className={`p-1.5 rounded border transition-all ${
            streamAutoDub
              ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
          }`}
          title={
            streamAutoDub
              ? 'Stream Auto Dub ON — dub moves fire automatically timed to the beat grid'
              : 'Stream Auto Dub OFF — click to enable auto dub effects on audio decks'
          }
        >
          <Wand2 size={12} />
        </button>
      </div>

      {/* DJ style and creative risk (plan sections 30, 54): the planner's
          weights and the session's risk budget. Full words, design-system
          selects, no hidden knobs. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
        <span className="text-text-muted whitespace-nowrap">Style:</span>
        <CustomSelect
          value={djStyle}
          onChange={(v) => setConfig({ style: v })}
          options={DJ_STYLE_NAMES.map((name) => ({ value: name, label: name }))}
          className="text-[10px]"
          title="DJ style profile: changes the planner's weights, transition lengths, FX use and risk tolerance"
        />
        <span className="text-text-muted whitespace-nowrap">Creative Risk:</span>
        <CustomSelect
          value={creativeRisk < 0 ? 'style' : String(creativeRisk)}
          onChange={(v) => setConfig({ creativeRisk: v === 'style' ? -1 : Number(v) })}
          options={[
            { value: 'style', label: 'Style Default' },
            { value: '0.15', label: 'Low' },
            { value: '0.45', label: 'Medium' },
            { value: '0.75', label: 'High' },
          ]}
          className="text-[10px]"
          title="Session creative risk budget: higher permits shorter transitions, larger tempo moves, more FX, deliberate cuts"
        />
        <span className="text-text-muted whitespace-nowrap">Auto Juggle:</span>
        <CustomSelect
          value={juggleMode}
          onChange={(v) => setConfig({ juggleMode: v })}
          options={JUGGLE_MODES.map((m) => ({ value: m, label: JUGGLE_MODE_LABELS[m] }))}
          className="text-[10px]"
          title="Beat juggling between the two decks: Safe trades 8 and 4 bar phrases, Musical adds call and response, fills and doubles, Performer adds beat juggling, loops and transformer cuts, Aggressive shortens the cuts, Chaos is the densest but still obeys timing and safety"
        />
        <span className="text-text-muted whitespace-nowrap">Juggle Intensity:</span>
        <CustomSelect
          value={juggleIntensity < 0 ? 'set' : String(juggleIntensity)}
          onChange={(v) => setConfig({ juggleIntensity: v === 'set' ? -1 : Number(v) })}
          options={[
            { value: 'set', label: 'Set Decides' },
            { value: '0.25', label: 'Phrases' },
            { value: '0.5', label: 'Two Bars' },
            { value: '0.7', label: 'One Bar' },
            { value: '0.85', label: 'Beats' },
            { value: '1', label: 'Peak' },
          ]}
          className="text-[10px]"
          title="Juggle intensity ladder: phrase trading, two-bar trading, one-bar trading, beat juggling, peak"
        />
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => setShowDebug((v) => !v)} title="Show the Auto DJ plan, confidence, risk and the reasons for every decision">
          {showDebug ? 'Hide Debug' : 'Debug'}
        </Button>
      </div>
      {showDebug && (
        <div className="mt-2 max-h-[60vh] overflow-y-auto" data-testid="autodj-debug-scroll">
          <DJAutoDJDebugPanel />
        </div>
      )}

      {/* 404 fix dialog — pick correct Modland match */}
      {fixDialog && (
        <div className="mt-3 border border-dark-borderLight bg-dark-bgTertiary/10 rounded-md p-2">
          <div className="text-[10px] text-text-secondary mb-1.5 font-bold">
            404: "{fixDialog.trackName}" not found
          </div>
          <div className="text-[9px] text-text-muted mb-2 truncate">
            {fixDialog.originalPath}
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {fixDialog.candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => { fixDialog.resolve(c.full_path); setFixDialog(null); }}
                className="w-full text-left px-2 py-1 rounded text-[10px] border border-dark-borderLight bg-dark-bgTertiary hover:bg-dark-bgHover hover:border-dark-borderLight transition-all"
              >
                <div className="text-text-primary truncate">{c.filename}</div>
                <div className="text-text-muted truncate">{c.author} / {c.format}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => { fixDialog.resolve(null); setFixDialog(null); }}
            className="mt-1.5 w-full px-2 py-1 rounded text-[10px] border border-dark-borderLight bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-all"
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
