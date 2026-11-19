/**
 * AY-3-8910 / YM2610 SSG hardware view: the 16 register-13 envelope shapes with
 * the instrument's shape highlighted, the tone / noise / envelope mixer and the
 * noise period. Every control writes the first step of its macro, the value
 * the driver starts each note with; draw the macro for changes over time.
 */
import React, { useCallback, useRef } from 'react';
import { Activity } from 'lucide-react';
import { FurnaceMacroType, type FurnaceConfig, type FurnaceMacro } from '@typedefs/instrument';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { AY_ENVELOPE_SHAPE_NAMES, macroFirstStep, withMacroFirstStep } from '@/lib/furnace/chipMacroProfiles';
import { ayEnvelopePoints } from '@/lib/furnace/ayEnvelope';

export interface AYPanelProps {
  config: FurnaceConfig;
  onChange: (updates: Partial<FurnaceConfig>) => void;
  /** False when the driver has no noise period per instrument (nullsound SSG). */
  showNoise?: boolean;
}

const MIXER_BITS = [
  { bit: 1, label: 'Tone' },
  { bit: 2, label: 'Noise' },
  { bit: 4, label: 'Envelope' },
] as const;

const ShapeIcon: React.FC<{ shape: number }> = ({ shape }) => {
  const pts = ayEnvelopePoints(shape, 3).map(([t, l]) => `${(t / 3) * 60},${2 + (1 - l) * 16}`).join(' ');
  return (
    <svg viewBox="0 0 60 20" className="w-full h-5" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
};

export const AYPanel: React.FC<AYPanelProps> = ({ config, onChange, showNoise = true }) => {
  const macrosRef = useRef<FurnaceMacro[]>(config.macros);
  macrosRef.current = config.macros;
  const setFirst = useCallback((code: number, value: number) => {
    onChange({ macros: withMacroFirstStep(macrosRef.current, code, value) });
  }, [onChange]);

  const shape = macroFirstStep(config.macros, FurnaceMacroType.EX2);
  const mixer = macroFirstStep(config.macros, FurnaceMacroType.WAVE) ?? 1;
  const noise = macroFirstStep(config.macros, FurnaceMacroType.DUTY) ?? 0;
  const envOn = (mixer & 4) !== 0;

  return (
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-accent-highlight" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">Envelope Shape and Mixer</h3>
        <span className="text-[10px] font-mono text-text-muted">Sets step 1 of each macro. Draw the macro for changes over time.</span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
        {AY_ENVELOPE_SHAPE_NAMES.map((name, value) => {
          const active = value === shape;
          return (
            <Button
              key={value}
              variant="ghost"
              onClick={() => setFirst(FurnaceMacroType.EX2, value)}
              title={`Shape ${value}: ${name}`}
              aria-pressed={active}
              className={`!h-auto !p-1 flex flex-col items-stretch gap-0.5 rounded border ${
                active ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-dark-border bg-dark-bg text-text-secondary'
              }`}
            >
              <ShapeIcon shape={value} />
              <span className="text-[9px] font-mono">{value}</span>
            </Button>
          );
        })}
      </div>
      <p className="text-[10px] font-mono text-text-muted">
        {shape === undefined
          ? 'No envelope shape macro: the hardware envelope keeps its last shape.'
          : `Shape ${shape}: ${AY_ENVELOPE_SHAPE_NAMES[shape] ?? 'out of range'}.`}
        {!envOn && ' The envelope is off in the mixer, so the shape is not heard.'}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {MIXER_BITS.map(({ bit, label }) => (
          <Toggle
            key={bit}
            label={label}
            value={(mixer & bit) !== 0}
            onChange={(on) => setFirst(FurnaceMacroType.WAVE, on ? mixer | bit : mixer & ~bit)}
            tone="primary"
          />
        ))}
        {showNoise && (
          <Knob
            label="Noise Period"
            value={noise}
            min={0}
            max={31}
            step={1}
            onChange={(v) => setFirst(FurnaceMacroType.DUTY, Math.round(v))}
            tone="secondary"
            size="sm"
            formatValue={(v) => String(Math.round(v))}
          />
        )}
      </div>
    </div>
  );
};
