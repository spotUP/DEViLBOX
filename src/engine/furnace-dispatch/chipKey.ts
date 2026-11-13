/**
 * Dispatch chips are addressed by a key: the platform type for the first chip
 * of that type in a song, platform + slot * 0x10000 for the second, third...
 * (Furnace's disCont[] holds one dispatch per system, so a song with two
 * AY-3-8910 systems has two chips; keying by platform type alone collapsed
 * them into one and the second system played silent).
 */
export const CHIP_KEY_SLOT_SHIFT = 0x10000;

/** Keys for a song's chip list, in order: repeats of a platform get slots 1, 2... */
export function chipKeysFor(chipIds: readonly number[]): number[] {
  const seen = new Map<number, number>();
  return chipIds.map((id) => {
    const slot = seen.get(id) ?? 0;
    seen.set(id, slot + 1);
    return id + slot * CHIP_KEY_SLOT_SHIFT;
  });
}

/** The platform type a chip key stands for. */
export function chipKeyPlatform(key: number): number {
  return key % CHIP_KEY_SLOT_SHIFT;
}
