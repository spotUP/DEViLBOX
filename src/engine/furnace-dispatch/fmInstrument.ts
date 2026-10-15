/**
 * Where a Furnace FM instrument lives on the chip and what shape it has there.
 *
 * Two rules, both found by the owner's "OPL3 plays silent when I change preset":
 *
 * 1. SLOT. The dispatch keeps ONE instrument table for every chip and every
 *    synth. A user instrument had no `furnaceIndex`, so every one of them
 *    uploaded into slot 0 and the last upload won: picking a preset on one
 *    OPL3 instrument replaced the patch of every other OPL3 instrument (and
 *    of the default instrument of every other chip). A user instrument now
 *    gets its own slot above any slot a module uses.
 *
 * 2. SHAPE. An OPL or OPLL chip plays a 2-operator instrument. A preset that
 *    arrives as a 4-operator record (the default config is OPN-shaped, the
 *    preset table declared the wrong chip id) was cut down by always taking
 *    operators 0 and 2 - for an OPL-layout preset [modulator, carrier, off,
 *    off] that made the carrier a disabled operator: silence. Carrier TL 50
 *    inherited from the OPN default was the "low volume" half.
 */
import type { FurnaceConfig } from '@typedefs/instrument';

/** First slot handed to instruments made in DEViLBOX; modules use 0..N from the top of their file. */
export const USER_INSTRUMENT_SLOT_BASE = 512;

/** The slot a user-made instrument uploads into: its own, never 0. */
export function userInstrumentSlot(instrumentId: number | undefined): number {
  return USER_INSTRUMENT_SLOT_BASE + Math.max(0, instrumentId ?? 0);
}

const CHIPTYPE_OPL = 2;
const CHIPTYPE_OPLL = 11;

/**
 * The FM instrument as the chip family `chipType` can play it. Config for a
 * chip other than the family's (or with no `ops`) is reshaped; anything else is
 * returned untouched.
 */
export function fitFmToChip(config: FurnaceConfig, chipType: number | undefined): FurnaceConfig {
  if (chipType === undefined) return config;
  const foreign = config.chipType !== chipType;
  const out: FurnaceConfig = { ...config, chipType };
  if (chipType !== CHIPTYPE_OPL && chipType !== CHIPTYPE_OPLL) return foreign ? out : config;

  const ops = config.operators ?? [];
  const opnShaped = foreign && (config.ops ?? 4) === 4 && ops.length > 2 && ops[2].enabled;
  out.ops = 2;
  if (foreign && chipType === CHIPTYPE_OPL && (config.ops ?? 4) !== 2) out.algorithm = 0;
  if (ops.length >= 2) {
    out.operators = opnShaped
      // OPN order: modulators 0 and 1, carriers 2 and 3. Keep a modulator and a carrier at full level.
      ? [{ ...ops[0], tl: Math.min(ops[0].tl, 30) }, { ...ops[2], tl: 0 }]
      : [ops[0], ops[1]];
  }
  if (out.opMacros && out.opMacros.length > 2) out.opMacros = out.opMacros.slice(0, 2);
  return out;
}

/** The dispatch slot a synth built from `config` uploads into: the module's own index, else a private user slot. */
export function furnaceSlotOf(config: { id?: number; furnace?: { furnaceIndex?: number } | null }): number {
  return config.furnace?.furnaceIndex ?? userInstrumentSlot(config.id);
}
