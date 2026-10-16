/**
 * The startup sequence: the one place that decides what comes first at boot.
 *
 * Order: a gesture surface (the tips dialog, or a click-to-start splash when
 * tips are off) -> its click starts the startup jingle at once -> only when the
 * jingle ends do the boot restore prompt and the changelog appear.
 *
 * The jingle asset is fetched and decoded at page load (beginStartupSequence),
 * so the gesture only has to resume the context and start the source. Playback
 * never waits for the audio engine; engine init runs in parallel.
 */
import { getJingleEngine, STARTUP_JINGLE_URL } from '@engine/jingle/JingleEngine';
import { injectMouthPatterns, teardownMouthPatterns } from '@engine/jingle/JinglePatterns';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore, type StartupJingleStage } from '@stores/useUIStore';

let began = false;
let gestureHandled = false;
let loading: Promise<boolean> | null = null;

/** Test hook: forget module state between tests. */
export function resetStartupSequenceForTest(): void {
  began = false;
  gestureHandled = false;
  loading = null;
}

/** What the user must click to start the jingle. */
export type StartupGestureSurface = 'tips' | 'splash' | 'none';

/** Which dialog (if any) is the first thing on screen. The tips dialog also carries the changelog tab. */
export function startupTipsModal(buildNumber: string): { initialTab: 'changelog' | 'tips' } | null {
  const hasNewVersion = localStorage.getItem('devilbox-seen-version') !== buildNumber;
  if (hasNewVersion) return { initialTab: 'changelog' };
  if (localStorage.getItem('show-tips-at-startup') !== 'false') return { initialTab: 'tips' };
  return null;
}

export function startupGestureSurface(buildNumber: string): StartupGestureSurface {
  if (!useSettingsStore.getState().welcomeJingleEnabled) return 'none';
  return startupTipsModal(buildNumber) ? 'tips' : 'splash';
}

/** True while the boot restore prompt and the changelog must stay hidden. */
export function isStartupHolding(stage: StartupJingleStage): boolean {
  return stage === 'awaiting-gesture' || stage === 'playing';
}

function setStage(stage: StartupJingleStage): void {
  useUIStore.getState().setStartupJingleStage(stage);
}

function finish(): void {
  const ui = useUIStore.getState();
  ui.setJingleActive(false);
  ui.setPostJingleActive(true);
  teardownMouthPatterns();
  setStage('done');
}

/**
 * Page load: when the jingle is enabled, start fetching and decoding it and
 * mark the sequence as waiting for a gesture. Safe to call more than once.
 */
export function beginStartupSequence(): void {
  if (began) return;
  began = true;
  if (!useSettingsStore.getState().welcomeJingleEnabled) return;
  setStage('awaiting-gesture');
  const jingle = getJingleEngine();
  jingle.onEnd(() => {
    finish();
    useUIStore.getState().setStatusMessage('DEVILBOX READY', false, 3000);
  });
  loading = jingle
    .preload(STARTUP_JINGLE_URL)
    .then(() => true)
    .catch((error: unknown) => {
      // The app continues without the jingle, but a missing or undecodable asset is reported.
      console.warn('[startup jingle]', error);
      return false;
    });
}

/**
 * The gesture: start the jingle now. Synchronous when the asset is already
 * decoded; never awaits the audio engine.
 */
export async function startStartupJingle(): Promise<void> {
  if (gestureHandled || useUIStore.getState().startupJingleStage !== 'awaiting-gesture') return;
  gestureHandled = true;
  const jingle = getJingleEngine();
  jingle.unlock();
  setStage('playing');
  const ok = jingle.isReady() ? true : await (loading ?? Promise.resolve(false));
  if (!ok) {
    setStage('done');
    return;
  }
  injectMouthPatterns();
  jingle.play();
  useUIStore.getState().setJingleActive(true);
}

/**
 * First user gesture anywhere: jingle first, then engine init. The jingle is
 * started before init is even called, so a slow init cannot delay it.
 */
export async function runFirstGesture(buildNumber: string, initAudioEngine: () => Promise<void>): Promise<void> {
  if (startupGestureSurface(buildNumber) === 'splash') void startStartupJingle();
  await initAudioEngine();
}
