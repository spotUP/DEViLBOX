/**
 * FormatInfoBar - the 36 px information bar at the top of a format view (duplicated-components audit row 6):
 * the format's name and a line of song facts. Read-only: transport, export and instrument editing live in the
 * app's own surfaces, never in a format view.
 */
import React from 'react';

export interface FormatInfoBarProps {
  /** The format's full name, e.g. "Klystrack". */
  format: string;
  /** Song facts, each a full-word label and its value. */
  items: ReadonlyArray<{ label: string; value: string | number }>;
}

export const FormatInfoBar: React.FC<FormatInfoBarProps> = ({ format, items }) => (
  <div
    className="flex items-center gap-3 h-9 px-3 flex-shrink-0 border-b border-dark-border bg-dark-bgTertiary font-mono text-[11px] overflow-hidden whitespace-nowrap"
    data-format-info-bar=""
  >
    <span className="font-bold text-text-primary">{format}</span>
    {items.map(({ label, value }) => (
      <span key={label} className="text-text-muted">
        {label} <span className="text-text-secondary">{value}</span>
      </span>
    ))}
  </div>
);
