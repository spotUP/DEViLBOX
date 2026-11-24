/**
 * Owner 2026-11-24: a sample with a loop plays silent from the keyboard.
 * A looped Sampler instrument is built as a Tone.Player, but the Sampler registry
 * hook called Sampler.triggerAttack on it (no such method), swallowed the throw and
 * reported the note handled, so player.start never ran. The hook now hands a Player
 * back to ToneEngine's Player branch, and release stops it.
 */
import { describe, it, expect, vi } from 'vitest';
import * as Tone from 'tone';
import '../builtin/sampler';
import { SynthRegistry } from '../SynthRegistry';
import type { InstrumentConfig } from '@/types/instrument';

describe('Sampler registry hook with a looped Player', () => {
  const desc = SynthRegistry.get('Sampler')!;
  const config = { synthType: 'Sampler', metadata: {} } as unknown as InstrumentConfig;

  it('does not claim the attack, so ToneEngine starts the Player', () => {
    const player = Object.create(Tone.Player.prototype) as Tone.Player;
    const handled = desc.onTriggerAttack!(player, 'C4', 0, 1, { config } as never);
    expect(handled).toBe(false);
  });

  it('release stops a started Player', () => {
    const stop = vi.fn();
    const player = Object.assign(Object.create(Tone.Player.prototype), { stop });
    Object.defineProperty(player, 'state', { value: 'started' });
    expect(desc.onTriggerRelease!(player, 'C4', 0, { config } as never)).toBe(true);
    expect(stop).toHaveBeenCalledWith(0);
  });
});
