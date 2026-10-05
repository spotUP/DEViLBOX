/**
 * Two formats share the `.adsc` extension.
 *
 * StarTrekker AM keeps its synth parameters in `<name>.nt` and plays on the
 * native engine. Audio Sculpture — the same family, a different player —
 * keeps its samples in `<name>.as` and plays on UADE, which asks for that
 * file by name at init. The `.adsc` branch sent everything to the
 * StarTrekker parser and looked only for `.nt`, so an Audio Sculpture module
 * arrived at UADE with its `.as` dropped on the floor and UADE refused it
 * (`ret=-1`) — measured 2026-09-22 with popelich-brutalo.adsc + .adsc.as
 * through the MCP `load_file` path, companion present, none registered.
 *
 * The companion the module CAME WITH decides the route.
 */
export type AdscRoute = 'startrekker' | 'uade';

export function adscRouteFor(companionKeys: Iterable<string>): AdscRoute {
  let hasNt = false;
  let hasAs = false;
  for (const key of companionKeys) {
    const base = (key.split('/').pop() ?? key).toLowerCase();
    if (base.endsWith('.nt')) hasNt = true;
    if (base.endsWith('.as')) hasAs = true;
  }
  if (hasAs && !hasNt) return 'uade';
  return 'startrekker';
}

/**
 * A plain `.mod` that arrived WITH its `<name>.mod.nt` is a StarTrekker AM
 * module: the AM synth instruments live in the .nt, and the TS tracker engine
 * (which sees only the sample table) plays it silent. UADE's StarTrekker AM
 * player plays the pair (amsyntdemo.mod + .nt: rms 0.156, 2026-10-05). The
 * companion the module came with decides, as for `.adsc`.
 */
export function modHasStarTrekkerNt(filename: string, companionKeys: Iterable<string>): boolean {
  if (!/\.mod$/i.test(filename)) return false;
  const want = `${(filename.split('/').pop() ?? filename).toLowerCase()}.nt`;
  for (const key of companionKeys) {
    if ((key.split('/').pop() ?? key).toLowerCase() === want) return true;
  }
  return false;
}
