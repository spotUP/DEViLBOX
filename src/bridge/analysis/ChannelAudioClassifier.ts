/**
 * Runtime per-channel role classification from the live audio tap.
 *
 * Phase 2 (SampleSpectrum) classifies instruments offline at song-load time
 * — great when a bass sample is the dominant instrument on a channel. But
 * classic dub / electronic tracks often rotate multiple instruments on one
 * channel (bass + sub + stab + vocal all on the same MOD channel), where
 * no single instrument reaches the 70%-dominance threshold that
 * classifyChannelWithInstruments needs to override the note-stats role.
 *
 * This module measures the channel's ACTUAL audio — from the WASM per-
 * channel isolation tap that feeds useOscilloscopeStore — and votes on a
 * runtime role. AutoDub merges the runtime hint with the offline role:
 * when offline says 'empty' or 'pad' (weak signal) and runtime strongly
 * disagrees (e.g. "this channel's low-end has dominated for 8 s"), the
 * runtime role wins.
 *
 * Pure-ish: module-level state for ring buffers, but the feature-extract
 * + classify path is the same SampleSpectrum helpers Phase 2 uses. No
 * WebAudio, no AnalyserNode — just Float32 ring buffer + radix-2 FFT.
 */

import type { ChannelRole } from './MusicAnalysis';
import {
  extractSampleFeatures,
  classifyBySpectralFeatures,
  type SampleSpectrumFeatures,
} from './SampleSpectrum';

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Per-channel ring buffer length in samples. 2048 @ 48 kHz ≈ 43 ms — big
 *  enough for a stable FFT frame, small enough that we classify responsively. */
const RING_SIZE = 2048;

/** Minimum ring fill before we run a classifier pass. Wait for a FULL
 *  ring — partial classifications on half-zero buffers produce garbled
 *  spectra (the zero prefix pushes a broadband ramp that mis-reads as
 *  'lead' even for pure bass tones). At 256 samples/tick × 250 ms AutoDub
 *  cadence + 30-fps tap, a fresh ring takes ~2 s to fill. */
const MIN_SAMPLES_FOR_CLASSIFICATION = RING_SIZE;

/** How many recent classifications to keep per channel for the majority vote.
 *  4 frames at ~2 s each gives an 8 s rolling decision window. */
const HISTORY_LEN = 4;

/** Minimum fraction of history entries that must agree on a role for
 *  `getRuntimeChannelRole` to return it. 0.75 = 3 of 4. */
const AGREEMENT_THRESHOLD = 0.75;

/** Default sample rate when the oscilloscope source doesn't supply one. */
const DEFAULT_SAMPLE_RATE = 48000;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChannelState {
  ring: Float32Array;
  writePos: number;
  samplesWritten: number;
  sampleRate: number;
  history: Array<{ role: ChannelRole; confidence: number }>;
  lastFeatures: SampleSpectrumFeatures | null;
}

export interface RuntimeRoleHint {
  role: ChannelRole;
  confidence: number;
  /** Support for the majority vote — fraction of history that agreed. */
  support: number;
}

// ─── Module state ───────────────────────────────────────────────────────────

const _state = new Map<number, ChannelState>();
/** Bumped every reset — lets callers detect a stale cache without peeking
 *  at internal state. Exposed via `getRuntimeClassifierGeneration()`. */
let _generation = 0;

function getOrCreate(ch: number, sampleRate: number): ChannelState {
  let s = _state.get(ch);
  if (!s) {
    s = {
      ring: new Float32Array(RING_SIZE),
      writePos: 0,
      samplesWritten: 0,
      sampleRate,
      history: [],
      lastFeatures: null,
    };
    _state.set(ch, s);
  }
  return s;
}

// ─── Per-tick update ────────────────────────────────────────────────────────

/** Append one tick's worth of tap samples into the per-channel rings and,
 *  when enough has accumulated, run a classifier pass. Call from AutoDub's
 *  250 ms tick loop right after you've read oscilloscope state.
 *
 *  @param channelData  Parallel to the oscilloscope store's `channelData`.
 *                      Int16 samples or null when a channel is unavailable.
 *  @param sampleRate   Audio-rate of the tap (defaults to 48 kHz).
 *  @param classifyFn   Injectable classifier — exposed for tests. Defaults
 *                      to the Phase-2 classifyBySpectralFeatures.
 */
export function updateChannelClassifierFromTap(
  channelData: readonly (Int16Array | null)[],
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  classifyFn: (f: SampleSpectrumFeatures) => { role: ChannelRole; confidence: number } = classifyBySpectralFeatures,
): void {
  for (let ch = 0; ch < channelData.length; ch++) {
    const src = channelData[ch];
    if (!src || src.length === 0) continue;

    const s = getOrCreate(ch, sampleRate);

    // Append src (Int16) into the Float32 ring at writePos, wrapping.
    for (let i = 0; i < src.length; i++) {
      s.ring[s.writePos] = src[i] / 32768;
      s.writePos = (s.writePos + 1) % RING_SIZE;
    }
    s.samplesWritten += src.length;

    // Only classify once we have a stable fill. Run on every update after
    // that — cheap enough at 4× per second and lets us respond quickly to
    // role shifts.
    if (s.samplesWritten < MIN_SAMPLES_FOR_CLASSIFICATION) continue;

    // Linearise the ring: samples are in chronological order starting at
    // writePos (the oldest sample in the buffer). Reorder into `linear`.
    const linear = new Float32Array(RING_SIZE);
    for (let i = 0; i < RING_SIZE; i++) {
      linear[i] = s.ring[(s.writePos + i) % RING_SIZE];
    }

    const features = extractSampleFeatures(linear, s.sampleRate);
    if (!features) continue;
    s.lastFeatures = features;

    const decision = classifyFn(features);
    if (decision.role === 'empty' || decision.confidence === 0) continue;

    s.history.push(decision);
    if (s.history.length > HISTORY_LEN) s.history.shift();
  }
}

// ─── Read API ───────────────────────────────────────────────────────────────

/** Majority-vote the per-channel classification history and return the
 *  consensus role when at least AGREEMENT_THRESHOLD of entries agree.
 *  Returns null when history is short, silent, or disagreement is high. */
export function getRuntimeChannelRole(ch: number): RuntimeRoleHint | null {
  const s = _state.get(ch);
  if (!s || s.history.length === 0) return null;
  if (s.history.length < Math.ceil(HISTORY_LEN * 0.5)) return null;

  // Tally roles.
  const counts = new Map<ChannelRole, { n: number; confSum: number }>();
  for (const h of s.history) {
    const b = counts.get(h.role) ?? { n: 0, confSum: 0 };
    b.n += 1;
    b.confSum += h.confidence;
    counts.set(h.role, b);
  }

  let bestRole: ChannelRole = 'empty';
  let bestCount = 0;
  let bestConf = 0;
  for (const [role, { n, confSum }] of counts) {
    if (n > bestCount) {
      bestRole = role;
      bestCount = n;
      bestConf = confSum / n;
    }
  }

  const support = bestCount / s.history.length;
  if (support < AGREEMENT_THRESHOLD) return null;
  return { role: bestRole, confidence: bestConf, support };
}

/** Snapshot all current runtime hints, indexed by channel. `null` at index
 *  `ch` means "insufficient evidence" — AutoDub should use the offline
 *  role there without an override. */
export function getAllRuntimeChannelRoles(channelCount: number): Array<RuntimeRoleHint | null> {
  const out: Array<RuntimeRoleHint | null> = [];
  for (let ch = 0; ch < channelCount; ch++) {
    out.push(getRuntimeChannelRole(ch));
  }
  return out;
}

/** Clear all per-channel rings + history. Call on song load so a new
 *  song doesn't inherit the previous song's role votes. */
export function resetRuntimeChannelClassifier(): void {
  _state.clear();
  _generation += 1;
}

/** Bumped every reset — observers can detect a cache flush. */
export function getRuntimeClassifierGeneration(): number {
  return _generation;
}

// ─── Merge policy ───────────────────────────────────────────────────────────

/**
 * Merge offline (SampleSpectrum + note-stats) roles with runtime hints
 * from the live audio tap.
 *
 * In tracker music a sample slot can contain anything — a drum loop, a
 * bass riff, a melody phrase. That means note-stats roles ('chord',
 * 'lead', 'arpeggio', 'pad') are close to noise: the NOTE pitch says
 * nothing about what the SAMPLE sounds like. Only two offline signals are
 * trustworthy:
 *   - `percussion` — detected from PCM (SampleSpectrum kick/hat/snare),
 *     drumType field, or DRUM_SYNTHS set. Keep unconditionally.
 *   - `bass` detected by SampleSpectrum low centroid + tonal shape —
 *     keep unless runtime strongly disagrees.
 *
 * Everything else (`chord`, `lead`, `arpeggio`, `pad`, `empty`) should
 * yield to the runtime audio tap when it has a confident reading, because
 * the live audio is always more truthful than note-position heuristics for
 * sample-based channels.
 *
 * Runtime can promote to {bass, percussion, lead} — the three roles the
 * spectral tap detects with high specificity. Pad/chord/arpeggio require
 * harmonic analysis beyond what a single FFT frame provides, so runtime
 * never promotes to those.
 *
 * Pure — never mutates `offline`. Returns a new array.
 */
export function mergeOfflineAndRuntimeRoles(
  offline: readonly ChannelRole[],
  runtime: ReadonlyArray<RuntimeRoleHint | null>,
  minConfidence: number = 0.6,
): ChannelRole[] {
  const out: ChannelRole[] = [];
  // Note-stats roles that are unreliable for sample-based tracker channels.
  // 'skank' is kept because off-beat note-position IS meaningful even when
  // the sample content is unknown — an off-beat stab is still a stab.
  const OVERRIDABLE_OFFLINE: readonly ChannelRole[] = [
    'empty', 'pad', 'chord', 'lead', 'arpeggio',
  ];
  const RUNTIME_CAN_PROMOTE_TO: readonly ChannelRole[] = ['bass', 'percussion', 'lead'];
  for (let i = 0; i < offline.length; i++) {
    const o = offline[i];
    const hint = runtime[i];
    if (
      hint
      && OVERRIDABLE_OFFLINE.includes(o)
      && RUNTIME_CAN_PROMOTE_TO.includes(hint.role)
      && hint.confidence >= minConfidence
    ) {
      out.push(hint.role);
    } else {
      out.push(o);
    }
  }
  return out;
}

// ─── Test hooks ─────────────────────────────────────────────────────────────

/** Test-only: peek at the internal state for a channel. */
export function _peekChannelState(ch: number): {
  samplesWritten: number;
  historyLen: number;
  lastFeatures: SampleSpectrumFeatures | null;
} | null {
  const s = _state.get(ch);
  if (!s) return null;
  return {
    samplesWritten: s.samplesWritten,
    historyLen: s.history.length,
    lastFeatures: s.lastFeatures,
  };
}
