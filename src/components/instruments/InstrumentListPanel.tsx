/**
 * InstrumentListPanel - FT2-style instrument list with actions
 * Shows all instruments with Add, Load, Save, Create, Edit buttons
 */

import React, { useState } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getSynthInfo } from '@constants/synthCategories';
import * as LucideIcons from 'lucide-react';
import { Plus, FolderOpen, Wand2, Pencil, Trash2, Copy } from 'lucide-react';
import { CreateInstrumentModal } from './CreateInstrumentModal';
import { LoadPresetModal } from './LoadPresetModal';

interface InstrumentListPanelProps {
  onEditInstrument?: (id: number) => void;
}

export const InstrumentListPanel: React.FC<InstrumentListPanelProps> = ({ onEditInstrument }) => {
  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument,
    createInstrument,
    deleteInstrument,
    cloneInstrument,
  } = useInstrumentStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  // Get icon for synth type
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  return (
    <div className="flex flex-col h-full bg-ft2-bg">
      {/* Header */}
      <div className="px-3 py-2 bg-ft2-header border-b-2 border-ft2-border">
        <div className="text-ft2-highlight text-xs font-bold tracking-wide">INSTRUMENTS</div>
      </div>

      {/* Action Buttons */}
      <div className="px-2 py-2 bg-ft2-header border-b border-ft2-border">
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => createInstrument()}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
            title="Add blank instrument"
          >
            <Plus size={14} />
            <span className="text-[9px] font-bold">ADD</span>
          </button>
          <button
            onClick={() => setShowLoadModal(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
            title="Load preset into current instrument"
          >
            <FolderOpen size={14} />
            <span className="text-[9px] font-bold">LOAD</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-ft2-bg border border-ft2-cursor text-ft2-cursor hover:bg-ft2-cursor hover:text-ft2-bg transition-colors"
            title="Create new instrument from scratch"
          >
            <Wand2 size={14} />
            <span className="text-[9px] font-bold">CREATE</span>
          </button>
          <button
            onClick={() => onEditInstrument?.(currentInstrumentId!)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight transition-colors text-ft2-text"
            title="Edit current instrument"
          >
            <Pencil size={14} />
            <span className="text-[9px] font-bold">EDIT</span>
          </button>
        </div>
      </div>

      {/* Instrument List */}
      <div className="flex-1 overflow-y-auto scrollbar-ft2">
        {instruments
          .slice()
          .sort((a, b) => a.id - b.id)
          .map((inst) => {
            const isSelected = inst.id === currentInstrumentId;
            const synthInfo = getSynthInfo(inst.synthType);
            const IconComponent = getIcon(synthInfo.icon);

            return (
              <div
                key={inst.id}
                onClick={() => setCurrentInstrument(inst.id)}
                className={`
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
                  {inst.id.toString(16).toUpperCase().padStart(2, '0')}
                </span>

                {/* Icon */}
                <IconComponent size={12} className={isSelected ? 'text-ft2-bg' : synthInfo.color} />

                {/* Name */}
                <span className="flex-1 text-xs font-mono truncate">
                  {inst.name}
                </span>

                {/* Synth Type Badge */}
                <span className={`text-[9px] px-1 rounded ${isSelected ? 'bg-ft2-bg/20 text-ft2-bg' : 'bg-ft2-header text-ft2-textDim'}`}>
                  {synthInfo.shortName}
                </span>

                {/* Actions (visible on hover) */}
                <div className={`flex gap-0.5 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      cloneInstrument(inst.id);
                    }}
                    className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'}`}
                    title="Duplicate"
                  >
                    <Copy size={10} />
                  </button>
                  {instruments.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteInstrument(inst.id);
                      }}
                      className={`p-0.5 rounded ${isSelected ? 'hover:bg-ft2-bg/20' : 'hover:bg-ft2-border'} text-red-400`}
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Footer - Count */}
      <div className="px-3 py-1.5 bg-ft2-header border-t border-ft2-border">
        <div className="text-ft2-textDim text-[10px] font-mono">
          {instruments.length} instrument{instruments.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateInstrumentModal onClose={() => setShowCreateModal(false)} />
      )}
      {showLoadModal && (
        <LoadPresetModal onClose={() => setShowLoadModal(false)} />
      )}
    </div>
  );
};
