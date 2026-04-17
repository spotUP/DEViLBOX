/**
 * Transport Commands - Play, Stop, Toggle playback
 */

import * as Tone from 'tone';
import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';

/**
 * Toggle play/stop - Space bar in most trackers
 * Uses electronic brake for turntable-style spindown on stop.
 */
export function playStopToggle(): boolean {
  const store = useTransportStore.getState();

  if (store.isPlaying) {
    getTrackerScratchController().triggerElectronicBrake();
  } else {
    // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
    // before engine.init() which does async WASM loading
    unlockIOSAudio();
    Tone.start();

    // Always start from the first row of the current pattern
    store.setCurrentRow(0);
    // Fast path: if AudioContext is already running, skip async init
    const ctx = Tone.getContext().rawContext as AudioContext;
    if (ctx.state === 'running') {
      store.play();
    } else {
      getToneEngine()
        .init()
        .then(() => useTransportStore.getState().play())
        .catch((error) => {
          console.error('[playStopToggle] Failed to initialize audio engine:', error);
        });
    }
  }

  return true;
}

/**
 * Play pattern from row 0, looped.
 * If already playing, restarts the current pattern from row 0 (never stops).
 */
export function playPattern(): boolean {
  const replayer = getTrackerReplayer();
  const store = useTransportStore.getState();
  const trackerStore = useTrackerStore.getState();
  const startPos = trackerStore.currentPositionIndex;
  const playing = replayer.isPlaying() || store.isPlaying;

  if (playing) {
    // Already playing — restart current pattern from row 0 with looping
    store.setIsLooping(true);
    replayer.forcePosition(startPos, 0);
    return true;
  }
  unlockIOSAudio();
  Tone.start();
  store.setIsLooping(true);
  store.setCurrentRow(0);
  // Fast path: if AudioContext is already running, skip async init
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (ctx.state === 'running') {
    store.play();
  } else {
    getToneEngine().init()
      .then(() => useTransportStore.getState().play())
      .catch(e => console.error('[playPattern]', e));
  }
  return true;
}

/**
 * Play song from position 0, row 0.
 * If already playing, instantly restarts from the beginning.
 */
export function playSong(): boolean {
  const replayer = getTrackerReplayer();
  const store = useTransportStore.getState();
  const playing = replayer.isPlaying() || store.isPlaying;

  if (playing) {
    if (replayer.isSuppressNotes) {
      replayer.stop();
      store.stop();
      getToneEngine().stop();
    } else {
      // Restart from song beginning — position 0, row 0
      replayer.forcePosition(0, 0);
      return true;
    }
  }
  unlockIOSAudio();
  Tone.start();
  store.setIsLooping(false);
  store.setCurrentRow(0);
  // Fast path: if AudioContext is already running, skip async init
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (ctx.state === 'running') {
    store.play();
  } else {
    getToneEngine().init()
      .then(() => useTransportStore.getState().play())
      .catch(e => console.error('[playSong]', e));
  }
  return true;
}

/**
 * Stop playback with turntable-style electronic brake spindown.
 */
export function stopPlayback(): boolean {
  getTrackerScratchController().triggerElectronicBrake();
  return true;
}
