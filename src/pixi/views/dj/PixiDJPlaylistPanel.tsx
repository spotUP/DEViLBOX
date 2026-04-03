/**
 * PixiDJPlaylistPanel — GL-native DJ playlist panel for the Pixi.js scene graph.
 *
 * GL port of src/components/dj/DJPlaylistPanel.tsx.
 * Renders playlist tabs, track list with deck-load buttons, reorder controls,
 * and add-tracks via glFilePicker — entirely in Pixi (no DOM).
 */

import React, { useState, useCallback, useMemo } from 'react';
import { usePixiTheme } from '../../theme';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiList } from '../../components/PixiList';
import { pickFiles } from '../../services/glFilePicker';
import {
  useDJPlaylistStore,
  type PlaylistTrack,
} from '@/stores/useDJPlaylistStore';
import { useDJStore, type DeckId } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';

// ── Layout constants ─────────────────────────────────────────────────────────

const PANEL_H = 280;
const HEADER_H = 30;
const TABS_H = 28;
const TRACK_ROW_H = 32;
const PAD = 6;
const ACCEPT_AUDIO = 'audio/*,.mod,.xm,.s3m,.it,.mptm,.stm,.669,.med,.oct,.okt,.far,.ult,.dmf,.fur';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function trackSublabel(t: PlaylistTrack): string {
  const parts = [t.format];
  if (t.bpm > 0) parts.push(`${t.bpm} BPM`);
  if (t.duration > 0) parts.push(formatDuration(t.duration));
  return parts.join(' · ');
}

// ── Component ────────────────────────────────────────────────────────────────

interface PixiDJPlaylistPanelProps {
  visible?: boolean;
  onClose?: () => void;
}

export const PixiDJPlaylistPanel: React.FC<PixiDJPlaylistPanelProps> = ({
  visible = true,
  onClose,
}) => {
  const theme = usePixiTheme();

  // Store state
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  // Local state
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // ── Playlist CRUD ──────────────────────────────────────────────────────────

  const handleNewPlaylist = useCallback(() => {
    const name = `Playlist ${playlists.length + 1}`;
    createPlaylist(name);
  }, [playlists.length, createPlaylist]);

  const handleDeletePlaylist = useCallback(() => {
    if (activePlaylistId) deletePlaylist(activePlaylistId);
  }, [activePlaylistId, deletePlaylist]);

  // ── Add files ──────────────────────────────────────────────────────────────

  const handleAddTracks = useCallback(async () => {
    if (!activePlaylistId) return;
    const files = await pickFiles({ accept: ACCEPT_AUDIO });
    if (files.length === 0) return;

    setIsLoadingFile(true);
    for (const file of files) {
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
        console.error(`[PixiDJPlaylistPanel] Failed to process ${file.name}:`, err);
      }
    }
    setIsLoadingFile(false);
  }, [activePlaylistId, addTrack]);

  // ── Load to deck ───────────────────────────────────────────────────────────

  const loadSongToDeck = useCallback(
    async (
      song: import('@/engine/TrackerReplayer').TrackerSong,
      fileName: string,
      deckId: DeckId,
      rawBuffer?: ArrayBuffer,
    ) => {
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
          await engine.loadAudioToDeck(
            deckId, result.wavData, fileName,
            song.name || fileName, result.analysis?.bpm || bpmResult.bpm, song,
          );
          useDJStore.getState().setDeckViewMode('visualizer');
        } catch (err) {
          console.error(`[PixiDJPlaylistPanel] Pipeline failed for ${fileName}:`, err);
        }
      } else {
        console.warn(`[PixiDJPlaylistPanel] Cannot load ${fileName}: missing raw buffer`);
      }
    },
    [],
  );

  const loadTrackToDeck = useCallback(
    async (track: PlaylistTrack, deckId: DeckId) => {
      const engine = getDJEngine();

      // Modland tracks: re-download
      if (track.fileName.startsWith('modland:')) {
        const modlandPath = track.fileName.slice('modland:'.length);
        try {
          const { downloadModlandFile } = await import('@/lib/modlandApi');
          const buffer = await downloadModlandFile(modlandPath);
          const filename = modlandPath.split('/').pop() || 'download.mod';

          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
            useDJStore.getState().setDeckViewMode('vinyl');
          } else {
            const blob = new File([buffer], filename, { type: 'application/octet-stream' });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            await loadSongToDeck(song, track.fileName, deckId, buffer);
          }
          return;
        } catch (err) {
          console.error(`[PixiDJPlaylistPanel] Modland re-download failed:`, err);
        }
      }

      // Prompt user to select file via GL picker
      const file = await pickFiles({ accept: ACCEPT_AUDIO });
      const selected = file[0];
      if (!selected) return;
      try {
        const rawBuffer = await selected.arrayBuffer();
        if (isAudioFile(selected.name)) {
          await engine.loadAudioToDeck(deckId, rawBuffer, selected.name);
          useDJStore.getState().setDeckViewMode('vinyl');
        } else {
          const song = await parseModuleToSong(selected);
          cacheSong(selected.name, song);
          await loadSongToDeck(song, selected.name, deckId, rawBuffer);
        }
      } catch (err) {
        console.error(`[PixiDJPlaylistPanel] Failed to load track:`, err);
      }
    },
    [loadSongToDeck],
  );

  // ── Reorder helpers ────────────────────────────────────────────────────────

  const handleMoveUp = useCallback(
    (idx: number) => {
      if (!activePlaylistId || idx <= 0) return;
      reorderTrack(activePlaylistId, idx, idx - 1);
    },
    [activePlaylistId, reorderTrack],
  );

  const handleMoveDown = useCallback(
    (idx: number) => {
      if (!activePlaylistId || !activePlaylist) return;
      if (idx >= activePlaylist.tracks.length - 1) return;
      reorderTrack(activePlaylistId, idx, idx + 1);
    },
    [activePlaylistId, activePlaylist, reorderTrack],
  );

  const handleRemoveTrack = useCallback(
    (idx: number) => {
      if (activePlaylistId) removeTrack(activePlaylistId, idx);
    },
    [activePlaylistId, removeTrack],
  );

  // ── Track list items for PixiList ──────────────────────────────────────────

  const trackListItems = useMemo(() => {
    if (!activePlaylist) return [];
    return activePlaylist.tracks.map((t, i) => ({
      id: `${t.fileName}-${i}`,
      label: `${(i + 1).toString().padStart(2, ' ')}  ${t.played ? '[P] ' : ''}${t.trackName}`,
      sublabel: trackSublabel(t),
      iconName: 'diskio',
      iconColor: t.played ? 0x22c55e : undefined, // green icon for played tracks
      actions: [
        { label: '1', color: 0x3b82f6, onClick: () => loadTrackToDeck(t, 'A') },
        { label: '2', color: 0xef4444, onClick: () => loadTrackToDeck(t, 'B') },
        ...(thirdDeckActive ? [{ label: '3', color: 0x22c55e, onClick: () => loadTrackToDeck(t, 'C' as DeckId) }] : []),
        { label: 'X', color: 0x666666, onClick: () => handleRemoveTrack(i) },
      ],
    }));
  }, [activePlaylist, thirdDeckActive, loadTrackToDeck, handleRemoveTrack]);

  // Find selected track index
  const selectedIdx = useMemo(() => {
    if (!selectedTrackId || !activePlaylist) return -1;
    return trackListItems.findIndex((item) => item.id === selectedTrackId);
  }, [selectedTrackId, trackListItems, activePlaylist]);

  // ── Dimensions ─────────────────────────────────────────────────────────────

  const listH = PANEL_H - HEADER_H - TABS_H - TRACK_ROW_H - PAD * 3;

  if (!visible) return null;

  return (
    <layoutContainer
      eventMode="static"
      layout={{
        width: '100%' as unknown as number,
        height: PANEL_H,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        padding: PAD,
        gap: 2,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <PixiLabel
          text="PLAYLISTS"
          size="xs"
          weight="bold"
          font="mono"
          color="accent"
          layout={{ marginLeft: 2 }}
        />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiButton
            label="+ New"
            variant="ghost"
            size="sm"
            width={52}
            height={22}
            onClick={handleNewPlaylist}
          />
          {activePlaylistId && (
            <PixiButton
              label="Delete"
              variant="ghost"
              size="sm"
              width={52}
              height={22}
              color="red"
              onClick={handleDeletePlaylist}
            />
          )}
          {onClose && (
            <PixiButton icon="close" label="" variant="ghost" size="sm" width={24} height={22} onClick={onClose} />
          )}
        </layoutContainer>
      </layoutContainer>

      {/* ── Playlist tabs ───────────────────────────────────────────────── */}
      {playlists.length > 0 && (
        <layoutContainer
          layout={{
            height: TABS_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            overflow: 'hidden',
          }}
        >
          {playlists.map((pl) => (
            <PixiButton
              key={pl.id}
              label={`${pl.name} (${pl.tracks.length})`}
              variant="ft2"
              size="sm"
              height={22}
              active={activePlaylistId === pl.id}
              onClick={() => setActivePlaylist(pl.id)}
            />
          ))}
        </layoutContainer>
      )}

      {/* ── Toolbar: Add + reorder + remove ─────────────────────────────── */}
      {activePlaylist && (
        <layoutContainer
          layout={{
            height: TRACK_ROW_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <PixiButton
            label={isLoadingFile ? '...' : '+ Add Tracks'}
            variant="default"
            size="sm"
            width={90}
            height={22}
            disabled={isLoadingFile}
            onClick={handleAddTracks}
          />
          {selectedIdx >= 0 && (
            <>
              <PixiButton
                label="▲"
                variant="ghost"
                size="sm"
                width={24}
                height={22}
                disabled={selectedIdx <= 0}
                onClick={() => handleMoveUp(selectedIdx)}
              />
              <PixiButton
                label="▼"
                variant="ghost"
                size="sm"
                width={24}
                height={22}
                disabled={!activePlaylist || selectedIdx >= activePlaylist.tracks.length - 1}
                onClick={() => handleMoveDown(selectedIdx)}
              />
              <PixiButton
                icon="close"
                label=""
                variant="ghost"
                size="sm"
                width={24}
                height={22}
                color="red"
                onClick={() => handleRemoveTrack(selectedIdx)}
              />
            </>
          )}

          {/* Spacer */}
          <layoutContainer layout={{ flex: 1 }} />

          {/* Deck load buttons (shown when a track is selected) */}
          {selectedIdx >= 0 && activePlaylist && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 3 }}>
              <PixiButton
                label="Deck 1"
                variant="ft2"
                size="sm"
                color="blue"
                width={50}
                height={22}
                onClick={() => loadTrackToDeck(activePlaylist.tracks[selectedIdx], 'A')}
              />
              <PixiButton
                label="Deck 2"
                variant="ft2"
                size="sm"
                color="red"
                width={50}
                height={22}
                onClick={() => loadTrackToDeck(activePlaylist.tracks[selectedIdx], 'B')}
              />
              {thirdDeckActive && (
                <PixiButton
                  label="Deck 3"
                  variant="ft2"
                  size="sm"
                  color="green"
                  width={50}
                  height={22}
                  onClick={() => loadTrackToDeck(activePlaylist.tracks[selectedIdx], 'C')}
                />
              )}
            </layoutContainer>
          )}
        </layoutContainer>
      )}

      {/* ── Track list ──────────────────────────────────────────────────── */}
      {activePlaylist ? (
        activePlaylist.tracks.length > 0 ? (
          <PixiList
            items={trackListItems}
            width={600}
            height={listH > 0 ? listH : 100}
            itemHeight={26}
            selectedId={selectedTrackId}
            onSelect={setSelectedTrackId}
            layout={{ flex: 1 }}
          />
        ) : (
          <layoutContainer
            layout={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <PixiLabel text="Empty playlist — add tracks above" size="xs" color="textMuted" />
          </layoutContainer>
        )
      ) : (
        <layoutContainer
          layout={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <PixiLabel text="Create a playlist to get started" size="xs" color="textMuted" />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

export default PixiDJPlaylistPanel;
