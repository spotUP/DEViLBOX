/**
 * InstrumentList - Scrollable list of all instruments
 * Shows instrument number, name, and synth type
 */

import React, { useRef, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getSynthInfo } from '@constants/synthCategories';
import { Plus, Trash2, Copy } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

interface InstrumentListProps {
  /** Optional: Compact mode for sidebar */
  compact?: boolean;
  /** Optional: Max height for scrolling */
  maxHeight?: string;
  /** Optional: Show add/delete buttons */
  showActions?: boolean;
  /** Optional: Callback when instrument changes */
  onInstrumentChange?: (id: number) => void;
}

export const InstrumentList: React.FC<InstrumentListProps> = ({
  compact = false,
  maxHeight = '300px',
  showActions = true,
  onInstrumentChange,
}) => {
  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument,
    createInstrument,
    deleteInstrument,
    cloneInstrument,
  } = useInstrumentStore();

  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll to selected instrument when it changes
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentInstrumentId]);

  const handleSelect = (id: number) => {
    setCurrentInstrument(id);
    onInstrumentChange?.(id);
  };

  const handleAdd = () => {
    createInstrument();
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (instruments.length > 1) {
      deleteInstrument(id);
    }
  };

  const handleClone = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    cloneInstrument(id);
  };

  // Sort instruments by ID
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border bg-dark-bgSecondary">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Instruments
        </span>
        {showActions && (
          <button
            onClick={handleAdd}
            className="p-1 text-text-muted hover:text-accent-primary transition-colors"
            title="Add new instrument"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Scrollable list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto scrollbar-modern"
        style={{ maxHeight }}
      >
        {sortedInstruments.map((instrument) => {
          const synthInfo = getSynthInfo(instrument.synthType);
          const isSelected = instrument.id === currentInstrumentId;
          const IconComponent = getIcon(synthInfo.icon);

          return (
            <div
              key={instrument.id}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => handleSelect(instrument.id)}
              className={`
                group flex items-center gap-2 px-3 py-2 cursor-pointer transition-all
                ${isSelected
                  ? 'bg-accent-primary/20 border-l-2 border-accent-primary'
                  : 'hover:bg-dark-bgHover border-l-2 border-transparent'
                }
              `}
            >
              {/* Instrument number */}
              <span
                className={`
                  font-mono text-xs w-6 text-center
                  ${isSelected ? 'text-accent-primary' : 'text-text-muted'}
                `}
              >
                {String(instrument.id).padStart(2, '0')}
              </span>

              {/* Synth type icon */}
              <IconComponent
                size={compact ? 12 : 14}
                className={synthInfo.color}
              />

              {/* Instrument name */}
              <span
                className={`
                  flex-1 text-sm truncate
                  ${isSelected ? 'text-text-primary' : 'text-text-secondary'}
                `}
              >
                {instrument.name}
              </span>

              {/* Synth type badge (non-compact only) */}
              {!compact && (
                <span className="text-[10px] text-text-muted font-mono">
                  {synthInfo.shortName}
                </span>
              )}

              {/* Actions (on hover) */}
              {showActions && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleClone(e, instrument.id)}
                    className="p-1 text-text-muted hover:text-accent-primary"
                    title="Clone instrument"
                  >
                    <Copy size={12} />
                  </button>
                  {instruments.length > 1 && (
                    <button
                      onClick={(e) => handleDelete(e, instrument.id)}
                      className="p-1 text-text-muted hover:text-accent-error"
                      title="Delete instrument"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with count */}
      <div className="px-3 py-1 border-t border-dark-border bg-dark-bgSecondary">
        <span className="text-[10px] text-text-muted">
          {instruments.length} instrument{instruments.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
};
