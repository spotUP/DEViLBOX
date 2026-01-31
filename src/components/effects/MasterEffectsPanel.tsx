/**
 * MasterEffectsPanel - Global effects chain that processes all audio output
 * Connects to useAudioStore for master effects management
 */

import React, { useState, useCallback } from 'react';
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
import type { EffectConfig, AudioEffectType as EffectType } from '../../types/instrument';
import { useAudioStore } from '@stores/useAudioStore';
import { Settings, Volume2, X, GripVertical, Power, Sliders, ChevronDown, Save } from 'lucide-react';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@constants/masterFxPresets';

const AVAILABLE_EFFECTS: { type: EffectType; label: string; category: string }[] = [
  // Dynamics
  { type: 'Compressor', label: 'Compressor', category: 'Dynamics' },
  { type: 'EQ3', label: '3-Band EQ', category: 'Dynamics' },

  // Distortion
  { type: 'Distortion', label: 'Distortion', category: 'Distortion' },
  { type: 'BitCrusher', label: 'Bit Crusher', category: 'Distortion' },
  { type: 'Chebyshev', label: 'Chebyshev', category: 'Distortion' },

  // Time-based
  { type: 'Reverb', label: 'Reverb', category: 'Time' },
  { type: 'JCReverb', label: 'JC Reverb', category: 'Time' },
  { type: 'Delay', label: 'Delay', category: 'Time' },
  { type: 'FeedbackDelay', label: 'Feedback Delay', category: 'Time' },
  { type: 'PingPongDelay', label: 'Ping Pong Delay', category: 'Time' },
  { type: 'SpaceEcho', label: 'Space Echo', category: 'Time' },

  // Modulation
  { type: 'BiPhase', label: 'Bi-Phase', category: 'Modulation' },
  { type: 'Chorus', label: 'Chorus', category: 'Modulation' },
  { type: 'Phaser', label: 'Phaser', category: 'Modulation' },
  { type: 'Tremolo', label: 'Tremolo', category: 'Modulation' },
  { type: 'Vibrato', label: 'Vibrato', category: 'Modulation' },
  { type: 'AutoFilter', label: 'Auto Filter', category: 'Modulation' },
  { type: 'AutoPanner', label: 'Auto Panner', category: 'Modulation' },
  { type: 'AutoWah', label: 'Auto Wah', category: 'Modulation' },

  // Pitch/Filter
  { type: 'DubFilter', label: 'Dub Filter', category: 'Filter' },
  { type: 'Filter', label: 'Filter', category: 'Filter' },
  { type: 'PitchShift', label: 'Pitch Shift', category: 'Pitch' },
  { type: 'FrequencyShifter', label: 'Freq Shifter', category: 'Pitch' },

  // Stereo
  { type: 'StereoWidener', label: 'Stereo Widener', category: 'Stereo' },
];

interface SortableEffectItemProps {
  effect: EffectConfig;
  onToggle: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onWetChange: (wet: number) => void;
}

function SortableEffectItem({ effect, onToggle, onRemove, onEdit, onWetChange }: SortableEffectItemProps) {
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
        bg-dark-bgSecondary border border-dark-border rounded-lg p-3 mb-2
        ${isDragging ? 'shadow-lg ring-2 ring-accent-primary' : ''}
        ${!effect.enabled ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-text-muted hover:text-accent-primary cursor-grab active:cursor-grabbing p-1"
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        {/* Effect Name */}
        <div className="flex-1">
          <div className="font-medium text-sm text-text-primary">{effect.type}</div>
          <div className="text-xs text-text-muted">
            {effect.enabled ? 'Active' : 'Bypassed'}
          </div>
        </div>

        {/* Wet/Dry Control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">WET</span>
          <input
            type="range"
            min="0"
            max="100"
            value={effect.wet}
            onChange={(e) => onWetChange(Number(e.target.value))}
            className="w-16 h-1 bg-dark-bg rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                     [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
          <span className="text-xs text-accent-primary font-mono w-8 text-right">
            {effect.wet}%
          </span>
        </div>

        {/* Edit Button */}
        <button
          onClick={onEdit}
          className="p-1.5 rounded text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
          title="Edit parameters"
        >
          <Sliders size={14} />
        </button>

        {/* On/Off Toggle */}
        <button
          onClick={onToggle}
          className={`
            p-1.5 rounded transition-colors
            ${effect.enabled
              ? 'text-accent-success bg-accent-success/10 hover:bg-accent-success/20'
              : 'text-text-muted hover:text-accent-error hover:bg-accent-error/10'
            }
          `}
          title={effect.enabled ? 'Disable' : 'Enable'}
        >
          <Power size={14} />
        </button>

        {/* Remove Button */}
        <button
          onClick={onRemove}
          className="p-1.5 rounded text-text-muted hover:text-accent-error hover:bg-accent-error/10 transition-colors"
          title="Remove effect"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

interface MasterEffectsPanelProps {
  onEditEffect?: (effect: EffectConfig) => void;
}

// User preset storage key
const USER_MASTER_FX_PRESETS_KEY = 'master-fx-user-presets';

interface UserMasterFxPreset {
  name: string;
  effects: EffectConfig[];
}

export const MasterEffectsPanel: React.FC<MasterEffectsPanelProps> = ({ onEditEffect }) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const {
    masterEffects,
    addMasterEffect,
    removeMasterEffect,
    updateMasterEffect,
    reorderMasterEffects,
    setMasterEffects,
  } = useAudioStore();

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
      effects: masterEffects.map(fx => ({ ...fx })), // Clone the effects
    });
    localStorage.setItem(USER_MASTER_FX_PRESETS_KEY, JSON.stringify(userPresets));

    setPresetName('');
    setShowSaveDialog(false);
  }, [presetName, masterEffects, getUserPresets]);

  // Load a factory preset
  const handleLoadPreset = useCallback((preset: MasterFxPreset) => {
    // Convert preset effects to full EffectConfig with IDs
    const effects: EffectConfig[] = preset.effects.map((fx, index) => ({
      ...fx,
      id: `master-fx-${Date.now()}-${index}`,
    }));
    setMasterEffects(effects);
    setShowPresetMenu(false);
  }, [setMasterEffects]);

  // Load user preset
  const handleLoadUserPreset = useCallback((preset: UserMasterFxPreset) => {
    // Re-generate IDs to avoid conflicts
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

  const userPresets = getUserPresets();

  // Group factory presets by category
  const presetsByCategory = MASTER_FX_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) {
      acc[preset.category] = [];
    }
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<string, MasterFxPreset[]>);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleAddEffect = (effectType: EffectType) => {
    addMasterEffect(effectType);
    setShowAddMenu(false);
  };

  const handleToggle = (effectId: string) => {
    const effect = masterEffects.find((fx) => fx.id === effectId);
    if (effect) {
      updateMasterEffect(effectId, { enabled: !effect.enabled });
    }
  };

  const handleRemove = (effectId: string) => {
    removeMasterEffect(effectId);
  };

  const handleWetChange = (effectId: string, wet: number) => {
    updateMasterEffect(effectId, { wet });
  };

  const handleEdit = (effect: EffectConfig) => {
    if (onEditEffect) {
      onEditEffect(effect);
    }
  };

  // Group effects by category for the add menu
  const effectsByCategory = AVAILABLE_EFFECTS.reduce((acc, effect) => {
    if (!acc[effect.category]) {
      acc[effect.category] = [];
    }
    acc[effect.category].push(effect);
    return acc;
  }, {} as Record<string, typeof AVAILABLE_EFFECTS>);

  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-accent-primary" />
          <span className="font-medium text-sm text-text-primary">Master Effects</span>
          <span className="text-xs text-text-muted px-2 py-0.5 bg-dark-bg rounded">
            {masterEffects.length} FX
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="px-3 py-1 text-xs font-medium rounded bg-dark-bg text-text-primary
                       hover:bg-dark-bgHover transition-colors flex items-center gap-1 border border-dark-border"
            >
              Presets <ChevronDown size={12} />
            </button>

            {showPresetMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                {/* User Presets */}
                {userPresets.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary">
                      User Presets
                    </div>
                    {userPresets.map((preset) => (
                      <div
                        key={preset.name}
                        className="flex items-center justify-between px-3 py-2 hover:bg-dark-bgHover cursor-pointer group"
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
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="border-t border-dark-border my-1" />
                  </>
                )}

                {/* Factory Presets by Category */}
                {Object.entries(presetsByCategory).map(([category, presets]) => (
                  <div key={category}>
                    <div className="px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary">
                      {category}
                    </div>
                    {presets.map((preset) => (
                      <div
                        key={preset.name}
                        onClick={() => handleLoadPreset(preset)}
                        className="px-3 py-2 hover:bg-dark-bgHover cursor-pointer"
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
            className="p-1.5 rounded text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
            title="Save current effects as preset"
          >
            <Save size={14} />
          </button>

          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="px-3 py-1 text-xs font-medium rounded bg-accent-primary/10 text-accent-primary
                     hover:bg-accent-primary/20 transition-colors"
          >
            + Add Effect
          </button>
        </div>
      </div>

      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <div className="px-4 py-3 bg-dark-bgTertiary border-b border-dark-border">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
              className="flex-1 px-3 py-1.5 text-sm bg-dark-bg border border-dark-border rounded text-text-primary
                       placeholder-text-muted focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            <button
              onClick={handleSavePreset}
              className="px-3 py-1.5 text-xs font-medium rounded bg-accent-primary text-white hover:bg-accent-primaryHover transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-3 py-1.5 text-xs font-medium rounded bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-dark-borderLight transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Effect Menu */}
      {showAddMenu && (
        <div className="p-4 bg-dark-bgTertiary border-b border-dark-border">
          <div className="text-xs text-text-muted mb-3 font-medium">Select Effect Type:</div>
          <div className="space-y-3">
            {Object.entries(effectsByCategory).map(([category, effects]) => (
              <div key={category}>
                <div className="text-xs text-text-muted mb-1.5 uppercase tracking-wide">{category}</div>
                <div className="flex flex-wrap gap-1">
                  {effects.map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => handleAddEffect(type)}
                      className="px-2 py-1 text-xs rounded border border-dark-border bg-dark-bg
                               hover:bg-accent-primary hover:text-white hover:border-accent-primary
                               transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal Flow */}
      <div className="px-4 py-2 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-2 text-xs font-mono text-text-muted overflow-x-auto">
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
            <Volume2 size={12} /> OUTPUT
          </span>
        </div>
      </div>

      {/* Effects List */}
      <div className="p-4">
        {masterEffects.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-lg">
            No master effects. All audio passes through unchanged.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={masterEffects.map((fx) => fx.id)} strategy={verticalListSortingStrategy}>
              {masterEffects.map((effect) => (
                <SortableEffectItem
                  key={effect.id}
                  effect={effect}
                  onToggle={() => handleToggle(effect.id)}
                  onRemove={() => handleRemove(effect.id)}
                  onEdit={() => handleEdit(effect)}
                  onWetChange={(wet) => handleWetChange(effect.id, wet)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Info */}
      <div className="px-4 pb-4">
        <div className="text-xs text-text-muted p-3 bg-dark-bgSecondary rounded border border-dark-border">
          <strong>Tip:</strong> Drag effects to reorder the signal chain.
          Order matters: compression before reverb sounds different than reverb before compression.
        </div>
      </div>
    </div>
  );
};
