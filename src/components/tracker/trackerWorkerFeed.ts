/**
 * What the pattern editor posts to its render worker when the tracker store
 * changes. Extracted from PatternEditorCanvas so the song-load sequence can be
 * driven (and counted) without a browser.
 */
import { layoutInputsChanged } from '@engine/renderer/layoutHold';
import type { PatternSnapshot, TrackerWorkerMsg } from '@engine/renderer/worker-types';

interface FeedState {
  patterns: Parameters<typeof layoutInputsChanged>[0]['patterns'];
  currentPatternIndex: number;
}

/**
 * One store change -> the worker messages it needs. Returns true when the
 * patterns were posted with `awaitLayout` (the caller owes the worker a
 * `layout` for them, posted before the next paint).
 */
export function feedWorkerFromTracker(
  s: FeedState & { patterns: unknown },
  prev: FeedState & { patterns: unknown },
  post: (msg: TrackerWorkerMsg) => void,
  snapshotPatterns: () => PatternSnapshot[],
): boolean {
  if (s.patterns === prev.patterns && s.currentPatternIndex === prev.currentPatternIndex) return false;
  const awaitLayout = layoutInputsChanged(prev, s);
  post({ type: 'patterns', patterns: snapshotPatterns(), currentPatternIndex: s.currentPatternIndex, awaitLayout });
  return awaitLayout;
}
