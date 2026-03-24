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
    getTrackerReplayer().stop();
    stop();
    getToneEngine().stop();
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
 * Play pattern - Always restarts from row 0 of current pattern.
 * If already playing, seeks without stopping. If not, starts playback.
 */
export function playPattern(): boolean {
  const { setCurrentRow, play, isPlaying, setIsLooping } = useTransportStore.getState();

  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  setIsLooping(true);
  setCurrentRow(0);

  // Seek replayer if it's active (covers rapid re-trigger while already playing)
  const replayer = getTrackerReplayer();
  if (replayer.isPlaying()) {
    replayer.seekTo(replayer.getSongPos(), 0);
    return true;
  }

  // Not playing — start fresh
  if (!isPlaying) {
    getToneEngine()
      .init()
      .then(() => play())
      .catch((error) => {
        console.error('[playPattern] Failed to initialize audio engine:', error);
      });
  }

  return true;
}

/**
 * Play song - Always restarts from pattern 0 / row 0.
 * If already playing, seeks without stopping. If not, starts playback.
 */
export function playSong(): boolean {
  const { setCurrentRow, setCurrentPattern, play, isPlaying, setIsLooping } = useTransportStore.getState();

  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  setIsLooping(false);
  setCurrentPattern(0);
  setCurrentRow(0);

  // Seek replayer if it's active (covers rapid re-trigger while already playing)
  const replayer = getTrackerReplayer();
  if (replayer.isPlaying()) {
    replayer.seekTo(0, 0);
    return true;
  }

  // Not playing — start fresh
  if (!isPlaying) {
    getToneEngine()
      .init()
      .then(() => play())
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
