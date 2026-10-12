/** Priority order (owner scratch plan section 28; ledger SCR-P7.10): timing and sync before a scratch trick. */
import { describe, it, expect } from 'vitest';
import { resolveConflicts, PRIORITY_ORDER, checkScratch, checkStuck, scratchSafetyStats, type SafetyState } from '../ScratchSafety';
import { getScratchRecord } from '../scratchCatalogue';
import type { ScratchEvent } from '../scratchTypes';
import { recueDeck, type DeckRecueTarget } from '../deckRecue';

describe('section 28 priority order (SCR-P7.10)', () => {
  it('the order is timing > deck sync > transition > bass > vocal > juggling > scratch > FX > humanization', () => {
    expect(PRIORITY_ORDER).toEqual(['timing', 'deckSync', 'transition', 'bassOwnership', 'vocalClarity', 'beatJuggling', 'scratchFeature', 'secondaryFx', 'humanization']);
  });

  it('a scratch at the transition start beat moves after the start; the start keeps its beat', () => {
    const r = resolveConflicts([
      { kind: 'scratchFeature', startBeat: 64, endBeat: 65, deck: 'A', id: 's' },
      { kind: 'transition', startBeat: 64, endBeat: 64.25 },
    ]);
    expect(r.accepted.find((x) => x.kind === 'transition')!.startBeat).toBe(64);
    const s = r.accepted.find((x) => x.id === 's')!;
    expect(s.startBeat).toBe(64.25);
    expect(r.moved).toHaveLength(1);
  });

  it('a scratch that cannot move inside its window is refused; one on another deck than a sync bend is untouched', () => {
    const r = resolveConflicts([
      { kind: 'deckSync', startBeat: 10, endBeat: 14, deck: 'A' },
      { kind: 'scratchFeature', startBeat: 11, endBeat: 12, deck: 'A', latestStartBeat: 12, id: 'late' },
      { kind: 'scratchFeature', startBeat: 11, endBeat: 12, deck: 'B', id: 'other' },
    ]);
    expect(r.refused.map((x) => x.request.id)).toEqual(['late']);
    expect(r.accepted.find((x) => x.id === 'other')!.startBeat).toBe(11);
  });

  it('a bend in progress blocks a deck re-cue (deck sync first)', () => {
    let seeks = 0;
    const target: DeckRecueTarget = {
      playbackMode: 'audio', isFaderWindowClosed: () => true, seekAudio: () => { seeks++; }, cueTracker: () => true, resetRing: () => {},
      isBending: () => true,
    };
    const res = recueDeck(target, 12);
    expect(res.mode).toBe('waiting');
    expect(res.reason).toMatch(/phase correction/);
    expect(seeks).toBe(0);
    expect(recueDeck({ ...target, isBending: () => false }, 12).recued).toBe(true);
  });
});

describe('the governor (SCR-P8.1, section 59): one case per rule, each named', () => {
  const ah = getScratchRecord('AH_STANDARD')!;
  const crate = (over: Partial<ScratchEvent> = {}): ScratchEvent => ({
    executeAtBeat: 16, durationBeats: 1, role: 'ACCENT', source: { type: 'CRATE', recordId: ah.id, anchor: ah.anchor }, anchor: ah.anchor,
    gesture: 'baby', velocity: 0.7, humanizeMs: 0, intensity: 0.4, returnToAnchor: true, ...over,
  });
  const deckEv = (over: Partial<ScratchEvent> = {}): ScratchEvent => {
    const anchor = { position: 10, safe: [9.5, 11] as const };
    return { ...crate(), source: { type: 'DECK', deck: 'A', anchor }, anchor, deck: 'A', ...over };
  };
  const state = (over: Partial<SafetyState> = {}): SafetyState => ({ decksPlaying: { A: true, B: false }, vocalAt: () => 0, bassAt: () => 0, ...over });
  const rule = (e: ScratchEvent, s: SafetyState) => { const v = checkScratch(e, s); return v.ok ? 'ok' : v.rule; };

  it('every rule refuses its case and passes a sound one', () => {
    const before = scratchSafetyStats.check;
    expect(rule(crate(), state())).toBe('ok');
    expect(rule(crate(), state({ decksPlaying: { A: false, B: false } }))).toBe('bothDecksSilent');
    expect(rule(deckEv({ deck: 'B', source: { type: 'DECK', deck: 'B', anchor: { position: 10, safe: [9.5, 11] } } }), state())).toBe('invalidDeck');
    expect(rule(crate({ source: { type: 'CRATE', recordId: 'NOPE', anchor: ah.anchor } }), state())).toBe('invalidSource');
    expect(rule(crate({ source: { type: 'CRATE', recordId: 'SCRATCH_005', anchor: ah.anchor } }), state())).toBe('invalidSource');
    expect(rule(crate({ anchor: { ...ah.anchor, position: ah.safe[1] + 0.5 } }), state())).toBe('unsafeRange');
    expect(rule(deckEv(), state({ deckBusyUntil: { A: 17 } }))).toBe('conflict');
    // excessive rate: every catalogue gesture at the fastest hand stays inside the ring's 4x (the rule guards new gestures)
    for (const g of ['tweak', 'scribble', 'uzi', 'crab', 'transformer8'] as const) expect(rule(crate({ gesture: g, velocity: 1 }), state()), g).not.toBe('excessiveRate');
    // excessive cuts: checkCutRate refuses 20 per beat (scratchStateMachine.test.ts); none in the catalogue
    expect(rule(crate(), state({ vocalAt: () => 0.9 }))).toBe('vocalCollision');
    expect(rule(crate({ role: 'ANSWER' }), state({ vocalAt: () => 0.9 }))).toBe('ok');
    expect(rule(crate(), state({ bassSource: true, bassAt: () => 0.8 }))).toBe('bassCollision');
    const stuck = checkStuck(true, 30, 20);
    expect(stuck.ok ? 'ok' : stuck.rule).toBe('stuck');
    expect(checkStuck(true, 27, 20).ok).toBe(true);
    expect(scratchSafetyStats.check - before).toBeGreaterThanOrEqual(10);
  });

});
