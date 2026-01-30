/**
 * BuzzmachineEditor - Parameter editor for Buzz machine effects and generators
 *
 * Provides UI controls for all Buzzmachine types, dynamically rendering
 * parameters based on BUZZMACHINE_INFO.
 */

import React, { useCallback, useMemo } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import {
  BuzzmachineType,
  BUZZMACHINE_INFO,
  type BuzzmachineParameter,
  type BuzzmachineInfo,
} from '@engine/buzzmachines/BuzzmachineEngine';
import { BUZZMACHINE_PRESETS, getBuzzmachinePresetNames } from '@constants/buzzmachinePresets';

interface BuzzmachineEditorProps {
  config: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/**
 * Map string machine type to BuzzmachineType constant
 */
function getMachineTypeFromString(typeStr: string): BuzzmachineType {
  // Check all BuzzmachineType values
  const allTypes = Object.values(BuzzmachineType);
  const found = allTypes.find(t => t === typeStr);
  return found || BuzzmachineType.ARGURU_DISTORTION;
}

/**
 * Get category label for machine type
 */
function getMachineCategory(info: BuzzmachineInfo): string {
  if (info.type === 'generator') return 'Generator';
  if (info.type === 'master') return 'Master';

  // Categorize effects by name patterns
  const name = info.name.toLowerCase();
  if (name.includes('distort') || name.includes('sat') || name.includes('overdrive')) {
    return 'Distortion';
  }
  if (name.includes('filter') || name.includes('svf') || name.includes('notch') || name.includes('philta')) {
    return 'Filter';
  }
  if (name.includes('delay') || name.includes('reverb') || name.includes('freeverb')) {
    return 'Delay/Reverb';
  }
  if (name.includes('chorus') || name.includes('shift')) {
    return 'Modulation';
  }
  if (name.includes('compress') || name.includes('limit') || name.includes('exciter') || name.includes('master') || name.includes('gain')) {
    return 'Dynamics';
  }
  return 'Effect';
}

export const BuzzmachineEditor: React.FC<BuzzmachineEditorProps> = ({
  config,
  onChange,
}) => {
  // Get machine type from config
  const machineTypeStr = config.buzzmachine?.machineType || BuzzmachineType.ARGURU_DISTORTION;
  const machineType = getMachineTypeFromString(machineTypeStr);
  const machineInfo = BUZZMACHINE_INFO[machineType];
  const category = getMachineCategory(machineInfo);

  // Get current parameter values
  const parameters = config.buzzmachine?.parameters || {};

  // Get available presets for this machine type
  const presetNames = useMemo(() => getBuzzmachinePresetNames(machineType), [machineType]);
  const hasPresets = presetNames.length > 0;

  // Handle parameter change
  const handleParameterChange = useCallback(
    (paramIndex: number, value: number) => {
      onChange({
        buzzmachine: {
          ...config.buzzmachine,
          machineType: machineTypeStr,
          parameters: {
            ...parameters,
            [paramIndex]: value,
          },
        },
      });
    },
    [config.buzzmachine, machineTypeStr, parameters, onChange]
  );

  // Handle preset selection
  const handlePresetChange = useCallback(
    (presetName: string) => {
      if (!presetName) return;

      const presets = BUZZMACHINE_PRESETS[machineType];
      const presetConfig = presets?.[presetName];

      if (presetConfig) {
        onChange({
          buzzmachine: presetConfig,
        });
      }
    },
    [machineType, onChange]
  );

  // Format parameter value for display
  const formatValue = (param: BuzzmachineParameter, value: number): string => {
    if (param.type === 'byte') {
      // Byte parameters (0-255)
      if (param.maxValue === 1) {
        // Switch/boolean
        return value === 0 ? 'Off' : 'On';
      }
      return value.toString();
    } else {
      // Word parameters (0-65535)
      const name = param.name.toLowerCase();

      if (name.includes('gain')) {
        // Gain values: display as multiplier
        const multiplier = value / 256;
        return `${multiplier.toFixed(2)}x`;
      } else if (name.includes('threshold')) {
        // Threshold values: display as normalized
        const normalized = value / param.maxValue;
        return `${(normalized * 100).toFixed(0)}%`;
      } else if (name === 'cutoff') {
        // Cutoff: display as percentage
        const normalized = value / param.maxValue;
        return `${(normalized * 100).toFixed(0)}%`;
      } else if (name === 'resonance') {
        // Resonance: display as percentage
        const normalized = value / param.maxValue;
        return `${(normalized * 100).toFixed(0)}%`;
      } else if (name.includes('time') || name.includes('delay')) {
        // Time-based: display in ms
        return `${value}ms`;
      } else if (name.includes('freq')) {
        // Frequency: display in Hz
        return `${value}Hz`;
      }
      return value.toString();
    }
  };

  // Get help text based on machine type
  const getHelpText = (): string => {
    switch (machineType) {
      case BuzzmachineType.ARGURU_DISTORTION:
        return 'Use Saturate mode for warm tube-like distortion. Use Clip mode for hard digital clipping. Enable Phase Inversor for stereo widening.';
      case BuzzmachineType.ELAK_SVF:
        return 'High resonance values create self-oscillation (TB-303 style). Automate cutoff for classic acid sweeps.';
      case BuzzmachineType.FSM_KICK:
      case BuzzmachineType.FSM_KICKXP:
        return 'Classic electronic kick drum. Trigger with notes - lower notes produce deeper kicks.';
      case BuzzmachineType.JESKOLA_TRILOK:
        return 'Versatile drum machine. Use different notes for different drum sounds.';
      case BuzzmachineType.JESKOLA_NOISE:
        return 'White/pink noise generator. Great for snares, hi-hats, and sound effects.';
      case BuzzmachineType.OOMEK_AGGRESSOR:
        return 'Aggressive bass synth inspired by TB-303. Perfect for acid lines.';
      case BuzzmachineType.JESKOLA_FREEVERB:
        return 'High-quality reverb based on Freeverb algorithm. Use for spatial effects.';
      case BuzzmachineType.JESKOLA_DELAY:
      case BuzzmachineType.JESKOLA_CROSSDELAY:
        return 'Classic delay effect. CrossDelay adds stereo ping-pong effect.';
      case BuzzmachineType.FSM_CHORUS:
      case BuzzmachineType.FSM_CHORUS2:
        return 'Lush chorus effect for thickening sounds. Chorus2 has more modulation options.';
      case BuzzmachineType.GEONIK_COMPRESSOR:
        return 'Dynamic range compressor. Use for punchy drums or glue on buses.';
      case BuzzmachineType.OOMEK_MASTERIZER:
        return 'Mastering processor with limiting and enhancement.';
      default:
        if (machineInfo.type === 'generator') {
          return 'Sound generator. Trigger with MIDI notes to produce audio.';
        }
        return 'Audio effect processor. Route audio through this for processing.';
    }
  };

  return (
    <div className="space-y-6">
      {/* Machine Info */}
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">
            {machineInfo.name}
          </h3>
          <span className={`
            px-2 py-0.5 rounded text-xs font-medium
            ${machineInfo.type === 'generator'
              ? 'bg-green-600/30 text-green-300'
              : machineInfo.type === 'master'
                ? 'bg-purple-600/30 text-purple-300'
                : 'bg-blue-600/30 text-blue-300'}
          `}>
            {category}
          </span>
        </div>
        <p className="text-sm text-zinc-400">
          by {machineInfo.author}
        </p>
      </div>

      {/* Preset Selector (if available) */}
      {hasPresets && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Presets
          </h4>
          <select
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-white
              focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">Select preset...</option>
            {presetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Parameters */}
      {machineInfo.parameters.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Parameters
          </h4>

          {machineInfo.parameters.map((param) => {
            const currentValue = parameters[param.index] ?? param.defaultValue;
            const isSwitch = param.type === 'byte' && param.maxValue === 1;

            return (
              <div key={param.index} className="space-y-2">
                {/* Parameter Label */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-200">
                    {param.name}
                  </label>
                  <span className="text-sm font-mono text-zinc-400">
                    {formatValue(param, currentValue)}
                  </span>
                </div>

                {/* Parameter Control */}
                {isSwitch ? (
                  // Switch/Toggle for byte parameters with max=1
                  <button
                    onClick={() => handleParameterChange(param.index, currentValue === 0 ? 1 : 0)}
                    className={`
                      w-full py-2 px-4 rounded-md font-medium transition-colors
                      ${currentValue === 1
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }
                    `}
                  >
                    {currentValue === 1 ? 'ON' : 'OFF'}
                  </button>
                ) : (
                  // Slider for numeric parameters
                  <div className="relative">
                    <input
                      type="range"
                      min={param.minValue}
                      max={param.maxValue}
                      value={currentValue}
                      onChange={(e) => handleParameterChange(param.index, parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-4
                        [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-cyan-500
                        [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:hover:bg-cyan-400
                        [&::-webkit-slider-thumb]:transition-colors
                        [&::-moz-range-thumb]:w-4
                        [&::-moz-range-thumb]:h-4
                        [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-cyan-500
                        [&::-moz-range-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:hover:bg-cyan-400
                        [&::-moz-range-thumb]:border-0
                        [&::-moz-range-thumb]:transition-colors"
                    />
                  </div>
                )}

                {/* Parameter Description */}
                {param.description && param.description !== param.name && (
                  <p className="text-xs text-zinc-500">
                    {param.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // No parameters message
        <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
          <p className="text-sm text-zinc-400">
            {machineInfo.type === 'generator'
              ? 'This generator uses WASM-defined parameters. Play notes to trigger sounds.'
              : 'This effect uses WASM-defined parameters that are set internally.'}
          </p>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <span className="text-zinc-300 font-medium">Tip:</span> {getHelpText()}
        </p>
      </div>
    </div>
  );
};
