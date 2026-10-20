/**
 * Which channels the pattern views show.
 *
 * A Furnace chip can have 32 channels while the song writes 9 of them; the
 * grid, the headers, the scope strip, the VU meters and the fit-all-channels
 * scale all draw the same list, and that list is this mask. A channel is
 * visible when it holds data in ANY pattern of the song (so the columns do not
 * change from pattern to pattern), or when it was added by hand, or while the
 * cursor stands on it. Hidden is not deleted: the song and every export keep
 * all channels.
 *
 * The rule is the same for every format that plays through the classic
 * channel grid, with one exception: a song of four channels or fewer shows all
 * of them (a four-channel Amiga module's channel count is part of its
 * identity). Format-mode editors (one canvas per channel, matrices) draw their
 * own channel lists and do not use this mask.
 */
import type { ChannelData, Pattern, TrackerCell } from '@typedefs/tracker';

/** Songs with this many channels or fewer always show every channel. */
export const ALWAYS_SHOW_CHANNELS_UP_TO = 4;

const NUMERIC_CELL_FIELDS: readonly (keyof TrackerCell)[] = [
  'note', 'instrument', 'volume', 'effTyp', 'eff', 'effTyp2', 'eff2',
  'effTyp3', 'eff3', 'effTyp4', 'eff4', 'effTyp5', 'eff5', 'effTyp6', 'eff6', 'effTyp7', 'eff7', 'effTyp8', 'eff8',
  'flag1', 'flag2', 'cutoff', 'resonance', 'envMod', 'pan', 'probability',
  'note2', 'instrument2', 'volume2', 'note3', 'instrument3', 'volume3', 'note4', 'instrument4', 'volume4',
];

export function cellHasData(cell: TrackerCell | undefined): boolean {
  if (!cell) return false;
  for (const f of NUMERIC_CELL_FIELDS) {
    const v = cell[f];
    if (typeof v === 'number' && v !== 0) return true;
  }
  return false;
}

// An edit replaces only the channel it touched (immer), so a channel's verdict
// is cached on its rows array and survives every edit elsewhere.
const dataCache = new WeakMap<object, boolean>();

export function channelHasData(channel: ChannelData): boolean {
  const cached = dataCache.get(channel.rows);
  if (cached !== undefined) return cached;
  const has = channel.rows.some(cellHasData);
  dataCache.set(channel.rows, has);
  return has;
}

export interface VisibleChannelOptions {
  /** Settings > show unused channels: every channel is visible. */
  showUnused?: boolean;
  /** The channel the cursor stands on; it is shown even when empty. */
  revealChannel?: number;
}

/** One flag per channel of the song: true = shown. All true when nothing would be hidden. */
export function visibleChannelMask(patterns: readonly Pattern[], opts: VisibleChannelOptions = {}): boolean[] {
  const count = patterns.reduce((m, p) => Math.max(m, p.channels.length), 0);
  const all = (): boolean[] => new Array<boolean>(count).fill(true);
  if (opts.showUnused || count <= ALWAYS_SHOW_CHANNELS_UP_TO) return all();

  const mask = new Array<boolean>(count).fill(false);
  for (const p of patterns) {
    p.channels.forEach((ch, i) => {
      if (!mask[i] && (channelHasData(ch) || ch.channelMeta?.addedAfterImport || ch.channelMeta?.alwaysShow)) mask[i] = true;
    });
  }
  // A song with no data at all (a new project) shows everything to write into.
  if (!mask.some(Boolean)) return all();
  const reveal = opts.revealChannel;
  if (reveal !== undefined && reveal >= 0 && reveal < count) mask[reveal] = true;
  return mask;
}

export function visibleChannelCount(mask: readonly boolean[]): number {
  return mask.reduce((n, v) => n + (v ? 1 : 0), 0);
}

/** Primitive form of a mask, for a store selector that must not re-render on equal masks. */
export function channelMaskKey(mask: readonly boolean[]): string {
  return mask.map(v => (v ? '1' : '0')).join('');
}

export function maskFromKey(key: string): boolean[] {
  return Array.from(key, c => c === '1');
}

/** Whether channel `i` is shown; channels past the mask are shown. */
export function isChannelVisible(mask: readonly boolean[] | undefined, i: number): boolean {
  return !mask || mask[i] !== false;
}

/**
 * The channel the cursor lands on one step left/right. Hidden channels are
 * skipped. Stepping right off the last shown channel onto a hidden one reveals
 * it (the cursor then stands on it); past the last channel it wraps.
 */
export function stepChannel(mask: readonly boolean[], from: number, dir: -1 | 1, count: number): number {
  if (dir === 1) {
    for (let i = from + 1; i < count; i++) if (isChannelVisible(mask, i)) return i;
    if (from + 1 < count) return from + 1;
    for (let i = 0; i < count; i++) if (isChannelVisible(mask, i)) return i;
    return 0;
  }
  for (let i = from - 1; i >= 0; i--) if (isChannelVisible(mask, i)) return i;
  for (let i = count - 1; i >= 0; i--) if (isChannelVisible(mask, i)) return i;
  return count - 1;
}
