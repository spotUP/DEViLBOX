/**
 * Column tracks of the instrument list. Every row of one list renders the same
 * template, so slot, icon, name, badges, status and actions line up row to row
 * and at any panel width (like the tracker's own columns) instead of following
 * whatever each row's content happens to need.
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
  /** Width of one action button, in rem. */
  actionSlotRem?: number;
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
      case 'type': return '4.5rem';
      case 'channel': return '3rem';
      case 'role': return '4.25rem';
      case 'status': return '5rem';
      case 'loop': return '2rem';
      case 'actions': return `${(i.actionSlots * (i.actionSlotRem ?? 1)).toFixed(2)}rem`;
    }
  }).join(' ');
}
