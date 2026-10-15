/**
 * Standalone klystrack instruments in an exported .kt (the export copy only; the live project is never changed).
 *
 * A standalone instrument belongs to no song (InstrumentConfig.klystrack, or a KlysSynth entry beyond the song's
 * instrument table). The exported file's table is: the song's instruments in their slots, then the standalone ones
 * USED by a pattern step (ascending instrument number), then the unused ones so a hand-made preset bank travels with the
 * file. Steps that reference a used standalone instrument are renumbered to its new slot. klystrack holds at most 127
 * instruments: a used one that does not fit is an error (never silently dropped); unused ones that do not fit are
 * left out with a warning.
 */
import type { InstrumentConfig } from '@/types/instrument';
import type { KlysNativeData, KlysNativeInstrument } from '@/types/tracker';
import { klysInitInstrument } from '@constants/klysPresets';
import { klysInstrumentIndex } from '@/engine/klystrack/klysInstrumentFields';

export const KLYS_MAX_INSTRUMENTS = 127;
const NO_INSTRUMENT = 0xff;

export interface KlysExportPlan {
  /** Instruments appended after the song's table, in slot order. */
  extra: KlysNativeInstrument[];
  /** Pattern-step instrument number -> exported number (identity except the used standalone ones). */
  remap: Uint8Array;
  warnings: string[];
  /** Set when a used standalone instrument cannot fit the 127-instrument table. */
  error?: string;
}

export function planKlysExport(instruments: readonly InstrumentConfig[], klysNative: KlysNativeData | null): KlysExportPlan {
  const songCount = klysNative?.instruments.length ?? 0;
  const remap = new Uint8Array(256).map((_, i) => i);
  const standalone = instruments
    .filter((c) => c.synthType === 'KlysSynth' && (c.klystrack !== undefined || klysInstrumentIndex(c.id) >= songCount))
    .map((c) => ({ index: klysInstrumentIndex(c.id), inst: { ...(c.klystrack ?? klysInitInstrument()), name: c.name || c.klystrack?.name || '' } }))
    .filter((s) => s.index >= 0 && s.index < NO_INSTRUMENT)
    .sort((a, b) => a.index - b.index);

  const referenced = new Set<number>();
  for (const pattern of klysNative?.patterns ?? []) for (const step of pattern.steps) referenced.add(step.instrument);
  const used = standalone.filter((s) => referenced.has(s.index));
  const unused = standalone.filter((s) => !referenced.has(s.index));

  const room = KLYS_MAX_INSTRUMENTS - songCount;
  const warnings: string[] = [];
  if (used.length > room) {
    return {
      extra: [], remap, warnings,
      error: `Cannot export: the song has ${songCount} instruments and ${used.length} more standalone klystrack instruments are used in its patterns, `
        + `but a klystrack file holds at most ${KLYS_MAX_INSTRUMENTS}.`,
    };
  }
  const kept = [...used, ...unused.slice(0, room - used.length)];
  if (kept.length < standalone.length) {
    warnings.push(`${standalone.length - kept.length} unused standalone klystrack instruments were left out: a klystrack file holds at most ${KLYS_MAX_INSTRUMENTS} instruments.`);
  }
  kept.forEach((s, k) => { if (used.includes(s)) remap[s.index] = songCount + k; });
  return { extra: kept.map((s) => s.inst), remap, warnings };
}
