/**
 * The drums lane of tools/hiphop.py _render_song / render_section (plan 2026-10-19 O6e-w): the song's bars played into
 * one drums buffer per section, before trim_drums_to_peak and the drum bus (those are songMix's).
 *
 * What the host does, kept as it is: the bank is built once from the SONG seed (drum_bank, snare accent, snare ghost).
 * The hat pool and its ProbabilityMemory are built ONCE PER SECTION from the section seed (bseed: the song seed, advanced
 * by each section's bars; the params.section fast path plays one section at the song seed) and shared by its bars. Bar b
 * renders with seed bseed + b, which the record also carries as hit_seed (asserted, not trusted). A bar whose drop layer
 * is "drums" renders nothing, and a section whose drums layer is off (arrangement row, stem, breakdown fast path) stays
 * all zeros. MIX_GAINS.drums is applied as the host adds each bar in, so the lane equals the host's drums_buf bit for bit.
 */
import type { BarEvents } from '@/lib/uprough/barEvents';
import { songDrumBank, type HipHopStyle } from './drumBank';
import { ProbabilityMemory, buildHatPool } from './hatPath';
import { MIX_GAINS } from './mix/songMix';
import { renderDrumBar, type BarEventInput } from './renderDrumBar';

/** The hat_pool_size knob of hiphop._apply_params (STYLES[style]["phrase"]); a song file does not carry it. */
export const DEFAULT_HAT_POOL_SIZE = 8;

export interface SongDrumsOptions { hatPoolSize?: number }

/** The layers a section plays: the arrangement row, the params.section fast path, then params.stem isolates one. */
function sectionDrumsOn(events: BarEvents, index: number): boolean {
  const { section, stem } = events.params;
  if (stem) return stem === 'drums';
  if (section) return section !== 'breakdown';
  return Boolean((events.arrangement[index]![2] as { drums: number }).drums);
}

/**
 * One drums lane per section: Float64Array of bars * bar_len + rate samples, silent where the host runs no drums.
 * `bpm` is the style's tempo (the song file's song.bpm; BarEvents does not carry it).
 */
export function songDrums(events: BarEvents, bpm: number, options: SongDrumsOptions = {}): Float64Array[] {
  const style = events.params.style as HipHopStyle;
  const seed = events.params.seed as number;
  const rate = events.params.rate as number;
  const fast = Boolean(events.params.section);
  const bank = songDrumBank(style, rate, seed);
  const barLen = Math.trunc(rate * 60 / (bpm * 4)) * 16;
  const poolSize = options.hatPoolSize ?? DEFAULT_HAT_POOL_SIZE;
  const lanes: Float64Array[] = [];
  let bseed = seed;
  events.sections.forEach((section, i) => {
    const bars = section.drums.length;
    if (!fast && events.arrangement[i]![1] !== bars) throw new Error(`songDrums: section ${i} has ${bars} bars, its arrangement row ${String(events.arrangement[i]![1])}`);
    const buf = new Float64Array(bars * barLen + Math.trunc(1.0 * rate));
    if (sectionDrumsOn(events, i)) {
      const pool = buildHatPool(style, rate, bseed, poolSize);
      const pm = new ProbabilityMemory(pool.length);
      section.drums.forEach((bar, b) => {
        if (bar.hit_seed !== bseed + b) throw new Error(`songDrums: section ${i} bar ${b} records hit_seed ${bar.hit_seed}, the render seed is ${bseed + b}`);
        if (bar.drop === 'drums') return;
        const d = renderDrumBar(style, bar.dev_merged as BarEventInput[], bpm, rate, bank, bseed + b, pool, pm).buf;
        const o = b * barLen;
        for (let k = 0; k < d.length; k++) buf[o + k] += MIX_GAINS.drums * d[k]!;
      });
    }
    lanes.push(buf);
    bseed += bars;
  });
  return lanes;
}
