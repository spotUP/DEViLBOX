/**
 * 2026-10-13: every hook snapshot (pre-commit's kept clone, its concurrent fallback, each pre-push commit) was a full
 * checkout, 66 000 files / 2.2 GB, of which 1.5 GB (third-party, juce-wasm, Milkdrop presets, impulse-response samples,
 * 3D models, trace files) is read by no test. A fresh checkout took 73 s on a quiet machine and the disk filled with
 * kept clones. scripts/git-hooks/snapshot.sh now checks out everything EXCEPT SNAPSHOT_SKIPPED_PATHS (a blacklist, so a
 * new src/ file is always in).
 *
 * Three properties:
 *  1. the snapshot really lacks the skipped paths and has everything else (mechanism, in a fake repo);
 *  2. no test names a skipped path (the census that produced the list, re-run, so a test that starts reading one fails
 *     here instead of in a hook, on somebody else's commit);
 *  3. a second concurrent commit gets another KEPT snapshot, not a fresh full checkout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const SNAPSHOT_SH = join(ROOT, 'scripts/git-hooks/snapshot.sh');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

function bash(script: string, cwd: string, extra: Record<string, string> = {}) {
  const r = spawnSync('bash', ['-c', script], { cwd, encoding: 'utf8', env: { ...env, ...extra } });
  if (r.status !== 0) throw new Error(`bash failed (${r.status}): ${r.stderr}`);
  return r.stdout.trim();
}
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 }).trim();

describe('hook snapshot leaves out the paths no test reads', { timeout: 120000 }, () => {
  let repo = '';
  let scratch = '';
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'snapsparse-repo-'));
    scratch = mkdtempSync(join(tmpdir(), 'snapsparse-tmp-'));
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 't@t');
    git(repo, 'config', 'user.name', 't');
    for (const f of ['src/a.ts', 'third-party/furnace-master/x.c', 'public/tumult/samples/ir.wav', 'public/tumult/Tumult.worklet.js',
      'public/models/guitarml/amp.json', 'public/models/vestax/tex.jpg', 'public/data/songs/index.json', 'trace.json.gz', 'third-party/uade-3.05/eagleplayer.conf', 'package.json']) {
      mkdirSync(join(repo, f, '..'), { recursive: true });
      writeFileSync(join(repo, f), 'x\n');
    }
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'seed');
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  it('checks out everything except the skipped paths', () => {
    const out = bash(`. "${SNAPSHOT_SH}"; SNAP_LABEL=t materialise "$(git rev-parse HEAD)"; echo "$SNAP"`, repo, { TMPDIR: scratch + '/' });
    try {
      for (const kept of ['src/a.ts', 'package.json', 'public/tumult/Tumult.worklet.js', 'public/models/guitarml/amp.json', 'public/data/songs/index.json', 'third-party/uade-3.05/eagleplayer.conf']) {
        expect(existsSync(join(out, kept)), kept).toBe(true);
      }
      for (const skipped of ['third-party/furnace-master/x.c', 'public/tumult/samples/ir.wav', 'public/models/vestax/tex.jpg', 'trace.json.gz']) {
        expect(existsSync(join(out, skipped)), skipped).toBe(false);
      }
      // Still a repository that knows the skipped files are tracked (tests ask git, softwarePaulaSingleCopy).
      expect(git(out, 'ls-files', 'third-party')).toContain('third-party/furnace-master/x.c');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('a second concurrent commit reuses another kept snapshot instead of a fresh checkout', () => {
    const out = bash(
      `. "${SNAPSHOT_SH}"; SNAP_LABEL=t; sha=$(git rev-parse HEAD); tree=$(git write-tree)
       materialise_reusable "$sha" "$tree"; echo "$SNAP"
       materialise_reusable "$sha" "$tree"; echo "$SNAP"
       materialise_reusable "$sha" "$tree"; echo "$SNAP"`,
      repo, { TMPDIR: scratch + '/', DEVILBOX_HOOK_SLOTS: '2' });
    const [first, second, third] = out.split('\n');
    expect(first).toMatch(/-kept-\d+$/);
    expect(second).toBe(`${first}-2`);
    expect(third).toMatch(/devilbox-t\.[A-Za-z0-9]+$/); // every slot busy: only then a fresh snapshot
    expect(existsSync(join(second, 'src/a.ts'))).toBe(true);
    expect(existsSync(join(second, 'third-party/furnace-master/x.c'))).toBe(false);
  });

  it('rebuilds a kept snapshot made with other patterns (the old full checkouts)', () => {
    const out = bash(
      `. "${SNAPSHOT_SH}"; SNAP_LABEL=t; sha=$(git rev-parse HEAD); tree=$(git write-tree)
       materialise_reusable "$sha" "$tree"; kept=$SNAP; rmdir "$KEPT_LOCK"; KEPT_LOCK=
       git -C "$kept" sparse-checkout disable 2>/dev/null; rm -f "$kept/.git/devilbox-sparse"; git -C "$kept" checkout -q --force "$sha"
       test -e "$kept/third-party/furnace-master/x.c" && echo old-was-full
       materialise_reusable "$sha" "$tree"; echo "$SNAP"`,
      repo, { TMPDIR: scratch + '/' });
    const lines = out.split('\n');
    expect(lines[0]).toBe('old-was-full');
    expect(existsSync(join(lines[1], 'third-party/furnace-master/x.c'))).toBe(false);
    expect(existsSync(join(lines[1], 'src/a.ts'))).toBe(true);
  });

  it('no test names a skipped path', () => {
    const skipped = bash(`. "${SNAPSHOT_SH}"; printf '%s\\n' "\${SNAPSHOT_SKIPPED_PATHS[@]}"`, ROOT).split('\n').map((p) => p.replace(/^\/|\/$/g, ''));
    expect(skipped.length).toBeGreaterThan(5);
    const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/\'"`]*');
    const sep = '[\'"`, /]+';
    const patterns = skipped.map((p) => ({ p, re: new RegExp(`(^|[\\s'"\`/])${p.split('/').map(esc).join(sep)}(['"\`/\\s,)]|$)`) }));

    // Test code = test files, and the helpers/fixtures that live in test directories.
    const files = git(ROOT, 'ls-files', '-z', '--', 'src').split('\0').filter((f) =>
      /\.(ts|tsx|mjs|js|json)$/.test(f) && (/\.(test|spec)\.tsx?$/.test(f) || /(^|\/)(__tests__|test)\//.test(f)) && !f.endsWith('.json') && !f.endsWith('hookSnapshotLeavesOutThePathsNoTestReads.test.ts'));
    expect(files.length).toBeGreaterThan(500);
    const hits: string[] = [];
    for (const f of files) {
      let text = '';
      try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
      for (const { p, re } of patterns) if (re.test(text)) hits.push(`${f} names ${p}`);
    }
    // A hit must be removed from SNAPSHOT_SKIPPED_PATHS (the test needs the file) or the test must stop reading it.
    expect(hits).toEqual([]);
  });

  it('keeps every *-wasm engine directory, which tests read by pattern rather than by name', () => {
    // softwarePaulaSingleCopy lists `git ls-files` and reads every <name>-wasm/**/CMakeLists*.txt, so a skipped engine
    // directory never shows up as a named path in the census above; skipping juce-wasm failed the pre-push gate with
    // ENOENT juce-wasm/CMakeLists.txt (2026-10-14).
    const skipped = bash(`. "${SNAPSHOT_SH}"; printf '%s\\n' "\${SNAPSHOT_SKIPPED_PATHS[@]}"`, ROOT).split('\n').map((p) => p.replace(/^\//, ''));
    expect(skipped.filter((p) => /^[^/]+-wasm(\/|$)/.test(p))).toEqual([]);
  });

  it('every skipped path is still tracked, so the list cannot rot', () => {
    const skipped = bash(`. "${SNAPSHOT_SH}"; printf '%s\\n' "\${SNAPSHOT_SKIPPED_PATHS[@]}"`, ROOT).split('\n').map((p) => p.replace(/^\//, ''));
    expect(skipped.length).toBeGreaterThan(5);
    for (const p of skipped) {
      const listed = git(ROOT, 'ls-files', '--', `:(glob)${p.endsWith('/') ? p + '**' : p}`);
      expect(listed, p).not.toBe('');
    }
  });
});
