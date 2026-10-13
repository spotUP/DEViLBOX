/**
 * MCP handlers for the per-format engine choice (plan D7): get_format_engines lists the nuade table with what each
 * format resolves to, set_format_engine switches one (and reopens the loaded song when it is of that format).
 * Both read and write through the same resolver and switch the Settings tab and the instrument panel use.
 */
import { useSettingsStore } from '../../stores/useSettingsStore';
import { NUADE_FORMAT_LIST, nuadeFormatsByPrefKey, NUADE_FORMATS } from '../../engine/nuade/nuadeFormats';
import { displayChoiceFor, effectiveFormatEngine, engineChoicesFor, explicitFormatEngine } from '../../engine/nuade/nuadeRouting';
import { switchFormatEngine } from '../../lib/song/switchFormatEngine';
import type { FormatEngineChoice } from '../../types/formatEngine';

export function getFormatEngines(params: Record<string, unknown> = {}): Record<string, unknown> {
  const only = typeof params.format === 'string' ? params.format.toLowerCase() : null;
  const prefs = useSettingsStore.getState().formatEngine;
  const rows = NUADE_FORMAT_LIST
    .filter((f) => !only || f.id === only || f.prefKey.toLowerCase() === only)
    .map((f) => ({
      id: f.id,
      label: f.label,
      prefKey: f.prefKey,
      role: f.role,
      choices: engineChoicesFor(f),
      // Shown in the vocabulary of `choices`: a replace row whose stored legacy engine is 'native' (our parser, UADE playing) is 'uade'.
      effective: displayChoiceFor(f, effectiveFormatEngine(prefs, f.prefKey) ?? f.defaultEngine),
      default: displayChoiceFor(f, f.defaultEngine),
      explicit: explicitFormatEngine(prefs, f.prefKey) !== undefined,
      scores: { nuade: f.uadeEnvelopeCorrelation, own: f.ownEnvelopeCorrelation ?? null, endAgrees: f.endAgrees },
      heldBecause: f.heldBecause ?? null,
      corpusSongs: f.corpus.length,
    }));
  return { count: rows.length, rows };
}

/** format: a preference key (`soundmon`) or a nuade player id (`mmdc`); engine: native | uade | nuade, or `default` to forget the stored choice. */
export async function setFormatEngine(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const format = String(params.format ?? '');
  const engine = String(params.engine ?? '') as FormatEngineChoice | 'default';
  const prefKey = NUADE_FORMATS[format]?.prefKey ?? (nuadeFormatsByPrefKey(format).length > 0 ? format : null);
  if (!prefKey) return { error: `unknown format ${format}: use a preference key or a nuade player id (get_format_engines lists them)` };
  const r = await switchFormatEngine(prefKey, engine);
  if (!r.switched) return { error: r.error };
  return { ok: true, prefKey, stored: r.stored, reopened: r.reopened };
}
