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
} from '@engine/buzzmachines/BuzzmachineEngine';
import { BUZZMACHINE_PRESETS, getBuzzmachinePresetNames } from '@constants/buzzmachinePresets';
import { Knob } from '@components/controls/Knob';

/**
 * Section header component for consistency
 */
function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`w-1 h-4 rounded-full`} style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );
}

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

export const BuzzmachineEditor: React.FC<BuzzmachineEditorProps> = ({
  config,
  onChange,
}) => {
  // Get machine type from config
  const machineTypeStr = config.buzzmachine?.machineType || BuzzmachineType.ARGURU_DISTORTION;
  const machineType = getMachineTypeFromString(machineTypeStr);
  const machineInfo = BUZZMACHINE_INFO[machineType];

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
    <div className="space-y-4">
      {/* Preset Selector (if available) */}
      {hasPresets && (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#06b6d4" title="Presets" />
          <select
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          >
            <option value="">Select preset...</option>
            {presetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Parameters */}
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
        <SectionHeader color="#8b5cf6" title={`${machineInfo.name} Parameters`} />
        
        {machineInfo.parameters.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {machineInfo.parameters.map((param) => {
              const currentValue = parameters[param.index] ?? param.defaultValue;
              const isSwitch = param.type === 'byte' && param.maxValue === 1;

              if (isSwitch) {
                return (
                  <div key={param.index} className="flex flex-col items-center justify-center space-y-2 p-2 bg-gray-900/50 rounded-lg border border-gray-800">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center h-8 flex items-center">
                      {param.name}
                    </span>
                    <button
                      onClick={() => handleParameterChange(param.index, currentValue === 0 ? 1 : 0)}
                      className={`
                        w-full py-2 px-2 rounded font-bold text-[10px] transition-all
                        ${currentValue === 1
                          ? 'bg-green-600/20 text-green-400 ring-1 ring-green-500'
                          : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                        }
                      `}
                    >
                      {currentValue === 1 ? 'ON' : 'OFF'}
                    </button>
                  </div>
                );
              }

              return (
                <div key={param.index} className="flex justify-center">
                  <Knob
                    value={currentValue}
                    min={param.minValue}
                    max={param.maxValue}
                    onChange={(v) => handleParameterChange(param.index, Math.round(v))}
                    label={param.name}
                    size="sm"
                    color="#8b5cf6"
                    formatValue={(v) => formatValue(param, v)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500 text-sm italic">
              No parameters available for this machine.
            </p>
          </div>
        )}
      </section>

      {/* Help Text */}
      <div className="bg-blue-900/10 rounded-xl p-4 border border-blue-900/30">
        <p className="text-xs text-blue-300/80 leading-relaxed italic">
          <span className="text-blue-400 font-bold not-italic">TIP:</span> {getHelpText()}
        </p>
      </div>
    </div>
  );
};
