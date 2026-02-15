/**
 * InstrumentList - Unified scrollable list of all instruments
 * Supports both default styling and FT2 styling variants
 * Shows instrument number, name, and synth type
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { getSynthInfo } from '@constants/synthCategories';
import { Plus, Trash2, Copy, Repeat, Repeat1, FolderOpen, Pencil, Package, ExternalLink } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

import { InstrumentContextMenu } from './InstrumentContextMenu';
import { LoadPresetModal } from './presets';
import { focusPopout } from '@components/ui/PopOutWindow';
import { BASS_PRESETS } from '@constants/factoryPresets';
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';

interface InstrumentListProps {
  /** Optional: Compact mode for sidebar */
  compact?: boolean;
  /** Optional: Max height for scrolling */
  maxHeight?: string;
  /** Optional: Show add/delete buttons */
  showActions?: boolean;
  /** Optional: Callback when instrument changes */
  onInstrumentChange?: (id: number) => void;
  /** Optional: Preview instrument on click */
  showPreviewOnClick?: boolean;
  /** Optional: Show sample pack button in action bar */
  showSamplePackButton?: boolean;
  /** Optional: Show preset button in action bar */
  showPresetButton?: boolean;
  /** Optional: Show edit button in action bar */
  showEditButton?: boolean;
  /** Optional: Callback when edit button is clicked */
  onEditInstrument?: (id: number) => void;
  /** Optional: Use FT2 styling */
  variant?: 'default' | 'ft2';
  /** Optional: Callback when create new is clicked */
  onCreateNew?: () => void;
}

// PERFORMANCE: Memoize to prevent expensive re-renders on every scroll step
export const InstrumentList: React.FC<InstrumentListProps> = memo(({
  compact = false,
  maxHeight = '300px',
  showActions = true,
  onInstrumentChange,
  showPreviewOnClick = false,
  showSamplePackButton = false,
  showPresetButton = false,
  showEditButton = false,
  onEditInstrument,
  variant = 'default',
}) => {
  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument,
    createInstrument,
    deleteInstrument,
    cloneInstrument,
    updateInstrument,
  } = useInstrumentStore(useShallow((state) => ({
    instruments: state.instruments,
    currentInstrumentId: state.currentInstrumentId,
    setCurrentInstrument: state.setCurrentInstrument,
    createInstrument: state.createInstrument,
    deleteInstrument: state.deleteInstrument,
    cloneInstrument: state.cloneInstrument,
    updateInstrument: state.updateInstrument,
  })));

  const { useHexNumbers, setShowSamplePackModal, setInstrumentEditorPoppedOut, instrumentEditorPoppedOut } = useUIStore(useShallow(s => ({
    useHexNumbers: s.useHexNumbers,
    setShowSamplePackModal: s.setShowSamplePackModal,
    setInstrumentEditorPoppedOut: s.setInstrumentEditorPoppedOut,
    instrumentEditorPoppedOut: s.instrumentEditorPoppedOut,
  })));
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [showLoadModal, setShowLoadModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const isFT2 = variant === 'ft2';

  // Scroll to selected instrument when it changes
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentInstrumentId]);

  // Preview an instrument by playing a short note
  const previewInstrument = useCallback(async (inst: InstrumentConfig) => {
    if (!showPreviewOnClick) return;

    try {
      // Start audio context if needed
      await Tone.start();

      // Clear any existing preview timeout
      if (previewTimeoutRef.current) {
        window.clearTimeout(previewTimeoutRef.current);
      }

      const engine = getToneEngine();

      // Use C4 as default preview note, or C3 for bass instruments
      const isBass = inst.synthType === 'TB303' || inst.name.toLowerCase().includes('bass');
      const previewNote = isBass ? 'C3' : 'C4';

      const now = Tone.now();
      engine.triggerNoteAttack(inst.id, previewNote, now, 0.8, inst);

      // Release after 300ms
      previewTimeoutRef.current = window.setTimeout(() => {
        engine.triggerNoteRelease(inst.id, previewNote, Tone.now(), inst);
      }, 300);
    } catch (error) {
      console.warn('[InstrumentList] Preview failed:', error);
    }
  }, [showPreviewOnClick]);

  const handleSelect = (id: number, inst: InstrumentConfig) => {
    setCurrentInstrument(id);
    onInstrumentChange?.(id);
    if (showPreviewOnClick) {
      previewInstrument(inst);
    }
  };

  const handleAdd = () => {
    if (isFT2) {
      // Use '303 Classic' as the starting point for FT2 variant
      const startingPreset = BASS_PRESETS[0];
      createInstrument(startingPreset);
    } else {
      createInstrument();
    }
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

  // Start editing instrument name
  const handleStartEdit = (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(name);
    // Focus the input after render
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  // Save edited name
  const handleSaveEdit = () => {
    if (editingId !== null && editingName.trim()) {
      updateInstrument(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Pop out instrument editor for a specific instrument
  const handlePopOut = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setCurrentInstrument(id);
    if (instrumentEditorPoppedOut) {
      focusPopout('DEViLBOX — Instrument Editor');
    } else {
      setInstrumentEditorPoppedOut(true);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('application/x-devilbox-instrument', JSON.stringify({ id }));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Set a custom drag image or styling if desired
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
    
    // Reset opacity after a short delay (so it doesn't affect the drag image)
    setTimeout(() => {
      target.style.opacity = '1';
    }, 0);
  };

  // Sort instruments by ID
  const sortedInstruments = [...instruments].sort((a, b) => a.id - b.id);

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Show action bar if any action buttons are enabled
  const showActionBar = isFT2 && (showPresetButton || showSamplePackButton || showEditButton);

  return (
    <div className={`flex flex-col h-full ${isFT2 ? 'bg-ft2-bg border-l border-ft2-border' : ''}`}>
      {/* Action Buttons (FT2 variant) */}
      {showActionBar && (
        <div className="px-2 py-2 bg-ft2-header border-b border-ft2-border flex-shrink-0">
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={handleAdd}
              className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
              title="Add new instrument (303 Classic)"
            >
              <Plus size={14} />
              <span className="text-[8px] font-bold">ADD</span>
            </button>
            {showPresetButton && (
              <button
                onClick={() => setShowLoadModal(true)}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
                title="Load preset into current instrument"
              >
                <FolderOpen size={14} />
                <span className="text-[8px] font-bold">PRESET</span>
              </button>
            )}
            {showSamplePackButton && (
              <button
                onClick={() => setShowSamplePackModal(true)}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-green-600 text-green-400 hover:bg-green-600 hover:text-ft2-bg transition-colors"
                title="Browse sample packs"
              >
                <Package size={14} />
                <span className="text-[8px] font-bold">SAMPLE</span>
              </button>
            )}
            {showEditButton && (
              <button
                onClick={() => onEditInstrument?.(currentInstrumentId!)}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
                title="Edit current instrument"
              >
                <Pencil size={14} />
                <span className="text-[8px] font-bold">EDIT</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable list */}
      <div
        ref={listRef}
        className={`flex-1 overflow-y-auto ${isFT2 ? 'scrollbar-ft2 min-h-0' : 'scrollbar-modern'}`}
        style={!isFT2 ? { maxHeight } : undefined}
      >
        <div className="flex flex-col divide-y divide-ft2-border/30">
        {sortedInstruments.map((instrument) => {
          const synthInfo = getSynthInfo(instrument.synthType);
          const isSelected = instrument.id === currentInstrumentId;
          const IconComponent = getIcon(synthInfo?.icon || 'Music2');

          if (isFT2) {
            // FT2 Styling
            return (
              <div
                key={instrument.id}
                ref={isSelected ? selectedRef : undefined}
                onClick={() => handleSelect(instrument.id, instrument)}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, instrument.id)}
                className={`
                  instrument-list-item
                  flex items-center gap-2 px-2 py-1.5 cursor-pointer border-b border-ft2-border
                  transition-colors group
                  ${isSelected
                    ? 'bg-ft2-cursor text-ft2-bg'
                    : 'hover:bg-ft2-header text-ft2-text'
                  }
                `}
              >
                {/* ID */}
                <span className={`font-mono text-xs font-bold w-6 ${isSelected ? 'text-ft2-bg' : 'text-ft2-highlight'}`}>
                  {useHexNumbers
                    ? instrument.id.toString(16).toUpperCase().padStart(2, '0')
                    : instrument.id.toString(10).padStart(2, '0')
                  }
                </span>

                {/* Icon */}
                <IconComponent size={12} className={isSelected ? 'text-ft2-bg' : (synthInfo?.color || 'text-ft2-highlight')} />

                {/* Name (double-click to edit) */}
                {editingId === instrument.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-mono bg-ft2-bg border border-ft2-cursor px-1 py-0.5 rounded text-ft2-text focus:outline-none w-24"
                    autoFocus
                  />
                ) : (
                  <span
                    className="text-xs font-mono whitespace-nowrap cursor-text"
                    onDoubleClick={(e) => handleStartEdit(e, instrument.id, instrument.name)}
                    title="Double-click to rename"
                  >
                    {instrument.name}
                  </span>
                )}

                {/* Synth Type Badge */}
                <span className={`text-[9px] px-1 rounded ${isSelected ? 'bg-ft2-bg/20 text-ft2-bg' : 'bg-ft2-header text-ft2-textDim'}`}>
                  {synthInfo?.shortName || instrument.synthType}
                </span>

                {/* Actions (visible on hover, always visible when selected) */}
                {showActions && (
                  <div className={`instrument-action-buttons flex gap-0.5 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    <button
                      onClick={(e) => handlePopOut(e, instrument.id)}
                      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'} text-cyan-400`}
                      title="Pop out editor"
                    >
                      <ExternalLink size={10} />
                    </button>
                    <button
                      onClick={(e) => handleClone(e, instrument.id)}
                      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'}`}
                      title="Duplicate"
                    >
                      <Copy size={10} />
                    </button>
                    {instruments.length > 1 && (
                      <button
                        onClick={(e) => handleDelete(e, instrument.id)}
                        className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'} text-red-400`}
                        title="Delete"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Default Styling
          return (
            <InstrumentContextMenu key={instrument.id} instrumentId={instrument.id}>
              <div
                ref={isSelected ? selectedRef : undefined}
                onClick={() => handleSelect(instrument.id, instrument)}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, instrument.id)}
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
                  className={synthInfo?.color || 'text-accent-primary'}
                />

                {/* Instrument name (double-click to edit) */}
                {editingId === instrument.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm bg-dark-bg border border-accent-primary px-1 py-0.5 rounded text-text-primary focus:outline-none w-28"
                    autoFocus
                  />
                ) : (
                  <span
                    className={`
                      text-sm whitespace-nowrap cursor-text
                      ${isSelected ? 'text-text-primary' : 'text-text-secondary'}
                    `}
                    onDoubleClick={(e) => handleStartEdit(e, instrument.id, instrument.name)}
                    title="Double-click to rename"
                  >
                    {instrument.name}
                  </span>
                )}

                {/* Synth type badge (non-compact only) */}
                {!compact && (
                  <span className="text-[10px] text-text-muted font-mono">
                    {synthInfo?.shortName || instrument.synthType}
                  </span>
                )}

                {/* Sample loop indicator - enhanced visibility */}
                {instrument.sample?.loop && (
                  <span
                    className="flex items-center gap-0.5 ml-auto"
                    title={instrument.sample.loopType === 'pingpong' ? 'Ping-pong loop' : 'Forward loop'}
                  >
                    {instrument.sample.loopType === 'pingpong' ? (
                      <>
                        <Repeat size={12} className="text-blue-400" />
                        <span className="text-[9px] text-blue-400 font-bold leading-none">↔</span>
                      </>
                    ) : (
                      <>
                        <Repeat1 size={12} className="text-green-400" />
                        <span className="text-[9px] text-green-400 font-bold leading-none">→</span>
                      </>
                    )}
                  </span>
                )}

                {/* Actions (on hover) */}
                {showActions && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                    <button
                      onClick={(e) => handlePopOut(e, instrument.id)}
                      className="p-1 text-text-muted hover:text-cyan-400"
                      title="Pop out editor"
                    >
                      <ExternalLink size={12} />
                    </button>
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
            </InstrumentContextMenu>
          );
        })}
        </div>
      </div>

      {/* Footer with count */}
      <div className={
        isFT2
          ? 'px-3 py-1.5 bg-ft2-header border-t border-ft2-border'
          : 'px-3 py-1 border-t border-dark-border bg-dark-bgSecondary'
      }>
        <span className={isFT2 ? 'text-ft2-textDim text-[10px] font-mono' : 'text-[10px] text-text-muted'}>
          {instruments.length} instrument{instruments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Modals (FT2 variant) */}
      {showLoadModal && (
        <LoadPresetModal onClose={() => setShowLoadModal(false)} />
      )}
    </div>
  );
});

InstrumentList.displayName = 'InstrumentList';
