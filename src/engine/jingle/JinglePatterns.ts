/**
 * JinglePatterns — the pattern editor becomes a pair of lips that say
 * "DEViLBOX ready" while the startup jingle plays.
 *
 * JINGLE_CHANNEL_COUNT channels are the width of the mouth: the first and last
 * channel are the corners (always one closed cell on the centre row), the
 * channels between carry the upper and lower lip as two lit cells that move
 * apart when the mouth opens. The opening follows a lip curve across the
 * channels (lipProfile): full in the middle, falling to nothing at the corners,
 * flatter for a wide viseme (EE) and more pointed for a round one (O). Rows are
 * centred on row 8 of a 16-row window, so the cursor is parked on row 8 while
 * the jingle plays and the editor keeps the mouth in view.
 *
 * Driver: "visemes + live level". JINGLE_VISEMES is a hand-timed keyframe table
 * (one entry per syllable of the jingle, timings from
 * thoughts/shared/research/2026-10-17-jingle-word-timings.md). The viseme gives
 * the mouth shape, the live RMS from the jingle analyser scales how far the
 * lips open, and the lips shut whenever the signal is below SILENT_RMS. The
 * grid is restored and the cursor row put back in teardownMouthPatterns, which
 * runs when the engine reports the audible end of the jingle.
 *
 * No patterns are added or removed, so the pattern list never jumps. The
 * current pattern's cells are modified in place and fully restored.
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import type { TrackerCell } from '@typedefs';
import { EMPTY_CELL } from '@typedefs';
import { getJingleEngine } from './JingleEngine';

// ── Constants ─────────────────────────────────────────────────────────────────

const PATTERN_LENGTH = 16;
/** Channels across the mouth; more channels give a smoother lip curve. */
export const JINGLE_CHANNEL_COUNT = 12;
const UPDATE_MS = 50;           // 20 fps — smooth without canvas flicker

/** The row the lips are centred on; the cursor sits here while the jingle plays. */
export const MOUTH_CENTER_ROW = 8;
/** Widest opening: lips at rows 2 and 14 around row 8. */
const MAX_OPEN_ROWS = 6;
/** Below this RMS (0..1 of full scale) the lips are shut. */
export const SILENT_RMS = 0.02;
/** RMS at which a viseme reaches its full opening; louder clips to full. */
const FULL_RMS = 0.25;

/** Channel label while the mouth is on screen; the corners are Left and Right. */
const mouthName = (channel: number): string =>
  channel === 0 ? 'Left' : channel === JINGLE_CHANNEL_COUNT - 1 ? 'Right' : 'Lips';

export interface JingleViseme {
  /** Seconds from the start of the jingle. */
  start: number;
  end: number;
  /** The syllable or sound, for the record. */
  label: string;
  /** Mouth opening 0..1 at full level. 0 is lips shut (B, M, P). */
  open: number;
  /** 0 round (O), 1 wide (EE); scales the opening of the channels next to the corners. */
  wide: number;
}

/**
 * Hand-timed visemes for "DE-VIL-BOX ... RE-A-DY". Boundaries follow the
 * measured spectral gaps where there are any (0.90, 1.98, 2.35-2.52, 5.14);
 * the split inside READY is a guess. The table must be contiguous from 0 to
 * the audible end of the jingle: the test checks that.
 */
export const JINGLE_VISEMES: readonly JingleViseme[] = [
  { start: 0.00, end: 0.20, label: 'D',  open: 0.25, wide: 0.6 },
  { start: 0.20, end: 0.90, label: 'E',  open: 0.55, wide: 1.0 },
  { start: 0.90, end: 1.20, label: 'V',  open: 0.15, wide: 0.5 },
  { start: 1.20, end: 1.70, label: 'I',  open: 0.40, wide: 1.0 },
  { start: 1.70, end: 1.98, label: 'L',  open: 0.30, wide: 0.6 },
  { start: 1.98, end: 2.10, label: 'B',  open: 0.00, wide: 0.5 },
  { start: 2.10, end: 2.35, label: 'OX', open: 0.80, wide: 0.1 },
  { start: 2.35, end: 2.52, label: '',   open: 0.00, wide: 0.5 },
  { start: 2.52, end: 3.10, label: 'RE', open: 0.45, wide: 0.9 },
  { start: 3.10, end: 4.40, label: 'A',  open: 1.00, wide: 0.6 },
  { start: 4.40, end: 4.80, label: 'D',  open: 0.25, wide: 0.6 },
  { start: 4.80, end: 5.14, label: 'Y',  open: 0.50, wide: 1.0 },
  { start: 5.14, end: 6.09, label: '',   open: 0.00, wide: 0.5 },
];

const BASE_LIT_CELL: TrackerCell = {
  note: 49,      // C-4 — renders as a visible note cell
  instrument: 1,
  volume: 0,
  effTyp: 0,
  eff: 0,
  effTyp2: 0,
  eff2: 0,
};

// ── State ─────────────────────────────────────────────────────────────────────

let savedOriginalChannelCount = 0;
let savedPatternIndex: number | null = null;
let savedChannelData: TrackerCell[][] | null = null;
let savedChannelNames: string[] = [];
let savedCursorRow: number | null = null;
let injectedNumCh = 0;
/** Fit-all-channels setting before the jingle; the lips force it on so all 12 channels fit the width. */
let savedFitAllChannels: boolean | null = null;
/** True between injectMouthPatterns and teardownMouthPatterns; makes teardown idempotent. */
let overlayActive = false;
let rafHandle: number | null = null;
let timeBuf: Uint8Array<ArrayBuffer> | null = null;
let startedAt = 0;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** The viseme spoken at `seconds` into the jingle; shut lips after the table ends. */
export function visemeAt(seconds: number, table: readonly JingleViseme[] = JINGLE_VISEMES): JingleViseme {
  const hit = table.find((v) => seconds >= v.start && seconds < v.end);
  return hit ?? { start: seconds, end: seconds, label: '', open: 0, wide: 0.5 };
}

/**
 * Rows between the lip centre and each lip for one channel.
 * 0 means the lips touch (one lit cell on the centre row).
 */
export function mouthOpening(channel: number, viseme: JingleViseme, rms: number): number {
  if (rms < SILENT_RMS) return 0;
  const level = Math.min(1, rms / FULL_RMS);
  return Math.round(viseme.open * level * lipProfile(channel, viseme.wide) * MAX_OPEN_ROWS);
}

/**
 * How far a channel opens relative to the viseme, 0..1 across the mouth.
 * x runs from -1 (left corner) to 1 (right corner); the corners are always 0.
 * (1 - x^2)^k is an ellipse-like lip: k = 0.5 for a wide viseme (EE, the lips
 * next to the corners open almost as far as the middle), k = 2 for a round one
 * (O, only the middle opens).
 */
export function lipProfile(channel: number, wide: number): number {
  const half = (JINGLE_CHANNEL_COUNT - 1) / 2;
  const x = (channel - half) / half;
  if (Math.abs(x) >= 1) return 0;
  const k = 2 - 1.5 * Math.min(1, Math.max(0, wide));
  return Math.pow(1 - x * x, k);
}

/** The 16 cells of one mouth channel: upper lip, lower lip, empty between. */
export function mouthRows(opening: number, rms: number): TrackerCell[] {
  const rows: TrackerCell[] = Array.from({ length: PATTERN_LENGTH }, () => ({ ...EMPTY_CELL }));
  const volume = Math.max(1, Math.round(Math.min(1, rms / FULL_RMS) * 64));
  const lip = { ...BASE_LIT_CELL, volume };
  rows[MOUTH_CENTER_ROW - opening] = { ...lip };
  rows[MOUTH_CENTER_ROW + opening] = { ...lip };
  return rows;
}

function rmsOf(analyser: AnalyserNode): number {
  if (!timeBuf || timeBuf.length !== analyser.fftSize) {
    timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }
  analyser.getByteTimeDomainData(timeBuf);
  let sum = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const s = (timeBuf[i]! - 128) / 128;
    sum += s * s;
  }
  return Math.sqrt(sum / timeBuf.length);
}

// ── Frame ─────────────────────────────────────────────────────────────────────

function updateChannels(guardPatternIdx: number, seconds: number): void {
  // Only animate the pattern we were invoked on — don't corrupt other patterns
  // if the user manually switches away during playback.
  if (useTrackerStore.getState().currentPatternIndex !== guardPatternIdx) return;

  const analyser = getJingleEngine().getAnalyser();
  if (!analyser) return;

  const rms = rmsOf(analyser);
  const viseme = visemeAt(seconds);
  for (let ch = 0; ch < injectedNumCh; ch++) {
    useTrackerStore.getState().setChannelRows(ch, mouthRows(mouthOpening(ch, viseme, rms), rms));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called before jingle starts.
 * - Expands patterns to JINGLE_CHANNEL_COUNT (adds channels to ALL patterns)
 * - Saves current pattern's cell data, channel names and cursor row
 * - Parks the cursor on MOUTH_CENTER_ROW so the editor centres the mouth
 * - Starts the rAF animation loop
 */
export function injectMouthPatterns(): void {
  const tracker = useTrackerStore.getState();

  // ① Expand to JINGLE_CHANNEL_COUNT channels (addPattern inherits from patterns[0], so expand first).
  // Not `addChannel`: that is the user edit path and stops at the keyboard scheme's
  // channel cap (ProTracker: 4) and at the format-compatibility prompt. The lips are a
  // transient overlay that teardownMouthPatterns removes again, so they bypass both.
  if (overlayActive) return;
  overlayActive = true;
  savedOriginalChannelCount = tracker.patterns[0]?.channels.length ?? 4;
  injectedNumCh = Math.min(tracker.addOverlayChannels(JINGLE_CHANNEL_COUNT), JINGLE_CHANNEL_COUNT);

  // All lip channels must be on screen: force fit-all-channels (a manual zoom turns it off).
  savedFitAllChannels = useSettingsStore.getState().fitAllChannelsTracker;
  useSettingsStore.getState().setFitAllChannelsTracker(true);

  // ② Save current channel names then set the mouth labels
  const { patterns: currentPatterns } = useTrackerStore.getState();
  savedChannelNames = (currentPatterns[0]?.channels ?? [])
    .slice(0, injectedNumCh)
    .map(ch => ch.name);
  for (let i = 0; i < injectedNumCh; i++) {
    useTrackerStore.getState().updateChannelName(i, mouthName(i));
  }

  // ③ Remember which pattern we're modifying so we can restore it exactly
  savedPatternIndex = useTrackerStore.getState().currentPatternIndex;

  // ④ Save every channel row of the current pattern
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern) {
    savedChannelData = pattern.channels
      .slice(0, injectedNumCh)
      .map(ch => ch.rows.map(r => ({ ...r })));
  }

  // ⑤ Park the cursor on the mouth's centre row; the editor scrolls to it
  savedCursorRow = useCursorStore.getState().cursor.rowIndex;
  useCursorStore.getState().moveCursorToRow(MOUTH_CENTER_ROW);

  // ⑥ Start rAF loop — schedule next frame first so teardown can always cancel
  startedAt = performance.now();
  let lastUpdateTime = 0;
  const loop = () => {
    rafHandle = requestAnimationFrame(loop);
    const analyser = getJingleEngine().getAnalyser();
    if (!analyser) return; // wait for play() to create the analyser
    const now = performance.now();
    if (now - lastUpdateTime < UPDATE_MS) return;
    lastUpdateTime = now;
    updateChannels(savedPatternIndex!, (now - startedAt) / 1000);
  };
  rafHandle = requestAnimationFrame(loop);
}

/**
 * Called when the jingle reaches its audible end.
 * - Stops the animation loop
 * - Restores the original channel cell data, names and cursor row
 * - Removes the extra channels that were added
 */
export function teardownMouthPatterns(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  if (!overlayActive) return; // already torn down (onended and the stop path both call this)
  overlayActive = false;

  if (savedFitAllChannels !== null) {
    useSettingsStore.getState().setFitAllChannelsTracker(savedFitAllChannels);
    savedFitAllChannels = null;
  }

  // Restore channel names
  for (let i = 0; i < savedChannelNames.length; i++) {
    useTrackerStore.getState().updateChannelName(i, savedChannelNames[i] ?? `Channel ${i + 1}`);
  }

  // Restore the pattern we were animating
  if (savedPatternIndex !== null && savedChannelData !== null) {
    const { patterns } = useTrackerStore.getState();
    if (savedPatternIndex < patterns.length) {
      useTrackerStore.getState().setCurrentPattern(savedPatternIndex);
    }
    for (let ch = 0; ch < savedChannelData.length; ch++) {
      useTrackerStore.getState().setChannelRows(ch, savedChannelData[ch]!);
    }
  }

  // Remove the extra channels added for the jingle (restore original count)
  const currentCount = useTrackerStore.getState().patterns[0]?.channels.length ?? 0;
  const channelsToRemove = currentCount - savedOriginalChannelCount;
  for (let i = 0; i < channelsToRemove; i++) {
    const count = useTrackerStore.getState().patterns[0]?.channels.length ?? 0;
    if (count > savedOriginalChannelCount) {
      useTrackerStore.getState().removeChannel(count - 1);
    }
  }

  // Put the cursor back where the user had it
  if (savedCursorRow !== null) {
    useCursorStore.getState().moveCursorToRow(savedCursorRow);
  }

  savedOriginalChannelCount = 0;
  savedPatternIndex = null;
  savedChannelData = null;
  savedChannelNames = [];
  savedCursorRow = null;
  injectedNumCh = 0;
  timeBuf = null;
}
