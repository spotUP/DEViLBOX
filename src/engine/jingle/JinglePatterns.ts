/**
 * JinglePatterns — Animates the tracker pattern editor during jingle playback.
 *
 * Each of the 6 channels becomes a spectrum-analyser bar: lit rows spread
 * symmetrically from the centre of the pattern based on the amplitude of that
 * channel's frequency band.  Low frequencies on the left, highs on the right.
 *
 * Enhancements:
 * - Volume column (#7): lit rows show a volume gradient — centre row peaks,
 *   outer rows taper off, so the vol column reads as a visual meter.
 * - Waveform history row (#6): the bottom row scrolls a rolling RMS amplitude
 *   snapshot left across all 6 channels, like a tiny oscilloscope tail.
 * - Band name labels (#10): channels are temporarily renamed to frequency-band
 *   labels (SUB / BASS / MID-L / MID-H / HI / AIR) while the jingle plays.
 *
 * No patterns are added or removed, so the pattern list never jumps.  The
 * current pattern's cells are modified in place and fully restored on teardown.
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import type { TrackerCell } from '@typedefs';
import { EMPTY_CELL } from '@typedefs';
import { getJingleEngine } from './JingleEngine';

// ── Constants ─────────────────────────────────────────────────────────────────

const PATTERN_LENGTH = 16;
const JINGLE_CHANNEL_COUNT = 6; // expand to this many channels for the animation
const UPDATE_MS = 50;           // 20 fps — smooth without canvas flicker

/** Frequency-band labels shown in channel headers during jingle (#10). */
const BAND_NAMES = ['SUB', 'BASS', 'MID-L', 'MID-H', 'HI', 'AIR'] as const;

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
let injectedNumCh = 0;
let rafHandle: number | null = null;
let freqBuf: Uint8Array<ArrayBuffer> | null = null;
let timeBuf: Uint8Array<ArrayBuffer> | null = null;
/** Rolling amplitude history for the waveform scroll row (#6). */
let waveHistory: number[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Write one update frame to the current pattern's channels.
 *
 * Each channel maps to a linear frequency band.  Amplitude drives how many rows
 * are lit, spreading symmetrically from the centre row outward.
 *
 * Volume column: lit rows carry a gradient — centre = peak volume, edges taper
 * down so the vol column reads as a continuous VU meter (#7).
 *
 * Bottom row: scrolling RMS amplitude history across all channels (#6).
 */
function updateChannels(guardPatternIdx: number): void {
  // Only animate the pattern we were invoked on — don't corrupt other patterns
  // if the user manually switches away during playback.
  if (useTrackerStore.getState().currentPatternIndex !== guardPatternIdx) return;

  const analyser = getJingleEngine().getAnalyser();
  if (!analyser) return;

  if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
    freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  }
  if (!timeBuf || timeBuf.length !== analyser.fftSize) {
    timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }
  analyser.getByteFrequencyData(freqBuf);
  analyser.getByteTimeDomainData(timeBuf);

  // Compute overall RMS for the waveform history scroll (#6)
  let rmsSum = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const s = (timeBuf[i]! - 128) / 128;
    rmsSum += s * s;
  }
  const rmsNow = Math.sqrt(rmsSum / timeBuf.length);

  // Shift waveHistory left and push new value (#6 scrolling row)
  if (waveHistory.length < injectedNumCh) {
    waveHistory = Array(injectedNumCh).fill(0);
  }
  for (let i = 0; i < waveHistory.length - 1; i++) {
    waveHistory[i] = waveHistory[i + 1]!;
  }
  waveHistory[waveHistory.length - 1] = rmsNow;

  const numCh = injectedNumCh;
  const center = Math.floor(PATTERN_LENGTH / 2); // row 8
  // The very last row is reserved for the waveform history scroll (#6)
  const vuBottom = PATTERN_LENGTH - 2; // VU bars stop at row 14 (0-indexed)

  for (let ch = 0; ch < numCh; ch++) {
    // Linear frequency band for this channel
    const bandStart = Math.floor(ch * freqBuf.length / numCh);
    const bandEnd   = Math.floor((ch + 1) * freqBuf.length / numCh);
    const count = Math.max(1, bandEnd - bandStart);
    let sum = 0;
    for (let i = bandStart; i < bandEnd; i++) sum += freqBuf[i]!;
    const level = sum / (count * 255); // 0–1

    // Rows spread symmetrically from centre; clamp so they don't reach row 15
    const halfOpen = Math.min(
      Math.max(1, Math.round(level * center)),
      center - Math.floor((PATTERN_LENGTH - 1 - vuBottom) / 2 + 1),
    );

    const rows: TrackerCell[] = Array.from(
      { length: PATTERN_LENGTH },
      () => ({ ...EMPTY_CELL }),
    );

    for (let r = center - halfOpen; r <= center + halfOpen; r++) {
      if (r >= 0 && r <= vuBottom) {
        // Volume gradient (#7): peak at centre, taper toward edges
        const dist = Math.abs(r - center);
        const volFraction = Math.max(0, 1 - dist / (halfOpen + 1));
        const vol = Math.max(1, Math.round(volFraction * level * 64));
        rows[r] = { ...BASE_LIT_CELL, volume: vol };
      }
    }

    // Waveform history scroll row (#6): light bottom cell if this channel's
    // history slot exceeds a quiet threshold
    const histAmp = waveHistory[ch] ?? 0;
    if (histAmp > 0.03) {
      const waveVol = Math.round(Math.min(histAmp * 2, 1) * 64);
      rows[PATTERN_LENGTH - 1] = { ...BASE_LIT_CELL, volume: waveVol };
    }

    useTrackerStore.getState().setChannelRows(ch, rows);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called before jingle starts.
 * - Expands patterns to JINGLE_CHANNEL_COUNT (adds channels to ALL patterns)
 * - Saves current pattern's cell data and channel names for later restoration
 * - Sets frequency-band labels in channel headers (#10)
 * - Starts the rAF animation loop
 */
export function injectMouthPatterns(): void {
  const tracker = useTrackerStore.getState();

  // ① Expand to 6 channels (addPattern inherits from patterns[0], so expand first)
  savedOriginalChannelCount = tracker.patterns[0]?.channels.length ?? 4;
  const channelsToAdd = Math.max(0, JINGLE_CHANNEL_COUNT - savedOriginalChannelCount);
  for (let i = 0; i < channelsToAdd; i++) {
    useTrackerStore.getState().addChannel();
  }

  injectedNumCh = Math.min(
    useTrackerStore.getState().patterns[0]?.channels.length ?? JINGLE_CHANNEL_COUNT,
    JINGLE_CHANNEL_COUNT,
  );

  // ② Save current channel names then set band labels (#10)
  const { patterns: currentPatterns } = useTrackerStore.getState();
  savedChannelNames = (currentPatterns[0]?.channels ?? [])
    .slice(0, injectedNumCh)
    .map(ch => ch.name);
  for (let i = 0; i < injectedNumCh; i++) {
    useTrackerStore.getState().updateChannelName(i, BAND_NAMES[i] ?? `CH${i + 1}`);
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

  // Reset wave history for fresh start
  waveHistory = Array(injectedNumCh).fill(0);

  // ⑤ Start rAF loop — schedule next frame first so teardown can always cancel
  let lastUpdateTime = 0;
  const loop = () => {
    rafHandle = requestAnimationFrame(loop);
    const analyser = getJingleEngine().getAnalyser();
    if (!analyser) return; // wait for play() to create the analyser
    const now = performance.now();
    if (now - lastUpdateTime < UPDATE_MS) return;
    lastUpdateTime = now;
    updateChannels(savedPatternIndex!);
  };
  rafHandle = requestAnimationFrame(loop);
}

/**
 * Called after jingle ends.
 * - Stops the animation loop
 * - Restores the original channel cell data and names
 * - Removes the extra channels that were added
 */
export function teardownMouthPatterns(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }

  // Restore channel names (#10)
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

  savedOriginalChannelCount = 0;
  savedPatternIndex = null;
  savedChannelData = null;
  savedChannelNames = [];
  injectedNumCh = 0;
  freqBuf = null;
  timeBuf = null;
  waveHistory = [];
}
