import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  // A brand-new, empty data directory: the state of a first deploy or a fresh dev checkout.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ratings-fresh-db-'));
});

describe('ratings route on a fresh database', () => {
  it('loads without "no such table" when nothing has initialised the schema', async () => {
    // ratings.ts prepares statements at import; this import is the first touch of the database.
    const mod = await import('./ratings');
    expect(mod.default).toBeTypeOf('function');
  });
});
