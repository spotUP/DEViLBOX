/**
 * DJPlaylistPanel - Playlist manager for the DJ view.
 *
 * Create, rename, delete playlists. Add tracks from loaded files.
 * Click a track to load it to a deck. Reorder via drag handles.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  ListMusic,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  GripVertical,
  Music,
} from 'lucide-react';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
} from '@/stores/useDJPlaylistStore';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface DJPlaylistPanelProps {
  onClose?: () => void;
}

export const DJPlaylistPanel: React.FC<DJPlaylistPanelProps> = ({ onClose }) => {
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const renamePlaylist = useDJPlaylistStore((s) => s.renamePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  // ── Playlist CRUD ────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName('');
    setIsCreating(false);
  }, [newName, createPlaylist]);

  const handleRename = useCallback(
    (id: string) => {
      if (!editName.trim()) return;
      renamePlaylist(id, editName.trim());
      setEditingId(null);
    },
    [editName, renamePlaylist],
  );

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
            const track: PlaylistTrack = {
              fileName: file.name,
              trackName: file.name.replace(/\.[^.]+$/, ''),
              format: fileExt,
              bpm: 0,
              duration: 0,
              addedAt: Date.now(),
            };
            addTrack(activePlaylistId, track);
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);

            const track: PlaylistTrack = {
              fileName: file.name,
              trackName: song.name || file.name,
              format: fileExt,
              bpm: bpmResult.bpm,
              duration,
              addedAt: Date.now(),
            };

            addTrack(activePlaylistId, track);
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Failed to process ${file.name}:`, err);
        }
      }

      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [activePlaylistId, addTrack],
  );

  // ── Load track to deck (uses song cache, falls back to file picker) ─────

  const loadSongToDeck = useCallback(
    async (song: import('@/engine/TrackerReplayer').TrackerSong, fileName: string, deckId: 'A' | 'B' | 'C', rawBuffer?: ArrayBuffer) => {
      const engine = getDJEngine();
      const bpmResult = detectBPM(song);

      // We MUST have the raw buffer to render
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
          await engine.loadAudioToDeck(deckId, result.wavData, fileName, song.name || fileName, result.analysis?.bpm || bpmResult.bpm);
          console.log(`[DJPlaylistPanel] Loaded ${fileName} in audio mode (skipped tracker bugs)`);
        } catch (err) {
          console.error(`[DJPlaylistPanel] Pipeline failed for ${fileName}:`, err);
        }
      } else {
        console.warn(`[DJPlaylistPanel] Cannot load ${fileName}: missing raw buffer for rendering`);
      }
    },
    [],
  );

  const loadTrackToDeck = useCallback(
    async (track: PlaylistTrack, deckId: 'A' | 'B' | 'C') => {
      const engine = getDJEngine();

      // Modland tracks: auto re-download from server to get the raw buffer
      if (track.fileName.startsWith('modland:')) {
        const modlandPath = track.fileName.slice('modland:'.length);
        try {
          const { downloadModlandFile } = await import('@/lib/modlandApi');
          const buffer = await downloadModlandFile(modlandPath);
          const filename = modlandPath.split('/').pop() || 'download.mod';
          
          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            await loadSongToDeck(song, track.fileName, deckId, buffer);
          }
          return;
        } catch (err) {
          console.error(`[DJPlaylistPanel] Modland re-download failed:`, err);
        }
      }

      // Prompt user to select the file to get the raw buffer
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
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            await loadSongToDeck(song, file.name, deckId, rawBuffer);
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Failed to load track:`, err);
        }
      };
      input.click();
    },
    [loadSongToDeck],
  );

  // ── Drag reorder ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index || !activePlaylistId) return;
      reorderTrack(activePlaylistId, dragIndex, index);
      setDragIndex(index);
    },
    [dragIndex, activePlaylistId, reorderTrack],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  // ── Drop files from file browser onto playlist ───────────────────────────

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
          console.error(`[DJPlaylistPanel] Drop process error:`, err);
        }
      }
      setIsLoadingFile(false);
    },
    [activePlaylistId, addTrack],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic size={14} className="text-accent-primary" />
          <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
            Playlists
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-text-secondary
                         bg-dark-bgTertiary border border-dark-borderLight rounded
                         hover:bg-dark-bgHover hover:text-text-primary transition-colors"
            >
              <Plus size={10} />
              New
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                placeholder="Playlist name..."
                className="w-32 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight
                           rounded text-text-primary placeholder:text-text-muted/40"
              />
              <button onClick={handleCreate} className="p-0.5 text-green-400 hover:text-green-300">
                <Check size={12} />
              </button>
              <button onClick={() => setIsCreating(false)} className="p-0.5 text-text-muted hover:text-text-primary">
                <X size={12} />
              </button>
            </div>
          )}
          {onClose && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Playlist selector */}
      {playlists.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className={`group flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                activePlaylistId === pl.id
                  ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                  : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
              }`}
              onClick={() => setActivePlaylist(pl.id)}
            >
              {editingId === pl.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(pl.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={() => handleRename(pl.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 px-1 bg-dark-bg border border-dark-borderLight rounded text-[10px] text-text-primary"
                />
              ) : (
                <>
                  <span className="truncate max-w-[80px]">{pl.name}</span>
                  <span className="text-text-muted/40">{pl.tracks.length}</span>
                  <Edit3
                    size={9}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(pl.id);
                      setEditName(pl.name);
                    }}
                  />
                  <Trash2
                    size={9}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-400 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlaylist(pl.id);
                    }}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active playlist tracks */}
      {activePlaylist ? (
        <div
          className="flex-1 overflow-y-auto min-h-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnPlaylist}
        >
          {/* Add to playlist button */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingFile}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-text-secondary
                         bg-dark-bgTertiary border border-dark-borderLight rounded
                         hover:bg-dark-bgHover hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <Plus size={10} />
              {isLoadingFile ? 'Loading...' : 'Add Tracks'}
            </button>
            <span className="text-[9px] font-mono text-text-muted/40">
              or drop files here
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              onChange={handleAddFiles}
              className="hidden"
            />
          </div>

          {activePlaylist.tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-text-muted">
              <Music size={20} className="mb-1.5 opacity-30" />
              <p className="text-[10px] font-mono">Empty playlist</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {activePlaylist.tracks.map((track, i) => (
                <div
                  key={`${track.fileName}-${i}`}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded border transition-colors group ${
                    dragIndex === i
                      ? 'bg-accent-primary/10 border-accent-primary/30'
                      : 'bg-dark-bg border-dark-borderLight hover:border-dark-border'
                  }`}
                >
                  {/* Drag handle */}
                  <GripVertical
                    size={10}
                    className="text-text-muted/30 group-hover:text-text-muted/60 shrink-0 cursor-grab"
                  />

                  {/* Track number */}
                  <span className="text-[9px] font-mono text-text-muted/40 w-4 text-right shrink-0">
                    {i + 1}
                  </span>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary text-[11px] font-mono truncate">
                      {track.trackName}
                    </div>
                    <div className="flex gap-2 text-[9px] text-text-muted/50 font-mono">
                      <span>{track.format}</span>
                      {track.bpm > 0 && <span>{track.bpm} BPM</span>}
                      {track.duration > 0 && <span>{formatDuration(track.duration)}</span>}
                    </div>
                  </div>

                  {/* Deck load buttons */}
                  <button
                    onClick={() => loadTrackToDeck(track, 'A')}
                    className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded
                               bg-blue-900/30 text-blue-400 border border-blue-800/50
                               hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                               opacity-0 group-hover:opacity-100"
                    title="Load to Deck 1"
                  >
                    1
                  </button>
                  <button
                    onClick={() => loadTrackToDeck(track, 'B')}
                    className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded
                               bg-red-900/30 text-red-400 border border-red-800/50
                               hover:bg-red-800/40 hover:text-red-300 transition-colors
                               opacity-0 group-hover:opacity-100"
                    title="Load to Deck 2"
                  >
                    2
                  </button>
                  {useDJStore.getState().thirdDeckActive && (
                    <button
                      onClick={() => loadTrackToDeck(track, 'C')}
                      className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded
                                 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50
                                 hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors
                                 opacity-0 group-hover:opacity-100"
                      title="Load to Deck 3"
                    >
                      3
                    </button>
                  )}
                  <button
                    onClick={() => removeTrack(activePlaylist.id, i)}
                    className="p-0.5 text-text-muted hover:text-accent-error transition-colors
                               opacity-0 group-hover:opacity-100"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-text-muted">
          <ListMusic size={24} className="mb-2 opacity-30" />
          <p className="text-[10px] font-mono">Create a playlist to get started</p>
        </div>
      )}
    </div>
  );
};
