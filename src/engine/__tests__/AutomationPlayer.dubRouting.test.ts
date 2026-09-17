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
  // AutomationPlayer reads this to decide whether a dub parameter is a MOVE
  // (which takes a `.chN` channel suffix) or a bus-wide continuous param
  // (which must not). Omitting it made every dub write throw inside the
  // dispatcher's try/catch and vanish.
  // Mirrors the real registry's channel-requiring moves plus a couple of
  // bus-wide ones, so the sweep below covers every move that BREAKS when the
  // channel is dropped.
  DUB_MOVE_KINDS: {
    echoThrow: 'trigger', dubStab: 'trigger', channelThrow: 'trigger',
    echoBuildUp: 'trigger', skankEchoThrow: 'trigger', skankFloatThrow: 'trigger',
    channelMute: 'hold',
    springSlam: 'trigger', filterDrop: 'hold',
  } as Record<string, 'trigger' | 'hold'>,
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
    // Addressed as `.ch0` because the curve lives in channel 0's lane and
    // echoThrow is channel-scoped. Dispatching the plain name dropped the
    // channel, so the move fired with channelId undefined and every
    // channel-scoped move bailed on its first line — a recorded lane replayed
    // as silence. Fixed 2026-09-17.
    const calls = routeParameterSpy.mock.calls.filter(([p]) => p === 'dub.echoThrow.ch0');
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

// ── Every channel-scoped move, not just the one that was reported ──────────
// The dropped-channel bug was never specific to skank. These seven moves bail
// on their first line when channelId is undefined, so a recorded lane of any
// of them replayed as complete silence:
//
//   channelThrow  channelMute  dubStab  echoBuildUp  echoThrow
//   skankEchoThrow  skankFloatThrow
describe('AutomationPlayer — every dub move carries its lane channel', () => {
  const CHANNEL_SCOPED = [
    'echoThrow', 'dubStab', 'channelThrow', 'echoBuildUp',
    'skankEchoThrow', 'skankFloatThrow', 'channelMute',
  ];

  function play(parameter: string, channelIndex: number): void {
    const player = new AutomationPlayer();
    const curve = { ...mkCurve(parameter, [
      { row: 0, value: 0 },
      { row: 2, value: 1 },
    ]), channelIndex };
    player.setAutomationData({ p0: { [channelIndex]: { [parameter]: curve } } });
    player.setPattern({
      id: 'p0', name: 'Test', length: 8,
      channels: [0, 1, 2, 3].map((i) => ({
        id: `ch${i}`, name: `Ch ${i + 1}`,
        rows: Array.from({ length: 8 }, () => ({
          note: 0, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    for (let r = 0; r <= 2; r++) player.processPatternRow(r);
  }

  it.each(CHANNEL_SCOPED)('%s is addressed to its lane channel', (moveId) => {
    routeParameterSpy.mockClear();
    play(`dub.${moveId}`, 2);
    const addressed = routeParameterSpy.mock.calls.filter(([p]) => p === `dub.${moveId}.ch2`);
    expect(addressed.length, `${moveId} must reach ch2`).toBeGreaterThan(0);
    // Never both — the bare form fires with no channel and the move bails.
    const bare = routeParameterSpy.mock.calls.filter(([p]) => p === `dub.${moveId}`);
    expect(bare.length, `${moveId} must not also dispatch unaddressed`).toBe(0);
  });

  it('leaves an authored .chN alone rather than stacking another', () => {
    routeParameterSpy.mockClear();
    play('dub.echoThrow.ch1', 3);
    const calls = routeParameterSpy.mock.calls.map(([p]) => p);
    expect(calls).toContain('dub.echoThrow.ch1');
    expect(calls.every((p) => p !== 'dub.echoThrow.ch1.ch3')).toBe(true);
  });

  it('leaves bus-wide continuous params unaddressed', () => {
    // dub.echoWet belongs to the shared bus; a channel suffix would break its
    // lookup and silently drop the automation.
    routeParameterSpy.mockClear();
    play('dub.echoWet', 2);
    const calls = routeParameterSpy.mock.calls.filter(([p]) => String(p).startsWith('dub.echoWet'));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([p]) => p === 'dub.echoWet')).toBe(true);
  });
});
