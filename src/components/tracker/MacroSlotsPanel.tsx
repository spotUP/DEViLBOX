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
    <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-text-primary">Macro Slots</h4>
        <span className="text-xs text-text-muted">FT2-Style Quick Entry</span>
      </div>

      <div className="space-y-2">
        {macroSlots.map((slot, index) => {
          const isEmpty = slot.note === 0 &&
                          slot.instrument === 0 &&
                          slot.volume === 0 &&
                          slot.effTyp === 0 &&
                          slot.eff === 0 &&
                          slot.effTyp2 === 0 &&
                          slot.eff2 === 0;

          return (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-dark-bgSecondary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 bg-dark-bgTertiary border border-dark-borderLight rounded text-xs font-bold text-text-secondary">
                {index + 1}
              </div>

              <div className="flex-1 font-mono text-xs text-text-secondary flex items-center gap-1">
                <span className={slot.note ? 'text-blue-400' : 'text-text-muted'}>
                  {slot.note || '...'}
                </span>
                <span className={slot.instrument !== null ? 'text-green-400' : 'text-text-muted'}>
                  {formatCellValue(slot.instrument)}
                </span>
                <span className={slot.volume !== null ? 'text-yellow-400' : 'text-text-muted'}>
                  {formatCellValue(slot.volume)}
                </span>
                <span className={slot.effTyp !== 0 || slot.eff !== 0 ? 'text-purple-400' : 'text-text-muted'}>
                  {slot.effTyp !== 0 || slot.eff !== 0
                    ? `${slot.effTyp.toString(16).toUpperCase()}${slot.eff.toString(16).padStart(2, '0').toUpperCase()}`
                    : '...'}
                </span>
                <span className={slot.effTyp2 !== 0 || slot.eff2 !== 0 ? 'text-pink-400' : 'text-text-muted'}>
                  {slot.effTyp2 !== 0 || slot.eff2 !== 0
                    ? `${slot.effTyp2.toString(16).toUpperCase()}${slot.eff2.toString(16).padStart(2, '0').toUpperCase()}`
                    : '...'}
                </span>
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => writeMacroSlot(index)}
                  className="px-2 py-1 text-xs font-medium text-text-secondary bg-dark-bgTertiary border border-dark-borderLight rounded hover:bg-dark-bgHover transition-colors"
                  title={`Write current cell to slot ${index + 1} (Ctrl+Shift+${index + 1})`}
                >
                  Write
                </button>
                <button
                  onClick={() => readMacroSlot(index)}
                  disabled={isEmpty}
                  className="px-2 py-1 text-xs font-medium text-text-primary bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={`Paste macro slot ${index + 1} (Ctrl+${index + 1})`}
                >
                  Read
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-dark-bgSecondary/50 border border-dark-border rounded text-xs text-text-secondary">
        <div className="font-semibold text-text-secondary mb-2">Keyboard Shortcuts:</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <kbd className="px-1.5 py-0.5 bg-dark-bgTertiary border border-dark-borderLight rounded font-mono text-text-secondary">
              Ctrl+1-8
            </kbd>
            <span>Read macro slot 1-8</span>
          </div>
          <div className="flex justify-between">
            <kbd className="px-1.5 py-0.5 bg-dark-bgTertiary border border-dark-borderLight rounded font-mono text-text-secondary">
              Ctrl+Shift+1-8
            </kbd>
            <span>Write current cell to slot 1-8</span>
          </div>
        </div>
        <p className="mt-2 text-text-muted">
          Macros store cell data for quick entry. Perfect for repeated patterns!
        </p>
      </div>
    </div>
  );
};
