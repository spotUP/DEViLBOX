// src/hooks/views/useTrackerView.ts
/**
 * useTrackerView — Shared logic hook for TrackerView (DOM) and
 * PixiTrackerView (Pixi/WebGL).
 *
 * Both views call this hook and keep only their renderer-specific markup.
 * Shared: keyboard hooks, view-mode state, editor mode, MusicLine export.
 *
 * NOT shared (kept in each view):
 *  - DOM: dialog states, keyboard shortcut handlers, mobile layout, pop-out
 *  - Pixi: window dimension calculations, panel heights, overlay visibility
 */

import { useCallback } from 'react';
import { useTrackerStore, useInstrumentStore, useUIStore, useFormatStore } from '@stores';
import { useCursorStore } from '@stores/useCursorStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useTrackerInput } from '@hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@hooks/tracker/BlockOperations';
import { exportMusicLineFile } from '@lib/export/MusicLineExporter';
import type { TrackerSong } from '@engine/TrackerReplayer';

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTrackerView() {
  // ── Keyboard hooks — attach window event listeners; no DOM rendered ───────
  useTrackerInput();
  const blockOps = useBlockOperations();

  // ── View mode ─────────────────────────────────────────────────────────────
  const viewMode = useUIStore((s) => s.trackerViewMode);
  const rawSetViewMode = useUIStore((s) => s.setTrackerViewMode);

  // ── Grid channel ──────────────────────────────────────────────────────────
  const gridChannelIndex = useUIStore((s) => s.gridChannelIndex);
  const setGridChannelIndex = useUIStore((s) => s.setGridChannelIndex);

  // When switching to grid mode, auto-sync grid channel to cursor position
  const setViewMode = useCallback((mode: typeof viewMode) => {
    if (mode === 'grid') {
      const cursorCh = useCursorStore.getState().cursor.channelIndex;
      setGridChannelIndex(cursorCh);
    }
    rawSetViewMode(mode);
  }, [rawSetViewMode, setGridChannelIndex]);

  // ── Editor mode ───────────────────────────────────────────────────────────
  const editorMode = useFormatStore((s) => s.editorMode);

  // ── MusicLine export ──────────────────────────────────────────────────────
  const handleExportML = useCallback(() => {
    const s = useTrackerStore.getState();
    const t = useTransportStore.getState();
    const f = useFormatStore.getState();
    const song: TrackerSong = {
      name: useProjectStore.getState().metadata.name || 'MusicLine Song',
      format: 'ML',
      patterns: s.patterns,
      instruments: useInstrumentStore.getState().instruments,
      songPositions: s.patternOrder,
      songLength: s.patternOrder.length,
      restartPosition: 0,
      numChannels: s.patterns[0]?.channels.length ?? 4,
      initialSpeed: t.speed,
      initialBPM: t.bpm,
      channelTrackTables: f.channelTrackTables ?? undefined,
      channelSpeeds: f.channelSpeeds ?? undefined,
      channelGrooves: f.channelGrooves ?? undefined,
    };
    const data = exportMusicLineFile(song);
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.ml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    // View mode
    viewMode,
    setViewMode,
    // Grid channel
    gridChannelIndex,
    setGridChannelIndex,
    // Editor mode
    editorMode,
    // Block operations — DOM view uses the return value for AdvancedEditModal
    blockOps,
    // Handlers
    handleExportML,
  };
}
