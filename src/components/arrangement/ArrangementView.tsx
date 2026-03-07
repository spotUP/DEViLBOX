/**
 * ArrangementView - Top-level container for the arrangement timeline
 *
 * Flex column: toolbar → body (flex row: track headers + canvas)
 * Manages keyboard shortcuts and coordinates sub-components.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores';
import { useMixerStore } from '@stores/useMixerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import { useArrangementKeyboard } from '@/hooks/arrangement/useArrangementKeyboard';
import { ArrangementToolbar } from './ArrangementToolbar';
import { TrackHeaderPanel } from './TrackHeaderPanel';
import { ArrangementCanvas } from './ArrangementCanvas';
import { ArrangementContextMenu } from './ArrangementContextMenu';
import type { TimelineAutomationPoint } from '@/types/arrangement';

/**
 * Linearly interpolate automation value at a given row.
 * - Flat before the first point (returns first point's value).
 * - Flat after the last point (returns last point's value).
 * - Linear interpolation between surrounding points.
 * Points must be sorted by row (ascending).
 */
function getAutomationValue(points: TimelineAutomationPoint[], row: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;

  // Before first point: hold first value
  if (row <= points[0].row) return points[0].value;

  // After last point: hold last value
  if (row >= points[points.length - 1].row) return points[points.length - 1].value;

  // Find surrounding pair
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (row >= a.row && row <= b.row) {
      const span = b.row - a.row;
      if (span === 0) return a.value;
      const t = (row - a.row) / span;
      return a.value + t * (b.value - a.value);
    }
  }

  return points[points.length - 1].value;
}

export const ArrangementView: React.FC = () => {
  // Register keyboard shortcuts for arrangement view
  useArrangementKeyboard();

  const {
    tracks, groups, automationLanes, view,
    setTool,
    selectedClipIds, removeClips, duplicateClips,
    clearSelection, selectAllClipsOnTrack,
    pushUndo, undo, redo,
    importFromPatternOrder,
    isArrangementMode,
    setIsArrangementMode,
    setClipContextMenu,
  } = useArrangementStore();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const hasMigratedRef = useRef(false);
  const hasZoomedRef = useRef(false);

  // Auto-migrate from pattern order when arrangement is first opened with no data
  useEffect(() => {
    if (hasMigratedRef.current) return;
    if (tracks.length > 0) return; // Already has arrangement data

    const { patternOrder, patterns } = useTrackerStore.getState();
    if (patterns.length > 0 && patternOrder.length > 0) {
      hasMigratedRef.current = true;
      importFromPatternOrder(patternOrder, patterns);
      notify.success('Converted pattern order to arrangement');
    }
  }, [tracks.length, importFromPatternOrder]);

  // Zoom-to-fit on initial load
  useEffect(() => {
    if (hasZoomedRef.current || tracks.length === 0) return;
    hasZoomedRef.current = true;
    useArrangementStore.getState().zoomToFit();
  }, [tracks.length]);

  // Enable arrangement mode when view is active
  useEffect(() => {
    if (!isArrangementMode && tracks.length > 0) {
      setIsArrangementMode(true);
      notify.info('Arrangement mode enabled');
    }
  }, [isArrangementMode, setIsArrangementMode, tracks.length]);

  // Sync playback position with arrangement and apply automation lanes
  useEffect(() => {
    if (!isPlaying || !isArrangementMode) return;

    // Immediately sync playback row on mount/view-switch so the playhead
    // doesn't stay stale until the next replayer row-change fires.
    const initialGlobalRow = useTransportStore.getState().currentGlobalRow;
    useArrangementStore.getState().setPlaybackRow(initialGlobalRow);

    const rafId = requestAnimationFrame(function updatePlayback() {
      // Read current global row from store state (not reactive — avoids 50Hz re-renders)
      const globalRow = useTransportStore.getState().currentGlobalRow;

      // Update arrangement playback position
      useArrangementStore.getState().setPlaybackRow(globalRow);

      // Apply automation lanes
      const { automationLanes, tracks } = useArrangementStore.getState();
      const sortedTracks = [...tracks].sort((a, b) => a.index - b.index);
      for (const lane of automationLanes) {
        if (!lane.enabled || lane.points.length === 0) continue;
        const value = getAutomationValue(lane.points, globalRow);

        if (lane.parameter === 'volume') {
          const chIdx = sortedTracks.findIndex(t => t.id === lane.trackId);
          if (chIdx >= 0) {
            useMixerStore.getState().setChannelVolume(chIdx, value);
          }
        } else if (lane.parameter === 'pan') {
          const chIdx = sortedTracks.findIndex(t => t.id === lane.trackId);
          if (chIdx >= 0) {
            useMixerStore.getState().setChannelPan(chIdx, value);
          }
        } else if (
          lane.parameter === 'cutoff' ||
          lane.parameter === 'resonance' ||
          lane.parameter === 'envMod'
        ) {
          // Synth parameter: find the instrument assigned to this track
          const track = tracks.find(t => t.id === lane.trackId);
          const instrumentId = track?.instrumentId ?? null;
          if (instrumentId !== null) {
            useInstrumentStore.getState().updateInstrument(instrumentId, {
              tb303: { [lane.parameter]: value },
            });
          }
        }
      }

      // Continue updating while playing
      if (useTransportStore.getState().isPlaying && useArrangementStore.getState().isArrangementMode) {
        requestAnimationFrame(updatePlayback);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isArrangementMode]);

  const layoutEntries = useMemo(() => {
    const sorted = tracks
      .slice()
      .sort((a, b) => a.index - b.index);
    const result: Array<{
      trackId: string;
      trackIndex: number;
      y: number;
      height: number;
      bodyHeight: number;
      automationY: number;
      automationHeight: number;
      visible: boolean;
    }> = [];
    let runningY = 0;
    const TRACK_SEPARATOR = 1;
    const AUTOMATION_LANE_HEIGHT = 40;

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const group = t.groupId ? groups.find(g => g.id === t.groupId) : null;
      const visible = !group || (!group.collapsed && !group.folded);

      // Automation
      const trackAutoLanes = automationLanes.filter(l => l.trackId === t.id && l.visible);
      const automationHeight = t.automationVisible ? trackAutoLanes.length * AUTOMATION_LANE_HEIGHT : 0;

      const bodyHeight = t.collapsed ? 24 : t.height;
      const totalHeight = bodyHeight + automationHeight;

      result.push({
        trackId: t.id,
        trackIndex: i,
        y: runningY,
        height: visible ? totalHeight : 0,
        bodyHeight: visible ? bodyHeight : 0,
        automationY: runningY + (visible ? bodyHeight : 0),
        automationHeight: visible ? automationHeight : 0,
        visible,
      });
      if (visible) runningY += totalHeight + TRACK_SEPARATOR;
    }
    return result;
  }, [tracks, groups, automationLanes]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if focused in an input
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;

    const isMod = e.ctrlKey || e.metaKey;

    // Tool shortcuts
    if (!isMod && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'v': setTool('select'); e.preventDefault(); return;
        case 'd': setTool('draw'); e.preventDefault(); return;
        case 'e': setTool('erase'); e.preventDefault(); return;
        case 's': setTool('split'); e.preventDefault(); return;
      }
    }

    // Delete selection
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedClipIds.size > 0) {
        pushUndo();
        removeClips([...selectedClipIds]);
        e.preventDefault();
        return;
      }
    }

    // Ctrl+A: Select all on current track
    if (isMod && e.key === 'a') {
      const selectedTrackId = useArrangementStore.getState().selectedTrackId;
      if (selectedTrackId) {
        selectAllClipsOnTrack(selectedTrackId);
        e.preventDefault();
        return;
      }
    }

    // Ctrl+D: Duplicate
    if (isMod && e.key === 'd') {
      if (selectedClipIds.size > 0) {
        pushUndo();
        duplicateClips([...selectedClipIds]);
        e.preventDefault();
        return;
      }
    }

    // Ctrl+Z: Undo, Ctrl+Shift+Z: Redo
    if (isMod && e.key === 'z' && !e.shiftKey) {
      undo();
      e.preventDefault();
      return;
    }
    if (isMod && e.key === 'z' && e.shiftKey) {
      redo();
      e.preventDefault();
      return;
    }

    // Escape: Clear selection
    if (e.key === 'Escape') {
      clearSelection();
      setClipContextMenu(null);
      e.preventDefault();
    }
  }, [selectedClipIds, setTool, removeClips, duplicateClips, clearSelection, selectAllClipsOnTrack, pushUndo, undo, redo, setClipContextMenu]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Context menu handler — only show if exactly one clip is selected
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedClipIds.size !== 1) return;
    const clipId = [...selectedClipIds][0];
    setClipContextMenu({ clipId, screenX: e.clientX, screenY: e.clientY });
  }, [selectedClipIds, setClipContextMenu]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-dark-bg"
      onContextMenu={handleContextMenu}
    >
      {/* Toolbar */}
      <ArrangementToolbar />

      {/* Body: Track headers + Canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track header panel (DOM, syncs vertical scroll with canvas) */}
        <TrackHeaderPanel
          tracks={tracks}
          groups={groups}
          entries={layoutEntries}
          scrollY={view.scrollY}
        />

        {/* Main canvas area */}
        <ArrangementCanvas />
      </div>

      {/* Context menu — reads position/clipId from store */}
      <ArrangementContextMenu />
    </div>
  );
};
