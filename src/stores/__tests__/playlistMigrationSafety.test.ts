/**
 * Contract test: playlist migrations must NEVER wipe user data.
 *
 * On 2026-04-13, a destructive schema migration set playlists=[] and wiped
 * hours of user work. This test locks down the migration code to ensure
 * it always preserves existing playlists.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const STORE_PATH = path.resolve(__dirname, '../useDJPlaylistStore.ts');

describe('playlistMigrationSafety', () => {
  const source = fs.readFileSync(STORE_PATH, 'utf-8');

  it('migration function never unconditionally assigns playlists to an empty array', () => {
    // Extract the migrate function body
    const migrateMatch = source.match(/migrate:\s*\(.*?\)\s*=>\s*\{([\s\S]*?)\n\s{6}\}/);
    expect(migrateMatch).not.toBeNull();
    const migrateBody = migrateMatch![1];

    // Must NOT contain unconditional destructive assignments like:
    //   state.playlists = [];  (without a preceding if-guard)
    // The safe pattern is: if (!state.playlists) state.playlists = [];
    // Strip guarded assignments before checking for unguarded ones
    const unguarded = migrateBody.replace(/if\s*\([^)]*\)\s*state\.playlists\s*=\s*\[\s*\];?/g, '');
    expect(unguarded).not.toMatch(/\.playlists\s*=\s*\[\s*\]/);
    expect(unguarded).not.toMatch(/playlists:\s*\[\s*\]/);
  });

  it('migrate function preserves playlists when they exist', () => {
    // The migration must only set playlists if they're missing (falsy check)
    const migrateMatch = source.match(/migrate:\s*\(.*?\)\s*=>\s*\{([\s\S]*?)\n\s{6}\}/);
    expect(migrateMatch).not.toBeNull();
    const migrateBody = migrateMatch![1];

    // Should contain a guard like: if (!state.playlists)
    expect(migrateBody).toMatch(/if\s*\(\s*!state\.playlists\s*\)/);
  });

  it('onRehydrateStorage restores from cloud when local is empty', () => {
    // The rehydration callback should attempt cloud restore
    expect(source).toContain('pullFromCloud');
    expect(source).toContain('playlists.length === 0');
    expect(source).toContain('importPlaylists');
  });

  it('source contains the warning comment about destructive migrations', () => {
    expect(source).toContain('NEVER SET state.playlists = [] IN A MIGRATION');
  });
});
