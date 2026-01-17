/**
 * InstrumentSelector - FT2-style instrument selector for toolbar
 * Matches the Position/Pattern selector styling with dropdown capability
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { getSynthInfo } from '@constants/synthCategories';
import * as LucideIcons from 'lucide-react';

interface InstrumentSelectorProps {
  /** Show compact mode with just number */
  compact?: boolean;
}

export const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({
  compact = false,
}) => {
  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument,
  } = useInstrumentStore();

  const useHexNumbers = useUIStore((state) => state.useHexNumbers);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(currentInstrumentId ?? 0);

  // Keep ref in sync
  useEffect(() => {
    valueRef.current = currentInstrumentId ?? 0;
  }, [currentInstrumentId]);

  // Sort instruments by ID
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);

  // Current instrument info
  const currentInstrument = instruments.find((i) => i.id === currentInstrumentId);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Navigate to next/prev instrument
  const navigateInstrument = useCallback((direction: 1 | -1) => {
    const currentIndex = sortedInstruments.findIndex((i) => i.id === valueRef.current);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < sortedInstruments.length) {
      const newId = sortedInstruments[newIndex].id;
      valueRef.current = newId;
      setCurrentInstrument(newId);
    }
  }, [sortedInstruments, setCurrentInstrument]);

  // Hold-to-repeat refs
  const repeatIntervalRef = useRef<number | null>(null);
  const repeatTimeoutRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
      if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
    };
  }, []);

  const startRepeat = useCallback((action: () => void) => {
    action();
    if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
    repeatTimeoutRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(action, 80);
    }, 300);
  }, []);

  const stopRepeat = useCallback(() => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  const handleSelect = (id: number) => {
    setCurrentInstrument(id);
    setShowDropdown(false);
  };

  const formatValue = (val: number): string => {
    return useHexNumbers
      ? val.toString(16).toUpperCase().padStart(2, '0')
      : val.toString(10).padStart(2, '0');
  };

  return (
    <div className="ft2-numeric-group relative" ref={dropdownRef}>
      <span className="ft2-numeric-label">Instr:</span>

      {/* Clickable value that opens dropdown */}
      <button
        className="ft2-numeric-value cursor-pointer hover:bg-dark-bgHover rounded px-1"
        onClick={() => setShowDropdown(!showDropdown)}
        title={currentInstrument?.name || 'Select instrument'}
      >
        {formatValue(currentInstrumentId ?? 0)}
      </button>

      {/* Show instrument name in non-compact mode */}
      {!compact && currentInstrument && (
        <span className="ml-1 text-[10px] text-text-muted truncate max-w-[60px]" title={currentInstrument.name}>
          {currentInstrument.name.slice(0, 8)}
        </span>
      )}

      {/* Up/Down arrows */}
      <div className="ft2-numeric-arrows">
        <button
          className="ft2-arrow ft2-arrow-up"
          onMouseDown={() => startRepeat(() => navigateInstrument(-1))}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
          onTouchStart={() => startRepeat(() => navigateInstrument(-1))}
          onTouchEnd={stopRepeat}
          title="Previous instrument"
        >
          <span className="ft2-arrow-icon">&#9650;</span>
        </button>
        <button
          className="ft2-arrow ft2-arrow-down"
          onMouseDown={() => startRepeat(() => navigateInstrument(1))}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
          onTouchStart={() => startRepeat(() => navigateInstrument(1))}
          onTouchEnd={stopRepeat}
          title="Next instrument"
        >
          <span className="ft2-arrow-icon">&#9660;</span>
        </button>
      </div>

      {/* Dropdown list */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-dark-bgTertiary border border-dark-border rounded shadow-xl z-50 scrollbar-modern">
          {sortedInstruments.map((instrument) => {
            const info = getSynthInfo(instrument.synthType);
            const IconComponent = getIcon(info.icon);
            const isSelected = instrument.id === currentInstrumentId;

            return (
              <div
                key={instrument.id}
                onClick={() => handleSelect(instrument.id)}
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
                  ${isSelected
                    ? 'bg-accent-primary/20 text-text-primary'
                    : 'hover:bg-dark-bgHover text-text-secondary'
                  }
                `}
              >
                <span className="font-mono text-xs w-5 text-text-muted">
                  {formatValue(instrument.id)}
                </span>
                <IconComponent size={12} className={info.color} />
                <span className="flex-1 text-xs truncate">{instrument.name}</span>
                <span className="text-[10px] text-text-muted font-mono">
                  {info.shortName}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
