/**
 * FadeVolumeDialog - FT2-style volume fading
 *
 * Linear interpolation of volume values across a scope
 */

import React, { useState } from 'react';

interface FadeVolumeDialogProps {
  scope: 'block' | 'track' | 'pattern';
  onConfirm: (startVol: number, endVol: number) => void;
  onCancel: () => void;
}

export const FadeVolumeDialog: React.FC<FadeVolumeDialogProps> = ({
  scope,
  onConfirm,
  onCancel,
}) => {
  const [startVol, setStartVol] = useState(64);
  const [endVol, setEndVol] = useState(0);

  const handleConfirm = () => {
    onConfirm(startVol, endVol);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl p-6 min-w-[400px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h3 className="text-lg font-semibold mb-4 text-neutral-100">
          Fade Volume ({scope})
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Start Volume
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="64"
                step="1"
                value={startVol}
                onChange={(e) => setStartVol(parseInt(e.target.value))}
                className="flex-1 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                autoFocus
              />
              <span className="text-neutral-100 font-mono text-sm w-16 text-right">
                {startVol.toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              End Volume
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="64"
                step="1"
                value={endVol}
                onChange={(e) => setEndVol(parseInt(e.target.value))}
                className="flex-1 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-neutral-100 font-mono text-sm w-16 text-right">
                {endVol.toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded p-3">
            <div className="text-xs text-neutral-400 space-y-2">
              <p>
                <strong className="text-neutral-300">Fade Direction:</strong>{' '}
                {startVol > endVol ? (
                  <span className="text-red-400">Fade out (loud → quiet)</span>
                ) : startVol < endVol ? (
                  <span className="text-green-400">Fade in (quiet → loud)</span>
                ) : (
                  <span className="text-neutral-400">No change (flat)</span>
                )}
              </p>
              <p>
                <strong className="text-neutral-300">Tip:</strong> Fade volume applies linear interpolation
                from start to end across all rows in the {scope}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-300 bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-750 transition-colors"
          >
            Cancel <span className="text-neutral-500">(Esc)</span>
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Apply <span className="opacity-75">(Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
