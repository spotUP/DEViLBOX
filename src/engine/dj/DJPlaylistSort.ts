/**
 * DJPlaylistSort — Intelligent playlist ordering for seamless DJ mixing
 *
 * "Smart Sort" uses a greedy nearest-neighbor algorithm that optimizes for
 * three dimensions simultaneously:
 *   1. BPM proximity — gradual tempo progression, half/double-time aware
 *   2. Harmonic compatibility — Camelot wheel adjacency for key-matched mixes
 *   3. Energy arc — smooth build-up/cooldown, not random zigzag
 *
 * The scoring is tuned for real DJ mixing:
 *   - ±3 BPM is seamless (beatmatch with pitch fader)
 *   - ±6 BPM is workable (noticeable but mixable)
 *   - >10 BPM needs a creative transition or sounds forced
 *   - Same/adjacent Camelot key = harmonic magic
 *   - Clashing key = crowd hears the dissonance
 *   - Energy should flow in an arc, not bounce randomly
 */

import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { toCamelot, keyCompatibility } from './DJKeyUtils';

// ── Scoring parameters ──────────────────────────────────────────────────────

// BPM: exponential penalty (squared) so small diffs are cheap, big diffs are brutal
const BPM_PENALTY_SCALE = 0.8;   // multiplied by diff² — 5 BPM = 20, 10 BPM = 80, 20 BPM = 320
const BPM_UNKNOWN_PENALTY = 30;  // when either track has no BPM

// Key: Camelot wheel compatibility (lower = better)
const KEY_SCORE: Record<string, number> = {
  'perfect':      -20,   // same key — seamless harmonic blend
  'energy-boost': -12,   // +1 on wheel — lifts the energy
  'energy-drop':  -12,   // -1 on wheel — brings it down smoothly
  'mood-change':   -5,   // relative major/minor — subtle mood shift
  'compatible':   -10,   // generic compatible (shouldn't occur with our keyCompat fn)
  'clash':         50,   // dissonant — crowd hears it
};
const KEY_UNKNOWN_PENALTY = 5; // when either track has no key

// Energy: penalize jumps, reward gradual arc
const ENERGY_JUMP_SCALE = 60;     // multiplied by diff² — 0.1 = 0.6, 0.3 = 5.4, 0.5 = 15
const ENERGY_DIRECTION_BONUS = -3; // bonus when energy moves in the same direction as previous transition
// Energy steps in the 0.05-0.2 range get a small bonus (see transitionScore)

/** Score how well track B follows track A (lower = better match) */
function transitionScore(
  a: PlaylistTrack,
  b: PlaylistTrack,
  prevEnergyDelta: number, // energy direction from previous transition (0 if first)
): number {
  let score = 0;

  // ── BPM ──
  if (a.bpm > 0 && b.bpm > 0) {
    const direct = Math.abs(a.bpm - b.bpm);
    const half = Math.abs(a.bpm - b.bpm * 2);
    const double = Math.abs(a.bpm * 2 - b.bpm);
    const diff = Math.min(direct, half, double);
    // Squared penalty: 3 BPM = 7.2, 6 BPM = 28.8, 10 BPM = 80, 20 BPM = 320
    score += diff * diff * BPM_PENALTY_SCALE;
  } else {
    score += BPM_UNKNOWN_PENALTY;
  }

  // ── Key ──
  if (a.musicalKey && b.musicalKey) {
    const compat = keyCompatibility(a.musicalKey, b.musicalKey);
    score += KEY_SCORE[compat] ?? 0;
  } else {
    score += KEY_UNKNOWN_PENALTY;
  }

  // ── Energy ──
  const eA = a.energy ?? 0.5;
  const eB = b.energy ?? 0.5;
  const eDelta = eB - eA;
  const eAbsDelta = Math.abs(eDelta);

  // Penalize large energy jumps (squared)
  score += eAbsDelta * eAbsDelta * ENERGY_JUMP_SCALE;

  // Bonus for maintaining energy direction (smooth arc, not zigzag)
  if (prevEnergyDelta !== 0) {
    const sameDirection = (eDelta > 0 && prevEnergyDelta > 0) || (eDelta < 0 && prevEnergyDelta < 0);
    if (sameDirection) score += ENERGY_DIRECTION_BONUS;
  }

  // Small bonus for ideal step size (not too flat, not too jumpy)
  if (eAbsDelta >= 0.05 && eAbsDelta <= 0.2) {
    score -= 2; // gentle transition — ideal
  }

  return score;
}

/**
 * Smart sort: order tracks for optimal DJ mixing.
 *
 * Strategy:
 * 1. Start from the track closest to median energy (room to build both ways)
 * 2. Greedy nearest-neighbor: always pick the best next track considering
 *    BPM proximity, key compatibility, and energy arc direction
 * 3. Energy direction carries forward — once you start building up,
 *    the algorithm prefers to keep building rather than zigzag
 */
export function smartSort(tracks: PlaylistTrack[]): PlaylistTrack[] {
  if (tracks.length <= 2) return [...tracks];

  const result: PlaylistTrack[] = [];
  const remaining = new Set(tracks.map((_, i) => i));

  // Find starting track: closest to median energy with lowest BPM
  // This gives the set room to build energy upward
  const energies = tracks.map(t => t.energy ?? 0.5).sort((a, b) => a - b);
  const medianEnergy = energies[Math.floor(energies.length / 2)];

  let startIdx = 0;
  let bestStartScore = Infinity;
  for (const i of remaining) {
    const t = tracks[i];
    const energyDist = Math.abs((t.energy ?? 0.5) - medianEnergy * 0.7); // bias toward lower energy
    const bpmFactor = t.bpm > 0 ? t.bpm / 200 : 0.5; // prefer lower BPM
    const startScore = energyDist + bpmFactor * 0.3;
    if (startScore < bestStartScore) {
      bestStartScore = startScore;
      startIdx = i;
    }
  }

  result.push(tracks[startIdx]);
  remaining.delete(startIdx);

  let prevEnergyDelta = 0; // track the energy arc direction

  // Greedy: always pick the best next track
  while (remaining.size > 0) {
    const current = result[result.length - 1];
    let bestIdx = -1;
    let bestScore = Infinity;

    for (const i of remaining) {
      const score = transitionScore(current, tracks[i], prevEnergyDelta);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const picked = tracks[bestIdx];
    const eNow = current.energy ?? 0.5;
    const eNext = picked.energy ?? 0.5;
    prevEnergyDelta = eNext - eNow;

    result.push(picked);
    remaining.delete(bestIdx);
  }

  return result;
}

/** Sort by BPM ascending */
export function sortByBPM(tracks: PlaylistTrack[], desc = false): PlaylistTrack[] {
  return [...tracks].sort((a, b) => {
    const bpmA = a.bpm || 999;
    const bpmB = b.bpm || 999;
    return desc ? bpmB - bpmA : bpmA - bpmB;
  });
}

/** Sort by key (Camelot number, then A/B) */
export function sortByKey(tracks: PlaylistTrack[]): PlaylistTrack[] {
  return [...tracks].sort((a, b) => {
    const ca = toCamelot(a.musicalKey);
    const cb = toCamelot(b.musicalKey);
    if (!ca && !cb) return 0;
    if (!ca) return 1;
    if (!cb) return -1;
    if (ca.number !== cb.number) return ca.number - cb.number;
    return ca.letter.localeCompare(cb.letter);
  });
}

/** Sort by energy ascending */
export function sortByEnergy(tracks: PlaylistTrack[]): PlaylistTrack[] {
  return [...tracks].sort((a, b) => {
    const ea = a.energy ?? 0.5;
    const eb = b.energy ?? 0.5;
    return ea - eb;
  });
}

/** Sort alphabetically by track name */
export function sortByName(tracks: PlaylistTrack[]): PlaylistTrack[] {
  return [...tracks].sort((a, b) => a.trackName.localeCompare(b.trackName));
}
