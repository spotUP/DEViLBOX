/** Priority order (owner scratch plan section 28; ledger SCR-P7.10): timing and sync before a scratch trick. */
import { describe, it, expect } from 'vitest';
import { resolveConflicts, PRIORITY_ORDER } from '../ScratchSafety';
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
