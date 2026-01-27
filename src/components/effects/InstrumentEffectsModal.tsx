/**
 * InstrumentEffectsModal - Unified modal for instrument-level effects
 * Now supports both Tone.js and Neural effects in a single unified list
 * No more separate tabs - all 60 effects available for any instrument
 */

import React, { useState, useCallback } from 'react';
import { X, Settings, Sliders, Cpu, AlertTriangle, ChevronDown } from 'lucide-react';
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import { useInstrumentStore, notify } from '@stores';
import { EffectParameterEditor } from './EffectParameterEditor';
import { AVAILABLE_EFFECTS, getEffectsByGroup, type AvailableEffect } from '@constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@constants/masterFxPresets';

interface InstrumentEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstrumentEffectsModal: React.FC<InstrumentEffectsModalProps> = ({ isOpen, onClose }) => {
  const [editingEffect, setEditingEffect] = useState<EffectConfig | null>(null);
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  const {
    instruments,
    currentInstrumentId,
    addEffectConfig,
    removeEffect,
    updateEffect,
    updateInstrument,
  } = useInstrumentStore();

  // Get current instrument
  const currentInstrument = instruments.find((inst) => inst.id === currentInstrumentId);

  // Load a factory preset
  const handleLoadPreset = useCallback((preset: MasterFxPreset) => {
    if (currentInstrumentId === null) return;
    
    const effects: EffectConfig[] = preset.effects.map((fx, index) => ({
      ...fx,
      id: `instrument-fx-${Date.now()}-${index}`,
    }));
    
    updateInstrument(currentInstrumentId, { effects: effects as any });
    setShowPresetMenu(false);
    notify.success(`Applied ${preset.name} to ${currentInstrument?.name}`);
  }, [currentInstrumentId, updateInstrument, currentInstrument?.name]);

  if (!currentInstrument) {
    return null;
  }

  const effects = currentInstrument.effects || [];

  // Count neural effects for performance warning (User Decision #2)
  const neuralEffectCount = effects.filter(fx => fx.category === 'neural').length;

  const handleAddEffect = (availableEffect: AvailableEffect) => {
    if (currentInstrumentId === null) return;

    // User Decision #2: Warn before adding 4th neural effect
    if (availableEffect.category === 'neural' && neuralEffectCount >= 3) {
      const proceed = confirm(
        '⚠️ Performance Warning\n\n' +
        'You are adding a 4th neural effect. Multiple neural effects can cause high CPU usage and audio glitches.\n\n' +
        'Consider using Tone.js effects or reducing the neural effect count.\n\n' +
        'Continue anyway?'
      );
      if (!proceed) return;
    }

    // Build new effect config
    const newEffect: EffectConfig = {
      id: `effect-${Date.now()}`,
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

    addEffectConfig(currentInstrumentId, newEffect);
  };

  const handleRemoveEffect = (effectId: string) => {
    if (currentInstrumentId !== null) {
      removeEffect(currentInstrumentId, effectId);
    }
  };

  const handleToggle = (effectId: string) => {
    const effect = effects.find((fx) => fx.id === effectId);
    if (effect && currentInstrumentId !== null) {
      updateEffect(currentInstrumentId, effectId, { enabled: !effect.enabled });
    }
  };

  const handleWetChange = (effectId: string, wet: number) => {
    if (currentInstrumentId !== null) {
      updateEffect(currentInstrumentId, effectId, { wet });
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Group effects for the add menu
  const effectsByGroup = getEffectsByGroup();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-[1200px] flex flex-col overflow-hidden animate-scale-in">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border bg-dark-bgSecondary">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-accent-primary" />
            <h2 className="text-lg font-bold text-text-primary">
              {currentInstrument.name || `Instrument ${currentInstrument.id}`} Effects
            </h2>
            <span className="text-xs text-text-muted px-2 py-1 bg-dark-bg rounded">
              {currentInstrument.synthType}
            </span>
            <span className="text-[10px] text-accent-info px-2 py-1 bg-accent-info/10 rounded">
              {AVAILABLE_EFFECTS.length} effects available
            </span>

            {/* Presets Dropdown */}
            <div className="relative ml-2">
              <button
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-dark-bgTertiary text-text-primary
                         hover:bg-dark-bgHover transition-colors flex items-center gap-2 border border-dark-border"
              >
                Presets <ChevronDown size={14} />
              </button>

              {showPresetMenu && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 max-h-[60vh] overflow-y-auto scrollbar-modern">
                  {/* Factory Presets by Category */}
                  {Object.entries(MASTER_FX_PRESETS.reduce((acc, preset) => {
                    if (!acc[preset.category]) acc[preset.category] = [];
                    acc[preset.category].push(preset);
                    return acc;
                  }, {} as Record<string, MasterFxPreset[]>)).map(([category, presets]) => (
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

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Effects Chain */}
          <div className="w-1/2 border-r border-dark-border flex flex-col">
            <div className="p-4 border-b border-dark-border bg-dark-bgSecondary">
              <h3 className="text-sm font-bold text-text-primary mb-3">Effect Chain</h3>
              <p className="text-xs text-text-muted">
                {effects.length} effect{effects.length !== 1 ? 's' : ''} active
                {neuralEffectCount > 0 && ` • ${neuralEffectCount} neural`}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-modern p-4">
              {effects.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-lg">
                  No effects. Add from the panel on the right →
                </div>
              ) : (
                effects.map((effect) => (
                  <div
                    key={effect.id}
                    className={`
                      bg-dark-bgSecondary border rounded-lg p-4 mb-3 cursor-pointer transition-all
                      ${!effect.enabled ? 'opacity-60' : ''}
                      ${editingEffect?.id === effect.id ? 'border-accent-primary bg-accent-primary/5' : 'border-dark-border hover:border-dark-borderLight'}
                    `}
                    onClick={() => setEditingEffect(effect)}
                  >
                    <div className="flex items-center gap-3">
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
                            onChange={(e) => handleWetChange(effect.id, Number(e.target.value))}
                            className="w-20 h-1 bg-dark-bg rounded-lg appearance-none cursor-pointer
                                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary"
                          />
                        </div>

                        {/* Edit Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEffect(effect);
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
                            handleToggle(effect.id);
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
                            handleRemoveEffect(effect.id);
                          }}
                          className="p-2 rounded text-text-muted hover:text-accent-error hover:bg-accent-error/10 transition-colors"
                          title="Remove effect"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Add Effects / Edit Parameters */}
          <div className="w-1/2 flex flex-col">
            {editingEffect ? (
              <>
                <div className="p-4 border-b border-dark-border bg-dark-bgSecondary flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                      {editingEffect.neuralModelName || editingEffect.type} Parameters
                      {editingEffect.category === 'neural' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded text-[10px] text-purple-300">
                          <Cpu size={10} />
                          Neural
                        </span>
                      )}
                    </h3>
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
                      if (currentInstrumentId !== null) {
                        updateEffect(currentInstrumentId, editingEffect.id, updates);
                      }
                      setEditingEffect({ ...editingEffect, ...updates });
                    }}
                    onUpdateWet={(wet) => {
                      if (currentInstrumentId !== null) {
                        updateEffect(currentInstrumentId, editingEffect.id, { wet });
                      }
                      setEditingEffect({ ...editingEffect, wet });
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="p-4 border-b border-dark-border bg-dark-bgSecondary">
                  <h3 className="text-sm font-bold text-text-primary">Add Effect</h3>
                  <p className="text-xs text-text-muted">
                    All {AVAILABLE_EFFECTS.length} effects available (23 Tone.js + 37 Neural)
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-modern p-4">
                  <div className="space-y-4">
                    {Object.entries(effectsByGroup).map(([group, groupEffects]) => (
                      <div key={group}>
                        <h4 className="text-xs text-text-muted font-medium uppercase tracking-wide mb-2">
                          {group}
                        </h4>
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
