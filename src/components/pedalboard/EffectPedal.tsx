/**
 * EffectPedal - Realistic guitar pedal enclosure with bypass and parameter controls
 * Inspired by hardware stomp boxes (Big Muff, TS808, RAT, etc.)
 */

import React from 'react';
import { Knob } from '@components/controls/Knob';
import { GripVertical, X, Settings } from 'lucide-react';
import { getModelByIndex } from '@constants/guitarMLRegistry';
import type { PedalboardEffect } from '@typedefs/pedalboard';
import type { PedalboardEffectCategory } from '@typedefs/pedalboard';

interface EffectPedalProps {
  effect: PedalboardEffect;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onParameterChange: (parameter: string, value: number) => void;
  onModelSelect?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

/** Category-based pedal color schemes (inspired by classic hardware) */
const PEDAL_COLORS: Record<PedalboardEffectCategory | 'default', {
  bg: string;       // Main enclosure gradient start
  bgEnd: string;    // Gradient end (darker)
  accent: string;   // Text, label highlights
  knob: string;     // Knob arc color
  border: string;   // Enclosure edge
}> = {
  overdrive:  { bg: '#2a5418', bgEnd: '#1a3a0d', accent: '#8ddd55', knob: '#8ddd55', border: '#3a6a22' },
  distortion: { bg: '#7a3200', bgEnd: '#4a1e00', accent: '#ffaa44', knob: '#ffaa44', border: '#8a4210' },
  amplifier:  { bg: '#6b1212', bgEnd: '#3a0808', accent: '#ff6b6b', knob: '#ff6b6b', border: '#7a2020' },
  eq:         { bg: '#1a3560', bgEnd: '#0d1e3a', accent: '#66aaff', knob: '#66aaff', border: '#2a4570' },
  filter:     { bg: '#4a1860', bgEnd: '#2a0d3a', accent: '#bb77ff', knob: '#bb77ff', border: '#5a2870' },
  modulation: { bg: '#185060', bgEnd: '#0d2e3a', accent: '#55ccdd', knob: '#55ccdd', border: '#286070' },
  delay:      { bg: '#183860', bgEnd: '#0d2040', accent: '#5599ee', knob: '#5599ee', border: '#284870' },
  reverb:     { bg: '#381860', bgEnd: '#200d3a', accent: '#9966ee', knob: '#9966ee', border: '#482870' },
  dynamics:   { bg: '#383838', bgEnd: '#222222', accent: '#aaaaaa', knob: '#cccccc', border: '#484848' },
  cabinet:    { bg: '#4a3018', bgEnd: '#2a1a0d', accent: '#cc9955', knob: '#cc9955', border: '#5a4028' },
  utility:    { bg: '#383838', bgEnd: '#222222', accent: '#aaaaaa', knob: '#cccccc', border: '#484848' },
  default:    { bg: '#2a2a2a', bgEnd: '#1a1a1a', accent: '#cccccc', knob: '#cccccc', border: '#3a3a3a' },
};

/** 3D enclosure shadow — layered for depth like a real metal pedal */
const PEDAL_SHADOW = [
  '0 4px 8px rgba(0,0,0,0.5)',           // Drop shadow
  '0 1px 2px rgba(0,0,0,0.8)',           // Tight edge
  'inset 0 1px 0 rgba(255,255,255,0.08)', // Top bevel highlight
  'inset 0 -1px 0 rgba(0,0,0,0.3)',       // Bottom bevel
].join(', ');

const PEDAL_SHADOW_DISABLED = [
  '0 2px 4px rgba(0,0,0,0.3)',
  'inset 0 1px 0 rgba(255,255,255,0.04)',
].join(', ');

export const EffectPedal: React.FC<EffectPedalProps> = ({
  effect,
  onToggle,
  onRemove,
  onParameterChange,
  onModelSelect,
  dragHandleProps,
}) => {
  const modelInfo = effect.type === 'neural' && effect.modelIndex !== undefined
    ? getModelByIndex(effect.modelIndex)
    : null;

  const category = (modelInfo?.category || 'default') as PedalboardEffectCategory | 'default';
  const colors = PEDAL_COLORS[category] || PEDAL_COLORS.default;

  const handleModelNameClick = () => {
    if (onModelSelect) onModelSelect();
  };

  // Collect available parameter entries
  const paramEntries: { key: string; label: string }[] = [];
  if (effect.parameters?.drive !== undefined) paramEntries.push({ key: 'drive', label: 'Drive' });
  if (effect.parameters?.tone !== undefined) paramEntries.push({ key: 'tone', label: 'Tone' });
  if (effect.parameters?.level !== undefined) paramEntries.push({ key: 'level', label: 'Level' });
  if (effect.parameters?.dryWet !== undefined) paramEntries.push({ key: 'dryWet', label: 'Mix' });
  // Support extra parameters from amp models
  if (effect.parameters?.bass !== undefined) paramEntries.push({ key: 'bass', label: 'Bass' });
  if (effect.parameters?.mid !== undefined) paramEntries.push({ key: 'mid', label: 'Mid' });
  if (effect.parameters?.treble !== undefined) paramEntries.push({ key: 'treble', label: 'Treble' });
  if (effect.parameters?.presence !== undefined) paramEntries.push({ key: 'presence', label: 'Pres' });

  return (
    <div
      className="relative select-none transition-all duration-200"
      style={{
        background: `linear-gradient(170deg, ${colors.bg} 0%, ${colors.bgEnd} 100%)`,
        borderRadius: 12,
        border: `2px solid ${effect.enabled ? colors.border : '#2a2a2a'}`,
        boxShadow: effect.enabled ? PEDAL_SHADOW : PEDAL_SHADOW_DISABLED,
        opacity: effect.enabled ? 1 : 0.55,
        padding: '12px 14px 14px',
        minWidth: 180,
      }}
      role="article"
      aria-label={`${effect.modelName || 'Effect'} pedal`}
    >
      {/* Top bar: drag handle, settings, remove */}
      <div className="flex items-center justify-between mb-1" style={{ minHeight: 20 }}>
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing"
          style={{ color: `${colors.accent}50` }}
          aria-label="Drag to reorder"
          role="button"
          tabIndex={0}
        >
          <GripVertical size={14} />
        </div>

        <div className="flex items-center gap-1">
          {onModelSelect && (
            <button
              onClick={onModelSelect}
              className="p-0.5 rounded transition-colors"
              style={{ color: `${colors.accent}70` }}
              title="Change model"
              aria-label="Change neural model"
            >
              <Settings size={12} />
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-0.5 rounded transition-colors hover:opacity-100"
            style={{ color: '#ff555580' }}
            title="Remove effect"
            aria-label="Remove effect from chain"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Pedal name — big centered label */}
      <div className="text-center mb-1">
        <div
          className={`font-black text-sm uppercase tracking-wider leading-tight ${
            onModelSelect ? 'cursor-pointer hover:opacity-80' : ''
          }`}
          style={{
            color: effect.enabled ? colors.accent : '#555',
            textShadow: effect.enabled ? `0 0 12px ${colors.accent}40` : 'none',
            letterSpacing: '0.1em',
          }}
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
          {effect.type === 'neural' ? effect.modelName : 'Unknown'}
        </div>
        {modelInfo && (
          <div
            className="text-[9px] uppercase tracking-widest mt-0.5"
            style={{ color: `${colors.accent}80` }}
          >
            {modelInfo.category}
          </div>
        )}
      </div>

      {/* LED indicator */}
      <div className="flex justify-center my-2">
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: effect.enabled ? '#ff2222' : '#331111',
            boxShadow: effect.enabled
              ? '0 0 6px 2px rgba(255,0,0,0.5), 0 0 12px 4px rgba(255,0,0,0.2), inset 0 -1px 2px rgba(0,0,0,0.3)'
              : 'inset 0 1px 2px rgba(0,0,0,0.5)',
            transition: 'all 0.3s ease',
          }}
          aria-hidden="true"
        />
      </div>

      {/* Knobs section */}
      {effect.parameters && paramEntries.length > 0 && (
        <div
          className="flex justify-center gap-2 my-3 flex-wrap"
          style={{
            padding: '6px 2px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          {paramEntries.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center" style={{ minWidth: 42 }}>
              <Knob
                value={effect.parameters[key]}
                min={0}
                max={100}
                onChange={(v) => onParameterChange(key, v)}
                label={label}
                size="sm"
                color={colors.knob}
                formatValue={(v) => `${Math.round(v)}%`}
                disabled={!effect.enabled}
              />
            </div>
          ))}
        </div>
      )}

      {/* Stomp switch — big bypass button */}
      <div className="flex justify-center mt-2">
        <button
          onClick={() => onToggle(!effect.enabled)}
          className="relative group transition-all duration-150 active:scale-95"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: effect.enabled
              ? 'linear-gradient(145deg, #555 0%, #333 100%)'
              : 'linear-gradient(145deg, #444 0%, #282828 100%)',
            boxShadow: effect.enabled
              ? 'inset 0 2px 4px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5), 0 0 0 3px rgba(255,255,255,0.05)'
              : 'inset 0 1px 3px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          title={effect.enabled ? 'Bypass effect' : 'Enable effect'}
          aria-label={effect.enabled ? 'Bypass effect' : 'Enable effect'}
          aria-pressed={effect.enabled}
        >
          {/* Inner circle detail */}
          <div
            className="absolute inset-[6px] rounded-full"
            style={{
              background: effect.enabled
                ? 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.1), transparent 60%)'
                : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.06), transparent 60%)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          />
        </button>
      </div>

      {/* Bypassed label */}
      {!effect.enabled && (
        <div
          className="text-center text-[8px] uppercase tracking-widest mt-2"
          style={{ color: '#555' }}
          role="status"
        >
          Bypassed
        </div>
      )}
    </div>
  );
};
