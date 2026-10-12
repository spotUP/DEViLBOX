/**
 * The app's view registry: every main view, and every tracker sub-view.
 *
 * `activeView` holds one of MAIN_VIEWS; the tracker view shows one of
 * TRACKER_SUB_VIEWS. Anything that switches views by name - the MCP
 * set_active_view tool, the soak driver - resolves the name here, so a name
 * that is not a view is refused instead of being written into the store.
 * The MCP tool once offered 'mixer', 'studio', 'arrangement', 'split' and
 * 'pianoroll' and wrote them straight into activeView, which leaves the page
 * with no view mounted (2026-10-12).
 */

export const MAIN_VIEWS = ['tracker', 'dj', 'drumpad', 'vj'] as const;
export type MainView = typeof MAIN_VIEWS[number];

export const TRACKER_SUB_VIEWS = ['tracker', 'grid', 'pianoroll', 'matrix', 'sunvox'] as const;
export type TrackerSubView = typeof TRACKER_SUB_VIEWS[number];

/** Every name a view switch accepts: the main views plus the tracker sub-views. */
export const VIEW_TARGETS: readonly string[] = [
  ...MAIN_VIEWS,
  ...TRACKER_SUB_VIEWS.filter((v) => !(MAIN_VIEWS as readonly string[]).includes(v)),
];

export interface ResolvedView {
  activeView: MainView;
  /** Set only when the target names a tracker sub-view. */
  trackerViewMode?: TrackerSubView;
}

/** The main view (and tracker sub-view) a name selects, or null when it names no view. */
export function resolveViewTarget(name: unknown): ResolvedView | null {
  if (typeof name !== 'string') return null;
  if (name === 'tracker') return { activeView: 'tracker', trackerViewMode: 'tracker' };
  if ((MAIN_VIEWS as readonly string[]).includes(name)) return { activeView: name as MainView };
  if ((TRACKER_SUB_VIEWS as readonly string[]).includes(name)) {
    return { activeView: 'tracker', trackerViewMode: name as TrackerSubView };
  }
  return null;
}
