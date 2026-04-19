import { describe, it, expect, beforeEach } from 'vitest';
import { useDJStore } from '../useDJStore';
import { resetStore } from './_harness';

describe('useDJStore — global mixer', () => {
  beforeEach(() => resetStore(useDJStore));

  it('initial state has the documented defaults', () => {
    const s = useDJStore.getState();
    expect(s.djModeActive).toBe(false);
    expect(s.crossfaderPosition).toBe(0.5);
    expect(s.crossfaderCurve).toBe('smooth');
    expect(s.hamsterSwitch).toBe(false);
    expect(s.thirdDeckActive).toBe(false);
    expect(s.autoDJStatus).toBe('idle');
  });

  it('setCrossfader clamps to [0, 1]', () => {
    const { setCrossfader } = useDJStore.getState();
    setCrossfader(1.5);
    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    setCrossfader(-0.5);
    expect(useDJStore.getState().crossfaderPosition).toBe(0);
    setCrossfader(0.75);
    expect(useDJStore.getState().crossfaderPosition).toBe(0.75);
  });

  it('setCrossfaderCurve accepts each curve value', () => {
    for (const curve of ['linear', 'cut', 'smooth'] as const) {
      useDJStore.getState().setCrossfaderCurve(curve);
      expect(useDJStore.getState().crossfaderCurve).toBe(curve);
    }
  });

  it('setHamsterSwitch toggles without touching crossfader position', () => {
    useDJStore.getState().setCrossfader(0.3);
    useDJStore.getState().setHamsterSwitch(true);
    expect(useDJStore.getState().hamsterSwitch).toBe(true);
    expect(useDJStore.getState().crossfaderPosition).toBe(0.3);
  });

  it('setMasterVolume accepts any number without clamping (engine handles limits)', () => {
    useDJStore.getState().setMasterVolume(0);
    expect(useDJStore.getState().masterVolume).toBe(0);
    useDJStore.getState().setMasterVolume(1);
    expect(useDJStore.getState().masterVolume).toBe(1);
  });
});

describe('useDJStore — per-deck isolation', () => {
  beforeEach(() => resetStore(useDJStore));

  it('setDeckPlaying on A does not affect B or C', () => {
    useDJStore.getState().setDeckPlaying('A', true);
    const d = useDJStore.getState().decks;
    expect(d.A.isPlaying).toBe(true);
    expect(d.B.isPlaying).toBe(false);
    expect(d.C.isPlaying).toBe(false);
  });

  it('setDeckVolume on B does not affect A', () => {
    useDJStore.getState().setDeckVolume('B', 0.25);
    const d = useDJStore.getState().decks;
    expect(d.B.volume).toBe(0.25);
    expect(d.A.volume).toBe(1);
  });

  it('setDeckEQ writes the correct band and leaves other bands untouched', () => {
    const { setDeckEQ } = useDJStore.getState();
    setDeckEQ('A', 'low', -6);
    setDeckEQ('A', 'high', +3);
    const a = useDJStore.getState().decks.A;
    expect(a.eqLow).toBe(-6);
    expect(a.eqMid).toBe(0);
    expect(a.eqHigh).toBe(+3);
  });

  it('setHotCue / deleteHotCue round-trip', () => {
    const cue = { position: 1000, color: '#ff0000', name: 'drop' };
    useDJStore.getState().setHotCue('A', 3, cue);
    expect(useDJStore.getState().decks.A.hotCues[3]).toEqual(cue);
    useDJStore.getState().deleteHotCue('A', 3);
    expect(useDJStore.getState().decks.A.hotCues[3]).toBeNull();
  });

  it('resetDeck restores the deck to its default state', () => {
    const { setDeckPlaying, setDeckVolume, resetDeck } = useDJStore.getState();
    setDeckPlaying('A', true);
    setDeckVolume('A', 0.1);
    resetDeck('A');
    const a = useDJStore.getState().decks.A;
    expect(a.isPlaying).toBe(false);
    expect(a.volume).toBe(1);
  });
});

describe('useDJStore — Auto DJ state machine', () => {
  beforeEach(() => resetStore(useDJStore));

  it('status transitions are free-form but each documented value is assignable', () => {
    const states = [
      'idle',
      'playing',
      'preloading',
      'preload-failed',
      'transition-pending',
      'transitioning',
    ] as const;
    for (const next of states) {
      useDJStore.getState().setAutoDJStatus(next);
      expect(useDJStore.getState().autoDJStatus).toBe(next);
    }
  });

  it('setAutoDJConfig merges, does not replace', () => {
    const { setAutoDJConfig } = useDJStore.getState();
    setAutoDJConfig({ transitionBars: 16 });
    expect(useDJStore.getState().autoDJTransitionBars).toBe(16);
    expect(useDJStore.getState().autoDJShuffle).toBe(false);
    setAutoDJConfig({ shuffle: true });
    expect(useDJStore.getState().autoDJShuffle).toBe(true);
    expect(useDJStore.getState().autoDJTransitionBars).toBe(16);
  });
});
