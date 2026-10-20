/**
 * 2026-10-20: every vitest worker that loaded real worklets left a
 * devilbox-worklets-* copy in TMPDIR (531 of them): the `exit` handler meant to
 * remove it never runs in a vitest worker. resolveWorkletsFromPublic now sweeps
 * the copies of exited processes before making its own.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWorkletsFromPublic } from '../realWebAudio';

const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid as number;

describe('worklet copies do not pile up in TMPDIR', () => {
  const savedTmp = process.env.TMPDIR;
  let scratch = '';
  afterEach(() => {
    process.env.TMPDIR = savedTmp;
    rmSync(scratch, { recursive: true, force: true });
  });

  it("removes exited processes' copies and keeps a live process's one", () => {
    scratch = mkdtempSync(join(tmpdir(), 'workletpile-'));
    const make = (name: string, owner?: number) => {
      const d = join(scratch, name);
      mkdirSync(d);
      if (owner !== undefined) writeFileSync(join(d, '.owner'), String(owner));
      return d;
    };
    const dead = make('devilbox-worklets-dead', deadPid());
    const live = make('devilbox-worklets-live', process.ppid);
    const oldOwnerless = make('devilbox-worklets-old');
    const freshOwnerless = make('devilbox-worklets-fresh');
    const hoursAgo = new Date(Date.now() - 2 * 3600_000);
    utimesSync(oldOwnerless, hoursAgo, hoursAgo);
    const other = make('something-else');

    process.env.TMPDIR = scratch;
    resolveWorkletsFromPublic();

    expect(existsSync(dead)).toBe(false);
    expect(existsSync(oldOwnerless)).toBe(false);
    expect(existsSync(live)).toBe(true);
    expect(existsSync(freshOwnerless)).toBe(true);
    expect(existsSync(other)).toBe(true);
  });
});
