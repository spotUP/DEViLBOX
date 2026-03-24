/**
 * ScaleVolumeDialog - FT2-style volume scaling
 *
 * Multiplies all volume values in a scope by a factor
 */

import React, { useState } from 'react';

interface ScaleVolumeDialogProps {
  scope: 'block' | 'track' | 'pattern';
  onConfirm: (factor: number) => void;
  onCancel: () => void;
}

export const ScaleVolumeDialog: React.FC<ScaleVolumeDialogProps> = ({
  scope,
  onConfirm,
  onCancel,
}) => {
  const [factor, setFactor] = useState(1.0);

  const handleConfirm = () => {
    onConfirm(factor);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-dark-bg border border-dark-border rounded-lg shadow-xl p-6 min-w-[400px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h3 className="text-lg font-semibold mb-4 text-text-primary">
          Scale Volume ({scope})
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Scale Factor
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={factor}
                onChange={(e) => setFactor(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-blue-500"
                autoFocus
              />
              <span className="text-text-primary font-mono text-sm w-20 text-right">
                {factor.toFixed(2)}× ({Math.round(factor * 100)}%)
              </span>
            </div>
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>0× (silence)</span>
              <span>1× (unchanged)</span>
              <span>2× (double)</span>
            </div>
          </div>

          <div className="bg-dark-bgSecondary border border-dark-border rounded p-3 text-xs text-text-secondary">
            <p className="mb-1">
              <strong className="text-text-secondary">Tip:</strong> Scale volume multiplies all volume values by the factor.
            </p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>0.5× = half volume (50%)</li>
              <li>1.0× = no change (100%)</li>
              <li>2.0× = double volume (200%, clamped to max)</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-bgSecondary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
          >
            Cancel <span className="text-text-muted">(Esc)</span>
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-text-primary bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Apply <span className="opacity-75">(Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
