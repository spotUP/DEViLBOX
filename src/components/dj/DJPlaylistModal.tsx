/**
 * DJPlaylistModal — Full-screen modal for playlist curation.
 *
 * Two-pane layout: playlist sidebar (left) + track list with toolbar (right).
 * Replaces the cramped inline DJPlaylistPanel for serious playlist editing.
 *
 * Uses design system tokens throughout — no raw Tailwind colors.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
  type DJPlaylist,
} from '@/stores/useDJPlaylistStore';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
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
import { ContextMenu, useContextMenu, type MenuItemType } from '@components/common/ContextMenu';
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

const TRACK_ROW_HEIGHT = 44;

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

  const bgClass = isLoading
    ? 'bg-accent-primary/10'
    : isDragging
      ? 'bg-accent-primary/20'
      : isPreviewing
        ? 'bg-accent-success/10'
        : isSelected
          ? 'bg-accent-primary/15'
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
      className={`flex items-center gap-2 px-3 border-b border-dark-border/30 transition-colors cursor-pointer ${bgClass} ${isFocused ? 'ring-1 ring-accent-primary/40 ring-inset' : ''} ${isPreviewing ? 'border-l-2 border-l-accent-success' : ''}`}
      onClick={(e) => onClick(index, e)}
      onDoubleClick={() => onDoubleClick(track, index)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab touch-none w-5 shrink-0 flex items-center justify-center">
        <GripVertical size={14} className="text-text-muted/30 hover:text-text-muted/60" />
      </div>

      {/* Track number */}
      <span className="text-[10px] font-mono text-text-muted/40 w-6 text-right shrink-0">
        {index + 1}
      </span>

      {/* Status indicator */}
      <span className="w-4 shrink-0 text-center">
        {isLoading ? (
          <span className="text-accent-primary text-[10px] animate-pulse font-bold" title={`Loading to deck ${loadingDeckId}`}>
            {loadingDeckId}
          </span>
        ) : track.isBad ? (
          <span className="text-accent-error text-[10px]" title={`Bad: ${track.badReason}`}>✗</span>
        ) : track.played ? (
          <span className="text-accent-success/50 text-[10px]" title="Played">✓</span>
        ) : isAutoDJCurrent ? (
          <span className="text-accent-success text-[10px]" title="Now playing">▶</span>
        ) : isAutoDJNext ? (
          <span className="text-accent-primary text-[10px]" title="Up next">▸</span>
        ) : null}
      </span>

      {/* Track name */}
      <span className={`flex-1 text-[11px] font-mono truncate min-w-0 ${
        isLoading ? 'text-accent-primary' : track.isBad ? 'text-accent-error/80' : track.played ? 'text-text-muted/40' : 'text-text-primary'
      }`}>
        {track.trackName}
      </span>

      {/* Format badge */}
      <span className="text-[9px] font-mono text-text-muted/30 shrink-0 w-12 text-center px-1 bg-dark-bgTertiary rounded">
        {track.format}
      </span>

      {/* BPM */}
      <span className="text-[11px] font-mono text-text-muted/50 shrink-0 w-8 text-right">
        {track.bpm > 0 ? track.bpm : ''}
      </span>

      {/* Musical key (Camelot) */}
      <span className="shrink-0 w-10 text-center">
        {track.musicalKey ? (
          <span
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ color: camelotColor(track.musicalKey), backgroundColor: `${camelotColor(track.musicalKey)}15` }}
          >
            {camelotDisplay(track.musicalKey)}
          </span>
        ) : null}
      </span>

      {/* Energy bar */}
      <span className="shrink-0 w-10">
        {track.energy != null && track.energy > 0 ? (
          <div className="w-full h-1.5 bg-dark-bgTertiary rounded-full overflow-hidden" title={`Energy: ${Math.round(track.energy * 100)}%`}>
            <div
              className="h-full rounded-full bg-accent-warning"
              style={{ width: `${track.energy * 100}%` }}
            />
          </div>
        ) : null}
      </span>

      {/* Duration */}
      <span className="text-[11px] font-mono text-text-muted/40 shrink-0 w-10 text-right">
        {track.duration > 0 ? formatDuration(track.duration) : ''}
      </span>

      {/* Preview button */}
      <span className="shrink-0 w-6 flex items-center justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); isPreviewing ? onStopPreview() : onPreview(track, index); }}
          className={`p-1 rounded transition-all ${
            isPreviewing
              ? 'text-accent-success bg-accent-success/15 hover:bg-accent-success/25'
              : `text-text-muted/30 hover:text-text-primary ${isHovered || isFocused ? 'opacity-100' : 'opacity-0'}`
          }`}
          title={isPreviewing ? 'Stop preview' : 'Preview track'}
        >
          {isPreviewing ? <Square size={12} /> : <Play size={12} />}
        </button>
      </span>

      {/* Actions (visible on hover) */}
      <span className={`flex items-center gap-1 shrink-0 w-36 justify-end transition-opacity ${isHovered || isFocused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <select
          value={track.masterFxPreset || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onSetFxPreset(index, e.target.value || undefined); }}
          className="text-[9px] bg-transparent border border-dark-border/50 rounded text-text-muted/50 hover:text-text-muted px-1 max-w-[48px] cursor-pointer"
          title="Per-song master FX preset"
        >
          <option value="">FX</option>
          {DJ_FX_PRESETS.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <button
          onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'A', index); }}
          className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-accent-primary hover:text-accent-primary/80 transition-colors rounded hover:bg-dark-bgHover"
          title="Load to Deck 1"
        >1</button>
        <button
          onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'B', index); }}
          className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-accent-error hover:text-accent-error/80 transition-colors rounded hover:bg-dark-bgHover"
          title="Load to Deck 2"
        >2</button>
        {thirdDeckActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onLoadToDeck(track, 'C', index); }}
            className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-accent-success hover:text-accent-success/80 transition-colors rounded hover:bg-dark-bgHover"
            title="Load to Deck 3"
          >3</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          title="Remove from playlist"
          className="p-1 text-accent-error/60 hover:text-accent-error transition-colors rounded hover:bg-dark-bgHover"
        >
          <X size={10} />
        </button>
      </span>
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

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          autoFocus
          value={editName}
          onChange={(e) => onEditName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onFinishEdit(); if (e.key === 'Escape') onCancelEdit(); }}
          onBlur={onFinishEdit}
          className="flex-1 px-2 py-0.5 text-[11px] font-mono bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary min-w-0"
        />
        <button onClick={onFinishEdit} className="p-0.5 text-accent-success hover:text-accent-success/80"><Check size={12} /></button>
        <button onClick={onCancelEdit} className="p-0.5 text-text-muted hover:text-text-primary"><X size={12} /></button>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onStartEdit}
      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
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
        </div>
        <div className="text-[9px] font-mono text-text-muted/50">
          {playlist.tracks.length} tracks
          {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
          {badCount > 0 && <span className="text-accent-error ml-1">· {badCount} bad</span>}
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
    </div>
  );
});

PlaylistSidebarItem.displayName = 'PlaylistSidebarItem';

// ── Main Modal Component ─────────────────────────────────────────────────────

interface DJPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DJPlaylistModal: React.FC<DJPlaylistModalProps> = ({ isOpen, onClose }) => {
  // ── Store bindings ──────────────────────────────────────────────────────
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const renamePlaylist = useDJPlaylistStore((s) => s.renamePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const addTracks = useDJPlaylistStore((s) => s.addTracks);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
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
  const moveSelectedTracks = useDJPlaylistStore((s) => s.moveSelectedTracks);
  const copySelectedTracks = useDJPlaylistStore((s) => s.copySelectedTracks);
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
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [communityPlaylists, setCommunityPlaylists] = useState<CloudPlaylistSummary[]>([]);
  const [showCommunity, setShowCommunity] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [importingCloudId, setImportingCloudId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
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
    overscan: 8,
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
    try {
      await analyzePlaylist(activePlaylistId, (p) => setAnalysisProgress({ ...p }));
    } finally {
      setAnalysisProgress(null);
    }
  }, [activePlaylistId, analysisProgress]);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName('');
    setIsCreating(false);
  }, [newName, createPlaylist]);

  const handleRename = useCallback((id: string) => {
    if (!editName.trim()) return;
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

          if (isAudio) {
            addTrack(activePlaylistId, {
              fileName: file.name,
              trackName: file.name.replace(/\.[^.]+$/, ''),
              format: fileExt,
              bpm: 0,
              duration: 0,
              addedAt: Date.now(),
            });
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);

            addTrack(activePlaylistId, {
              fileName: file.name,
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
            await loadUADEToDeck(engine, deckId, buffer, filename, true, undefined, track.trackName);
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
        }
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const rawBuffer = await file.arrayBuffer();
          if (isAudioFile(file.name)) {
            await engine.loadAudioToDeck(deckId, rawBuffer, file.name);
            useDJStore.getState().setDeckViewMode('vinyl');
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            await loadSongToDeck(song, file.name, deckId, rawBuffer);
          }
        } catch (err) {
          console.error(`[DJPlaylistModal] Failed to load track:`, err);
        }
      };
      input.click();
    },
    [loadSongToDeck],
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

  // ── Drop files onto playlist ──────────────────────────────────────────────

  const handleDropOnPlaylist = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activePlaylistId) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;

      setIsLoadingFile(true);
      for (const file of droppedFiles) {
        try {
          const isAudio = isAudioFile(file.name);
          const fileExt = file.name.split('.').pop()?.toUpperCase() ?? 'MOD';

          if (isAudio) {
            addTrack(activePlaylistId, {
              fileName: file.name,
              trackName: file.name.replace(/\.[^.]+$/, ''),
              format: fileExt,
              bpm: 0,
              duration: 0,
              addedAt: Date.now(),
            });
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);

            addTrack(activePlaylistId, {
              fileName: file.name,
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

  const handleSort = useCallback((mode: 'smart' | 'bpm' | 'bpm-desc' | 'key' | 'energy' | 'name') => {
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
      <div className="flex flex-col h-full">
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
                {/* Toolbar */}
                <div className="px-3 py-2 border-b border-dark-border flex items-center gap-2">
                  {/* Playlist title */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-mono font-bold text-text-primary truncate">
                      {activePlaylist.name}
                    </span>
                    <span className="text-[10px] font-mono text-text-muted/50 ml-2">
                      {activePlaylist.tracks.length} tracks
                      {totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
                    </span>
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
                  <div className="flex items-center gap-2 px-3 py-1 border-b border-dark-border bg-dark-bg/50 text-[9px] font-mono text-text-muted/40 uppercase tracking-wider select-none shrink-0">
                    <span className="w-5 shrink-0" />
                    <span className="w-6 text-right shrink-0">#</span>
                    <span className="w-4 shrink-0" />
                    <span className="flex-1 min-w-0 cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('name')}>
                      Title {columnSort?.column === 'name' && (columnSort.dir === 'asc' ? <ChevronUp size={8} className="inline" /> : <ChevronDown size={8} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-12 text-center cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('format')}>
                      Format {columnSort?.column === 'format' && (columnSort.dir === 'asc' ? <ChevronUp size={8} className="inline" /> : <ChevronDown size={8} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-8 text-right cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('bpm')}>
                      BPM {columnSort?.column === 'bpm' && (columnSort.dir === 'asc' ? <ChevronUp size={8} className="inline" /> : <ChevronDown size={8} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-10 text-center cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('key')}>
                      Key {columnSort?.column === 'key' && (columnSort.dir === 'asc' ? <ChevronUp size={8} className="inline" /> : <ChevronDown size={8} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-10 text-center cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('energy')}>
                      Energy {columnSort?.column === 'energy' && (columnSort.dir === 'asc' ? <ChevronUp size={8} className="inline" /> : <ChevronDown size={8} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-10 text-right cursor-pointer hover:text-text-muted transition-colors" onClick={() => handleColumnSort('time')}>
                      Time {columnSort?.column === 'time' && (columnSort.dir === 'asc' ? <ChevronUp size={8} className="inline" /> : <ChevronDown size={8} className="inline" />)}
                    </span>
                    <span className="shrink-0 w-6" />
                    <span className="shrink-0 w-36" />
                  </div>
                )}

                {/* Track list */}
                {filteredTracks.length === 0 ? (
                  <div
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
