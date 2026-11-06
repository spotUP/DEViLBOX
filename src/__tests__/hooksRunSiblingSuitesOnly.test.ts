/**
 * The git hooks run only a changed file's sibling suites and the changed test files, at most 30.
 *
 * Owner 2026-11-06 ("Siblings only, CI wide"): the source-text and importer expansion (tests that
 * read or import a changed file from elsewhere) made one push select hundreds of suites and hold the
 * machine for every other session. Every wider run belongs to CI, which blocks the deploy.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const root = path.resolve(__dirname, '../..');

// A hook run exports GIT_INDEX_FILE / GIT_DIR for the outer repo; the code under test must not see them.
function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
}

function select(flags: string[], ...files: string[]): { files: string[]; err: string } {
  const r = spawnSync('node', ['scripts/git-hooks/affected-tests.mjs', ...flags, '--files', ...files], {
    cwd: root,
    encoding: 'utf8',
    env: cleanEnv(),
  });
  return { files: r.stdout.split('\n').filter(Boolean), err: r.stderr };
}

const affected = (...files: string[]): string[] => select([], ...files).files;

describe('hook affected-test selection: siblings only', () => {
  it('a source file selects its sibling __tests__ suites', () => {
    expect(affected('src/stores/useDJStore.ts')).toContain('src/stores/__tests__/useDJStore.test.ts');
  });

  it('a shared module selects only its siblings, not its ~87 importers', () => {
    const picked = affected('src/stores/useDJStore.ts');
    expect(picked.length).toBeLessThan(10);
    expect(picked.every((f) => f.startsWith('src/stores/'))).toBe(true);
  });

  it('a test in another folder that imports or reads a file is left to CI', () => {
    const picked = affected('src/engine/dj/DJTrackLoader.ts');
    expect(picked.every((f) => f.startsWith('src/engine/dj/'))).toBe(true);
  });

  it('a changed test file still runs itself', () => {
    const self = 'src/__tests__/hooksRunSiblingSuitesOnly.test.ts';
    expect(affected(self)).toContain(self);
  });

  it('a file outside src/ and server/src/ selects nothing', () => {
    expect(affected('scripts/build.ts')).toEqual([]);
  });

  it('over the cap only the changed test files run, and stderr says the rest is left to CI', () => {
    const self = 'src/__tests__/hooksRunSiblingSuitesOnly.test.ts';
    const all = affected('src/stores/useDJStore.ts', self);
    expect(all.length).toBeGreaterThan(1);
    const capped = select(['--max-suites', '1'], 'src/stores/useDJStore.ts', self);
    expect(capped.files).toEqual([self]);
    expect(capped.err).toContain('left to CI');
  });

  it('the default cap is 30 suites', () => {
    const dir = 'src/lib/import/__tests__';
    const tests = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.test.ts')).slice(0, 31)
      .map((f) => `${dir}/${f}`);
    expect(tests.length).toBe(31);
    expect(affected(...tests)).toEqual([]);
    expect(affected(...tests.slice(0, 30)).length).toBe(30);
  });
});

describe('hook gate stays fast and isolated', () => {
  it('neither hook passes the old importer cap or runs the whole fast tier for a song-load file', () => {
    for (const hook of ['pre-commit', 'pre-push']) {
      const text = fs.readFileSync(path.join(root, 'scripts/git-hooks', hook), 'utf8');
      expect(text).not.toContain('--max-importers');
      expect(text).not.toContain('GLOBAL_EFFECT_FILES=');
    }
  });

  it('both hooks test a snapshot through the one shared mechanism', () => {
    for (const hook of ['pre-commit', 'pre-push']) {
      const text = fs.readFileSync(path.join(root, 'scripts/git-hooks', hook), 'utf8');
      // Sourced from the hook's own directory, so the hook also works when run from another cwd.
      expect(text).toContain('. "$(dirname "$0")/snapshot.sh"');
      expect(text).toMatch(/in_snapshot[^\n]*vitest|in_snapshot npm|run_vitest_suites|\(cd "\$SNAP"/);
    }
  });

  it('the staged snapshot holds the staged content, not another agent\'s working-tree edit', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-snap-'));
    // A hook run (and commit-files.sh) exports GIT_INDEX_FILE / GIT_DIR: they must not leak into the scratch repo.
    const env = cleanEnv();
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env }).trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 't@t');
      git('config', 'user.name', 't');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'committed\n');
      git('add', 'a.txt');
      git('commit', '-q', '-m', 'base');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'staged\n');
      git('add', 'a.txt');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'working-tree wip\n'); // unstaged edit by someone else
      const script = `. ${path.join(root, 'scripts/git-hooks/snapshot.sh')}
        SNAP_LABEL=test; YLW=; RST=
        TREE="$(git write-tree)"; HEADSHA="$(git rev-parse HEAD)"
        # commit-files.sh and git hooks export the OUTER index; the snapshot must ignore it.
        export GIT_INDEX_FILE="$PWD/.git/outer-index"
        materialise "$HEADSHA" "$TREE" 2>/dev/null
        unset GIT_INDEX_FILE
        cat "$SNAP/a.txt"; git -C "$SNAP" grep -l staged -- a.txt; rm -rf "$SNAP"`;
      const out = execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8', env });
      expect(out).toBe('staged\na.txt\n');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
  it('the kept snapshot is reused between commits, follows the new staged content, drops leftovers and releases its lock', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'precommit-kept-'));
    // The kept slot lives under TMPDIR; point it inside the test repository so the
    // finally block removes it (17 orphaned devilbox-test-kept-* slots on 2026-10-19).
    const env = { ...cleanEnv(), TMPDIR: path.join(repo, '.tmp') + '/' };
    fs.mkdirSync(path.join(repo, '.tmp'));
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env }).trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 't@t');
      git('config', 'user.name', 't');
      fs.writeFileSync(path.join(repo, '.gitignore'), '.tmp\n');
      git('add', '.gitignore');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'base\n');
      git('add', 'a.txt');
      git('commit', '-q', '-m', 'base');
      const run = (content: string) => {
        fs.writeFileSync(path.join(repo, 'a.txt'), content);
        git('add', 'a.txt');
        const script = `. ${path.join(root, 'scripts/git-hooks/snapshot.sh')}
          SNAP_LABEL=test; YLW=; RST=
          materialise_reusable "$(git rev-parse HEAD)" "$(git write-tree)" 2>/dev/null
          echo "$SNAP"; cat "$SNAP/a.txt"; [ -e "$SNAP/leftover.txt" ] && echo LEFT || echo CLEAN; touch "$SNAP/leftover.txt"
          cleanup_snapshot`;
        return execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8', env }).split('\n');
      };
      const first = run('one\n');
      const second = run('two\n');
      expect(first[0]).toBe(second[0]); // same directory: reused, not re-cloned
      expect(first[1]).toBe('one');
      expect(second[1]).toBe('two');
      expect(second[2]).toBe('CLEAN'); // run one's untracked leftover was cleaned before run two
      expect(fs.existsSync(`${second[0]}.lock`)).toBe(false); // released
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
