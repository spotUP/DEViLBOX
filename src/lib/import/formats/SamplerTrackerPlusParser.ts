/**
 * SamplerTrackerPlusParser — re-exports STP format detection from STPParser.
 *
 * SoundTracker Pro II / Sampler Tracker Plus files share the same 'STP3' magic.
 * This module exists as a compatibility alias; the canonical implementation is
 * in STPParser.ts.
 */
export { isSTPFormat } from './STPParser';
