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
 * Play pattern from row 0.
 */
export function playPattern(): boolean {
  unlockIOSAudio();
  Tone.start();
  console.log('[transport] playPattern called, replayer.isPlaying=', getTrackerReplayer().isPlaying());

  const replayer = getTrackerReplayer();
  useTransportStore.getState().setIsLooping(true);

  if (replayer.isPlaying()) {
    replayer.forcePosition(replayer.getSongPos(), 0);
  } else {
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
  unlockIOSAudio();
  Tone.start();
  console.log('[transport] playSong called, replayer.isPlaying=', getTrackerReplayer().isPlaying());

  const replayer = getTrackerReplayer();
  useTransportStore.getState().setIsLooping(false);

  if (replayer.isPlaying()) {
    replayer.forcePosition(0, 0);
  } else {
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
