// Wave-RAM comparison for tools/pce-rom-check.ts (kept apart so a test can import it without running the check).

export type PsgWrite = { tick: number; reg: number; val: number };

/** A 32-sample wave in a phase-free form: its lexicographically smallest rotation. Furnace's anti-click writes the
 * wave starting at the predicted play position (pce.cpp updateWave), HuSIC writes it from sample 0; same timbre. */
export function canonWave(w: number[]): string {
  let best = w;
  for (let r = 1; r < w.length; r++) {
    const c = [...w.slice(r), ...w.slice(0, r)];
    const k = c.findIndex((v, i) => v !== best[i]);
    if (k >= 0 && c[k] < best[k]) best = c;
  }
  return best.join(',');
}

/** Complete 32-sample waveforms (reg 6) that a channel then plays: loaded when reg 4 turns the channel on with volume > 0.
 * Waves overwritten before they sound (driver boot fill, Furnace's start-up clear) are not counted. */
export function heardWaves(ws: PsgWrite[]): Set<string> {
  const buf = new Map<number, number[]>(), loaded = new Map<number, string>(), out = new Set<string>();
  let sel = 0;
  for (const { reg, val } of ws) {
    if (reg === 0) sel = val & 7;
    else if (reg === 6) {
      const b = buf.get(sel) ?? [];
      b.push(val & 31);
      if (b.length === 32) { loaded.set(sel, canonWave(b)); b.length = 0; }
      buf.set(sel, b);
    } else if (reg === 4) {
      buf.set(sel, []);
      const w = loaded.get(sel);
      if (w && (val & 0xc0) === 0x80 && (val & 31) > 0) out.add(w);
    }
  }
  return out;
}
