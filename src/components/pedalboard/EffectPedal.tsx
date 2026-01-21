/**
 * EffectPedal - Individual effect display with bypass and parameter controls
 * Represents a single pedal in the effect chain
 */

import React from 'react';
import { Knob } from '@components/controls/Knob';
import { Power, GripVertical, X, Settings } from 'lucide-react';
import { getModelByIndex } from '@constants/guitarMLRegistry';
import type { PedalboardEffect } from '@typedefs/pedalboard';
import { useThemeStore } from '@stores';

interface EffectPedalProps {
  effect: PedalboardEffect;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onParameterChange: (parameter: string, value: number) => void;
  onModelSelect?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const EffectPedal: React.FC<EffectPedalProps> = ({
  effect,
  onToggle,
  onRemove,
  onParameterChange,
  onModelSelect,
  dragHandleProps,
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const modelInfo = effect.type === 'neural' && effect.modelIndex !== undefined ? getModelByIndex(effect.modelIndex) : null;

  const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
  const enabledColor = isCyanTheme ? '#00ffff' : '#00ff00';
  const disabledColor = isCyanTheme ? '#003333' : '#333';
  const bgColor = isCyanTheme ? '#051515' : '#1a1a1a';
  const borderColor = effect.enabled ? accentColor : (isCyanTheme ? '#0a3030' : '#333');

  const handleModelNameClick = () => {
    if (onModelSelect) {
      onModelSelect();
    }
  };

  return (
    <div
      className="rounded-lg border-2 p-4 transition-all"
      style={{
        backgroundColor: bgColor,
        borderColor,
        opacity: effect.enabled ? 1 : 0.6,
      }}
      role="article"
      aria-label={`${effect.modelName || 'Effect'} pedal`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Drag Handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
            aria-label="Drag to reorder"
            role="button"
            tabIndex={0}
          >
            <GripVertical size={16} />
          </div>

          {/* Model Name */}
          <div>
            <div
              className={`font-bold text-sm ${onModelSelect ? 'cursor-pointer hover:underline' : ''}`}
              style={{ color: effect.enabled ? accentColor : '#666' }}
              onClick={handleModelNameClick}
              role={onModelSelect ? 'button' : undefined}
              tabIndex={onModelSelect ? 0 : undefined}
              onKeyDown={onModelSelect ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleModelNameClick();
                }
              } : undefined}
              aria-label={onModelSelect ? `Change model (currently ${effect.modelName || 'Unknown'})` : undefined}
            >
              {effect.type === 'neural' ? effect.modelName : 'Unknown Effect'}
            </div>
            {modelInfo && (
              <div className="text-xs text-gray-500 uppercase">{modelInfo.category}</div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Power Toggle */}
          <button
            onClick={() => onToggle(!effect.enabled)}
            className="p-1 rounded transition-colors"
            style={{
              backgroundColor: effect.enabled ? `${enabledColor}30` : `${disabledColor}30`,
              color: effect.enabled ? enabledColor : disabledColor,
            }}
            title={effect.enabled ? 'Bypass effect' : 'Enable effect'}
            aria-label={effect.enabled ? 'Bypass effect' : 'Enable effect'}
            aria-pressed={effect.enabled}
          >
            <Power size={16} />
          </button>

          {/* Model Settings */}
          {onModelSelect && (
            <button
              onClick={onModelSelect}
              className="p-1 rounded transition-colors hover:bg-gray-700"
              style={{ color: '#999' }}
              title="Change model"
              aria-label="Change neural model"
            >
              <Settings size={16} />
            </button>
          )}

          {/* Remove */}
          <button
            onClick={onRemove}
            className="p-1 rounded transition-colors hover:bg-red-900"
            style={{ color: '#999' }}
            title="Remove effect from chain"
            aria-label="Remove effect from chain"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Parameters */}
      {effect.enabled && effect.parameters && Object.keys(effect.parameters).length > 0 && (
        <div className="grid grid-cols-4 gap-3 mt-4">
          {/* Drive */}
          {effect.parameters.drive !== undefined && (
            <div className="flex flex-col items-center">
              <Knob
                value={effect.parameters.drive}
                min={0}
                max={100}
                onChange={(v) => onParameterChange('drive', v)}
                label="Drive"
                size="sm"
                color={accentColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          )}

          {/* Tone */}
          {effect.parameters.tone !== undefined && (
            <div className="flex flex-col items-center">
              <Knob
                value={effect.parameters.tone}
                min={0}
                max={100}
                onChange={(v) => onParameterChange('tone', v)}
                label="Tone"
                size="sm"
                color={accentColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          )}

          {/* Level */}
          {effect.parameters.level !== undefined && (
            <div className="flex flex-col items-center">
              <Knob
                value={effect.parameters.level}
                min={0}
                max={100}
                onChange={(v) => onParameterChange('level', v)}
                label="Level"
                size="sm"
                color={accentColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          )}

          {/* Dry/Wet Mix */}
          {effect.parameters.dryWet !== undefined && (
            <div className="flex flex-col items-center">
              <Knob
                value={effect.parameters.dryWet}
                min={0}
                max={100}
                onChange={(v) => onParameterChange('dryWet', v)}
                label="Mix"
                size="sm"
                color={accentColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          )}
        </div>
      )}

      {/* Bypassed State */}
      {!effect.enabled && (
        <div className="mt-3 text-center text-xs text-gray-600 uppercase tracking-wide" role="status">
          Bypassed
        </div>
      )}
    </div>
  );
};
