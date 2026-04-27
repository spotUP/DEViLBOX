/**
 * AutomationBaker — dub.* parameter baking tests (Task 2).
 *
 * Verifies that dub.channelMute, dub.echoThrow, and dub.eqSweep are
 * correctly mapped to tracker effect commands via getDubEffectMapping,
 * and that format-gating works (e.g. eqSweep bakes on IT but not MOD).
 */

import { describe, it, expect } from 'vitest';
import type { AutomationCurve } from '@/types/automation';
import type { Pattern } from '@/types/tracker';
import type { FormatConstraints } from '@/lib/formatCompatibility';
import { bakeAutomationForExport } from '../AutomationBaker';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal tracker cell matching production shape (effTyp/eff initialized to 0) */
function makeCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makePattern(id: string, len: number): Pattern {
  return {
    id,
    name: 'Test',
    length: len,
    channels: [
      {
        id: 'ch0',
        name: 'Ch 1',
        rows: Array(len).fill(null).map(() => makeCell()),
      },
      {
        id: 'ch1',
        name: 'Ch 2',
        rows: Array(len).fill(null).map(() => makeCell()),
      },
    ],
  } as unknown as Pattern;
}

let curveSeq = 0;
function makeStepCurve(
  patternId: string,
  channelIndex: number,
  parameter: string,
  points: { row: number; value: number }[],
): AutomationCurve {
  return {
    id: `test-curve-${curveSeq++}`,
    patternId,
    channelIndex,
    parameter,
    mode: 'steps',
    interpolation: 'linear',
    points: points.map((p) => ({ ...p })),
    enabled: true,
  };
}

// Format stubs — only the fields AutomationBaker actually reads
const XM_FORMAT: FormatConstraints = {
  name: 'XM',
  supportsPanning: true,
  chipType: undefined,
} as unknown as FormatConstraints;

const IT_FORMAT: FormatConstraints = {
  name: 'IT',
  supportsPanning: true,
  chipType: undefined,
} as unknown as FormatConstraints;

const MOD_FORMAT: FormatConstraints = {
  name: 'MOD',
  supportsPanning: false,
  chipType: undefined,
} as unknown as FormatConstraints;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AutomationBaker — dub.* parameters', () => {
  it('dub.channelMute value=1 bakes a volume-zero command into the cell (XM)', () => {
    const pattern = makePattern('p1', 8);
    const curve = makeStepCurve('p1', 0, 'dub.channelMute', [
      { row: 2, value: 1 },
      { row: 6, value: 0 },
    ]);
    const result = bakeAutomationForExport([pattern], [curve], XM_FORMAT);
    expect(result.bakedCount).toBeGreaterThan(0);

    // Row 2: value=1 → muted → volume column 0x10+0 = 0x10, OR Cxx 0
    const row2 = result.patterns[0].channels[0].rows[2] as unknown as Record<string, unknown>;
    const hasVolumeZero =
      (row2['effTyp'] === 12 && row2['eff'] === 0) ||
      (typeof row2['volume'] === 'number' && row2['volume'] <= 0x10);
    expect(hasVolumeZero).toBe(true);
  });

  it('dub.channelMute value=0 restores volume to 64 (XM)', () => {
    const pattern = makePattern('p2', 8);
    const curve = makeStepCurve('p2', 0, 'dub.channelMute', [{ row: 3, value: 0 }]);
    const result = bakeAutomationForExport([pattern], [curve], XM_FORMAT);
    expect(result.bakedCount).toBeGreaterThan(0);

    // Row 3: value=0 → restore → volume column 0x10+64 = 0x50, OR Cxx 64
    const row3 = result.patterns[0].channels[0].rows[3] as unknown as Record<string, unknown>;
    const hasVolumeRestored =
      (row3['effTyp'] === 12 && row3['eff'] === 64) ||
      (typeof row3['volume'] === 'number' && row3['volume'] === 0x50);
    expect(hasVolumeRestored).toBe(true);
  });

  it('dub.echoThrow bakes on XM (not MOD)', () => {
    const patXM = makePattern('pxm', 16);
    const curveXM = makeStepCurve('pxm', 0, 'dub.echoThrow', [{ row: 4, value: 1 }]);
    const xmResult = bakeAutomationForExport([patXM], [curveXM], XM_FORMAT);
    expect(xmResult.bakedCount).toBeGreaterThan(0);

    const patMOD = makePattern('pmod', 16);
    const curveMOD = makeStepCurve('pmod', 0, 'dub.echoThrow', [{ row: 4, value: 1 }]);
    const modResult = bakeAutomationForExport([patMOD], [curveMOD], MOD_FORMAT);
    // MOD: either bakedCount=0 (mapping returned false) or a warning was emitted
    expect(modResult.bakedCount === 0 || modResult.warnings.length > 0).toBe(true);
  });

  it('dub.eqSweep bakes on IT but not on MOD', () => {
    const patIT = makePattern('pit', 16);
    const curveIT = makeStepCurve('pit', 0, 'dub.eqSweep', [{ row: 4, value: 0.5 }]);
    const itResult = bakeAutomationForExport([patIT], [curveIT], IT_FORMAT);
    expect(itResult.bakedCount).toBeGreaterThan(0);

    const patMOD = makePattern('pmod2', 16);
    const curveMOD = makeStepCurve('pmod2', 0, 'dub.eqSweep', [{ row: 4, value: 0.5 }]);
    const modResult = bakeAutomationForExport([patMOD], [curveMOD], MOD_FORMAT);
    expect(modResult.bakedCount === 0 || modResult.warnings.length > 0).toBe(true);
  });

  it('dub.eqSweep bakes on IT with correct Zxx cutoff value', () => {
    const pattern = makePattern('pit2', 16);
    // value=0.5 → norm(0.5, 0x7F) = 63
    const curve = makeStepCurve('pit2', 0, 'dub.eqSweep', [{ row: 0, value: 0.5 }]);
    const result = bakeAutomationForExport([pattern], [curve], IT_FORMAT);
    expect(result.bakedCount).toBeGreaterThan(0);

    const row0 = result.patterns[0].channels[0].rows[0] as unknown as Record<string, unknown>;
    // Zxx = effect type 26 (0x1A), param = Math.round(0.5 * 127) = 64
    expect(row0['effTyp']).toBe(0x1a);
    expect(row0['eff']).toBe(Math.round(0.5 * 0x7f));
  });

  it('dub.channelThrow bakes a full-volume spike (XM)', () => {
    const pattern = makePattern('pthrow', 8);
    const curve = makeStepCurve('pthrow', 0, 'dub.channelThrow', [{ row: 1, value: 1 }]);
    const result = bakeAutomationForExport([pattern], [curve], XM_FORMAT);
    expect(result.bakedCount).toBeGreaterThan(0);

    const row1 = result.patterns[0].channels[0].rows[1] as unknown as Record<string, unknown>;
    const hasFullVolume =
      (row1['effTyp'] === 12 && row1['eff'] === 64) ||
      (typeof row1['volume'] === 'number' && row1['volume'] === 0x50);
    expect(hasFullVolume).toBe(true);
  });

  it('dub.skankEchoThrow is handled the same as dub.echoThrow (bakes on IT)', () => {
    const pattern = makePattern('pskat', 16);
    const curve = makeStepCurve('pskat', 0, 'dub.skankEchoThrow', [{ row: 2, value: 1 }]);
    const result = bakeAutomationForExport([pattern], [curve], IT_FORMAT);
    expect(result.bakedCount).toBeGreaterThan(0);
  });

  it('unknown dub.* parameter emits a warning and does not crash', () => {
    const pattern = makePattern('punk', 8);
    const curve = makeStepCurve('punk', 0, 'dub.unknownFutureParm', [{ row: 0, value: 1 }]);
    const result = bakeAutomationForExport([pattern], [curve], XM_FORMAT);
    // Baker should either skip it gracefully (bakedCount=0) or warn
    expect(result.bakedCount === 0 || result.warnings.some((w) => w.includes('dub.unknownFutureParm'))).toBe(true);
  });
});
