/**
 * Column tracks of the instrument list. The list is one grid and every row is
 * a subgrid of it, so slot, icon, name, badges, status and actions line up row
 * to row. Badge, status and action tracks are max-content: as wide as the
 * widest cell in the list and no wider (owner 2026-10-07: "very wide with lots
 * of space between the columns").
 */

export interface InstrumentColumnsInput {
  /** Names drawn as ASCII art: the name track is as wide as the widest name. */
  artMode: boolean;
  /** Longest visible name in characters; sizes the name track in art mode. */
  longestNameLength: number;
  /** Type and channel badges are shown. */
  showBadges: boolean;
  /** The song analyzer's role chip is shown. */
  hasRole: boolean;
  /** Rows show a loop marker column (the plain renderer). */
  hasLoop?: boolean;
  /** At least one row has a load failure to report. */
  hasStatus: boolean;
  /** Most action buttons any row shows; 0 when actions are off. */
  actionSlots: number;
}

export const INSTRUMENT_COLUMN_ORDER = ['slot', 'icon', 'name', 'type', 'channel', 'role', 'status', 'loop', 'actions'] as const;
export type InstrumentColumn = (typeof INSTRUMENT_COLUMN_ORDER)[number];

/** Which columns exist for this list, in order. */
export function instrumentColumns(i: InstrumentColumnsInput): InstrumentColumn[] {
  return INSTRUMENT_COLUMN_ORDER.filter((c) => {
    if (c === 'type' || c === 'channel') return i.showBadges;
    if (c === 'role') return i.showBadges && i.hasRole;
    if (c === 'status') return i.hasStatus;
    if (c === 'loop') return !!i.hasLoop;
    if (c === 'actions') return i.actionSlots > 0;
    return true;
  });
}

export function instrumentGridTemplate(i: InstrumentColumnsInput): string {
  return instrumentColumns(i).map((c): string => {
    switch (c) {
      case 'slot': return '1.75rem';
      case 'icon': return '1rem';
      case 'name': return i.artMode ? `${Math.max(8, i.longestNameLength)}ch` : 'minmax(5rem, 1fr)';
      case 'type': return 'max-content';
      case 'channel': return 'max-content';
      case 'role': return 'max-content';
      case 'status': return 'max-content';
      case 'loop': return 'max-content';
      case 'actions': return 'max-content';
    }
  }).join(' ');
}
