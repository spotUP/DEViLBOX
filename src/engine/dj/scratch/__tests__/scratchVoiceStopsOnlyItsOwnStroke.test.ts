/**
 * Audit SA-m7: a record performance whose stop is scheduled ahead (`release(at)`) could not be
 * stopped now any more - the voice reported itself free at scheduling time, so a later immediate
 * release (the executor's cancel, Scratch Stop) was ignored and the voice played on. An immediate
 * release now stops the performance's own stroke, and never a later performance that has taken
 * the voice since.
 */
import { describe, it, expect } from 'vitest';
import { ScratchVoicePool } from '../scratchVoicePool';
import { getGesture } from '../scratchGestureCatalog';

function fakePool() {
  const voice = {
    record: { id: 'ONE' }, busy: false, generation: 0, stops: [] as Array<number | undefined>,
    playGesture() { this.generation++; this.busy = true; return { ok: true }; },
    release(at?: number) { this.stops.push(at); this.busy = false; },
  };
  const pool = Object.create(ScratchVoicePool.prototype) as Record<string, unknown>;
  pool.ready = Promise.resolve();
  pool.acquire = () => voice;
  pool.resolveRecord = () => ({ id: 'ONE' });
  pool.track = () => {};
  pool.anchor = null;
  return { pool: pool as unknown as ScratchVoicePool, voice };
}

const opts = { bpm: 120 };

describe('a record performance stops only its own stroke (SA-m7)', () => {
  it('a stroke whose stop is scheduled ahead is stopped now by an immediate release', async () => {
    const { pool, voice } = fakePool();
    const h = pool.perform(getGesture('chirp'), opts)!;
    await h.started;
    h.release(4.5);
    expect(voice.busy).toBe(false);
    h.release();
    expect(voice.stops).toEqual([4.5, undefined]);
  });

  it('an old handle never stops a later performance on the same voice', async () => {
    const { pool, voice } = fakePool();
    const old = pool.perform(getGesture('chirp'), opts)!;
    await old.started;
    old.release(4.5);
    const next = pool.perform(getGesture('chirp'), opts)!;
    await next.started;
    old.release();
    expect(voice.stops).toEqual([4.5]);
    expect(voice.busy).toBe(true);
  });
});
