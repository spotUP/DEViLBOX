/**
 * GenericSynthEditor - Universal parameter editor for all non-TB303 synth types
 * Provides controls for oscillator, envelope, and filter parameters
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_CHIP_SYNTH } from '@typedefs/instrument';
import { OscillatorEditor } from './OscillatorEditor';
import { EnvelopeEditor } from './EnvelopeEditor';
import { FilterEditor } from './FilterEditor';
import { SampleEditor } from './SampleEditor';
import { ArpeggioEditor } from './ArpeggioEditor';

// Sample-based synth types
const SAMPLE_SYNTH_TYPES = ['Sampler', 'Player', 'GranularSynth'];

interface GenericSynthEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const GenericSynthEditor: React.FC<GenericSynthEditorProps> = ({
  instrument,
  onChange,
}) => {
  const isSampleBased = SAMPLE_SYNTH_TYPES.includes(instrument.synthType);

  return (
    <div className="p-4 space-y-6">
      {/* Synth Type Info */}
      <div className="panel p-4 rounded-lg">
        <div className="font-mono text-accent-primary text-sm font-semibold mb-2">
          {instrument.synthType.toUpperCase()}
        </div>
        <div className="text-text-muted text-xs">
          {getSynthDescription(instrument.synthType)}
        </div>
      </div>

      {/* Sample Editor for sample-based instruments */}
      {isSampleBased && (
        <div className="space-y-3">
          <SampleEditor instrument={instrument} />
        </div>
      )}

      {/* Oscillator Section (if applicable and not sample-based) */}
      {instrument.oscillator && !isSampleBased && (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            OSCILLATOR
          </h3>
          <OscillatorEditor
            config={instrument.oscillator}
            onChange={(oscillator) => onChange({ oscillator })}
          />
        </div>
      )}

      {/* Envelope Section (if applicable) */}
      {instrument.envelope && (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            AMPLITUDE ENVELOPE
          </h3>
          <EnvelopeEditor
            config={instrument.envelope}
            onChange={(envelope) => onChange({ envelope })}
          />
        </div>
      )}

      {/* Filter Section (if applicable) */}
      {instrument.filter && (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            FILTER
          </h3>
          <FilterEditor
            config={instrument.filter}
            onChange={(filter) => onChange({ filter })}
          />
        </div>
      )}

      {/* Special Parameters for specific synth types */}
      {renderSpecialParameters(instrument, onChange)}

      {/* Global Controls */}
      <div className="space-y-3">
        <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
          OUTPUT
        </h3>
        <div className="panel p-4 rounded-lg space-y-4">
          {/* Volume */}
          <div>
            <label className="block font-mono text-text-muted text-xs mb-2">
              VOLUME: <span className="text-accent-primary">{instrument.volume.toFixed(1)} dB</span>
            </label>
            <input
              type="range"
              min="-60"
              max="0"
              step="0.1"
              value={instrument.volume}
              onChange={(e) => onChange({ volume: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Pan */}
          <div>
            <label className="block font-mono text-text-muted text-xs mb-2">
              PAN: <span className="text-accent-primary">
                {instrument.pan > 0 ? 'R' : instrument.pan < 0 ? 'L' : 'C'}
                {Math.abs(instrument.pan)}
              </span>
            </label>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              value={instrument.pan}
              onChange={(e) => onChange({ pan: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Tip */}
      <div className="text-text-muted text-xs italic text-center py-2">
        Tip: Visit the PRESETS tab to load preset sounds or EFFECTS tab to add effects
      </div>
    </div>
  );
};

/**
 * Get description for synth type
 */
function getSynthDescription(synthType: string): string {
  const descriptions: Record<string, string> = {
    Synth: 'Basic monophonic/polyphonic synthesizer',
    MonoSynth: 'Monophonic analog-style synthesizer with sub-oscillator',
    DuoSynth: 'Two-voice synthesizer with frequency modulation',
    FMSynth: 'Frequency modulation synthesizer for bell-like tones',
    AMSynth: 'Amplitude modulation synthesizer for metallic sounds',
    PluckSynth: 'Karplus-Strong physical modeling for plucked strings',
    MetalSynth: 'Inharmonic FM synthesis for metallic percussion',
    MembraneSynth: 'Physical modeling for drum-like sounds',
    NoiseSynth: 'Filtered noise generator for percussion and effects',
    Sampler: 'Sample-based instrument - load any audio file and play it chromatically',
    Player: 'One-shot audio playback - triggers the full sample on each note',
    GranularSynth: 'Granular synthesis - breaks samples into tiny grains for evolving textures',
    Wavetable: 'Wavetable synthesizer with morphing capabilities',
    SuperSaw: 'Massive detuned sawtooth waves for trance and EDM',
    PolySynth: 'True polyphonic synthesizer with voice management',
    Organ: 'Hammond-style drawbar organ simulation',
    DrumMachine: '808/909 style analog drum synthesis',
    ChipSynth: '8-bit video game console sounds',
    PWMSynth: 'Pulse width modulation for rich analog tones',
    StringMachine: 'Vintage ensemble string synthesizer',
    FormantSynth: 'Vowel/formant synthesis for vocal sounds',
  };
  return descriptions[synthType] || 'Synthesizer';
}

/**
 * Render special parameters for specific synth types
 */
function renderSpecialParameters(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
): React.ReactNode {
  const params = instrument.parameters || {};

  switch (instrument.synthType) {
    case 'FMSynth':
      return (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            FM SYNTHESIS
          </h3>
          <div className="panel p-4 rounded-lg space-y-4">
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                MODULATION INDEX: <span className="text-accent-primary">{(params.modulationIndex || 10).toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="0.1"
                value={params.modulationIndex || 10}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, modulationIndex: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                HARMONICITY: <span className="text-accent-primary">{(params.harmonicity || 3).toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={params.harmonicity || 3}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, harmonicity: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      );

    case 'AMSynth':
      return (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            AM SYNTHESIS
          </h3>
          <div className="panel p-4 rounded-lg space-y-4">
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                HARMONICITY: <span className="text-accent-primary">{(params.harmonicity || 3).toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={params.harmonicity || 3}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, harmonicity: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      );

    case 'PluckSynth':
      return (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            PLUCK PARAMETERS
          </h3>
          <div className="panel p-4 rounded-lg space-y-4">
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                DAMPENING: <span className="text-accent-primary">{(params.dampening || 4000).toFixed(0)} Hz</span>
              </label>
              <input
                type="range"
                min="100"
                max="10000"
                step="10"
                value={params.dampening || 4000}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, dampening: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                RESONANCE: <span className="text-accent-primary">{(params.resonance || 0.9).toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="0.99"
                step="0.01"
                value={params.resonance || 0.9}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, resonance: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      );

    case 'MembraneSynth':
      return (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            MEMBRANE PARAMETERS
          </h3>
          <div className="panel p-4 rounded-lg space-y-4">
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                PITCH DECAY: <span className="text-accent-primary">{(params.pitchDecay || 0.05).toFixed(3)}</span>
              </label>
              <input
                type="range"
                min="0.001"
                max="0.5"
                step="0.001"
                value={params.pitchDecay || 0.05}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, pitchDecay: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                OCTAVES: <span className="text-accent-primary">{(params.octaves || 10).toFixed(0)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={params.octaves || 10}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, octaves: parseFloat(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      );

    case 'NoiseSynth':
      return (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            NOISE PARAMETERS
          </h3>
          <div className="panel p-4 rounded-lg space-y-4">
            <div>
              <label className="block font-mono text-text-muted text-xs mb-2">
                NOISE TYPE
              </label>
              <select
                value={params.noiseType || 'white'}
                onChange={(e) =>
                  onChange({
                    parameters: { ...params, noiseType: e.target.value },
                  })
                }
                className="input w-full"
              >
                <option value="white">White</option>
                <option value="pink">Pink</option>
                <option value="brown">Brown</option>
              </select>
            </div>
          </div>
        </div>
      );

    case 'ChipSynth':
      return (
        <div className="space-y-3">
          <h3 className="font-mono text-text-primary text-sm font-bold border-b border-dark-border pb-2">
            ARPEGGIO
          </h3>
          <ArpeggioEditor
            config={instrument.chipSynth?.arpeggio || { enabled: false, speed: 15, pattern: [0, 4, 7] }}
            onChange={(arpeggio) => {
              const currentChip = instrument.chipSynth || DEFAULT_CHIP_SYNTH;
              onChange({
                chipSynth: {
                  ...currentChip,
                  arpeggio,
                },
              });
            }}
          />
        </div>
      );

    default:
      return null;
  }
}
