/**
 * harvestSongPresets — extract reusable synth-instrument presets from a loaded song.
 *
 * When a song loads, its synth-voiced instruments (TB303, Furnace chips, Cinter4,
 * chip synths, etc.) are harvested into the preset library so they become
 * selectable in the synth editor's preset dropdown. PCM sample instruments are
 * skipped — they don't fit the synth-config preset dropdown (which applies
 * oscillator/envelope/filter config, not audio buffers) and would bloat storage.
 *
 * Pure, dependency-free (types only) so the filter/fingerprint/convert logic is
 * unit-testable without the store. `usePresetStore.harvestFromSong` consumes it.
 */

import type { InstrumentConfig, SynthType } from '@typedefs/instrument';

/** synthTypes that are really sample playback — excluded even when type==='synth'. */
const SAMPLE_SYNTH_TYPES: ReadonlySet<SynthType> = new Set<SynthType>([
  'Sampler',
  'Player',
  'GranularSynth',
]);

/** Config keys that identify the *voice* but not the *instance* — ignored for dedupe. */
const NON_IDENTITY_KEYS = new Set(['id', 'name', 'volume', 'pan']);

/**
 * True if the instrument is a real synth voice worth saving as a preset.
 * Rejects PCM samples (`type: 'sample'`) and sample-playback synth types.
 */
export function isHarvestableSynth(inst: Pick<InstrumentConfig, 'type' | 'synthType'>): boolean {
  if (inst.type !== 'synth') return false;
  if (!inst.synthType) return false;
  return !SAMPLE_SYNTH_TYPES.has(inst.synthType);
}

/** Deterministic stringify with sorted keys so fingerprints are order-independent. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => !NON_IDENTITY_KEYS.has(k)).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Voice fingerprint — same synth voice from different songs (or the same song
 * loaded twice) collapses to one preset. Ignores id/name/volume/pan so trivial
 * per-instance differences don't spawn duplicates.
 */
export function presetFingerprint(configLike: Partial<InstrumentConfig>): string {
  return `${configLike.synthType ?? '?'}:${stableStringify(configLike)}`;
}

/** Small stable string hash → short deterministic id (idempotent across reloads). */
function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** A harvested preset: same shape usePresetStore.UserPreset expects. */
export interface RippedPreset {
  id: string;
  name: string;
  category: 'User';
  synthType: SynthType;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  config: Omit<InstrumentConfig, 'id'>;
}

/**
 * Convert a harvestable instrument to a preset. Keeps the FULL config (minus id)
 * so synth-specific sub-configs (furnace/chipSynth/tb303/…) survive — losing them
 * would make chip/Furnace presets play as the wrong voice.
 */
export function toRippedPreset(
  inst: InstrumentConfig,
  sourceSong: string,
  now: number,
): RippedPreset {
  const { id: _id, ...configNoId } = inst;
  void _id;
  const fingerprint = presetFingerprint(inst);
  const cleanSong = sourceSong.replace(/\.[^/.]+$/, '').trim();
  const baseName = (inst.name || '').trim() || cleanSong || inst.synthType;
  return {
    id: `ripped-${hashString(fingerprint)}`,
    name: cleanSong && baseName !== cleanSong ? `${baseName} (${cleanSong})` : baseName,
    category: 'User',
    synthType: inst.synthType,
    tags: ['ripped', cleanSong, inst.synthType].filter(Boolean),
    createdAt: now,
    updatedAt: now,
    config: configNoId,
  };
}

/**
 * Given a song's instruments plus the already-known fingerprints, return the
 * NEW ripped presets to append (deduped against existing). Pure — the store
 * decides how to merge/cap.
 */
export function harvestNewPresets(
  instruments: InstrumentConfig[],
  sourceSong: string,
  existingFingerprints: ReadonlySet<string>,
  now: number,
): RippedPreset[] {
  const seen = new Set(existingFingerprints);
  const out: RippedPreset[] = [];
  for (const inst of instruments) {
    if (!isHarvestableSynth(inst)) continue;
    const fp = presetFingerprint(inst);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(toRippedPreset(inst, sourceSong, now));
  }
  return out;
}
