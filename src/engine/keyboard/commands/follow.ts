/**
 * Follow Commands - Follow song, loop pattern, continuous scroll modes
 */

import { useUIStore } from '@stores/useUIStore';

/**
 * Toggle follow song mode (cursor follows playback)
 */
export function toggleFollowSong(): boolean {
  useUIStore.getState().setStatusMessage('Toggle follow song', false, 1000);
  return true;
}

/**
 * Toggle pattern loop mode
 */
export function toggleLoopPattern(): boolean {
  useUIStore.getState().setStatusMessage('Toggle loop pattern', false, 1000);
  return true;
}

/**
 * Toggle continuous scroll mode (Renoise)
 */
export function toggleContinuousScroll(): boolean {
  useUIStore.getState().setStatusMessage('Toggle continuous scroll', false, 1000);
  return true;
}

/**
 * Toggle metronome
 */
export function toggleMetronome(): boolean {
  useUIStore.getState().setStatusMessage('Toggle metronome', false, 1000);
  return true;
}

/**
 * Toggle count-in before recording
 */
export function toggleCountIn(): boolean {
  useUIStore.getState().setStatusMessage('Toggle count-in', false, 1000);
  return true;
}

/**
 * Toggle MIDI input
 */
export function toggleMidiInput(): boolean {
  useUIStore.getState().setStatusMessage('Toggle MIDI input', false, 1000);
  return true;
}

/**
 * Toggle record quantize
 */
export function toggleRecordQuantize(): boolean {
  useUIStore.getState().setStatusMessage('Toggle record quantize', false, 1000);
  return true;
}

/**
 * Toggle chord mode
 */
export function toggleChordMode(): boolean {
  useUIStore.getState().setStatusMessage('Toggle chord mode', false, 1000);
  return true;
}

/**
 * Toggle wrap mode (cursor wraps around pattern)
 */
export function toggleWrapMode(): boolean {
  useUIStore.getState().setStatusMessage('Toggle wrap mode', false, 1000);
  return true;
}

/**
 * Toggle auto-record (insert notes while playing)
 */
export function toggleAutoRecord(): boolean {
  useUIStore.getState().setStatusMessage('Toggle auto-record', false, 1000);
  return true;
}

/**
 * Toggle multi-channel recording
 */
export function toggleMultiChannelRecord(): boolean {
  useUIStore.getState().setStatusMessage('Toggle multi-channel record', false, 1000);
  return true;
}

/**
 * Toggle pattern editor focus
 */
export function togglePatternFocus(): boolean {
  useUIStore.getState().setStatusMessage('Toggle pattern focus', false, 1000);
  return true;
}

/**
 * Toggle column type visibility
 */
export function toggleColumnVisibility(): boolean {
  useUIStore.getState().setStatusMessage('Toggle column visibility', false, 1000);
  return true;
}

/**
 * Solo current channel toggle
 */
export function toggleSoloChannel(): boolean {
  useUIStore.getState().setStatusMessage('Toggle solo', false, 1000);
  return true;
}

/**
 * Mute current channel toggle
 */
export function toggleMuteChannel(): boolean {
  useUIStore.getState().setStatusMessage('Toggle mute', false, 1000);
  return true;
}

/**
 * Toggle sample playback preview
 */
export function toggleSamplePreview(): boolean {
  useUIStore.getState().setStatusMessage('Toggle sample preview', false, 1000);
  return true;
}

/**
 * Toggle plugin editor visibility
 */
export function togglePluginEditor(): boolean {
  useUIStore.getState().setStatusMessage('Toggle plugin editor', false, 1000);
  return true;
}
