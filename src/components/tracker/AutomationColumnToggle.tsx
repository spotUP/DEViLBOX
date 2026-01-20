import React from 'react';
import type { ColumnVisibility } from '@typedefs';

interface AutomationColumnToggleProps {
  columnVisibility: ColumnVisibility;
  onToggle: (column: keyof ColumnVisibility) => void;
}

export const AutomationColumnToggle: React.FC<AutomationColumnToggleProps> = ({
  columnVisibility,
  onToggle,
}) => {
  const columns: Array<{ key: keyof ColumnVisibility; label: string }> = [
    { key: 'cutoff', label: 'Cutoff (CUT)' },
    { key: 'resonance', label: 'Resonance (RES)' },
    { key: 'envMod', label: 'Env Mod (ENV)' },
    { key: 'pan', label: 'Pan (PAN)' },
  ];

  return (
    <div className="automation-column-toggle bg-ft2-window border border-ft2-border rounded p-4">
      <h3 className="text-ft2-text font-mono text-sm font-bold mb-2">Automation Columns</h3>
      <div className="space-y-2">
        {columns.map((column) => (
          <label key={column.key} className="flex items-center gap-2 text-xs font-mono text-ft2-text cursor-pointer">
            <input
              type="checkbox"
              checked={columnVisibility[column.key]}
              onChange={() => onToggle(column.key)}
              className="w-4 h-4"
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 text-xs font-mono text-ft2-textDim">
        Automation columns display per-row parameter values (00-FF hex).
        Values are interpolated during playback and applied to synth parameters.
      </div>
    </div>
  );
};
