/**
 * Contract test: compressor ratio bypass during echo swap.
 *
 * When the dub bus swaps echo engines (e.g. spaceEcho → re201 for King Tubby),
 * the disposal transient flows through the spring reverb and peaks at +8 dB.
 * Setting the sidechain/glue compressor threshold to 0 dB was insufficient —
 * the burst still caused 6.7 dB gain reduction at ratio 6:1, locking up
 * the compressor and killing reverb for 1-2 seconds.
 *
 * The fix: set both compressor ratios to 1 during the swap (gain_reduction =
 * (signal - threshold) × (1 - 1/ratio) = 0 when ratio = 1), then restore
 * after the warmup hold period.
 *
 * This contract test statically verifies the ratio=1 bypass pattern exists
 * in _swapEchoEngine and _warmupMute. No audio context needed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dubBusSrc = readFileSync(resolve(ROOT, 'engine/dub/DubBus.ts'), 'utf8');

/** Slice from a method definition to the next `private ` or `public ` declaration. */
function extractMethod(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start === -1) return '';
  const rest = src.slice(start);
  // Find the next method boundary (indented `private ` or `public `)
  const nextMethod = rest.slice(100).search(/\n  (private|public) /);
  return nextMethod > 0 ? rest.slice(0, nextMethod + 100) : rest;
}

const swapBody = extractMethod(dubBusSrc, 'private _swapEchoEngine(');
const warmupBody = extractMethod(dubBusSrc, 'private _warmupMute(');

describe('DubBus compressor bypass during echo swap — contract', () => {
  it('_swapEchoEngine exists', () => {
    expect(swapBody.length).toBeGreaterThan(100);
  });

  it('sets sidechain ratio to 1 in _swapEchoEngine', () => {
    expect(swapBody).toMatch(/sidechain\.ratio\.setValueAtTime\(1/);
  });

  it('sets glue ratio to 1 in _swapEchoEngine', () => {
    expect(swapBody).toMatch(/glue\.ratio\.setValueAtTime\(1/);
  });

  it('restores sidechain ratio to 10 after warmup in _swapEchoEngine', () => {
    expect(swapBody).toMatch(/sidechain\.ratio\.setTargetAtTime\(1/);
  });

  it('restores glue ratio respecting glueBypass in _swapEchoEngine', () => {
    // After our glueBypass fix the ratio is conditional: bypass ? 1 : 3.
    // Assert the pattern checks glueBypass before deciding the target ratio.
    expect(swapBody).toMatch(/glueBypass/);
    expect(swapBody).toMatch(/glue\.ratio\.setTargetAtTime/);
  });

  it('_warmupMute exists', () => {
    expect(warmupBody.length).toBeGreaterThan(100);
  });

  it('sets sidechain ratio to 1 in _warmupMute', () => {
    expect(warmupBody).toMatch(/sidechain\.ratio\.setValueAtTime\(1/);
  });

  it('sets glue ratio to 1 in _warmupMute', () => {
    expect(warmupBody).toMatch(/glue\.ratio\.setValueAtTime\(1/);
  });

  it('restores both ratios in _warmupMute (glue respects glueBypass)', () => {
    expect(warmupBody).toMatch(/sidechain\.ratio\.setTargetAtTime\(1/);
    // Glue restore is now conditional on glueBypass — assert the branch exists.
    expect(warmupBody).toMatch(/glueBypass/);
    expect(warmupBody).toMatch(/glue\.ratio\.setTargetAtTime/);
  });
});
