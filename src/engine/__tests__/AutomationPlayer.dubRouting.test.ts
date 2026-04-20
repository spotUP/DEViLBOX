/**
 * AutomationPlayer → dub.* routing contract (task #35).
 *
 * Before this wiring, drawing an automation curve for (e.g.) `dub.echoWet`
 * would capture cleanly and display in the editor but the replay engine
 * silently dropped it: `applyParameter` only routed `mixer.*` + `global.*`
 * + instrument-level names. `dub.*` values fell through to the instrument
 * fallback and nothing happened.
 *
 * Fix: forward every `dub.*` parameter write to `routeParameterToEngine`
 * — the same dispatcher MIDI CCs and knob moves use (routeDubParameter
 * handles continuous bus params via DUB_BUS_PARAMS and trigger/hold moves
 * via DUB_MOVE_KINDS).
 *
 * Happy-dom can't exercise the live DSP, so we mock the router and verify
 * the forwarding — a single, narrow integration point.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the parameter router BEFORE importing AutomationPlayer so the
// mocked fn replaces the one AutomationPlayer imports.
const routeParameterSpy = vi.fn();
vi.mock('@/midi/performance/parameterRouter', () => ({
  routeParameterToEngine: (param: string, value: number) => {
    routeParameterSpy(param, value);
  },
}));

// Also stub ManualOverrideManager so `isOverridden` doesn't accidentally
// block the routing. We want the dub.* path to run unconditionally.
vi.mock('@/engine/ManualOverrideManager', () => ({
  getManualOverrideManager: () => ({
    isOverridden: () => false,
  }),
}));

// Stub ToneEngine + channel filter so the module graph loads; neither
// should be reached on the dub.* branch.
vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({
    instruments: new Map(),
    setChannelVolume: vi.fn(),
    setChannelPan: vi.fn(),
    setChannelMute: vi.fn(),
    setMasterVolume: vi.fn(),
  }),
}));
vi.mock('@/engine/ChannelFilterManager', () => ({
  getChannelFilterManager: () => ({
    setPosition: vi.fn(),
    setResonance: vi.fn(),
  }),
}));

import { AutomationPlayer } from '../AutomationPlayer';
import type { AutomationCurve } from '@/types/automation';

function mkCurve(parameter: string, points: Array<{ row: number; value: number }>): AutomationCurve {
  return {
    id: `curve-${parameter}`,
    patternId: 'p0',
    channelIndex: 0,
    parameter,
    mode: 'curve',
    interpolation: 'linear',
    enabled: true,
    points,
  };
}

beforeEach(() => {
  routeParameterSpy.mockClear();
});

describe('AutomationPlayer — dub.* parameter routing', () => {
  it('forwards dub.echoWet to routeParameterToEngine at the curve-interpolated value', () => {
    const player = new AutomationPlayer();
    const curve = mkCurve('dub.echoWet', [
      { row: 0, value: 0 },
      { row: 16, value: 0.5 },
      { row: 32, value: 1 },
    ]);
    player.setAutomationData({ p0: { 0: { 'dub.echoWet': curve } } });

    // Fake pattern so processPatternRow can iterate channels.
    const pattern = {
      id: 'p0', name: 'Test', length: 32,
      channels: [{
        id: 'ch0', name: 'Ch 1',
        rows: Array.from({ length: 32 }, () => ({
          note: 0, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    player.setPattern(pattern);

    // Halfway through the curve → interpolated value 0.5.
    player.processPatternRow(16);
    expect(routeParameterSpy).toHaveBeenCalledWith('dub.echoWet', 0.5);
  });

  it('forwards dub-move trigger curves to routeParameterToEngine for upward-crossing detection', () => {
    // For trigger moves (dub.echoThrow, dub.dubStab, …) the router's edge
    // detection handles fire-on-0.5-crossing. Automation writes the raw
    // 0-1 curve value; the router sees successive writes and detects the
    // upward crossing. This test just verifies the forward happens.
    const player = new AutomationPlayer();
    const curve = mkCurve('dub.echoThrow', [
      { row: 0, value: 0 },
      { row: 4, value: 1 },
      { row: 8, value: 0 },
    ]);
    player.setAutomationData({ p0: { 0: { 'dub.echoThrow': curve } } });
    player.setPattern({
      id: 'p0', name: 'Test', length: 16,
      channels: [{ id: 'ch0', name: 'Ch 1', rows: Array.from({ length: 16 }, () => ({
        note: 0, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Sweep rows 0→8; curve climbs then falls. The router will see each
    // tick and do its own upward-crossing detection — we just assert the
    // forwarding is unconditional.
    for (let r = 0; r <= 8; r++) player.processPatternRow(r);
    const calls = routeParameterSpy.mock.calls.filter(([p]) => p === 'dub.echoThrow');
    expect(calls.length, 'every processed row should forward the dub.* curve value').toBe(9);
    // First tick is 0, middle tick is 1 (peak).
    expect(calls[0][1]).toBe(0);
    expect(calls[4][1]).toBe(1);
  });

  it('does NOT forward non-dub.* parameters through routeParameterToEngine', () => {
    // tb303.cutoff and accent etc. still go through the old
    // instrument-level path, not the router. Verifies the dub.* branch
    // is scoped (prefix-gated) and doesn't hijack other namespaces.
    const player = new AutomationPlayer();
    const curve = mkCurve('tb303.accent', [
      { row: 0, value: 0 },
      { row: 32, value: 1 },
    ]);
    player.setAutomationData({ p0: { 0: { 'tb303.accent': curve } } });
    player.setPattern({
      id: 'p0', name: 'Test', length: 32,
      channels: [{ id: 'ch0', name: 'Ch 1', rows: Array.from({ length: 32 }, () => ({
        note: 0, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    player.processPatternRow(16);
    expect(routeParameterSpy).not.toHaveBeenCalled();
  });

  it('forwards per-channel addressed dub moves (dub.echoThrow.ch2) unchanged', () => {
    // The router parses `.chN` suffix itself (parseDubMoveParam). The
    // AutomationPlayer must forward the raw parameter string so the
    // router sees the suffix and routes to the right channel.
    const player = new AutomationPlayer();
    const curve = mkCurve('dub.echoThrow.ch2', [
      { row: 0, value: 0 },
      { row: 4, value: 1 },
    ]);
    player.setAutomationData({ p0: { 0: { 'dub.echoThrow.ch2': curve } } });
    player.setPattern({
      id: 'p0', name: 'Test', length: 8,
      channels: [{ id: 'ch0', name: 'Ch 1', rows: Array.from({ length: 8 }, () => ({
        note: 0, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    player.processPatternRow(4);
    expect(routeParameterSpy).toHaveBeenCalledWith('dub.echoThrow.ch2', 1);
  });
});
