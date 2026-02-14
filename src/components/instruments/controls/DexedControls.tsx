import React, { useState, useRef, useEffect } from 'react';
import { Knob } from '@components/controls/Knob';
import { Zap, Waves, Settings, Music } from 'lucide-react';
import { useThemeStore } from '@stores';
import type { DexedConfig, DexedOperatorConfig } from '@typedefs/instrument';
import { ScrollLockContainer } from '@components/ui/ScrollLockContainer';
import { useBreakpoint } from '@hooks/useBreakpoint';

// DX7 Algorithm visualizations (simplified text representations)
const DX7_ALGORITHMS = [
  '6→5→4→3→2→1', '6→5→4→3→2+1', '6→5→4→3+2→1', '6→5→4+3→2→1',
  '6→5→4→3→2→1', '6→5→4→3→2+1', '6+5→4→3→2→1', '6→5+4→3→2→1',
  '6→5→4→3→2+1', '6→5→4+3→2+1', '6→5→4→3+2→1', '6→5→4+3+2→1',
  '6→5→4→3→2+1', '6→5→4→3+2+1', '6→5→4+3→2+1', '6→5+4→3+2→1',
  '6→5→4→3→2+1', '6→5+4→3→2+1', '6+5→4→3→2+1', '6→5+4+3→2+1',
  '6+5→4→3+2→1', '6+5→4→3+2+1', '6+5+4→3→2+1', '6+5+4→3+2+1',
  '6+5+4→3+2→1', '6+5+4+3→2+1', '6+5+4→3+2+1', '6+5+4+3+2→1',
  '6+5+4+3+2→1', '6+5+4+3+2+1', '6+5+4+3+2+1', '6+5+4+3+2+1',
];

const LFO_WAVES = ['triangle', 'sawDown', 'sawUp', 'square', 'sine', 'sampleHold'] as const;
const LFO_WAVE_LABELS = ['Triangle', 'Saw Down', 'Saw Up', 'Square', 'Sine', 'S&H'];

interface DexedControlsProps {
  config: Partial<DexedConfig>;
  onChange: (updates: Partial<DexedConfig>) => void;
}

type DexedTab = 'global' | 'op1' | 'op2' | 'op3' | 'op4' | 'op5' | 'op6';

export const DexedControls: React.FC<DexedControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<DexedTab>('global');
  const { isMobile, isTablet } = useBreakpoint();
  const useMobileLayout = isMobile || isTablet;

  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // DX7 uses blue/cyan colors
  const accentColor = isCyanTheme ? '#00ffff' : '#3b82f6';
  const knobColor = isCyanTheme ? '#00ffff' : '#60a5fa';

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a2e] border-blue-900/50';

  const updateOperator = (index: number, updates: Partial<DexedOperatorConfig>) => {
    const operators = [...(configRef.current.operators || [])];
    while (operators.length <= index) {
      operators.push({
        level: 99,
        coarse: 1,
        fine: 0,
        detune: 7,
        mode: 'ratio',
        egRates: [99, 99, 99, 99],
        egLevels: [99, 99, 99, 0],
        breakPoint: 0,
        leftDepth: 0,
        rightDepth: 0,
        leftCurve: 0,
        rightCurve: 0,
        rateScaling: 0,
        ampModSens: 0,
        velocitySens: 0,
      });
    }
    operators[index] = { ...operators[index], ...updates };
    onChange({ operators });
  };

  const renderGlobalTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Algorithm Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            ALGORITHM
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {Array.from({ length: 32 }, (_, i) => (
            <button
              key={i}
              onClick={() => onChange({ algorithm: i })}
              className={`w-8 h-8 text-xs rounded border transition-all ${
                config.algorithm === i
                  ? 'border-blue-400 bg-blue-500/30 text-blue-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="text-xs text-gray-400 text-center font-mono">
          {DX7_ALGORITHMS[config.algorithm || 0]}
        </div>
      </div>

      {/* Feedback & Global */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            FEEDBACK & LFO
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Knob
            value={config.feedback || 0}
            min={0}
            max={7}
            onChange={(v) => onChange({ feedback: Math.round(v) })}
            label="Feedback"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.lfoSpeed || 35}
            min={0}
            max={99}
            onChange={(v) => onChange({ lfoSpeed: Math.round(v) })}
            label="LFO Speed"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.lfoPitchModDepth || 0}
            min={0}
            max={99}
            onChange={(v) => onChange({ lfoPitchModDepth: Math.round(v) })}
            label="Pitch Mod"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.lfoAmpModDepth || 0}
            min={0}
            max={99}
            onChange={(v) => onChange({ lfoAmpModDepth: Math.round(v) })}
            label="Amp Mod"
            color={knobColor}
            size="sm"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs text-gray-400 block mb-2">LFO Waveform</label>
          <select
            value={config.lfoWave || 'triangle'}
            onChange={(e) => onChange({ lfoWave: e.target.value as DexedConfig['lfoWave'] })}
            className="bg-gray-900 border border-gray-700 text-xs rounded px-2 py-1 w-full"
            style={{ color: accentColor }}
          >
            {LFO_WAVES.map((wave, i) => (
              <option key={wave} value={wave}>{LFO_WAVE_LABELS[i]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Operator Levels Overview */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            OPERATOR LEVELS
          </h3>
        </div>

        <div className="grid grid-cols-6 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="text-center">
              <Knob
                value={config.operators?.[i]?.level ?? 99}
                min={0}
                max={99}
                onChange={(v) => updateOperator(i, { level: Math.round(v) })}
                label={`OP${i + 1}`}
                color={knobColor}
                size="sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOperatorTab = (opIndex: number) => {
    const op = config.operators?.[opIndex] || {
      level: 99, coarse: 1, fine: 0, detune: 7,
      mode: 'ratio' as const,
      egRates: [99, 99, 99, 99] as [number, number, number, number],
      egLevels: [99, 99, 99, 0] as [number, number, number, number],
      breakPoint: 0, leftDepth: 0, rightDepth: 0,
      leftCurve: 0, rightCurve: 0, rateScaling: 0,
      ampModSens: 0, velocitySens: 0,
    };
    const egRates = op.egRates || [99, 99, 99, 99];
    const egLevels = op.egLevels || [99, 99, 99, 0];

    return (
      <div className="flex flex-col gap-4 p-4">
        {/* Frequency Section */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Music size={16} style={{ color: accentColor }} />
            <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
              OPERATOR {opIndex + 1} - FREQUENCY
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Knob
              value={op.level ?? 99}
              min={0}
              max={99}
              onChange={(v) => updateOperator(opIndex, { level: Math.round(v) })}
              label="Level"
              color={knobColor}
              size="sm"
            />
            <Knob
              value={op.coarse ?? 1}
              min={0}
              max={31}
              onChange={(v) => updateOperator(opIndex, { coarse: Math.round(v) })}
              label="Coarse"
              color={knobColor}
              size="sm"
            />
            <Knob
              value={op.fine ?? 0}
              min={0}
              max={99}
              onChange={(v) => updateOperator(opIndex, { fine: Math.round(v) })}
              label="Fine"
              color={knobColor}
              size="sm"
            />
            <Knob
              value={op.detune ?? 7}
              min={0}
              max={14}
              onChange={(v) => updateOperator(opIndex, { detune: Math.round(v) })}
              label="Detune"
              color={knobColor}
              size="sm"
            />
          </div>
        </div>

        {/* Envelope Rates */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <h3 className="font-bold uppercase tracking-tight mb-4" style={{ color: accentColor }}>
            ENVELOPE RATES
          </h3>
          <div className="grid grid-cols-4 gap-6">
            {['R1', 'R2', 'R3', 'R4'].map((label, i) => (
              <Knob
                key={label}
                value={egRates[i]}
                min={0}
                max={99}
                onChange={(v) => {
                  const newRates = [...egRates] as [number, number, number, number];
                  newRates[i] = Math.round(v);
                  updateOperator(opIndex, { egRates: newRates });
                }}
                label={label}
                color={knobColor}
                size="sm"
              />
            ))}
          </div>
        </div>

        {/* Envelope Levels */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <h3 className="font-bold uppercase tracking-tight mb-4" style={{ color: accentColor }}>
            ENVELOPE LEVELS
          </h3>
          <div className="grid grid-cols-4 gap-6">
            {['L1', 'L2', 'L3', 'L4'].map((label, i) => (
              <Knob
                key={label}
                value={egLevels[i]}
                min={0}
                max={99}
                onChange={(v) => {
                  const newLevels = [...egLevels] as [number, number, number, number];
                  newLevels[i] = Math.round(v);
                  updateOperator(opIndex, { egLevels: newLevels });
                }}
                label={label}
                color={knobColor}
                size="sm"
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const tabs: { id: DexedTab; label: string }[] = [
    { id: 'global', label: 'Global' },
    { id: 'op1', label: 'OP1' },
    { id: 'op2', label: 'OP2' },
    { id: 'op3', label: 'OP3' },
    { id: 'op4', label: 'OP4' },
    { id: 'op5', label: 'OP5' },
    { id: 'op6', label: 'OP6' },
  ];

  return (
    <ScrollLockContainer>
      <div className="flex flex-col h-full">
        {/* Tab Bar (Desktop) or Dropdown (Mobile/Tablet) */}
        {useMobileLayout ? (
          <div className="p-2 border-b border-gray-800 bg-gray-900/50">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as DexedTab)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-bold uppercase"
              style={{ color: accentColor }}
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id} className="bg-gray-800">
                  {tab.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex border-b border-gray-800 bg-gray-900/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === tab.id
                    ? 'border-b-2 text-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                style={activeTab === tab.id ? { borderColor: accentColor, color: accentColor } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'global' && renderGlobalTab()}
        {activeTab === 'op1' && renderOperatorTab(0)}
        {activeTab === 'op2' && renderOperatorTab(1)}
        {activeTab === 'op3' && renderOperatorTab(2)}
        {activeTab === 'op4' && renderOperatorTab(3)}
        {activeTab === 'op5' && renderOperatorTab(4)}
        {activeTab === 'op6' && renderOperatorTab(5)}
      </div>
      </div>
    </ScrollLockContainer>
  );
};
