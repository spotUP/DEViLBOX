/**
 * Regression: desktop (Electron) native builds must actually build and ship.
 *
 * Two independent failures caused "no native builds listed" on a deploy:
 *
 * 1. A dead `node-hid` dependency (declared but imported nowhere) forced a
 *    per-platform node-gyp rebuild. It broke the Windows electron job
 *    ("Could not find any Visual Studio installation") and the Linux job
 *    ("libusb.h: No such file or directory"), so no .exe / .AppImage / .deb
 *    binaries were produced. node-hid was the ONLY native module in the tree —
 *    removing it lets @electron/rebuild find nothing to compile on any platform.
 *
 * 2. The `release` job depended only on `build-server`, so the GitHub Release
 *    was created and the deploy webhook fired BEFORE the electron jobs finished.
 *    `download-artifact` (continue-on-error) grabbed nothing → the release was
 *    published with only the server tarball, no desktop binaries. Making
 *    `release` also need `electron` forces the artifacts to exist first.
 *
 * These are config-integrity checks (no engine), wired into test:ci so a
 * regression on either front fails the push that introduces it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');

// ─── 1. No native (node-gyp) dependency that breaks Electron CI ──────────────

describe('Electron CI has no native module to rebuild', () => {
  // Modules that require a per-platform node-gyp compile. Any of these in
  // `dependencies` / `optionalDependencies` forces @electron/rebuild to run a
  // native toolchain on every runner and reintroduces the Win/Linux breakage.
  const NATIVE_DENYLIST = [
    'node-hid',
    'usb',
    'serialport',
    'robotjs',
    'better-sqlite3',
    'sqlite3',
    'node-pty',
    'midi',
    'speaker',
    'ffi-napi',
    'ref-napi',
  ];

  it('declares none of the known native node-gyp modules as a dependency', () => {
    // Teeth: re-adding "node-hid" (or any denylisted module) to dependencies
    // makes this fail — the exact regression that broke the desktop builds.
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'),
    ) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]);

    const offenders = NATIVE_DENYLIST.filter((m) => declared.has(m));
    expect(offenders).toEqual([]);
  });
});

// ─── 2. The release job waits for the electron artifacts ─────────────────────

describe('deploy.yml release attaches desktop binaries', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/deploy.yml'),
    'utf-8',
  );

  // Pull the `needs:` line of the `release:` job. Slice from the `release:`
  // header to the next top-level (2-space) job header, then read its `needs:`.
  const releaseNeeds = (() => {
    const start = workflow.indexOf('\n  release:');
    if (start === -1) return '';
    const rest = workflow.slice(start + 1);
    const nextJob = rest.slice(1).search(/\n {2}\w/);
    const block = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
    return block.match(/^\s*needs:\s*(.+)$/m)?.[1] ?? '';
  })();

  it('release needs build-server so the deploy is gated on a green server build', () => {
    expect(releaseNeeds).toContain('build-server');
  });

  it('release needs electron so binaries exist before the release/deploy fires', () => {
    // Teeth: reverting `needs: [build-server, electron]` back to
    // `needs: [build-server]` makes this fail — the race that published a
    // release with no desktop binaries.
    expect(releaseNeeds).toContain('electron');
  });
});
