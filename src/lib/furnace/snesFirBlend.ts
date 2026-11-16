/**
 * SNES echo filter blend: DEViLBOX-only pattern effect 38xx = blend length in rows. The taps written
 * by 30xx-37xx on the same row are then the target, and the filter steps linearly from its current
 * taps to the target, one step per row, over xx rows. Without 38xx the taps jump, as in Furnace.
 * Furnace has no 38xx (sysDef.cpp SNES table: 10-16, 18-1F, 20-23, 30-37), so there the filter jumps.
 * One implementation for playback (TrackerReplayer) and the TAD export (tadSongWriter).
 */
export const SNES_FIR_BLEND_EFFECT = 0x38;
export const SNES_FIR_TAP_EFFECT = 0x30;
export const SNES_FIR_TAP_COUNT = 8;
/** A cell has 8 effect columns; one is the blend, so at most 7 taps travel with it. */
export const SNES_FIR_BLEND_MAX_TAPS = 7;

const s8 = (v: number): number => (v > 127 ? v - 256 : v);

/** The taps after `step` of `rows` steps (step 0 = from, step rows = to), rounded to whole taps. */
export function interpolateFir(from: readonly number[], to: readonly number[], step: number, rows: number): number[] {
  const t = Math.max(0, Math.min(1, step / Math.max(1, rows)));
  return from.map((f, i) => Math.round(f + ((to[i] ?? f) - f) * t));
}

interface Blend { from: number[]; to: number[]; rows: number; step: number }

/**
 * Row-by-row filter state: feed it the 30xx-37xx / 38xx effects of a row, get the taps that change.
 * A row reaches it once per channel, each call with that channel's effects; calls with the same
 * `rowKey` are one row, so the row is re-run from its start state with every effect seen so far.
 */
export class SnesFirBlender {
  private fir: number[];
  private blend: Blend | null = null;
  private key: string | null = null;
  private start: { fir: number[]; blend: Blend | null } = { fir: [], blend: null };
  private seen: Array<{ cmd: number; val: number }> = [];

  constructor(initial: readonly number[]) { this.fir = [...initial]; }

  get taps(): readonly number[] { return this.fir; }

  /** Returns the taps that changed since the previous call, as [tap, signed value]. */
  row(rowKey: string, effects: ReadonlyArray<{ cmd: number; val: number }>): Array<[number, number]> {
    const prev = this.fir;
    if (rowKey !== this.key) {
      this.key = rowKey;
      this.start = { fir: [...this.fir], blend: this.blend && { ...this.blend } };
      this.seen = [];
    } else {
      this.fir = [...this.start.fir];
      this.blend = this.start.blend && { ...this.start.blend };
    }
    this.seen.push(...effects);
    this.step(this.seen);
    const out: Array<[number, number]> = [];
    this.fir.forEach((v, i) => { if (v !== prev[i]) out.push([i, v]); });
    return out;
  }

  private step(effects: ReadonlyArray<{ cmd: number; val: number }>): void {
    const written = new Map<number, number>();
    let rows = 0;
    for (const e of effects) {
      if (e.cmd >= SNES_FIR_TAP_EFFECT && e.cmd < SNES_FIR_TAP_EFFECT + SNES_FIR_TAP_COUNT) written.set(e.cmd - SNES_FIR_TAP_EFFECT, s8(e.val));
      else if (e.cmd === SNES_FIR_BLEND_EFFECT) rows = e.val;
    }
    if (written.size) {
      const to = [...this.fir];
      written.forEach((v, i) => { to[i] = v; });
      // A blend over 1 row is a jump; a tap write with no 38xx ends a running blend at the written value.
      this.blend = rows > 1 ? { from: [...this.fir], to, rows, step: 0 } : null;
      if (!this.blend) this.fir = to;
    }
    if (this.blend) {
      this.blend.step++;
      this.fir = interpolateFir(this.blend.from, this.blend.to, this.blend.step, this.blend.rows);
      if (this.blend.step >= this.blend.rows) this.blend = null;
    }
  }
}

/**
 * Effect columns for "Blend Here": the taps that differ from `current` first, then equal taps while
 * columns remain (a tap not written keeps whatever the song has set), then the blend length.
 * Returns null when the free columns cannot hold the changed taps plus the blend.
 */
export function firBlendEffects(current: readonly number[], target: readonly number[], rows: number, freeColumns: number): Array<{ effTyp: number; eff: number }> | null {
  const idx = target.map((_, i) => i);
  const changed = idx.filter((i) => target[i] !== current[i]);
  const same = idx.filter((i) => target[i] === current[i]);
  const room = Math.min(SNES_FIR_BLEND_MAX_TAPS, freeColumns - 1);
  if (changed.length > room) return null;
  const taps = [...changed, ...same].slice(0, room).sort((a, b) => a - b);
  return [
    ...taps.map((i) => ({ effTyp: SNES_FIR_TAP_EFFECT + i, eff: target[i] & 255 })),
    { effTyp: SNES_FIR_BLEND_EFFECT, eff: Math.max(2, Math.min(255, Math.round(rows))) },
  ];
}
