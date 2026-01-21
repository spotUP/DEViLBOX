/**
 * MacroSlotsPanel - FT2-style macro slots for rapid data entry
 *
 * Displays and manages 8 quick-entry macro slots
 */

import React from 'react';
import { useTrackerStore } from '@stores/useTrackerStore';

export const MacroSlotsPanel: React.FC = () => {
  const macroSlots = useTrackerStore((state) => state.macroSlots);
  const writeMacroSlot = useTrackerStore((state) => state.writeMacroSlot);
  const readMacroSlot = useTrackerStore((state) => state.readMacroSlot);

  const formatCellValue = (value: string | number | null): string => {
    if (value === null || value === undefined) return '..';
    if (typeof value === 'string') return value;
    return value.toString(16).padStart(2, '0').toUpperCase();
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-neutral-100">Macro Slots</h4>
        <span className="text-xs text-neutral-500">FT2-Style Quick Entry</span>
      </div>

      <div className="space-y-2">
        {macroSlots.map((slot, index) => {
          const isEmpty = slot.note === null &&
                          slot.instrument === null &&
                          slot.volume === null &&
                          slot.effect === null &&
                          slot.effect2 === null;

          return (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-750 transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 bg-neutral-700 border border-neutral-600 rounded text-xs font-bold text-neutral-300">
                {index + 1}
              </div>

              <div className="flex-1 font-mono text-xs text-neutral-300 flex items-center gap-1">
                <span className={slot.note ? 'text-blue-400' : 'text-neutral-600'}>
                  {slot.note || '...'}
                </span>
                <span className={slot.instrument !== null ? 'text-green-400' : 'text-neutral-600'}>
                  {formatCellValue(slot.instrument)}
                </span>
                <span className={slot.volume !== null ? 'text-yellow-400' : 'text-neutral-600'}>
                  {formatCellValue(slot.volume)}
                </span>
                <span className={slot.effect ? 'text-purple-400' : 'text-neutral-600'}>
                  {slot.effect || '...'}
                </span>
                <span className={slot.effect2 ? 'text-pink-400' : 'text-neutral-600'}>
                  {slot.effect2 || '...'}
                </span>
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => writeMacroSlot(index)}
                  className="px-2 py-1 text-xs font-medium text-neutral-300 bg-neutral-700 border border-neutral-600 rounded hover:bg-neutral-600 transition-colors"
                  title={`Write current cell to slot ${index + 1} (Ctrl+Shift+${index + 1})`}
                >
                  Write
                </button>
                <button
                  onClick={() => readMacroSlot(index)}
                  disabled={isEmpty}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={`Paste macro slot ${index + 1} (Ctrl+${index + 1})`}
                >
                  Read
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-neutral-800/50 border border-neutral-700 rounded text-xs text-neutral-400">
        <div className="font-semibold text-neutral-300 mb-2">Keyboard Shortcuts:</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <kbd className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-600 rounded font-mono text-neutral-300">
              Ctrl+1-8
            </kbd>
            <span>Read macro slot 1-8</span>
          </div>
          <div className="flex justify-between">
            <kbd className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-600 rounded font-mono text-neutral-300">
              Ctrl+Shift+1-8
            </kbd>
            <span>Write current cell to slot 1-8</span>
          </div>
        </div>
        <p className="mt-2 text-neutral-500">
          Macros store cell data for quick entry. Perfect for repeated patterns!
        </p>
      </div>
    </div>
  );
};
