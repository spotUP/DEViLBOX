/**
 * Follow Commands - Follow song, loop pattern, continuous scroll modes
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useUIStore } from '@stores/useUIStore';
import { muteChannel, soloChannel } from './channel';

export function toggleFollowSong(): boolean {
  const { followPlayback, setFollowPlayback } = useTrackerStore.getState();
  setFollowPlayback(!followPlayback);
  useUIStore.getState().setStatusMessage(`Follow: ${!followPlayback ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleLoopPattern(): boolean {
  const { isLooping, setIsLooping } = useTransportStore.getState();
  setIsLooping(!isLooping);
  useUIStore.getState().setStatusMessage(`Loop: ${!isLooping ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleContinuousScroll(): boolean {
  const { smoothScrolling, setSmoothScrolling } = useTransportStore.getState();
  setSmoothScrolling(!smoothScrolling);
  useUIStore.getState().setStatusMessage(`Smooth scroll: ${!smoothScrolling ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMetronome(): boolean {
  const { metronomeEnabled, toggleMetronome: toggle } = useTransportStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Metronome: ${!metronomeEnabled ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleCountIn(): boolean {
  const { countInEnabled, toggleCountIn: toggle } = useTransportStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Count-in: ${!countInEnabled ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMidiInput(): boolean {
  useUIStore.getState().setStatusMessage('MIDI input: configure in MIDI settings', false, 2000);
  return true;
}

export function toggleRecordQuantize(): boolean {
  const { recordQuantize, toggleRecordQuantize: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Record quantize: ${!recordQuantize ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleChordMode(): boolean {
  const { chordEntryMode, toggleChordEntryMode } = useUIStore.getState();
  toggleChordEntryMode();
  useUIStore.getState().setStatusMessage(`Chord mode: ${!chordEntryMode ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleWrapMode(): boolean {
  const { wrapMode, toggleWrapMode: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Wrap mode: ${!wrapMode ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleAutoRecord(): boolean {
  const { autoRecord, toggleAutoRecord: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Auto-record: ${!autoRecord ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMultiChannelRecord(): boolean {
  const { multiChannelRecord, toggleMultiChannelRecord: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Multi-ch record: ${!multiChannelRecord ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function togglePatternFocus(): boolean {
  useUIStore.getState().setStatusMessage('Pattern focus: click pattern editor', false, 1500);
  return true;
}

export function toggleColumnVisibility(): boolean {
  const { blankEmptyCells, setBlankEmptyCells } = useUIStore.getState();
  setBlankEmptyCells(!blankEmptyCells);
  useUIStore.getState().setStatusMessage(`Empty cells: ${blankEmptyCells ? 'visible' : 'hidden'}`, false, 1000);
  return true;
}

export function toggleSoloChannel(): boolean {
  return soloChannel();
}

export function toggleMuteChannel(): boolean {
  return muteChannel();
}

export function toggleSamplePreview(): boolean {
  useUIStore.getState().setStatusMessage('Sample preview: click in instrument list', false, 1500);
  return true;
}

export function togglePluginEditor(): boolean {
  useUIStore.getState().togglePanel('instrument-editor');
  return true;
}
