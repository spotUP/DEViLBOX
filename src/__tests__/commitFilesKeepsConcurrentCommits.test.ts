/**
 * "regression test added?" (2026-10-06) - c0480716b silently reverted the
 * channel-send fix 32b2d9eaa. The commit was retried after "cannot lock ref
 * HEAD" with a temp index read from the HEAD before the other agent's commit
 * landed, so its tree held the old files.
 *
 * scripts/commit-files.sh is the commit path for concurrent agents: it must
 * rebuild the index on every retry and refuse a commit that touches files it
 * was not given.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../scripts/commit-files.sh');
let repo = '';
// The hook and helper must see the repo's own index, not an outer GIT_INDEX_FILE.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', env }).trim();
}
function commitFiles(msg: string, ...files: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('bash', [SCRIPT, '-m', msg, '--', ...files], { cwd: repo, encoding: 'utf8', stdio: 'pipe', env });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'commit-files-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  // The machine may set a global core.hooksPath; this repo's own hook must run.
  git('config', 'core.hooksPath', '.git/hooks');
  writeFileSync(join(repo, 'theirs.txt'), 'old\n');
  writeFileSync(join(repo, 'mine.txt'), 'old\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('scripts/commit-files.sh', { timeout: 30000 }, () => {
  it('keeps another agent\'s commit that lands while ours is being made', () => {
    // A pre-commit hook that, on its first run only, lands another agent's
    // commit of theirs.txt and fails our attempt - as "cannot lock ref HEAD"
    // does when another agent wins the race. The retry must not reuse the
    // index read before that commit landed.
    const hook = join(repo, '.git/hooks/pre-commit');
    writeFileSync(hook, `#!/bin/bash
[ -f "${repo}/.raced" ] && exit 0
touch "${repo}/.raced"
unset GIT_INDEX_FILE
echo new > "${repo}/theirs.txt"
idx=$(mktemp -u); GIT_INDEX_FILE=$idx git read-tree HEAD
GIT_INDEX_FILE=$idx git add theirs.txt
tree=$(GIT_INDEX_FILE=$idx git write-tree)
c=$(git commit-tree "$tree" -p HEAD -m theirs)
git update-ref HEAD "$c"
exit 1
`);
    chmodSync(hook, 0o755);
    writeFileSync(join(repo, 'mine.txt'), 'new\n');

    const r = commitFiles('mine', 'mine.txt');
    expect(r.ok, r.out).toBe(true);
    expect(git('log', '--format=%s')).toBe('mine\ntheirs\nbase');
    // Our commit changes only mine.txt; theirs.txt keeps the other agent's edit.
    expect(git('diff', '--name-only', 'HEAD^', 'HEAD')).toBe('mine.txt');
    expect(git('show', 'HEAD:theirs.txt')).toBe('new');
    expect(readFileSync(join(repo, 'theirs.txt'), 'utf8')).toBe('new\n');
  });

  it('commits nothing but the named files when other files are dirty', () => {
    writeFileSync(join(repo, 'mine.txt'), 'new\n');
    writeFileSync(join(repo, 'theirs.txt'), 'wip\n');
    expect(commitFiles('mine', 'mine.txt').ok).toBe(true);
    expect(git('diff', '--name-only', 'HEAD^', 'HEAD')).toBe('mine.txt');
  });
});
