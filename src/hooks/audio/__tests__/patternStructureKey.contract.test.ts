/**
 * Contract test: patternStructureKey must NOT include channel count.
 *
 * Bug: adding a channel during playback caused music to stutter because
 * patternStructureKey included pattern.channels.length. Any change to
 * channel count triggered a full loadSong() + play() restart cycle,
 * even though TrackerReplayer.updatePatterns() already handles growing
 * the channel array seamlessly.
 *
 * Fix: channel count removed from patternStructureKey. Channel growth
 * is handled by the hot-swap updatePatterns() path (no reload needed).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('patternStructureKey (channel add stutter fix)', () => {
  const src = read('src/hooks/audio/usePatternPlayback.ts');

  it('does not include channel count in patternStructureKey', () => {
    // Extract the patternStructureKey computation
    const keyMatch = src.match(/const patternStructureKey[\s\S]*?return `([^`]+)`/);
    expect(keyMatch).not.toBeNull();
    const template = keyMatch![1];

    // The template must NOT reference channels.length
    expect(template).not.toContain('channels.length');
  });

  it('still includes pattern count, row length, and format', () => {
    const keyMatch = src.match(/const patternStructureKey[\s\S]*?return `([^`]+)`/);
    const template = keyMatch![1];

    // These structural keys must remain — they indicate real format changes
    expect(template).toContain('patterns.length');
    expect(template).toContain('pattern.length');
    expect(template).toContain('sourceFormat');
  });
});
