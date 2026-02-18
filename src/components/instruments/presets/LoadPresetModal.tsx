/**
 * LoadPresetModal - Modal for loading factory & user presets into current instrument
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useInstrumentStore } from '@stores';
import { usePresetStore, type PresetCategory as UserPresetCategory } from '@stores/usePresetStore';
import { notify } from '@stores/useNotificationStore';
import { PRESET_CATEGORIES, type PresetCategory } from '@constants/factoryPresets';
import { getSynthInfo } from '@constants/synthCategories';
import { getToneEngine } from '@engine/ToneEngine';
import * as LucideIcons from 'lucide-react';
import { X, Search, Check, Zap, Trash2, Download, Upload, Tag } from 'lucide-react';
import * as Tone from 'tone';
import type { InstrumentConfig, InstrumentPreset } from '@typedefs/instrument';

type BrowseMode = 'factory' | 'user';

interface LoadPresetModalProps {
  onClose: () => void;
}

export const LoadPresetModal: React.FC<LoadPresetModalProps> = ({ onClose }) => {
  const { currentInstrumentId, updateInstrument, setPreviewInstrument } = useInstrumentStore();
  const {
    userPresets,
    deletePreset,
    addToRecent,
    exportPresets,
    importPresets,
    importNKSFFiles,
    exportAllPresetsAsNKSF,
  } = usePresetStore();

  const [browseMode, setBrowseMode] = useState<BrowseMode>('factory');
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('Bass');
  const [userFilterCategory, setUserFilterCategory] = useState<UserPresetCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPresetName, setSelectedPresetName] = useState<string | null>(null);
  const [selectedUserPresetId, setSelectedUserPresetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nksfInputRef = useRef<HTMLInputElement>(null);

  const factoryCategories = Object.keys(PRESET_CATEGORIES) as PresetCategory[];
  const userCategories: (UserPresetCategory | 'All')[] = ['All', 'Bass', 'Lead', 'Pad', 'Drum', 'FX', 'User'];

  // Handle mode change
  const handleModeChange = (mode: BrowseMode) => {
    setBrowseMode(mode);
    setSelectedPresetName(null);
    setSelectedUserPresetId(null);
    setSearchQuery('');
  };

  // Handle category change - reset selection and search
  const handleCategoryChange = (category: PresetCategory) => {
    setActiveCategory(category);
    setSelectedPresetName(null);
    setSearchQuery('');
  };

  // Find the selected preset object (factory or user)
  const selectedPreset = useMemo(() => {
    if (browseMode === 'user' && selectedUserPresetId) {
      const userPreset = userPresets.find(p => p.id === selectedUserPresetId);
      return userPreset ? userPreset.config : null;
    }
    if (browseMode === 'factory' && selectedPresetName) {
      return (PRESET_CATEGORIES[activeCategory] as InstrumentPreset['config'][]).find(p => p.name === selectedPresetName) || null;
    }
    return null;
  }, [browseMode, selectedPresetName, activeCategory, selectedUserPresetId, userPresets]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle preview instrument sync
  useEffect(() => {
    if (selectedPreset) {
      const previewConfig = {
        ...selectedPreset,
        id: 999,
        isLive: true,
      } as InstrumentConfig;

      setPreviewInstrument(previewConfig);
      try {
        getToneEngine().invalidateInstrument(999);
      } catch {
        // Ignored
      }
    } else {
      setPreviewInstrument(null);
    }

    return () => {
      setPreviewInstrument(null);
      // Dispose the preview engine instance to prevent stale sounds
      try {
        getToneEngine().invalidateInstrument(999);
      } catch {
        // Engine may not be available during teardown
      }
    };
  }, [selectedPreset, setPreviewInstrument]);

  // Keyboard support for jamming (2 Octaves, Standard Tracker Layout)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      const keyMap: Record<string, string> = {
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4',
        'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        ',': 'C5',
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5',
        '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6'
      };

      const note = keyMap[e.key.toLowerCase()];
      if (note && selectedPreset) {
        const engine = getToneEngine();
        const previewConfig = { ...selectedPreset, id: 999, isLive: true } as InstrumentConfig;
        engine.triggerPolyNoteAttack(999, note, 1, previewConfig);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      const keyMap: Record<string, string> = {
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4',
        'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        ',': 'C5',
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5',
        '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6'
      };

      const note = keyMap[e.key.toLowerCase()];
      if (note && selectedPreset) {
        const engine = getToneEngine();
        const previewConfig = { ...selectedPreset, id: 999, isLive: true } as InstrumentConfig;
        engine.triggerPolyNoteRelease(999, note, previewConfig);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedPreset]);

  // Get icon for synth type
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[iconName];
    return Icon || LucideIcons.Music2;
  };

  // Filter factory presets
  const filteredFactoryPresets = useMemo(() => {
    const categoryPresets = PRESET_CATEGORIES[activeCategory] || [];
    if (!searchQuery.trim()) return categoryPresets;
    const query = searchQuery.toLowerCase();
    return categoryPresets.filter((preset) =>
      preset.name?.toLowerCase().includes(query) ||
      preset.synthType?.toLowerCase().includes(query)
    );
  }, [activeCategory, searchQuery]);

  // Filter user presets
  const filteredUserPresets = useMemo(() => {
    let presets = userPresets;
    if (userFilterCategory !== 'All') {
      presets = presets.filter(p => p.category === userFilterCategory);
    }
    if (!searchQuery.trim()) return presets;
    const query = searchQuery.toLowerCase();
    return presets.filter((preset) =>
      preset.name.toLowerCase().includes(query) ||
      preset.synthType.toLowerCase().includes(query) ||
      preset.tags.some(t => t.toLowerCase().includes(query))
    );
  }, [userPresets, userFilterCategory, searchQuery]);

  // Handle loading a preset
  const handleLoadPreset = (preset: InstrumentPreset['config']) => {
    if (currentInstrumentId === null) return;
    updateInstrument(currentInstrumentId, preset);
    onClose();
  };

  // Handle loading a user preset
  const handleLoadUserPreset = (presetId: string, config: InstrumentPreset['config']) => {
    if (currentInstrumentId === null) return;
    addToRecent(presetId);
    updateInstrument(currentInstrumentId, config);
    onClose();
  };

  // Auto-preview on click (factory)
  const handleFactoryPresetClick = async (preset: InstrumentPreset['config']) => {
    setSelectedPresetName(preset.name || null);
    setSelectedUserPresetId(null);

    try {
      // Start audio context if needed (required for first interaction)
      await Tone.start();

      const engine = getToneEngine();
      const previewConfig = { ...preset, id: 999, isLive: true } as InstrumentConfig;

      // Ensure WASM synths are initialized before triggering
      await engine.ensureInstrumentReady(previewConfig);

      engine.triggerPolyNoteAttack(999, 'C4', 1, previewConfig);
      setTimeout(() => {
        engine.triggerPolyNoteRelease(999, 'C4', previewConfig);
      }, 300);
    } catch (error) {
      console.warn('[LoadPresetModal] Factory preview failed:', error);
    }
  };

  // Auto-preview on click (user)
  const handleUserPresetClick = async (presetId: string, config: InstrumentPreset['config']) => {
    setSelectedUserPresetId(presetId);
    setSelectedPresetName(null);

    try {
      // Start audio context if needed (required for first interaction)
      await Tone.start();

      const engine = getToneEngine();
      const previewConfig = { ...config, id: 999, isLive: true } as InstrumentConfig;

      // Ensure WASM synths are initialized before triggering
      await engine.ensureInstrumentReady(previewConfig);

      engine.triggerPolyNoteAttack(999, 'C4', 1, previewConfig);
      setTimeout(() => {
        engine.triggerPolyNoteRelease(999, 'C4', previewConfig);
      }, 300);
    } catch (error) {
      console.warn('[LoadPresetModal] User preview failed:', error);
    }
  };

  // Delete user preset
  const handleDeleteUserPreset = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    deletePreset(presetId);
    if (selectedUserPresetId === presetId) {
      setSelectedUserPresetId(null);
    }
    notify.success('Preset deleted', 2000);
  };

  // Export user presets as JSON
  const handleExportJSON = () => {
    const presets = exportPresets();
    if (presets.length === 0) {
      notify.warning('No user presets to export');
      return;
    }
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devilbox-presets.json';
    a.click();
    URL.revokeObjectURL(url);
    notify.success(`Exported ${presets.length} presets`, 2000);
  };

  // Import user presets from JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const presets = JSON.parse(reader.result as string);
        if (Array.isArray(presets)) {
          importPresets(presets);
          notify.success(`Imported ${presets.length} presets`, 2000);
        } else {
          notify.error('Invalid preset file format');
        }
      } catch {
        notify.error('Failed to parse preset file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Import NKSF files
  const handleImportNKSF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const imported = await importNKSFFiles(Array.from(files));
    if (imported.length > 0) {
      notify.success(`Imported ${imported.length} NKSF presets`, 2000);
    } else {
      notify.error('Failed to import NKSF files');
    }
    if (nksfInputRef.current) nksfInputRef.current.value = '';
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Bass: 'text-blue-400', Leads: 'text-yellow-400', Pads: 'text-purple-400',
      Drums: 'text-red-400', 'TR-808': 'text-red-500', 'TR-909': 'text-orange-400',
      'TR-707': 'text-rose-400', 'TR-505': 'text-amber-400', Chip: 'text-cyan-400',
      Furnace: 'text-teal-400', FX: 'text-green-400', Dub: 'text-green-400',
      DubSiren: 'text-red-500', SpaceLaser: 'text-green-500', V2: 'text-amber-500',
      Sam: 'text-amber-500', Synare: 'text-yellow-500', Drumnibus: 'text-emerald-400',
      Keys: 'text-amber-600', MAME: 'text-pink-400', Module: 'text-lime-400',
      // User categories
      Lead: 'text-yellow-400', Pad: 'text-purple-400', Drum: 'text-red-400',
      User: 'text-gray-400', All: 'text-ft2-highlight',
    };
    return colors[category] || 'text-ft2-highlight';
  };

  const presetCount = browseMode === 'factory' ? filteredFactoryPresets.length : filteredUserPresets.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-full h-full bg-ft2-bg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div>
            <h2 className="text-ft2-highlight font-bold text-sm uppercase tracking-widest">LOAD PRESET</h2>
            <p className="text-ft2-textDim text-[10px]">Browse, Jam and Load sounds</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex bg-ft2-bg rounded overflow-hidden border border-ft2-border">
              <button
                onClick={() => handleModeChange('factory')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-tighter transition-all ${
                  browseMode === 'factory'
                    ? 'bg-ft2-cursor text-ft2-bg'
                    : 'text-ft2-textDim hover:text-ft2-text'
                }`}
              >
                Factory
              </button>
              <button
                onClick={() => handleModeChange('user')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-tighter transition-all ${
                  browseMode === 'user'
                    ? 'bg-amber-500 text-black'
                    : 'text-ft2-textDim hover:text-ft2-text'
                }`}
              >
                User ({userPresets.length})
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-ft2-textDim hover:text-ft2-text hover:bg-ft2-border rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3 bg-ft2-header border-b border-ft2-border">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ft2-textDim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={browseMode === 'factory' ? 'Search factory presets...' : 'Search user presets by name, synth type, or tag...'}
              className="w-full pl-10 pr-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none placeholder:text-ft2-textDim/50"
              autoFocus
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 px-4 py-2 bg-ft2-header border-b border-ft2-border">
          {browseMode === 'factory' ? (
            factoryCategories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                  className={`
                    px-3 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-tighter
                    ${isActive
                      ? 'bg-ft2-cursor text-ft2-bg shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                      : `bg-ft2-bg border border-ft2-border hover:border-ft2-highlight ${getCategoryColor(category)}`
                    }
                  `}
                >
                  {category}
                </button>
              );
            })
          ) : (
            <>
              {userCategories.map((category) => {
                const isActive = userFilterCategory === category;
                return (
                  <button
                    key={category}
                    onClick={() => { setUserFilterCategory(category); setSelectedUserPresetId(null); }}
                    className={`
                      px-3 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-tighter
                      ${isActive
                        ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                        : `bg-ft2-bg border border-ft2-border hover:border-amber-500/50 ${getCategoryColor(category)}`
                      }
                    `}
                  >
                    {category}
                  </button>
                );
              })}
              {/* Import/Export buttons in tab bar for user mode */}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1.5 text-[10px] font-bold rounded bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-textDim hover:text-ft2-text transition-all flex items-center gap-1"
                  title="Import presets from JSON file"
                >
                  <Upload size={10} /> Import
                </button>
                <button
                  onClick={() => nksfInputRef.current?.click()}
                  className="px-2 py-1.5 text-[10px] font-bold rounded bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-textDim hover:text-ft2-text transition-all flex items-center gap-1"
                  title="Import .nksf preset files"
                >
                  <Upload size={10} /> NKSF
                </button>
                <button
                  onClick={handleExportJSON}
                  className="px-2 py-1.5 text-[10px] font-bold rounded bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-textDim hover:text-ft2-text transition-all flex items-center gap-1"
                  title="Export all user presets as JSON"
                >
                  <Download size={10} /> Export
                </button>
                <button
                  onClick={() => exportAllPresetsAsNKSF('DEViLBOX User')}
                  className="px-2 py-1.5 text-[10px] font-bold rounded bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-textDim hover:text-ft2-text transition-all flex items-center gap-1"
                  title="Export all presets as .nksf files"
                >
                  <Download size={10} /> NKS
                </button>
              </div>
            </>
          )}
        </div>

        {/* Preset Grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-ft2" key={`${browseMode}-${activeCategory}-${userFilterCategory}`}>
          {browseMode === 'factory' ? (
            // Factory presets
            filteredFactoryPresets.length === 0 ? (
              <div className="flex items-center justify-center h-full text-ft2-textDim font-mono text-sm uppercase">
                No presets found matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredFactoryPresets.map((preset, index) => {
                  const synthInfo = getSynthInfo(preset.synthType || 'Synth');
                  const IconComponent = getIcon(synthInfo.icon);
                  const isSelected = selectedPresetName === preset.name;

                  return (
                    <button
                      key={`${activeCategory}-${preset.name}-${index}`}
                      onClick={() => handleFactoryPresetClick(preset)}
                      onDoubleClick={() => handleLoadPreset(preset)}
                      className={`
                        p-3 rounded border-2 text-left transition-all group
                        ${isSelected
                          ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                          : 'bg-ft2-header border-ft2-border hover:border-ft2-highlight hover:bg-ft2-bg'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <IconComponent size={14} className={isSelected ? 'text-ft2-bg' : synthInfo.color} />
                        <span className={`font-bold text-sm truncate ${isSelected ? 'text-ft2-bg' : 'text-ft2-text'}`}>
                          {preset.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-mono uppercase ${isSelected ? 'text-ft2-bg/80' : 'text-ft2-textDim'}`}>
                          {preset.synthType}
                        </span>
                        {preset.effects && preset.effects.length > 0 && (
                          <span className={`text-[9px] px-1.5 font-bold rounded ${isSelected ? 'bg-ft2-bg/20 text-ft2-bg' : 'bg-green-600/20 text-green-400'}`}>
                            {preset.effects.length} FX
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            // User presets
            filteredUserPresets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-ft2-textDim">
                <span className="font-mono text-sm uppercase">
                  {userPresets.length === 0 ? 'No user presets yet' : `No presets matching "${searchQuery}"`}
                </span>
                {userPresets.length === 0 && (
                  <p className="text-xs text-center max-w-md">
                    Save presets from the instrument editor to build your library.
                    You can also import presets using the buttons above.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredUserPresets.map((preset) => {
                  const synthInfo = getSynthInfo(preset.synthType);
                  const IconComponent = getIcon(synthInfo.icon);
                  const isSelected = selectedUserPresetId === preset.id;

                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleUserPresetClick(preset.id, preset.config)}
                      onDoubleClick={() => handleLoadUserPreset(preset.id, preset.config)}
                      className={`
                        p-3 rounded border-2 text-left transition-all group cursor-pointer relative
                        ${isSelected
                          ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                          : 'bg-ft2-header border-ft2-border hover:border-amber-500/50 hover:bg-ft2-bg'
                        }
                      `}
                    >
                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteUserPreset(e, preset.id)}
                        className={`absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                          isSelected ? 'hover:bg-black/20 text-black/60' : 'hover:bg-red-500/20 text-red-400/60 hover:text-red-400'
                        }`}
                        title="Delete preset"
                      >
                        <Trash2 size={12} />
                      </button>

                      <div className="flex items-center gap-2 mb-1">
                        <IconComponent size={14} className={isSelected ? 'text-black' : synthInfo.color} />
                        <span className={`font-bold text-sm truncate ${isSelected ? 'text-black' : 'text-ft2-text'}`}>
                          {preset.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-mono uppercase ${isSelected ? 'text-black/70' : 'text-ft2-textDim'}`}>
                          {preset.synthType}
                        </span>
                        <span className={`text-[9px] px-1.5 font-bold rounded ${isSelected ? 'bg-black/10 text-black/70' : 'bg-amber-500/10 text-amber-400'}`}>
                          {preset.category}
                        </span>
                      </div>
                      {/* Tags */}
                      {preset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {preset.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className={`text-[8px] px-1 rounded flex items-center gap-0.5 ${
                                isSelected ? 'bg-black/10 text-black/60' : 'bg-ft2-bg text-ft2-textDim'
                              }`}
                            >
                              <Tag size={7} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 py-3 pb-6 sm:pb-3 bg-ft2-header border-t-2 border-ft2-border safe-area-bottom">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
            <div className="text-ft2-textDim text-xs font-mono truncate">
              {presetCount} PRESET{presetCount !== 1 ? 'S' : ''} • {browseMode === 'factory' ? activeCategory.toUpperCase() : (userFilterCategory === 'All' ? 'ALL USER' : userFilterCategory.toUpperCase())}
              {(selectedPresetName || selectedUserPresetId) && <span className="ml-2 text-ft2-text hidden sm:inline">• DOUBLE-CLICK TO APPLY</span>}
            </div>

            {/* Jam Indicator - Hidden on mobile */}
            {selectedPreset && (
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded animate-pulse-glow">
                <Zap size={12} className="text-amber-400 fill-amber-400" />
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">JAM ACTIVE</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-ft2-bg border border-ft2-border text-ft2-text hover:border-ft2-highlight rounded transition-colors font-bold text-xs uppercase"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (browseMode === 'user' && selectedUserPresetId) {
                  const preset = userPresets.find(p => p.id === selectedUserPresetId);
                  if (preset) handleLoadUserPreset(preset.id, preset.config);
                } else if (selectedPreset) {
                  handleLoadPreset(selectedPreset);
                }
              }}
              disabled={!selectedPreset}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 sm:py-2 bg-ft2-cursor text-ft2-bg font-black hover:bg-ft2-highlight rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase text-xs"
            >
              <Check size={16} />
              Load Preset
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportJSON}
      />
      <input
        ref={nksfInputRef}
        type="file"
        accept=".nksf"
        multiple
        className="hidden"
        onChange={handleImportNKSF}
      />
    </div>
  );
};
