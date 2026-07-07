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
export const CURRENT_SCHEMA = 22;

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
  void fromVersion;

  // Stamp the project at the current schema so a subsequent save is not
  // re-migrated.
  project.schemaVersion = CURRENT_SCHEMA;
}
