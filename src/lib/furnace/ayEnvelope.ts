/**
 * AY-3-8910 / YM2149 / YM2610 SSG envelope generator shapes (register 13).
 *
 * Bits: 0 hold, 1 alternate, 2 attack, 3 continue. One period is one ramp of
 * 16 levels. Without continue the level drops to 0 after the first ramp; with
 * hold it stays at the level the alternate bit picks; otherwise the ramp
 * repeats, flipping direction each period when alternate is set.
 */

/** Level (0 low, 1 high) at each period boundary over `periods` periods; ramps are linear between points. */
export function ayEnvelopePoints(shape: number, periods = 3): Array<[number, number]> {
  const hold = (shape & 1) !== 0;
  const alternate = (shape & 2) !== 0;
  const attack = (shape & 4) !== 0;
  const cont = (shape & 8) !== 0;
  const start = attack ? 0 : 1;
  const pts: Array<[number, number]> = [[0, start], [1, 1 - start]];
  if (!cont || hold) {
    const rest = !cont ? 0 : alternate ? start : 1 - start;
    // A jump from the ramp end to the held level happens at the period boundary.
    pts.push([1, rest], [periods, rest]);
    return pts;
  }
  let up = attack;
  for (let p = 1; p < periods; p++) {
    if (alternate) up = !up;
    const from = up ? 0 : 1;
    pts.push([p, from], [p + 1, 1 - from]);
  }
  return pts;
}
