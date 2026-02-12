/**
 * EffectParameterEditor - Visual knob-based editor for effect parameters
 * Works with both master effects and channel effects
 * Supports dynamic neural parameters from GuitarML models
 *
 * UPDATED: Now uses VisualEffectEditors with knob-based interface
 */

import React, { useMemo } from 'react';
import type { EffectConfig } from '../../types/instrument';
import { X, Volume2, AlertTriangle } from 'lucide-react';
import { NeuralParameterMapper } from '@engine/effects/NeuralParameterMapper';
import { VisualEffectEditorWrapper, getVisualEffectEditor } from './VisualEffectEditors';
import { Knob } from '@components/controls/Knob';

interface EffectParameter {
  name: string;
  key: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  implemented?: boolean; // For neural parameters
}

// Neural parameter schema (legacy support) - exported for reference
// eslint-disable-next-line react-refresh/only-export-components
export const NEURAL_PARAMETER_SCHEMA: Record<string, EffectParameter[]> = {};

interface EffectParameterEditorProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateWet: (wet: number) => void;
  onClose?: () => void;
}

export const EffectParameterEditor: React.FC<EffectParameterEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
  onClose,
}) => {
  // Check if we have a visual editor for this effect type
  const hasVisualEditor = useMemo(() => {
    const EditorComponent = getVisualEffectEditor(effect.type);
    // If it returns GenericEffectEditor, we might need fallback for neural
    return EditorComponent.name !== 'GenericEffectEditor';
  }, [effect.type]);

  // Suppress unused variable warning - used for conditional rendering logic
  void hasVisualEditor;

  // For neural effects, get parameters dynamically
  const neuralParameters = useMemo((): EffectParameter[] | null => {
    if (effect.category !== 'neural' || effect.neuralModelIndex === undefined) {
      return null;
    }

    const mapper = new NeuralParameterMapper(effect.neuralModelIndex);
    const neuralParams = mapper.getAvailableParameters();

    return neuralParams.map(param => ({
      name: param.name,
      key: param.key,
      min: 0,
      max: 100,
      step: 1,
      unit: param.unit || '%',
      defaultValue: param.default,
      implemented: param.implemented,
    }));
  }, [effect.category, effect.neuralModelIndex]);

  // If it's a neural effect, render special neural editor
  if (neuralParameters) {
    return (
      <NeuralEffectEditor
        effect={effect}
        parameters={neuralParameters}
        onUpdateParameter={onUpdateParameter}
        onUpdateWet={onUpdateWet}
        onClose={onClose}
      />
    );
  }

  // WAM effects use the generic visual editor (WAM plugins provide their own native GUI
  // via the VisualEffectEditors dispatch, or fall through to GenericEffectEditor)

  // Use visual editor for standard effects
  return (
    <VisualEffectEditorWrapper
      effect={effect}
      onUpdateParameter={onUpdateParameter}
      onUpdateWet={onUpdateWet}
      onClose={onClose}
    />
  );
};

// ============================================================================
// NEURAL EFFECT EDITOR (for GuitarML models)
// ============================================================================

interface NeuralEffectEditorProps {
  effect: EffectConfig;
  parameters: EffectParameter[];
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateWet: (wet: number) => void;
  onClose?: () => void;
}

function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
      <h3 className="text-xs font-black text-white/90 uppercase tracking-[0.15em]">{title}</h3>
    </div>
  );
}

/** Neural pedal enclosure shadow */
const NEURAL_SHADOW = [
  '0 6px 16px rgba(0,0,0,0.5)',
  '0 2px 4px rgba(0,0,0,0.7)',
  'inset 0 1px 0 rgba(255,255,255,0.06)',
  'inset 0 -1px 0 rgba(0,0,0,0.4)',
].join(', ');

const NeuralEffectEditor: React.FC<NeuralEffectEditorProps> = ({
  effect,
  parameters,
  onUpdateParameter,
  onUpdateWet,
  onClose,
}) => {
  const getParameterValue = (param: EffectParameter): number => {
    const value = effect.parameters[param.key] ?? param.defaultValue;
    return typeof value === 'number' ? value : param.defaultValue;
  };

  // Split parameters into implemented and unimplemented
  const implementedParams = parameters.filter(p => p.implemented !== false);
  const unimplementedParams = parameters.filter(p => p.implemented === false);

  return (
    <div
      className="synth-editor-container rounded-xl overflow-hidden select-none"
      style={{
        background: 'linear-gradient(170deg, #1a0a20 0%, #100618 100%)',
        border: '2px solid #281430',
        boxShadow: NEURAL_SHADOW,
      }}
    >
      {/* Pedal Header — glass-like with LED */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)',
          borderBottom: '1px solid #281430',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.15))',
              border: '1px solid rgba(168,85,247,0.2)',
              boxShadow: '0 0 12px rgba(168,85,247,0.1)',
            }}
          >
            <Volume2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-wide">{effect.type}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {/* LED indicator */}
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: effect.enabled ? '#c084fc' : '#1a0a20',
                  boxShadow: effect.enabled
                    ? '0 0 4px 1px rgba(192,132,252,0.5), 0 0 10px 3px rgba(192,132,252,0.15)'
                    : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                  transition: 'all 0.3s ease',
                }}
              />
              <p className="text-[11px] text-gray-400 font-medium">
                Neural Effect | {effect.enabled ? 'Active' : 'Bypassed'}
              </p>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Implemented Parameters */}
        {implementedParams.length > 0 && (
          <section className="rounded-xl p-4 border border-white/[0.04] bg-black/30 backdrop-blur-sm">
            <SectionHeader color="#a855f7" title="Parameters" />
            <div className="flex flex-wrap justify-around gap-4">
              {implementedParams.map((param) => (
                <Knob
                  key={param.key}
                  value={getParameterValue(param)}
                  min={param.min}
                  max={param.max}
                  onChange={(v) => onUpdateParameter(param.key, v)}
                  label={param.name}
                  size="sm"
                  color="#a855f7"
                  formatValue={(v) => `${Math.round(v)}${param.unit}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Unimplemented Parameters (show as disabled) */}
        {unimplementedParams.length > 0 && (
          <section className="rounded-xl p-4 border border-white/[0.04] bg-black/30 backdrop-blur-sm opacity-50">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} className="text-yellow-500" />
              <h3 className="text-[11px] font-black text-yellow-500/80 uppercase tracking-[0.15em]">
                Coming Soon
              </h3>
            </div>
            <div className="flex flex-wrap justify-around gap-4">
              {unimplementedParams.map((param) => (
                <Knob
                  key={param.key}
                  value={getParameterValue(param)}
                  min={param.min}
                  max={param.max}
                  onChange={() => {}} // Disabled
                  label={param.name}
                  size="sm"
                  color="#6b7280"
                  formatValue={(v) => `${Math.round(v)}${param.unit}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Mix */}
        <section className="rounded-xl p-4 border border-white/[0.04] bg-black/30 backdrop-blur-sm">
          <SectionHeader color="#ec4899" title="Output" />
          <div className="flex justify-center">
            <Knob
              value={effect.wet}
              min={0}
              max={100}
              onChange={onUpdateWet}
              label="Mix"
              size="lg"
              color="#ec4899"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </section>

        {/* Info */}
        <div className="rounded-lg p-3 border border-white/[0.04] bg-black/20">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Neural effects use machine learning models for authentic amp/pedal emulation.
            Changes are applied in real-time.
          </p>
        </div>
      </div>
    </div>
  );
};
