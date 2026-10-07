/**
 * Saved-project schema migrations.
 *
 * The persistence layer stamps every saved project with a `schemaVersion`. When
 * the schema changes in a purely-additive way (a new optional field), older
 * projects MUST still load — they simply lack the new data. This module holds
 * the forward-migration chain and the minimum schema we can still load.
 *
 * House rule (localStorage / IndexedDB migration): never hard-discard a project
 * whose schema is >= MIN_LOADABLE_SCHEMA. Only genuinely-incompatible schemas
 * (below the minimum, predating data-bug fixes that can't be forward-migrated)
 * are discarded.
 */

import { pitchToNoteValue } from '@/lib/tracker/noteValue';

/**
 * Lowest `schemaVersion` the current code can forward-migrate and load.
 *
 * Bump this ONLY when a schema change is NOT forward-compatible (e.g. it fixes a
 * data-corruption bug that can't be repaired by adding defaults). Additive
 * bumps (new optional fields) must leave this untouched so existing saves load.
 *
 * 21: last schema before the companion/sidecar-files addition (schema 22).
 *     Schema-21 projects load fine under 22 — they just have no companions.
 */
export const MIN_LOADABLE_SCHEMA = 21;

/**
 * Current saved-project schema version. `useProjectPersistence` stamps this on
 * every save and gates loads against it. Kept here so the migration chain and
 * the writer share one source of truth.
 */
export const CURRENT_SCHEMA = 24;

/**
 * Forward-migrate a saved project in place from `fromVersion` up to the current
 * schema. Assumes `fromVersion >= MIN_LOADABLE_SCHEMA` (callers gate on that and
 * discard anything older). Each step is additive and idempotent.
 *
 * @param project     the parsed saved project (mutated in place)
 * @param fromVersion the project's stored `schemaVersion`
 */
export function migrateSavedProject(
  project: { schemaVersion?: number },
  fromVersion: number,
): void {
  // 21 → 22: `nativeCompanionFiles` (Sonix .instr/.ss, TFMX smpl, Richard
  //          Joseph, Jason Page) added. Purely additive — a v21 project simply
  //          has no companions, so there is nothing to transform. Future
  //          migrations chain below, guarded by `if (fromVersion < N)`.
  // 22 → 23: `performanceJournal` (Gate M1) — what the dub performer played
  //          and why. Purely additive AND forward-compatible: a v22 project
  //          simply has no journal, and a v23 project loads in a build that
  //          has never heard of the field, because it is commentary rather
  //          than anything replay depends on.
  // 23 → 24: the mixer channel's dub filter (`dubFilterMode`/`dubFilterHz`)
  //          became the sound-shaping slot (`dubShape`/`dubShapeValue`), which
  //          holds the filter as two of its seven kinds. Transformed, not
  //          dropped: a v23 project's filter carries over as the same filter.
  if (fromVersion < 24) {
    const mixer = (project as { mixer?: { channels?: Array<Record<string, unknown>> } }).mixer;
    if (Array.isArray(mixer?.channels)) mixer.channels = mixer.channels.map((c) => migrateMixerChannelShape(c));
  }

  // Stamp the project at the current schema so a subsequent save is not
  // re-migrated.
  project.schemaVersion = CURRENT_SCHEMA;
}

/**
 * A saved mixer channel's legacy dub filter as the shaping slot (schema 24).
 *
 * `dubFilterMode: 'hpf' | 'lpf'` becomes `dubShape` of the same kind with the
 * cutoff carried as `dubShapeValue`; `'off'` becomes Off. Idempotent: a
 * channel that already has `dubShape` is returned with the legacy keys
 * stripped. Also applied by `loadMixerState` itself, because song files and
 * exports carry a mixer snapshot without passing through the project chain.
 */
export function migrateMixerChannelShape<T extends object>(channel: T): T {
  const c = channel as Record<string, unknown>;
  if (c.dubFilterMode === undefined && c.dubFilterHz === undefined) return channel;
  const { dubFilterMode, dubFilterHz, ...rest } = c;
  if (rest.dubShape === undefined) {
    const mode = dubFilterMode === 'hpf' || dubFilterMode === 'lpf' ? dubFilterMode : 'off';
    rest.dubShape = mode;
    rest.dubShapeValue = mode === 'off' ? 0 : (typeof dubFilterHz === 'number' && Number.isFinite(dubFilterHz) ? dubFilterHz : 200);
  }
  return rest as T;
}

/**
 * Songs saved while two parsers shifted a whole grid up to fit it above C-0 (Hippel TFMX, 858d8ef85: cells
 * carry `hippelBias`; Future Player, 2673e7140: instruments carry `metadata.fpOctaveBias`) are moved back
 * down to the pitch they play, now that the grid holds the octave below C-0 (G15, src/lib/tracker/noteValue.ts).
 * Without this their export would write every note an octave off, because the writers no longer add a shift.
 * Keyed on the fields themselves, which it removes, so it is idempotent and leaves every other song untouched.
 * Mutates and returns its arguments.
 */
export function migrateGridOctaveBias<P extends { channels: Array<{ rows: Array<Record<string, unknown>> }> }, I extends { metadata?: Record<string, unknown> }>(
  patterns: P[],
  instruments: I[],
): { patterns: P[]; instruments: I[]; shifted: number } {
  let bias = 0;
  for (const p of patterns) for (const ch of p.channels) for (const c of ch.rows) {
    const b = c?.hippelBias;
    if (typeof b === 'number' && b !== 0) bias = b;
  }
  for (const inst of instruments) {
    const b = inst.metadata?.fpOctaveBias;
    if (typeof b === 'number' && b !== 0) bias = b;
    if (inst.metadata && 'fpOctaveBias' in inst.metadata) delete inst.metadata.fpOctaveBias;
  }
  let shifted = 0;
  for (const p of patterns) for (const ch of p.channels) for (const c of ch.rows) {
    if (!c) continue;
    if ('hippelBias' in c) delete c.hippelBias;
    if (bias === 0) continue;
    for (const key of ['note', 'note2', 'note3', 'note4'] as const) {
      const v = c[key];
      if (typeof v === 'number' && v >= 1 && v <= 96) { c[key] = pitchToNoteValue(v - bias); shifted++; }
    }
  }
  return { patterns, instruments, shifted };
}
