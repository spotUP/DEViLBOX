/**
 * A deck stab returns to its anchor (owner scratch plan section 18; ledger
 * SCR-P3.4): with the fader window closed `DeckEngine.recueScratch` seeks the
 * player to the anchor every time (4 stabs: 4 seeks, one argument) and resets
 * the ring; on a deck the listener hears (window open) nothing is touched,
 * neither the deck nor its ring (SA-M3), and the caller waits for the next
 * closed window. Tracker mode cues the replayer by row and leaves
 * `suppressNotes` alone.
 */
import { describe, it, expect, vi } from 'vitest';
import { DeckEngine } from '../DeckEngine';
import { recueDeck, deckRecueStats, type DeckRecueTarget } from '../scratch/deckRecue';

interface Fake {
  seeks: number[];
  cues: Array<[number, number]>;
  ringResets: number;
  ringRearms: number;
  faderGain: number;
  suppressNotes: boolean;
}

function engine(mode: 'audio' | 'tracker', fake: Fake): DeckEngine {
  const e = Object.create(DeckEngine.prototype) as Record<string, unknown>;
  e._playbackMode = mode;
  e._stemMode = false;
  e._bendTimer = null; // a field initialised in the class body: always null on a real deck
  e._bendHeld = false;
  e.audioPlayer = { seek: (s: number) => { fake.seeks.push(s); } };
  e.stemPlayer = { seek: vi.fn() };
  e.scratchPlayback = { get currentFaderGain() { return fake.faderGain; } };
  e.scratchBuffer = { resetCapture: () => { fake.ringResets++; }, startScratch: () => { fake.ringRearms++; } };
  e.replayer = { jumpToPosition: (a: number, b: number) => { fake.cues.push([a, b]); }, get isSuppressNotes() { return fake.suppressNotes; } };
  // a 2 s pattern at 0.5 s per row-block: songPos = floor(sec / 2), pattPos = row of 0.125 s
  e.getPositionAtTime = (ms: number) => ({ songPos: Math.floor(ms / 2000), pattPos: Math.floor((ms % 2000) / 125) });
  return e as unknown as DeckEngine;
}

const fresh = (faderGain: number, suppressNotes = false): Fake => ({ seeks: [], cues: [], ringResets: 0, ringRearms: 0, faderGain, suppressNotes });

describe('a deck stab re-cues to its anchor (SCR-P3.4)', () => {
  it('four stabs with the window closed: seek x4 with the same argument, ring reset x4', () => {
    const fake = fresh(0);
    const deck = engine('audio', fake);
    for (let i = 0; i < 4; i++) {
      const r = deck.recueScratch(32.5);
      expect(r).toMatchObject({ recued: true, mode: 'audio', returnsToAnchor: true });
    }
    expect(fake.seeks).toEqual([32.5, 32.5, 32.5, 32.5]);
    expect(fake.ringResets).toBe(4);
    expect(fake.ringRearms).toBe(0);
  });

  it('on a deck the listener hears (window open) neither the player nor its ring is touched; the caller waits', () => {
    const fake = fresh(1);
    const r = engine('audio', fake).recueScratch(32.5);
    expect(fake.seeks).toHaveLength(0);
    expect(fake.ringResets).toBe(0);
    expect(fake.ringRearms).toBe(0);
    expect(r).toMatchObject({ recued: false, mode: 'waiting', returnsToAnchor: false });
    expect(r.reason).toMatch(/window is open/);
  });

  it('tracker mode cues the replayer to the row of the anchor and leaves suppressNotes as it was (both ways)', () => {
    for (const sup of [true, false]) {
      const fake = fresh(0, sup);
      const r = engine('tracker', fake).recueScratch(5.25); // 5250 ms: song position 2, row 10
      expect(r).toMatchObject({ recued: true, mode: 'tracker' });
      expect(fake.cues).toEqual([[2, 10]]);
      expect(fake.suppressNotes).toBe(sup);
    }
  });

  it('a tracker song without a time index cannot be cued: reported, nothing touched', () => {
    const resetRing = vi.fn();
    const target: DeckRecueTarget = {
      playbackMode: 'tracker', isFaderWindowClosed: () => true, seekAudio: () => {}, cueTracker: () => false, resetRing,
    };
    const r = recueDeck(target, 1);
    expect(r).toMatchObject({ recued: false, mode: 'unavailable', returnsToAnchor: false });
    expect(resetRing).not.toHaveBeenCalled();
    expect(deckRecueStats.unavailable).toBeGreaterThan(0);
  });
});
