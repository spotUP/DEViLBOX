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

const root = path.resolve(__dirname, '../..');

function affected(...files: string[]): string[] {
  return execFileSync('node', ['scripts/git-hooks/affected-tests.mjs', '--files', ...files], {
    cwd: root,
    encoding: 'utf8',
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
