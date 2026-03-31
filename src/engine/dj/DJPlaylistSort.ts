/**
 * DJPlaylistSort — Intelligent playlist ordering for seamless DJ mixing
 *
 * "Smart Sort" uses a greedy nearest-neighbor algorithm across three dimensions:
 *   1. BPM proximity (gradual tempo progression)
 *   2. Harmonic key compatibility (Camelot wheel)
 *   3. Energy flow (smooth build-up/cooldown)
 *
 * The algorithm picks the best next track at each step, creating an order
 * that minimizes jarring BPM jumps and key clashes while maintaining
 * a natural energy arc.
 */

import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { toCamelot, keyCompatibility } from './DJKeyUtils';

// Weights for the scoring function (lower = better)
const BPM_WEIGHT = 1.0;        // BPM difference penalty per BPM
const KEY_CLASH_PENALTY = 40;   // Penalty for clashing keys
const KEY_MOOD_BONUS = -5;      // Bonus for mood-change (relative major/minor)
const KEY_ENERGY_BONUS = -10;   // Bonus for energy-boost/drop (adjacent on wheel)
const KEY_PERFECT_BONUS = -15;  // Bonus for same key
const ENERGY_WEIGHT = 20;       // Energy difference penalty (0-1 scaled)
const NO_BPM_PENALTY = 15;     // Penalty when BPM is unknown

/** Score how well track B follows track A (lower = better match) */
function transitionScore(a: PlaylistTrack, b: PlaylistTrack): number {
  let score = 0;

  // BPM distance
  if (a.bpm > 0 && b.bpm > 0) {
    const bpmDiff = Math.abs(a.bpm - b.bpm);
    // Also check half/double time compatibility
    const halfDiff = Math.abs(a.bpm - b.bpm * 2);
    const doubleDiff = Math.abs(a.bpm * 2 - b.bpm);
    const effectiveDiff = Math.min(bpmDiff, halfDiff, doubleDiff);
    score += effectiveDiff * BPM_WEIGHT;
  } else {
    score += NO_BPM_PENALTY;
  }

  // Key compatibility (Camelot wheel)
  if (a.musicalKey && b.musicalKey) {
    const compat = keyCompatibility(a.musicalKey, b.musicalKey);
    switch (compat) {
      case 'perfect': score += KEY_PERFECT_BONUS; break;
      case 'energy-boost':
      case 'energy-drop': score += KEY_ENERGY_BONUS; break;
      case 'mood-change': score += KEY_MOOD_BONUS; break;
      case 'clash': score += KEY_CLASH_PENALTY; break;
    }
  }

  // Energy flow (prefer gradual changes)
  if (a.energy != null && b.energy != null) {
    score += Math.abs(a.energy - b.energy) * ENERGY_WEIGHT;
  }

  return score;
}

/**
 * Smart sort: order tracks for optimal DJ mixing.
 * Uses greedy nearest-neighbor starting from the first track.
 */
export function smartSort(tracks: PlaylistTrack[]): PlaylistTrack[] {
  if (tracks.length <= 2) return [...tracks];

  const result: PlaylistTrack[] = [];
  const remaining = new Set(tracks.map((_, i) => i));

  // Start with the first track (or lowest BPM if available)
  let startIdx = 0;
  const withBpm = tracks.filter(t => t.bpm > 0);
  if (withBpm.length > 0) {
    // Start from the lowest BPM track for a natural build-up
    let lowestBpm = Infinity;
    for (const i of remaining) {
      if (tracks[i].bpm > 0 && tracks[i].bpm < lowestBpm) {
        lowestBpm = tracks[i].bpm;
        startIdx = i;
      }
    }
  }

  result.push(tracks[startIdx]);
  remaining.delete(startIdx);

  // Greedy: always pick the best next track
  while (remaining.size > 0) {
    const current = result[result.length - 1];
    let bestIdx = -1;
    let bestScore = Infinity;

    for (const i of remaining) {
      const score = transitionScore(current, tracks[i]);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    result.push(tracks[bestIdx]);
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
