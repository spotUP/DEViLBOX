/**
 * Song material a scratch can take from the playing track (owner plan
 * `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` sections 12 B/C, 85-87;
 * ledger SCR-P5.3-P5.5). Everything is READ from the Auto DJ's analysis
 * (`DJTrackAnalysis`: beat grid, activity timelines, arrangement events, the tracker mix);
 * nothing is measured again (section 6).
 *
 *   extractedAnchors     temporary deck anchors at the song's own hits near a bar
 *                        (vocal onset, snare, kick, stab, fill, phrase hit)
 *   trackerScratchMaterial  what each tracker channel is doing at a bar (its segment),
 *                        never a permanent channel class (section 86)
 */

import { timeAtBeat, barStartBeat, timelineAt } from '../autodj/beatGrid';
import type { DJTrackAnalysis, TrackerChannelSegment } from '../autodj/types';
import { deckAnchor } from './scratchAnchor';
import type { DeckAnchorKind, DeckScratchAnchor } from './scratchTypes';

type AB = 'A' | 'B';

/** The vocal timeline crossing `VOCAL_ONSET_LEVEL` after rising at least this much within a second is an onset. */
export const VOCAL_ONSET_RISE = 0.25;
export const VOCAL_ONSET_LEVEL = 0.4;
/** Drum activity at a beat from which the beat's hit is scratchable. */
export const DRUM_HIT_LEVEL = 0.3;

export interface ExtractedAnchor extends DeckScratchAnchor {
  kind: DeckAnchorKind;
  /** How sure the analysis is of the event (0..1). */
  confidence: number;
  /** How clear the hit is (0..1): the size of the step, the drum level - the anchor's quality. */
  strength: number;
}

const barTime = (a: DJTrackAnalysis, bar: number): number => timeAtBeat(a.beatGrid, barStartBeat(a.downbeats, bar));

/** The beat nearest `t` on the grid, when it is within `tol` seconds; else `t` itself. */
function snapToBeat(a: DJTrackAnalysis, t: number, tol: number): { t: number; beat: number } {
  let best = -1, bestD = Infinity;
  for (const b of a.beatGrid.beats) {
    const d = Math.abs(b.time - t);
    if (d < bestD) { bestD = d; best = b.index; }
    if (b.time > t + tol) break;
  }
  return best >= 0 && bestD <= tol ? { t: a.beatGrid.beats[best]!.time, beat: best } : { t, beat: a.beatGrid.beats.findIndex((b) => b.time >= t) };
}

/**
 * Temporary scratch anchors from the song itself (section 87) between the start of
 * `bar - lookbackBars` and the end of `bar`: vocal onsets (the vocal timeline stepping up, or a
 * `vocal-in` arrangement event), snares (drum activity on beats 2 and 4) and kicks (beats 1 and
 * 3), stabs (`energy-up`, a tracker `INSTRUMENT_ENTRY`), fills (a tracker `FILL`) and phrase hits
 * (`section-change`, a tracker `DROP` / `PATTERN_CHANGE`). Each is a deck anchor with the safe
 * range of one event (`deckAnchor`). Sorted by time; none when the timelines are flat.
 */
export function extractedAnchors(a: DJTrackAnalysis, bar: number, opts: { lookbackBars?: number } = {}): ExtractedAnchor[] {
  const from = barTime(a, bar - (opts.lookbackBars ?? 1));
  const to = barTime(a, bar + 1);
  const out: ExtractedAnchor[] = [];
  const seen = new Set<string>();
  const add = (t: number, kind: DeckAnchorKind, confidence: number, snapTol = 0, strength = confidence): void => {
    const s = snapTol > 0 ? snapToBeat(a, t, snapTol) : { t, beat: a.beatGrid.beats.findIndex((b) => b.time >= t - 1e-6) };
    if (s.t < from - 1e-6 || s.t >= to - 1e-6) return;
    const key = `${kind}@${s.t.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...deckAnchor(s.t, Math.max(0, s.beat), kind, a.bpm), kind, confidence, strength: Math.max(0, Math.min(1, strength)) });
  };

  // vocal onsets: the (smoothed) timeline crosses the onset level after a rise of at least
  // VOCAL_ONSET_RISE over the last second; the interpolated crossing is snapped to the beat it
  // belongs to (within two hops: the timeline's own resolution)
  const v = a.vocalActivity;
  if (v.values.length > 1 && v.confidence > 0) {
    const w = Math.max(1, Math.round(1 / v.hopSec));
    const i0 = Math.max(1, Math.floor(from / v.hopSec) - w), i1 = Math.min(v.values.length - 1, Math.ceil(to / v.hopSec) + 1);
    for (let i = i0; i <= i1; i++) {
      const prev = v.values[i - 1]!, cur = v.values[i]!;
      if (!(prev < VOCAL_ONSET_LEVEL && cur >= VOCAL_ONSET_LEVEL)) continue;
      const rise = cur - Math.min(...v.values.slice(Math.max(0, i - w), i));
      if (rise < VOCAL_ONSET_RISE) continue;
      const t = (i - 1 + (VOCAL_ONSET_LEVEL - prev) / (cur - prev)) * v.hopSec;
      add(t, 'vocalOnset', v.confidence, 2 * v.hopSec, rise / 0.5);
    }
  }
  for (const e of a.arrangementEvents ?? []) {
    if (e.kind === 'vocal-in') add(e.time, 'vocalOnset', e.confidence, 0.1);
    else if (e.kind === 'energy-up') add(e.time, 'stab', e.confidence, 0.1);
    else if (e.kind === 'section-change') add(e.time, 'phraseHit', e.confidence, 0.1);
  }

  // drum hits on the grid: snare on beats 2 and 4, kick on 1 and 3
  const d = a.drumActivity;
  const bpb = a.meter?.beatsPerBar || 4;
  if (d.values.length && d.confidence > 0) {
    for (const b of a.beatGrid.beats) {
      if (b.time < from - 1e-6) continue;
      if (b.time >= to - 1e-6) break;
      const level = timelineAt(d.values, d.hopSec, b.time + 1e-3);
      if (level < DRUM_HIT_LEVEL) continue;
      const inBar = ((b.index - (a.downbeats.phaseOffset ?? 0)) % bpb + bpb) % bpb;
      if (bpb === 4) add(b.time, inBar % 2 === 1 ? 'snare' : 'kick', d.confidence, 0, level);
      else add(b.time, inBar === 0 ? 'kick' : 'snare', d.confidence, 0, level);
    }
  }

  for (const e of a.tracker?.events ?? []) {
    if (e.kind === 'FILL') add(e.time, 'fill', e.confidence, 0.1);
    else if (e.kind === 'DROP' || e.kind === 'PATTERN_CHANGE') add(e.time, 'phraseHit', e.confidence, 0.1);
    else if (e.kind === 'INSTRUMENT_ENTRY') add(e.time, 'stab', e.confidence, 0.1);
  }
  return out.sort((x, y) => x.position - y.position);
}

/** What a tracker channel offers a scratch now (section 85). */
export type TrackerMaterialKind = 'percussion' | 'kick' | 'snare' | 'bass' | 'lead' | 'stab' | 'texture';

export interface TrackerChannelMaterial {
  deck: AB;
  channel: number;
  /** `<channel>@<segment start>`: the segment, not the channel, is the material (section 86). */
  segmentId: string;
  kind: TrackerMaterialKind;
  /** Seconds: the segment's start, the anchor of a TRACKER_CHANNEL source. */
  anchor: number;
  segment: TrackerChannelSegment;
}

function materialOf(seg: TrackerChannelSegment): TrackerMaterialKind | null {
  if (seg.musicalFunction === 'silence') return null;
  if (seg.rhythmicRole === 'kick') return 'kick';
  if (seg.rhythmicRole === 'snare') return 'snare';
  if (seg.instrumentFamily === 'drums' || seg.musicalFunction === 'rhythm') return 'percussion';
  if (seg.instrumentFamily === 'bass' || seg.musicalFunction === 'bass') return 'bass';
  if (seg.instrumentFamily === 'fx') return 'stab';
  if (seg.instrumentFamily === 'lead' || seg.musicalFunction === 'melody') return 'lead';
  return 'texture';
}

/**
 * "What is this channel doing RIGHT NOW?" (section 86): the channel segments of the tracker
 * mix that cover the start of `bar`, each as scratch material with the segment's start as the
 * anchor. A channel that plays percussion at bar 8 and bass at bar 20 is two different sources.
 */
export function trackerScratchMaterial(a: DJTrackAnalysis, bar: number, deck: AB): TrackerChannelMaterial[] {
  const mix = a.tracker;
  if (!mix || mix.confidence <= 0) return [];
  const t = barTime(a, bar) + 1e-3;
  const out: TrackerChannelMaterial[] = [];
  for (const seg of mix.channelSegments) {
    if (seg.start > t || seg.end <= t) continue;
    const kind = materialOf(seg);
    if (!kind) continue;
    out.push({ deck, channel: seg.channel, segmentId: `${seg.channel}@${seg.start.toFixed(3)}`, kind, anchor: seg.start, segment: seg });
  }
  return out.sort((x, y) => y.segment.importance - x.segment.importance || x.channel - y.channel);
}
