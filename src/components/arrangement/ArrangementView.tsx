/**
 * ArrangementView - Top-level container for the arrangement timeline
 *
 * Flex column: toolbar → body (flex row: track headers + canvas)
 * Manages keyboard shortcuts and coordinates sub-components.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { ArrangementToolbar } from './ArrangementToolbar';
import { TrackHeaderPanel } from './TrackHeaderPanel';
import { ArrangementCanvas } from './ArrangementCanvas';
import { ArrangementContextMenu } from './ArrangementContextMenu';

export const ArrangementView: React.FC = () => {
  const {
    tracks, groups, view,
    setTool,
    selectedClipIds, removeClips, duplicateClips,
    clearSelection, selectAllClipsOnTrack,
    pushUndo, undo, redo,
    importFromPatternOrder,
  } = useArrangementStore();
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
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const group = t.groupId ? groups.find(g => g.id === t.groupId) : null;
      const visible = !group || !group.collapsed;
      const bodyHeight = visible ? t.height : 0;
      result.push({
        trackId: t.id,
        trackIndex: i,
        y: runningY,
        height: bodyHeight,
        bodyHeight,
        automationY: runningY + bodyHeight,
        automationHeight: 0,
        visible,
      });
      if (visible) runningY += t.height;
    }
    return result;
  }, [tracks, groups]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number; y: number; clipId: string | null; trackId: string | null; row: number;
  } | null>(null);

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
      setCtxMenu(null);
      e.preventDefault();
    }
  }, [selectedClipIds, setTool, removeClips, duplicateClips, clearSelection, selectAllClipsOnTrack, pushUndo, undo, redo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // For now, show basic context menu at click position
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      clipId: selectedClipIds.size === 1 ? [...selectedClipIds][0] : null,
      trackId: null,
      row: 0,
    });
  }, [selectedClipIds]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClick = () => setCtxMenu(null);
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [ctxMenu]);

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

      {/* Context menu */}
      {ctxMenu && (
        <ArrangementContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          clipId={ctxMenu.clipId}
          trackId={ctxMenu.trackId}
          row={ctxMenu.row}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
