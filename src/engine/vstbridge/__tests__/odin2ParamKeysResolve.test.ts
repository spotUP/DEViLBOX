// @vitest-environment node
/**
 * Every Odin2 parameter key outside the editor (NKS knob map, declarative panel layout) must be a real
 * parameter NAME of the Odin2 engine, read from the WASM itself (the same names Odin2Controls looks up
 * through getParams()). The pre-native keys (filter1Freq, masterVol, amp_attack ...) do not resolve.
 */
import { describe, it, expect } from 'vitest';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import { ODIN2_LAYOUT } from '@/constants/synthLayouts/odin2';
import { createOdin2, parameterIds, ODIN2_WASM_PRESENT } from '../../../../tools/lib/odin2Wasm';

describe.skipIf(!ODIN2_WASM_PRESENT)('Odin2 parameter keys reach real engine parameters', () => {
  it('NKS ids and layout keys are engine parameter names', async () => {
    const names = new Set(parameterIds(await createOdin2()).keys());
    expect(names.size).toBeGreaterThan(200);

    const nks = getNKSParametersForSynth('Odin2').map((p) => p.id.split('.').pop()!);
    expect(nks.length).toBeGreaterThan(0);
    const layoutKeys = (ODIN2_LAYOUT.sections ?? []).flatMap((s) => s.controls)
      .map((c) => ('key' in c ? String(c.key) : ''))
      .filter((k) => k.startsWith('parameterValues.'))
      .map((k) => k.slice('parameterValues.'.length));
    expect(layoutKeys.length).toBeGreaterThan(0);

    expect([...nks, ...layoutKeys].filter((k) => !names.has(k))).toEqual([]);
  });
});
