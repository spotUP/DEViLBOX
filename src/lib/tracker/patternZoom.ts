/**
 * The pattern zoom: the scale the pattern view is drawn at while fit all
 * channels is off. One range for the tracker (useUIStore.trackerZoom), the DJ
 * decks (useSettingsStore.deckPatternZoom) and the slider that sets them.
 * It may go below the fit floor: a hand-set size is the user's call.
 */
export const ZOOM_MIN_PERCENT = 50;
export const ZOOM_MAX_PERCENT = 200;
export const ZOOM_DEFAULT_PERCENT = 100;

export function clampZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) return ZOOM_DEFAULT_PERCENT;
  return Math.max(ZOOM_MIN_PERCENT, Math.min(ZOOM_MAX_PERCENT, Math.round(percent)));
}
