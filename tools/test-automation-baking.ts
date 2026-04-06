#!/usr/bin/env npx tsx
/**
 * Test the live automation baking system end-to-end without browser.
 *
 * Verifies:
 *   1. syncCurveToCells writes effect commands to pattern cells
 *   2. Re-bake clears prior writes and applies new values
 *   3. AutomationBaker post-process slide optimization works
 *   4. Different formats produce different effect numbers
 */

import { syncCurveToCells, forgetAllCurveBakes } from '../src/lib/automation/syncCurveToCells';
import { bakeAutomationForExport } from '../src/lib/export/AutomationBaker';
import type { FormatConstraints } from '../src/lib/formatCompatibility';
import type { AutomationCurve } from '../src/types/automation';
import type { Pattern, TrackerCell } from '../src/types/tracker';

// Inline format constraints to avoid pulling in store dependencies
const FORMAT_LIMITS: Record<string, FormatConstraints> = {
  MOD: {
    name: 'MOD', maxChannels: 8, maxPatterns: 64, maxPatternLength: 64,
    maxInstruments: 31, maxPositions: 128, maxSampleSize: 131070,
    sampleBitDepth: [8], supportsPanning: false, supportsEnvelopes: false,
    supportsGroove: false, bpmRange: [32, 255], speedRange: [1, 31],
  },
  XM: {
    name: 'XM', maxChannels: 32, maxPatterns: 256, maxPatternLength: 256,
    maxInstruments: 128, maxPositions: 256, maxSampleSize: Infinity,
    sampleBitDepth: [8, 16], supportsPanning: true, supportsEnvelopes: true,
    supportsGroove: false, bpmRange: [32, 255], speedRange: [1, 31],
  },
  IT: {
    name: 'IT', maxChannels: 64, maxPatterns: 200, maxPatternLength: 200,
    maxInstruments: 99, maxPositions: 256, maxSampleSize: Infinity,
    sampleBitDepth: [8, 16], supportsPanning: true, supportsEnvelopes: true,
    supportsGroove: true, bpmRange: [32, 255], speedRange: [1, 255],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmptyCell(): TrackerCell {
  return {
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  };
}

function makeEmptyPattern(id: string, length: number, channels: number): Pattern {
  return {
    id,
    name: `Pattern ${id}`,
    length,
    channels: Array.from({ length: channels }, () => ({
      rows: Array.from({ length }, makeEmptyCell),
    })),
  } as Pattern;
}

function makeRampCurve(id: string, patternId: string, ch: number, param: string, length: number): AutomationCurve {
  return {
    id, patternId, channelIndex: ch, parameter: param,
    mode: 'curve', interpolation: 'linear', enabled: true,
    points: [
      { row: 0, value: 0 },
      { row: length - 1, value: 1 },
    ],
  };
}

let pass = 0;
let fail = 0;
function test(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n── Test 1: syncCurveToCells writes volume column on XM ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);
  const result = syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);

  test('returned changed=true', result.changed);
  test('wrote 64 rows', result.rowsWritten === 64, `got ${result.rowsWritten}`);

  const ch0 = pattern.channels[0].rows;
  test('row 0 has vol col set 0 (0x10)', ch0[0].volume === 0x10, `got 0x${ch0[0].volume.toString(16)}`);
  // Linear ramp 0..1 over rows 0..63: row 32 = 32/63 ≈ 0.508 → vol 33 → 0x31
  test('row 32 has vol col ~set 33 (0x31)', ch0[32].volume === 0x31, `got 0x${ch0[32].volume.toString(16)}`);
  test('row 63 has vol col set 64 (0x50)', ch0[63].volume === 0x50, `got 0x${ch0[63].volume.toString(16)}`);
  test('effect column untouched', ch0[0].effTyp === 0 && ch0[0].eff === 0);
}

console.log('\n── Test 2: syncCurveToCells writes Cxx effect on MOD (no vol col) ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);
  const result = syncCurveToCells(curve, pattern, FORMAT_LIMITS.MOD);

  test('returned changed=true', result.changed);
  const ch0 = pattern.channels[0].rows;
  test('row 0 has Cxx 0', ch0[0].effTyp === 12 && ch0[0].eff === 0);
  // Linear ramp 0..1 over rows 0..63: row 32 = 32/63 ≈ 0.508 → vol 33
  test('row 32 has Cxx ~33', ch0[32].effTyp === 12 && ch0[32].eff === 33, `got eff=${ch0[32].eff}`);
  test('row 63 has Cxx 64', ch0[63].effTyp === 12 && ch0[63].eff === 64);
  test('volume column untouched (MOD has none)', ch0[0].volume === 0);
}

console.log('\n── Test 3: re-bake clears prior writes ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);
  syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);
  // First bake: row 0 = 0x10, row 63 = 0x50

  // Reduce points to a flat curve at value 0.25
  curve.points = [{ row: 0, value: 0.25 }, { row: 63, value: 0.25 }];
  syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);

  const ch0 = pattern.channels[0].rows;
  // After re-bake, row 0 should be set vol 16 (0x20), and row 63 should also be 0x20
  test('row 0 re-baked to 0x20', ch0[0].volume === 0x20, `got 0x${ch0[0].volume.toString(16)}`);
  test('row 63 re-baked to 0x20', ch0[63].volume === 0x20, `got 0x${ch0[63].volume.toString(16)}`);
}

console.log('\n── Test 4: removing curve clears cells ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);
  syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);
  // All 64 rows have volume set

  // "Remove" the curve by disabling it
  curve.enabled = false;
  const result = syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);
  test('changed=true after disable', result.changed);

  const ch0 = pattern.channels[0].rows;
  test('row 0 cleared', ch0[0].volume === 0);
  test('row 32 cleared', ch0[32].volume === 0);
  test('row 63 cleared', ch0[63].volume === 0);
}

console.log('\n── Test 5: manual edit in different slot is preserved ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);

  // User has manual 8xx panning in effect col 1 of row 5
  pattern.channels[0].rows[5].effTyp = 8;
  pattern.channels[0].rows[5].eff = 0x80;

  syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);

  const ch0 = pattern.channels[0].rows;
  test('row 5 still has manual 8xx effect', ch0[5].effTyp === 8 && ch0[5].eff === 0x80);
  test('row 5 also has baked vol column', ch0[5].volume >= 0x10);
}

console.log('\n── Test 6: bakeAutomationForExport with slide optimization ──');
{
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);
  const result = bakeAutomationForExport([pattern], [curve], FORMAT_LIMITS.XM);

  test('bakedCount=1', result.bakedCount === 1);
  const ch0 = result.patterns[0].channels[0].rows;

  // Row 0 should be set vol (0x10), rows 1-63 should be fine slide up by 1 (0x91)
  test('row 0 = set vol 0 (0x10)', ch0[0].volume === 0x10);
  test('row 1 = fine slide up 1 (0x91)', ch0[1].volume === 0x91, `got 0x${ch0[1].volume.toString(16)}`);
  test('row 63 = fine slide up 1 (0x91)', ch0[63].volume === 0x91, `got 0x${ch0[63].volume.toString(16)}`);

  const slideOptWarn = result.warnings.find(w => w.includes('Optimized'));
  test('warning reports optimization', !!slideOptWarn, slideOptWarn);
}

console.log('\n── Test 7: MOD effect column slide optimization ──');
{
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.volume', 64);
  const result = bakeAutomationForExport([pattern], [curve], FORMAT_LIMITS.MOD);

  const ch0 = result.patterns[0].channels[0].rows;
  test('row 0 = Cxx 0 (effect 12, param 0)', ch0[0].effTyp === 12 && ch0[0].eff === 0);
  // Rows 1-63 should be EAx (effect 14, param 0xA1) — fine vol slide up 1
  test('row 1 = EAx fine vol up 1', ch0[1].effTyp === 14 && ch0[1].eff === 0xA1, `got eff=${ch0[1].effTyp}/${ch0[1].eff?.toString(16)}`);
  test('row 63 = EAx fine vol up 1', ch0[63].effTyp === 14 && ch0[63].eff === 0xA1);
}

console.log('\n── Test 8: panning curve writes 8xx ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'fur.0.panning', 64);
  syncCurveToCells(curve, pattern, FORMAT_LIMITS.XM);

  const ch0 = pattern.channels[0].rows;
  test('row 0 has 8xx 0', ch0[0].effTyp === 8 && ch0[0].eff === 0);
  test('row 32 has 8xx ~0x80 (center)', ch0[32].effTyp === 8 && Math.abs(ch0[32].eff - 0x80) < 5);
  test('row 63 has 8xx 255', ch0[63].effTyp === 8 && ch0[63].eff === 0xFF);
}

console.log('\n── Test 9: cutoff curve writes Zxx on IT (not MOD) ──');
{
  forgetAllCurveBakes();
  const pattern = makeEmptyPattern('p1', 64, 4);
  const curve = makeRampCurve('c1', 'p1', 0, 'cutoff', 64);
  syncCurveToCells(curve, pattern, FORMAT_LIMITS.IT);

  const ch0 = pattern.channels[0].rows;
  test('IT: row 0 has Zxx 0 (effect 26)', ch0[0].effTyp === 26 && ch0[0].eff === 0);
  test('IT: row 63 has Zxx 0x7F', ch0[63].effTyp === 26 && ch0[63].eff === 0x7F);

  // Now test on MOD (should not write anything)
  forgetAllCurveBakes();
  const pattern2 = makeEmptyPattern('p2', 64, 4);
  syncCurveToCells({ ...curve, patternId: 'p2' }, pattern2, FORMAT_LIMITS.MOD);
  test('MOD: cutoff not bakeable, row 0 untouched', pattern2.channels[0].rows[0].effTyp === 0);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n── Summary ──`);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
