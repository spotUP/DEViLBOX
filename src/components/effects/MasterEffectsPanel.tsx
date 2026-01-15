/**
 * MasterEffectsPanel - Global effects chain that processes all audio output
 * Connects to useAudioStore for master effects management
 */

import React, { useState } from 'react';
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
import type { EffectConfig, EffectType } from '../../types/instrument';
import { useAudioStore } from '@stores/useAudioStore';
import { Settings, Volume2, X, GripVertical, Power, Sliders } from 'lucide-react';

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

  // Modulation
  { type: 'Chorus', label: 'Chorus', category: 'Modulation' },
  { type: 'Phaser', label: 'Phaser', category: 'Modulation' },
  { type: 'Tremolo', label: 'Tremolo', category: 'Modulation' },
  { type: 'Vibrato', label: 'Vibrato', category: 'Modulation' },
  { type: 'AutoFilter', label: 'Auto Filter', category: 'Modulation' },
  { type: 'AutoPanner', label: 'Auto Panner', category: 'Modulation' },
  { type: 'AutoWah', label: 'Auto Wah', category: 'Modulation' },

  // Pitch/Filter
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

export const MasterEffectsPanel: React.FC<MasterEffectsPanelProps> = ({ onEditEffect }) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const {
    masterEffects,
    addMasterEffect,
    removeMasterEffect,
    updateMasterEffect,
    reorderMasterEffects
  } = useAudioStore();

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
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="px-3 py-1 text-xs font-medium rounded bg-accent-primary/10 text-accent-primary
                   hover:bg-accent-primary/20 transition-colors"
        >
          + Add Effect
        </button>
      </div>

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
