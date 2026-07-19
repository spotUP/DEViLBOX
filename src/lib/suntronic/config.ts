/**
 * Normalize whatever the caller hands the SunTronic synth voice into a bare
 * `SunTronicConfig` (or null).
 *
 * Two shapes reach `SunTronicSynth.applyConfig`:
 *   • a full `InstrumentConfig` whose `.sunTronic` field IS the SunTronicConfig
 *     (the construct / create path), and
 *   • a bare `SunTronicConfig` whose own marker field is `sunTronic === 1`
 *     (the live-editor path: `updateNativeSynthConfig` forwards the config value
 *     stored at the `sunTronic` key, not the wrapping InstrumentConfig).
 *
 * Collapsing both here keeps the voice from silently dropping live edits (the
 * old code read `.sunTronic` unconditionally, so a bare config set `this.cfg`
 * to the number 1 and rendered nothing).
 */
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';

export function resolveSunTronicConfig(input: unknown): SunTronicConfig | null {
  if (!input || typeof input !== 'object') return null;
  const nested = (input as { sunTronic?: unknown }).sunTronic;
  if (nested && typeof nested === 'object') return nested as SunTronicConfig;
  if (nested === 1) return input as SunTronicConfig;
  return null;
}
