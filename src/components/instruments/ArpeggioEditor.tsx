/**
 * ArpeggioEditor - Chiptune-style arpeggio editor for ChipSynth
 * Features preset patterns for common chords and custom pattern editing
 */

import React, { useState } from 'react';
import { Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { Knob } from '@components/controls/Knob';

interface ArpeggioConfig {
  enabled: boolean;
  speed: number;    // Hz
  pattern: number[]; // Semitone offsets
}

interface ArpeggioEditorProps {
  config: ArpeggioConfig;
  onChange: (config: ArpeggioConfig) => void;
}

// Arpeggio presets - common chord patterns used in chiptune music
const ARPEGGIO_PRESETS = [
  // Major chords
  { name: 'Major', pattern: [0, 4, 7], category: 'Major' },
  { name: 'Major 7th', pattern: [0, 4, 7, 11], category: 'Major' },
  { name: 'Major 9th', pattern: [0, 4, 7, 11, 14], category: 'Major' },
  { name: 'Major 6th', pattern: [0, 4, 7, 9], category: 'Major' },
  { name: 'Add9', pattern: [0, 4, 7, 14], category: 'Major' },

  // Minor chords
  { name: 'Minor', pattern: [0, 3, 7], category: 'Minor' },
  { name: 'Minor 7th', pattern: [0, 3, 7, 10], category: 'Minor' },
  { name: 'Minor 9th', pattern: [0, 3, 7, 10, 14], category: 'Minor' },
  { name: 'Minor 6th', pattern: [0, 3, 7, 9], category: 'Minor' },

  // Dominant & 7th
  { name: 'Dom 7th', pattern: [0, 4, 7, 10], category: '7th' },
  { name: 'Dom 9th', pattern: [0, 4, 7, 10, 14], category: '7th' },
  { name: 'Dom 7#9', pattern: [0, 4, 7, 10, 15], category: '7th' },

  // Diminished & Augmented
  { name: 'Dim', pattern: [0, 3, 6], category: 'Dim/Aug' },
  { name: 'Dim 7th', pattern: [0, 3, 6, 9], category: 'Dim/Aug' },
  { name: 'Aug', pattern: [0, 4, 8], category: 'Dim/Aug' },
  { name: 'Aug 7th', pattern: [0, 4, 8, 10], category: 'Dim/Aug' },

  // Sus chords
  { name: 'Sus2', pattern: [0, 2, 7], category: 'Sus' },
  { name: 'Sus4', pattern: [0, 5, 7], category: 'Sus' },
  { name: '7Sus4', pattern: [0, 5, 7, 10], category: 'Sus' },

  // Power & Octaves
  { name: 'Power', pattern: [0, 7], category: 'Power' },
  { name: 'Octave', pattern: [0, 12], category: 'Power' },
  { name: 'Power Oct', pattern: [0, 7, 12], category: 'Power' },
  { name: '2 Octaves', pattern: [0, 12, 24], category: 'Power' },

  // Classic chip patterns
  { name: 'C64 Lead', pattern: [0, 3, 7, 12], category: 'Classic' },
  { name: 'NES Arp', pattern: [0, 4, 7, 12], category: 'Classic' },
  { name: 'Amiga', pattern: [0, 7, 12, 16], category: 'Classic' },
  { name: 'SID Bass', pattern: [0, 12, 7, 12], category: 'Classic' },
  { name: 'Atari', pattern: [0, 5, 7, 12], category: 'Classic' },
];

// Note name helper
const getNoteOffset = (semitones: number): string => {
  const notes = ['R', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'Oct'];
  if (semitones === 0) return 'R';
  if (semitones >= 12) return `+${semitones - 12 + 1}`;
  return notes[semitones] || `+${semitones}`;
};

export const ArpeggioEditor: React.FC<ArpeggioEditorProps> = ({ config, onChange }) => {
  const [showPresets, setShowPresets] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Major');

  const categories = Array.from(new Set(ARPEGGIO_PRESETS.map(p => p.category)));

  const updateConfig = (updates: Partial<ArpeggioConfig>) => {
    onChange({ ...config, ...updates });
  };

  const selectPreset = (pattern: number[]) => {
    updateConfig({ pattern, enabled: true });
    setShowPresets(false);
  };

  const addStep = () => {
    if (config.pattern.length < 8) {
      updateConfig({ pattern: [...config.pattern, 0] });
    }
  };

  const removeStep = (index: number) => {
    if (config.pattern.length > 1) {
      const newPattern = [...config.pattern];
      newPattern.splice(index, 1);
      updateConfig({ pattern: newPattern });
    }
  };

  const updateStep = (index: number, value: number) => {
    const newPattern = [...config.pattern];
    newPattern[index] = Math.max(-24, Math.min(24, value));
    updateConfig({ pattern: newPattern });
  };

  // Find matching preset
  const currentPreset = ARPEGGIO_PRESETS.find(
    p => JSON.stringify(p.pattern) === JSON.stringify(config.pattern)
  );

  return (
    <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-yellow-500 rounded-full" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Arpeggio</h3>
        </div>

        {/* Enable Toggle */}
        <button
          onClick={() => updateConfig({ enabled: !config.enabled })}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all
            ${config.enabled
              ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500'
              : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }
          `}
        >
          <Zap size={12} className={config.enabled ? 'animate-pulse' : ''} />
          {config.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Preset Selector */}
      <div className="mb-4">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg text-sm text-white hover:bg-gray-700 transition-colors"
        >
          <span className="font-mono">
            {currentPreset ? currentPreset.name : 'Custom Pattern'}
          </span>
          {showPresets ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Preset Dropdown */}
        {showPresets && (
          <div className="mt-2 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-1 p-2 bg-gray-800 border-b border-gray-700">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`
                    px-2 py-1 text-[10px] font-bold uppercase rounded transition-all
                    ${selectedCategory === cat
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'text-gray-500 hover:text-gray-300'
                    }
                  `}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Preset Grid */}
            <div className="grid grid-cols-2 gap-1 p-2 max-h-48 overflow-y-auto">
              {ARPEGGIO_PRESETS
                .filter(p => p.category === selectedCategory)
                .map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => selectPreset(preset.pattern)}
                    className={`
                      text-left px-2 py-1.5 rounded text-xs transition-all
                      ${JSON.stringify(preset.pattern) === JSON.stringify(config.pattern)
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }
                    `}
                  >
                    <div className="font-bold">{preset.name}</div>
                    <div className="text-[9px] text-gray-500 font-mono">
                      {preset.pattern.map(n => getNoteOffset(n)).join(' ')}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Pattern Visualization */}
      <div className="mb-4">
        <div className="text-[10px] text-gray-500 uppercase mb-2">Pattern Steps</div>
        <div className="flex gap-1 flex-wrap">
          {config.pattern.map((step, index) => (
            <div key={index} className="relative group">
              <div
                className={`
                  w-10 h-12 flex flex-col items-center justify-center rounded-lg border-2 transition-all
                  ${config.enabled
                    ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
                    : 'bg-gray-800 border-gray-700 text-gray-500'
                  }
                `}
              >
                <span className="text-xs font-bold">{step > 0 ? `+${step}` : step}</span>
                <span className="text-[8px] text-gray-500">{getNoteOffset(Math.abs(step))}</span>
              </div>

              {/* Step controls on hover */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => updateStep(index, step + 1)}
                  className="w-4 h-4 bg-gray-700 rounded text-[10px] hover:bg-gray-600"
                >
                  +
                </button>
                <button
                  onClick={() => updateStep(index, step - 1)}
                  className="w-4 h-4 bg-gray-700 rounded text-[10px] hover:bg-gray-600"
                >
                  -
                </button>
              </div>

              {/* Remove button */}
              {config.pattern.length > 1 && (
                <button
                  onClick={() => removeStep(index)}
                  className="absolute -top-2 -right-2 w-4 h-4 bg-red-500/80 rounded-full text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {/* Add Step Button */}
          {config.pattern.length < 8 && (
            <button
              onClick={addStep}
              className="w-10 h-12 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-all"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Speed Control */}
      <div className="flex justify-center">
        <Knob
          value={config.speed}
          min={1}
          max={60}
          onChange={(v) => updateConfig({ speed: v })}
          label="Speed"
          color="#eab308"
          formatValue={(v) => `${Math.round(v)}Hz`}
          size="sm"
        />
      </div>

      {/* Info */}
      <div className="mt-3 text-[10px] text-gray-500 text-center">
        {config.enabled
          ? `${config.pattern.length} steps at ${config.speed}Hz = ${(1000 / config.speed * config.pattern.length).toFixed(0)}ms cycle`
          : 'Enable to hear rapid note cycling like classic 8-bit games'
        }
      </div>
    </section>
  );
};
