/**
 * InstrumentPanel - Simplified instrument editor with clear UX
 * Single-page design with prominent actions instead of confusing tabs
 */

import React, { useState, useRef, useEffect } from 'react';
import { useInstrumentStore } from '../../stores';
import { VisualTB303Editor } from './VisualTB303Editor';
import { VisualSynthEditor } from './VisualSynthEditor';
import { TestKeyboard } from './TestKeyboard';
import { PRESET_CATEGORIES, type PresetCategory } from '@constants/factoryPresets';
import { SYNTH_INFO, ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';
import * as LucideIcons from 'lucide-react';
import {
  Plus,
  Copy,
  Trash2,
  ChevronDown,
  Maximize2,
  FolderOpen,
  Search,
  ChevronRight,
} from 'lucide-react';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';

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
    setCurrentInstrument,
  } = useInstrumentStore();

  const [showInstrumentList, setShowInstrumentList] = useState(false);
  const [showPresetBrowser, setShowPresetBrowser] = useState(false);
  const [showSynthSelector, setShowSynthSelector] = useState(false);
  const [presetCategory, setPresetCategory] = useState<PresetCategory>('Bass');
  const [presetSearch, setPresetSearch] = useState('');
  const [synthSearch, setSynthSearch] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<HTMLDivElement>(null);

  const currentInstrument = instruments.find((i) => i.id === currentInstrumentId);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowInstrumentList(false);
      }
      if (presetRef.current && !presetRef.current.contains(event.target as Node)) {
        setShowPresetBrowser(false);
      }
      if (synthRef.current && !synthRef.current.contains(event.target as Node)) {
        setShowSynthSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!currentInstrument) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted font-mono">
        No instrument selected
      </div>
    );
  }

  const synthInfo = getSynthInfo(currentInstrument.synthType);

  // Get icon component dynamically
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };

  const IconComponent = getIcon(synthInfo.icon);

  // Filter presets
  const filteredPresets = PRESET_CATEGORIES[presetCategory].filter((preset) => {
    if (!presetSearch.trim()) return true;
    const query = presetSearch.toLowerCase();
    return (
      preset.name.toLowerCase().includes(query) ||
      preset.synthType.toLowerCase().includes(query)
    );
  });

  // Filter synths
  const filteredSynths = ALL_SYNTH_TYPES.filter((synthType) => {
    if (!synthSearch.trim()) return true;
    const synth = SYNTH_INFO[synthType];
    const query = synthSearch.toLowerCase();
    return (
      synth.name.toLowerCase().includes(query) ||
      synth.shortName.toLowerCase().includes(query) ||
      synth.description.toLowerCase().includes(query) ||
      synth.bestFor.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const handleTB303Change = (config: Partial<typeof currentInstrument.tb303>) => {
    if (!currentInstrument.tb303) return;
    updateInstrument(currentInstrument.id, {
      tb303: { ...currentInstrument.tb303, ...config },
    });
  };

  const handleLoadPreset = (preset: Omit<InstrumentConfig, 'id'>) => {
    updateInstrument(currentInstrument.id, preset);
    setShowPresetBrowser(false);
  };

  const handleChangeSynthType = (type: SynthType) => {
    updateInstrument(currentInstrument.id, {
      synthType: type,
      tb303: type === 'TB303' ? currentInstrument.tb303 : undefined,
      wavetable: type === 'Wavetable' ? currentInstrument.wavetable : undefined,
    });
    setShowSynthSelector(false);
  };

  const categories = Object.keys(PRESET_CATEGORIES) as PresetCategory[];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-dark-bg">
      {/* Header - Instrument Selector */}
      <div className="bg-dark-bgSecondary border-b border-dark-border px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Instrument Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowInstrumentList(!showInstrumentList)}
              className="flex items-center gap-2 font-mono hover:bg-dark-bgHover px-3 py-1.5 rounded-md transition-colors"
            >
              <span className="text-accent-primary font-bold text-lg">
                {currentInstrument.id.toString(16).toUpperCase().padStart(2, '0')}
              </span>
              <span className="text-text-primary font-medium">{currentInstrument.name}</span>
              <ChevronDown size={14} className="text-text-muted" />
            </button>

            {showInstrumentList && (
              <div className="absolute top-full left-0 mt-1 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 min-w-[240px] max-h-[300px] overflow-y-auto">
                {instruments
                  .slice()
                  .sort((a, b) => a.id - b.id)
                  .map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => {
                        setCurrentInstrument(inst.id);
                        setShowInstrumentList(false);
                      }}
                      className={`w-full px-4 py-2.5 font-mono text-sm text-left hover:bg-dark-bgHover transition-colors flex items-center gap-3 ${
                        inst.id === currentInstrumentId
                          ? 'bg-dark-bgActive text-accent-primary'
                          : 'text-text-primary'
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
              <button onClick={onOpenModal} className="btn-icon text-accent-primary" title="Full Screen">
                <Maximize2 size={18} />
              </button>
            )}
            <button onClick={() => createInstrument()} className="btn-icon" title="New Instrument">
              <Plus size={18} />
            </button>
            <button onClick={() => cloneInstrument(currentInstrument.id)} className="btn-icon" title="Duplicate">
              <Copy size={18} />
            </button>
            <button
              onClick={() => instruments.length > 1 && deleteInstrument(currentInstrument.id)}
              className={`btn-icon ${instruments.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-accent-error'}`}
              title="Delete"
              disabled={instruments.length <= 1}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-modern">
        {/* Quick Actions Bar */}
        <div className="p-4 bg-dark-bgSecondary border-b border-dark-border">
          <div className="flex gap-2">
            {/* Load Preset Button */}
            <div className="relative flex-1" ref={presetRef}>
              <button
                onClick={() => {
                  setShowPresetBrowser(!showPresetBrowser);
                  setShowSynthSelector(false);
                }}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  showPresetBrowser
                    ? 'bg-accent-primary text-dark-bg border-accent-primary'
                    : 'bg-dark-bgTertiary text-text-primary border-dark-border hover:border-accent-primary'
                }`}
              >
                <FolderOpen size={18} />
                <span className="font-medium">Load Preset</span>
              </button>

              {/* Preset Browser Dropdown */}
              {showPresetBrowser && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 max-h-[400px] overflow-hidden flex flex-col">
                  {/* Search */}
                  <div className="p-3 border-b border-dark-border">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={presetSearch}
                        onChange={(e) => setPresetSearch(e.target.value)}
                        placeholder="Search presets..."
                        className="w-full pl-9 pr-3 py-2 bg-dark-bg border border-dark-border rounded text-sm focus:border-accent-primary focus:outline-none"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="flex gap-1 p-2 border-b border-dark-border overflow-x-auto">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setPresetCategory(cat)}
                        className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                          presetCategory === cat
                            ? 'bg-accent-primary text-dark-bg'
                            : 'bg-dark-bg text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Presets Grid */}
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-2 gap-1">
                      {filteredPresets.map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => handleLoadPreset(preset)}
                          className="p-2 text-left bg-dark-bg hover:bg-dark-bgHover rounded border border-transparent hover:border-accent-primary transition-all"
                        >
                          <div className="font-medium text-sm text-text-primary truncate">{preset.name}</div>
                          <div className="text-xs text-text-muted">{preset.synthType}</div>
                        </button>
                      ))}
                    </div>
                    {filteredPresets.length === 0 && (
                      <div className="text-center py-4 text-text-muted text-sm">No presets found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Change Synth Button */}
            <div className="relative flex-1" ref={synthRef}>
              <button
                onClick={() => {
                  setShowSynthSelector(!showSynthSelector);
                  setShowPresetBrowser(false);
                }}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  showSynthSelector
                    ? 'bg-accent-primary text-dark-bg border-accent-primary'
                    : 'bg-dark-bgTertiary text-text-primary border-dark-border hover:border-accent-primary'
                }`}
              >
                <IconComponent size={18} className={showSynthSelector ? '' : synthInfo.color} />
                <span className="font-medium">{synthInfo.shortName}</span>
                <ChevronRight size={14} className={showSynthSelector ? 'rotate-90' : ''} />
              </button>

              {/* Synth Selector Dropdown */}
              {showSynthSelector && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 max-h-[400px] overflow-hidden flex flex-col">
                  {/* Search */}
                  <div className="p-3 border-b border-dark-border">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={synthSearch}
                        onChange={(e) => setSynthSearch(e.target.value)}
                        placeholder="Search synths... (bass, pad, 808)"
                        className="w-full pl-9 pr-3 py-2 bg-dark-bg border border-dark-border rounded text-sm focus:border-accent-primary focus:outline-none"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Synths Grid */}
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-2 gap-1">
                      {filteredSynths.map((synthType) => {
                        const synth = SYNTH_INFO[synthType];
                        const SynthIcon = getIcon(synth.icon);
                        const isActive = currentInstrument.synthType === synthType;

                        return (
                          <button
                            key={synthType}
                            onClick={() => handleChangeSynthType(synthType)}
                            className={`p-2 text-left rounded border transition-all flex items-center gap-2 ${
                              isActive
                                ? 'bg-accent-primary/20 border-accent-primary'
                                : 'bg-dark-bg hover:bg-dark-bgHover border-transparent hover:border-accent-primary/50'
                            }`}
                          >
                            <SynthIcon size={16} className={isActive ? 'text-accent-primary' : synth.color} />
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium text-sm truncate ${isActive ? 'text-accent-primary' : 'text-text-primary'}`}>
                                {synth.shortName}
                              </div>
                              <div className="text-xs text-text-muted truncate">{synth.bestFor[0]}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {filteredSynths.length === 0 && (
                      <div className="text-center py-4 text-text-muted text-sm">No synths found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Synth Info */}
        <div className="px-4 py-3 bg-dark-bg border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-dark-bgSecondary ${synthInfo.color}`}>
              <IconComponent size={24} />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-text-primary">{synthInfo.name}</div>
              <div className="text-xs text-text-muted">{synthInfo.description}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {synthInfo.bestFor.map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-dark-bgSecondary text-text-muted">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Parameters Section */}
        <div>
          {currentInstrument.synthType === 'TB303' && currentInstrument.tb303 ? (
            <VisualTB303Editor config={currentInstrument.tb303} onChange={handleTB303Change} />
          ) : (
            <VisualSynthEditor
              instrument={currentInstrument}
              onChange={(updates) => updateInstrument(currentInstrument.id, updates)}
            />
          )}
        </div>

        {/* Test Keyboard */}
        <div className="p-4 border-t border-dark-border bg-dark-bgSecondary">
          <TestKeyboard instrument={currentInstrument} />
        </div>
      </div>
    </div>
  );
};
