/**
 * Which INS2 blobs to put in the dispatch's instrument table before a song
 * starts, and which slot each one belongs in.
 *
 * The sequencer references instruments by index through `DIV_CMD_INSTRUMENT`,
 * so every one has to be in the table before the first row plays. The
 * pre-upload loop that did this reported `pre-uploaded 0/43` and
 * `pre-uploaded 0/26` — zero every time, for every song and every chip.
 *
 * It was reading `instrument.rawBinaryData`, and the converter puts that blob
 * on the FURNACE CONFIG (`InstrumentConverter.ts:231`), one level down. So the
 * check always saw `undefined`, nothing was pre-uploaded, and each instrument
 * instead went up lazily on its first note — which clears the synth's ready
 * flag, so that note is dropped:
 *
 *     [FurnaceDispatchSynth] triggerAttack blocked: ready=false ...
 *     [FurnaceDispatchSynth] Encoding and uploading instrument N ...
 *
 * One note lost per instrument, on the ramp-in of every song.
 *
 * Pulled out of the engine because the rule is worth stating once and testing
 * without a WASM worklet: where the blob lives, what makes it valid, and which
 * slot it goes to.
 *
 * Diagnosis of the repeating log lines came from a peer session reading the
 * same console output; the field mismatch was then confirmed in the source.
 */

/** The four magic bytes every Furnace INS2 blob starts with. */
const INS2_MAGIC = [0x49, 0x4e, 0x53, 0x32] as const;   // "INS2"

export interface Ins2Upload {
  /** The instrument index the SEQUENCER will ask for. */
  slot: number;
  data: Uint8Array;
}

/** Is this an INS2 blob the dispatch can parse? */
export function isIns2(data: ArrayLike<number> | undefined | null): boolean {
  if (!data || data.length <= 4) return false;
  return INS2_MAGIC.every((byte, i) => data[i] === byte);
}

/**
 * Shape of the instruments this reads. Deliberately loose: the song's
 * instrument type carries far more than this and none of the rest matters.
 */
interface MaybeFurnaceInstrument {
  rawBinaryData?: ArrayLike<number> | null;
  furnace?: {
    rawBinaryData?: ArrayLike<number> | null;
    /** The instrument's own index in the .fur file, 0-based. */
    furnaceIndex?: number;
  } | null;
}

/**
 * Every INS2 blob in a song, with the slot it belongs in.
 *
 * Prefers the furnace config's own `furnaceIndex` over the array position.
 * They usually agree, but the sequencer asks by the index the FILE used, and
 * an instrument list that skips or reorders would otherwise put each blob in
 * a neighbour's slot — silence or the wrong sound, which is harder to spot
 * than a missing one.
 */
export function collectIns2Uploads(instruments: readonly MaybeFurnaceInstrument[]): Ins2Upload[] {
  const out: Ins2Upload[] = [];
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    if (!inst) continue;
    // The converter writes the blob onto the furnace config; older paths put
    // it on the instrument. Read both, config first.
    const raw = inst.furnace?.rawBinaryData ?? inst.rawBinaryData;
    if (!isIns2(raw)) continue;
    const slot = inst.furnace?.furnaceIndex ?? i;
    out.push({
      slot,
      data: raw instanceof Uint8Array ? raw : new Uint8Array(Array.from(raw as ArrayLike<number>)),
    });
  }
  return out;
}
