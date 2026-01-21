/**
 * PedalboardManager - Complete pedalboard chain editor
 * Manages effect chain with drag-drop reordering, add/remove, and parameter controls
 */

import React, { useState, useCallback } from 'react';
import { EffectPedal } from './EffectPedal';
import { ModelBrowser } from './ModelBrowser';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { Plus, Power, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { NeuralModelInfo } from '@typedefs/pedalboard';
import type { NeuralPedalboard, PedalboardEffect } from '@typedefs/pedalboard';
import { useThemeStore } from '@stores';

interface PedalboardManagerProps {
  pedalboard: NeuralPedalboard;
  onChange: (pedalboard: NeuralPedalboard) => void;
  onEnabledChange?: (enabled: boolean) => void;
}

// Generate unique effect IDs
let effectIdCounter = 0;
const generateEffectId = (): string => {
  effectIdCounter++;
  return `effect-${Date.now()}-${effectIdCounter}`;
};

export const PedalboardManager: React.FC<PedalboardManagerProps> = ({
  pedalboard,
  onChange,
  onEnabledChange,
}) => {
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);
  const [editingEffectIndex, setEditingEffectIndex] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
  const bgColor = isCyanTheme ? '#030808' : '#1a1a1a';
  const panelBg = isCyanTheme ? '#051515' : '#1a1a1a';
  const borderColor = isCyanTheme ? '#0a3030' : '#333';

  // Safe onChange wrapper with error handling
  const safeOnChange = useCallback((updatedPedalboard: NeuralPedalboard) => {
    try {
      onChange(updatedPedalboard);
    } catch (error) {
      console.error('[PedalboardManager] Error updating pedalboard:', error);
    }
  }, [onChange]);

  // Add new effect
  const handleAddEffect = useCallback(() => {
    setEditingEffectIndex(null);
    setModelBrowserOpen(true);
  }, []);

  // Change existing effect model
  const handleChangeEffectModel = useCallback((index: number) => {
    // Bounds check
    if (index < 0 || index >= pedalboard.chain.length) {
      console.error('[PedalboardManager] Invalid effect index:', index);
      return;
    }
    setEditingEffectIndex(index);
    setModelBrowserOpen(true);
  }, [pedalboard.chain.length]);

  // Handle model selection from browser
  const handleModelSelect = useCallback(
    (modelInfo: NeuralModelInfo) => {
      if (editingEffectIndex !== null) {
        // Bounds check
        if (editingEffectIndex < 0 || editingEffectIndex >= pedalboard.chain.length) {
          console.error('[PedalboardManager] Invalid editing index:', editingEffectIndex);
          return;
        }
        // Replace existing effect
        const updatedChain = [...pedalboard.chain];
        const existingEffect = updatedChain[editingEffectIndex];
        updatedChain[editingEffectIndex] = {
          ...existingEffect,
          modelIndex: modelInfo.index,
          modelName: modelInfo.name,
        };
        safeOnChange({ ...pedalboard, chain: updatedChain });
      } else {
        // Add new effect
        const newEffect: PedalboardEffect = {
          id: generateEffectId(),
          enabled: true,
          type: 'neural',
          modelIndex: modelInfo.index,
          modelName: modelInfo.name,
          parameters: {
            drive: 50,
            tone: 50,
            level: 75,
            dryWet: 100,
          },
        };
        safeOnChange({
          ...pedalboard,
          chain: [...pedalboard.chain, newEffect],
        });
      }
    },
    [editingEffectIndex, pedalboard, safeOnChange]
  );

  // Toggle effect bypass
  const handleToggleEffect = useCallback(
    (index: number, enabled: boolean) => {
      if (index < 0 || index >= pedalboard.chain.length) return;
      const updatedChain = [...pedalboard.chain];
      updatedChain[index] = { ...updatedChain[index], enabled };
      safeOnChange({ ...pedalboard, chain: updatedChain });
    },
    [pedalboard, safeOnChange]
  );

  // Remove effect
  const handleRemoveEffect = useCallback(
    (index: number) => {
      if (index < 0 || index >= pedalboard.chain.length) return;
      const updatedChain = pedalboard.chain.filter((_, i) => i !== index);
      safeOnChange({ ...pedalboard, chain: updatedChain });
    },
    [pedalboard, safeOnChange]
  );

  // Update effect parameter
  const handleParameterChange = useCallback(
    (index: number, parameter: string, value: number) => {
      if (index < 0 || index >= pedalboard.chain.length) return;
      const updatedChain = [...pedalboard.chain];
      const effect = updatedChain[index];
      if (!effect.parameters) return;

      updatedChain[index] = {
        ...effect,
        parameters: {
          ...effect.parameters,
          [parameter]: value,
        },
      };
      safeOnChange({ ...pedalboard, chain: updatedChain });
    },
    [pedalboard, safeOnChange]
  );

  // Move effect up
  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0 || index >= pedalboard.chain.length) return;
      const updatedChain = [...pedalboard.chain];
      [updatedChain[index - 1], updatedChain[index]] = [updatedChain[index], updatedChain[index - 1]];
      safeOnChange({ ...pedalboard, chain: updatedChain });
    },
    [pedalboard, safeOnChange]
  );

  // Move effect down
  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < 0 || index >= pedalboard.chain.length - 1) return;
      const updatedChain = [...pedalboard.chain];
      [updatedChain[index], updatedChain[index + 1]] = [updatedChain[index + 1], updatedChain[index]];
      safeOnChange({ ...pedalboard, chain: updatedChain });
    },
    [pedalboard, safeOnChange]
  );

  // Clear all effects
  const handleClearAll = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const confirmClearAll = useCallback(() => {
    safeOnChange({ ...pedalboard, chain: [] });
    setShowClearConfirm(false);
  }, [pedalboard, safeOnChange]);

  // Toggle pedalboard enabled
  const handleTogglePedalboard = useCallback(() => {
    const newEnabled = !pedalboard.enabled;
    safeOnChange({ ...pedalboard, enabled: newEnabled });
    if (onEnabledChange) {
      try {
        onEnabledChange(newEnabled);
      } catch (error) {
        console.error('[PedalboardManager] Error in onEnabledChange:', error);
      }
    }
  }, [pedalboard, safeOnChange, onEnabledChange]);

  return (
    <div className="space-y-4" style={{ backgroundColor: bgColor }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor }}>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold" style={{ color: accentColor }}>
            Neural Pedalboard
          </h3>
          <span className="text-xs text-gray-500" role="status">
            {pedalboard.chain.length} effect{pedalboard.chain.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Master Enable/Bypass */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePedalboard}
            icon={<Power size={14} />}
            className={pedalboard.enabled ? 'text-green-400 hover:text-green-300' : 'text-gray-500 hover:text-gray-400'}
            aria-label={pedalboard.enabled ? 'Bypass pedalboard' : 'Enable pedalboard'}
            aria-pressed={pedalboard.enabled}
          >
            {pedalboard.enabled ? 'Enabled' : 'Bypassed'}
          </Button>

          {/* Clear All */}
          {pedalboard.chain.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              icon={<Trash2 size={14} />}
              className="text-red-400 hover:text-red-300"
              aria-label="Clear all effects from chain"
            >
              Clear All
            </Button>
          )}

          {/* Add Effect */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddEffect}
            icon={<Plus size={14} />}
            className="text-blue-400 hover:text-blue-300"
            aria-label="Add new effect to chain"
          >
            Add Effect
          </Button>
        </div>
      </div>

      {/* Input/Output Gain */}
      <div className="px-4 py-3 rounded-lg border" style={{ backgroundColor: panelBg, borderColor }}>
        <div className="grid grid-cols-2 gap-6">
          <div className="flex items-center gap-4">
            <label htmlFor="input-gain" className="text-sm font-medium text-gray-400 min-w-[80px]">
              Input Gain
            </label>
            <div className="flex-1">
              <Knob
                value={pedalboard.inputGain}
                min={0}
                max={200}
                onChange={(v) => safeOnChange({ ...pedalboard, inputGain: v })}
                label=""
                size="sm"
                color={accentColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label htmlFor="output-gain" className="text-sm font-medium text-gray-400 min-w-[80px]">
              Output Gain
            </label>
            <div className="flex-1">
              <Knob
                value={pedalboard.outputGain}
                min={0}
                max={200}
                onChange={(v) => safeOnChange({ ...pedalboard, outputGain: v })}
                label=""
                size="sm"
                color={accentColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Effect Chain */}
      <div className="px-4 space-y-3">
        {pedalboard.chain.length === 0 ? (
          <div
            className="text-center py-12 rounded-lg border-2 border-dashed"
            style={{ borderColor, color: '#666' }}
            role="status"
          >
            <div className="text-sm mb-2">No effects in chain</div>
            <Button
              variant="default"
              size="sm"
              onClick={handleAddEffect}
              icon={<Plus size={14} />}
              aria-label="Add your first effect"
            >
              Add Your First Effect
            </Button>
          </div>
        ) : (
          <div role="list" aria-label="Effect chain">
            {pedalboard.chain.map((effect, index) => (
              <div key={effect.id} className="relative" role="listitem">
                {/* Move Buttons */}
                <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700"
                    style={{ color: '#999' }}
                    title="Move effect up in chain"
                    aria-label="Move effect up in chain"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === pedalboard.chain.length - 1}
                    className="p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700"
                    style={{ color: '#999' }}
                    title="Move effect down in chain"
                    aria-label="Move effect down in chain"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>

                {/* Effect Pedal */}
                <EffectPedal
                  effect={effect}
                  onToggle={(enabled) => handleToggleEffect(index, enabled)}
                  onRemove={() => handleRemoveEffect(index)}
                  onParameterChange={(param, value) => handleParameterChange(index, param, value)}
                  onModelSelect={() => handleChangeEffectModel(index)}
                />

                {/* Chain Connector */}
                {index < pedalboard.chain.length - 1 && (
                  <div className="flex items-center justify-center py-2" aria-hidden="true">
                    <div className="w-0.5 h-4" style={{ backgroundColor: borderColor }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear All Confirmation */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowClearConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-confirm-title"
        >
          <div
            className="p-6 rounded-lg border"
            style={{ backgroundColor: panelBg, borderColor }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="clear-confirm-title" className="text-lg font-bold mb-4" style={{ color: accentColor }}>
              Clear All Effects?
            </h3>
            <p className="text-gray-400 mb-6">
              This will remove all {pedalboard.chain.length} effect{pedalboard.chain.length !== 1 ? 's' : ''} from the chain.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="default" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmClearAll}>
                Clear All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Model Browser Modal */}
      <ModelBrowser
        isOpen={modelBrowserOpen}
        onClose={() => {
          setModelBrowserOpen(false);
          setEditingEffectIndex(null);
        }}
        onSelect={handleModelSelect}
        currentModelIndex={
          editingEffectIndex !== null &&
          editingEffectIndex >= 0 &&
          editingEffectIndex < pedalboard.chain.length &&
          pedalboard.chain[editingEffectIndex]?.type === 'neural'
            ? pedalboard.chain[editingEffectIndex].modelIndex
            : undefined
        }
      />
    </div>
  );
};
