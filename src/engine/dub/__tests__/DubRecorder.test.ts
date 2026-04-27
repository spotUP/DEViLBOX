/**
 * DubRecorder — automation-store write tests.
 *
 * After the dub-studio-visual rewrite, DubRecorder writes to
 * useAutomationStore (step curves) on every live fire — the armed state
 * is no longer a write gate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fire, setDubBusForRouter } from '../DubRouter';
import { startDubRecorder } from '../DubRecorder';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
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

  it('trigger move: step curve written at fire row with value=1 then spike-to-0', () => {
    setRow(12);
    fire('echoThrow', 2, { intensity: 0.75 });
    const curves = getCurves('p0', 2);
    const curve = curves.find(c => c.parameter === 'dub.echoThrow');
    expect(curve).toBeDefined();
    expect(curve!.points.some(p => p.row === 12 && p.value === 1)).toBe(true);
    expect(curve!.points.some(p => p.value === 0)).toBe(true);
  });

  it('per-channel move uses channelIndex = event.channelId', () => {
    setRow(5);
    fire('channelMute', 3);
    const curves = getCurves('p0', 3);
    expect(curves.some(c => c.parameter === 'dub.channelMute')).toBe(true);
    const otherCurves = getCurves('p0', 0);
    expect(otherCurves.some(c => c.parameter === 'dub.channelMute')).toBe(false);
  });

  it('global move (no channelId) uses channelIndex=-1', () => {
    setRow(8);
    fire('springSlam', undefined);
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
    const curves = getCurves('p0', 0);
    expect(curves.some(c => c.parameter === 'dub.echoThrow')).toBe(true);
  });

  it('lane-sourced fires are ignored', () => {
    setRow(10);
    fire('echoThrow', 0, {}, 'lane');
    const curves = getCurves('p0', 0);
    expect(curves.some(c => c.parameter === 'dub.echoThrow')).toBe(false);
  });
});
