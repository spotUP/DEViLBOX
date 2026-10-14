/**
 * layoutHold - the pattern editor's worker never draws a pattern set with the
 * layout of the previous one.
 *
 * The worker gets `patterns` straight from the tracker store (synchronously)
 * but `channelLayout` (offsets, widths) only after React has rendered the new
 * song (a layout effect on the main thread). A song with another channel
 * count therefore drew for several frames as new rows at old column
 * positions, then jumped. The hold closes that gap: a `patterns` message
 * flagged `awaitLayout` freezes the worker's drawing (the old song stays on
 * screen) until the matching `channelLayout` arrives, so the picture goes from
 * the old song straight to the new one.
 */

/** The parts of a channel that decide its column width (see PatternEditorCanvas channel metrics). */
interface LayoutChannel {
  collapsed?: boolean;
  channelMeta?: { effectCols?: number; noteCols?: number; effectNotation?: string } | null;
}
interface LayoutPattern { channels: LayoutChannel[] }

/** True when the new current pattern lays out differently from the previous one. */
export function layoutInputsChanged(
  prev: { patterns: LayoutPattern[]; currentPatternIndex: number },
  next: { patterns: LayoutPattern[]; currentPatternIndex: number },
): boolean {
  const a = prev.patterns[prev.currentPatternIndex]?.channels ?? [];
  const b = next.patterns[next.currentPatternIndex]?.channels ?? [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!!a[i].collapsed !== !!b[i].collapsed) return true;
    if ((a[i].channelMeta?.effectCols ?? 2) !== (b[i].channelMeta?.effectCols ?? 2)) return true;
    if ((a[i].channelMeta?.noteCols ?? 1) !== (b[i].channelMeta?.noteCols ?? 1)) return true;
    if ((a[i].channelMeta?.effectNotation ?? 'tracker') !== (b[i].channelMeta?.effectNotation ?? 'tracker')) return true;
  }
  return false;
}

/** A layout that never arrives (a protocol bug) must freeze the picture for no longer than this. */
export const LAYOUT_HOLD_MAX_MS = 500;

/** Worker side: may the renderer draw now? */
export class LayoutHold {
  private since: number | null = null;

  /** A `patterns` message arrived. */
  patterns(awaitLayout: boolean | undefined, now: number): void {
    this.since = awaitLayout ? now : null;
  }

  /** A `channelLayout` message arrived. */
  layout(): void {
    this.since = null;
  }

  canDraw(now: number): boolean {
    if (this.since === null) return true;
    if (now - this.since > LAYOUT_HOLD_MAX_MS) { this.since = null; return true; }
    return false;
  }
}
