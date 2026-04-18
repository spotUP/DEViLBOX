/**
 * DJPlaylistModal — Full-screen modal for playlist curation.
 *
 * Two-pane layout: playlist sidebar (left) + track list with toolbar (right).
 * Replaces the cramped inline DJPlaylistPanel for serious playlist editing.
 *
 * Uses design system tokens throughout — no raw Tailwind colors.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  GripVertical,
  Search,
  Copy,
  Download,
  Upload,
  ListMusic,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Undo2,
  Redo2,
  Music,
  AlertTriangle,
  BarChart3,
  ArrowUpDown,
  Cloud,
  Globe,
  Lock,
  Users,
  RefreshCw,
  Save,
  MoreHorizontal,
} from 'lucide-react';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
  type DJPlaylist,
} from '@/stores/useDJPlaylistStore';
import { useDJStore, type DeckId } from '@/stores/useDJStore';
import { useShallow } from 'zustand/react/shallow';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { seekDeckAudio, cueDeck } from '@/engine/dj/DJActions';
import { subscribeRendering, isRenderingFileName } from '@/engine/dj/DJTrackLoader';
import { markSeek } from './seekGuard';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { smartSort, sortByBPM, sortByKey, sortByEnergy, sortByName } from '@/engine/dj/DJPlaylistSort';
import { camelotDisplay, camelotColor } from '@/engine/dj/DJKeyUtils';
import { analyzePlaylist, playlistNeedsAnalysis, type AnalysisProgress } from '@/engine/dj/DJPlaylistAnalyzer';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { loadUADEToDeck } from '@/engine/dj/DJUADEPrerender';
import { precachePlaylist, type PrecacheProgress } from '@/engine/dj/DJPlaylistPrecache';
import { getCachedFilenames } from '@/engine/dj/DJAudioCache';
import { ContextMenu, useContextMenu, DropdownButton, type MenuItemType } from '@components/common/ContextMenu';
import { showConfirm } from '@/stores/useConfirmStore';
import { Modal } from '@/components/ui/Modal';
import { ModalHeader } from '@/components/ui/ModalHeader';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  savePlaylistToCloud,
  listCloudPlaylists,
  getCloudPlaylist,
  setPlaylistVisibility as apiSetVisibility,
  type CloudPlaylistSummary,
} from '@/lib/playlistCloudApi';
import { DJ_FX_PRESETS } from './DJPlaylistPanel';
import { DJTrackEditModal } from './DJTrackEditModal';
import { DJModlandBrowser } from './DJModlandBrowser';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTotalDuration(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

function exportToM3U(playlist: DJPlaylist): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlist.name}`];
  for (const t of playlist.tracks) {
    const dur = Math.round(t.duration || -1);
    lines.push(`#EXTINF:${dur},${t.trackName}`);
    lines.push(t.fileName);
  }
  return lines.join('\n');
}

function exportToJSON(playlist: DJPlaylist): string {
  return JSON.stringify(playlist, null, 2);
}

function parseM3U(content: string): Array<Omit<PlaylistTrack, 'id'>> {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const tracks: Array<Omit<PlaylistTrack, 'id'>> = [];
  let pendingName = '';
  let pendingDuration = 0;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:(-?\d+),(.+)/);
      if (match) {
        pendingDuration = Math.max(0, parseInt(match[1], 10));
        pendingName = match[2].trim();
      }
    } else if (!line.startsWith('#')) {
      const fileName = line.trim();
      tracks.push({
        fileName,
        trackName: pendingName || fileName.replace(/\.[^.]+$/, ''),
        format: (fileName.split('.').pop() || 'MOD').toUpperCase(),
        bpm: 0,
        duration: pendingDuration,
        addedAt: Date.now(),
      });
      pendingName = '';
      pendingDuration = 0;
    }
  }
  return tracks;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TRACK_ROW_HEIGHT = 72;

// ── Shared inline rename input ──────────────────────────────────────────────

interface RenameInputProps {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputClassName: string;
  buttonSize?: number;
}

const RenameInput: React.FC<RenameInputProps> = ({ value, onChange, onCommit, onCancel, inputClassName, buttonSize = 14 }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);
  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.stopPropagation(); onCommit(); }
          if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
        }}
        className={inputClassName}
      />
      <button onMouseDown={(e) => e.preventDefault()} onClick={onCommit} className="p-1 text-accent-success hover:text-accent-success/80 shrink-0" title="Save (Enter)">
        <Check size={buttonSize} />
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={onCancel} className="p-1 text-text-muted hover:text-text-primary shrink-0" title="Cancel (Esc)">
        <X size={buttonSize} />
      </button>
    </>
  );
};
RenameInput.displayName = 'RenameInput';

// ── Playing-deck lookup + inline scrubber ────────────────────────────────────

interface PlayingDeckInfo {
  deckId: DeckId;
  playbackMode: 'tracker' | 'audio';
  // Audio-mode fields
  audioPosition: number;
  durationMs: number;
  // Tracker-mode fields
  songPos: number;
  totalPositions: number;
  // Hot cues for visual overlay (audio mode only — positions are ms from start)
  hotCues: ReadonlyArray<{ position: number; color: string; name: string } | null>;
}

/**
 * Returns the deck currently playing this track, or null. Handles both audio
 * and tracker playback modes. Custom equality so rows whose track isn't
 * playing never re-render on deck state.
 */
function usePlayingDeckForTrack(fileName: string): PlayingDeckInfo | null {
  return useDJStore(
    useShallow((s) => {
      for (const id of ['A', 'B', 'C'] as const) {
        const d = s.decks[id];
        if (!d.isPlaying || d.fileName !== fileName) continue;
        const hasProgress =
          (d.playbackMode === 'audio' && d.durationMs > 0) ||
          (d.playbackMode === 'tracker' && d.totalPositions > 0);
        if (!hasProgress) continue;
        return {
          deckId: id,
          playbackMode: d.playbackMode,
          audioPosition: d.audioPosition,
          durationMs: d.durationMs,
          songPos: d.songPos,
          totalPositions: d.totalPositions,
          hotCues: d.hotCues,
        };
      }
      return null;
    })
  );
}

/**
 * Returns the render progress (0-100) from whichever deck is currently
 * rendering this track, or null if no deck is rendering it. The pipeline
 * updates `deck.analysisProgress` with a smoothed 0-100 value — render
 * phase covers 0-50, analysis phase 50-100 — and also runs an interpolation
 * ticker so the bar keeps advancing even between real progress events.
 *
 * Used to drive a real width-based progress fill on the playlist row, so
 * the user sees smooth motion instead of a sweeping indeterminate chunk.
 */
function useDeckRenderingProgress(fileName: string): number | null {
  return useDJStore((s) => {
    for (const id of ['A', 'B', 'C'] as const) {
      const d = s.decks[id];
      if (d.fileName === fileName && d.analysisState === 'rendering') {
        return d.analysisProgress ?? 0;
      }
    }
    return null;
  });
}

/**
 * Returns true if `preRenderTrack` is currently running for this fileName
 * (Auto DJ pre-render, precache pass, etc.). These render-in-background
 * paths don't load to a deck so `useDeckRenderingTrack` can't see them.
 * Subscribes to the DJTrackLoader module-level rendering Set.
 */
function useIsPreRendering(fileName: string): boolean {
  return useSyncExternalStore(
    useCallback((cb) => subscribeRendering(cb), []),
    useCallback(() => isRenderingFileName(fileName), [fileName]),
    useCallback(() => false, []), // server snapshot — always false
  );
}

const DECK_COLOR: Record<DeckId, string> = {
  A: 'bg-accent-primary',
  B: 'bg-accent-error',
  C: 'bg-accent-success',
};

const TrackScrubber: React.FC<PlayingDeckInfo> = React.memo(({ deckId, playbackMode, audioPosition, durationMs, songPos, totalPositions, hotCues }) => {
  const barRef = useRef<HTMLDivElement>(null);

  let progress = 0;
  let currentLabel = '';
  let totalLabel = '';
  if (playbackMode === 'audio') {
    const durationSec = durationMs / 1000;
    progress = durationSec > 0 ? Math.min(1, Math.max(0, audioPosition / durationSec)) : 0;
    currentLabel = formatDuration(audioPosition);
    totalLabel = durationSec > 0 ? formatDuration(durationSec) : '--:--';
  } else {
    progress = totalPositions > 0 ? Math.min(1, Math.max(0, songPos / totalPositions)) : 0;
    currentLabel = `${songPos}`;
    totalLabel = `${totalPositions}`;
  }

  // Convert hot cue ms positions to scrubber fractions. Tracker mode has no
  // durationMs so the ticks only appear in audio mode — which is how every
  // deck plays tracker modules after pipeline pre-render anyway.
  const hotCueTicks = playbackMode === 'audio' && durationMs > 0
    ? hotCues
        .map((cue, i) => cue ? { index: i, fraction: Math.max(0, Math.min(1, cue.position / durationMs)), color: cue.color, name: cue.name } : null)
        .filter((t): t is NonNullable<typeof t> => t !== null)
    : [];

  const seekFromEvent = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (playbackMode === 'audio') {
      const durationSec = durationMs / 1000;
      if (durationSec <= 0) return;
      markSeek(deckId);
      seekDeckAudio(deckId, fraction * durationSec);
    } else {
      if (totalPositions <= 0) return;
      const targetPos = Math.min(Math.floor(fraction * totalPositions), totalPositions - 1);
      cueDeck(deckId, targetPos, 0);
    }
  }, [deckId, playbackMode, durationMs, totalPositions]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e.clientX);
  }, [seekFromEvent]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return;
    e.stopPropagation();
    seekFromEvent(e.clientX);
  }, [seekFromEvent]);

  const color = DECK_COLOR[deckId];

  return (
    <div
      ref={barRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 h-2 bg-dark-bgTertiary/70 cursor-ew-resize group/scrub hover:h-3 transition-[height]"
      title={`Deck ${deckId} · drag to scrub · ${currentLabel} / ${totalLabel}`}
    >
      {/* Filled progress bar */}
      <div className={`h-full ${color} opacity-70 group-hover/scrub:opacity-100 transition-opacity`} style={{ width: `${progress * 100}%` }} />

      {/* Hot cue ticks — 2 px tall colored bars above the slider, visible
          always so the user can eyeball their cue points while scrubbing.
          Clicking on a tick jumps the playhead to that cue. */}
      {hotCueTicks.map((tick) => (
        <div
          key={tick.index}
          onPointerDown={(e) => {
            e.stopPropagation();
            const cue = hotCues[tick.index];
            if (cue && durationMs > 0) {
              markSeek(deckId);
              seekDeckAudio(deckId, cue.position / 1000);
            }
          }}
          className="absolute top-0 bottom-0 w-0.5 cursor-pointer hover:w-1 transition-[width]"
          style={{ left: `${tick.fraction * 100}%`, backgroundColor: tick.color, boxShadow: `0 0 4px ${tick.color}` }}
          title={`Hot cue ${tick.index + 1}${tick.name ? `: ${tick.name}` : ''} (click to jump)`}
        />
      ))}

      {/* Always-visible playhead thumb so users see the slider at a glance */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${color} shadow-md border border-dark-bg group-hover/scrub:w-4 group-hover/scrub:h-4 transition-all pointer-events-none`}
        style={{ left: `calc(${progress * 100}% - 6px)` }}
      />

      {/* Time labels — visible on hover, positioned beside the thumb.
          Fade in via group-hover so idle rows stay clean. */}
      <div
        className="absolute bottom-full mb-1 left-0 right-0 flex justify-between px-1 text-[9px] font-mono text-text-muted pointer-events-none opacity-0 group-hover/scrub:opacity-100 transition-opacity"
      >
        <span className="tabular-nums">{currentLabel}</span>
        <span className="tabular-nums text-text-muted/70">{totalLabel}</span>
      </div>
    </div>
  );
});
TrackScrubber.displayName = 'TrackScrubber';

// ── Sortable Track Row (enhanced for modal) ──────────────────────────────────

interface ModalTrackRowProps {
  track: PlaylistTrack;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isLoading: boolean;
  loadingDeckId: string | null;
  isAutoDJCurrent: boolean;
  isAutoDJNext: boolean;
  thirdDeckActive: boolean;
  isPreviewing: boolean;
  onLoadToDeck: (track: PlaylistTrack, deckId: 'A' | 'B' | 'C', index: number) => void;
  onRemove: (index: number) => void;
  onClick: (index: number, e: React.MouseEvent) => void;
  onDoubleClick: (track: PlaylistTrack, index: number) => void;
  onPreview: (track: PlaylistTrack, index: number) => void;
  onStopPreview: () => void;
  onSetFxPreset: (index: number, preset: string | undefined) => void;
  onReRender: (track: PlaylistTrack, index: number) => void;
  isReRendering: boolean;
}

const ModalTrackRow: React.FC<ModalTrackRowProps> = React.memo(({
  track,
  index,
  isSelected,
  isFocused,
  isLoading,
  loadingDeckId,
  isAutoDJCurrent,
  isAutoDJNext,
  thirdDeckActive,
  isPreviewing,
  onLoadToDeck,
  onRemove,
  onClick,
  onDoubleClick,
  onPreview,
  onStopPreview,
  onSetFxPreset,
  onReRender,
  isReRendering,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    height: TRACK_ROW_HEIGHT,
  };

  const [isHovered, setIsHovered] = useState(false);
  const playingDeck = usePlayingDeckForTrack(track.fileName);
  const deckRenderProgress = useDeckRenderingProgress(track.fileName);
  const deckIsRendering = deckRenderProgress !== null;
  const isPreRendering = useIsPreRendering(track.fileName);
  // Any source of "this row is busy rendering/loading" — merged so the bar
  // doesn't flicker between the deck's rendering → loading → playing states.
  const isRendering = isReRendering || deckIsRendering || isPreRendering;

  const bgClass = isLoading
    ? 'bg-accent-primary/10'
    : isDragging
      ? 'bg-accent-primary/20'
      : isPreviewing
        ? 'bg-accent-success/10'
        : isSelected
          ? 'bg-accent-primary/15'
          : playingDeck
            ? 'bg-accent-success/10'
            : isAutoDJCurrent
              ? 'bg-accent-success/10'
              : isAutoDJNext
                ? 'bg-accent-primary/5'
                : isHovered
                  ? 'bg-dark-bgHover'
                  : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-track-index={index}
      className={`relative flex items-center gap-2 px-3 border-b border-dark-border/30 transition-colors cursor-pointer ${bgClass} ${isFocused ? 'ring-1 ring-accent-primary/40 ring-inset' : ''} ${isPreviewing ? 'border-l-2 border-l-accent-success' : ''}`}
      onClick={(e) => onClick(index, e)}
      onDoubleClick={() => onDoubleClick(track, index)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab touch-none w-7 shrink-0 flex items-center justify-center">
        <GripVertical size={22} className="text-text-muted/30 hover:text-text-muted/60" />
      </div>

      {/* Track number */}
      <span className="text-[20px] font-mono text-text-muted/40 w-10 text-right shrink-0">
        {index + 1}
      </span>

      {/* Status indicator */}
      <span className="w-6 shrink-0 text-center">
        {isLoading ? (
          <span className="text-accent-primary text-[20px] animate-pulse font-bold" title={`Loading to deck ${loadingDeckId}`}>
            {loadingDeckId}
          </span>
        ) : track.isBad ? (
          <span className="text-accent-error text-[20px]" title={`Bad: ${track.badReason}`}>✗</span>
        ) : playingDeck ? (
          <span
            className="text-[20px] font-bold"
            style={{ color: playingDeck.deckId === 'A' ? '#00d4ff' : playingDeck.deckId === 'B' ? '#ef4444' : '#22c55e' }}
            title={`Playing on deck ${playingDeck.deckId}`}
          >
            {playingDeck.deckId}
          </span>
        ) : track.played ? (
          <span className="text-accent-success/50 text-[20px]" title="Played">✓</span>
        ) : isAutoDJCurrent ? (
          <span className="text-accent-success text-[20px]" title="Now playing">▶</span>
        ) : isAutoDJNext ? (
          <span className="text-accent-primary text-[20px]" title="Up next">▸</span>
        ) : null}
      </span>

      {/* Track name */}
      <span className={`flex-1 text-[22px] font-mono truncate min-w-0 ${
        isLoading ? 'text-accent-primary' : track.isBad ? 'text-accent-error/80' : track.played ? 'text-text-muted/40' : 'text-text-primary'
      }`}>
        {track.trackName}
      </span>

      {/* Format badge */}
      <span className="text-[18px] font-mono text-text-muted/30 shrink-0 w-20 text-center px-1 bg-dark-bgTertiary rounded">
        {track.format}
      </span>

      {/* BPM */}
      <span className="text-[22px] font-mono text-text-muted/50 shrink-0 w-14 text-right">
        {track.bpm > 0 ? track.bpm : ''}
      </span>

      {/* Musical key (Camelot) */}
      <span className="shrink-0 w-16 text-center">
        {track.musicalKey ? (
          <span
            className="text-[20px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ color: camelotColor(track.musicalKey), backgroundColor: `${camelotColor(track.musicalKey)}15` }}
          >
            {camelotDisplay(track.musicalKey)}
          </span>
        ) : null}
      </span>

      {/* Energy bar */}
      <span className="shrink-0 w-16">
        {track.energy != null && track.energy > 0 ? (
          <div className="w-full h-2 bg-dark-bgTertiary rounded-full overflow-hidden" title={`Energy: ${Math.round(track.energy * 100)}%`}>
            <div
              className="h-full rounded-full bg-accent-warning"
              style={{ width: `${track.energy * 100}%` }}
            />
          </div>
        ) : null}
      </span>

      {/* Duration */}
      <span className="text-[22px] font-mono text-text-muted/40 shrink-0 w-16 text-right">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>

      {/* Preview button */}
      <span className="shrink-0 w-10 flex items-center justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); isPreviewing ? onStopPreview() : onPreview(track, index); }}
          className={`p-2 rounded transition-all ${
            isPreviewing
              ? 'text-accent-success bg-accent-success/15 hover:bg-accent-success/25'
              : `text-text-muted/30 hover:text-text-primary ${isHovered || isFocused ? 'opacity-100' : 'opacity-0'}`
          }`}
          title={isPreviewing ? 'Stop preview' : 'Preview track'}
        >
          {isPreviewing ? <Square size={22} /> : <Play size={22} />}
        </button>
      </span>

      {/* Actions (visible on hover) */}
      <span className={`flex items-center gap-2 shrink-0 w-72 justify-end transition-opacity ${isHovered || isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <select
          value={track.masterFxPreset || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onSetFxPreset(index, e.target.value || undefined); }}
          className="text-[18px] bg-transparent border border-dark-border/50 rounded text-text-muted/50 hover:text-text-muted px-2 max-w-[96px] cursor-pointer"
          title="Per-song master FX preset"
        >
          <option value="">FX</option>
          {DJ_FX_PRESETS.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <button
          onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'A', index); }}
          className="px-3 py-1 text-[20px] font-mono font-bold text-accent-primary hover:text-accent-primary/80 transition-colors rounded hover:bg-dark-bgHover"
          title="Load to Deck 1"
        >1</button>
        <button
          onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'B', index); }}
          className="px-3 py-1 text-[20px] font-mono font-bold text-accent-error hover:text-accent-error/80 transition-colors rounded hover:bg-dark-bgHover"
          title="Load to Deck 2"
        >2</button>
        {thirdDeckActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'C', index); }}
            className="px-3 py-1 text-[20px] font-mono font-bold text-accent-success hover:text-accent-success/80 transition-colors rounded hover:bg-dark-bgHover"
            title="Load to Deck 3"
          >3</button>
        )}
        {/* Re-render — nukes cached pre-render + stale metadata (duration=0,
            missing BPM, isBad flag) and re-fetches/renders from source. Useful
            when a track shows partial data (e.g. `fuzzball-title.fred` with
            0:00 duration) that suggests analysis failed the first time but
            playback actually works. */}
        <button
          onClick={(e) => { e.stopPropagation(); onReRender(track, index); }}
          disabled={isReRendering}
          title={isReRendering ? 'Re-rendering…' : 'Re-render track (clears cache + metadata)'}
          className={`p-2 transition-colors rounded hover:bg-dark-bgHover ${
            isReRendering
              ? 'text-accent-primary animate-spin'
              : 'text-text-muted/50 hover:text-accent-primary'
          }`}
        >
          <RefreshCw size={20} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          title="Remove from playlist"
          className="p-2 text-accent-error/60 hover:text-accent-error transition-colors rounded hover:bg-dark-bgHover"
        >
          <X size={20} />
        </button>
      </span>

      {/* Scrub bar — pinned to bottom, only while this track is playing on a deck in audio mode */}
      {playingDeck && <TrackScrubber {...playingDeck} />}

      {/* Render-in-progress bar — shown when the pipeline is rendering or
          analyzing this track (Auto DJ pre-render, precache pass, Re-render
          button, manual load). No scrubber renders in those cases because
          the track isn't playing yet, so this gives immediate feedback that
          something's happening. Indeterminate (CSS-animated) because the
          pipeline doesn't expose chunk-level progress. */}
      {!playingDeck && isRendering && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-dark-bgTertiary/50 overflow-hidden pointer-events-none"
          title={deckRenderProgress !== null ? `Rendering… ${Math.round(deckRenderProgress)}%` : 'Rendering / analyzing track…'}
        >
          {deckRenderProgress !== null ? (
            // Real 0–100% fill from deck.analysisProgress (render = 0-50%,
            // analyze = 50-100%, smoothed by the pipeline's interpolation
            // ticker). transition-[width] gives a butter-smooth fill between
            // discrete updates.
            <div
              className="h-full bg-accent-primary transition-[width] duration-200 ease-out"
              style={{ width: `${deckRenderProgress}%` }}
            />
          ) : (
            // Fallback: pipeline reports no real progress (background
            // pre-render without a deck). Sweeping chunk at least signals
            // "still working on it".
            <div className="h-full w-1/3 bg-accent-primary animate-indeterminate" />
          )}
        </div>
      )}
    </div>
  );
});

ModalTrackRow.displayName = 'ModalTrackRow';

// ── Playlist Sidebar Item ────────────────────────────────────────────────────

interface PlaylistSidebarItemProps {
  playlist: DJPlaylist;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  isAuthenticated: boolean;
  isSaving: boolean;
  analysisProgress?: AnalysisProgress | null;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditName: (name: string) => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onClone: () => void;
  onCloudSave: () => void;
  onToggleVisibility: () => void;
}

const PlaylistSidebarItem: React.FC<PlaylistSidebarItemProps> = React.memo(({
  playlist,
  isActive,
  isEditing,
  editName,
  isAuthenticated: authed,
  isSaving,
  analysisProgress,
  onSelect,
  onStartEdit,
  onEditName,
  onFinishEdit,
  onCancelEdit,
  onDelete,
  onClone,
  onCloudSave,
  onToggleVisibility,
}) => {
  const totalDuration = playlist.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const badCount = playlist.tracks.filter(t => t.isBad).length;
  const analyzing = analysisProgress && analysisProgress.total > 0;
  const analysisPct = analyzing
    ? Math.round((analysisProgress.current / analysisProgress.total) * 100)
    : 0;

  // Only render inline edit UI when editing a non-active playlist — the header title
  // owns the edit UI for the active one (prevents two autoFocus inputs fighting for focus).
  if (isEditing && !isActive) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <RenameInput
          value={editName}
          onChange={onEditName}
          onCommit={onFinishEdit}
          onCancel={onCancelEdit}
          inputClassName="flex-1 px-2 py-0.5 text-[11px] font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary min-w-0"
          buttonSize={12}
        />
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onStartEdit}
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
        isActive
          ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
          : 'border-transparent text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
      }`}
    >
      <Music size={12} className={isActive ? 'text-accent-primary' : 'text-text-muted/40'} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-mono truncate flex items-center gap-1">
          {playlist.name}
          {playlist.cloudId && (
            <span title={playlist.visibility === 'public' ? 'Public' : 'Private'}>
              {playlist.visibility === 'public'
                ? <Globe size={9} className="text-accent-success/60 shrink-0" />
                : <Lock size={9} className="text-text-muted/40 shrink-0" />}
            </span>
          )}
          {analyzing && (
            <span title={`Analyzing… ${analysisPct}%`} className="shrink-0 inline-flex">
              <BarChart3 size={9} className="text-accent-primary animate-pulse" />
            </span>
          )}
        </div>
        <div className="text-[9px] font-mono text-text-muted/50">
          {analyzing ? (
            <span className="text-accent-primary/80">Analyzing {analysisProgress.current}/{analysisProgress.total}</span>
          ) : (
            <>
              {playlist.tracks.length} tracks
              {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
              {badCount > 0 && <span className="text-accent-error ml-1">· {badCount} bad</span>}
            </>
          )}
        </div>
      </div>
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {authed && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onCloudSave(); }}
              className={`p-0.5 transition-colors ${isSaving ? 'animate-spin text-accent-primary' : playlist.cloudId ? 'text-accent-success/60 hover:text-accent-success' : 'text-text-muted/40 hover:text-accent-primary'}`}
              title={playlist.cloudId ? 'Update in cloud' : 'Save to cloud'}
              disabled={isSaving}
            >
              {isSaving ? <RefreshCw size={10} /> : playlist.cloudId ? <Cloud size={10} /> : <Upload size={10} />}
            </button>
            {playlist.cloudId && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
                className="p-0.5 text-text-muted/40 hover:text-text-primary transition-colors"
                title={playlist.visibility === 'public' ? 'Make private' : 'Make public'}
              >
                {playlist.visibility === 'public' ? <Globe size={10} /> : <Lock size={10} />}
              </button>
            )}
          </>
        )}
        <button onClick={(e) => { e.stopPropagation(); onStartEdit(); }} className="p-0.5 text-text-muted/40 hover:text-text-primary" title="Rename">
          <Edit3 size={10} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onClone(); }} className="p-0.5 text-text-muted/40 hover:text-text-primary" title="Duplicate">
          <Copy size={10} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-0.5 text-text-muted/40 hover:text-accent-error" title="Delete">
          <Trash2 size={10} />
        </button>
      </span>

      {/* Background-analysis progress bar, pinned to the bottom of the row.
          Persists while the user switches to another playlist — so clicking
          Analyze, then browsing or editing a different playlist, still shows
          the first playlist's progress on its sidebar entry. */}
      {analyzing && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-bgTertiary/40 overflow-hidden pointer-events-none"
          title={`Analyzing ${analysisProgress.current}/${analysisProgress.total}`}
        >
          <div
            className="h-full bg-accent-primary transition-[width] duration-200 ease-out"
            style={{ width: `${analysisPct}%` }}
          />
        </div>
      )}
    </div>
  );
});

PlaylistSidebarItem.displayName = 'PlaylistSidebarItem';

// ── Main Modal Component ─────────────────────────────────────────────────────

interface DJPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Outer shell — lightweight gate. When the modal is closed, this component
 * runs zero store subscriptions / memos / effects. The heavy content lives
 * in DJPlaylistModalContent and only mounts when `isOpen` becomes true.
 */
export const DJPlaylistModal: React.FC<DJPlaylistModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return <DJPlaylistModalContent onClose={onClose} />;
};

const DJPlaylistModalContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const isOpen = true;
  // ── Store bindings ──────────────────────────────────────────────────────
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const renamePlaylist = useDJPlaylistStore((s) => s.renamePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const addTracks = useDJPlaylistStore((s) => s.addTracks);
  const rawRemoveTrack = useDJPlaylistStore((s) => s.removeTrack);
  /**
   * Remove a track and also stop any audio attached to it. Before the store
   * removes the entry we check every deck — any deck whose fileName matches
   * gets `stop()` + deck state cleared + deckViewMode reset. Otherwise
   * removing the playlist row leaves the deck playing it, which sounds
   * broken to the user ("I removed the track but it's still playing!").
   *
   * Pipeline cancellation of an in-flight pre-render would be nicer but
   * requires adding an abort path through the worker. The render finishing
   * into cache is harmless — the playlist row is gone so the user won't see
   * its progress bar, and the cache entry is just free pre-work.
   */
  const removeTrack = useCallback((playlistId: string, index: number) => {
    const pl = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
    const track = pl?.tracks[index];
    if (track) {
      const s = useDJStore.getState();
      for (const id of ['A', 'B', 'C'] as const) {
        if (s.decks[id].fileName === track.fileName) {
          try {
            getDJEngine().getDeck(id).stop();
            useDJStore.getState().setDeckPlaying(id, false);
            useDJStore.getState().setDeckState(id, { fileName: null, trackName: undefined, isPlaying: false });
          } catch { /* engine / deck not ready */ }
        }
      }
    }
    // previewingIndex tracks the row index being previewed — when we remove a
    // row, every subsequent index shifts down by 1. Without this fix the
    // Preview button shows Stop on the now-DIFFERENT row that inherited the
    // removed row's index, and the row we actually previewed (shifted down)
    // shows Play. Fix both cases: clear if it's the removed row, decrement
    // if it was below.
    setPreviewingIndex((prev) => {
      if (prev == null) return prev;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
    rawRemoveTrack(playlistId, index);
  }, [rawRemoveTrack]);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);
  const sortTracksAction = useDJPlaylistStore((s) => s.sortTracks);
  const clonePlaylist = useDJPlaylistStore((s) => s.clonePlaylist);
  const selectedTrackIndices = useDJPlaylistStore((s) => s.selectedTrackIndices);
  const focusedTrackIndex = useDJPlaylistStore((s) => s.focusedTrackIndex);
  const selectTrack = useDJPlaylistStore((s) => s.selectTrack);
  const selectTrackRange = useDJPlaylistStore((s) => s.selectTrackRange);
  const toggleTrackSelection = useDJPlaylistStore((s) => s.toggleTrackSelection);
  const selectAllTracks = useDJPlaylistStore((s) => s.selectAllTracks);
  const clearSelection = useDJPlaylistStore((s) => s.clearSelection);
  const setFocusedTrack = useDJPlaylistStore((s) => s.setFocusedTrack);
  const removeSelectedTracks = useDJPlaylistStore((s) => s.removeSelectedTracks);
  const rawMoveSelectedTracks = useDJPlaylistStore((s) => s.moveSelectedTracks);
  const copySelectedTracks = useDJPlaylistStore((s) => s.copySelectedTracks);

  /**
   * Stop any deck that's currently playing any selected track, and reset
   * the preview state if applicable. Called before moving/removing a set
   * of selected tracks so audio doesn't continue against now-reparented
   * entries and the Preview button doesn't render a stale Stop.
   */
  const stopAudioForSelectedTracks = useCallback(() => {
    const store = useDJPlaylistStore.getState();
    const pl = store.playlists.find(p => p.id === store.activePlaylistId);
    if (!pl) return;
    const indices = store.selectedTrackIndices;
    if (indices.length === 0) return;
    const fileNames = new Set<string>();
    for (const i of indices) {
      const t = pl.tracks[i];
      if (t) fileNames.add(t.fileName);
    }
    const djState = useDJStore.getState();
    for (const id of ['A', 'B', 'C'] as const) {
      const fn = djState.decks[id].fileName;
      if (fn && fileNames.has(fn)) {
        try {
          getDJEngine().getDeck(id).stop();
          useDJStore.getState().setDeckPlaying(id, false);
          useDJStore.getState().setDeckState(id, { fileName: null, trackName: undefined, isPlaying: false });
        } catch { /* engine not ready */ }
      }
    }
    setPreviewingIndex((prev) => (prev != null && indices.includes(prev)) ? null : prev);
  }, []);

  /**
   * Wrap the store's moveSelectedTracks so audio is stopped BEFORE the
   * move. Without this, a track playing on a deck would keep playing after
   * its playlist entry has been reparented — and depending on timing the
   * UI would still render the Preview-Stop button on the now-empty source
   * row. User reported "sometimes the move didn't happen when the track
   * was playing"; stopping audio first removes that class of races.
   */
  const moveSelectedTracks = useCallback((fromId: string, toId: string) => {
    stopAudioForSelectedTracks();
    rawMoveSelectedTracks(fromId, toId);
  }, [rawMoveSelectedTracks, stopAudioForSelectedTracks]);
  const canUndo = useDJPlaylistStore((s) => s.canUndo);
  const canRedo = useDJPlaylistStore((s) => s.canRedo);
  const undo = useDJPlaylistStore((s) => s.undo);
  const redo = useDJPlaylistStore((s) => s.redo);
  const updateTrackMeta = useDJPlaylistStore((s) => s.updateTrackMeta);

  const autoDJEnabled = useDJStore((s) => s.autoDJEnabled);
  const autoDJCurrentIdx = useDJStore((s) => s.autoDJCurrentTrackIndex);
  const autoDJNextIdx = useDJStore((s) => s.autoDJNextTrackIndex);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);

  const isLoggedIn = useAuthStore((s) => !!s.token && !!s.user);
  const setPlaylistCloudId = useDJPlaylistStore((s) => s.setPlaylistCloudId);
  const setPlaylistVisibilityStore = useDJPlaylistStore((s) => s.setPlaylistVisibility);

  // ── Local state ──────────────────────────────────────────────────────────
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loadingTrackIndex, setLoadingTrackIndex] = useState<number | null>(null);
  const [loadingDeckId, setLoadingDeckId] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
  const [editTrack, setEditTrack] = useState<{ index: number; track: PlaylistTrack } | null>(null);
  const [columnSort, setColumnSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null);
  // Per-playlist analysis progress map. Running analyses live here keyed by
  // playlist ID, so switching the active playlist doesn't cancel or hide
  // background runs. Each sidebar entry reads its own progress from the map.
  const [analysisProgressMap, setAnalysisProgressMap] = useState<Map<string, AnalysisProgress>>(new Map());
  const analysisProgress = activePlaylistId ? analysisProgressMap.get(activePlaylistId) ?? null : null;
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [communityPlaylists, setCommunityPlaylists] = useState<CloudPlaylistSummary[]>([]);
  const [showCommunity, setShowCommunity] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [importingCloudId, setImportingCloudId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [rightPaneTab, setRightPaneTab] = useState<'tracks' | 'online'>('tracks');
  const clipboardRef = useRef<{ tracks: PlaylistTrack[]; isCut: boolean }>({ tracks: [], isCut: false });
  const previewPlayerRef = useRef<AudioBufferSourceNode | null>(null);
  const previewGainRef = useRef<GainNode | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastClickedRef = useRef<number>(-1);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Context menu
  const contextMenu = useContextMenu();
  const [contextMenuTrackIndex, setContextMenuTrackIndex] = useState<number>(-1);

  // Close sort/export menus on outside click
  useEffect(() => {
    if (!showSortMenu && !showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (showSortMenu && sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      if (showExportMenu && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu, showExportMenu]);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const selectedSet = useMemo(() => new Set(selectedTrackIndices), [selectedTrackIndices]);

  const filteredPlaylists = useMemo(() => {
    if (!sidebarSearch.trim()) return playlists;
    const q = sidebarSearch.toLowerCase();
    return playlists.filter(p => p.name.toLowerCase().includes(q));
  }, [playlists, sidebarSearch]);

  // ── Search/filter ─────────────────────────────────────────────────────────

  const filteredTracks = useMemo(() => {
    if (!activePlaylist || !searchQuery.trim()) return activePlaylist?.tracks ?? [];
    const q = searchQuery.toLowerCase();
    return activePlaylist.tracks.filter((t) =>
      t.trackName.toLowerCase().includes(q) ||
      t.fileName.toLowerCase().includes(q) ||
      t.format.toLowerCase().includes(q) ||
      (t.musicalKey && t.musicalKey.toLowerCase().includes(q))
    );
  }, [activePlaylist, searchQuery]);

  const isFiltered = searchQuery.trim().length > 0;

  const filteredIndexMap = useMemo(() => {
    if (!isFiltered || !activePlaylist) return null;
    const map = new Map<number, number>();
    let fi = 0;
    for (let i = 0; i < activePlaylist.tracks.length; i++) {
      if (filteredTracks.includes(activePlaylist.tracks[i])) {
        map.set(fi, i);
        fi++;
      }
    }
    return map;
  }, [isFiltered, activePlaylist, filteredTracks]);

  const getRealIndex = useCallback((displayIndex: number): number => {
    if (!filteredIndexMap) return displayIndex;
    return filteredIndexMap.get(displayIndex) ?? displayIndex;
  }, [filteredIndexMap]);

  // ── Native contextmenu listener ─────────────────────────────────────────

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const trackRow = target.closest('[data-track-index]');
      if (trackRow) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(trackRow.getAttribute('data-track-index') || '-1', 10);
        if (index >= 0) {
          const realIndex = getRealIndex(index);
          setContextMenuTrackIndex(realIndex);
          if (!selectedSet.has(realIndex)) {
            selectTrack(realIndex);
          }
          const fakeEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX: e.clientX,
            clientY: e.clientY,
          } as React.MouseEvent;
          contextMenu.open(fakeEvent);
        }
      }
    };

    container.addEventListener('contextmenu', handler, true);
    return () => container.removeEventListener('contextmenu', handler, true);
  }, [getRealIndex, selectedSet, selectTrack, contextMenu]);

  // ── Virtual scrolling ─────────────────────────────────────────────────────

  const virtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => TRACK_ROW_HEIGHT,
    // Each row mounts @dnd-kit's useSortable which is heavy enough that
    // React can't reconcile a full screen of rows in one frame during fast
    // wheel/trackpad flicks — the virtualizer's scrollTop outpaces React
    // and reveals blank runway. 60 rows ≈ 2600px cushion in each direction,
    // enough for several frames of catch-up on aggressive flicks.
    overscan: 60,
  });

  // ── @dnd-kit ──────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() =>
    filteredTracks.map((t) => t.id),
    [filteredTracks]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    if (!activePlaylistId || isFiltered) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredTracks.findIndex((t) => t.id === active.id);
    const newIndex = filteredTracks.findIndex((t) => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderTrack(activePlaylistId, oldIndex, newIndex);
      setColumnSort(null);
    }
  }, [activePlaylistId, isFiltered, filteredTracks, reorderTrack]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const activeDragTrack = activeDragId ? filteredTracks.find(t => t.id === activeDragId) : null;
  const dragSelectedCount = activeDragId && selectedTrackIndices.length > 1 ? selectedTrackIndices.length : 0;

  // ── Pre-cache ─────────────────────────────────────────────────────────────

  const [precacheProgress, setPrecacheProgress] = useState<PrecacheProgress | null>(null);
  const precachingRef = useRef(false);
  const [cachedCount, setCachedCount] = useState(0);

  const [retestingBad, setRetestingBad] = useState(false);

  const badTrackCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.isBad).length
    : 0;

  const handleRetestBadTracks = useCallback(async () => {
    if (!activePlaylist || !activePlaylistId || retestingBad) return;

    const badTracks = activePlaylist.tracks
      .map((t, idx) => ({ track: t, index: idx }))
      .filter(({ track }) => track.isBad);

    if (badTracks.length === 0) return;

    setRetestingBad(true);
    const { loadPlaylistTrackToDeck } = await import('@/engine/dj/DJTrackLoader');
    const { clearTrackBadFlag } = useDJPlaylistStore.getState();

    let successCount = 0;
    for (const { track, index } of badTracks) {
      clearTrackBadFlag(activePlaylistId, index);
      const success = await loadPlaylistTrackToDeck(track, 'A');
      if (success) successCount++;
    }

    setRetestingBad(false);
    console.log(`[DJPlaylistModal] Re-test: ${successCount}/${badTracks.length} now working`);
  }, [activePlaylist, activePlaylistId, retestingBad]);

  useEffect(() => {
    if (!activePlaylist) { setCachedCount(0); return; }
    getCachedFilenames().then(names => {
      let count = 0;
      for (const t of activePlaylist.tracks) {
        if (!t.fileName.startsWith('modland:') && !t.fileName.startsWith('hvsc:')) continue;
        const prefix = t.fileName.startsWith('hvsc:') ? 'hvsc:' : 'modland:';
        const fn = t.fileName.slice(prefix.length).split('/').pop() || '';
        if (names.has(fn)) count++;
      }
      setCachedCount(count);
    });
  }, [activePlaylist, precacheProgress]);

  const onlineCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.fileName.startsWith('modland:') || t.fileName.startsWith('hvsc:')).length
    : 0;
  const uncachedCount = onlineCount - cachedCount;

  const handlePrecache = useCallback(async () => {
    if (!activePlaylistId || precachingRef.current) return;
    precachingRef.current = true;
    setPrecacheProgress({ current: 0, total: 1, cached: 0, failed: 0, skipped: 0, trackName: 'Starting...', status: 'checking' });
    try {
      await precachePlaylist(activePlaylistId, (p) => setPrecacheProgress({ ...p }));
    } finally {
      precachingRef.current = false;
      setPrecacheProgress(null);
    }
  }, [activePlaylistId]);

  // ── Batch analyze ────────────────────────────────────────────────────────

  const needsAnalysis = activePlaylist ? playlistNeedsAnalysis(activePlaylist) : false;

  const handleAnalyzeAll = useCallback(async () => {
    if (!activePlaylistId || analysisProgress) return;
    // Snapshot the id so the background run is tied to the playlist the user
    // triggered it on, not whatever's active when it finishes. User can
    // switch playlists, edit a different one, come back — progress keeps
    // writing to the right map entry.
    const pid = activePlaylistId;
    try {
      await analyzePlaylist(pid, (p) => {
        setAnalysisProgressMap(prev => {
          const next = new Map(prev);
          next.set(pid, { ...p });
          return next;
        });
      });
    } finally {
      setAnalysisProgressMap(prev => {
        const next = new Map(prev);
        next.delete(pid);
        return next;
      });
    }
  }, [activePlaylistId, analysisProgress]);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName('');
    setIsCreating(false);
  }, [newName, createPlaylist]);

  const handleRename = useCallback((id: string) => {
    if (!editName.trim()) {
      setEditingPlaylistId(null);
      return;
    }
    renamePlaylist(id, editName.trim());
    setEditingPlaylistId(null);
  }, [editName, renamePlaylist]);

  const handleDeletePlaylist = useCallback(async (playlist: DJPlaylist) => {
    const confirmed = await showConfirm({
      title: 'Delete Playlist',
      message: `Delete "${playlist.name}" and all ${playlist.tracks.length} tracks?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (confirmed) deletePlaylist(playlist.id);
  }, [deletePlaylist]);

  // ── Cloud save/visibility handlers ────────────────────────────────────

  const handleCloudSave = useCallback(async (playlist: DJPlaylist) => {
    if (savingPlaylistId) return;
    setSavingPlaylistId(playlist.id);
    try {
      // Snapshot current DJ environment (crossfader, volumes, master FX, drumpads, Auto DJ)
      const { snapshotDJEnvironment } = await import('@/lib/dj/djEnvironment');
      const environment = snapshotDJEnvironment();

      // Also save environment to the local playlist
      useDJPlaylistStore.getState().saveEnvironmentToPlaylist(playlist.id);

      const totalDur = playlist.tracks.reduce((s, t) => s + (t.duration || 0), 0);
      const result = await savePlaylistToCloud({
        playlistId: playlist.id,
        name: playlist.name,
        description: playlist.description,
        visibility: playlist.visibility || 'private',
        tracks: playlist.tracks,
        environment,
        totalDuration: totalDur,
      });
      setPlaylistCloudId(playlist.id, result.id);
    } catch (err) {
      console.error('Failed to save playlist to cloud:', err);
    } finally {
      setSavingPlaylistId(null);
    }
  }, [savingPlaylistId, setPlaylistCloudId]);

  const handleToggleVisibility = useCallback(async (playlist: DJPlaylist) => {
    if (!playlist.cloudId) return;
    const newVis = playlist.visibility === 'public' ? 'private' : 'public';
    try {
      await apiSetVisibility(playlist.cloudId, newVis);
      setPlaylistVisibilityStore(playlist.id, newVis);
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
    }
  }, [setPlaylistVisibilityStore]);

  const handleSaveAs = useCallback(() => {
    if (!activePlaylist) return;
    const newId = clonePlaylist(activePlaylist.id);
    // Immediately open rename for the new playlist
    const newName = `${activePlaylist.name} (Copy)`;
    setEditingPlaylistId(newId);
    setEditName(newName);
  }, [activePlaylist, clonePlaylist]);

  const loadCommunityPlaylists = useCallback(async () => {
    setLoadingCommunity(true);
    try {
      const result = await listCloudPlaylists({ limit: 50 });
      setCommunityPlaylists(result.playlists);
    } catch (err) {
      console.error('Failed to load community playlists:', err);
    } finally {
      setLoadingCommunity(false);
    }
  }, []);

  const handleImportCommunityPlaylist = useCallback(async (cloudId: string) => {
    setImportingCloudId(cloudId);
    try {
      const full = await getCloudPlaylist(cloudId);
      const newId = createPlaylist(full.name);
      const tracks = (full.tracks as PlaylistTrack[]).map(t => ({
        ...t,
        id: undefined,
      }));
      addTracks(newId, tracks);

      // Restore the DJ environment snapshot if present
      if (full.environment) {
        const store = useDJPlaylistStore.getState();
        // Save environment to the new local playlist
        const playlist = store.playlists.find(p => p.id === newId);
        if (playlist) {
          useDJPlaylistStore.setState((state) => {
            const p = state.playlists.find(pl => pl.id === newId);
            if (p) p.environment = full.environment as any;
          });
          // Restore live DJ state from the environment
          const { restoreDJEnvironment } = await import('@/lib/dj/djEnvironment');
          restoreDJEnvironment(full.environment as any);
        }
      }
    } catch (err) {
      console.error('Failed to import community playlist:', err);
    } finally {
      setImportingCloudId(null);
    }
  }, [createPlaylist, addTracks]);

  // ── Add files to playlist ────────────────────────────────────────────────

  const handleAddFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activePlaylistId || !e.target.files) return;
      setIsLoadingFile(true);

      for (const file of Array.from(e.target.files)) {
        try {
          const isAudio = isAudioFile(file.name);
          const fileExt = file.name.split('.').pop()?.toUpperCase() ?? 'MOD';

          // Persist raw bytes to IndexedDB so playback + Auto DJ can load
          // the file later without prompting for a file picker. Marker
          // prefix `local:` on fileName routes loaders to the cache lookup.
          const buffer = await file.arrayBuffer();
          const { cacheSourceFile } = await import('@/engine/dj/DJAudioCache');
          await cacheSourceFile(buffer, file.name);

          if (isAudio) {
            // Decode to get duration; keep BPM 0 so analysis can pick it up.
            let duration = 0;
            try {
              const ctx = new AudioContext();
              const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
              duration = audioBuffer.duration;
              ctx.close();
            } catch { /* duration stays 0 — Auto DJ will measure later */ }

            addTrack(activePlaylistId, {
              fileName: 'local:' + file.name,
              trackName: file.name.replace(/\.[^.]+$/, ''),
              format: fileExt,
              bpm: 0,
              duration,
              addedAt: Date.now(),
            });
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);

            addTrack(activePlaylistId, {
              fileName: 'local:' + file.name,
              trackName: song.name || file.name,
              format: fileExt,
              bpm: bpmResult.bpm,
              duration,
              addedAt: Date.now(),
            });
          }
        } catch (err) {
          console.error(`[DJPlaylistModal] Failed to process ${file.name}:`, err);
        }
      }

      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [activePlaylistId, addTrack],
  );

  // ── Import playlist ───────────────────────────────────────────────────────

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const text = await file.text();

    if (file.name.endsWith('.json')) {
      try {
        const data = JSON.parse(text) as DJPlaylist;
        if (data.tracks && Array.isArray(data.tracks)) {
          const id = createPlaylist(data.name || 'Imported');
          addTracks(id, data.tracks);
        }
      } catch {
        console.error('[DJPlaylistModal] Invalid JSON playlist file');
      }
    } else {
      const tracks = parseM3U(text);
      if (tracks.length > 0) {
        const name = file.name.replace(/\.[^.]+$/, '');
        const id = createPlaylist(name);
        addTracks(id, tracks);
      }
    }

    if (importInputRef.current) importInputRef.current.value = '';
  }, [createPlaylist, addTracks]);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExportM3U = useCallback(() => {
    if (!activePlaylist) return;
    downloadFile(exportToM3U(activePlaylist), `${activePlaylist.name}.m3u8`, 'audio/mpegurl');
  }, [activePlaylist]);

  const handleExportJSON = useCallback(() => {
    if (!activePlaylist) return;
    downloadFile(exportToJSON(activePlaylist), `${activePlaylist.name}.json`, 'application/json');
  }, [activePlaylist]);

  // ── Load track to deck ────────────────────────────────────────────────────

  const pickFreeDeck = useCallback((): 'A' | 'B' => {
    const decks = useDJStore.getState().decks;
    if (!decks.A.isPlaying) return 'A';
    if (!decks.B.isPlaying) return 'B';
    return 'A';
  }, []);

  const loadSongToDeck = useCallback(
    async (song: import('@/engine/TrackerReplayer').TrackerSong, fileName: string, deckId: 'A' | 'B' | 'C', rawBuffer?: ArrayBuffer) => {
      const engine = getDJEngine();
      const bpmResult = detectBPM(song);

      if (rawBuffer) {
        useDJStore.getState().setDeckState(deckId, {
          fileName,
          trackName: song.name || fileName,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: 'rendering',
          isPlaying: false,
        });

        try {
          const result = await getDJPipeline().loadOrEnqueue(rawBuffer, fileName, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, fileName, song.name || fileName, result.analysis?.bpm || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode('visualizer');
        } catch (err) {
          console.error(`[DJPlaylistModal] Pipeline failed for ${fileName}:`, err);
        }
      }
    },
    [],
  );

  const loadTrackToDeck = useCallback(
    async (track: PlaylistTrack, deckId: 'A' | 'B' | 'C') => {
      const engine = getDJEngine();

      if (track.fileName.startsWith('modland:')) {
        const modlandPath = track.fileName.slice('modland:'.length);
        try {
          const { downloadModlandFile } = await import('@/lib/modlandApi');
          const buffer = await downloadModlandFile(modlandPath);
          const filename = modlandPath.split('/').pop() || 'download.mod';

          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
            useDJStore.getState().setDeckViewMode('vinyl');
          } else if (isUADEFormat(filename)) {
            // Pass track.fileName as the identity so the playlist row's
            // scrubber/isPlaying match works (otherwise the deck stores
            // `slipstream3.fc` and the row looks for `modland:pub/.../...`).
            await loadUADEToDeck(engine, deckId, buffer, filename, true, undefined, track.trackName, track.fileName);
            useDJStore.getState().setDeckViewMode('visualizer');
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            await loadSongToDeck(song, track.fileName, deckId, buffer);
          }
          return;
        } catch (err) {
          console.error(`[DJPlaylistModal] Modland re-download failed:`, err);
          // Bail instead of falling through to the local-file-picker branch
          // below — the track has a modland: URL, not a local path, so asking
          // the user to pick a file off disk is confusing and unwanted.
          return;
        }
      }

      if (track.fileName.startsWith('hvsc:')) {
        const hvscPath = track.fileName.slice('hvsc:'.length);
        try {
          const { downloadHVSCFile } = await import('@/lib/hvscApi');
          const buffer = await downloadHVSCFile(hvscPath);
          const filename = hvscPath.split('/').pop() || 'tune.sid';
          const trackName = track.trackName || filename.replace(/\.sid$/i, '');

          useDJStore.getState().setDeckState(deckId, {
            fileName: track.fileName,
            trackName,
            detectedBPM: track.bpm || 125,
            effectiveBPM: track.bpm || 125,
            analysisState: 'rendering',
            isPlaying: false,
          });

          const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, track.fileName, trackName, result.analysis?.bpm || track.bpm || 125);
          if (useDJStore.getState().deckViewMode !== '3d') {
            useDJStore.getState().setDeckViewMode('visualizer');
          }
          return;
        } catch (err) {
          console.error(`[DJPlaylistModal] HVSC load failed:`, err);
          return;
        }
      }

      // `local:` — file bytes are persisted in the DJ audio cache from when
      // the user added the file to the playlist. Pull the bytes out and load
      // them to the deck without prompting for a file picker.
      if (track.fileName.startsWith('local:')) {
        const filename = track.fileName.slice('local:'.length);
        try {
          const { getCachedAudioByFilename } = await import('@/engine/dj/DJAudioCache');
          const cached = await getCachedAudioByFilename(filename);
          const buffer = cached?.sourceData;
          if (!buffer) {
            console.warn(`[DJPlaylistModal] Local file ${filename} not in cache — falling back to file picker`);
          } else {
            if (isAudioFile(filename)) {
              await engine.loadAudioToDeck(deckId, buffer, track.fileName, track.trackName);
              useDJStore.getState().setDeckViewMode('vinyl');
            } else if (isUADEFormat(filename)) {
              // Pass track.fileName as the identity so the playlist row's
              // scrubber/isPlaying match works for local: UADE tracks too.
              await loadUADEToDeck(engine, deckId, buffer, filename, true, undefined, track.trackName, track.fileName);
              useDJStore.getState().setDeckViewMode('visualizer');
            } else {
              const blob = new File([buffer], filename, { type: 'application/octet-stream' });
              const song = await parseModuleToSong(blob);
              cacheSong(track.fileName, song);
              await loadSongToDeck(song, track.fileName, deckId, buffer);
            }
            return;
          }
        } catch (err) {
          console.error('[DJPlaylistModal] Local load failed:', err);
          return;
        }
      }

      // Fallback: track has no known source scheme (old entries added before
      // `local:` prefix persistence was wired up). Prompt for the file once,
      // then upgrade the track: cache the bytes + flip fileName to `local:`
      // so every future preview skips this prompt.
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const rawBuffer = await file.arrayBuffer();

          // Upgrade: persist + rename track so next time it's a local: lookup.
          try {
            const { cacheSourceFile } = await import('@/engine/dj/DJAudioCache');
            await cacheSourceFile(rawBuffer, file.name);
            if (activePlaylistId) {
              const playlist = useDJPlaylistStore.getState().playlists.find((p) => p.id === activePlaylistId);
              const idx = playlist?.tracks.findIndex((t) => t.id === track.id);
              if (idx !== undefined && idx >= 0) {
                updateTrackMeta(activePlaylistId, idx, { fileName: 'local:' + file.name });
              }
            }
          } catch (upgradeErr) {
            console.warn('[DJPlaylistModal] Could not upgrade track to local: cache — will re-prompt next time:', upgradeErr);
          }

          if (isAudioFile(file.name)) {
            await engine.loadAudioToDeck(deckId, rawBuffer, 'local:' + file.name);
            useDJStore.getState().setDeckViewMode('vinyl');
          } else {
            const song = await parseModuleToSong(file);
            cacheSong('local:' + file.name, song);
            await loadSongToDeck(song, 'local:' + file.name, deckId, rawBuffer);
          }
        } catch (err) {
          console.error(`[DJPlaylistModal] Failed to load track:`, err);
        }
      };
      input.click();
    },
    [loadSongToDeck, activePlaylistId, updateTrackMeta],
  );

  const loadTrackWithProgress = useCallback(
    async (track: PlaylistTrack, deckId: 'A' | 'B' | 'C', index: number) => {
      setLoadingTrackIndex(index);
      setLoadingDeckId(deckId);
      try {
        // Stop the target deck before loading a new track
        const engine = getDJEngine();
        try {
          engine.getDeck(deckId).stop();
          useDJStore.getState().setDeckPlaying(deckId, false);
        } catch { /* deck may not be initialized yet */ }

        await loadTrackToDeck(track, deckId);
        if (track.masterFxPreset) {
          const preset = DJ_FX_PRESETS.find(p => p.key === track.masterFxPreset);
          if (preset) {
            try {
              const { useAudioStore } = await import('@/stores/useAudioStore');
              const effectConfigs = preset.effects.map((fx, i) => ({
                id: `persong-${preset.key}-${i}`,
                category: 'tonejs' as const,
                type: fx.type,
                enabled: true,
                wet: fx.wet,
                parameters: fx.params as Record<string, number | string>,
              }));
              useAudioStore.getState().setMasterEffects(effectConfigs);
            } catch (err) {
              console.warn('[DJPlaylistModal] Failed to apply per-song FX:', err);
            }
          }
        }
      } finally {
        setLoadingTrackIndex(null);
        setLoadingDeckId(null);
      }
    },
    [loadTrackToDeck],
  );

  // ── Preview ──────────────────────────────────────────────────────────────

  const previewDeckRef = useRef<'A' | 'B' | null>(null);

  const stopPreview = useCallback(() => {
    // Stop the deck that was used for previewing
    if (previewDeckRef.current) {
      try {
        getDJEngine().getDeck(previewDeckRef.current).stop();
        useDJStore.getState().setDeckPlaying(previewDeckRef.current, false);
      } catch { /* deck not initialized */ }
      previewDeckRef.current = null;
    }
    if (previewPlayerRef.current) {
      try { previewPlayerRef.current.stop(); } catch { /* already stopped */ }
      previewPlayerRef.current = null;
    }
    if (previewGainRef.current) {
      previewGainRef.current.disconnect();
      previewGainRef.current = null;
    }
    setPreviewingIndex(null);
  }, []);

  const handlePreview = useCallback(async (track: PlaylistTrack, index: number) => {
    stopPreview();
    const deckId: 'A' | 'B' = 'A';
    previewDeckRef.current = deckId;
    setPreviewingIndex(index);
    try {
      // Stop the deck first, then load and play
      try {
        getDJEngine().getDeck(deckId).stop();
        useDJStore.getState().setDeckPlaying(deckId, false);
      } catch { /* */ }
      await loadTrackToDeck(track, deckId);
      try {
        getDJEngine().getDeck(deckId).play();
        useDJStore.getState().setDeckPlaying(deckId, true);
      } catch { /* engine not ready */ }
    } catch {
      previewDeckRef.current = null;
      setPreviewingIndex(null);
    }
  }, [loadTrackToDeck, stopPreview]);

  useEffect(() => stopPreview, [stopPreview]);

  // ── Per-song FX ──────────────────────────────────────────────────────────

  const handleSetFxPreset = useCallback((index: number, preset: string | undefined) => {
    if (!activePlaylistId) return;
    updateTrackMeta(activePlaylistId, index, { masterFxPreset: preset });
  }, [activePlaylistId, updateTrackMeta]);

  // ── Per-track re-render ──────────────────────────────────────────────────
  // Drops cached pre-render + stale analysis metadata (duration, BPM, isBad
  // flag) and runs a fresh pre-render against the current code. Lets the user
  // recover tracks that were marked bad by an earlier build (pre-sanitizer
  // fix, pre-60s-timeout, etc.) without having to re-add them to the playlist.
  const [reRenderingTracks, setReRenderingTracks] = useState<Set<string>>(new Set());
  const handleReRender = useCallback(async (track: PlaylistTrack, index: number) => {
    if (!activePlaylistId) return;
    const realIndex = getRealIndex(index);
    setReRenderingTracks(prev => new Set(prev).add(track.id));
    try {
      updateTrackMeta(activePlaylistId, realIndex, {
        duration: 0,
        bpm: 0,
        isBad: false,
        badReason: undefined,
        analysisSkipped: false,
      });
      const { preRenderTrack } = await import('@/engine/dj/DJTrackLoader');
      const result = await preRenderTrack(track);
      if (result) {
        updateTrackMeta(activePlaylistId, realIndex, {
          duration: result.duration,
          bpm: result.bpm,
          isBad: false,
        });
      }
    } catch (err) {
      console.warn('[DJPlaylistModal] Re-render failed:', err);
    } finally {
      setReRenderingTracks(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  }, [activePlaylistId, getRealIndex, updateTrackMeta]);

  // ── Drop files onto playlist ──────────────────────────────────────────────

  const handleDropOnPlaylist = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      // Do NOT stopPropagation — the drop zones are tagged with
      // `data-dj-playlist-drop` so GlobalDragDropHandler sees the drop, clears
      // its overlay, and skips its own file loader. If we stopPropagation here,
      // the window-level drop listener never fires and the "Drop a file or
      // folder here" overlay stays stuck until the user refreshes.
      if (!activePlaylistId) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;

      setIsLoadingFile(true);
      for (const file of droppedFiles) {
        try {
          const isAudio = isAudioFile(file.name);
          const fileExt = file.name.split('.').pop()?.toUpperCase() ?? 'MOD';

          // Persist to IndexedDB + use `local:` prefix so the loader can
          // resolve the track without re-prompting the user for the file.
          const buffer = await file.arrayBuffer();
          const { cacheSourceFile } = await import('@/engine/dj/DJAudioCache');
          await cacheSourceFile(buffer, file.name);

          if (isAudio) {
            let duration = 0;
            try {
              const ctx = new AudioContext();
              const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
              duration = audioBuffer.duration;
              ctx.close();
            } catch { /* ok */ }

            addTrack(activePlaylistId, {
              fileName: 'local:' + file.name,
              trackName: file.name.replace(/\.[^.]+$/, ''),
              format: fileExt,
              bpm: 0,
              duration,
              addedAt: Date.now(),
            });
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);

            addTrack(activePlaylistId, {
              fileName: 'local:' + file.name,
              trackName: song.name || file.name,
              format: fileExt,
              bpm: bpmResult.bpm,
              duration,
              addedAt: Date.now(),
            });
          }
        } catch (err) {
          console.error(`[DJPlaylistModal] Drop process error:`, err);
        }
      }
      setIsLoadingFile(false);
    },
    [activePlaylistId, addTrack],
  );

  // ── Sort handlers ────────────────────────────────────────────────────────

  const handleSort = useCallback((mode: 'smart' | 'bpm' | 'bpm-desc' | 'key' | 'energy' | 'name' | 'broken') => {
    if (!activePlaylist) return;
    const tracks = [...activePlaylist.tracks];
    let sorted: PlaylistTrack[];
    switch (mode) {
      case 'smart': sorted = smartSort(tracks); break;
      case 'bpm': sorted = sortByBPM(tracks); break;
      case 'bpm-desc': sorted = sortByBPM(tracks, true); break;
      case 'key': sorted = sortByKey(tracks); break;
      case 'energy': sorted = sortByEnergy(tracks); break;
      case 'name': sorted = sortByName(tracks); break;
      case 'broken': {
        // Bad tracks first — so the user can quickly re-render/remove them.
        // Within each bucket, preserve the current order (stable partition).
        const bad: PlaylistTrack[] = [];
        const good: PlaylistTrack[] = [];
        for (const t of tracks) (t.isBad ? bad : good).push(t);
        sorted = [...bad, ...good];
        break;
      }
      default: sorted = tracks;
    }
    sortTracksAction(activePlaylist.id, sorted);
    setShowSortMenu(false);
    setColumnSort(null);
  }, [activePlaylist, sortTracksAction]);

  // ── Column header sort ──────────────────────────────────────────────────

  const handleColumnSort = useCallback((column: string) => {
    if (!activePlaylist) return;
    const tracks = [...activePlaylist.tracks];
    const newDir = columnSort?.column === column && columnSort.dir === 'asc' ? 'desc' : 'asc';
    setColumnSort({ column, dir: newDir });
    let sorted: PlaylistTrack[];
    switch (column) {
      case 'name':
        sorted = sortByName(tracks);
        if (newDir === 'desc') sorted.reverse();
        break;
      case 'bpm':
        sorted = sortByBPM(tracks, newDir === 'desc');
        break;
      case 'key':
        sorted = sortByKey(tracks);
        if (newDir === 'desc') sorted.reverse();
        break;
      case 'energy':
        sorted = sortByEnergy(tracks);
        if (newDir === 'desc') sorted.reverse();
        break;
      case 'time':
        sorted = [...tracks].sort((a, b) => newDir === 'asc' ? (a.duration || 0) - (b.duration || 0) : (b.duration || 0) - (a.duration || 0));
        break;
      case 'format':
        sorted = [...tracks].sort((a, b) => newDir === 'asc' ? a.format.localeCompare(b.format) : b.format.localeCompare(a.format));
        break;
      default:
        sorted = tracks;
    }
    sortTracksAction(activePlaylist.id, sorted);
  }, [activePlaylist, columnSort, sortTracksAction]);

  // ── Multi-select click handler ────────────────────────────────────────────

  const handleTrackClick = useCallback((displayIndex: number, e: React.MouseEvent) => {
    const realIndex = getRealIndex(displayIndex);
    if (e.metaKey || e.ctrlKey) {
      toggleTrackSelection(realIndex);
    } else if (e.shiftKey && lastClickedRef.current >= 0) {
      selectTrackRange(lastClickedRef.current, realIndex);
    } else {
      selectTrack(realIndex);
    }
    lastClickedRef.current = realIndex;
  }, [getRealIndex, toggleTrackSelection, selectTrackRange, selectTrack]);

  const handleTrackDoubleClick = useCallback(async (track: PlaylistTrack, displayIndex: number) => {
    const realIndex = getRealIndex(displayIndex);
    if (!activePlaylistId) return;

    // Stop all playing decks first
    const engine = getDJEngine();
    const decks = useDJStore.getState().decks;
    for (const id of ['A', 'B', 'C'] as const) {
      if (decks[id].isPlaying) {
        try {
          engine.getDeck(id).stop();
          useDJStore.getState().setDeckPlaying(id, false);
        } catch { /* deck not initialized */ }
      }
    }

    // Load and play on a free deck
    const deckId = pickFreeDeck();
    await loadTrackWithProgress(track, deckId, realIndex);
    try {
      engine.getDeck(deckId).play();
      useDJStore.getState().setDeckPlaying(deckId, true);
    } catch { /* engine not ready */ }
  }, [getRealIndex, activePlaylistId, pickFreeDeck, loadTrackWithProgress]);

  // ── Context menu ──────────────────────────────────────────────────────────

  const contextMenuItems = useMemo((): MenuItemType[] => {
    if (!activePlaylist || contextMenuTrackIndex < 0) return [];
    const track = activePlaylist.tracks[contextMenuTrackIndex];
    if (!track) return [];

    const otherPlaylists = playlists.filter((p) => p.id !== activePlaylistId);
    const selCount = selectedTrackIndices.length;

    const items: MenuItemType[] = [
      { id: 'play-from-here', label: 'Play from here (Auto DJ)', onClick: async () => {
        if (!activePlaylistId) return;
        const { getAutoDJ } = await import('@/engine/dj/DJAutoDJ');
        const autoDJ = getAutoDJ();
        const error = await autoDJ.enable(contextMenuTrackIndex);
        if (error) console.error('[DJPlaylistModal] Auto DJ start failed:', error);
      }},
      { type: 'divider' },
      { id: 'load-1', label: 'Load to Deck 1', onClick: () => loadTrackWithProgress(track, 'A', contextMenuTrackIndex) },
      { id: 'load-2', label: 'Load to Deck 2', onClick: () => loadTrackWithProgress(track, 'B', contextMenuTrackIndex) },
    ];

    if (thirdDeckActive) {
      items.push({ id: 'load-3', label: 'Load to Deck 3', onClick: () => loadTrackWithProgress(track, 'C', contextMenuTrackIndex) });
    }

    items.push({ type: 'divider' });

    if (selCount <= 1) {
      items.push({
        id: 'move-up',
        label: 'Move Up',
        disabled: contextMenuTrackIndex === 0,
        onClick: () => {
          if (activePlaylistId && contextMenuTrackIndex > 0) {
            reorderTrack(activePlaylistId, contextMenuTrackIndex, contextMenuTrackIndex - 1);
          }
        },
      });
      items.push({
        id: 'move-down',
        label: 'Move Down',
        disabled: contextMenuTrackIndex === activePlaylist.tracks.length - 1,
        onClick: () => {
          if (activePlaylistId && contextMenuTrackIndex < activePlaylist.tracks.length - 1) {
            reorderTrack(activePlaylistId, contextMenuTrackIndex, contextMenuTrackIndex + 1);
          }
        },
      });
      items.push({ type: 'divider' });
    }

    if (otherPlaylists.length > 0) {
      items.push({
        id: 'move-to',
        label: selCount > 1 ? `Move ${selCount} to...` : 'Move to...',
        submenu: otherPlaylists.map((pl) => ({
          id: `move-${pl.id}`,
          label: pl.name,
          onClick: () => { if (activePlaylistId) moveSelectedTracks(activePlaylistId, pl.id); },
        })),
      });
      items.push({
        id: 'copy-to',
        label: selCount > 1 ? `Copy ${selCount} to...` : 'Copy to...',
        submenu: otherPlaylists.map((pl) => ({
          id: `copy-${pl.id}`,
          label: pl.name,
          onClick: () => { if (activePlaylistId) copySelectedTracks(activePlaylistId, pl.id); },
        })),
      });
      items.push({ type: 'divider' });
    }

    items.push({
      id: 'edit-info',
      label: 'Edit Track Info',
      onClick: () => setEditTrack({ index: contextMenuTrackIndex, track }),
    });

    items.push({
      id: 'copy-info',
      label: 'Copy Track Info',
      onClick: () => {
        const info = [
          `Name: ${track.trackName}`,
          `File: ${track.fileName}`,
          track.format && `Format: ${track.format}`,
          track.bpm > 0 && `BPM: ${track.bpm}`,
          track.musicalKey && `Key: ${track.musicalKey}`,
          track.duration > 0 && `Duration: ${formatDuration(track.duration)}`,
        ].filter(Boolean).join('\n');
        navigator.clipboard.writeText(info);
      },
    });

    items.push({ type: 'divider' });

    if (track.isBad) {
      items.push({
        id: 'clear-bad',
        label: 'Clear Bad Flag',
        onClick: () => {
          if (activePlaylistId) {
            useDJPlaylistStore.getState().clearTrackBadFlag(activePlaylistId, contextMenuTrackIndex);
          }
        },
      });
    } else {
      items.push({
        id: 'mark-bad',
        label: 'Mark as Bad',
        onClick: () => {
          if (activePlaylistId) {
            useDJPlaylistStore.getState().markTrackBad(activePlaylistId, contextMenuTrackIndex, 'Manually marked');
          }
        },
      });
    }

    items.push({ type: 'divider' });

    if (selCount > 1) {
      items.push({
        id: 'remove-selected',
        label: `Remove ${selCount} tracks`,
        danger: true,
        onClick: async () => {
          if (!activePlaylistId) return;
          const confirmed = await showConfirm({
            title: 'Remove Tracks',
            message: `Remove ${selCount} selected tracks from this playlist?`,
            confirmLabel: 'Remove',
            danger: true,
          });
          if (confirmed) removeSelectedTracks(activePlaylistId);
        },
      });
    } else {
      items.push({
        id: 'remove',
        label: 'Remove from playlist',
        danger: true,
        onClick: () => { if (activePlaylistId) removeTrack(activePlaylistId, contextMenuTrackIndex); },
      });
    }

    return items;
  }, [activePlaylist, activePlaylistId, contextMenuTrackIndex, playlists, selectedTrackIndices, thirdDeckActive, loadTrackWithProgress, moveSelectedTracks, copySelectedTracks, removeSelectedTracks, removeTrack, reorderTrack]);

  // ── Keyboard navigation ─────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activePlaylist || !activePlaylistId) return;
    const trackCount = filteredTracks.length;
    if (trackCount === 0 && e.key !== 'v') return;

    const isMeta = e.metaKey || e.ctrlKey;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (isMeta && !isFiltered && selectedTrackIndices.length > 0) {
          // Ctrl/Cmd+Down: move selected tracks down
          const sorted = [...selectedTrackIndices].sort((a, b) => b - a);
          if (sorted[0] < activePlaylist.tracks.length - 1) {
            for (const idx of sorted) {
              reorderTrack(activePlaylistId, idx, idx + 1);
            }
            const newFocus = Math.min(focusedTrackIndex + 1, trackCount - 1);
            setFocusedTrack(newFocus);
            virtualizer.scrollToIndex(newFocus, { align: 'auto' });
          }
        } else {
          const next = Math.min(focusedTrackIndex + 1, trackCount - 1);
          const realNext = getRealIndex(next);
          if (e.shiftKey) {
            selectTrackRange(lastClickedRef.current >= 0 ? lastClickedRef.current : 0, realNext);
          } else {
            selectTrack(realNext);
            lastClickedRef.current = realNext;
          }
          setFocusedTrack(next);
          virtualizer.scrollToIndex(next, { align: 'auto' });
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (isMeta && !isFiltered && selectedTrackIndices.length > 0) {
          // Ctrl/Cmd+Up: move selected tracks up
          const sorted = [...selectedTrackIndices].sort((a, b) => a - b);
          if (sorted[0] > 0) {
            for (const idx of sorted) {
              reorderTrack(activePlaylistId, idx, idx - 1);
            }
            const newFocus = Math.max(focusedTrackIndex - 1, 0);
            setFocusedTrack(newFocus);
            virtualizer.scrollToIndex(newFocus, { align: 'auto' });
          }
        } else {
          const prev = Math.max(focusedTrackIndex - 1, 0);
          const realPrev = getRealIndex(prev);
          if (e.shiftKey) {
            selectTrackRange(lastClickedRef.current >= 0 ? lastClickedRef.current : 0, realPrev);
          } else {
            selectTrack(realPrev);
            lastClickedRef.current = realPrev;
          }
          setFocusedTrack(prev);
          virtualizer.scrollToIndex(prev, { align: 'auto' });
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (focusedTrackIndex >= 0 && focusedTrackIndex < trackCount) {
          const realIdx = getRealIndex(focusedTrackIndex);
          const track = activePlaylist.tracks[realIdx];
          if (track) {
            // Stop all playing decks, then load to a free one
            const eng = getDJEngine();
            const dks = useDJStore.getState().decks;
            for (const id of ['A', 'B', 'C'] as const) {
              if (dks[id].isPlaying) {
                try { eng.getDeck(id).stop(); useDJStore.getState().setDeckPlaying(id, false); } catch { /* */ }
              }
            }
            const dk = pickFreeDeck();
            loadTrackWithProgress(track, dk, realIdx).then(() => {
              try { eng.getDeck(dk).play(); useDJStore.getState().setDeckPlaying(dk, true); } catch { /* */ }
            });
          }
        }
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (selectedTrackIndices.length > 0) {
          e.preventDefault();
          if (selectedTrackIndices.length > 3) {
            showConfirm({
              title: 'Remove Tracks',
              message: `Remove ${selectedTrackIndices.length} selected tracks?`,
              confirmLabel: 'Remove',
              danger: true,
            }).then((confirmed) => {
              if (confirmed) removeSelectedTracks(activePlaylistId);
            });
          } else {
            removeSelectedTracks(activePlaylistId);
          }
        }
        break;
      }
      case 'x': {
        if (isMeta && selectedTrackIndices.length > 0) {
          e.preventDefault();
          // Cut: copy selected tracks to clipboard, then remove
          const sorted = [...selectedTrackIndices].sort((a, b) => a - b);
          clipboardRef.current = {
            tracks: sorted.map(i => ({ ...activePlaylist.tracks[i] })),
            isCut: true,
          };
          removeSelectedTracks(activePlaylistId);
          import('@/stores/useNotificationStore').then(({ notify }) => {
            notify.success(`Cut ${sorted.length} track${sorted.length > 1 ? 's' : ''}`);
          });
        }
        break;
      }
      case 'c': {
        if (isMeta && selectedTrackIndices.length > 0) {
          e.preventDefault();
          // Copy: store selected tracks in clipboard
          const sorted = [...selectedTrackIndices].sort((a, b) => a - b);
          clipboardRef.current = {
            tracks: sorted.map(i => ({ ...activePlaylist.tracks[i] })),
            isCut: false,
          };
          import('@/stores/useNotificationStore').then(({ notify }) => {
            notify.success(`Copied ${sorted.length} track${sorted.length > 1 ? 's' : ''}`);
          });
        }
        break;
      }
      case 'v': {
        if (isMeta && clipboardRef.current.tracks.length > 0) {
          e.preventDefault();
          // Paste: insert clipboard tracks after focused position
          const insertAt = Math.max(0, focusedTrackIndex + 1);
          const newTracks = [...activePlaylist.tracks];
          const pastedTracks = clipboardRef.current.tracks.map(t => ({
            ...t,
            id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }));
          newTracks.splice(insertAt, 0, ...pastedTracks);
          sortTracksAction(activePlaylistId, newTracks);
          // Select the pasted tracks
          const pastedIndices = pastedTracks.map((_, i) => insertAt + i);
          clearSelection();
          for (const idx of pastedIndices) {
            toggleTrackSelection(idx);
          }
          setFocusedTrack(insertAt);
          import('@/stores/useNotificationStore').then(({ notify }) => {
            notify.success(`Pasted ${pastedTracks.length} track${pastedTracks.length > 1 ? 's' : ''}`);
          });
          // If it was a cut, clear clipboard after paste
          if (clipboardRef.current.isCut) {
            clipboardRef.current = { tracks: [], isCut: false };
          }
        }
        break;
      }
      case 'a': {
        if (isMeta) {
          e.preventDefault();
          selectAllTracks();
        }
        break;
      }
      case 'z': {
        if (isMeta) {
          e.preventDefault();
          if (e.shiftKey) {
            if (canRedo) redo();
          } else {
            if (canUndo) undo();
          }
        }
        break;
      }
      case 'Escape': {
        if (searchQuery) {
          setSearchQuery('');
          scrollContainerRef.current?.focus();
        } else {
          clearSelection();
        }
        break;
      }
      case 'f': {
        if (isMeta) {
          e.preventDefault();
          e.stopPropagation();
          searchInputRef.current?.focus();
        }
        break;
      }
    }
  }, [activePlaylist, activePlaylistId, filteredTracks, isFiltered, focusedTrackIndex, selectedTrackIndices, getRealIndex, selectTrack, selectTrackRange, toggleTrackSelection, setFocusedTrack, selectAllTracks, clearSelection, removeSelectedTracks, reorderTrack, sortTracksAction, loadTrackWithProgress, pickFreeDeck, canUndo, canRedo, undo, redo, virtualizer]);

  // ── Computed stats ────────────────────────────────────────────────────────

  const totalDuration = activePlaylist
    ? activePlaylist.tracks.reduce((s, t) => s + (t.duration || 0), 0)
    : 0;
  const analyzedCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.bpm > 0 || t.musicalKey).length
    : 0;
  const playedCount = activePlaylist
    ? activePlaylist.tracks.filter(t => t.played).length
    : 0;

  // Selection stats
  const selectedDuration = activePlaylist
    ? selectedTrackIndices.reduce((s, i) => s + (activePlaylist.tracks[i]?.duration || 0), 0)
    : 0;

  // BPM range + most common key for status bar
  const { bpmMin, bpmMax, topKey } = useMemo(() => {
    if (!activePlaylist || activePlaylist.tracks.length === 0) return { bpmMin: 0, bpmMax: 0, topKey: '' };
    const bpms = activePlaylist.tracks.map(t => t.bpm).filter(b => b > 0);
    const keyCounts = new Map<string, number>();
    for (const t of activePlaylist.tracks) {
      if (t.musicalKey) {
        const k = camelotDisplay(t.musicalKey);
        keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
      }
    }
    let topK = '';
    let topC = 0;
    for (const [k, c] of keyCounts) { if (c > topC) { topK = k; topC = c; } }
    return {
      bpmMin: bpms.length > 0 ? Math.min(...bpms) : 0,
      bpmMax: bpms.length > 0 ? Math.max(...bpms) : 0,
      topKey: topC >= 2 ? topK : '',
    };
  }, [activePlaylist]);

  const handleInvertSelection = useCallback(() => {
    if (!activePlaylist) return;
    const allIndices = activePlaylist.tracks.map((_, i) => i);
    const currentSet = new Set(selectedTrackIndices);
    clearSelection();
    for (const i of allIndices) {
      if (!currentSet.has(i)) toggleTrackSelection(i);
    }
  }, [activePlaylist, selectedTrackIndices, clearSelection, toggleTrackSelection]);

  const handleClearPlayed = useCallback(() => {
    if (!activePlaylistId || !activePlaylist) return;
    activePlaylist.tracks.forEach((_, i) => {
      updateTrackMeta(activePlaylistId, i, { played: undefined });
    });
  }, [activePlaylistId, activePlaylist, updateTrackMeta]);

  // ── Header dropdown menu (playlist-level actions) ─────────────────────────

  const headerMenuItems = useMemo((): MenuItemType[] => {
    if (!activePlaylist || !activePlaylistId) return [];
    const cloud = !!activePlaylist.cloudId;
    const items: MenuItemType[] = [
      {
        id: 'rename',
        label: 'Rename…',
        icon: <Edit3 size={12} />,
        onClick: () => {
          setEditingPlaylistId(activePlaylistId);
          setEditName(activePlaylist.name);
        },
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Copy size={12} />,
        onClick: () => { clonePlaylist(activePlaylistId); },
      },
      { type: 'divider' },
      {
        id: 'export-json',
        label: 'Export as JSON',
        icon: <Download size={12} />,
        onClick: handleExportJSON,
      },
      {
        id: 'export-m3u',
        label: 'Export as M3U',
        icon: <Download size={12} />,
        onClick: handleExportM3U,
      },
    ];

    if (isLoggedIn) {
      items.push({ type: 'divider' });
      items.push({
        id: 'cloud-save',
        label: cloud ? 'Update in cloud' : 'Save to cloud',
        icon: cloud ? <Cloud size={12} /> : <Upload size={12} />,
        onClick: () => { handleCloudSave(activePlaylist); },
        disabled: savingPlaylistId === activePlaylistId,
      });
      if (cloud) {
        items.push({
          id: 'toggle-visibility',
          label: activePlaylist.visibility === 'public' ? 'Make private' : 'Make public',
          icon: activePlaylist.visibility === 'public' ? <Lock size={12} /> : <Globe size={12} />,
          onClick: () => { handleToggleVisibility(activePlaylist); },
        });
      }
    }

    const maintenanceItems: MenuItemType[] = [];
    if (needsAnalysis) {
      maintenanceItems.push({
        id: 'analyze',
        label: 'Analyze unscanned',
        icon: <BarChart3 size={12} />,
        onClick: handleAnalyzeAll,
        disabled: !!analysisProgress,
      });
    }
    if (uncachedCount > 0 && !precacheProgress) {
      maintenanceItems.push({
        id: 'precache',
        label: `Cache ${uncachedCount} online track${uncachedCount === 1 ? '' : 's'}`,
        icon: <Download size={12} />,
        onClick: handlePrecache,
      });
    }
    if (badTrackCount > 0) {
      maintenanceItems.push({
        id: 'retest',
        label: retestingBad ? 'Testing bad tracks…' : `Re-test ${badTrackCount} bad track${badTrackCount === 1 ? '' : 's'}`,
        icon: <RefreshCw size={12} />,
        onClick: handleRetestBadTracks,
        disabled: retestingBad,
      });
    }
    if (maintenanceItems.length > 0) {
      items.push({ type: 'divider' });
      items.push(...maintenanceItems);
    }

    const clearItems: MenuItemType[] = [];
    if (playedCount > 0) {
      clearItems.push({
        id: 'clear-played',
        label: `Clear ${playedCount} played mark${playedCount === 1 ? '' : 's'}`,
        icon: <Check size={12} />,
        onClick: handleClearPlayed,
      });
    }
    if (badTrackCount > 0) {
      clearItems.push({
        id: 'clear-bad',
        label: `Clear ${badTrackCount} bad flag${badTrackCount === 1 ? '' : 's'}`,
        icon: <AlertTriangle size={12} />,
        onClick: () => { useDJPlaylistStore.getState().clearAllBadFlags(activePlaylistId); },
      });
    }
    if (clearItems.length > 0) {
      items.push({ type: 'divider' });
      items.push(...clearItems);
    }

    items.push({ type: 'divider' });
    items.push({
      id: 'delete',
      label: 'Delete playlist…',
      icon: <Trash2 size={12} />,
      danger: true,
      onClick: () => { handleDeletePlaylist(activePlaylist); },
    });

    return items;
  }, [
    activePlaylist, activePlaylistId, isLoggedIn, savingPlaylistId,
    needsAnalysis, analysisProgress, uncachedCount, precacheProgress,
    badTrackCount, retestingBad, playedCount,
    clonePlaylist, handleExportJSON, handleExportM3U, handleCloudSave,
    handleToggleVisibility, handleAnalyzeAll, handlePrecache,
    handleRetestBadTracks, handleClearPlayed, handleDeletePlaylist,
  ]);

  // ── Hidden file inputs ────────────────────────────────────────────────────

  const hiddenInputs = (
    <>
      <input ref={fileInputRef} type="file" multiple accept="*/*" onChange={handleAddFiles} className="hidden" />
      <input ref={importInputRef} type="file" accept=".m3u,.m3u8,.json" onChange={handleImport} className="hidden" />
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="fullscreen" closeOnEscape closeOnBackdropClick={false}>
      <div className="flex flex-col h-full font-mono">
        {/* Header */}
        <ModalHeader
          title="Playlist Manager"
          subtitle="⌘↑↓ move · ⌘XCV cut/copy/paste · Drag to reorder · Double-click to play"
          icon={<ListMusic size={18} />}
          onClose={onClose}
        />

        <div className="flex flex-1 min-h-0">
          {/* ── Left sidebar: Playlist list ──────────────────────────── */}
          <div className="w-60 shrink-0 border-r border-dark-border bg-dark-bg flex flex-col">
            <div className="px-3 py-2 border-b border-dark-border flex items-center justify-between">
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Playlists</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="p-1 text-text-muted/50 hover:text-text-primary transition-colors"
                  title="Import playlist (M3U/JSON)"
                >
                  <Upload size={11} />
                </button>
                <button
                  onClick={() => { setIsCreating(true); setNewName(''); }}
                  className="p-1 text-text-muted/50 hover:text-accent-primary transition-colors"
                  title="New playlist"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Sidebar search */}
            {playlists.length > 3 && (
              <div className="px-2 py-1.5 border-b border-dark-border/30">
                <div className="flex items-center gap-1 bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-0.5">
                  <Search size={10} className="text-text-muted/30 shrink-0" />
                  <input
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="Filter playlists…"
                    className="flex-1 bg-transparent text-[10px] font-mono text-text-primary placeholder:text-text-muted/25 outline-none min-w-0"
                  />
                  {sidebarSearch && (
                    <button onClick={() => setSidebarSearch('')} className="p-0.5 text-text-muted/30 hover:text-text-primary"><X size={9} /></button>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {filteredPlaylists.map((pl) => (
                <PlaylistSidebarItem
                  key={pl.id}
                  playlist={pl}
                  isActive={pl.id === activePlaylistId}
                  isEditing={editingPlaylistId === pl.id}
                  editName={editName}
                  analysisProgress={analysisProgressMap.get(pl.id) ?? null}
                  isAuthenticated={isLoggedIn}
                  isSaving={savingPlaylistId === pl.id}
                  onSelect={() => setActivePlaylist(pl.id)}
                  onStartEdit={() => { setEditingPlaylistId(pl.id); setEditName(pl.name); }}
                  onEditName={setEditName}
                  onFinishEdit={() => handleRename(pl.id)}
                  onCancelEdit={() => setEditingPlaylistId(null)}
                  onDelete={() => handleDeletePlaylist(pl)}
                  onClone={() => clonePlaylist(pl.id)}
                  onCloudSave={() => handleCloudSave(pl)}
                  onToggleVisibility={() => handleToggleVisibility(pl)}
                />
              ))}

              {filteredPlaylists.length === 0 && !isCreating && (
                <div className="p-4 text-center">
                  <p className="text-[10px] font-mono text-text-muted/40 mb-2">
                    {sidebarSearch ? 'No matches' : 'No playlists yet'}
                  </p>
                  {!sidebarSearch && (
                    <Button variant="ghost" size="sm" onClick={() => { setIsCreating(true); setNewName(''); }}>
                      Create one
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ── Community Playlists Section ──────────────────────── */}
            <div className="border-t border-dark-border">
              <button
                onClick={() => {
                  setShowCommunity(!showCommunity);
                  if (!showCommunity && communityPlaylists.length === 0) loadCommunityPlaylists();
                }}
                className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-mono text-text-muted uppercase tracking-wider hover:bg-dark-bgHover transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Users size={10} />
                  Community
                </span>
                {showCommunity ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>

              {showCommunity && (
                <div className="max-h-48 overflow-y-auto">
                  {loadingCommunity ? (
                    <div className="px-3 py-3 text-center">
                      <RefreshCw size={12} className="animate-spin text-text-muted/40 mx-auto" />
                      <p className="text-[9px] font-mono text-text-muted/40 mt-1">Loading…</p>
                    </div>
                  ) : communityPlaylists.length === 0 ? (
                    <div className="px-3 py-3 text-center">
                      <p className="text-[9px] font-mono text-text-muted/40">No public playlists yet</p>
                    </div>
                  ) : (
                    communityPlaylists.map((cp) => (
                      <div
                        key={cp.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-dark-bgHover transition-colors group"
                      >
                        <Globe size={10} className="text-accent-primary/40 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-mono text-text-secondary truncate">{cp.name}</div>
                          <div className="text-[9px] font-mono text-text-muted/40">
                            {cp.trackCount} tracks · by {cp.authorName}
                          </div>
                        </div>
                        <button
                          onClick={() => handleImportCommunityPlaylist(cp.id)}
                          disabled={importingCloudId === cp.id}
                          className="p-0.5 text-text-muted/40 hover:text-accent-primary transition-colors opacity-0 group-hover:opacity-100"
                          title="Import to my playlists"
                        >
                          {importingCloudId === cp.id ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                        </button>
                      </div>
                    ))
                  )}
                  <div className="px-3 py-1 border-t border-dark-border/30">
                    <button
                      onClick={loadCommunityPlaylists}
                      className="text-[9px] font-mono text-accent-primary/60 hover:text-accent-primary transition-colors"
                      disabled={loadingCommunity}
                    >
                      ↻ Refresh
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* New playlist input */}
            {isCreating && (
              <div className="px-2 py-2 border-t border-dark-border">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
                  placeholder="Playlist name..."
                  className="w-full px-2 py-1 text-[11px] font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary placeholder:text-text-muted/30"
                />
                <div className="flex justify-end gap-1 mt-1">
                  <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right pane: Track list ────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 bg-dark-bgSecondary">
            {activePlaylist ? (
              <>
                {/* Tab strip */}
                <div className="flex items-center border-b border-dark-border bg-dark-bg/50 shrink-0">
                  <button
                    onClick={() => setRightPaneTab('tracks')}
                    className={`px-4 py-2 text-[11px] font-mono font-bold border-b-2 transition-colors truncate max-w-[50%] ${
                      rightPaneTab === 'tracks'
                        ? 'border-accent-primary text-accent-primary bg-dark-bg/50'
                        : 'border-transparent text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                    }`}
                    title={activePlaylist.name}
                  >
                    <ListMusic size={11} className="inline mr-1.5 -mt-0.5" />
                    {activePlaylist.name}
                    <span className="ml-1.5 text-text-muted/50 font-normal">({activePlaylist.tracks.length})</span>
                  </button>
                  <button
                    onClick={() => setRightPaneTab('online')}
                    className={`px-4 py-2 text-[11px] font-mono font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                      rightPaneTab === 'online'
                        ? 'border-accent-primary text-accent-primary bg-dark-bg/50'
                        : 'border-transparent text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                    }`}
                    title="Search Modland + HVSC online archives"
                  >
                    <Globe size={11} />
                    Online Search
                  </button>
                </div>

                {rightPaneTab === 'online' ? (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <DJModlandBrowser variant="fullHeight" />
                  </div>
                ) : (
                  <>
                {/* Toolbar */}
                <div className="px-3 py-2 border-b border-dark-border flex items-center gap-2">
                  {/* Playlist title + actions menu */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    {editingPlaylistId && editingPlaylistId === activePlaylistId ? (
                      <RenameInput
                        value={editName}
                        onChange={setEditName}
                        onCommit={() => handleRename(editingPlaylistId)}
                        onCancel={() => setEditingPlaylistId(null)}
                        inputClassName="flex-1 min-w-0 px-2 py-0.5 text-[13px] font-mono font-bold bg-dark-bgTertiary border border-accent-primary/60 rounded text-text-primary"
                      />
                    ) : (
                      <>
                        <span
                          onClick={() => {
                            setEditingPlaylistId(activePlaylistId);
                            setEditName(activePlaylist.name);
                          }}
                          className="text-[13px] font-mono font-bold text-text-primary truncate cursor-text hover:text-accent-primary transition-colors"
                          title="Click to rename"
                        >
                          {activePlaylist.name}
                        </span>
                        <DropdownButton
                          items={headerMenuItems}
                          className="p-1 text-text-muted/50 hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors shrink-0"
                        >
                          <MoreHorizontal size={14} />
                        </DropdownButton>
                        <span className="text-[10px] font-mono text-text-muted/50 ml-1 truncate">
                          {activePlaylist.tracks.length} tracks
                          {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-1 bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-0.5">
                    <Search size={11} className="text-text-muted/40 shrink-0" />
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setSearchQuery(''); scrollContainerRef.current?.focus(); e.stopPropagation(); }
                      }}
                      placeholder="Filter… (⌘F)"
                      className="w-48 bg-transparent text-[11px] font-mono text-text-primary placeholder:text-text-muted/30 outline-none"
                    />
                    {searchQuery && (
                      <>
                        <span className="text-[9px] font-mono text-text-muted/40 shrink-0">{filteredTracks.length}/{activePlaylist.tracks.length}</span>
                        <button onClick={() => { setSearchQuery(''); scrollContainerRef.current?.focus(); }} className="p-0.5 text-text-muted/40 hover:text-text-primary"><X size={10} /></button>
                      </>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="w-px h-5 bg-dark-border/30" />

                  {/* Undo / Redo */}
                  <button onClick={undo} disabled={!canUndo} className="p-1 text-text-muted/40 hover:text-text-primary disabled:opacity-20 transition-colors" title="Undo (⌘Z)">
                    <Undo2 size={13} />
                  </button>
                  <button onClick={redo} disabled={!canRedo} className="p-1 text-text-muted/40 hover:text-text-primary disabled:opacity-20 transition-colors" title="Redo (⌘⇧Z)">
                    <Redo2 size={13} />
                  </button>

                  {/* Divider */}
                  <div className="w-px h-5 bg-dark-border/30" />

                  {/* Sort */}
                  <div ref={sortMenuRef} className="relative">
                    <button
                      onClick={() => setShowSortMenu(v => !v)}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                        showSortMenu ? 'border-accent-primary text-accent-primary bg-accent-primary/10' : 'border-dark-borderLight text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                      }`}
                      title="Sort playlist"
                    >
                      <ArrowUpDown size={10} /> Sort <ChevronDown size={10} />
                    </button>
                    {showSortMenu && (
                      <div className="absolute top-full right-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded-lg shadow-xl min-w-[160px] py-1">
                        <button onClick={() => handleSort('smart')}
                          className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-accent-primary hover:bg-dark-bgHover transition-colors">
                          ✨ Smart Mix
                        </button>
                        <div className="border-t border-dark-border/20 my-0.5" />
                        {(['bpm', 'bpm-desc', 'key', 'energy', 'name'] as const).map((mode) => (
                          <button key={mode} onClick={() => handleSort(mode)}
                            className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-dark-bgHover transition-colors">
                            {{ bpm: 'BPM (low → high)', 'bpm-desc': 'BPM (high → low)', key: 'Key (Camelot)', energy: 'Energy', name: 'Name (A→Z)' }[mode]}
                          </button>
                        ))}
                        <div className="border-t border-dark-border/20 my-0.5" />
                        <button
                          onClick={() => handleSort('broken')}
                          className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-accent-error hover:bg-dark-bgHover transition-colors"
                          title="Show all bad (unplayable) tracks at the top of the list"
                        >
                          ✗ Broken first
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Analyze */}
                  {needsAnalysis && !analysisProgress && (
                    <Button variant="ghost" size="sm" onClick={handleAnalyzeAll} icon={<BarChart3 size={12} />} title="Analyze unscanned tracks for BPM, key, and energy">
                      Analyze
                    </Button>
                  )}
                  {analysisProgress && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-dark-bgTertiary rounded-full overflow-hidden">
                        <div className="h-full bg-accent-primary transition-all duration-300"
                          style={{ width: `${(analysisProgress.current / Math.max(analysisProgress.total, 1)) * 100}%` }} />
                      </div>
                      <span className="text-[9px] font-mono text-accent-primary">{analysisProgress.current}/{analysisProgress.total}</span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="w-px h-5 bg-dark-border/30" />

                  {/* Add files */}
                  <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoadingFile} icon={<Plus size={12} />} title="Add files (drag & drop also works)">
                    Add
                  </Button>

                  {/* Export */}
                  <div ref={exportMenuRef} className="relative">
                    <button
                      onClick={() => setShowExportMenu(v => !v)}
                      className={`p-1 transition-colors ${showExportMenu ? 'text-accent-primary' : 'text-text-muted/40 hover:text-text-primary'}`}
                      title="Export playlist"
                    >
                      <Download size={13} />
                    </button>
                    {showExportMenu && (
                      <div className="absolute top-full right-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded-lg shadow-xl min-w-[130px] py-1">
                        <button onClick={() => { handleExportJSON(); setShowExportMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-dark-bgHover transition-colors">
                          Export JSON
                        </button>
                        <button onClick={() => { handleExportM3U(); setShowExportMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-dark-bgHover transition-colors">
                          Export M3U
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Save As */}
                  <button
                    onClick={handleSaveAs}
                    className="p-1 text-text-muted/40 hover:text-text-primary transition-colors"
                    title="Save As… (duplicate playlist)"
                  >
                    <Save size={13} />
                  </button>

                  {/* Cloud save */}
                  {isLoggedIn && activePlaylist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCloudSave(activePlaylist)}
                      disabled={savingPlaylistId === activePlaylist.id}
                      icon={savingPlaylistId === activePlaylist.id
                        ? <RefreshCw size={12} className="animate-spin" />
                        : activePlaylist.cloudId ? <Cloud size={12} /> : <Upload size={12} />}
                      title={activePlaylist.cloudId ? 'Update in cloud' : 'Save to cloud'}
                    >
                      {activePlaylist.cloudId ? 'Synced' : 'Save'}
                    </Button>
                  )}
                </div>

                {/* Selection bar */}
                {selectedTrackIndices.length > 1 && (
                  <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-mono text-accent-primary/70 bg-accent-primary/5 border-b border-dark-border">
                    <span className="font-bold">{selectedTrackIndices.length} selected</span>
                    {selectedDuration > 0 && (
                      <span className="text-text-muted/40">· {formatTotalDuration(selectedDuration)}</span>
                    )}
                    <div className="w-px h-3 bg-dark-border/30" />
                    <button onClick={() => { if (activePlaylistId) removeSelectedTracks(activePlaylistId); }} className="text-accent-error/70 hover:text-accent-error transition-colors" title="Remove selected">
                      <Trash2 size={10} className="inline mr-0.5" />Remove
                    </button>
                    {playlists.filter(p => p.id !== activePlaylistId).length > 0 && (
                      <>
                        <button
                          onClick={() => {
                            const others = playlists.filter(p => p.id !== activePlaylistId);
                            if (others.length === 1 && activePlaylistId) {
                              copySelectedTracks(activePlaylistId, others[0].id);
                            }
                          }}
                          className="text-text-muted hover:text-text-primary transition-colors"
                          title="Copy selected to another playlist"
                        >
                          <Copy size={10} className="inline mr-0.5" />Copy to…
                        </button>
                      </>
                    )}
                    <button onClick={handleInvertSelection} className="text-text-muted hover:text-text-primary transition-colors" title="Invert selection">
                      Invert
                    </button>
                    <div className="flex-1" />
                    <button onClick={clearSelection} className="text-text-muted hover:text-text-primary transition-colors">Clear</button>
                  </div>
                )}

                {/* Column headers (sortable) */}
                {filteredTracks.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 border-b border-dark-border bg-dark-bg/50 text-[18px] font-mono text-text-muted/40 uppercase tracking-wider select-none shrink-0">
                    <span className="w-7 shrink-0" />
                    <span className="w-10 text-right shrink-0">#</span>
                    <span className="w-6 shrink-0" />
                    <span className="flex-1 min-w-0 cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('name')}>
                      Title {columnSort?.column === 'name' && (columnSort.dir === 'asc' ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-20 text-center cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('format')}>
                      Format {columnSort?.column === 'format' && (columnSort.dir === 'asc' ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-14 text-right cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('bpm')}>
                      BPM {columnSort?.column === 'bpm' && (columnSort.dir === 'asc' ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-16 text-center cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('key')}>
                      Key {columnSort?.column === 'key' && (columnSort.dir === 'asc' ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-16 text-center cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('energy')}>
                      Energy {columnSort?.column === 'energy' && (columnSort.dir === 'asc' ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-16 text-right cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('time')}>
                      Time {columnSort?.column === 'time' && (columnSort.dir === 'asc' ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-10" />
                    <span className="shrink-0 w-72" />
                  </div>
                )}

                {/* Track list */}
                {filteredTracks.length === 0 ? (
                  <div
                    data-dj-playlist-drop
                    className="flex-1 flex items-center justify-center border-2 border-dashed border-dark-border/30 m-4 rounded-xl"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-accent-primary/50', 'bg-accent-primary/5'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-accent-primary/50', 'bg-accent-primary/5'); }}
                    onDrop={(e) => { e.currentTarget.classList.remove('border-accent-primary/50', 'bg-accent-primary/5'); handleDropOnPlaylist(e); }}
                  >
                    <div className="text-center">
                      <Music size={48} className="text-text-muted/15 mx-auto mb-3" />
                      <p className="text-[13px] font-mono text-text-muted/40 mb-1">
                        {isFiltered ? 'No tracks match your search' : 'Drop files here to add tracks'}
                      </p>
                      {!isFiltered && (
                        <p className="text-[11px] font-mono text-text-muted/25">
                          or click <span className="text-accent-primary/50">+ Add</span> in the toolbar
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    ref={scrollContainerRef}
                    data-dj-playlist-drop
                    className="flex-1 overflow-y-auto min-h-0"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropOnPlaylist}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                  >
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                          {virtualizer.getVirtualItems().map((virtualRow) => {
                            const track = filteredTracks[virtualRow.index];
                            const realIndex = getRealIndex(virtualRow.index);
                            return (
                              <div
                                key={track.id}
                                data-track-index={virtualRow.index}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  height: virtualRow.size,
                                  transform: `translateY(${virtualRow.start}px)`,
                                  willChange: 'transform',
                                }}
                              >
                                <ModalTrackRow
                                  track={track}
                                  index={virtualRow.index}
                                  isSelected={selectedSet.has(realIndex)}
                                  isFocused={focusedTrackIndex === virtualRow.index}
                                  isLoading={loadingTrackIndex === realIndex}
                                  loadingDeckId={loadingDeckId}
                                  isAutoDJCurrent={autoDJEnabled && realIndex === autoDJCurrentIdx}
                                  isAutoDJNext={autoDJEnabled && realIndex === autoDJNextIdx}
                                  thirdDeckActive={thirdDeckActive}
                                  isPreviewing={previewingIndex === realIndex}
                                  onLoadToDeck={(t, d, _i) => loadTrackWithProgress(t, d, realIndex)}
                                  onRemove={(i) => removeTrack(activePlaylist.id, getRealIndex(i))}
                                  onClick={handleTrackClick}
                                  onDoubleClick={handleTrackDoubleClick}
                                  onPreview={handlePreview}
                                  onStopPreview={stopPreview}
                                  onSetFxPreset={handleSetFxPreset}
                                  onReRender={handleReRender}
                                  isReRendering={reRenderingTracks.has(track.id)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </SortableContext>
                      <DragOverlay>
                        {activeDragTrack && (
                          <div className="bg-dark-bg border border-accent-primary/50 rounded px-3 py-2 shadow-xl flex items-center gap-2 text-text-primary">
                            <GripVertical size={14} className="text-accent-primary/50" />
                            <span className="text-[11px] font-mono truncate max-w-[300px]">{activeDragTrack.trackName}</span>
                            {dragSelectedCount > 1 && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-accent-primary text-text-inverse font-bold">{dragSelectedCount}</span>
                            )}
                          </div>
                        )}
                      </DragOverlay>
                    </DndContext>
                  </div>
                )}

                {/* Preview strip */}
                {previewingIndex != null && activePlaylist.tracks[previewingIndex] && (
                  <div className="px-3 py-1.5 border-t border-dark-border bg-dark-bg flex items-center gap-2">
                    <button onClick={stopPreview} className="p-1 text-accent-success hover:text-accent-success/80 transition-colors" title="Stop preview">
                      <Square size={12} />
                    </button>
                    <span className="text-[11px] font-mono text-accent-success">▶ Preview:</span>
                    <span className="text-[11px] font-mono text-text-primary truncate flex-1 min-w-0">
                      {activePlaylist.tracks[previewingIndex].trackName}
                    </span>
                    {activePlaylist.tracks[previewingIndex].bpm > 0 && (
                      <span className="text-[10px] font-mono text-text-muted/50">{activePlaylist.tracks[previewingIndex].bpm} BPM</span>
                    )}
                    {activePlaylist.tracks[previewingIndex].musicalKey && (
                      <span
                        className="text-[10px] font-mono font-bold px-1 rounded"
                        style={{ color: camelotColor(activePlaylist.tracks[previewingIndex].musicalKey!) }}
                      >
                        {camelotDisplay(activePlaylist.tracks[previewingIndex].musicalKey!)}
                      </span>
                    )}
                  </div>
                )}

                {/* Status bar */}
                <div className="px-3 py-2 border-t border-dark-border bg-dark-bg flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-text-muted/50">
                    {activePlaylist.tracks.length} tracks
                    {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
                    {analyzedCount > 0 && ` · ${analyzedCount} analyzed`}
                    {playedCount > 0 && ` · ${playedCount} played`}
                  </span>

                  {bpmMin > 0 && bpmMax > 0 && (
                    <span className="text-text-muted/35">
                      {bpmMin === bpmMax ? `${bpmMin} BPM` : `${bpmMin}–${bpmMax} BPM`}
                    </span>
                  )}

                  {topKey && (
                    <span className="text-text-muted/35">Top key: {topKey}</span>
                  )}

                  {playedCount > 0 && (
                    <button
                      onClick={handleClearPlayed}
                      className="text-text-muted/40 hover:text-text-primary transition-colors"
                      title="Clear played marks"
                    >
                      Clear played
                    </button>
                  )}

                  <div className="flex-1" />

                  {/* Precache progress */}
                  {precacheProgress && (
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-dark-bgTertiary rounded-full overflow-hidden">
                        <div className="h-full bg-accent-warning transition-all duration-300"
                          style={{ width: `${(precacheProgress.current / precacheProgress.total) * 100}%` }} />
                      </div>
                      <span className="text-accent-warning">{precacheProgress.current}/{precacheProgress.total}</span>
                    </div>
                  )}

                  {/* Cache button */}
                  {!precacheProgress && uncachedCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={handlePrecache}>
                      Cache ({uncachedCount})
                    </Button>
                  )}

                  {/* Bad tracks */}
                  {badTrackCount > 0 && (
                    <>
                      <span className="text-accent-error">
                        <AlertTriangle size={10} className="inline mr-0.5" />
                        {badTrackCount} bad
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleRetestBadTracks} disabled={retestingBad}>
                        {retestingBad ? 'Testing...' : 'Re-test'}
                      </Button>
                      <button
                        onClick={() => activePlaylistId && useDJPlaylistStore.getState().clearAllBadFlags(activePlaylistId)}
                        className="text-text-muted/40 hover:text-text-primary transition-colors"
                        title="Clear all bad marks"
                      >
                        Clear
                      </button>
                    </>
                  )}

                  {/* Online cache status */}
                  {onlineCount > 0 && !precacheProgress && (
                    <span className="text-accent-success/50">
                      {cachedCount}/{onlineCount} cached
                      {uncachedCount === 0 && ' ✓'}
                    </span>
                  )}
                </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <ListMusic size={56} className="text-text-muted/10 mx-auto mb-4" />
                  <p className="text-[14px] font-mono text-text-muted/30 mb-1">
                    {playlists.length > 0 ? 'Select a playlist' : 'No playlists yet'}
                  </p>
                  <p className="text-[11px] font-mono text-text-muted/20 mb-4">
                    {playlists.length > 0 ? 'Choose from the sidebar to start curating' : 'Create your first playlist to get started'}
                  </p>
                  {playlists.length === 0 && (
                    <Button variant="primary" size="sm" onClick={() => { setIsCreating(true); setNewName(''); }}>
                      New Playlist
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Context menu */}
        <ContextMenu items={contextMenuItems} position={contextMenu.position} onClose={contextMenu.close} />
      </div>

      {hiddenInputs}

      {/* Track edit modal */}
      {editTrack && activePlaylistId && (
        <DJTrackEditModal
          isOpen={!!editTrack}
          onClose={() => setEditTrack(null)}
          playlistId={activePlaylistId}
          trackIndex={editTrack.index}
          track={editTrack.track}
        />
      )}
    </Modal>
  );
};
