/**
 * djLayout - the DJ view's one layout source (DJ-VIEW-RESOLUTIONS).
 *
 * `djLayout(input)` is a pure function from the DJ view's measured box and what
 * is on it (decks, waveforms, dub bus) to every size the DJ bands render with.
 * Components read the result from `useDJLayoutContext()` instead of carrying
 * their own `h-44`, `size={64}` or `SIZE = 96`.
 *
 *   decisions (thresholds)   DJ_LAYOUT_LIMITS   src/hooks/useBreakpoint.ts
 *   measurements (px)        DJ_SIZES           below
 *
 * A band is given a budget from DJ_SIZES; whether the real content is taller than
 * its budget is a real-browser fact, checked by the `get_dj_layout_fit` sweep
 * (thoughts/shared/plans/2026-10-14-dj-view-resolutions.md, DJVR-29).
 */

import { DJ_LAYOUT_LIMITS } from '@hooks/useBreakpoint';

export type DjPointer = 'fine' | 'coarse';
export type DjScale = 'large' | 'regular' | 'compact';
export type DjStep = 'mixerExtrasPopover' | 'shortWaveforms' | 'deckPanelOnDemand' | 'compact';
export type DjKnobSize = 'xs' | 'sm' | 'md';
export type DjDeckCKind = 'track' | 'scratchOnly' | null;

/** Every px a DJ band renders with. Measured in real Chrome unless a comment says estimate. */
export const DJ_SIZES = {
  /** Heights include the strip's 1 px border. Short leaves the 16 px overview + a 24 px zoom window. */
  waveform: { large: 80, regular: 64, short: 42 },
  waveformBorder: 0,
  waveformStripBorder: 1,
  platter: { large: 144, regular: 96, compact: 64 },
  scope: { large: 96, regular: 64, compact: 40 },
  transportButton: { large: 40, regular: 40, compact: 32 },
  panelBody: { large: 240, regular: 176 },
  tabStrip: 26,
  /** Gap between the tab strip and the docked panel body. */
  tabGap: 4,
  /** Deck header row = title + scopes + track info; platter (<= this) sits beside it. */
  headerExtra: 76,
  /** Text column of the scratch-only Deck C header (no scopes); the platter beside it can be taller. */
  scratchOnlyText: 71,
  overview: 24,
  deckCLanes: 44,
  /** Scratch-only Deck C below the lanes: record select, then the pad grid (scrolls inside). */
  scratchRecordSelect: 24,
  scratchPadRow: 42,
  /** p-3 / p-2 inside the 1 px deck border. */
  deckPadding: { large: 12, regular: 12, compact: 8 },
  deckBorder: 2,
  deckGap: { large: 8, regular: 8, compact: 4 },
  /** Transport + nudge wrap onto a second row below this inner width (4 buttons + 2 + gaps). */
  transportRowGap: 8,
  mixer: {
    knobRows: { large: 315, regular: 245, compact: 207 },
    crossfader: { large: 65, regular: 65, compact: 40 },
    camelot: { large: 180, regular: 148, compact: 148 },
    transition: 37,
    camelotWheel: { large: 140, regular: 108, compact: 108 },
    fxWet: 29,
    masterCue: { large: 236, regular: 200, compact: 89 },
    broadcast: 31,
    /** gap-2 / gap-1 between the rows, and p-2 / p-1 around them plus the 1 px border. */
    gap: { large: 8, regular: 8, compact: 4 },
    chrome: { large: 18, regular: 18, compact: 10 },
    /** Content width of the mixer column (the widest row). Measured regular and compact; large is an estimate. */
    width: { 2: { large: 330, regular: 282, compact: 309 }, 3: { large: 470, regular: 416, compact: 383 } },
  },
  /** p-2 around the deck grid. */
  gridPad: 16,
  gridGap: 8,
  /** The DJ top bar: one row at 43 px; it wraps onto a second row (75-79 px) below ~1580 px wide. */
  topBar: { single: 43, wrapped: 79, contentWidth: 1580 },
} as const;

export interface DjLayoutInput {
  /** DJ view root width. */
  width: number;
  /** DJ view root height minus the measured top bar. */
  height: number;
  deckCount: 2 | 3;
  deckC: DjDeckCKind;
  /** Decks whose waveform strip renders (they have peaks). */
  waveformCount: number;
  /** FX WET row in the mixer. */
  dubBusOn: boolean;
  pointer: DjPointer;
}

export interface DjLayout {
  /** The input this layout was solved from (read by get_dj_layout_fit). */
  input: DjLayoutInput;
  scale: DjScale;
  steps: readonly DjStep[];
  waveformHeight: number;
  /** Height of the deck / mixer row. */
  rowHeight: number;
  /** grid-template-columns */
  columns: string;
  mixer: { extras: 'inline' | 'popover'; fxWet: 'inline' | 'popover'; knob: DjKnobSize; compact: boolean; needed: number; width: number; camelotWheel: number };
  deck: {
    width: number;
    panel: 'docked' | 'onDemand';
    panelBodyHeight: number;
    platter: number;
    scope: number;
    transportButton: number;
    gap: number;
    padding: number;
    /** Height of the pattern area per deck kind (negative when nothing is left). */
    patternHeight: { track: number; trackC: number };
    showPattern: { track: boolean; trackC: boolean };
    /** Tallest deck's need excluding the pattern area. */
    need: number;
  };
  /** Budgeted height of each band (px); written to data-dj-budget so the real-browser probe can compare. */
  budgets: Readonly<Record<string, number>>;
  /** Below the smallest fit: the DJ view scrolls; minHeight is the deck/mixer grid's height then. */
  floor: { scroll: boolean; minHeight: number };
  /** D5 undecided - consumed by DJ-VIEW-TOUCH. Exempt from the every-knob-moves-output rule. */
  pointer: DjPointer;
}

interface State {
  scale: DjScale;
  large: boolean;
  extras: 'inline' | 'popover';
  shortWaveforms: boolean;
  panel: 'docked' | 'onDemand';
  compact: boolean;
}

const STEPS: ReadonlyArray<{ step: DjStep; affects: 'mixer' | 'decks' | 'both' }> = [
  { step: 'mixerExtrasPopover', affects: 'mixer' },
  { step: 'shortWaveforms', affects: 'both' },
  { step: 'deckPanelOnDemand', affects: 'decks' },
  { step: 'compact', affects: 'both' },
];

type SizeKey = 'large' | 'regular' | 'compact';
const sizeKey = (s: State): SizeKey => (s.compact ? 'compact' : s.large ? 'large' : 'regular');
const platterKey = sizeKey;

function waveformHeight(s: State): number {
  if (s.large && !s.shortWaveforms) return DJ_SIZES.waveform.large;
  return s.shortWaveforms ? DJ_SIZES.waveform.short : DJ_SIZES.waveform.regular;
}

function waveformStrip(s: State, count: number): number {
  if (count === 0) return 0;
  return count * (waveformHeight(s) + DJ_SIZES.waveformBorder) + DJ_SIZES.waveformStripBorder;
}

function rowHeightOf(s: State, input: DjLayoutInput): number {
  return input.height - waveformStrip(s, input.waveformCount) - DJ_SIZES.gridPad;
}

function mixerWidthOf(s: State, input: DjLayoutInput): number {
  const key = s.compact ? 'compact' : s.large ? 'large' : 'regular';
  return DJ_SIZES.mixer.width[input.deckCount][key];
}

function deckWidthOf(s: State, input: DjLayoutInput): number {
  const columns = input.deckCount + 1;
  const gaps = (columns - 1) * DJ_SIZES.gridGap;
  return (input.width - DJ_SIZES.gridPad - mixerWidthOf(s, input) - gaps) / input.deckCount;
}

function knobOf(s: State): DjKnobSize {
  return s.compact ? 'xs' : s.large ? 'md' : 'sm';
}

/** Height the mixer column needs in this state. */
export function mixerNeed(s: State, dubBusOn: boolean): number {
  const key = sizeKey(s);
  const m = DJ_SIZES.mixer;
  const rows: number[] = [m.knobRows[key], m.crossfader[key], m.masterCue[key]];
  if (s.extras === 'inline') rows.push(m.camelot[key], m.transition, m.broadcast);
  // FX WET is inline until the mixer goes compact; then it joins the extras popover.
  if (dubBusOn && !s.compact) rows.push(m.fxWet);
  return rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * m.gap[key] + m.chrome[key];
}

function transportWraps(s: State, deckWidth: number): boolean {
  const key = sizeKey(s);
  const btn = DJ_SIZES.transportButton[key];
  const inner = deckWidth - 2 * DJ_SIZES.deckPadding[key] - DJ_SIZES.deckBorder;
  return inner < 4 * btn + 3 * 8 + 8 + 2 * btn + 4;
}

/** Scratch-only Deck C header: the text column or the platter, whichever is taller. */
function scratchHeader(key: SizeKey): number {
  return Math.max(DJ_SIZES.scratchOnlyText, DJ_SIZES.platter[key]);
}

type DeckKind = 'track' | 'trackC' | 'scratchOnly';

/** Height one deck kind needs in this state, excluding the pattern area. */
function deckNeedBase(s: State, kind: DeckKind, deckWidth: number): number {
  const key = sizeKey(s);
  const pad = 2 * DJ_SIZES.deckPadding[key] + DJ_SIZES.deckBorder;
  const gap = DJ_SIZES.deckGap[key];
  if (kind === 'scratchOnly') {
    const rows = [scratchHeader(key), DJ_SIZES.deckCLanes, DJ_SIZES.scratchRecordSelect, DJ_SIZES.scratchPadRow];
    return pad + rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * gap;
  }
  const btn = DJ_SIZES.transportButton[key];
  const header = DJ_SIZES.headerExtra + DJ_SIZES.scope[key];
  const transport = transportWraps(s, deckWidth) ? 2 * btn + DJ_SIZES.transportRowGap : btn;
  const panel = s.panel === 'docked'
    ? DJ_SIZES.tabStrip + DJ_SIZES.tabGap + (s.large ? DJ_SIZES.panelBody.large : DJ_SIZES.panelBody.regular)
    : DJ_SIZES.tabStrip;
  const rows = [header, DJ_SIZES.overview, transport, panel];
  if (kind === 'trackC') rows.push(DJ_SIZES.deckCLanes);
  // the pattern area is the sixth row of a track deck: it carries one gap too
  return pad + rows.reduce((a, b) => a + b, 0) + rows.length * gap;
}

function deckKinds(input: DjLayoutInput): DeckKind[] {
  const kinds: DeckKind[] = ['track', 'track'];
  if (input.deckCount === 3) kinds.push(input.deckC === 'track' ? 'trackC' : 'scratchOnly');
  return kinds;
}

function deckNeedMax(s: State, input: DjLayoutInput, withPattern: boolean): number {
  const w = deckWidthOf(s, input);
  return Math.max(
    ...deckKinds(input).map((k) => {
      const base = deckNeedBase(s, k, w);
      return k === 'scratchOnly' || !withPattern ? base : base + DJ_LAYOUT_LIMITS.patternMinPx;
    }),
  );
}

function misfits(s: State, input: DjLayoutInput): { mixer: boolean; decks: boolean } {
  const row = rowHeightOf(s, input);
  return {
    mixer: mixerNeed(s, input.dubBusOn) > row,
    // D1: once `compact` is applied the pattern view may vanish, so it no longer has to fit.
    decks: deckNeedMax(s, input, !s.compact) > row,
  };
}

function apply(s: State, step: DjStep): State {
  switch (step) {
    case 'mixerExtrasPopover': return { ...s, extras: 'popover' };
    case 'shortWaveforms': return { ...s, shortWaveforms: true };
    case 'deckPanelOnDemand': return { ...s, panel: 'onDemand' };
    case 'compact': return { ...s, compact: true, scale: 'compact' };
  }
}

export function djLayout(input: DjLayoutInput): DjLayout {
  let state: State = { scale: 'regular', large: false, extras: 'inline', shortWaveforms: false, panel: 'docked', compact: false };

  // D4: a roomy screen grows the controls, provided the large sizes still fit.
  const large: State = { ...state, scale: 'large', large: true };
  const roomy = deckWidthOf(large, input) >= DJ_LAYOUT_LIMITS.largeDeckWidthPx && rowHeightOf(large, input) >= DJ_LAYOUT_LIMITS.largeRowPx;
  if (roomy) {
    const m = misfits(large, input);
    if (!m.mixer && !m.decks) state = large;
  }

  const steps: DjStep[] = [];
  for (const { step, affects } of STEPS) {
    const m = misfits(state, input);
    if (!m.mixer && !m.decks) break;
    if (affects === 'both' ? true : m[affects === 'mixer' ? 'mixer' : 'decks']) {
      state = apply(state, step);
      steps.push(step);
    }
  }

  const key = sizeKey(state);
  const rowHeight = rowHeightOf(state, input);
  const deckWidth = deckWidthOf(state, input);
  const finalMisfit = misfits(state, input);
  const trackBase = deckNeedBase(state, 'track', deckWidth);
  const trackCBase = deckNeedBase(state, 'trackC', deckWidth);
  const patternTrack = rowHeight - trackBase;
  const patternTrackC = rowHeight - trackCBase;
  const mixerW = mixerWidthOf(state, input);
  const need = Math.max(mixerNeed(state, input.dubBusOn), deckNeedMax(state, input, false));

  return {
    input,
    scale: state.scale,
    steps,
    waveformHeight: waveformHeight(state),
    rowHeight,
    columns: `minmax(0,1fr) auto minmax(0,1fr)${input.deckCount === 3 ? ' minmax(0,1fr)' : ''}`,
    mixer: { extras: state.extras, fxWet: state.compact ? 'popover' : 'inline', knob: knobOf(state), compact: state.compact, needed: mixerNeed(state, input.dubBusOn), width: mixerW, camelotWheel: DJ_SIZES.mixer.camelotWheel[key] },
    deck: {
      width: deckWidth,
      panel: state.panel,
      panelBodyHeight: state.large ? DJ_SIZES.panelBody.large : DJ_SIZES.panelBody.regular,
      platter: DJ_SIZES.platter[platterKey(state)],
      scope: DJ_SIZES.scope[key],
      transportButton: DJ_SIZES.transportButton[key],
      gap: DJ_SIZES.deckGap[key],
      padding: DJ_SIZES.deckPadding[key],
      patternHeight: { track: patternTrack, trackC: patternTrackC },
      showPattern: {
        track: patternTrack >= DJ_LAYOUT_LIMITS.patternMinPx,
        trackC: patternTrackC >= DJ_LAYOUT_LIMITS.patternMinPx,
      },
      need: deckNeedMax(state, input, false),
    },
    budgets: {
      waveform: waveformHeight(state) + DJ_SIZES.waveformBorder,
      knobs: DJ_SIZES.mixer.knobRows[key],
      crossfader: DJ_SIZES.mixer.crossfader[key],
      camelot: DJ_SIZES.mixer.camelot[key],
      transition: DJ_SIZES.mixer.transition,
      fxWet: DJ_SIZES.mixer.fxWet,
      masterCue: DJ_SIZES.mixer.masterCue[key],
      broadcast: DJ_SIZES.mixer.broadcast,
      header: DJ_SIZES.headerExtra + DJ_SIZES.scope[key],
      scratchHeader: scratchHeader(key),
      overview: DJ_SIZES.overview,
      lanes: DJ_SIZES.deckCLanes,
      transport: DJ_SIZES.transportButton[key],
      panel: state.panel === 'docked'
        ? DJ_SIZES.tabStrip + DJ_SIZES.tabGap + (state.large ? DJ_SIZES.panelBody.large : DJ_SIZES.panelBody.regular)
        : DJ_SIZES.tabStrip,
    },
    floor: { scroll: finalMisfit.mixer || finalMisfit.decks, minHeight: need + DJ_SIZES.gridPad },
    pointer: input.pointer,
  };
}
