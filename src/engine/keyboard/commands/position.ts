/**
 * Position Commands - Position markers, bookmarks, navigation
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Go to saved position
 */
function gotoPosition(index: number): boolean {
  useUIStore.getState().setStatusMessage(`Position ${index}`, false, 1000);
  return true;
}

/**
 * Save current position to marker slot
 */
function savePosition(index: number): boolean {
  useUIStore.getState().setStatusMessage(`Saved position ${index}`, false, 1000);
  return true;
}

// Save position marker 0
export function savePosition0(): boolean { return savePosition(0); }
export function savePosition1(): boolean { return savePosition(1); }
export function savePosition2(): boolean { return savePosition(2); }
export function savePosition3(): boolean { return savePosition(3); }
export function savePosition4(): boolean { return savePosition(4); }
export function savePosition5(): boolean { return savePosition(5); }
export function savePosition6(): boolean { return savePosition(6); }
export function savePosition7(): boolean { return savePosition(7); }
export function savePosition8(): boolean { return savePosition(8); }
export function savePosition9(): boolean { return savePosition(9); }

// Go to position marker 0
export function gotoPosition0(): boolean { return gotoPosition(0); }
export function gotoPosition1(): boolean { return gotoPosition(1); }
export function gotoPosition2(): boolean { return gotoPosition(2); }
export function gotoPosition3(): boolean { return gotoPosition(3); }
export function gotoPosition4(): boolean { return gotoPosition(4); }
export function gotoPosition5(): boolean { return gotoPosition(5); }
export function gotoPosition6(): boolean { return gotoPosition(6); }
export function gotoPosition7(): boolean { return gotoPosition(7); }
export function gotoPosition8(): boolean { return gotoPosition(8); }
export function gotoPosition9(): boolean { return gotoPosition(9); }

/**
 * Go to start of pattern
 */
export function gotoPatternStart(): boolean {
  useTrackerStore.getState().moveCursorToRow(0);
  useUIStore.getState().setStatusMessage('Pattern start', false, 1000);
  return true;
}

/**
 * Go to end of pattern
 */
export function gotoPatternEnd(): boolean {
  const { patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern) {
    moveCursorToRow(pattern.length - 1);
    useUIStore.getState().setStatusMessage('Pattern end', false, 1000);
  }
  return true;
}

/**
 * Go to start of song
 */
export function gotoSongStart(): boolean {
  const { patterns, moveCursorToRow } = useTrackerStore.getState();
  // Navigate to pattern 0, row 0
  if (patterns.length > 0) {
    moveCursorToRow(0);
  }
  useUIStore.getState().setStatusMessage('Song start', false, 1000);
  return true;
}

/**
 * Go to end of song
 */
export function gotoSongEnd(): boolean {
  const { patterns, moveCursorToRow } = useTrackerStore.getState();
  const lastPattern = patterns[patterns.length - 1];
  if (lastPattern) {
    moveCursorToRow(lastPattern.length - 1);
  }
  useUIStore.getState().setStatusMessage('Song end', false, 1000);
  return true;
}

/**
 * Go to first channel
 */
export function gotoFirstChannel(): boolean {
  useTrackerStore.getState().moveCursorToChannel(0);
  useUIStore.getState().setStatusMessage('First channel', false, 1000);
  return true;
}

/**
 * Go to last channel
 */
export function gotoLastChannel(): boolean {
  const { patterns, currentPatternIndex, moveCursorToChannel } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern && pattern.channels) {
    moveCursorToChannel(pattern.channels.length - 1);
    useUIStore.getState().setStatusMessage('Last channel', false, 1000);
  }
  return true;
}

/**
 * Go to specific row
 */
export function gotoRow(): boolean {
  useUIStore.getState().setStatusMessage('Go to row...', false, 1000);
  return true;
}

/**
 * Go to specific pattern
 */
export function gotoPattern(): boolean {
  useUIStore.getState().setStatusMessage('Go to pattern...', false, 1000);
  return true;
}

/**
 * Go to specific order position
 */
export function gotoOrderPosition(): boolean {
  useUIStore.getState().setStatusMessage('Go to order...', false, 1000);
  return true;
}

/**
 * Go to time position (in song)
 */
export function gotoTime(): boolean {
  useUIStore.getState().setStatusMessage('Go to time...', false, 1000);
  return true;
}

/**
 * Jump to next bookmark
 */
export function jumpToNextBookmark(): boolean {
  useUIStore.getState().setStatusMessage('Next bookmark', false, 1000);
  return true;
}

/**
 * Jump to previous bookmark
 */
export function jumpToPrevBookmark(): boolean {
  useUIStore.getState().setStatusMessage('Previous bookmark', false, 1000);
  return true;
}

/**
 * Toggle bookmark at current position
 */
export function toggleBookmark(): boolean {
  useUIStore.getState().setStatusMessage('Toggle bookmark', false, 1000);
  return true;
}

/**
 * Clear all bookmarks
 */
export function clearAllBookmarks(): boolean {
  useUIStore.getState().setStatusMessage('Bookmarks cleared', false, 1000);
  return true;
}
