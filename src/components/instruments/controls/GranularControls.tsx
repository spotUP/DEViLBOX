import React, { useRef, useEffect, useCallback } from 'react';
import type { GranularConfig, FilterType } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';

interface GranularControlsProps {
  config: GranularConfig;
  onChange: (updates: Partial<GranularConfig>) => void;
}

export const GranularControls: React.FC<GranularControlsProps> = ({
  config,
  onChange,
}) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg } = useInstrumentColors('#a78bfa');
  const knobColor2 = isCyanTheme ? '#00cccc' : '#8b5cf6';
  const knobColor3 = isCyanTheme ? '#009999' : '#7c3aed';
  const knobColorEnv = isCyanTheme ? '#00aaaa' : '#c4b5fd';
  const knobColorFilter = isCyanTheme ? '#008888' : '#6d28d9';

  const update = useCallback((key: keyof GranularConfig, value: number | boolean | string) => {
    onChange({ [key]: value } as Partial<GranularConfig>);
  }, [onChange]);

  const updateEnvelope = useCallback((updates: Partial<GranularConfig['envelope']>) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  }, [onChange]);

  const updateFilter = useCallback((updates: Partial<GranularConfig['filter']>) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  }, [onChange]);

  return (
    <div className="synth-controls-flow flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Sample URL display */}
      <div className={`p-3 rounded-xl border ${panelBg}`}>
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wide mb-1">Sample</p>
        <div className="text-xs text-text-secondary truncate font-mono">
          {config.sampleUrl || '(no sample loaded)'}
        </div>
      </div>

      {/* Grain Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: accentColor }}>Grain</p>
        <div className="flex flex-wrap items-end gap-4">
          <Knob
            value={config.grainSize} min={10} max={500}
            onChange={(v) => update('grainSize', v)}
            label="Size" color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
          <Knob
            value={config.grainOverlap} min={0} max={100}
            onChange={(v) => update('grainOverlap', v)}
            label="Overlap" color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.density} min={1} max={16}
            onChange={(v) => update('density', Math.round(v))}
            label="Density" color={knobColor}
            formatValue={(v) => Math.round(v).toString()}
          />
          <button
            onClick={() => update('reverse', !config.reverse)}
            className={`px-3 py-2 rounded text-xs font-bold transition-all ${
              config.reverse
                ? 'bg-purple-500/20 border border-purple-500 text-purple-400'
                : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary hover:border-dark-borderLight'
            }`}
          >
            REV
          </button>
        </div>
      </div>

      {/* Playback Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: accentColor }}>Playback</p>
        <div className="flex flex-wrap items-end gap-4">
          <Knob
            value={config.scanPosition} min={0} max={100}
            onChange={(v) => update('scanPosition', v)}
            label="Position" color={knobColor2}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.scanSpeed} min={-100} max={100} bipolar
            onChange={(v) => update('scanSpeed', v)}
            label="Scan Spd" color={knobColor2}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.playbackRate} min={0.25} max={4} step={0.01}
            onChange={(v) => update('playbackRate', v)}
            label="Speed" color={knobColor2}
            formatValue={(v) => `${v.toFixed(2)}x`}
          />
          <Knob
            value={config.detune} min={-1200} max={1200} bipolar
            onChange={(v) => update('detune', v)}
            label="Detune" color={knobColor2}
            formatValue={(v) => `${Math.round(v)}¢`}
          />
        </div>
      </div>

      {/* Random Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: accentColor }}>Random</p>
        <div className="flex flex-wrap items-end gap-4">
          <Knob
            value={config.randomPitch} min={0} max={100}
            onChange={(v) => update('randomPitch', v)}
            label="Rnd Pitch" color={knobColor3}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.randomPosition} min={0} max={100}
            onChange={(v) => update('randomPosition', v)}
            label="Rnd Pos" color={knobColor3}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </div>

      {/* Grain Envelope Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: accentColor }}>Grain Envelope</p>
        <div className="flex flex-wrap items-end gap-4">
          <Knob
            value={config.envelope.attack} min={1} max={100}
            onChange={(v) => updateEnvelope({ attack: v })}
            label="Attack" color={knobColorEnv}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
          <Knob
            value={config.envelope.release} min={1} max={100}
            onChange={(v) => updateEnvelope({ release: v })}
            label="Release" color={knobColorEnv}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </div>

      {/* Filter Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: accentColor }}>Filter</p>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(['lowpass', 'highpass', 'bandpass', 'notch'] as FilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => updateFilter({ type })}
                className={`px-3 py-1 text-xs font-bold rounded border uppercase ${
                  config.filter.type === type
                    ? 'bg-[#2a2a2a]'
                    : 'bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight'
                }`}
                style={config.filter.type === type ? { borderColor: accentColor, color: accentColor } : undefined}
              >
                {type.slice(0, 4)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Knob
              value={config.filter.cutoff} min={20} max={20000}
              onChange={(v) => updateFilter({ cutoff: v })}
              label="Cutoff" color={knobColorFilter}
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
            <Knob
              value={config.filter.resonance} min={0} max={100}
              onChange={(v) => updateFilter({ resonance: v })}
              label="Reso" color={knobColorFilter}
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
