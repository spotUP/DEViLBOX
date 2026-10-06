/**
 * The human-readable format name for a loaded UADE module. Some eagleplayers
 * report an empty format name (Professional Sound Artists: the sweep row has
 * player "Professional Sound Artist", formatName ""), which the app showed as
 * "Unknown" for a module that plays. The player's own name is the better label;
 * "Unknown" only when UADE reports neither.
 */
export function uadeFormatLabel(formatName: string | undefined, player: string | undefined): string {
  return formatName || player || 'Unknown';
}
