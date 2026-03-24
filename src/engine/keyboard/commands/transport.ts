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
 * Play pattern - Start playing current pattern from beginning.
 * If already playing, seek replayer to row 0 without stopping.
 */
export function playPattern(): boolean {
  const { setCurrentRow, play, isPlaying, setIsLooping } = useTransportStore.getState();

  if (isPlaying) {
    // Already playing — seek replayer to row 0 of current pattern
    setIsLooping(true);
    setCurrentRow(0);
    getTrackerReplayer().seekTo(getTrackerReplayer().getSongPos(), 0);
    return true;
  }

  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  setIsLooping(true);
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
 * Play song - Start playing from beginning of song.
 * If already playing, seek replayer to pattern 0 / row 0 without stopping.
 */
export function playSong(): boolean {
  const { setCurrentRow, setCurrentPattern, play, isPlaying, setIsLooping } = useTransportStore.getState();

  if (isPlaying) {
    // Already playing — seek replayer to song start
    setIsLooping(false);
    setCurrentPattern(0);
    setCurrentRow(0);
    getTrackerReplayer().seekTo(0, 0);
    return true;
  }

  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  setIsLooping(false);
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
  getTrackerReplayer().stop();
  const { stop } = useTransportStore.getState();
  stop();
  getToneEngine().stop();
  return true;
}
