/**
 * DubIntroRunner — executes a DubIntroTemplate by scheduling moves
 * at beat-relative times derived from the current BPM.
 *
 * Usage:
 *   const stop = runDubIntro('classic', bpm);
 *   // ... later, to cancel:
 *   stop();
 */

import { DUB_INTRO_TEMPLATES } from './DubIntroTemplates';
import { fire } from './DubRouter';

interface ActiveHold {
  dispose: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Run a dub intro template. Returns a cancel function.
 */
export function runDubIntro(
  templateId: string,
  bpm: number,
): () => void {
  const template = DUB_INTRO_TEMPLATES[templateId];
  if (!template) {
    console.warn(`[DubIntro] Unknown template: ${templateId}`);
    return () => {};
  }

  const beatMs = 60_000 / Math.max(30, bpm);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const activeHolds: ActiveHold[] = [];
  let cancelled = false;

  for (const step of template.steps) {
    const startMs = step.beat * beatMs;

    const timer = setTimeout(() => {
      if (cancelled) return;

      const handle = fire(step.moveId, undefined, step.params ?? {}, 'lane');

      // If it's a hold move with a duration, schedule release
      if (handle && step.holdBeats) {
        const holdMs = step.holdBeats * beatMs;
        const releaseTimer = setTimeout(() => {
          if (!cancelled) handle.dispose();
        }, holdMs);
        activeHolds.push({ dispose: handle.dispose, timer: releaseTimer });
        timers.push(releaseTimer);
      }
    }, startMs);

    timers.push(timer);
  }

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
    for (const h of activeHolds) {
      clearTimeout(h.timer);
      try { h.dispose(); } catch { /* already disposed */ }
    }
    timers.length = 0;
    activeHolds.length = 0;
  };
}
