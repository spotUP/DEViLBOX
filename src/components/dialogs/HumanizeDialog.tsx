/**
 * HumanizeDialog - Dialog for adding random variations to a selection
 * Adds human feel by randomizing volume values
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTrackerStore } from '@stores';

interface HumanizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HumanizeDialog: React.FC<HumanizeDialogProps> = ({ isOpen, onClose }) => {
  const { selection, humanizeSelection } = useTrackerStore();
  const [volumeVariation, setVolumeVariation] = useState(15);

  const handleApply = () => {
    if (!selection) {
      alert('Please select a region first (Alt+Arrow keys to select)');
      return;
    }

    humanizeSelection(volumeVariation);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-text-primary">Humanize Selection</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-text-muted">
            Add random variation to volume values to create a more human feel.
          </p>

          {/* Volume variation slider */}
          <div>
            <label className="block text-xs text-text-muted mb-2">
              Volume Variation: <span className="text-accent-primary font-mono">{volumeVariation}%</span>
            </label>
            <input
              type="range"
              value={volumeVariation}
              onChange={(e) => setVolumeVariation(parseInt(e.target.value))}
              min={0}
              max={50}
              className="w-full accent-accent-primary"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>0% (none)</span>
              <span>50% (max)</span>
            </div>
          </div>

          {/* Preview text */}
          <div className="bg-dark-bg rounded p-3 text-xs text-text-secondary">
            <p>Each note's volume will be randomly adjusted by up to ±{volumeVariation}% of its current value.</p>
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
