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
 * This module measures the channel's ACTUAL audio — the contiguous per-
 * channel stream in ChannelAudioTap, fed by the engines — and votes on a
 * runtime role. AutoDub merges the runtime hint with the offline role:
 * when offline says 'empty' or 'pad' (weak signal) and runtime strongly
 * disagrees (e.g. "this channel's low-end has dominated for 8 s"), the
 * runtime role wins.
 *
 * Pure-ish: module-level vote history, but the feature-extract + classify
 * path is the same SampleSpectrum helpers Phase 2 uses. No WebAudio, no
 * AnalyserNode — a radix-2 FFT over the tap's latest frame.
 */

import type { ChannelRole } from './MusicAnalysis';
import { latestChannelAudio } from './ChannelAudioTap';
import {
  extractSampleFeatures,
  classifyBySpectralFeatures,
  type SampleSpectrumFeatures,
} from './SampleSpectrum';

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Samples per classification frame. 2048 @ 48 kHz ≈ 43 ms — big enough for
 *  a stable FFT frame, small enough to respond quickly. Read as one unbroken
 *  stretch from ChannelAudioTap; a channel without that much gives no vote. */
const FRAME_SIZE = 2048;

/** How many recent classifications to keep per channel for the majority vote. */
const HISTORY_LEN = 4;

/** Minimum fraction of history entries that must agree on a role for
 *  `getRuntimeChannelRole` to return it. 0.75 = 3 of 4. */
const AGREEMENT_THRESHOLD = 0.75;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChannelState {
  /** Tap frame the last classified window ended at; the same window is not voted twice. */
  lastEnd: number;
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

function getOrCreate(ch: number): ChannelState {
  let s = _state.get(ch);
  if (!s) {
    s = { lastEnd: -1, history: [], lastFeatures: null };
    _state.set(ch, s);
  }
  return s;
}

// ─── Per-tick update ────────────────────────────────────────────────────────

/** Classify each channel's latest unbroken FRAME_SIZE samples from the
 *  contiguous audio tap, once per new window. Call from AutoDub's tick.
 *
 *  It used to append each tick's display snapshot into a ring of its own:
 *  snapshots taken 23-250 ms apart, glued into one window, whose joins read
 *  as clicks - every channel of a Hippel song classified as percussion, and
 *  the merge below let that override the offline role.
 *
 *  @param channelCount  channels to consider
 *  @param classifyFn    injectable classifier (tests); defaults to
 *                       classifyBySpectralFeatures
 */
export function updateChannelClassifierFromTap(
  channelCount: number,
  classifyFn: (f: SampleSpectrumFeatures) => { role: ChannelRole; confidence: number } = classifyBySpectralFeatures,
): void {
  for (let ch = 0; ch < channelCount; ch++) {
    const audio = latestChannelAudio(ch, FRAME_SIZE);
    if (!audio) continue;
    const s = getOrCreate(ch);
    if (audio.end === s.lastEnd) continue;
    s.lastEnd = audio.end;

    const features = extractSampleFeatures(audio.samples, audio.sampleRate);
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
  historyLen: number;
  lastFeatures: SampleSpectrumFeatures | null;
} | null {
  const s = _state.get(ch);
  if (!s) return null;
  return {
    historyLen: s.history.length,
    lastFeatures: s.lastFeatures,
  };
}
