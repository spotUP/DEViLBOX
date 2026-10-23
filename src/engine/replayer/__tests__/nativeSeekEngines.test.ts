/**
 * I180d: the engine-level seeks a t= link ends in: nuade frame = ms at the output rate, websid/websidplay in ms.
 */
import { describe, it, expect, vi } from 'vitest';
import { NuadeEngine } from '@/engine/nuade/NuadeEngine';
import { ScriptNodePlayerEngine } from '@/engine/deepsid/engines/ScriptNodePlayerEngine';

describe('NuadeEngine.seekToMs', () => {
  it('posts one seek to frame 1440000 for 30000 ms at 48 kHz', () => {
    const e = Object.create(NuadeEngine.prototype) as Record<string, unknown>;
    e.audioContext = { sampleRate: 48000 };
    const post = vi.fn();
    e.post = post;
    (e as unknown as NuadeEngine).seekToMs(30000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'seek', frame: 1_440_000 });
  });
});

describe('ScriptNodePlayerEngine.seek', () => {
  const make = (engineType: string, withPlayer = true) => {
    const e = Object.create(ScriptNodePlayerEngine.prototype) as Record<string, unknown>;
    const player = { seekPlaybackPosition: vi.fn() };
    e.engineType = engineType;
    e.player = withPlayer ? player : null;
    return { engine: e as unknown as ScriptNodePlayerEngine, player };
  };

  it.each(['websid', 'websidplay'])('%s: 30 s seeks to 30000 ms once', (type) => {
    const { engine, player } = make(type);
    expect(engine.seek(30)).toBe(true);
    expect(player.seekPlaybackPosition).toHaveBeenCalledTimes(1);
    expect(player.seekPlaybackPosition).toHaveBeenCalledWith(30000);
  });

  it('tinyrsid has no seek export: false, no call', () => {
    const { engine, player } = make('tinyrsid');
    expect(engine.seek(30)).toBe(false);
    expect(player.seekPlaybackPosition).not.toHaveBeenCalled();
  });

  it('before the player exists: false', () => {
    expect(make('websid', false).engine.seek(30)).toBe(false);
  });
});
