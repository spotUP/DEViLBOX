/**
 * EffectChain - Visual effects chain builder with drag-and-drop reordering
 * SYNTH → FX1 → FX2 → FX3 → OUT
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
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface EffectChainProps {
  instrumentId: number;
  effects: EffectConfig[];
  onEditEffect?: (effect: EffectConfig) => void;
}

const AVAILABLE_EFFECTS: EffectType[] = [
  'Distortion',
  'Reverb',
  'Delay',
  'Chorus',
  'Phaser',
  'Tremolo',
  'Vibrato',
  'AutoFilter',
  'AutoPanner',
  'AutoWah',
  'BitCrusher',
  'Chebyshev',
  'FeedbackDelay',
  'FrequencyShifter',
  'PingPongDelay',
  'PitchShift',
  'Compressor',
  'EQ3',
  'Filter',
  'JCReverb',
  'StereoWidener',
];

interface SortableEffectProps {
  effect: EffectConfig;
  onToggle: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onWetChange: (wet: number) => void;
}

function SortableEffect({ effect, onToggle, onRemove, onEdit, onWetChange }: SortableEffectProps) {
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
        bg-ft2-header border border-ft2-border p-3 mb-2
        ${isDragging ? 'shadow-lg' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-ft2-textDim hover:text-ft2-highlight cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="6" cy="4" r="1.5" />
            <circle cx="10" cy="4" r="1.5" />
            <circle cx="6" cy="8" r="1.5" />
            <circle cx="10" cy="8" r="1.5" />
            <circle cx="6" cy="12" r="1.5" />
            <circle cx="10" cy="12" r="1.5" />
          </svg>
        </button>

        {/* Effect Name */}
        <div className="flex-1 font-mono text-sm font-bold text-ft2-text">
          {effect.type}
        </div>

        {/* Wet/Dry Control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-ft2-textDim">WET</span>
          <input
            type="range"
            min="0"
            max="100"
            value={effect.wet}
            onChange={(e) => onWetChange(Number(e.target.value))}
            className="w-20 h-1 bg-ft2-bg rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ft2-highlight
                     [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ft2-highlight [&::-moz-range-thumb]:border-0"
          />
          <span className="text-xs text-ft2-highlight font-mono w-8 text-right">
            {effect.wet}%
          </span>
        </div>

        {/* Edit Button */}
        <button
          onClick={onEdit}
          className="px-2 py-1 text-xs border border-ft2-border bg-ft2-bg
                   hover:border-ft2-highlight hover:text-ft2-highlight transition-colors"
          title="Edit parameters"
        >
          EDIT
        </button>

        {/* On/Off Toggle */}
        <button
          onClick={onToggle}
          className={`
            px-2 py-1 text-xs border font-bold transition-colors
            ${
              effect.enabled
                ? 'border-green-500 bg-green-900 text-green-300 hover:bg-green-800'
                : 'border-red-500 bg-red-900 text-red-300 hover:bg-red-800'
            }
          `}
        >
          {effect.enabled ? 'ON' : 'OFF'}
        </button>

        {/* Remove Button */}
        <button
          onClick={onRemove}
          className="px-2 py-1 text-xs border border-ft2-border bg-ft2-bg
                   hover:border-red-500 hover:text-red-500 transition-colors"
          title="Remove effect"
        >
          X
        </button>
      </div>

      {/* Effect Status */}
      {!effect.enabled && (
        <div className="mt-2 text-xs text-red-400 font-mono">BYPASSED</div>
      )}
    </div>
  );
}

export const EffectChain: React.FC<EffectChainProps> = ({
  instrumentId,
  effects,
  onEditEffect,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const { updateEffect, removeEffect, addEffect, reorderEffects } = useInstrumentStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = effects.findIndex((fx) => fx.id === active.id);
      const newIndex = effects.findIndex((fx) => fx.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderEffects(instrumentId, oldIndex, newIndex);
      }
    }
  };

  const handleAddEffect = (effectType: EffectType) => {
    addEffect(instrumentId, effectType);
    setShowAddMenu(false);
  };

  const handleToggle = (effectId: string) => {
    const effect = effects.find((fx) => fx.id === effectId);
    if (effect) {
      updateEffect(instrumentId, effectId, { enabled: !effect.enabled });
    }
  };

  const handleRemove = (effectId: string) => {
    removeEffect(instrumentId, effectId);
  };

  const handleEdit = (effect: EffectConfig) => {
    if (onEditEffect) {
      onEditEffect(effect);
    }
  };

  const handleWetChange = (effectId: string, wet: number) => {
    updateEffect(instrumentId, effectId, { wet });
  };

  return (
    <div className="p-4 bg-ft2-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-ft2-border">
        <div className="text-ft2-highlight text-sm font-bold">EFFECTS CHAIN</div>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="px-3 py-1 text-xs border border-ft2-border bg-ft2-header
                   hover:border-ft2-highlight hover:text-ft2-highlight transition-colors font-bold"
        >
          + ADD EFFECT
        </button>
      </div>

      {/* Add Effect Dropdown */}
      {showAddMenu && (
        <div className="mb-4 p-3 bg-ft2-header border border-ft2-highlight max-h-64 overflow-y-auto scrollbar-ft2">
          <div className="text-xs text-ft2-textDim mb-2 font-bold">SELECT EFFECT:</div>
          <div className="grid grid-cols-2 gap-1">
            {AVAILABLE_EFFECTS.map((effectType) => (
              <button
                key={effectType}
                onClick={() => handleAddEffect(effectType)}
                className="px-2 py-1 text-xs text-left border border-ft2-border bg-ft2-bg
                         hover:bg-ft2-cursor hover:text-ft2-bg hover:border-ft2-highlight
                         transition-colors font-mono"
              >
                {effectType}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Signal Flow Diagram */}
      <div className="mb-4 p-3 bg-ft2-header border border-ft2-border">
        <div className="flex items-center justify-between text-xs font-mono text-ft2-textDim">
          <span className="text-ft2-highlight font-bold">SYNTH</span>
          <span>→</span>
          {effects.length > 0 ? (
            <>
              {effects.map((fx, idx) => (
                <React.Fragment key={fx.id}>
                  <span className={fx.enabled ? 'text-green-400' : 'text-red-400'}>
                    FX{idx + 1}
                  </span>
                  <span>→</span>
                </React.Fragment>
              ))}
            </>
          ) : (
            <>
              <span className="text-ft2-textDim italic">no effects</span>
              <span>→</span>
            </>
          )}
          <span className="text-ft2-highlight font-bold">OUT</span>
        </div>
      </div>

      {/* Effect List */}
      {effects.length === 0 ? (
        <div className="p-8 text-center text-ft2-textDim text-sm border border-dashed border-ft2-border">
          No effects. Click "ADD EFFECT" to get started.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={effects.map((fx) => fx.id)} strategy={verticalListSortingStrategy}>
            {effects.map((effect) => (
              <SortableEffect
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

      {/* Info */}
      <div className="mt-4 text-xs text-ft2-textDim">
        <div className="font-bold mb-1">TIPS:</div>
        <ul className="list-disc list-inside space-y-1">
          <li>Drag effects to reorder the signal chain</li>
          <li>Use WET control to blend effect with dry signal</li>
          <li>Click EDIT to adjust effect parameters</li>
          <li>Toggle ON/OFF to bypass effects</li>
        </ul>
      </div>
    </div>
  );
};
