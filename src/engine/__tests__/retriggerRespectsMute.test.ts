/**
 * Contract test: every path in TrackerReplayer that fires a synth note for a
 * tracker channel asks the replayer's own mute check first.
 *
 * Regression: the E9x/Rxy retrigger and EDx note-delay callbacks wired into the
 * SynthEffectProcessor called ToneEngine.triggerNote directly. Only the row
 * trigger consulted the mute state, so a muted channel kept firing retriggered
 * and delayed notes ("why cant i unmute?" / "the 808 dont fire" while soloed).
 *
 * Guard: statically inspect the three note-firing sites and the single shared
 * `isChannelMuted` method they must go through.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(resolve(ROOT, 'engine/TrackerReplayer.ts'), 'utf8');

function callbackBody(name: string): string {
  const m = src.match(new RegExp(`${name}: \\((?:[^)]*)\\) => \\{([\\s\\S]*?)\\n {14}\\},`));
  expect(m, `${name} callback should exist`).not.toBeNull();
  return m![1];
}

describe('TrackerReplayer mute contract', () => {
  it('owns one mute check that covers DJ decks and the tracker view', () => {
    const m = src.match(/\n {2}isChannelMuted\(channelIndex: number\): boolean \{([\s\S]*?)\n {2}\}/);
    expect(m, 'isChannelMuted method should exist').not.toBeNull();
    expect(m![1]).toContain('channelMuteMask');
    expect(m![1]).toContain('getToneEngine().isChannelMuted(channelIndex)');
  });

  it('the E9x/Rxy retrigger callback checks the mute state before firing', () => {
    const body = callbackBody('retriggerNote');
    expect(body).toContain('replayer.isChannelMuted(channelIndex)');
    expect(body.indexOf('isChannelMuted')).toBeLessThan(body.indexOf('triggerNote('));
  });

  it('the EDx note-delay callback checks the mute state before firing', () => {
    const body = callbackBody('triggerDelayedNote');
    expect(body).toContain('replayer.isChannelMuted(channelIndex)');
    expect(body.indexOf('isChannelMuted')).toBeLessThan(body.indexOf('triggerNote('));
  });

  it('the row trigger goes through the same shared check', () => {
    expect(src).toContain('if (channelIndex !== undefined && this.isChannelMuted(channelIndex)) return;');
  });
});
