/**
 * A build must not ship the development API URL.
 *
 * Vite INLINES `import.meta.env.VITE_API_URL` at build time. The repo's `.env`
 * sets it to `http://localhost:3011/api` so the dev browser talks to the local
 * server; CI never sees that file, so a CI build falls back to the production
 * URL and everything works.
 *
 * A LOCAL build bakes in localhost. Deployed, the site then asks every
 * visitor's own machine for the modland index and every other API call, which
 * fails with "failed to fetch" for everyone. That shipped on 2026-09-18 from a
 * hand-run deploy while GitHub Actions was down for billing, and was reported
 * within minutes as "the online song search says failed to fetch".
 *
 * `scripts/deploy-manual.sh` now forces the production value and refuses to
 * sync a bundle that still mentions the dev port. This is the same guard,
 * where CI can see it: it checks the SOURCE contract that makes the mistake
 * possible, so it holds even when no `dist/` exists.
 *
 * NOT in `src/__tests__/ci/` — that directory is EXCLUDED from the vitest
 * include patterns (vite.config.ts), so a guard placed there would never run.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('nothing hardcodes the development server', () => {
  /**
   * `instrument-classifier.worker.ts` pinned `http://localhost:3011/onnx-wasm/`
   * as a literal. Right in development — Express is on 3011 while the app is on
   * Vite's 5174 — and wrong everywhere else: the deployed site told every
   * visitor's browser to fetch the ONNX runtime from their own machine, so the
   * instrument classifier could never load in production. That one was in CI
   * builds too, so it had been failing live for as long as it existed.
   */
  it('no source file pins the dev API port', { timeout: 30_000 }, () => {
    // `git grep` rather than walking the tree: reading every .ts/.tsx under
    // src/ took long enough to blow the 5 s test timeout under load, and a
    // guard that fails intermittently is a guard people switch off.
    let hits: string[];
    try {
      const cmd = 'git grep -nE "https?://localhost:3011" -- "src/*.ts" "src/*.tsx"';
      hits = execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    } catch {
      hits = [];   // git grep exits non-zero when it finds nothing
    }
    const offenders = hits.filter(line => {
      const code = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1);
      // A comment explaining the trap is fine; a live URL in code is not.
      return !/^\s*(\*|\/\/)/.test(code);
    });
    expect(
      offenders,
      'These would point a deployed build at the developer\'s own machine. '
      + 'Derive the URL from VITE_API_URL instead.',
    ).toEqual([]);
  });
});

describe('the API base is environment-driven with a PRODUCTION fallback', () => {
  const api = readFileSync(resolve(ROOT, 'src/lib/modlandApi.ts'), 'utf8');

  it('falls back to the live host, not to localhost', () => {
    // The fallback is what a CI build compiles in, so it has to be the one
    // that works for a stranger's browser.
    const match = /const API_URL = import\.meta\.env\.VITE_API_URL \|\| '([^']+)'/.exec(api);
    expect(match, 'API_URL should be `import.meta.env.VITE_API_URL || <fallback>`').toBeTruthy();
    expect(match![1]).not.toMatch(/localhost/);
    expect(match![1]).toMatch(/^https:\/\//);
  });
});

describe('the manual deploy route cannot ship a dev bundle', () => {
  const script = resolve(ROOT, 'scripts/deploy-manual.sh');

  it('exists, because CI cannot build while billing is stopped', () => {
    expect(existsSync(script)).toBe(true);
  });

  const sh = existsSync(script) ? readFileSync(script, 'utf8') : '';

  it('forces the production API URL rather than trusting .env', () => {
    expect(sh).toContain('VITE_API_URL="$PROD_API_URL" npm run build');
  });

  it('refuses to sync a bundle that still references the dev port', () => {
    expect(sh).toContain('localhost:3011');
    expect(sh).toContain('REFUSING TO DEPLOY');
  });

  it('compares content, or it re-sends 1.9 GB for no reason', () => {
    expect(sh).toMatch(/rsync -a -c --delete/);
  });

  it('verifies what is actually live instead of assuming', () => {
    expect(sh).toContain('version.json');
    expect(sh).toContain('MISMATCH');
  });

  it('leaves the GitHub Release alone, so the desktop installers survive', () => {
    expect(sh).not.toMatch(/gh release delete/);
  });
});

describe('if a build is present, it must be deployable', () => {
  const assets = resolve(ROOT, 'dist/assets');

  // Reads every JS bundle in dist/, which is tens of megabytes. That took
  // 5.7 s under a loaded full-suite run and tripped vitest's 5 s default,
  // blocking a push over a guard that was working correctly. The work is
  // genuinely I/O-bound, so it gets the time rather than a weaker assertion.
  it('contains no reference to the development API port', { timeout: 30_000 }, () => {
    if (!existsSync(assets)) return;   // nothing built here; nothing to check
    const offenders: string[] = [];
    for (const name of readdirSync(assets)) {
      if (!name.endsWith('.js')) continue;
      const text = readFileSync(join(assets, name), 'utf8');
      if (text.includes('localhost:3011')) offenders.push(name);
    }
    expect(
      offenders,
      'These bundles would ask every visitor\'s own machine for the API. '
      + 'Rebuild with VITE_API_URL set to the production URL.',
    ).toEqual([]);
  });
});
