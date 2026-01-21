/**
 * RemapInstrumentDialog - FT2-style instrument remapping
 *
 * Find and replace instrument IDs throughout patterns
 */

import React, { useState } from 'react';

interface RemapInstrumentDialogProps {
  scope: 'block' | 'track' | 'pattern' | 'song';
  onConfirm: (source: number, dest: number) => void;
  onCancel: () => void;
}

export const RemapInstrumentDialog: React.FC<RemapInstrumentDialogProps> = ({
  scope,
  onConfirm,
  onCancel,
}) => {
  const [source, setSource] = useState(0);
  const [dest, setDest] = useState(0);

  const handleConfirm = () => {
    onConfirm(source, dest);
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
          Remap Instrument ({scope})
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Source Instrument
            </label>
            <input
              type="number"
              min="0"
              max="255"
              value={source}
              onChange={(e) => setSource(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <p className="text-xs text-neutral-500 mt-1">
              Instrument ID to find (0-255)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Destination Instrument
            </label>
            <input
              type="number"
              min="0"
              max="255"
              value={dest}
              onChange={(e) => setDest(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Instrument ID to replace with (0-255)
            </p>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded p-3 text-xs text-neutral-400">
            <p className="mb-1">
              <strong className="text-neutral-300">Tip:</strong> Remap instrument replaces all occurrences of the source instrument ID with the destination ID.
            </p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li><strong className="text-neutral-300">Block:</strong> Only in selected region</li>
              <li><strong className="text-neutral-300">Track:</strong> Entire current channel</li>
              <li><strong className="text-neutral-300">Pattern:</strong> Entire current pattern</li>
              <li><strong className="text-neutral-300">Song:</strong> All patterns</li>
            </ul>
          </div>

          {source === dest && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3 text-xs text-yellow-300">
              ⚠️ Source and destination are the same - no changes will be made.
            </div>
          )}
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
            disabled={source === dest}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Remap <span className="opacity-75">(Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
