/**
 * Shared channel layout data between PatternEditorCanvas and TrackScopesStrip.
 * PatternEditorCanvas writes layout on every frame; TrackScopesStrip reads it.
 * Using a plain mutable object (not a store) to avoid re-render overhead.
 */
export interface ChannelLayout { offsets: number[]; widths: number[]; scrollLeft: number; numChannels: number }

export const channelLayout: ChannelLayout = {
  offsets: [] as number[],
  widths: [] as number[],
  scrollLeft: 0,
  numChannels: 0,
};

export interface ScopeCell { x: number; w: number }

/**
 * Where each channel's scope sits in the strip above the pattern editor: over
 * its own pattern column (the editor's offsets and widths, minus its scroll),
 * so a scope lines up with the notes it shows. Equal cells across the width
 * only while the editor has published no layout for these channels.
 */
export function scopeCells(
  numChannels: number,
  stripWidth: number,
  layout: { offsets: readonly number[]; widths: readonly number[]; scrollLeft: number; numChannels: number },
): ScopeCell[] {
  const aligned = layout.numChannels === numChannels
    && layout.offsets.length >= numChannels && layout.widths.length >= numChannels;
  const cells: ScopeCell[] = [];
  const gap = 1;
  for (let i = 0; i < numChannels; i++) {
    if (aligned) {
      cells.push({ x: layout.offsets[i] - layout.scrollLeft, w: Math.max(0, layout.widths[i] - gap) });
    } else {
      const w = (stripWidth - (numChannels - 1) * gap) / numChannels;
      cells.push({ x: i * (w + gap), w });
    }
  }
  return cells;
}
