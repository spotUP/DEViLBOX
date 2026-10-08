/**
 * DJSetPlanner (plan sections 8-11, 40, 58): which track makes the most sense
 * as part of the next several moves. A beam search over 3-6 track sequences
 * scored by observable components with style-dependent weights, an explicit
 * set energy arc, repetition control and a narrative term. Never touches deck
 * audio, never reorders the user's playlist: it returns a session order.
 *
 * Pure.
 */
import {
  bassCompatibility, drumCompatibility, genreCompatibility, harmonicCompatibility, introOutroCompatibility,
  phraseCompatibility, sectionCompatibility, spectralCompatibility, tempoCompatibility, textureCompatibility,
  vocalCompatibility,
} from './compatibility';
import { summaryFromLegacy } from './trackAnalysis';
import type {
  DJStyleProfile, DJTrackCandidate, DJTrackSummary, ScoreComponent, SessionMemorySnapshot, SetEnergyPhase, SetPlan,
} from './types';

export interface PlannerTrack {
  index: number;
  id: string;
  name: string;
  artist?: string | null;
  summary: DJTrackSummary | null;
  /** Legacy fields, used when there is no summary. */
  bpm: number;
  musicalKey?: string;
  energy?: number;
  duration: number;
  isBad?: boolean;
}

export interface SetPlannerInput {
  tracks: PlannerTrack[];
  /** Index of the track playing now (-1 before the first). */
  currentIndex: number;
  /** Indices already played this session (repetition control). */
  played: number[];
  memory: SessionMemorySnapshot;
  style: DJStyleProfile;
  creativeRisk: number;
  /** Seconds the set has run and, when known, seconds it should run (narrative). */
  elapsedSec: number;
  plannedDurationSec?: number;
  lookahead?: number;
  beamWidth?: number;
  /** Energy of the track playing now (0..1), when known. */
  currentEnergy?: number;
}

export function summaryOf(t: PlannerTrack): DJTrackSummary {
  return t.summary ?? summaryFromLegacy({ bpm: t.bpm, musicalKey: t.musicalKey, energy: t.energy, duration: t.duration });
}

// ── Energy arc (plan section 11) ────────────────────────────────────────────

export interface EnergyArcState {
  phase: SetEnergyPhase;
  targetEnergy: number;
  reasons: string[];
}

/**
 * Where the set is and where it should go. Progress through the planned
 * duration (or the number of transitions) shapes the arc; the recent trend,
 * the time since the last peak and recent releases refine it.
 */
export function energyArc(memory: SessionMemorySnapshot, elapsedSec: number, plannedDurationSec: number | undefined, style: DJStyleProfile, currentEnergy: number | undefined): EnergyArcState {
  const total = plannedDurationSec && plannedDurationSec > 0 ? plannedDurationSec : 3600;
  const progress = Math.min(1, elapsedSec / total);
  const trend = memory.recentEnergy.length >= 2
    ? memory.recentEnergy[memory.recentEnergy.length - 1] - memory.recentEnergy[memory.recentEnergy.length - 2]
    : 0;
  const energyNow = currentEnergy ?? (memory.recentEnergy.length ? memory.recentEnergy[memory.recentEnergy.length - 1] : 0.5);
  const sinceLastPeak = memory.recentPeaks.length ? (Date.now() - memory.recentPeaks[memory.recentPeaks.length - 1]) / 1000 : Infinity;
  const reasons: string[] = [];
  let phase: SetEnergyPhase;
  if (memory.transitionCount < 1 || progress < 0.08) phase = 'OPENING';
  else if (progress > 0.9) phase = 'CLOSING';
  else if (energyNow >= 0.8 && trend >= 0) phase = 'PEAK';
  else if (energyNow >= 0.8) phase = 'RELEASE';
  else if (memory.recentEnergy.length >= 3 && memory.recentEnergy.slice(-3).filter((e, i, arr) => i > 0 && e < arr[i - 1] - 0.15).length >= 2 && trend < 0) phase = 'RECOVERY';
  else if (trend > 0.08 && energyNow >= 0.65) phase = 'PEAKING';
  else if (trend > 0.03) phase = 'BUILDING';
  else if (trend < -0.08) phase = 'RELEASE';
  else phase = 'CRUISING';
  reasons.push(`set phase ${phase} (progress ${(progress * 100).toFixed(0)} %, energy ${energyNow.toFixed(2)}, trend ${trend >= 0 ? '+' : ''}${trend.toFixed(2)})`);

  // The arc: open low, build, cruise, peak late, release and close.
  const arc = progress < 0.15 ? 0.45 + progress * 1.0
    : progress < 0.55 ? 0.6 + (progress - 0.15) * 0.5
    : progress < 0.8 ? 0.8 + (progress - 0.55) * 0.4
    : progress < 0.9 ? 0.9 - (progress - 0.8) * 2
    : 0.55;
  let target = arc + style.energyMovement * 0.1;
  // A peak needs a release after it; a long time without a peak invites one.
  if (phase === 'PEAK' && sinceLastPeak < 240) { target = Math.min(target, energyNow - 0.1); reasons.push('peak held long enough: release'); }
  if (sinceLastPeak > 900 && progress > 0.3 && progress < 0.85) { target = Math.max(target, 0.85); reasons.push('no peak for 15 minutes: build one'); }
  if (phase === 'RECOVERY') { target = Math.max(0.5, energyNow + 0.1); reasons.push('recovering after releases'); }
  target = Math.max(0.2, Math.min(1, target));
  reasons.push(`target energy ${target.toFixed(2)}`);
  return { phase, targetEnergy: target, reasons };
}

// ── Scoring (plan section 9) ────────────────────────────────────────────────

export interface ScoredCandidate {
  candidate: DJTrackCandidate;
}

export function scoreTransition(
  from: DJTrackSummary, to: DJTrackSummary, toTrack: PlannerTrack, input: SetPlannerInput, arc: EnergyArcState,
  depth: number, previousInSequence: PlannerTrack[],
): DJTrackCandidate {
  const w = input.style.weights;
  const components: Partial<Record<ScoreComponent, number>> = {};
  const reasons: string[] = [];
  const rejections: string[] = [];

  const h = harmonicCompatibility(from.key, from.keyConfidence, to.key, to.keyConfidence, { strictness: input.style.keyStrictness, overlapBars: input.style.transitionLengthBars });
  components.harmonicCompatibility = h.score;
  if (h.score >= 0.8) reasons.push(`compatible key (${h.relation})`); else if (h.clashRisk > 0.5) rejections.push(`key clash risk ${h.clashRisk.toFixed(2)}`);

  const t = tempoCompatibility(from.bpm, to.bpm, input.style.tempoTolerancePercent);
  components.tempoCompatibility = t.score;
  if (t.score >= 0.7) reasons.push(`${t.percent >= 0 ? '+' : ''}${t.percent.toFixed(1)} % tempo`); else rejections.push(`tempo gap ${Math.abs(t.percent).toFixed(0)} %`);

  components.phraseCompatibility = phraseCompatibility(from, to).score;
  components.sectionCompatibility = sectionCompatibility(from, to).score;
  const io = introOutroCompatibility(from, to);
  components.introOutroCompatibility = io.score;
  if (io.score >= 0.8) reasons.push(io.reason);
  const d = drumCompatibility(from, to);
  components.drumCompatibility = d.score;
  if (d.score < 0.5) rejections.push(d.reason);
  const b = bassCompatibility(from, to);
  components.bassCompatibility = b.score;
  if (b.bothHeavy) rejections.push(b.reason);
  const v = vocalCompatibility(from, to);
  components.vocalCompatibility = v.score;
  if (v.overlapRisk > 0.4) rejections.push('highVocalConflict');
  components.genreCompatibility = genreCompatibility(from, to).score;
  components.textureCompatibility = 0.5 * textureCompatibility(from, to).score + 0.5 * spectralCompatibility(from, to).score;

  // Energy arc fit: how close the track's energy is to the target at this depth.
  const target = arc.targetEnergy + depth * 0.03 * Math.sign(input.style.energyMovement || 1);
  const dist = Math.abs(to.energy.perceivedIntensity - Math.min(1, target));
  components.energyArcFit = Math.max(0, 1 - dist * 2.5);
  if (components.energyArcFit > 0.7) reasons.push(`energy ${to.energy.perceivedIntensity.toFixed(2)} fits the set trajectory (${arc.phase})`);
  else if (dist > 0.3) rejections.push(`energy ${to.energy.perceivedIntensity.toFixed(2)} far from target ${target.toFixed(2)}`);

  // Novelty: unplayed, different artist and key than the last few.
  const played = input.played.includes(toTrack.index) || previousInSequence.some((p) => p.index === toTrack.index);
  const sameArtist = toTrack.artist && input.memory.recentArtists.includes(toTrack.artist);
  const sameKeyRun = to.key ? input.memory.recentKeys.slice(-3).every((k) => k === to.key) && input.memory.recentKeys.length >= 3 : false;
  components.novelty = (played ? 0 : 0.6) + (sameArtist ? 0 : 0.2) + (sameKeyRun ? 0 : 0.2);
  if (played) rejections.push('already played this session');

  // Set narrative: medium-term trajectory (toward the target over the sequence) and track diversity.
  const trajectory = 1 - Math.min(1, Math.abs((to.energy.perceivedIntensity - from.energy.perceivedIntensity) - input.style.energyMovement * 0.15) * 2);
  components.setNarrative = trajectory;

  // Penalties.
  components.repetition = (played ? 1 : 0) * (1 - input.style.repetitionTolerance) + (sameKeyRun ? 0.3 : 0);
  // A high-confidence key clash is awkward in itself (a DJ hears it), beyond the harmonic score.
  components.awkwardness = (d.score < 0.4 ? 0.4 : 0) + (b.bothHeavy ? 0.4 : 0) + (v.overlapRisk > 0.5 ? 0.4 : 0) + (to.durationSec < 45 ? 0.5 : 0) + (h.clashRisk > 0.5 ? 0.6 * input.style.keyStrictness : 0);
  if (to.durationSec < 45) rejections.push('very short track');
  const uncertainty = 1 - to.confidence.overall;
  components.risk = Math.min(1, h.clashRisk * 0.5 + (t.score < 0.5 ? 0.3 : 0) + uncertainty * 0.3) * (1 - input.creativeRisk * 0.5);

  let score = 0;
  for (const [k, val] of Object.entries(components) as Array<[ScoreComponent, number]>) {
    const sign = k === 'repetition' || k === 'awkwardness' || k === 'risk' ? -1 : 1;
    score += sign * val * w[k];
  }
  if (toTrack.isBad) { score -= 100; rejections.push('marked bad'); }
  return { index: toTrack.index, trackId: toTrack.id, name: toTrack.name, summary: toTrack.summary, score, components, reasons, rejections };
}

// ── Beam search (plan section 8) ────────────────────────────────────────────

interface Beam { seq: PlannerTrack[]; score: number; first: DJTrackCandidate | null }

export function planSet(input: SetPlannerInput): SetPlan {
  const lookahead = Math.max(1, Math.min(6, input.lookahead ?? 4));
  const beamWidth = Math.max(1, input.beamWidth ?? 6);
  const arc = energyArc(input.memory, input.elapsedSec, input.plannedDurationSec, input.style, input.currentEnergy);
  const current = input.tracks.find((t) => t.index === input.currentIndex) ?? null;
  const pool = input.tracks.filter((t) => t.index !== input.currentIndex);
  if (pool.length === 0) return { order: [], candidates: [], phase: arc.phase, targetEnergy: arc.targetEnergy, lookahead, reasons: arc.reasons };

  // Unplayed tracks first; once everything has played the whole pool is open again.
  const unplayed = pool.filter((t) => !input.played.includes(t.index) && !t.isBad);
  const open = unplayed.length > 0 ? unplayed : pool.filter((t) => !t.isBad).length > 0 ? pool.filter((t) => !t.isBad) : pool;

  const fromSummary = current ? summaryOf(current) : null;
  const firstCandidates: DJTrackCandidate[] = open.map((t) => {
    if (!fromSummary) {
      // Opening track: lowest energy near the opening target, slow-ish.
      const s = summaryOf(t);
      const fit = 1 - Math.abs(s.energy.perceivedIntensity - arc.targetEnergy) * 2;
      return { index: t.index, trackId: t.id, name: t.name, summary: t.summary, score: fit, components: { energyArcFit: fit }, reasons: ['opening track near the opening energy'], rejections: [] };
    }
    return scoreTransition(fromSummary, summaryOf(t), t, input, arc, 0, []);
  });

  let beams: Beam[] = firstCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, beamWidth)
    .map((c) => ({ seq: [open.find((t) => t.index === c.index)!], score: c.score, first: c }));

  for (let depth = 1; depth < lookahead; depth++) {
    const next: Beam[] = [];
    for (const beam of beams) {
      const last = beam.seq[beam.seq.length - 1];
      const lastSummary = summaryOf(last);
      const rest = open.filter((t) => !beam.seq.some((s) => s.index === t.index));
      if (rest.length === 0) { next.push(beam); continue; }
      const scored = rest.map((t) => ({ t, c: scoreTransition(lastSummary, summaryOf(t), t, input, arc, depth, beam.seq) }))
        .sort((a, b) => b.c.score - a.c.score)
        .slice(0, Math.max(2, Math.ceil(beamWidth / 2)));
      // Deeper moves count a little less: the plan is revised every track.
      const discount = Math.pow(0.8, depth);
      for (const s of scored) next.push({ seq: [...beam.seq, s.t], score: beam.score + s.c.score * discount, first: beam.first });
    }
    beams = next.sort((a, b) => b.score - a.score).slice(0, beamWidth);
  }

  const best = beams[0];
  const order = best.seq.map((t) => t.index);
  // Rank the first-step candidates for the log: the chosen first comes first.
  const candidates = [...firstCandidates].sort((a, b) => b.score - a.score);
  const chosen = candidates.find((c) => c.index === order[0]);
  const reasons = [...arc.reasons];
  if (chosen) reasons.push(...chosen.reasons.map((r) => `+ ${r}`));
  reasons.push(`lookahead ${lookahead}, beam ${beamWidth}: sequence ${best.seq.map((t) => t.name).join(' > ')}`);
  return { order, candidates, phase: arc.phase, targetEnergy: arc.targetEnergy, lookahead, reasons };
}
