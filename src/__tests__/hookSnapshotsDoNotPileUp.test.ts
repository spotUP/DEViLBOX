/**
 * 2026-10-20: the git hooks' ~1 GB snapshot copies piled up in TMPDIR (4.8 GB in one day, the Mac under 1 GB free).
 * Two leaks: a fresh snapshot whose hook was killed by SIGKILL (no trap runs), and kept pre-commit slots that live
 * forever, one pool per working tree. scripts/git-hooks/snapshot.sh prune_snapshots now runs before every copy and
 * removes dead hooks' snapshots, kept slots idle past DEVILBOX_HOOK_IDLE_MIN, and idle slots beyond
 * DEVILBOX_HOOK_MAX_IDLE. A live hook's snapshot and a locked slot stay.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, utimesSync } from 'fs';
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
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env }).trim();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

describe('hook snapshots do not pile up in TMPDIR', { timeout: 60000 }, () => {
  let repo = '';
  let scratch = '';
  let opts: Record<string, string> = {};
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'snappile-repo-'));
    scratch = mkdtempSync(join(tmpdir(), 'snappile-tmp-'));
    opts = { TMPDIR: scratch + '/' };
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 't@t');
    git(repo, 'config', 'user.name', 't');
    writeFileSync(join(repo, 'a.ts'), 'x\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'seed');
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  it("removes a killed hook's snapshot and keeps a running hook's one", () => {
    // Neither shell installs the traps, so both snapshots outlive their shell, as after a SIGKILL.
    const dead = bash(`. "${SNAPSHOT_SH}"; SNAP_LABEL=t materialise "$(git rev-parse HEAD)"; echo "$SNAP"`, repo, opts);
    expect(existsSync(dead)).toBe(true);
    // The next hook's copy sweeps the first one, whose shell has exited.
    const live = bash(`. "${SNAPSHOT_SH}"; SNAP_LABEL=t materialise "$(git rev-parse HEAD)"; echo "$SNAP"`, repo, opts);
    expect(existsSync(dead)).toBe(false);
    writeFileSync(join(live, '.git/devilbox-owner'), `${process.pid}\n`); // owned by a process that is still running
    bash(`. "${SNAPSHOT_SH}"; prune_snapshots`, repo, opts);
    expect(existsSync(live)).toBe(true);
  });

  it('removes a kept slot left idle too long, keeps a recently used one', () => {
    const slot = bash(
      `. "${SNAPSHOT_SH}"; SNAP_LABEL=t; materialise_reusable "$(git rev-parse HEAD)" "$(git write-tree)"; s=$SNAP; cleanup_snapshot; echo "$s"`,
      repo, opts);
    bash(`. "${SNAPSHOT_SH}"; prune_snapshots`, repo, opts);
    expect(existsSync(slot)).toBe(true); // released a moment ago
    utimesSync(join(slot, '.git/devilbox-last-used'), hoursAgo(2), hoursAgo(2));
    bash(`. "${SNAPSHOT_SH}"; prune_snapshots`, repo, { ...opts, DEVILBOX_HOOK_IDLE_MIN: '30' });
    expect(existsSync(slot)).toBe(false);
  });

  it('keeps at most DEVILBOX_HOOK_MAX_IDLE idle slots, the newest, and never a locked one', () => {
    const out = bash(
      `. "${SNAPSHOT_SH}"; SNAP_LABEL=t; sha=$(git rev-parse HEAD); tree=$(git write-tree)
       materialise_reusable "$sha" "$tree"; a=$SNAP; la=$KEPT_LOCK
       materialise_reusable "$sha" "$tree"; b=$SNAP; lb=$KEPT_LOCK
       materialise_reusable "$sha" "$tree"; c=$SNAP
       touch "$a/.git/devilbox-last-used" "$b/.git/devilbox-last-used" "$c/.git/devilbox-last-used"
       rmdir "$la" "$lb"
       echo "$a"; echo "$b"; echo "$c"`,
      repo, { ...opts, DEVILBOX_HOOK_SLOTS: '3' });
    const [a, b, c] = out.split('\n');
    utimesSync(join(a, '.git/devilbox-last-used'), hoursAgo(0.2), hoursAgo(0.2));
    utimesSync(join(b, '.git/devilbox-last-used'), hoursAgo(0.1), hoursAgo(0.1));
    // a and b are released, c still holds its lock.
    bash(`. "${SNAPSHOT_SH}"; prune_snapshots`, repo, { ...opts, DEVILBOX_HOOK_MAX_IDLE: '1' });
    expect(existsSync(a)).toBe(false); // older idle slot beyond the cap
    expect(existsSync(b)).toBe(true);
    expect(existsSync(c)).toBe(true);
  });
});
