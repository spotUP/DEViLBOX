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
  const store = useTransportStore.getState();

  if (store.isPlaying) {
    getTrackerReplayer().stop();
    store.stop();
    getToneEngine().stop();
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
 * Play pattern from row 0.
 */
export function playPattern(): boolean {
  const replayer = getTrackerReplayer();
  const store = useTransportStore.getState();
  const playing = replayer.isPlaying() || store.isPlaying;

  if (playing) {
    if (replayer.isSuppressNotes) {
      // WASM engines handle their own playback — forcePosition is meaningless.
      // Stop and restart cleanly so usePatternPlayback relaunches the engine.
      replayer.stop();
      store.stop();
      getToneEngine().stop();
    } else {
      replayer.forcePosition(replayer.getSongPos(), 0);
      return true;
    }
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
 * Play song from pattern 0 / row 0.
 */
export function playSong(): boolean {
  const replayer = getTrackerReplayer();
  const store = useTransportStore.getState();
  const playing = replayer.isPlaying() || store.isPlaying;

  if (playing) {
    if (replayer.isSuppressNotes) {
      // WASM engines handle their own playback — forcePosition is meaningless.
      // Stop and restart cleanly so usePatternPlayback relaunches the engine.
      replayer.stop();
      store.stop();
      getToneEngine().stop();
    } else {
      replayer.forcePosition(0, 0);
      return true;
    }
  }
  unlockIOSAudio();
  Tone.start();
  store.setIsLooping(false);
  store.setCurrentPattern(0);
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
 * Stop playback
 */
export function stopPlayback(): boolean {
  getTrackerReplayer().stop();
  const { stop } = useTransportStore.getState();
  stop();
  getToneEngine().stop();
  return true;
}
