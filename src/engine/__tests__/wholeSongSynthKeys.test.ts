/**
 * A key on a whole-song player's instrument never starts or stops the song
 * (owner list K3: Klystrack, MaxTrax, PreTracker, Symphonie and UADE called
 * engine.play() on key-down and engine.stop() on key-up). The key says why it
 * is silent, once per player.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls, engine, told } = vi.hoisted(() => {
  const calls: string[] = [];
  const told: string[] = [];
  const engine = () => new Proxy({ output: { connect() {} }, getNode: () => null } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(k + (a.length ? '(' + a.length + ')' : '')); return Promise.resolve(); }),
  });
  return { calls, engine, told };
});
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }) }),
}));
vi.mock('@/engine/klystrack/KlysEngine', () => ({ KlysEngine: { getInstance: engine } }));
vi.mock('@/engine/maxtrax/MaxTraxEngine', () => ({ MaxTraxEngine: { getInstance: engine } }));
vi.mock('@/engine/pretracker/PreTrackerEngine', () => ({ PreTrackerEngine: { getInstance: engine } }));
vi.mock('@/engine/symphonie/SymphonieEngine', () => ({ SymphonieEngine: { getInstance: engine } }));
vi.mock('@/engine/uade/UADEEngine', () => ({ UADEEngine: { getInstance: engine } }));
vi.mock('@stores/useNotificationStore', () => ({ notify: { info: (m: string) => told.push(m) } }));

import { KlysSynth } from '@/engine/klystrack/KlysSynth';
import { MaxTraxSynth } from '@/engine/maxtrax/MaxTraxSynth';
import { PreTrackerSynth } from '@/engine/pretracker/PreTrackerSynth';
import { SymphonieSynth } from '@/engine/symphonie/SymphonieSynth';
import { UADESynth } from '@/engine/uade/UADESynth';
import { resetWholeSongKeyNotices } from '@/engine/wholeSongKeyboard';

const players: Array<[string, () => { triggerAttack(n?: string | number): void; triggerRelease(n?: string | number): void }]> = [
  ['KlysSynth', () => new KlysSynth(1)],
  ['MaxTraxSynth', () => new MaxTraxSynth()],
  ['PreTrackerSynth', () => new PreTrackerSynth()],
  ['SymphonieSynth', () => new SymphonieSynth()],
  ['UADESynth', () => new UADESynth()],
];

describe('keys on whole-song players', () => {
  beforeEach(() => { calls.length = 0; told.length = 0; resetWholeSongKeyNotices(); });
  it.each(players)('%s: a key neither starts nor stops the song and says why once', (_n, make) => {
    const s = make();
    calls.length = 0;
    s.triggerAttack('C4'); s.triggerRelease('C4'); s.triggerAttack('E4'); s.triggerRelease('E4');
    expect(calls.filter((c) => /^(play|stop|pause|resume)/.test(c)), 'engine transport calls').toEqual([]);
    expect(told).toHaveLength(1);
  });
});
