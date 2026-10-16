/**
 * The pre-commit gate runs the tests that read a changed source file's text.
 *
 * Source-text tests (readFileSync of `foo.ts`, then string checks) import
 * nothing and often live far from `foo.ts`, so neither sibling proximity nor
 * the module graph finds them. bc140123d refactored DJTrackLoader.ts, its
 * commit ran no test that reads it, and djViewRegressions.test.ts failed only
 * at pre-push, after the full suite.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const root = path.resolve(__dirname, '../..');

// A hook run exports GIT_INDEX_FILE / GIT_DIR for the outer repo; the code under test must not see them.
function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
}

function affected(...files: string[]): string[] {
  return affectedWith([], ...files);
}

function affectedWith(flags: string[], ...files: string[]): string[] {
  return execFileSync('node', ['scripts/git-hooks/affected-tests.mjs', ...flags, '--files', ...files], {
    cwd: root,
    encoding: 'utf8',
    env: cleanEnv(),
  }).split('\n').filter(Boolean);
}

describe('pre-commit affected-test selection', () => {
  it('a change to DJTrackLoader.ts runs the test that reads its source', () => {
    expect(affected('src/engine/dj/DJTrackLoader.ts'))
      .toContain('src/engine/dj/__tests__/djViewRegressions.test.ts');
  });

  it('a change to DeckPatternDisplay.tsx runs the test that imports it from elsewhere by module path', () => {
    // 70a57efa2 changed it; renderedDeckPatternViewMetersEachChannel (import '../DeckPatternDisplay') failed only in CI.
    expect(affected('src/components/dj/DeckPatternDisplay.tsx'))
      .toContain('src/components/dj/__tests__/renderedDeckPatternViewMetersEachChannel.test.tsx');
  });

  it('a changed test file still runs itself', () => {
    const self = 'src/__tests__/preCommitRunsSourceTextTests.test.ts';
    expect(affected(self)).toContain(self);
  });

  it('a change to a server file runs the src/ test that reads it', () => {
    expect(affected('server/src/mcp/mcpServer.ts'))
      .toContain('src/lib/import/__tests__/companionResolver.reachability.test.ts');
  });

  it('a file outside src/ and server/src/ selects nothing', () => {
    expect(affected('scripts/build.ts')).toEqual([]);
  });
});

describe('pre-commit gate stays fast and isolated', () => {
  it('a shared module is deferred to pre-push: with a cap its importers are not selected, without one they are', () => {
    // useDJStore is imported by ~87 suites; selecting them all made one commit take ~15 minutes.
    const uncapped = affected('src/stores/useDJStore.ts');
    const capped = affectedWith(['--max-importers', '8'], 'src/stores/useDJStore.ts');
    expect(uncapped.length).toBeGreaterThan(40);
    expect(capped.length).toBeLessThan(10);
  });

  it('the cap keeps a module with few importers fully selected (the DeckPatternDisplay miss stays caught)', () => {
    expect(affectedWith(['--max-importers', '8'], 'src/components/dj/DeckPatternDisplay.tsx'))
      .toContain('src/components/dj/__tests__/renderedDeckPatternViewMetersEachChannel.test.tsx');
  });

  it('the pre-commit hook passes the cap, the pre-push hook does not', () => {
    const preCommit = fs.readFileSync(path.join(root, 'scripts/git-hooks/pre-commit'), 'utf8');
    const prePush = fs.readFileSync(path.join(root, 'scripts/git-hooks/pre-push'), 'utf8');
    expect(preCommit).toContain('--max-importers');
    expect(prePush).not.toContain('--max-importers');
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
    const env = cleanEnv();
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env }).trim();
    try {
      git('init', '-q');
      git('config', 'user.email', 't@t');
      git('config', 'user.name', 't');
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
