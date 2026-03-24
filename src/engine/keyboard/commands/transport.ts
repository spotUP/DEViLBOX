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
 * Play pattern - Always plays from row 0 of current pattern.
 * Stops first if already playing, then starts fresh.
 */
export function playPattern(): boolean {
  const store = useTransportStore.getState();
  const replayer = getTrackerReplayer();

  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  // Always stop first — idempotent, handles any state
  if (replayer.isPlaying() || store.isPlaying) {
    replayer.stop();
    store.stop();
    getToneEngine().stop();
  }

  store.setIsLooping(true);
  store.setCurrentRow(0);

  getToneEngine()
    .init()
    .then(() => useTransportStore.getState().play())
    .catch((error) => {
      console.error('[playPattern] Failed to initialize audio engine:', error);
    });

  return true;
}

/**
 * Play song - Always plays from pattern 0 / row 0.
 * Stops first if already playing, then starts fresh.
 */
export function playSong(): boolean {
  const store = useTransportStore.getState();
  const replayer = getTrackerReplayer();

  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  Tone.start();

  // Always stop first — idempotent, handles any state
  if (replayer.isPlaying() || store.isPlaying) {
    replayer.stop();
    store.stop();
    getToneEngine().stop();
  }

  store.setIsLooping(false);
  store.setCurrentPattern(0);
  store.setCurrentRow(0);

  getToneEngine()
    .init()
    .then(() => useTransportStore.getState().play())
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
