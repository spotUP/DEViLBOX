import { describe, it, expect } from 'vitest';
import { buildBassState, bassOpportunity, phraseImportanceAt, BASS_EMPHASIS_COOLDOWN_BARS } from '../bassState';
import { buildDubTargetProfile } from '../dubTargetProfile';
import type { MusicalChannelProfile } from '../musicalChannelProfile';
import type { MusicalPosition } from '../musicalClock';
import type { JournalEntry } from '../performanceJournal';

/**
 * "Is this a bass-feature moment?"
 *
 * The plan's governing rule, and the reason this module exists:
 *
 *   Never boost bass merely because the bass is currently quiet.
 *
 * Quiet bass can be intentional. The trigger is STRUCTURAL — a drop, a phrase
 * boundary, a stripped-back arrangement — not a spectrum reading. A version of
 * this that fires often is broken even when each individual decision looks
 * defensible, so the NO cases are asserted hardest.
 */

const ROWS_PER_BAR = 16;

function positionAt(barInPhrase: number, positionInBar = 0): MusicalPosition {
  const phraseBars = 16;
  return {
    bar: barInPhrase,
    beat: 0,
    barInPhrase,
    phrase: 0,
    positionInBeat: 0,
    positionInBar,
    positionInPhrase: (barInPhrase + positionInBar) / phraseBars,
    rowsPerBeat: 4,
    rowsPerBar: ROWS_PER_BAR,
    rowsPerPhrase: ROWS_PER_BAR * phraseBars,
    nextBeatRow: 0,
    nextBarRow: 0,
    nextPhraseRow: 0,
  };
}

function chan(over: Partial<MusicalChannelProfile>, conf = 0.9): MusicalChannelProfile {
  const axis = <T,>(value: T) => ({ value, confidence: conf, source: 'notes' as const });
  return {
    channel: 0,
    instrumentFamily: axis('keys'),
    musicalFunction: axis('harmony'),
    rhythmicRole: axis('offbeat'),
    register: axis('mid'),
    importance: 0.5, density: 0.3, audibility: 0.8, repetition: 0.7,
    ...over,
  } as MusicalChannelProfile;
}

const bassChan = (channel: number) => chan({
  channel,
  instrumentFamily: { value: 'bass', confidence: 0.9, source: 'notes' },
  musicalFunction: { value: 'foundation', confidence: 0.9, source: 'notes' },
  register: { value: 'low', confidence: 0.9, source: 'notes' },
  rhythmicRole: { value: 'downbeat', confidence: 0.9, source: 'rhythm' },
  importance: 0.9, repetition: 0.85,
});

const otherChan = (channel: number) => chan({ channel });

function profiles(playing: boolean[] = [true, true, true, true]) {
  return [
    buildDubTargetProfile(bassChan(0), { playingNow: playing[0] }),
    buildDubTargetProfile(otherChan(1), { playingNow: playing[1] }),
    buildDubTargetProfile(otherChan(2), { playingNow: playing[2] }),
    buildDubTargetProfile(otherChan(3), { playingNow: playing[3] }),
  ];
}

const entry = (moveId: string, row: number): JournalEntry =>
  ({ invocationId: 'i', moveId, row, timeSec: 0, origin: 'ai' } as JournalEntry);

describe('finding the low end', () => {
  it('picks the bass channel out and ignores the rest', () => {
    const s = buildBassState(profiles(), positionAt(0), [], 0);
    expect(s.channelIds).toEqual([0]);
    expect(s.audible).toBe(true);
  });

  it('knows the bass is not sounding', () => {
    const s = buildBassState(profiles([false, true, true, true]), positionAt(0), [], 0);
    expect(s.audible).toBe(false);
  });

  it('calls a mostly-silent arrangement exposed', () => {
    const full = buildBassState(profiles(), positionAt(0), [], 0);
    const sparse = buildBassState(profiles([true, true, false, false]), positionAt(0), [], 0);
    expect(full.currentlyExposed).toBe(false);
    expect(sparse.currentlyExposed).toBe(true);
  });
});

describe('what counts as a structural moment', () => {
  it('rates a phrase boundary highest', () => {
    expect(phraseImportanceAt(positionAt(0))).toBe(1);
  });

  it('rates the middle of a phrase at almost nothing', () => {
    // An arbitrary tick is not a musical moment and must not read as one.
    expect(phraseImportanceAt(positionAt(5, 0.5))).toBeLessThan(0.2);
  });

  it('rates the halfway turn above an ordinary bar', () => {
    expect(phraseImportanceAt(positionAt(8))).toBeGreaterThan(phraseImportanceAt(positionAt(5)));
  });
});

describe('refusing to emphasise', () => {
  it('refuses when the bass is merely quiet — the whole point of the module', () => {
    // Full arrangement, mid-phrase, bass playing but not carrying it.
    const p = profiles();
    const s = buildBassState(p, positionAt(5, 0.5), [], 80);
    const op = bassOpportunity(s, [], 80, ROWS_PER_BAR);
    expect(op.take).toBe(false);
    expect(op.reason).toMatch(/not a structurally significant moment/);
  });

  it('refuses when no channel reads as the low end', () => {
    const p = [buildDubTargetProfile(otherChan(0)), buildDubTargetProfile(otherChan(1))];
    const s = buildBassState(p, positionAt(0), [], 0);
    expect(bassOpportunity(s, [], 0, ROWS_PER_BAR).reason).toMatch(/no channel reads as the low end/);
  });

  it('refuses when the bass is silent, however good the moment', () => {
    const s = buildBassState(profiles([false, true, true, true]), positionAt(0), [], 0);
    expect(bassOpportunity(s, [], 0, ROWS_PER_BAR).reason).toMatch(/not sounding/);
  });

  it('refuses twice in a phrase', () => {
    const row = ROWS_PER_BAR * 4;
    const journal = [entry('bassEmphasis', 0)];
    const s = buildBassState(profiles([true, true, false, false]), positionAt(0), journal, row);
    expect(s.recentlyEmphasised).toBe(true);
    expect(bassOpportunity(s, journal, row, ROWS_PER_BAR).reason)
      .toMatch(new RegExp(`within ${BASS_EMPHASIS_COOLDOWN_BARS} bars`));
  });

  it('allows it again once the cooldown has passed', () => {
    const row = ROWS_PER_BAR * (BASS_EMPHASIS_COOLDOWN_BARS + 1);
    const journal = [entry('bassEmphasis', 0)];
    const s = buildBassState(profiles([true, true, false, false]), positionAt(0), journal, row);
    expect(s.recentlyEmphasised).toBe(false);
    expect(bassOpportunity(s, journal, row, ROWS_PER_BAR).take).toBe(true);
  });
});

describe('taking the moment', () => {
  it('takes it after the performer strips the arrangement back — the payoff', () => {
    // No phrase boundary needed: the drop WAS the structural event.
    const journal = [entry('versionDrop', ROWS_PER_BAR * 4)];
    const row = ROWS_PER_BAR * 5;
    const s = buildBassState(profiles([true, true, false, false]), positionAt(5, 0.5), journal, row);
    const op = bassOpportunity(s, journal, row, ROWS_PER_BAR);
    expect(op.take).toBe(true);
    expect(op.reason).toMatch(/stripped back/);
    expect(op.channelId).toBe(0);
  });

  it('does not take a strip that happened long ago', () => {
    const journal = [entry('versionDrop', 0)];
    const row = ROWS_PER_BAR * 12;
    const s = buildBassState(profiles([true, true, false, false]), positionAt(5, 0.5), journal, row);
    expect(bassOpportunity(s, journal, row, ROWS_PER_BAR).take).toBe(false);
  });

  it('takes a sparse arrangement at a phrase boundary', () => {
    const s = buildBassState(profiles([true, true, false, false]), positionAt(0), [], 0);
    const op = bassOpportunity(s, [], 0, ROWS_PER_BAR);
    expect(op.take).toBe(true);
    expect(op.reason).toMatch(/sparse arrangement/);
  });

  it('always says why, so a NO can be understood', () => {
    const s = buildBassState(profiles(), positionAt(5, 0.5), [], 80);
    const op = bassOpportunity(s, [], 80, ROWS_PER_BAR);
    expect(op.reason.length).toBeGreaterThan(10);
    expect(op.channelId).toBeNull();
  });
});
