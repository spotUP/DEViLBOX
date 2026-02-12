/**
 * ArrangementKeyboardShortcuts - Ableton Live-style keyboard shortcuts
 *
 * Essential shortcuts:
 * - Cmd+D: Duplicate selected clips
 * - Cmd+J: Consolidate selected clips
 * - Cmd+E: Split clips at playhead
 * - Cmd+L: Toggle loop region for selection
 * - Delete: Delete selected clips
 * - Cmd+A: Select all clips
 * - Cmd+Shift+A: Deselect all
 * - Tab: Toggle draw mode
 * - 1-9: Zoom presets
 */

import { useEffect } from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';

const ZOOM_PRESETS = [0.5, 1, 2, 4, 8, 12, 16, 24, 32];

export const useArrangementKeyboardShortcuts = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useArrangementStore.getState();
      const isMod = e.metaKey || e.ctrlKey;

      // Prevent default for handled shortcuts
      const preventDefault = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Cmd+D: Duplicate selected clips
      if (isMod && e.key === 'd' && !e.shiftKey) {
        if (state.selectedClipIds.size > 0) {
          preventDefault();
          const newIds = state.duplicateClips([...state.selectedClipIds]);
          state.clearSelection();
          state.selectClips(newIds);
        }
        return;
      }

      // Cmd+J: Consolidate selected clips (merge into one)
      if (isMod && e.key === 'j') {
        if (state.selectedClipIds.size > 1) {
          preventDefault();
          consolidateClips(state);
        }
        return;
      }

      // Cmd+E: Split clips at playhead
      if (isMod && e.key === 'e') {
        if (state.selectedClipIds.size > 0) {
          preventDefault();
          const playbackRow = state.playbackRow;
          for (const clipId of state.selectedClipIds) {
            state.splitClip(clipId, playbackRow);
          }
        }
        return;
      }

      // Cmd+L: Toggle loop region for selection
      if (isMod && e.key === 'l') {
        preventDefault();
        toggleLoopRegionForSelection(state);
        return;
      }

      // Cmd+A: Select all clips
      if (isMod && e.key === 'a' && !e.shiftKey) {
        preventDefault();
        const allClipIds = state.clips.map(c => c.id);
        state.selectClips(allClipIds);
        return;
      }

      // Cmd+Shift+A: Deselect all
      if (isMod && e.shiftKey && e.key === 'a') {
        preventDefault();
        state.clearSelection();
        return;
      }

      // Delete: Delete selected clips
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        if (state.selectedClipIds.size > 0) {
          preventDefault();
          state.removeClips([...state.selectedClipIds]);
        }
        return;
      }

      // Tab: Toggle draw mode
      if (e.key === 'Tab') {
        preventDefault();
        state.setTool(state.tool === 'draw' ? 'select' : 'draw');
        return;
      }

      // 1-9: Zoom presets
      if (e.key >= '1' && e.key <= '9' && !isMod && !e.shiftKey) {
        const index = parseInt(e.key) - 1;
        if (index < ZOOM_PRESETS.length) {
          preventDefault();
          state.setPixelsPerRow(ZOOM_PRESETS[index]);
        }
        return;
      }

      // 0: Zoom to fit
      if (e.key === '0' && !isMod) {
        preventDefault();
        state.zoomToFit();
        return;
      }

      // Cmd+Shift+M: Insert MIDI clip at playhead
      if (isMod && e.shiftKey && e.key === 'm') {
        preventDefault();
        insertClipAtPlayhead(state);
        return;
      }

      // Arrow keys: Navigate playhead
      if (e.key === 'ArrowLeft' && !isMod) {
        preventDefault();
        const snap = state.view.snapDivision || 1;
        state.setPlaybackRow(Math.max(0, state.playbackRow - snap));
        return;
      }

      if (e.key === 'ArrowRight' && !isMod) {
        preventDefault();
        const snap = state.view.snapDivision || 1;
        state.setPlaybackRow(state.playbackRow + snap);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};

/**
 * Consolidate selected clips into a single clip
 */
function consolidateClips(state: ReturnType<typeof useArrangementStore.getState>) {
  const selectedClips = state.clips.filter(c => state.selectedClipIds.has(c.id));
  if (selectedClips.length < 2) return;

  // Find time range
  const minRow = Math.min(...selectedClips.map(c => c.startRow));
  const maxRow = Math.max(...selectedClips.map(c => {
    const len = c.clipLengthRows ?? 64;
    return c.startRow + len;
  }));

  // Find common track (use first clip's track)
  const trackId = selectedClips[0].trackId;

  // Create consolidated pattern (simplified - would need actual pattern merging)
  const patterns = useTrackerStore.getState().patterns;
  if (patterns.length === 0) return;

  // Create new clip spanning the full range
  const newClipId = state.addClip({
    patternId: selectedClips[0].patternId, // Use first pattern
    trackId,
    startRow: minRow,
    offsetRows: 0,
    clipLengthRows: maxRow - minRow,
    sourceChannelIndex: 0,
    color: selectedClips[0].color,
    muted: false,
  });

  // Remove original clips
  state.removeClips([...state.selectedClipIds]);

  // Select new clip
  state.clearSelection();
  state.selectClip(newClipId);
}

/**
 * Toggle loop region to match selection
 */
function toggleLoopRegionForSelection(state: ReturnType<typeof useArrangementStore.getState>) {
  const selectedClips = state.clips.filter(c => state.selectedClipIds.has(c.id));
  if (selectedClips.length === 0) {
    // No selection - clear loop
    state.clearLoopRegion();
    return;
  }

  const minRow = Math.min(...selectedClips.map(c => c.startRow));
  const maxRow = Math.max(...selectedClips.map(c => {
    const len = c.clipLengthRows ?? 64;
    return c.startRow + len;
  }));

  state.setLoopRegion(minRow, maxRow);
}

/**
 * Insert clip at playhead on selected track
 */
function insertClipAtPlayhead(state: ReturnType<typeof useArrangementStore.getState>) {
  const patterns = useTrackerStore.getState().patterns;
  if (patterns.length === 0) return;

  // Get selected track or first track
  let trackId = state.selectedTrackId;
  if (!trackId && state.tracks.length > 0) {
    trackId = state.tracks[0].id;
  }
  if (!trackId) return;

  const snap = state.view.snapDivision || 1;
  const startRow = Math.floor(state.playbackRow / snap) * snap;

  state.addClip({
    patternId: patterns[0].id,
    trackId,
    startRow,
    offsetRows: 0,
    clipLengthRows: patterns[0].length,
    sourceChannelIndex: 0,
    color: null,
    muted: false,
  });
}
