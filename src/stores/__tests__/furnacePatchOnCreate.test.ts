/**
 * An instrument created with only a name and a Furnace chip type (the AI
 * composer's create_instrument, the MCP bridge, any loader) must carry a chip
 * patch. Without one the engine uploads nothing to the chip and the editor has
 * nothing to show.
 */
import { describe, expect, it } from 'vitest';
import { buildInstrumentConfig } from '../useInstrumentStore';

describe('buildInstrumentConfig on a Furnace chip type', () => {
  it('gives a Neo Geo instrument created without a patch the chip default with four full operators', () => {
    const inst = buildInstrumentConfig(1, { name: 'Bass', synthType: 'FurnaceOPNB' });
    expect(inst.furnace?.chipType).toBe(14);
    expect(inst.furnace?.operators).toHaveLength(4);
    for (const op of inst.furnace?.operators ?? []) {
      expect(typeof op.tl).toBe('number');
      expect(typeof op.ar).toBe('number');
      expect(typeof op.mult).toBe('number');
    }
  });

  it('matches the chip type to the synth type (YM2610B is 48, OPL plays two operators)', () => {
    expect(buildInstrumentConfig(1, { synthType: 'FurnaceOPNBB' }).furnace?.chipType).toBe(48);
    const opl = buildInstrumentConfig(1, { synthType: 'FurnaceOPL' }).furnace;
    expect(opl?.chipType).toBe(2);
    expect(opl?.operators).toHaveLength(2);
  });

  it('keeps the fields a caller gives and fills the rest of each operator', () => {
    const inst = buildInstrumentConfig(1, {
      synthType: 'FurnaceOPNB',
      furnace: { algorithm: 2, feedback: 7, operators: [{ tl: 11 }, { mult: 5 }, {}, { rr: 3 }] },
    });
    const patch = inst.furnace;
    expect(patch?.chipType).toBe(14);
    expect(patch?.algorithm).toBe(2);
    expect(patch?.feedback).toBe(7);
    expect(patch?.operators.map((op) => op.tl)[0]).toBe(11);
    expect(patch?.operators[1].mult).toBe(5);
    expect(patch?.operators[3].rr).toBe(3);
    expect(typeof patch?.operators[2].ar).toBe('number');
    expect(typeof patch?.operators[0].ar).toBe('number');
  });

  it('gives no chip patch to an instrument that is not a Furnace chip', () => {
    expect(buildInstrumentConfig(1, { synthType: 'Synth' }).furnace).toBeUndefined();
  });
});
