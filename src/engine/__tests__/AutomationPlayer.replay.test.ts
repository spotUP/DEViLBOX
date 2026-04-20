/**
 * Parameter-automation record → replay round-trip coverage.
 *
 * Counterpart to `DubRecorder.test.ts` (PR #38) but for the parameter-curve
 * subsystem: knob moves are captured by `useAutomationStore.recordPoint`
 * into an `AutomationCurve`, and `AutomationPlayer` reads those curves back
 * at runtime, interpolating between points.
 *
 * This guards the class of regression where a curve is captured fine but
 * playback reads the wrong interpolation kind, skips points, or ignores
 * the curve entirely — classic silent-break territory.
 *
 * Pure-logic: no AudioContext, no ToneEngine instantiation, no
 * ManualOverrideManager plumbing. The replay tests exercise
 * `AutomationPlayer.getCurrentValue` (the public, engine-free surface that
 * returns the interpolated curve value) rather than `processPatternRow`
 * (which tries to apply to live instruments via ToneEngine).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { AutomationPlayer } from '@/engine/AutomationPlayer';
import type { Pattern } from '@typedefs';
import type { AutomationCurve } from '@typedefs/automation';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const PATTERN_ID = 'p0';
const CHANNEL = 0;
// Use a curve-only parameter name. Short-name "accent" isn't in the
// tracker-column map (cutoff/resonance/envMod/pan/volume), so the
// column-vs-curve merge always falls through to the curve — which is
// what we want to isolate for this test.
const PARAM = 'tb303.accent';

function mkPattern(length = 32): Pattern {
  const emptyCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const rows = Array.from({ length }, () => ({ ...emptyCell }));
  return {
    id: PATTERN_ID,
    name: 'Test Pattern',
    length,
    channels: [
      { id: 'ch0', name: 'Ch 1', rows: rows.map((r) => ({ ...r })) },
      { id: 'ch1', name: 'Ch 2', rows: rows.map((r) => ({ ...r })) },
    ],
    dubLane: { enabled: true, events: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** Plug a store curve into AutomationPlayer's private data shape. */
function installCurveOnPlayer(player: AutomationPlayer, curve: AutomationCurve): void {
  player.setAutomationData({
    [curve.patternId]: {
      [curve.channelIndex]: {
        [curve.parameter]: curve,
      },
    },
  });
}

function resetStore(): void {
  useAutomationStore.getState().reset();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Parameter automation record → replay', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('record path — useAutomationStore.recordPoint', () => {
    it('first recordPoint creates a curve with that single point', () => {
      useAutomationStore.getState().recordPoint(PATTERN_ID, CHANNEL, PARAM, 4, 0.5);
      const curves = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL);
      expect(curves).toHaveLength(1);
      expect(curves[0].parameter).toBe(PARAM);
      expect(curves[0].enabled).toBe(true);
      expect(curves[0].interpolation).toBe('linear');
      expect(curves[0].points).toEqual([{ row: 4, value: 0.5 }]);
    });

    it('subsequent recordPoints append to the same curve, sorted by row', () => {
      const store = useAutomationStore.getState();
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 16, 1.0);
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 0, 0.0);
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 8, 0.5);
      const curves = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL);
      expect(curves).toHaveLength(1);
      expect(curves[0].points.map((p) => p.row)).toEqual([0, 8, 16]);
      expect(curves[0].points.map((p) => p.value)).toEqual([0.0, 0.5, 1.0]);
    });

    it('recording at an existing row updates the value instead of adding a duplicate', () => {
      const store = useAutomationStore.getState();
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 8, 0.3);
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 8, 0.9);
      const curve = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL)[0];
      expect(curve.points).toHaveLength(1);
      expect(curve.points[0]).toEqual({ row: 8, value: 0.9 });
    });

    it('different parameters on the same channel get separate curves', () => {
      const store = useAutomationStore.getState();
      store.recordPoint(PATTERN_ID, CHANNEL, 'tb303.accent', 0, 0.2);
      store.recordPoint(PATTERN_ID, CHANNEL, 'tb303.slideTime', 0, 0.7);
      const curves = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL);
      expect(curves).toHaveLength(2);
      const params = curves.map((c) => c.parameter).sort();
      expect(params).toEqual(['tb303.accent', 'tb303.slideTime']);
    });

    it('different channels get separate curves even for the same parameter', () => {
      const store = useAutomationStore.getState();
      store.recordPoint(PATTERN_ID, 0, PARAM, 0, 0.1);
      store.recordPoint(PATTERN_ID, 1, PARAM, 0, 0.9);
      expect(useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, 0)).toHaveLength(1);
      expect(useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, 1)).toHaveLength(1);
      expect(useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, 0)[0].points[0].value).toBe(0.1);
      expect(useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, 1)[0].points[0].value).toBe(0.9);
    });
  });

  describe('replay path — AutomationPlayer.getCurrentValue', () => {
    it('returns the exact point value at a recorded row', () => {
      const curve: AutomationCurve = {
        id: 'c1',
        patternId: PATTERN_ID,
        channelIndex: CHANNEL,
        parameter: PARAM,
        mode: 'curve',
        interpolation: 'linear',
        enabled: true,
        points: [
          { row: 0, value: 0.0 },
          { row: 8, value: 1.0 },
          { row: 16, value: 0.5 },
        ],
      };
      const player = new AutomationPlayer();
      player.setPattern(mkPattern());
      installCurveOnPlayer(player, curve);

      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 0)).toBeCloseTo(0.0, 5);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 8)).toBeCloseTo(1.0, 5);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 16)).toBeCloseTo(0.5, 5);
    });

    it('linearly interpolates between points', () => {
      const curve: AutomationCurve = {
        id: 'c1',
        patternId: PATTERN_ID,
        channelIndex: CHANNEL,
        parameter: PARAM,
        mode: 'curve',
        interpolation: 'linear',
        enabled: true,
        points: [
          { row: 0, value: 0.0 },
          { row: 8, value: 1.0 },
          { row: 16, value: 0.0 },
        ],
      };
      const player = new AutomationPlayer();
      player.setPattern(mkPattern());
      installCurveOnPlayer(player, curve);

      // Midpoint between (0, 0.0) and (8, 1.0) → 0.5
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 4)).toBeCloseTo(0.5, 5);
      // Midpoint between (8, 1.0) and (16, 0.0) → 0.5
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 12)).toBeCloseTo(0.5, 5);
      // Quarter-way between (0, 0.0) and (8, 1.0) → 0.25
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 2)).toBeCloseTo(0.25, 5);
    });

    it('a disabled curve returns null (skipped on replay)', () => {
      const curve: AutomationCurve = {
        id: 'c1', patternId: PATTERN_ID, channelIndex: CHANNEL, parameter: PARAM,
        mode: 'curve', interpolation: 'linear', enabled: false,
        points: [{ row: 0, value: 0.5 }, { row: 16, value: 0.8 }],
      };
      const player = new AutomationPlayer();
      player.setPattern(mkPattern());
      installCurveOnPlayer(player, curve);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 8)).toBeNull();
    });

    it('missing curve returns null (no stale fallback)', () => {
      const player = new AutomationPlayer();
      player.setPattern(mkPattern());
      // No setAutomationData call — empty data store.
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 0)).toBeNull();
    });
  });

  describe('record → replay round-trip', () => {
    it('store-recorded points are read back exactly by AutomationPlayer', () => {
      const store = useAutomationStore.getState();
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 0, 0.1);
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 8, 0.7);
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 16, 0.3);

      const recorded = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL)[0];
      const player = new AutomationPlayer();
      player.setPattern(mkPattern());
      installCurveOnPlayer(player, recorded);

      // Exact points
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 0)).toBeCloseTo(0.1, 5);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 8)).toBeCloseTo(0.7, 5);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 16)).toBeCloseTo(0.3, 5);

      // Interpolated midpoints
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 4)).toBeCloseTo(0.4, 5);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 12)).toBeCloseTo(0.5, 5);
    });

    it('overwriting a point at the same row changes the replayed value', () => {
      const store = useAutomationStore.getState();
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 8, 0.25);

      {
        const curve = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL)[0];
        const player = new AutomationPlayer();
        player.setPattern(mkPattern());
        installCurveOnPlayer(player, curve);
        expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 8)).toBeCloseTo(0.25, 5);
      }

      // Overwrite same row.
      store.recordPoint(PATTERN_ID, CHANNEL, PARAM, 8, 0.9);

      const curve = useAutomationStore.getState().getCurvesForPattern(PATTERN_ID, CHANNEL)[0];
      expect(curve.points).toHaveLength(1);
      const player = new AutomationPlayer();
      player.setPattern(mkPattern());
      installCurveOnPlayer(player, curve);
      expect(player.getCurrentValue(PATTERN_ID, CHANNEL, PARAM, 8)).toBeCloseTo(0.9, 5);
    });
  });
});
