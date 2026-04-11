/**
 * SampleBrowserPane — Shared sidebar component for sample/waveform browsers.
 *
 * Used by 6 format-specific instrument editors (FC, FuturePlayer, HippelCoSo,
 * JamCracker, SonicArranger, TFMX) to render a toggleable sample list pane.
 * Each editor computes its own entries via useMemo and passes them here;
 * this component only handles rendering.
 */

import React from 'react';

export interface SampleBrowserEntry {
  /** Unique identifier for the entry (instrument id, sample index, etc.) */
  id: string | number;
  /** Display name for the entry */
  name: string;
  /** Optional size in bytes */
  sizeBytes?: number;
  /** Whether this entry is the currently-selected one */
  isCurrent?: boolean;
}

export interface SampleBrowserPaneProps {
  /** List of entries to display */
  entries: SampleBrowserEntry[];
  /** Called when an entry row is clicked (makes rows clickable with hover) */
  onEntryClick?: (entry: SampleBrowserEntry) => void;
  /** Header label text (default: "SAMPLES") */
  headerLabel?: string;
  /** Message shown when entries is empty (default: "No samples loaded.") */
  emptyMessage?: string;
  /** Sidebar width in pixels (default: 220) */
  width?: number;
  /** Custom renderer for each entry row. Receives the entry and returns JSX.
   *  When provided, replaces the default entry rendering entirely. */
  renderEntry?: (entry: SampleBrowserEntry) => React.ReactNode;
}

export const SampleBrowserPane: React.FC<SampleBrowserPaneProps> = ({
  entries,
  onEntryClick,
  headerLabel = 'SAMPLES',
  emptyMessage = 'No samples loaded.',
  width = 220,
  renderEntry,
}) => {
  return (
    <div
      className="flex-shrink-0 border-l border-dark-border bg-dark-bgSecondary overflow-y-auto"
      style={{ width }}
    >
      <div className="px-2 py-1 font-bold text-xs text-accent-primary border-b border-dark-border bg-dark-bgSecondary sticky top-0 z-10">
        {headerLabel} ({entries.length})
      </div>
      {entries.length === 0 && (
        <div className="p-2 text-[10px] text-text-muted italic">
          {emptyMessage}
        </div>
      )}
      {entries.map((entry) => {
        const isClickable = !!onEntryClick;
        return (
          <div
            key={entry.id}
            onClick={isClickable ? () => onEntryClick!(entry) : undefined}
            className={[
              'px-2 py-1.5 border-b border-dark-border text-[10px]',
              entry.isCurrent ? 'bg-accent-primary/10' : '',
              isClickable ? 'cursor-pointer hover:bg-accent-primary/20 transition-colors' : '',
            ].join(' ')}
            title={typeof entry.id === 'number' ? `#${entry.id}: ${entry.name}` : entry.name}
          >
            {renderEntry ? (
              renderEntry(entry)
            ) : (
              <>
                <div className={`font-mono truncate ${entry.isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
                  {entry.name}
                </div>
                {entry.sizeBytes !== undefined && entry.sizeBytes > 0 && (
                  <div className="text-text-muted mt-0.5">
                    {entry.sizeBytes} bytes
                  </div>
                )}
                {entry.isCurrent && (
                  <div className="mt-0.5 text-[9px] text-accent-primary">(this instrument)</div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
