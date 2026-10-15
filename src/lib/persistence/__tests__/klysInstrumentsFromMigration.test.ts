/** A klystrack project saved before `instrumentsFrom` existed reads as the engine's copy (schema 25). */
import { describe, it, expect } from 'vitest';
import { migrateSavedProject, CURRENT_SCHEMA } from '@/lib/persistence/migrations';

describe('schema 25: klysNative.instrumentsFrom', () => {
  it('a schema-24 project without it reads engine; one that has it is left alone', () => {
    const old = { schemaVersion: 24, nativeEngineMeta: { klysNative: {} as { instrumentsFrom?: string } } };
    migrateSavedProject(old, 24);
    expect(old.nativeEngineMeta.klysNative.instrumentsFrom).toBe('engine');
    expect(old.schemaVersion).toBe(CURRENT_SCHEMA);

    const edited = { schemaVersion: 24, nativeEngineMeta: { klysNative: { instrumentsFrom: 'edited' } } };
    migrateSavedProject(edited, 24);
    expect(edited.nativeEngineMeta.klysNative.instrumentsFrom).toBe('edited');
  });
  it('a project with no klystrack data is untouched', () => {
    const p = { schemaVersion: 24 };
    expect(() => migrateSavedProject(p, 24)).not.toThrow();
  });
});
