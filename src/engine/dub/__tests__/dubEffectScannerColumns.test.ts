/**
 * Plan item F2b — a dub cell fires from ANY effect column, not just 1-2.
 *
 * The scanner documented columns 3-8 as "Furnace import-only and never
 * dispatched by the replayer". That was wrong: TrackerReplayer dispatches
 * effTyp2..effTyp8 for ordinary effects, so a dub move typed into column 3
 * rendered as `Zxx`, sat in a column the replayer honours, and silently did
 * nothing. Fires are asserted through the real DubRouter event stream.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodeDubEffect } from '../moveTable';
import { scanDubEffectsForRow, resetDubEffectScanner } from '../DubEffectScanner';
import { subscribeDubRouter, setDubBusForRouter, type DubFireEvent } from '../DubRouter';
import { useTrackerStore } from '@/stores/useTrackerStore';

/**
 * Tolerant bus stub. Moves call wildly different bus methods, and a move that
 * throws inside `execute` publishes no fire event AND aborts the scanner's
 * remaining work (its try/catch is there for "store not ready"). A Proxy that
 * answers any method keeps this test about dispatch — which columns and slots
 * reach the router — rather than about each move's internals.
 */
function installBusStub() {
  const bus: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'getSettings') {
        return () => ({ throwQuantize: 'off', echoSyncDivision: '1/4', echoRateMs: 320 });
      }
      // Every other member: a callable returning a releaser, which covers both
      // the void-returning and disposer-returning bus methods.
      return () => () => {};
    },
  });
  setDubBusForRouter(bus as never);
}

/** Build a one-channel pattern whose row 0 carries `cell`, and select it. */
function loadPatternWithCell(cell: Record<string, number>) {
  const rows = Array.from({ length: 4 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));
  Object.assign(rows[0], cell);
  useTrackerStore.setState({
    patterns: [{ name: 'T', length: 4, channels: [{ name: 'CH1', rows }] }],
    currentPatternIndex: 0,
  } as never);
}

describe('DubEffectScanner — every effect column dispatches', () => {
  let fires: DubFireEvent[];
  let unsub: () => void;

  beforeEach(() => {
    installBusStub();
    fires = [];
    unsub = subscribeDubRouter((e) => fires.push(e));
    resetDubEffectScanner();
  });
  afterEach(() => {
    unsub();
    resetDubEffectScanner();
  });

  const enc = encodeDubEffect('echoThrow', 0)!;

  it('fires from column 1 (the path that always worked)', () => {
    loadPatternWithCell({ effTyp: enc.effTyp, eff: enc.eff });
    scanDubEffectsForRow(0);
    expect(fires.map(f => f.moveId)).toEqual(['echoThrow']);
  });

  it('fires from column 2', () => {
    loadPatternWithCell({ effTyp2: enc.effTyp, eff2: enc.eff });
    scanDubEffectsForRow(0);
    expect(fires.map(f => f.moveId)).toEqual(['echoThrow']);
  });

  it('fires from column 3 — the regression', () => {
    loadPatternWithCell({ effTyp3: enc.effTyp, eff3: enc.eff });
    scanDubEffectsForRow(0);
    expect(fires.map(f => f.moveId)).toEqual(['echoThrow']);
  });

  it('fires from column 8, the last one the replayer honours', () => {
    loadPatternWithCell({ effTyp8: enc.effTyp, eff8: enc.eff });
    scanDubEffectsForRow(0);
    expect(fires.map(f => f.moveId)).toEqual(['echoThrow']);
  });

  it('fires once per populated column, in column order', () => {
    const a = encodeDubEffect('echoThrow', 0)!;
    const b = encodeDubEffect('dubStab', 0)!;
    loadPatternWithCell({
      effTyp: a.effTyp, eff: a.eff,
      effTyp3: b.effTyp, eff3: b.eff,
    });
    scanDubEffectsForRow(0);
    expect(fires.map(f => f.moveId)).toEqual(['echoThrow', 'dubStab']);
  });

  it('a move only reachable through the new slot pair fires from a cell', () => {
    // skankEchoThrow sits past index 32, so it had no encoding at all before
    // slot pair 41/42 existed.
    const late = encodeDubEffect('skankEchoThrow', 0);
    expect(late).not.toBeNull();
    loadPatternWithCell({ effTyp: late!.effTyp, eff: late!.eff });
    scanDubEffectsForRow(0);
    expect(fires.map(f => f.moveId)).toEqual(['skankEchoThrow']);
  });

  it('ignores ordinary effects — no false dub fires', () => {
    loadPatternWithCell({ effTyp: 0x0A, eff: 0x08, effTyp3: 0x0C, eff3: 0x40 });
    scanDubEffectsForRow(0);
    expect(fires).toEqual([]);
  });

  it('dedupes repeated calls for the same row', () => {
    loadPatternWithCell({ effTyp: enc.effTyp, eff: enc.eff });
    scanDubEffectsForRow(0);
    scanDubEffectsForRow(0);
    expect(fires).toHaveLength(1);
  });
});
