/**
 * The startup sequence: the one place that decides what comes first at boot.
 *
 * Order: the one start dialog (tips / what's new, or the collaboration modal for
 * a ?collab= link) -> closing it starts the startup jingle at once -> song loads
 * wait for the silent boot restore and for the jingle to end.
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

/** The one blocking dialog a start opens. */
export type StartupDialog =
  | { modal: 'tips'; initialTab: 'changelog' | 'tips' }
  | { modal: 'collab'; collabCode: string };

/**
 * The tips dialog's tab: the changelog on a new build, the tips otherwise. It
 * opens on every start, so there is no "off" answer.
 */
export function startupTipsModal(buildNumber: string): { initialTab: 'changelog' | 'tips' } {
  const hasNewVersion = localStorage.getItem('devilbox-seen-version') !== buildNumber;
  return { initialTab: hasNewVersion ? 'changelog' : 'tips' };
}

/**
 * Which dialog is the one dialog at app start: the collaboration modal for a
 * ?collab=CODE link, the tips dialog otherwise. Closing it is the start gesture
 * (closeStartDialog), whichever it is.
 */
export function startupDialog(buildNumber: string, search: string): StartupDialog {
  const collabCode = new URLSearchParams(search).get('collab');
  if (collabCode && collabCode.length >= 6) return { modal: 'collab', collabCode };
  return { modal: 'tips', ...startupTipsModal(buildNumber) };
}

/**
 * Close the open dialog and, in the same click, start the jingle. The jingle's
 * AudioContext unlock must run synchronously inside the user gesture, so this
 * is the only close handler the start dialogs and dismiss_modal use. Safe to
 * call for any later modal: startStartupJingle ignores everything after the
 * first gesture.
 */
export function closeStartDialog(): void {
  void startStartupJingle();
  useUIStore.getState().closeModal();
}

/** True while song loads must wait: the jingle is pending or playing. */
export function isStartupHolding(stage: StartupJingleStage): boolean {
  return stage === 'awaiting-gesture' || stage === 'playing';
}

/**
 * Resolves once no startup jingle is pending: immediately when the jingle is
 * off or already done, otherwise when it ends (or fails). Every song load
 * (openSong, the one door) awaits this, so no song loads before the jingle.
 */
export function whenStartupJingleDone(): Promise<void> {
  if (!isStartupHolding(useUIStore.getState().startupJingleStage)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const unsubscribe = useUIStore.subscribe((state) => {
      if (isStartupHolding(state.startupJingleStage)) return;
      unsubscribe();
      resolve();
    });
  });
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
