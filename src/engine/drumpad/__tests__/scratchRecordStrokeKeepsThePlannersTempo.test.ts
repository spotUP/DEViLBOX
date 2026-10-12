/**
 * SCR-PHRASING-PARITY (the A/B pair): the executor places a record stroke on the deck's analysis tempo
 * (`deckTempoBpm`, D9), but the voice timed the stroke itself on the store's `effectiveBPM` - the value
 * the UI loaders write from the detector. When the two disagree (a half-time detection) every planned
 * 2-step baby played 4 steps long and the routine's rhythm smeared. A planned stroke is now timed on the
 * clock that placed it; a pad (no planner) keeps the deck's tempo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pool = vi.hoisted(() => ({ bpms: [] as number[] }));

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
  const perform = (_g: unknown, o: { bpm: number }) => { pool.bpms.push(o.bpm); return { release() {} }; };
  const instance = { perform, releaseAll() {}, panic() {}, resolveRecord: () => null };
  return { getScratchVoicePool: () => instance, getScratchVoicePoolIfActive: () => instance };
});

import { fireDjFx, releaseDjFx } from '@/engine/drumpad/DjFxActions';
import { useDJStore } from '@/stores/useDJStore';
import { ScratchExecutor } from '@/engine/dj/scratch/ScratchExecutor';
import type { ScratchEvent } from '@/engine/dj/scratch/scratchTypes';

/** The detector wrote half the track's tempo into the store. */
const DETECTED = 65;
const PLANNED = 130;

function setDetectedTempo(): void {
  const s = useDJStore.getState();
  useDJStore.setState({ decks: { ...s.decks, A: { ...s.decks.A, effectiveBPM: DETECTED } } });
}

describe('a planned record stroke is timed on the tempo that placed it', () => {
  beforeEach(() => { pool.bpms.length = 0; setDetectedTempo(); });

  it('the executor at 130 BPM hands the voice 130 while the store says 65; a pad keeps the deck tempo', () => {
    let sec = 0;
    const intervals: Array<() => void> = [];
    const ex = new ScratchExecutor({
      clock: { beatNow: () => sec / (60 / PLANNED), beatSec: () => 60 / PLANNED },
      contextTime: () => sec,
      fire: (id, o) => fireDjFx(id, o),
      release: (id, o) => releaseDjFx(id, o),
      probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => undefined },
      recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
      timers: {
        now: () => sec * 1000,
        setInterval: (fn: () => void) => { intervals.push(fn); return fn; },
        clearInterval: () => undefined, setTimeout: () => null, clearTimeout: () => undefined,
      },
      tickMs: 5, lookaheadSec: 0.1,
    });
    const source = { type: 'CRATE', recordId: 'AH_STANDARD', anchor: { position: 0.15, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 1] } } as const;
    const ev: ScratchEvent = {
      executeAtBeat: 4, durationBeats: 0.5, role: 'ACCENT', source, anchor: source.anchor, deck: 'A',
      gesture: 'baby', velocity: 0.8, humanizeMs: 0, intensity: 0.5, returnToAnchor: true,
    };
    ex.schedule(ev);
    while (sec < 2.5) { sec += 0.005; for (const fn of [...intervals]) fn(); }
    expect(pool.bpms).toEqual([PLANNED]);

    // a pad has no planner: the stroke follows the deck
    fireDjFx('fx_scratch_baby', { source: 'pad', record: 'AH_STANDARD', deck: 'A' });
    expect(pool.bpms).toEqual([PLANNED, DETECTED]);
  });
});
