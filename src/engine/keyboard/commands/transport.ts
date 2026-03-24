/**
 * Transport Commands - Play, Stop, Toggle playback
 */

import * as Tone from 'tone';
import { useTransportStore } from '@stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';

/**
 * Toggle play/stop - Space bar in most trackers
 */
export function playStopToggle(): boolean {
  const { isPlaying, stop, setCurrentRow } = useTransportStore.getState();
  
  if (isPlaying) {
    // Save playback position — pattern editor reads cursor.rowIndex when stopped
    const savedRow = useTransportStore.getState().currentRow;
    getTrackerReplayer().stop();
    stop();
    getToneEngine().stop();
    // Move cursor to where playback was to prevent scroll jump to top
    import('@/stores/useCursorStore').then(({ useCursorStore }) => {
      useCursorStore.getState().moveCursorToRow(savedRow);
    });
  } else {
    // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
    // before engine.init() which does async WASM loading
    unlockIOSAudio();
    Tone.start();
    
    // Always start from the first row of the current pattern
    setCurrentRow(0);
    getToneEngine()
      .init()
      .then(() => useTransportStore.getState().play())
      .catch((error) => {
        console.error('[playStopToggle] Failed to initialize audio engine:', error);
      });
  }
  
  return true;
}

/**
 * Play pattern - Always plays from row 0 of current pattern.
 * Resets replayer position directly to avoid React state batching issues.
 */
export function playPattern(): boolean {
  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  const replayer = getTrackerReplayer();
  const store = useTransportStore.getState();

  store.setIsLooping(true);
  store.setCurrentRow(0);

  if (replayer.isPlaying()) {
    // Reset replayer position directly — no stop/start cycle needed
    replayer.seekTo(replayer.getSongPos(), 0);
    replayer.resyncSchedulerToNow();
  } else {
    getToneEngine()
      .init()
      .then(() => useTransportStore.getState().play())
      .catch((error) => {
        console.error('[playPattern] Failed to initialize audio engine:', error);
      });
  }

  return true;
}

/**
 * Play song - Always plays from pattern 0 / row 0.
 * Resets replayer position directly to avoid React state batching issues.
 */
export function playSong(): boolean {
  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  const replayer = getTrackerReplayer();
  const store = useTransportStore.getState();

  store.setIsLooping(false);
  store.setCurrentPattern(0);
  store.setCurrentRow(0);

  if (replayer.isPlaying()) {
    // Reset replayer position directly — no stop/start cycle needed
    replayer.seekTo(0, 0);
    replayer.resyncSchedulerToNow();
  } else {
    getToneEngine()
      .init()
      .then(() => useTransportStore.getState().play())
      .catch((error) => {
        console.error('[playSong] Failed to initialize audio engine:', error);
      });
  }

  return true;
}

/**
 * Stop playback
 */
export function stopPlayback(): boolean {
  getTrackerReplayer().stop();
  const { stop } = useTransportStore.getState();
  stop();
  getToneEngine().stop();
  return true;
}
