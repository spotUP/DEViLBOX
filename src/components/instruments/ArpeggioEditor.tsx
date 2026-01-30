/**
 * ArpeggioEditor - Advanced Arpeggio Editor for ChipSynth
 *
 * Features:
 * - Tracker-style 16-row grid editor
 * - 40+ presets organized by chip era
 * - Multiple playback modes (loop, ping-pong, one-shot, random)
 * - Per-step volume, gate, and effects
 * - Speed in Hz, ticks, or note divisions
 * - Swing/shuffle timing
 * - Real-time visualization
 */

import React, { useState, useCallback } from 'react';
import {
  Zap,
  ChevronDown,
  Library,
  Play,
  RefreshCw,
  ArrowRightLeft,
  Shuffle,
  Settings2,
  Copy,
  Clipboard,
  Dice5,
} from 'lucide-react';
import { Knob } from '@components/controls/Knob';
import { ArpeggioGrid } from './arpeggio/ArpeggioGrid';
import { ArpeggioPresetBrowser } from './arpeggio/ArpeggioPresetBrowser';
import { ArpeggioVisualization } from './arpeggio/ArpeggioVisualization';
import { MiniKeyboard } from './arpeggio/MiniKeyboard';
import type { ArpeggioConfig, ArpeggioStep, ArpeggioMode, ArpeggioSpeedUnit } from '@typedefs/instrument';

interface ArpeggioEditorProps {
  config: ArpeggioConfig;
  onChange: (config: ArpeggioConfig) => void;
  currentStep?: number;
  isPlaying?: boolean;
}

// Speed unit options
const SPEED_UNITS: { value: ArpeggioSpeedUnit; label: string; description: string }[] = [
  { value: 'hz', label: 'Hz', description: 'Frequency (steps/sec)' },
  { value: 'ticks', label: 'Ticks', description: 'Tracker ticks per step' },
  { value: 'division', label: 'Div', description: 'Note division' },
];

// Playback mode options
const PLAYBACK_MODES: { value: ArpeggioMode; label: string; icon: React.ReactNode }[] = [
  { value: 'loop', label: 'Loop', icon: <RefreshCw size={12} /> },
  { value: 'pingpong', label: 'Ping-Pong', icon: <ArrowRightLeft size={12} /> },
  { value: 'oneshot', label: 'One-Shot', icon: <Play size={12} /> },
  { value: 'random', label: 'Random', icon: <Shuffle size={12} /> },
];

// Division values for note-based speed - exported for reference
export const DIVISIONS = [1, 2, 4, 8, 16, 32, 64];

// Helper: Convert legacy pattern to steps
const legacyPatternToSteps = (pattern?: number[]): ArpeggioStep[] => {
  if (!pattern || pattern.length === 0) {
    return [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }];
  }
  return pattern.map(offset => ({ noteOffset: offset }));
};

// Helper: Normalize config to ensure it has all required fields
const normalizeConfig = (config: Partial<ArpeggioConfig>): ArpeggioConfig => {
  const steps = config.steps?.length
    ? config.steps
    : legacyPatternToSteps(config.pattern);

  return {
    enabled: config.enabled ?? false,
    speed: config.speed ?? 15,
    speedUnit: config.speedUnit ?? 'hz',
    steps,
    mode: config.mode ?? 'loop',
    swing: config.swing ?? 0,
  };
};

export const ArpeggioEditor: React.FC<ArpeggioEditorProps> = ({
  config: rawConfig,
  onChange,
  currentStep = 0,
  isPlaying = false,
}) => {
  // Normalize config to ensure it has all fields
  const config = normalizeConfig(rawConfig);

  const [showPresetBrowser, setShowPresetBrowser] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedSteps, setCopiedSteps] = useState<ArpeggioStep[] | null>(null);
  const [currentPresetName, setCurrentPresetName] = useState<string | null>(null);

  // Update config helper
  const updateConfig = useCallback((updates: Partial<ArpeggioConfig>) => {
    onChange({ ...config, ...updates });
    // Clear preset name if we're manually editing
    if (updates.steps) {
      setCurrentPresetName(null);
    }
  }, [config, onChange]);

  // Handle preset selection
  const handlePresetSelect = useCallback((presetConfig: ArpeggioConfig, presetName: string) => {
    onChange({ ...config, ...presetConfig });
    setCurrentPresetName(presetName);
  }, [config, onChange]);

  // Handle steps change
  const handleStepsChange = useCallback((steps: ArpeggioStep[]) => {
    updateConfig({ steps });
  }, [updateConfig]);

  // Copy/paste steps
  const handleCopySteps = useCallback(() => {
    setCopiedSteps([...config.steps]);
  }, [config.steps]);

  const handlePasteSteps = useCallback(() => {
    if (copiedSteps) {
      updateConfig({ steps: [...copiedSteps] });
    }
  }, [copiedSteps, updateConfig]);

  // Randomize pattern (scale-aware)
  const handleRandomize = useCallback(() => {
    const scaleOffsets = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]; // Major scale + octave
    const numSteps = Math.floor(Math.random() * 8) + 3; // 3-10 steps
    const steps: ArpeggioStep[] = [];

    for (let i = 0; i < numSteps; i++) {
      const offset = scaleOffsets[Math.floor(Math.random() * scaleOffsets.length)];
      steps.push({
        noteOffset: Math.random() > 0.7 ? -offset : offset,
        volume: Math.random() > 0.8 ? Math.floor(Math.random() * 50 + 50) : undefined,
        gate: Math.random() > 0.9 ? Math.floor(Math.random() * 50 + 50) : undefined,
        effect: Math.random() > 0.95 ? 'accent' : undefined,
      });
    }

    updateConfig({ steps });
  }, [updateConfig]);

  // Speed control based on unit
  const getSpeedRange = (): { min: number; max: number } => {
    switch (config.speedUnit) {
      case 'hz': return { min: 1, max: 60 };
      case 'ticks': return { min: 1, max: 48 };
      case 'division': return { min: 1, max: 64 };
      default: return { min: 1, max: 60 };
    }
  };

  const formatSpeed = (value: number): string => {
    switch (config.speedUnit) {
      case 'hz': return `${Math.round(value)}Hz`;
      case 'ticks': return `${Math.round(value)}T`;
      case 'division': return `1/${Math.round(value)}`;
      default: return `${Math.round(value)}`;
    }
  };

  const { min: speedMin, max: speedMax } = getSpeedRange();

  return (
    <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-yellow-500 rounded-full" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Arpeggio</h3>
          {currentPresetName && (
            <span className="text-[10px] text-yellow-500/70 ml-1">({currentPresetName})</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`
              p-1.5 rounded-lg transition-colors
              ${showAdvanced
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-500 hover:text-gray-300'
              }
            `}
            title="Advanced options"
          >
            <Settings2 size={14} />
          </button>

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
      </div>

      {/* Preset Selector */}
      <div className="mb-4">
        <button
          onClick={() => setShowPresetBrowser(true)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg text-sm text-white hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Library size={14} className="text-gray-500" />
            <span className="font-mono">
              {currentPresetName || 'Browse Presets...'}
            </span>
          </div>
          <ChevronDown size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Visualization */}
      <div className="mb-4">
        <ArpeggioVisualization
          steps={config.steps}
          currentStep={currentStep}
          isPlaying={isPlaying && config.enabled}
          mode={config.mode}
          height={60}
        />
      </div>

      {/* Pattern Grid */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-500 uppercase">Pattern Steps</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopySteps}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Copy pattern"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={handlePasteSteps}
              disabled={!copiedSteps}
              className={`p-1 transition-colors ${copiedSteps ? 'text-gray-500 hover:text-gray-300' : 'text-gray-700'}`}
              title="Paste pattern"
            >
              <Clipboard size={12} />
            </button>
            <button
              onClick={handleRandomize}
              className="p-1 text-gray-500 hover:text-purple-400 transition-colors"
              title="Randomize pattern"
            >
              <Dice5 size={12} />
            </button>
          </div>
        </div>
        <ArpeggioGrid
          steps={config.steps}
          currentStep={currentStep}
          isPlaying={isPlaying && config.enabled}
          onChange={handleStepsChange}
          maxSteps={16}
        />
      </div>

      {/* Controls Row */}
      <div className="flex items-start gap-4 mb-4">
        {/* Speed Control */}
        <div className="flex-1">
          <div className="text-[10px] text-gray-500 uppercase mb-2">Speed</div>
          <div className="flex items-center gap-2">
            <Knob
              value={config.speed}
              min={speedMin}
              max={speedMax}
              step={config.speedUnit === 'division' ? 1 : undefined}
              onChange={(v) => updateConfig({ speed: v })}
              color="#eab308"
              formatValue={formatSpeed}
              size="sm"
            />

            {/* Speed unit selector */}
            <div className="flex flex-col gap-0.5">
              {SPEED_UNITS.map((unit) => (
                <button
                  key={unit.value}
                  onClick={() => updateConfig({ speedUnit: unit.value, speed: speedMin })}
                  className={`
                    px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors
                    ${config.speedUnit === unit.value
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'text-gray-600 hover:text-gray-400'
                    }
                  `}
                  title={unit.description}
                >
                  {unit.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase mb-2">Mode</div>
          <div className="grid grid-cols-2 gap-1">
            {PLAYBACK_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => updateConfig({ mode: mode.value })}
                className={`
                  flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium
                  transition-colors
                  ${config.mode === mode.value
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {mode.icon}
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Options (collapsible) */}
      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
          {/* Swing Control */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase mb-2">Swing</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={config.swing ?? 0}
                onChange={(e) => updateConfig({ swing: parseInt(e.target.value, 10) })}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <span className="text-xs text-gray-400 w-12 text-right font-mono">
                {config.swing ?? 0}%
              </span>
            </div>
          </div>

          {/* Mini Keyboard */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase mb-2">Pattern Notes</div>
            <MiniKeyboard
              steps={config.steps}
              currentStep={currentStep}
              isPlaying={isPlaying && config.enabled}
              baseNote="C4"
              octaves={3}
            />
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-3 text-[10px] text-gray-500 text-center">
        {config.enabled ? (
          <>
            {config.steps.length} steps
            {config.speedUnit === 'hz' && ` at ${config.speed}Hz = ${(1000 / config.speed * config.steps.length).toFixed(0)}ms cycle`}
            {config.speedUnit === 'ticks' && ` every ${config.speed} ticks`}
            {config.speedUnit === 'division' && ` every 1/${config.speed} note`}
            {config.swing && config.swing > 0 ? ` with ${config.swing}% swing` : ''}
          </>
        ) : (
          'Enable to hear rapid note cycling like classic 8-bit games'
        )}
      </div>

      {/* Preset Browser Modal */}
      <ArpeggioPresetBrowser
        isOpen={showPresetBrowser}
        onClose={() => setShowPresetBrowser(false)}
        onSelect={handlePresetSelect}
        currentPresetId={undefined}
      />
    </section>
  );
};
