/**
 * Regression: the backend crash-looped on deploy (2026-11-04) with
 * "Cannot find module '../data/hippo-playlists.json'": build.mjs kept every import under
 * server/src external, but it only emits .ts files, so dist required a JSON file it never wrote.
 * build.mjs now inlines anything it does not emit and fails when a dist require does not resolve.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const serverRoot = resolve(__dirname, '..');

describe('server build output', () => {
  it('every relative require in dist resolves, so the server can start', () => {
    const out = mkdtempSync(join(tmpdir(), 'devilbox-server-dist-'));
    try {
      const r = spawnSync(process.execPath, ['build.mjs'], {
        cwd: serverRoot,
        env: { ...process.env, SERVER_BUILD_OUT: out, SERVER_BUILD_SKIP_TSC: '1' },
        encoding: 'utf8',
      });
      expect(r.stderr).not.toContain('requires files it does not contain');
      expect(r.status).toBe(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
