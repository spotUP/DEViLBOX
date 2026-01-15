/**
 * InterpolateDialog - Dialog for interpolating values in a selection
 * Allows setting start/end values and column type for linear interpolation
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTrackerStore } from '@stores';

interface InterpolateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type InterpolateColumn = 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan';

const COLUMN_OPTIONS: { value: InterpolateColumn; label: string; min: number; max: number }[] = [
  { value: 'volume', label: 'Volume', min: 0, max: 64 },
  { value: 'cutoff', label: 'Cutoff', min: 0, max: 127 },
  { value: 'resonance', label: 'Resonance', min: 0, max: 127 },
  { value: 'envMod', label: 'Env Mod', min: 0, max: 127 },
  { value: 'pan', label: 'Pan', min: -100, max: 100 },
];

export const InterpolateDialog: React.FC<InterpolateDialogProps> = ({ isOpen, onClose }) => {
  const { selection, interpolateSelection } = useTrackerStore();
  const [column, setColumn] = useState<InterpolateColumn>('volume');
  const [startValue, setStartValue] = useState(64);
  const [endValue, setEndValue] = useState(0);

  const selectedColumnInfo = COLUMN_OPTIONS.find(c => c.value === column)!;

  const handleApply = () => {
    if (!selection) {
      alert('Please select a region first (Alt+Arrow keys to select)');
      return;
    }

    interpolateSelection(column, startValue, endValue);
    onClose();
  };

  const handleColumnChange = (newColumn: InterpolateColumn) => {
    setColumn(newColumn);
    const info = COLUMN_OPTIONS.find(c => c.value === newColumn)!;
    // Reset values to sensible defaults for the new column
    if (newColumn === 'pan') {
      setStartValue(-100);
      setEndValue(100);
    } else {
      setStartValue(info.max);
      setEndValue(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-text-primary">Interpolate Selection</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Column selector */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Column</label>
            <select
              value={column}
              onChange={(e) => handleColumnChange(e.target.value as InterpolateColumn)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {COLUMN_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Start value */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Start Value ({selectedColumnInfo.min} - {selectedColumnInfo.max})
            </label>
            <input
              type="number"
              value={startValue}
              onChange={(e) => setStartValue(Math.max(selectedColumnInfo.min, Math.min(selectedColumnInfo.max, parseInt(e.target.value) || 0)))}
              min={selectedColumnInfo.min}
              max={selectedColumnInfo.max}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* End value */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              End Value ({selectedColumnInfo.min} - {selectedColumnInfo.max})
            </label>
            <input
              type="number"
              value={endValue}
              onChange={(e) => setEndValue(Math.max(selectedColumnInfo.min, Math.min(selectedColumnInfo.max, parseInt(e.target.value) || 0)))}
              min={selectedColumnInfo.min}
              max={selectedColumnInfo.max}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* Selection info */}
          {!selection && (
            <p className="text-xs text-accent-warning">
              No selection active. Use Alt+Arrow keys to select a region.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selection}
            className="px-4 py-2 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
