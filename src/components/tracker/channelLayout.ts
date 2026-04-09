/**
 * Shared channel layout data between PatternEditorCanvas and TrackScopesStrip.
 * PatternEditorCanvas writes layout on every frame; TrackScopesStrip reads it.
 * Using a plain mutable object (not a store) to avoid re-render overhead.
 */
export const channelLayout = {
  offsets: [] as number[],
  widths: [] as number[],
  scrollLeft: 0,
  numChannels: 0,
};
