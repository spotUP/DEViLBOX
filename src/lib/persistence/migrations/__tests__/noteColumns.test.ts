import { describe, it, expect } from 'vitest';
import { migrateNoteColumns, migrateSavedProject, CURRENT_SCHEMA } from '../index';

const pat = () => [{ channels: [{ rows: [
  { note: 5, note2: 7, instrument2: 2, delay2: 3, note4: 9, volume4: 40 },
  { note: 0 },
] }] }];

describe('note column migration (schema 27)', () => {
  it('turns note2..note4 into extraNotes and removes the old fields', () => {
    const p = migrateNoteColumns(pat() as never) as Array<{ channels: Array<{ rows: unknown[] }> }>;
    const c = p[0].channels[0].rows[0] as Record<string, unknown>;
    expect(c.extraNotes).toEqual([{ note: 7, instrument: 2, delay: 3 }, {}, { note: 9, volume: 40 }]);
    expect('note2' in c || 'note4' in c || 'volume4' in c).toBe(false);
    expect((p[0].channels[0].rows[1] as Record<string, unknown>).extraNotes).toBeUndefined();
  });
  it('is idempotent', () => {
    const p = migrateNoteColumns(pat() as never) as Array<{ channels: Array<{ rows: unknown[] }> }>;
    const once = JSON.stringify(p);
    expect(JSON.stringify(migrateNoteColumns(p as never))).toBe(once);
  });
  it('runs from migrateSavedProject for a schema 26 project and stamps 27', () => {
    const project = { schemaVersion: 26, patterns: pat() };
    migrateSavedProject(project, 26);
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(CURRENT_SCHEMA).toBe(27);
    expect((project.patterns[0].channels[0].rows[0] as Record<string, unknown>).extraNotes).toHaveLength(3);
  });
});
