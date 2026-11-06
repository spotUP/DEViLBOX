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

/**
 * get_playhead_offset: samples every change of the position the pattern editor follows (useWasmPositionStore) for
 * `seconds` and reports, per change, how far it was from the moment that row reached the ear (playheadOffset.ts).
 * Needs an engine that stamps its reports with their render time: David Whittaker today.
 */
export async function getPlayheadOffset(params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const seconds = Math.min(60, Math.max(1, typeof params.seconds === 'number' ? params.seconds : 8));
  const { DavidWhittakerEngine } = await import('../../engine/davidwhittaker/DavidWhittakerEngine');
  const { useWasmPositionStore } = await import('../../stores/useWasmPositionStore');
  const { getDevilboxAudioContext } = await import('../../utils/audio-context');
  const { offsetOfChange, offsetStats } = await import('./playheadOffset');
  if (!DavidWhittakerEngine.hasInstance()) return { error: 'No David Whittaker engine is loaded; get_playhead_offset measures it only' };
  const engine = DavidWhittakerEngine.getInstance();
  const ctx = getDevilboxAudioContext();
  const offsets: number[] = [];
  let unmatched = 0;
  const unsubscribe = useWasmPositionStore.subscribe((s, prev) => {
    if (!s.active || (s.row === prev.row && s.songPos === prev.songPos)) return;
    const obsMs = performance.now();
    const ts = ctx.getOutputTimestamp();
    if (ts.contextTime === undefined || ts.performanceTime === undefined) return;
    const o = offsetOfChange(engine.tickLog(), s.songPos, s.row, obsMs, { contextTime: ts.contextTime, performanceTime: ts.performanceTime });
    if (o === null) unmatched++; else offsets.push(o);
  });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  unsubscribe();
  return {
    seconds, unmatched,
    // Why a run matches nothing: an empty log means the engine reported no clocked tick (no grid clock, or no playTick).
    logEntries: engine.tickLog().length,
    lastLogged: engine.tickLog().slice(-2),
    lastShown: { songPos: useWasmPositionStore.getState().songPos, row: useWasmPositionStore.getState().row },
    latencySeconds: { output: ctx.outputLatency ?? 0, base: ctx.baseLatency },
    offsetMs: offsetStats(offsets),
    meaning: 'grid change time minus the time that row reaches the ear: negative = the grid is early, positive = late',
  };
}
