/**
 * DubRecorder — write-path tests.
 *
 * On every live fire DubRecorder picks ONE inline target so replay never
 * double-fires:
 *   - Trigger moves  → cell effect command (DUB_EFFECT_GLOBAL/PERCHANNEL)
 *                       on the pattern. Curve is intentionally skipped to
 *                       prevent DubEffectScanner + AutomationPlayer both
 *                       firing the same row.
 *   - Hold moves     → automation step curve only. Cells can't encode
 *                       release, so cell-fired holds would leak the disposer.
 *
 * Lane-sourced fires (DubLanePlayer replays) are ignored to avoid an
 * infinite capture loop.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fire, setDubBusForRouter } from '../DubRouter';
import { startDubRecorder } from '../DubRecorder';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { isDubMoveEffectSlot, decodeDubEffect } from '../moveTable';
import type { DubBus } from '../DubBus';

function makeMockBus(): DubBus {
  return {
    get isEnabled() { return true; },
    openChannelTap: vi.fn(() => () => {}),
    modulateFeedback: vi.fn(),
    slamSpring: vi.fn(),
    filterDrop: vi.fn(() => () => {}),
    setSirenFeedback: vi.fn(() => () => {}),
    startTapeWobble: vi.fn(() => () => {}),
    fireNoiseBurst: vi.fn(),
    throwEchoTime: vi.fn(),
    backwardReverb: vi.fn(async () => {}),
    tapeStop: vi.fn(),
    soloChannelTap: vi.fn(() => () => {}),
    inputNode: { context: {} as AudioContext } as unknown as GainNode,
  } as unknown as DubBus;
}

function installPatterns(): void {
  const mkPattern = (id: string, name: string) => ({
    id,
    name,
    length: 64,
    channels: [
      { id: 'ch0', name: 'Ch 1', rows: Array(64).fill(null).map(() => ({})) },
      { id: 'ch1', name: 'Ch 2', rows: Array(64).fill(null).map(() => ({})) },
      { id: 'ch2', name: 'Ch 3', rows: Array(64).fill(null).map(() => ({})) },
      { id: 'ch3', name: 'Ch 4', rows: Array(64).fill(null).map(() => ({})) },
    ],
    dubLane: { enabled: true, events: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  useTrackerStore.setState((s) => ({
    ...s,
    patterns: [mkPattern('p0', 'Pattern 00'), mkPattern('p1', 'Pattern 01')],
    currentPatternIndex: 0,
  }));
}

function setRow(row: number): void {
  useTransportStore.setState((s) => ({ ...s, currentRow: row }));
}

function getCurves(patternId: string, channelIndex: number) {
  return useAutomationStore.getState().getCurvesForPattern(patternId, channelIndex);
}

/** Read the (effTyp, eff) pair at (channel, row) from the current pattern. */
function getCell(channel: number, row: number): { effTyp?: number; eff?: number } {
  const pat = useTrackerStore.getState().patterns[0];
  return pat?.channels[channel]?.rows[row] ?? {};
}

describe('DubRecorder — automation store write path', () => {
  let unsubRecorder: (() => void) | null = null;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return null as unknown as number;
    });
    setDubBusForRouter(makeMockBus());
    installPatterns();
    useAutomationStore.setState((s) => ({ ...s, curves: [] }));
    setRow(0);
    unsubRecorder = startDubRecorder();
  });

  afterEach(() => {
    unsubRecorder?.();
    unsubRecorder = null;
    setDubBusForRouter(null);
    vi.unstubAllGlobals();
  });

  it('per-channel trigger writes effect cell on the firing channel (no curve)', () => {
    setRow(12);
    fire('echoThrow', 2, { intensity: 0.75 });
    const cell = getCell(2, 12);
    expect(cell.effTyp).toBeDefined();
    expect(isDubMoveEffectSlot(cell.effTyp!)).toBe(true);
    const decoded = decodeDubEffect(cell.effTyp!, cell.eff!);
    expect(decoded?.moveId).toBe('echoThrow');
    expect(decoded?.channelId).toBe(2);
    // Curve intentionally skipped to avoid double-fire on replay (cell + curve)
    const curves = getCurves('p0', 2);
    expect(curves.some(c => c.parameter === 'dub.echoThrow')).toBe(false);
  });

  it('per-channel hold writes curve only — cells leak disposers', () => {
    setRow(5);
    fire('channelMute', 3);
    // Cell on the firing channel must NOT be written (cell-fired holds
    // would leak their disposer; the move would never release on replay).
    const cell = getCell(3, 5);
    expect(cell.effTyp).toBeUndefined();
    // Curve IS written so AutomationPlayer can replay fire+release.
    const curves = getCurves('p0', 3);
    expect(curves.some(c => c.parameter === 'dub.channelMute')).toBe(true);
  });

  it('global trigger writes curve to global lane (channelIndex=-1, no cell)', () => {
    setRow(8);
    fire('springSlam', undefined);
    // No cell on any channel — global moves don't belong on a per-channel
    // effect column. They live on the global FX lane next to bus-wide
    // automation (echoWet, hpfCutoff, returnGain, etc.).
    for (let ch = 0; ch < 4; ch++) {
      const cell = getCell(ch, 8);
      expect(cell.effTyp).toBeUndefined();
    }
    // Curve appears on the global lane (channelIndex = -1).
    const globalCurves = useAutomationStore.getState().getGlobalCurves('p0');
    expect(globalCurves.some(c => c.parameter === 'dub.springSlam')).toBe(true);
  });

  it('hold move: value=1 at fire row, value=0 stamped at release row', () => {
    setRow(4);
    const disposer = fire('filterDrop', 1);
    expect(disposer).not.toBeNull();
    setRow(20);
    disposer!.dispose();
    const curves = getCurves('p0', 1);
    const curve = curves.find(c => c.parameter === 'dub.filterDrop');
    expect(curve).toBeDefined();
    expect(curve!.points.some(p => p.row === 4 && p.value === 1)).toBe(true);
    expect(curve!.points.some(p => p.row === 20 && p.value === 0)).toBe(true);
  });

  it('writes regardless of armed state', () => {
    setRow(8);
    fire('echoThrow', 0);
    // echoThrow on channel 0 → effect cell on (ch 0, row 8)
    const cell = getCell(0, 8);
    expect(cell.effTyp).toBeDefined();
    expect(isDubMoveEffectSlot(cell.effTyp!)).toBe(true);
    expect(decodeDubEffect(cell.effTyp!, cell.eff!)?.moveId).toBe('echoThrow');
  });

  it('lane-sourced fires are ignored', () => {
    setRow(10);
    fire('echoThrow', 0, {}, 'lane');
    // No cell, no curve — lane fires loop forever otherwise.
    const cell = getCell(0, 10);
    expect(cell.effTyp).toBeUndefined();
    const curves = getCurves('p0', 0);
    expect(curves.some(c => c.parameter === 'dub.echoThrow')).toBe(false);
  });
});
