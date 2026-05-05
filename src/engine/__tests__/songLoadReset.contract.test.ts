import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

describe('incoming song load reset contracts', () => {
  it('hard-stops active playback before import and file loads mutate stores', () => {
    const source = read('lib/file/UnifiedFileLoader.ts');
    expect(source).toContain('async function stopActivePlaybackForIncomingSong(');
    expect(source).toContain('transport.stop();');
    expect(source).toContain("const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');");
    expect(source).toContain('getTrackerReplayer().stop();');
    expect(source).toContain("const { getAdPlugPlayer } = await import('@/lib/import/AdPlugPlayer');");
    expect(source).toContain('getAdPlugPlayer().stop();');
    expect(source).toContain('await stopActivePlaybackForIncomingSong(engine);');
    expect(source).toContain("await stopActivePlaybackForIncomingSong(engine, { resetPosition: true });");
  });
});
