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
 * Play pattern from row 0.
 */
export function playPattern(): boolean {
  const replayer = getTrackerReplayer();
  const playing = replayer.isPlaying() || useTransportStore.getState().isPlaying;

  if (playing) {
    replayer.forcePosition(replayer.getSongPos(), 0);
  } else {
    unlockIOSAudio();
    Tone.start();
    useTransportStore.getState().setIsLooping(true);
    useTransportStore.getState().setCurrentRow(0);
    getToneEngine().init()
      .then(() => useTransportStore.getState().play())
      .catch(e => console.error('[playPattern]', e));
  }
  return true;
}

/**
 * Play song from pattern 0 / row 0.
 */
export function playSong(): boolean {
  const replayer = getTrackerReplayer();
  const playing = replayer.isPlaying() || useTransportStore.getState().isPlaying;

  if (playing) {
    replayer.forcePosition(0, 0);
  } else {
    unlockIOSAudio();
    Tone.start();
    useTransportStore.getState().setIsLooping(false);
    useTransportStore.getState().setCurrentPattern(0);
    useTransportStore.getState().setCurrentRow(0);
    getToneEngine().init()
      .then(() => useTransportStore.getState().play())
      .catch(e => console.error('[playSong]', e));
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
