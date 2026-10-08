import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

describe('incoming song load reset contracts', () => {
  // The branch bodies moved to songBranches.ts (bdee75e5c); the per-open
  // stop of the outgoing song is songLifecycle.unloadSong (e1b1b2e13), so the
  // helper only remains for the SunVox pre-read, with its position reset.
  it('hard-stops active playback before import and file loads mutate stores', () => {
    const source = read('lib/song/songBranches.ts');
    expect(source).toContain('async function stopActivePlaybackForIncomingSong(');
    expect(source).toContain('transport.stop();');
    expect(source).toContain("const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');");
    expect(source).toContain('getTrackerReplayer().stop();');
    expect(source).toContain("const { getAdPlugPlayer } = await import('@/lib/import/AdPlugPlayer');");
    expect(source).toContain('getAdPlugPlayer().stop();');
    expect(source).toContain("await stopActivePlaybackForIncomingSong(engine, { resetPosition: true });");
  });
});
