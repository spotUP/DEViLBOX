/**
 * 2026-10-08: three pushes failed because other agents' unfinished edits sat in the working tree and the
 * pre-push gate ran type-check and test:ci on the WORKING TREE. A green gate also proved nothing about the
 * commits being pushed. scripts/git-hooks/pre-push must test the pushed commit, materialised into a
 * temporary directory that is gone again when the hook exits.
 *
 * The fake repo's three npm scripts each `grep -q ok check.txt`, so a file's content decides pass or fail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const HOOK = resolve(__dirname, '../../scripts/git-hooks/pre-push');
const ZERO = '0'.repeat(40);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
let repo = '';
let scratch = '';

const snapshots = () => readdirSync(scratch).filter((n) => n.startsWith('devilbox-prepush.'));
function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', env }).trim();
}
function commitCheck(content: string): string {
  writeFileSync(join(repo, 'check.txt'), content);
  git('add', 'check.txt');
  git('commit', '-q', '-m', `check ${content.trim()}`);
  return git('rev-parse', 'HEAD');
}
/** Run the hook the way git does: ref list on stdin, TMPDIR pointed at a directory we can inspect. */
function runHook(sha: string): { code: number; err: string } {
  const r = spawnSync('bash', [HOOK], {
    cwd: repo, encoding: 'utf8', env: { ...env, TMPDIR: scratch },
    input: `refs/heads/main ${sha} refs/heads/main ${ZERO}\n`,
  });
  return { code: r.status ?? -1, err: r.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'prepush-repo-'));
  scratch = mkdtempSync(join(tmpdir(), 'prepush-tmp-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  const script = 'grep -q ok check.txt';
  writeFileSync(join(repo, 'package.json'), JSON.stringify({
    name: 'fake', version: '0.0.0', scripts: { 'type-check': script, 'test:ci': script, 'test:compliance': script },
  }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src/a.ts'), 'export {};\n');
  git('add', '.');
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe('scripts/git-hooks/pre-push gates the pushed commit, not the working tree', { timeout: 60000 }, () => {
  it('passes when HEAD is green although the working tree holds a failing uncommitted edit', () => {
    const sha = commitCheck('ok\n');
    writeFileSync(join(repo, 'check.txt'), 'red: another agent, unfinished\n');
    writeFileSync(join(repo, 'untracked.ts'), 'not even added\n');
    const r = runHook(sha);
    expect(r.err).toContain('all checks passed');
    expect(r.code).toBe(0);
  });

  it('fails when the pushed commit is red, even though the working tree has been fixed since', () => {
    const sha = commitCheck('red\n');
    writeFileSync(join(repo, 'check.txt'), 'ok\n');
    const r = runHook(sha);
    expect(r.err).toContain('type-check failed');
    expect(r.code).toBe(1);
  });

  it('tests the commit that is pushed, not the one checked out', () => {
    const green = commitCheck('ok\n');
    commitCheck('red\n');
    expect(runHook(green).code).toBe(0);
  });

  it('lets a test ask git which files the pushed commit tracks', () => {
    // softwarePaulaSingleCopy runs `git ls-files`; a bare git-archive tree had
    // no repository, so the 2026-10-10 push failed with "Command failed: git ls-files".
    writeFileSync(join(repo, 'package.json'), JSON.stringify({
      name: 'fake', version: '0.0.0',
      scripts: { 'type-check': 'true', 'test:ci': 'git ls-files | grep -qx check.txt', 'test:compliance': 'true' },
    }));
    git('add', 'package.json');
    const sha = commitCheck('ok\n');
    const r = runHook(sha);
    expect(r.err).toContain('all checks passed');
    expect(r.code).toBe(0);
  });

  it('with a known remote base it runs the affected tests, not the whole suite', () => {
    // Owner 2026-10-11: the whole-suite gate took 25 min quiet and 1 h 52 min
    // under load. test:ci here always fails, so reaching it fails the push.
    mkdirSync(join(repo, 'scripts/git-hooks'), { recursive: true });
    writeFileSync(join(repo, 'scripts/git-hooks/affected-tests.mjs'), 'process.stdout.write("");\n');
    writeFileSync(join(repo, 'package.json'), JSON.stringify({
      name: 'fake', version: '0.0.0', scripts: { 'type-check': 'true', 'test:ci': 'exit 1', 'test:compliance': 'true' },
    }));
    git('add', '.');
    const base = commitCheck('ok\n');
    writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1;\n');
    git('add', 'src/a.ts');
    git('commit', '-q', '-m', 'change');
    const sha = git('rev-parse', 'HEAD');
    const r = spawnSync('bash', [HOOK], {
      cwd: repo, encoding: 'utf8', env: { ...env, TMPDIR: scratch },
      input: `refs/heads/main ${sha} refs/heads/main ${base}\n`,
    });
    expect(r.stderr).toContain('affected tests ok');
    expect(r.stderr).not.toContain('test:ci');
    expect(r.status).toBe(0);
  });

  it('leaves no snapshot directory behind, after a pass or a failure', () => {
    runHook(commitCheck('ok\n'));
    expect(snapshots()).toEqual([]);
    runHook(commitCheck('red\n'));
    expect(snapshots()).toEqual([]);
  });
});
