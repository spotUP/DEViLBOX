/**
 * MasterEffectsModal - Full-screen modal for master effects editing
 * Now supports both Tone.js and Neural effects in a single unified list
 */

import React, { useState, useCallback } from 'react';
import { X, Settings, Volume2, ChevronDown, Save, Sliders, Cpu, AlertTriangle } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EffectConfig, EffectType } from '@typedefs/instrument';
import { useAudioStore } from '@stores/useAudioStore';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@constants/masterFxPresets';
import { EffectParameterEditor } from './EffectParameterEditor';
import { getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';

// User preset storage key
const USER_MASTER_FX_PRESETS_KEY = 'master-fx-user-presets';

interface UserMasterFxPreset {
  name: string;
  effects: EffectConfig[];
}

// AVAILABLE_EFFECTS now imported from unifiedEffects.ts (60 total: 23 Tone.js + 37 Neural)

interface MasterEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MasterEffectsModal: React.FC<MasterEffectsModalProps> = ({ isOpen, onClose }) => {
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [editingEffect, setEditingEffect] = useState<EffectConfig | null>(null);

  const {
    masterEffects,
    addMasterEffectConfig,
    removeMasterEffect,
    updateMasterEffect,
    reorderMasterEffects,
    setMasterEffects,
  } = useAudioStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get user presets from localStorage with validation
  const getUserPresets = useCallback((): UserMasterFxPreset[] => {
    try {
      const stored = localStorage.getItem(USER_MASTER_FX_PRESETS_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      // Validate structure: must be array of objects with name and effects
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (p): p is UserMasterFxPreset =>
          p !== null &&
          typeof p === 'object' &&
          typeof p.name === 'string' &&
          Array.isArray(p.effects)
      );
    } catch {
      return [];
    }
  }, []);

  // Save current settings as user preset
  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;

    const userPresets = getUserPresets();
    userPresets.push({
      name: presetName.trim(),
      effects: masterEffects.map(fx => ({ ...fx })),
    });
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets));

    setPresetName('');
    setShowSaveDialog(false);
  }, [presetName, masterEffects, getUserPresets]);

  // Load a factory preset
  const handleLoadPreset = useCallback((preset: MasterFxPreset) => {
    const effects: EffectConfig[] = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`,
    }));
    setMasterEffects(effects);
    setShowPresetMenu(false);
  }, [setMasterEffects]);

  // Load user preset
  const handleLoadUserPreset = useCallback((preset: UserMasterFxPreset) => {
    const effects: EffectConfig[] = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`,
    }));
    setMasterEffects(effects);
    setShowPresetMenu(false);
  }, [setMasterEffects]);

  // Delete user preset
  const handleDeleteUserPreset = useCallback((name: string) => {
    const userPresets = getUserPresets().filter(p => p.name !== name);
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets));
  }, [getUserPresets]);

  // Count neural effects for performance warning
  const neuralEffectCount = masterEffects.filter(fx => fx.category === 'neural').length;

  // Handle adding effect (supports both Tone.js and Neural)
  const handleAddEffect = useCallback((availableEffect: AvailableEffect) => {
    // User Decision #2: Warn before adding 4th neural effect
    if (availableEffect.category === 'neural' && neuralEffectCount >= 3) {
      const proceed = confirm(
        '⚠️ Performance Warning\n\n' +
        'You are adding a 4th neural effect to the master chain. Multiple neural effects can cause high CPU usage and audio glitches.\n\n' +
        'Consider using Tone.js effects or reducing the neural effect count.\n\n' +
        'Continue anyway?'
      );
      if (!proceed) return;
    }

    // Build new effect config
    const newEffect: EffectConfig = {
      id: `master-fx-${Date.now()}`,
      category: availableEffect.category,
      type: (availableEffect.type as EffectType) || 'Distortion', // Default to Distortion for neural
      enabled: true,
      wet: 100,
      parameters: {},
      neuralModelIndex: availableEffect.neuralModelIndex,
      neuralModelName: availableEffect.category === 'neural' ? availableEffect.label : undefined,
    };

    // Get default parameters from neural model schema
    if (availableEffect.category === 'neural' && availableEffect.neuralModelIndex !== undefined) {
      const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
      if (model?.parameters) {
        Object.entries(model.parameters).forEach(([key, param]) => {
          if (param) {
            newEffect.parameters[key] = param.default;
          }
        });
      }
    }

    addMasterEffectConfig(newEffect);
  }, [neuralEffectCount, addMasterEffectConfig]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = masterEffects.findIndex((fx) => fx.id === active.id);
      const newIndex = masterEffects.findIndex((fx) => fx.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderMasterEffects(oldIndex, newIndex);
      }
    }
  };

  const handleToggle = (effectId: string) => {
    const effect = masterEffects.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, { enabled: !effect.enabled });
    }
  };

  const handleWetChange = (effectId: string, wet: number) => {
    updateMasterEffect(effectId, { wet });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const userPresets = getUserPresets();

  // Group factory presets by category
  const presetsByCategory = MASTER_FX_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) {
      acc[preset.category] = [];
    }
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<string, MasterFxPreset[]>);

  // Group effects by category for the add menu
  const effectsByGroup = getEffectsByGroup();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-[1200px] flex flex-col overflow-hidden animate-scale-in">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border bg-dark-bgSecondary">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Settings size={20} className="text-accent-primary" />
              <h2 className="text-lg font-bold text-text-primary">Master Effects</h2>
              <span className="text-xs text-text-muted px-2 py-1 bg-dark-bg rounded">
                {masterEffects.length} FX
              </span>
            </div>

            {/* Presets Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-dark-bgTertiary text-text-primary
                         hover:bg-dark-bgHover transition-colors flex items-center gap-2"
              >
                Presets <ChevronDown size={14} />
              </button>

              {showPresetMenu && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 max-h-[60vh] overflow-y-auto scrollbar-modern">
                  {/* User Presets */}
                  {userPresets.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0">
                        User Presets
                      </div>
                      {userPresets.map((preset) => (
                        <div
                          key={preset.name}
                          className="flex items-center justify-between px-4 py-3 hover:bg-dark-bgHover cursor-pointer group"
                        >
                          <span
                            onClick={() => handleLoadUserPreset(preset)}
                            className="text-sm text-text-primary flex-1"
                          >
                            {preset.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUserPreset(preset.name);
                            }}
                            className="text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete preset"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="border-t border-dark-border" />
                    </>
                  )}

                  {/* Factory Presets by Category */}
                  {Object.entries(presetsByCategory).map(([category, presets]) => (
                    <div key={category}>
                      <div className="px-4 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0">
                        {category}
                      </div>
                      {presets.map((preset) => (
                        <div
                          key={preset.name}
                          onClick={() => handleLoadPreset(preset)}
                          className="px-4 py-3 hover:bg-dark-bgHover cursor-pointer"
                        >
                          <div className="text-sm text-text-primary">{preset.name}</div>
                          <div className="text-xs text-text-muted">{preset.description}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Preset Button */}
            <button
              onClick={() => setShowSaveDialog(true)}
              className="p-2 rounded-lg text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
              title="Save current effects as preset"
            >
              <Save size={18} />
            </button>
          </div>

          {/* Performance Warning Indicator */}
          {neuralEffectCount >= 3 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle size={14} className="text-yellow-500" />
              <span className="text-xs text-yellow-500 font-medium">
                {neuralEffectCount} neural effects - High CPU usage
              </span>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary"
          >
            <X size={24} />
          </button>
        </div>

        {/* Save Preset Dialog */}
        {showSaveDialog && (
          <div className="px-6 py-4 bg-dark-bgTertiary border-b border-dark-border">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSavePreset();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
                className="flex-1 px-4 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-text-primary
                         placeholder-text-muted focus:outline-none focus:border-accent-primary"
                autoFocus
              />
              <button
                onClick={handleSavePreset}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary text-white hover:bg-accent-primaryHover transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-dark-borderLight transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Signal Flow */}
        <div className="px-6 py-3 bg-dark-bgSecondary border-b border-dark-border">
          <div className="flex items-center gap-3 text-sm font-mono text-text-muted overflow-x-auto">
            <span className="text-accent-primary font-bold whitespace-nowrap">INPUT</span>
            <span>→</span>
            {masterEffects.length > 0 ? (
              masterEffects.map((fx, idx) => (
                <React.Fragment key={fx.id}>
                  <span className={`whitespace-nowrap ${fx.enabled ? 'text-accent-success' : 'text-accent-error'}`}>
                    {fx.type}
                  </span>
                  {idx < masterEffects.length - 1 && <span>→</span>}
                </React.Fragment>
              ))
            ) : (
              <span className="italic text-text-muted">direct</span>
            )}
            <span>→</span>
            <span className="text-accent-primary font-bold whitespace-nowrap flex items-center gap-1">
              <Volume2 size={14} /> OUTPUT
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Effects List */}
          <div className="w-1/2 border-r border-dark-border flex flex-col">
            <div className="p-4 border-b border-dark-border bg-dark-bgSecondary">
              <h3 className="text-sm font-bold text-text-primary mb-3">Effect Chain</h3>
              <p className="text-xs text-text-muted">Drag effects to reorder. Click to edit parameters.</p>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-modern p-4">
              {masterEffects.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-lg">
                  No master effects. Add effects from the panel on the right.
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={masterEffects.map((fx) => fx.id)} strategy={verticalListSortingStrategy}>
                    {masterEffects.map((effect) => (
                      <SortableEffectItem
                        key={effect.id}
                        effect={effect}
                        isSelected={editingEffect?.id === effect.id}
                        onSelect={() => setEditingEffect(effect)}
                        onToggle={() => handleToggle(effect.id)}
                        onRemove={() => removeMasterEffect(effect.id)}
                        onWetChange={(wet) => handleWetChange(effect.id, wet)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Right: Add Effects / Edit Parameters */}
          <div className="w-1/2 flex flex-col">
            {editingEffect ? (
              <>
                <div className="p-4 border-b border-dark-border bg-dark-bgSecondary flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">{editingEffect.type} Parameters</h3>
                    <p className="text-xs text-text-muted">Adjust effect settings</p>
                  </div>
                  <button
                    onClick={() => setEditingEffect(null)}
                    className="text-xs text-text-muted hover:text-accent-primary transition-colors"
                  >
                    Back to Add
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-modern p-4">
                  <EffectParameterEditor
                    effect={editingEffect}
                    onUpdateParameter={(key, value) => {
                      const updates = { parameters: { ...editingEffect.parameters, [key]: value } };
                      updateMasterEffect(editingEffect.id, updates);
                      setEditingEffect({ ...editingEffect, ...updates });
                    }}
                    onUpdateWet={(wet) => {
                      updateMasterEffect(editingEffect.id, { wet });
                      setEditingEffect({ ...editingEffect, wet });
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="p-4 border-b border-dark-border bg-dark-bgSecondary">
                  <h3 className="text-sm font-bold text-text-primary">Add Effect</h3>
                  <p className="text-xs text-text-muted">Select an effect to add to the chain</p>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-modern p-4">
                  <div className="space-y-4">
                    {Object.entries(effectsByGroup).map(([group, groupEffects]) => (
                      <div key={group}>
                        <h4 className="text-xs text-text-muted font-medium uppercase tracking-wide mb-2">{group}</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {groupEffects.map((effect) => (
                            <button
                              key={effect.label}
                              onClick={() => handleAddEffect(effect)}
                              className="px-3 py-2 text-sm rounded-lg border border-dark-border bg-dark-bgSecondary
                                       hover:bg-accent-primary hover:text-white hover:border-accent-primary
                                       transition-colors text-left flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{effect.label}</span>
                              {/* User Decision #4: Visual badges */}
                              {effect.category === 'neural' && (
                                <Cpu size={12} className="flex-shrink-0 opacity-60" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sortable Effect Item Component
interface SortableEffectItemProps {
  effect: EffectConfig;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onWetChange: (wet: number) => void;
}

function SortableEffectItem({ effect, isSelected, onSelect, onToggle, onRemove, onWetChange }: SortableEffectItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: effect.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        bg-dark-bgSecondary border rounded-lg p-4 mb-3 cursor-pointer transition-all
        ${isDragging ? 'shadow-lg ring-2 ring-accent-primary' : ''}
        ${!effect.enabled ? 'opacity-60' : ''}
        ${isSelected ? 'border-accent-primary bg-accent-primary/5' : 'border-dark-border hover:border-dark-borderLight'}
      `}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-text-muted hover:text-accent-primary cursor-grab active:cursor-grabbing p-1"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="10" cy="4" r="1.5" />
            <circle cx="10" cy="8" r="1.5" />
            <circle cx="10" cy="12" r="1.5" />
          </svg>
        </button>

        {/* Effect Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-text-primary">
              {effect.neuralModelName || effect.type}
            </span>
            {/* User Decision #4: Visual badges */}
            {effect.category === 'neural' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded text-[10px] text-purple-300">
                <Cpu size={10} />
                Neural
              </span>
            )}
          </div>
          <div className="text-xs text-text-muted">
            {effect.enabled ? 'Active' : 'Bypassed'} • Wet: {effect.wet}%
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Wet/Dry Control */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              value={effect.wet}
              onChange={(e) => onWetChange(Number(e.target.value))}
              className="w-20 h-1 bg-dark-bg rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary"
            />
          </div>

          {/* Edit Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="p-2 rounded text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
            title="Edit parameters"
          >
            <Sliders size={16} />
          </button>

          {/* On/Off Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`
              p-2 rounded transition-colors
              ${effect.enabled
                ? 'text-accent-success bg-accent-success/10 hover:bg-accent-success/20'
                : 'text-text-muted hover:text-accent-error hover:bg-accent-error/10'
              }
            `}
            title={effect.enabled ? 'Disable' : 'Enable'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>

          {/* Remove Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-2 rounded text-text-muted hover:text-accent-error hover:bg-accent-error/10 transition-colors"
            title="Remove effect"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
