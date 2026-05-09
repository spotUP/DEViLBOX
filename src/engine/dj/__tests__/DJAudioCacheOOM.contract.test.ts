/**
 * Contract test for the DJ audio cache OOM regression.
 *
 * The playlist modal asks `useStemStatus` to resolve cache hits for every
 * visible row. When `DJAudioCache.ts` used `store.getAll()` against a store
 * holding up to 2 GB of WAV data, ~20 concurrent lookups could each pull the
 * entire cache into memory and crash Chrome with an Aw Snap OOM.
 *
 * This guard is intentionally static: it greps the source so the dangerous
 * `store.getAll()` pattern can never quietly return.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = readFileSync(resolve(ROOT, 'engine/dj/DJAudioCache.ts'), 'utf8');

describe('DJAudioCache OOM guard contract', () => {
  it('never calls store.getAll() on the audio cache object store', () => {
    expect(SRC).not.toMatch(/\bstore\.getAll\s*\(/);

    const getAllCalls = [...SRC.matchAll(/\b([A-Za-z_$][\w$]*)\.getAll\s*\(([^)]*)\)/g)];
    expect(getAllCalls.length, 'filename lookups should still use index.getAll(key)').toBeGreaterThan(0);

    for (const [, receiver, args] of getAllCalls) {
      expect(receiver, `Only index.getAll(key) is allowed, found ${receiver}.getAll(...)`).toBe('index');
      expect(args.trim(), 'index.getAll must be key-scoped, never full-store').not.toBe('');
    }
  });

  it('bumps DB_VERSION to v2+ so the filename index exists', () => {
    const match = SRC.match(/\bconst\s+DB_VERSION\s*=\s*(\d+)\s*;/);
    expect(match, 'DB_VERSION declaration should exist').not.toBeNull();
    expect(Number(match?.[1] ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('creates the filename index during onupgradeneeded', () => {
    const upgradeHandler = SRC.match(/request\.onupgradeneeded\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s*\};/);
    expect(upgradeHandler, 'onupgradeneeded handler should exist').not.toBeNull();
    expect(upgradeHandler?.[0]).toMatch(/createIndex\('filename',\s*'filename',\s*\{\s*unique:\s*false\s*\}\)/);
  });
});
