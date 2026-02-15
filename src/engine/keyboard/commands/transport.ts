/**
 * Transport Commands - Play, Stop, Toggle playback
 */

import { useTransportStore } from '@stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';

/**
 * Toggle play/stop - Space bar in most trackers
 */
export function playStopToggle(): boolean {
  const { isPlaying, stop } = useTransportStore.getState();
  
  if (isPlaying) {
    stop();
    getToneEngine().stop();
  } else {
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
 * Play pattern - Start playing current pattern from beginning
 */
export function playPattern(): boolean {
  const { setCurrentRow, play, isPlaying, stop } = useTransportStore.getState();
  
  if (isPlaying) {
    stop();
  }
  
  setCurrentRow(0);
  
  getToneEngine()
    .init()
    .then(() => play())
    .catch((error) => {
      console.error('[playPattern] Failed to initialize audio engine:', error);
    });
  
  return true;
}

/**
 * Play song - Start playing from beginning of song
 */
export function playSong(): boolean {
  const { setCurrentRow, setCurrentPattern, play, isPlaying, stop } = useTransportStore.getState();
  
  if (isPlaying) {
    stop();
  }
  
  setCurrentPattern(0);
  setCurrentRow(0);
  
  getToneEngine()
    .init()
    .then(() => play())
    .catch((error) => {
      console.error('[playSong] Failed to initialize audio engine:', error);
    });
  
  return true;
}

/**
 * Stop playback
 */
export function stopPlayback(): boolean {
  const { stop } = useTransportStore.getState();
  stop();
  getToneEngine().stop();
  return true;
}
