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
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );
}

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
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600">
            <Volume2 size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{effect.type}</h2>
            <p className="text-xs text-gray-400">
              Neural Effect | {effect.enabled ? 'Active' : 'Bypassed'}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Implemented Parameters */}
        {implementedParams.length > 0 && (
          <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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
          <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 opacity-50">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} className="text-yellow-500" />
              <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wide">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
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
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
          <p className="text-xs text-gray-400 leading-relaxed">
            Neural effects use machine learning models for authentic amp/pedal emulation.
            Changes are applied in real-time.
          </p>
        </div>
      </div>
    </div>
  );
};
