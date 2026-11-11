/**
 * Invariant: FurnaceConfig.operators has ONE order across parser, encoder and register mapper:
 * Furnace storage order, where operators[j] is written to slot offset opOffs[j] = 0x00, 0x04,
 * 0x08, 0x0C (third-party/furnace-master/src/engine/platform/fmshared_OPN.h and genesis.cpp:
 * `state.op[j]` written at `chanOffs|opOffs[j]`). `orderedOps` only translates user-facing
 * effect operator numbers; it is not applied when committing the patch.
 */
import { describe, it, expect } from 'vitest';
import { FurnaceRegisterMapper } from '@lib/import/formats/FurnaceRegisterMapper';
import { FurnaceChipType } from '@engine/chips/FurnaceChipEngine';
import { getDefaultFurnaceConfig } from '@engine/factories/furnaceDefaultConfig';
import type { FurnaceConfig } from '@typedefs/instrument';

const FURNACE_OPN_SLOT_OFFSETS = [0x00, 0x04, 0x08, 0x0c];

describe('Furnace operator order: one order across parser, encoder, mapper', () => {
  const mappers = ['mapOPN2', 'mapOPNA', 'mapOPN', 'mapOPNB'] as const;
  const chipFor = { mapOPN2: 'FurnaceOPN', mapOPNA: 'FurnaceOPN', mapOPN: 'FurnaceOPN', mapOPNB: 'FurnaceOPN' } as const;

  it.each(mappers)('%s writes operators[j] to slot offset opOffs[j] (Furnace genesis.cpp)', (name) => {
    const base = getDefaultFurnaceConfig(chipFor[name]) as FurnaceConfig | undefined;
    expect(base).toBeDefined();
    const config: FurnaceConfig = {
      ...(base as FurnaceConfig),
      chipType: name === 'mapOPNB' ? FurnaceChipType.OPNB : (base as FurnaceConfig).chipType,
      operators: [10, 20, 30, 40].map((tl) => ({ ...(base as FurnaceConfig).operators[0], tl })),
    };
    const writes = new Map<number, number>();
    const engine = { write: (_chip: number, reg: number, val: number) => { writes.set(reg & 0xff, val); } };
    FurnaceRegisterMapper[name](engine as never, 0, config);
    // TL registers sit at 0x40..0x4F; the lowest one is slot 0 of this channel.
    const tlRegs = [...writes.keys()].filter((r) => r >= 0x40 && r <= 0x4f).sort((a, b) => a - b);
    const slot0 = tlRegs[0];
    expect(tlRegs.length).toBe(4);
    FURNACE_OPN_SLOT_OFFSETS.forEach((slot, j) => {
      expect(writes.get(slot0 + slot), `${name}: operators[${j}].tl must land at slot 0x${slot.toString(16)}`).toBe(config.operators[j].tl);
    });
  });
});
