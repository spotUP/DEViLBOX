/** Rows and 50 Hz frames of one pass over a song's order list (sizes one-pass captures for the NES and ZX exports). */
import type { Pattern } from '@/types/tracker';

const FX_SPEED = 0x0F, FX_TEMPO = 0xF0, FX_BREAK = 0x0D;

/** The (type, param) pairs of one row's cells, all effect slots (Furnace notation). */
function rowEffects(patterns: Pattern, row: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const ch of patterns.channels) {
    const c = ch.rows[row] as unknown as Record<string, number | undefined> | undefined;
    if (!c) continue;
    for (const k of ['', '2', '3', '4', '5', '6', '7', '8']) out.push([c['effTyp' + k] ?? 0, c['eff' + k] ?? 0]);
  }
  return out;
}

/**
 * Rows played and 50 Hz frames of one pass over the order list. Follows 0Fxx speed changes, F0xx tempo
 * changes (tick rate = value * 2 / 5 Hz) and 0Dxx pattern breaks; `speed` and `hz` are the song's start values.
 */
export function orderPassLength(patterns: readonly Pattern[], order: readonly number[], speed: number, hz = 50): { rows: number; frames: number } {
  let rows = 0, frames = 0;
  for (const idx of order) {
    const p = patterns[idx];
    if (!p) continue;
    for (let r = 0; r < p.length; r++) {
      const fx = rowEffects(p, r);
      for (const [t, v] of fx) {
        if (t === FX_SPEED && v > 0) speed = v;
        else if (t === FX_TEMPO) hz = Math.max(1, v * 2 / 5);
      }
      rows++;
      frames += speed * 50 / hz;
      if (fx.some(([t]) => t === FX_BREAK)) break;
    }
  }
  return { rows, frames: Math.ceil(frames) };
}
