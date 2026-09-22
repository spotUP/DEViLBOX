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
