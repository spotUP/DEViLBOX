/**
 * Corpus wave bank: real wavetables harvested from the .fur / .dmf songs under
 * public/data/songs by tools/harvest-corpus-waves.ts, written to
 * public/data/wavetables/corpus-waves.json and fetched lazily by PresetBrowser.
 *
 * A wave is tagged with a chip only when the song uses that chip AND the wave's
 * size matches the chip's wave size in Furnace's sysDef.cpp. Waves that match no
 * chip in their song are left out, so no tag is guessed.
 */

/** Wave chips by Furnace/DefleMask file system id (sysDef.cpp waveWid x waveHei,
 *  height = levels); width 0 = any length in steps of 4 (N163). */
export const WAVE_CHIPS_BY_SYSTEM_ID: Record<number, { chip: string; width: number; height: number }> = {
  0x04: { chip: 'Game Boy', width: 32, height: 16 },
  0x05: { chip: 'PC Engine', width: 32, height: 32 },
  0x8a: { chip: 'FDS', width: 64, height: 64 },
  0x8c: { chip: 'N163', width: 0, height: 16 },
  0x96: { chip: 'WonderSwan', width: 32, height: 16 },
  0x9c: { chip: 'Virtual Boy', width: 32, height: 64 },
  0xa1: { chip: 'SCC', width: 32, height: 256 },
  0xb4: { chip: 'SCC+', width: 32, height: 256 },
  0xb9: { chip: 'Namco WSG', width: 32, height: 16 },
  0xba: { chip: 'Namco C15', width: 32, height: 16 },
  0xbb: { chip: 'Namco C30', width: 32, height: 16 },
};

export interface CorpusWave {
  /** "<song file name> #<wave index>" of the first song the wave was found in. */
  name: string;
  chips: string[];
  len: number;
  max: number;
  data: number[];
}

export interface HarvestWaveInput {
  /** Highest level, as Furnace stores it (wave height field = levels - 1). */
  max: number;
  data: number[];
}

/**
 * Add one song's waves to the bank. `seen` maps a wave's size+data key to its
 * bank entry, so a duplicate only adds chips it was not tagged with yet.
 */
export function harvestSongWaves(
  bank: CorpusWave[],
  seen: Map<string, CorpusWave>,
  songName: string,
  systemIds: number[],
  waves: HarvestWaveInput[],
): void {
  const chips = systemIds.map((id) => WAVE_CHIPS_BY_SYSTEM_ID[id]).filter((c) => c !== undefined);
  waves.forEach((orig, index) => {
    if (orig.max <= 0 || orig.data.length === 0 || orig.data.some((v) => v < 0 || v > orig.max)) return;
    let w = orig;
    let matching = chips
      .filter((c) => c.height === w.max + 1 && (c.width === 0 ? w.data.length % 4 === 0 : c.width === w.data.length))
      .map((c) => c.chip);
    // A wave of another size still plays on the song's only wave chip: Furnace scales it to the chip
    // (DivWaveSynth: data[i*len/width]*height/max). Keep it as the chip hears it; with two wave
    // chips in the song the wave's chip is unknown, so it is left out rather than guessed.
    if (matching.length === 0 && chips.length === 1 && chips[0].width > 0) {
      const c = chips[0];
      w = { max: c.height - 1, data: furnaceScaleWave(orig, c.width, c.height - 1) };
      matching = [c.chip];
    }
    if (matching.length === 0) return;
    const len = w.data.length;
    const max = w.max;
    const key = `${len}x${max}:${w.data.join(',')}`;
    const existing = seen.get(key);
    if (existing) {
      for (const chip of matching) if (!existing.chips.includes(chip)) existing.chips.push(chip);
      return;
    }
    const entry: CorpusWave = { name: `${songName} #${index}`, chips: [...new Set(matching)], len, max, data: [...w.data] };
    seen.set(key, entry);
    bank.push(entry);
  });
}

/** A wave scaled to a chip's wave size the way Furnace's DivWaveSynth does it when the song plays. */
export function furnaceScaleWave(w: HarvestWaveInput, width: number, height: number): number[] {
  return Array.from({ length: width }, (_, i) =>
    Math.min(height, Math.max(0, Math.trunc((w.data[Math.trunc((i * w.data.length) / width)] * height) / w.max))));
}
