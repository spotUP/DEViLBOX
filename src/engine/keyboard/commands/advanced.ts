/**
 * Advanced Commands - Interpolation, amplification, expand/shrink, pattern manipulation
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useUIStore } from '@stores/useUIStore';
import { valueColumnOf } from '@stores/tracker/patternEditActions';

type ValueOp = Parameters<ReturnType<typeof useTrackerStore.getState>['editSelectionValues']>[0];

/** Applies a value operation to the cursor's column inside the selection; the single path the commands below share. */
function editValues(op: ValueOp, label: string): boolean {
  const { selection, cursor } = useCursorStore.getState();
  const column = valueColumnOf(cursor.columnType);
  const ui = useUIStore.getState();
  if (!selection) { ui.setStatusMessage('Select a range first', false, 1500); return true; }
  if (!column) { ui.setStatusMessage('Put the cursor in an instrument, volume or effect value column', false, 2000); return true; }
  useTrackerStore.getState().editSelectionValues(op, column);
  ui.setStatusMessage(label, false, 1000);
  return true;
}

export const invertValues = (): boolean => editValues({ kind: 'invert' }, 'Values inverted');
export const transposeValuesUp = (): boolean => editValues({ kind: 'transpose', amount: 1 }, 'Values +1');
export const transposeValuesDown = (): boolean => editValues({ kind: 'transpose', amount: -1 }, 'Values -1');
export const scaleValuesUp = (): boolean => editValues({ kind: 'scale', percent: 110 }, 'Values scaled to 110 percent');
export const scaleValuesDown = (): boolean => editValues({ kind: 'scale', percent: 90 }, 'Values scaled to 90 percent');

export function minimizeChannels(): boolean {
  useTrackerStore.getState().setAllChannelsCollapsed(true);
  useUIStore.getState().setStatusMessage('All channels minimized', false, 1000);
  return true;
}
export function maximizeChannels(): boolean {
  useTrackerStore.getState().setAllChannelsCollapsed(false);
  useUIStore.getState().setStatusMessage('All channels maximized', false, 1000);
  return true;
}

export function interpolateVolume(): boolean {
  useUIStore.getState().openDialogCommand('interpolate-volume');
  return true;
}

export function interpolateEffect(): boolean {
  useUIStore.getState().openDialogCommand('interpolate-effect');
  return true;
}

export function amplifySelection(): boolean {
  const { selection } = useCursorStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('Select a range first', false, 1500);
    return true;
  }
  useTrackerStore.getState().amplifySelection(1.5);
  useUIStore.getState().setStatusMessage('Amplified ×1.5', false, 1000);
  return true;
}

export function applyCurrentInstrument(): boolean {
  const store = useTrackerStore.getState();
  const { cursor } = useCursorStore.getState();
  const { patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  const currentInstrument = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex].instrument;
  if (!currentInstrument) return true;
  store.applyInstrumentToSelection(currentInstrument);
  useUIStore.getState().setStatusMessage(`Instrument ${currentInstrument} applied`, false, 1000);
  return true;
}

export function expandPattern(): boolean {
  const { currentPatternIndex, expandPattern: expand } = useTrackerStore.getState();
  expand(currentPatternIndex);
  const newLength = useTrackerStore.getState().patterns[currentPatternIndex]?.length ?? 0;
  useUIStore.getState().setStatusMessage(`Pattern: ${newLength} rows`, false, 1000);
  return true;
}

export function shrinkPattern(): boolean {
  const { currentPatternIndex, shrinkPattern: shrink } = useTrackerStore.getState();
  shrink(currentPatternIndex);
  const newLength = useTrackerStore.getState().patterns[currentPatternIndex]?.length ?? 0;
  useUIStore.getState().setStatusMessage(`Pattern: ${newLength} rows`, false, 1000);
  return true;
}

export function growSelection(): boolean {
  useTrackerStore.getState().growSelection();
  return true;
}

export function shrinkSelection(): boolean {
  useTrackerStore.getState().shrinkSelection();
  return true;
}

export function duplicatePattern(): boolean {
  const { currentPatternIndex, duplicatePattern: dup } = useTrackerStore.getState();
  dup(currentPatternIndex);
  useUIStore.getState().setStatusMessage('Pattern duplicated', false, 1000);
  return true;
}

// doubleBlockLength / halveBlockLength = expand/shrink pattern
export function doubleBlockLength(): boolean { return expandPattern(); }
export function halveBlockLength(): boolean { return shrinkPattern(); }
export function doubleBlock(): boolean { return expandPattern(); }
export function halveBlock(): boolean { return shrinkPattern(); }

export function scaleVolumeTrack(): boolean {
  useUIStore.getState().openDialogCommand('scale-volume-track');
  return true;
}
export function scaleVolumePattern(): boolean {
  useUIStore.getState().openDialogCommand('scale-volume-pattern');
  return true;
}
export function scaleVolumeBlock(): boolean {
  useUIStore.getState().openDialogCommand('scale-volume-block');
  return true;
}

export function swapChannels(): boolean {
  const { cursor } = useCursorStore.getState();
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  const nextCh = (cursor.channelIndex + 1) % pattern.channels.length;
  useTrackerStore.getState().swapChannels(cursor.channelIndex, nextCh);
  useUIStore.getState().setStatusMessage(`Channels ${cursor.channelIndex + 1}↔${nextCh + 1} swapped`, false, 1000);
  return true;
}

export function splitPattern(): boolean {
  useTrackerStore.getState().splitPatternAtCursor();
  useUIStore.getState().setStatusMessage('Pattern split at cursor', false, 1000);
  return true;
}

export function joinBlocks(): boolean {
  useTrackerStore.getState().joinPatterns();
  useUIStore.getState().setStatusMessage('Patterns joined', false, 1000);
  return true;
}

export function setPatternLength(): boolean {
  useUIStore.getState().openDialogCommand('pattern-length');
  return true;
}

export function patternLengthDialog(): boolean {
  useUIStore.getState().openDialogCommand('pattern-length');
  return true;
}

export function setBpm(): boolean {
  const { bpm, setBPM } = useTransportStore.getState();
  setBPM(bpm + 1);
  useUIStore.getState().setStatusMessage(`BPM: ${bpm + 1}`, false, 800);
  return true;
}

export function setSpeed(): boolean {
  const { speed, setSpeed: set } = useTransportStore.getState();
  set(speed + 1);
  useUIStore.getState().setStatusMessage(`Speed: ${speed + 1}`, false, 800);
  return true;
}

export function setTempo(): boolean { return setBpm(); }

export function appendBlock(): boolean {
  useTrackerStore.getState().addPattern();
  useUIStore.getState().setStatusMessage('Pattern appended', false, 1000);
  return true;
}

export function insertBlock(): boolean {
  useTrackerStore.getState().addPattern();
  useUIStore.getState().setStatusMessage('Pattern inserted', false, 1000);
  return true;
}

export function splitBlock(): boolean { return splitPattern(); }
export function gotoBlock(): boolean {
  const { currentPatternIndex, patterns } = useTrackerStore.getState();
  useUIStore.getState().setStatusMessage(`Pattern ${currentPatternIndex + 1}/${patterns.length}`, false, 1000);
  return true;
}

export function findSample(): boolean {
  useUIStore.getState().openDialogCommand('find-replace');
  return true;
}

export function findReplace(): boolean {
  useUIStore.getState().openDialogCommand('find-replace');
  return true;
}

export function findNext(): boolean {
  useUIStore.getState().openDialogCommand('find-replace');
  return true;
}

export function gotoDialog(): boolean {
  useUIStore.getState().setStatusMessage('Go to: use Ctrl+G / pattern list', false, 1500);
  return true;
}

export function quantizeSettings(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}
