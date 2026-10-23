/**
 * Some WAM effect plugins (the WAM Graphic Equalizer at least) ship a
 * `status` setter that is the only code that sets their internal dry gain to 0,
 * but start with `isEnabled = true` and both internal dry and wet gains at 1.
 * The setter returns early when the value does not change, so a plugin that is
 * never toggled passes its dry signal AND its wet signal, which is double the
 * level (+6.02 dB with flat bands) and comb-filters once a band moves.
 *
 * DEViLBOX does its own dry/wet mixing around the plugin, so the plugin must
 * run fully "on": wet 1, internal dry 0. Drive the plugin's own enable path
 * once after init instead of poking its private gain nodes.
 */
export interface StatusEnabledNode {
  isEnabled?: boolean;
  status?: boolean;
}

export function engageWamPluginStatus(node: unknown): boolean {
  const n = node as StatusEnabledNode | null | undefined;
  if (!n || typeof n !== 'object') return false;
  // Only plugins that expose the enabled flag and a status setter are affected.
  if (n.isEnabled !== true || !('status' in n)) return false;
  // The setter returns early when the value is unchanged: flip the flag
  // (a public field) so the enable path really runs and sets dry to 0.
  n.isEnabled = false;
  n.status = true;
  return true;
}
