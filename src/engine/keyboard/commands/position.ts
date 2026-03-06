/**
 * Position Commands - Position markers, bookmarks, navigation
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useUIStore } from '@stores/useUIStore';

function savePosition(index: number): boolean {
  const { cursor } = useCursorStore.getState();
  const { setPtnJumpPos } = useEditorStore.getState();
  setPtnJumpPos(index, cursor.rowIndex);
  useUIStore.getState().setStatusMessage(`Position ${index} saved (row ${cursor.rowIndex})`, false, 1000);
  return true;
}

function gotoPosition(index: number): boolean {
  const { getPtnJumpPos } = useEditorStore.getState();
  const { moveCursorToRow } = useCursorStore.getState();
  const row = getPtnJumpPos(index);
  moveCursorToRow(row);
  useUIStore.getState().setStatusMessage(`Position ${index}: row ${row}`, false, 1000);
  return true;
}

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

export function gotoPatternStart(): boolean {
  useCursorStore.getState().moveCursorToRow(0);
  return true;
}

export function gotoPatternEnd(): boolean {
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const { moveCursorToRow } = useCursorStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern) moveCursorToRow(pattern.length - 1);
  return true;
}

export function gotoSongStart(): boolean {
  useCursorStore.getState().moveCursorToRow(0);
  useUIStore.getState().setStatusMessage('Song start', false, 800);
  return true;
}

export function gotoSongEnd(): boolean {
  const { patterns } = useTrackerStore.getState();
  const { moveCursorToRow } = useCursorStore.getState();
  const last = patterns[patterns.length - 1];
  if (last) moveCursorToRow(last.length - 1);
  useUIStore.getState().setStatusMessage('Song end', false, 800);
  return true;
}

export function gotoFirstChannel(): boolean {
  useCursorStore.getState().moveCursorToChannel(0);
  return true;
}

export function gotoLastChannel(): boolean {
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const { moveCursorToChannel } = useCursorStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern?.channels) moveCursorToChannel(pattern.channels.length - 1);
  return true;
}

export function gotoRow(): boolean {
  useUIStore.getState().setStatusMessage('Go to row: type row number', false, 1500);
  return true;
}

export function gotoPattern(): boolean {
  useUIStore.getState().setStatusMessage('Go to pattern: use pattern list', false, 1500);
  return true;
}

export function gotoOrderPosition(): boolean {
  useUIStore.getState().setStatusMessage('Go to order: use pattern list', false, 1500);
  return true;
}

export function gotoTime(): boolean {
  useUIStore.getState().setStatusMessage('Go to time: not yet available', false, 1500);
  return true;
}

export function jumpToNextBookmark(): boolean {
  useEditorStore.getState().nextBookmark();
  const { cursor } = useCursorStore.getState();
  useUIStore.getState().setStatusMessage(`Bookmark: row ${cursor.rowIndex}`, false, 800);
  return true;
}

export function jumpToPrevBookmark(): boolean {
  useEditorStore.getState().prevBookmark();
  const { cursor } = useCursorStore.getState();
  useUIStore.getState().setStatusMessage(`Bookmark: row ${cursor.rowIndex}`, false, 800);
  return true;
}

export function toggleBookmark(): boolean {
  const { cursor } = useCursorStore.getState();
  const { toggleBookmark: toggle } = useEditorStore.getState();
  toggle(cursor.rowIndex);
  const added = useEditorStore.getState().bookmarks.includes(cursor.rowIndex);
  useUIStore.getState().setStatusMessage(`Bookmark row ${cursor.rowIndex}: ${added ? 'set' : 'cleared'}`, false, 1000);
  return true;
}

export function clearAllBookmarks(): boolean {
  useEditorStore.getState().clearBookmarks();
  useUIStore.getState().setStatusMessage('Bookmarks cleared', false, 1000);
  return true;
}
