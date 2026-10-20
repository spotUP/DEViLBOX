/**
 * Shared channel layout data between PatternEditorCanvas and TrackScopesStrip.
 * PatternEditorCanvas writes layout on every frame; TrackScopesStrip reads it.
 * Using a plain mutable object (not a store) to avoid re-render overhead.
 */
export interface ChannelLayout {
  offsets: number[];
  widths: number[];
  scrollLeft: number;
  numChannels: number;
}

export const channelLayout: ChannelLayout = {
  offsets: [] as number[],
  widths: [] as number[],
  scrollLeft: 0,
  numChannels: 0,
};

const layoutListeners = new Set<() => void>();

/** Writers call this after changing channelLayout, so a sleeping reader redraws. */
export function notifyChannelLayout(): void {
  for (const fn of layoutListeners) fn();
}

export function subscribeChannelLayout(fn: () => void): () => void {
  layoutListeners.add(fn);
  return () => { layoutListeners.delete(fn); };
}

export interface ScopeCell { x: number; w: number }

/**
 * Where each channel's scope sits in the strip above the pattern editor. The
 * scopes span the strip edge to edge, each with its pattern column's share of
 * the width, and stay put while the editor scrolls sideways (owner,
 * 2026-10-20: "the scopes move when I scroll the channels"). Equal cells
 * across the width only while the editor has published no layout for these
 * channels.
 */
export function scopeCells(
  numChannels: number,
  stripWidth: number,
  layout: { offsets: readonly number[]; widths: readonly number[]; numChannels: number },
): ScopeCell[] {
  const aligned = layout.numChannels === numChannels
    && layout.offsets.length >= numChannels && layout.widths.length >= numChannels;
  const cells: ScopeCell[] = [];
  const gap = 1;
  if (aligned && numChannels > 0) {
    const first = layout.offsets[0];
    const last = layout.offsets[numChannels - 1] + layout.widths[numChannels - 1];
    if (last > first) {
      const scale = stripWidth / (last - first);
      for (let i = 0; i < numChannels; i++) {
        const x = Math.round((layout.offsets[i] - first) * scale);
        const end = i === numChannels - 1 ? stripWidth : Math.round((layout.offsets[i + 1] - first) * scale);
        cells.push({ x, w: Math.max(0, end - x - (i === numChannels - 1 ? 0 : gap)) });
      }
      return cells;
    }
  }
  const w = (stripWidth - (numChannels - 1) * gap) / numChannels;
  for (let i = 0; i < numChannels; i++) cells.push({ x: i * (w + gap), w });
  return cells;
}

/**
 * Share spare canvas width out across the channels so a few channels fill the
 * canvas. `widths` are the minimum widths (0 = a hidden channel, kept 0) and are never shrunk: with no spare
 * width (many channels, a narrow canvas) they come back unchanged and the
 * canvas scrolls. Each channel grows in proportion to its own minimum width;
 * the pattern renderer and hit-testing centre the cell text inside the wider
 * column, so the extra width becomes even padding either side of the notes.
 * Integer widths, the rounding remainder goes to the last channel so the
 * channels end exactly at the canvas edge. availableWidth <= 0 disables it.
 */
export function stretchChannelWidths(
  widths: readonly number[],
  leftEdge: number,
  availableWidth: number,
): number[] {
  const content = widths.reduce((a, b) => a + b, 0);
  const spare = availableWidth - leftEdge - content;
  if (availableWidth <= 0 || spare <= 0 || widths.length === 0 || content <= 0) return [...widths];
  const out = widths.map(w => w + Math.floor((spare * w) / content));
  const given = out.reduce((a, b) => a + b, 0) - content;
  // The remainder goes to the last SHOWN channel: a hidden channel is width 0 and stays 0.
  let last = out.length - 1;
  while (last > 0 && out[last] === 0) last--;
  out[last] += spare - given;
  return out;
}

/** Width of the "+" (Add Channel) column at the right end of the channel header, DOM px. */
export const ADD_CHANNEL_BUTTON_PX = 48;

/**
 * Canvas width the channels may fill. When the Add Channel button is shown it
 * keeps its own column at the right: channels stretched to the full canvas
 * width pushed it past the clipped header edge, so there was no way to add a
 * channel (owner 2026-10-20).
 */
export function channelAreaWidth(canvasWidth: number, showAddChannel: boolean): number {
  return showAddChannel ? Math.max(0, canvasWidth - ADD_CHANNEL_BUTTON_PX) : canvasWidth;
}

/** Pattern font size at scale 1 (px); the renderers draw at this size. */
export const PATTERN_FONT_PX = 14;

/**
 * The scale (<= 1) at which every channel fits the canvas width. `widths` are
 * the channels' minimum widths and `leftEdge` the gutter before channel 0, both
 * at scale 1. Shrink only: channels that already fit return 1 (never enlarge).
 * There is no lower limit: fit on means every channel is on screen, however
 * small the text gets (owner 2026-10-20, after a 10 px floor left the last
 * channel of a 7-channel song half off screen). The zoom slider is the tool for
 * a readable size. Unknown width (<= 0) returns 1.
 */
export function fitChannelScale(
  widths: readonly number[],
  leftEdge: number,
  availableWidth: number,
): number {
  const content = leftEdge + widths.reduce((a, b) => a + b, 0);
  if (availableWidth <= 0 || widths.length === 0 || content <= availableWidth) return 1;
  return availableWidth / content;
}

export interface FittedChannelWidths {
  /** Scale the pattern is drawn at; 1 when nothing was shrunk. */
  scale: number;
  /** `leftEdge` at the chosen scale, whole canvas px. */
  leftEdge: number;
  /** Channel widths in canvas px: shrunk to fit, then spare width stretched. */
  widths: number[];
}

/**
 * Fit first, then stretch: shrink the channels (when `fit` is on) so all of
 * them fit the canvas, then share any spare width out with stretchChannelWidths.
 * With fit off the pattern is drawn at `manualScale` (the zoom slider) instead.
 * Shrunk widths are floored so their sum never passes the canvas width.
 */
export function fitAndStretchChannelWidths(
  minWidths: readonly number[],
  leftEdge: number,
  availableWidth: number,
  fit: boolean,
  manualScale: number = 1,
): FittedChannelWidths {
  // Fit on: the scale that fits. Fit off: the hand-set zoom (1 = the base font).
  const scale = fit ? fitChannelScale(minWidths, leftEdge, availableWidth) : manualScale;
  const scaled = scale === 1 ? [...minWidths] : minWidths.map(w => Math.floor(w * scale));
  const edge = Math.floor(leftEdge * scale);
  return { scale, leftEdge: edge, widths: stretchChannelWidths(scaled, edge, availableWidth) };
}
