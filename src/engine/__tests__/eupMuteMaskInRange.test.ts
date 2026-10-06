/**
 * Muting a Euphony song flooded the console with
 * "EUP_TownsEmulator::enable: channel number 16..31 out of range": the mixer's
 * mute mask carries 32 bits, the worklet forwards every bit, and the harness
 * passed indices 0..31 to a Towns device that has 16 channels. The harness now
 * bounds the index by the device's own channel count.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startWorklet } from './workletHarness';

const SONG = join(ROOT, 'public/data/songs/euphony/Schumann - Traumerei/Traumerei.eup');

describe('Euphony mute mask', { timeout: 60000 }, () => {
  it('a full 32-bit mute mask reaches the player without out-of-range channel errors', async () => {
    const b = readFileSync(SONG);
    const moduleData = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    // Emscripten binds its stderr printer when the module is created, so the
    // capture has to be in place before the worklet starts.
    const lines: string[] = [];
    const grab = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
    const spies = [vi.spyOn(console, 'error').mockImplementation(grab), vi.spyOn(console, 'warn').mockImplementation(grab), vi.spyOn(console, 'log').mockImplementation(grab)];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => { lines.push(String(chunk)); return true; });
    try {
      const { send } = await startWorklet('eupmini', 'Eupmini');
      await send({ type: 'loadModule', moduleData });
      await send({ type: 'setMuteMask', mask: 0 });
      await send({ type: 'setMuteMask', mask: 0xffffffff });
    } finally {
      spies.forEach((s) => s.mockRestore());
      writeSpy.mockRestore();
    }
    expect(lines.filter((l) => l.includes('out of range'))).toEqual([]);
  });
});
