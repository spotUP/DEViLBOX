/**
 * InstrumentPanel - Container for instrument editors
 */

import React, { useState, useRef, useEffect } from 'react';
import { useInstrumentStore } from '../../stores';
import { TB303Editor } from './TB303Editor';
import { GenericSynthEditor } from './GenericSynthEditor';
import { SynthTypeSelector } from './SynthTypeSelector';
import { PresetBrowser } from './PresetBrowser';
import { Plus, Copy, Trash2, ChevronDown, Maximize2 } from 'lucide-react';

type PanelTab = 'presets' | 'type' | 'params';

interface InstrumentPanelProps {
  onOpenModal?: () => void;
}

export const InstrumentPanel: React.FC<InstrumentPanelProps> = ({ onOpenModal }) => {
  const {
    instruments,
    currentInstrumentId,
    updateInstrument,
    createInstrument,
    deleteInstrument,
    cloneInstrument,
    setCurrentInstrument
  } = useInstrumentStore();
  const [activeTab, setActiveTab] = useState<PanelTab>('params');
  const [showInstrumentList, setShowInstrumentList] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentInstrument = instruments.find((i) => i.id === currentInstrumentId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowInstrumentList(false);
      }
    };

    if (showInstrumentList) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInstrumentList]);

  if (!currentInstrument) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted font-mono">
        No instrument selected
      </div>
    );
  }

  const handleTB303Change = (config: Partial<typeof currentInstrument.tb303>) => {
    if (!currentInstrument.tb303) return;

    updateInstrument(currentInstrument.id, {
      tb303: {
        ...currentInstrument.tb303,
        ...config,
      },
    });
  };

  const handleNewInstrument = () => {
    createInstrument();
    setShowInstrumentList(false);
  };

  const handleCloneInstrument = () => {
    if (currentInstrument) {
      cloneInstrument(currentInstrument.id);
    }
  };

  const handleDeleteInstrument = () => {
    if (currentInstrument && instruments.length > 1) {
      deleteInstrument(currentInstrument.id);
    }
  };

  const handleSelectInstrument = (id: number) => {
    setCurrentInstrument(id);
    setShowInstrumentList(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-dark-bg">
      {/* Instrument Header */}
      <div className="bg-dark-bgSecondary border-b border-dark-border px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Instrument Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowInstrumentList(!showInstrumentList)}
              className="flex items-center gap-2 font-mono hover:bg-dark-bgHover px-3 py-1.5 rounded-md transition-colors"
            >
              <span className="text-text-secondary text-sm">Instrument</span>
              <span className="text-accent-primary font-bold">
                {currentInstrument.id.toString(16).toUpperCase().padStart(2, '0')}
              </span>
              <span className="text-text-primary">{currentInstrument.name}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>

            {/* Dropdown List */}
            {showInstrumentList && (
              <div className="absolute top-full left-0 mt-1 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-lg z-50 min-w-[240px] max-h-[300px] overflow-y-auto scrollbar-modern animate-fade-in">
                {instruments
                  .slice()
                  .sort((a, b) => a.id - b.id)
                  .map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => handleSelectInstrument(inst.id)}
                      className={`w-full px-4 py-2.5 font-mono text-sm text-left hover:bg-dark-bgHover transition-colors flex items-center gap-3 ${
                        inst.id === currentInstrumentId ? 'bg-dark-bgActive text-accent-primary' : 'text-text-primary'
                      }`}
                    >
                      <span className="text-accent-primary font-bold">
                        {inst.id.toString(16).toUpperCase().padStart(2, '0')}
                      </span>
                      <span className="truncate">{inst.name}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {onOpenModal && (
              <button
                onClick={onOpenModal}
                className="btn-icon text-accent-primary"
                title="Edit Full Screen"
              >
                <Maximize2 size={18} />
              </button>
            )}
            <button
              onClick={handleNewInstrument}
              className="btn-icon"
              title="New Instrument"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={handleCloneInstrument}
              className="btn-icon"
              title="Clone Instrument"
            >
              <Copy size={18} />
            </button>
            <button
              onClick={handleDeleteInstrument}
              className={`btn-icon ${instruments.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-accent-error'}`}
              title="Delete Instrument"
              disabled={instruments.length <= 1}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-dark-border bg-dark-bgSecondary">
        <button
          onClick={() => setActiveTab('presets')}
          className={`tab ${activeTab === 'presets' ? 'tab-active' : ''}`}
        >
          Presets
        </button>
        <button
          onClick={() => setActiveTab('type')}
          className={`tab ${activeTab === 'type' ? 'tab-active' : ''}`}
        >
          Type
        </button>
        <button
          onClick={() => setActiveTab('params')}
          className={`tab ${activeTab === 'params' ? 'tab-active' : ''}`}
        >
          Parameters
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-modern">
        {activeTab === 'presets' && (
          <PresetBrowser instrumentId={currentInstrument.id} />
        )}

        {activeTab === 'type' && (
          <SynthTypeSelector instrument={currentInstrument} />
        )}

        {activeTab === 'params' && (
          <div>
            {currentInstrument.synthType === 'TB303' && currentInstrument.tb303 && (
              <TB303Editor config={currentInstrument.tb303} onChange={handleTB303Change} />
            )}

            {currentInstrument.synthType !== 'TB303' && (
              <GenericSynthEditor
                instrument={currentInstrument}
                onChange={(updates) => updateInstrument(currentInstrument.id, updates)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
