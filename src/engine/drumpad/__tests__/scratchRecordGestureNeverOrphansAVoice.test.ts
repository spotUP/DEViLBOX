/**
 * Owner report 2026-10-12: firing the record-voice chirp from the console
 * gave a "fwifwifwi" loop that never ended. A second fire of a held record
 * gesture replaced its handle without releasing the first voice, which then
 * looped with nothing left to stop it; Scratch Stop only stopped the deck
 * pattern, never the record voice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pool = vi.hoisted(() => ({
  handles: [] as Array<{ released: number; release: () => void }>,
}));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0, sampleRate: 48000 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => ({ id: 'A', playPattern() {}, stopPattern() {}, finishPatternCycle() {} }), mixer: { samplerInput: null } }),
  getDJEngineIfActive: () => null,
}));
vi.mock('@/engine/dj/scratch/scratchVoicePool', () => {
  const perform = () => {
    const h = { released: 0, release() { h.released++; } };
    pool.handles.push(h);
    return h;
  };
  const instance = { perform, releaseAll() {}, panic() {}, resolveRecord: () => null };
  return { getScratchVoicePool: () => instance, getScratchVoicePoolIfActive: () => instance };
});

import { fireDjFx, releaseDjFx } from '@/engine/drumpad/DjFxActions';

describe('a held record-voice gesture never leaves an unstoppable voice', () => {
  beforeEach(() => { pool.handles.length = 0; });

  it('a second fire of the chirp releases the voice it replaces, and one release stops the new one', () => {
    fireDjFx('fx_scratch_chirp', { source: 'mcp', record: 'AH_STANDARD' });
    fireDjFx('fx_scratch_chirp', { source: 'mcp', record: 'AH_STANDARD' });
    expect(pool.handles).toHaveLength(2);
    expect(pool.handles[0].released).toBe(1);
    releaseDjFx('fx_scratch_chirp', { source: 'mcp' });
    expect(pool.handles[1].released).toBe(1);
  });

  it('Scratch Stop releases a chirp held on the record voice', () => {
    fireDjFx('fx_scratch_chirp', { source: 'mcp', record: 'AH_STANDARD' });
    fireDjFx('fx_scratch_stop', { source: 'mcp' });
    expect(pool.handles).toHaveLength(1);
    expect(pool.handles[0].released).toBe(1);
  });
});
