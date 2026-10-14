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
  /** The editor element the offsets are measured from (its left edge is offset 0). */
  origin?: HTMLElement | null;
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
 * Where each channel's scope sits in the strip above the pattern editor: over
 * its own pattern column (the editor's offsets and widths, minus its scroll),
 * so a scope lines up with the notes it shows. Equal cells across the width
 * only while the editor has published no layout for these channels.
 */
export function scopeCells(
  numChannels: number,
  stripWidth: number,
  layout: { offsets: readonly number[]; widths: readonly number[]; scrollLeft: number; numChannels: number },
  /** Editor's left edge minus the strip's left edge, in px: the strip can sit
   *  wider than the editor (over the order sidebar), so offsets shift by this. */
  originShift = 0,
): ScopeCell[] {
  const aligned = layout.numChannels === numChannels
    && layout.offsets.length >= numChannels && layout.widths.length >= numChannels;
  const cells: ScopeCell[] = [];
  const gap = 1;
  // When every channel is on screen (no horizontal scroll), the scopes span the
  // whole strip edge to edge (owner, 2026-10-14): each keeps its column's share
  // of the width, so the order of channels and their relative widths still
  // match the pattern columns below. A scrolled pattern keeps exact alignment.
  if (aligned && numChannels > 0) {
    const first = layout.offsets[0];
    const last = layout.offsets[numChannels - 1] + layout.widths[numChannels - 1];
    const left = originShift + first - layout.scrollLeft;
    const right = originShift + last - layout.scrollLeft;
    if (layout.scrollLeft === 0 && left >= 0 && right <= stripWidth && last > first) {
      const scale = stripWidth / (last - first);
      for (let i = 0; i < numChannels; i++) {
        const x = Math.round((layout.offsets[i] - first) * scale);
        const end = i === numChannels - 1 ? stripWidth : Math.round((layout.offsets[i + 1] - first) * scale);
        cells.push({ x, w: Math.max(0, end - x - (i === numChannels - 1 ? 0 : gap)) });
      }
      return cells;
    }
  }
  for (let i = 0; i < numChannels; i++) {
    if (aligned) {
      cells.push({ x: originShift + layout.offsets[i] - layout.scrollLeft, w: Math.max(0, layout.widths[i] - gap) });
    } else {
      const w = (stripWidth - (numChannels - 1) * gap) / numChannels;
      cells.push({ x: i * (w + gap), w });
    }
  }
  return cells;
}

/** How far the editor's left edge sits right of `strip`'s, in px (0 when unknown). */
export function originShiftFor(strip: HTMLElement, layout: ChannelLayout): number {
  const origin = layout.origin;
  if (!origin || !origin.isConnected) return 0;
  return origin.getBoundingClientRect().left - strip.getBoundingClientRect().left;
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

/** Pattern font size at scale 1 (px); the renderers draw at this size. */
export const PATTERN_FONT_PX = 14;
/**
 * Smallest pattern font the fit will shrink to (px). Below it the view scrolls sideways.
 * 10 px is the smallest text the app already sets for reading (compact panel labels are
 * 10 px; 9 px is kept for badges nobody reads in a row), and 7 px glyphs of a 14 px
 * monospace font (the old floor) smear into each other: the owner called fit-all
 * "too small to be useful" (2026-10-14). A song too wide for 10 px scrolls sideways
 * or the zoom slider goes lower by hand.
 */
export const FIT_MIN_FONT_PX = 10;
/** The smallest scale the fit will use: FIT_MIN_FONT_PX / PATTERN_FONT_PX. */
export const FIT_SCALE_FLOOR = FIT_MIN_FONT_PX / PATTERN_FONT_PX;

/**
 * The scale (<= 1) at which every channel fits the canvas width. `widths` are
 * the channels' minimum widths and `leftEdge` the gutter before channel 0, both
 * at scale 1. Shrink only: channels that already fit return 1 (never enlarge),
 * and the result never goes below `floor`, where the view scrolls sideways as
 * before. Unknown width (<= 0) returns 1.
 */
export function fitChannelScale(
  widths: readonly number[],
  leftEdge: number,
  availableWidth: number,
  floor: number = FIT_SCALE_FLOOR,
): number {
  const content = leftEdge + widths.reduce((a, b) => a + b, 0);
  if (availableWidth <= 0 || widths.length === 0 || content <= availableWidth) return 1;
  return Math.max(floor, availableWidth / content);
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
  floor: number = FIT_SCALE_FLOOR,
  manualScale: number = 1,
): FittedChannelWidths {
  // Fit on: the scale that fits. Fit off: the hand-set zoom (1 = the base font).
  const scale = fit ? fitChannelScale(minWidths, leftEdge, availableWidth, floor) : manualScale;
  const scaled = scale === 1 ? [...minWidths] : minWidths.map(w => Math.floor(w * scale));
  const edge = Math.floor(leftEdge * scale);
  return { scale, leftEdge: edge, widths: stretchChannelWidths(scaled, edge, availableWidth) };
}
