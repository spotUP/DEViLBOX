/**
 * BuzzmachineEditor — dynamic knob editor for Buzzmachine WASM effects.
 *
 * Renders knobs based on the machine's parameter metadata (name, min, max, default).
 * Parameters are stored/referenced by index string ('0', '1', '2', ...).
 */

import React, { useMemo } from 'react';
import { Knob } from '@components/controls/Knob';
import { SectionHeader, type VisualEffectEditorProps } from './shared';
import { BUZZMACHINE_INFO, type BuzzmachineType } from '@engine/buzzmachines/BuzzmachineEngine';
import { useEffectAnalyser } from '@hooks/useEffectAnalyser';
import { EffectOscilloscope } from '../EffectVisualizer';

/** Map effect type ID → machine type key in BUZZMACHINE_INFO */
const BUZZ_TYPE_MAP: Record<string, BuzzmachineType> = {
  BuzzDistortion: 'ArguruDistortion' as BuzzmachineType,
  BuzzOverdrive: 'GeonikOverdrive' as BuzzmachineType,
  BuzzDistortion2: 'JeskolaDistortion' as BuzzmachineType,
  BuzzDist2: 'ElakDist2' as BuzzmachineType,
  BuzzSoftSat: 'GraueSoftSat' as BuzzmachineType,
  BuzzStereoDist: 'WhiteNoiseStereoDist' as BuzzmachineType,
  BuzzSVF: 'ElakSVF' as BuzzmachineType,
  BuzzPhilta: 'FSMPhilta' as BuzzmachineType,
  BuzzNotch: 'CyanPhaseNotch' as BuzzmachineType,
  BuzzZfilter: 'QZfilter' as BuzzmachineType,
  BuzzDelay: 'JeskolaDelay' as BuzzmachineType,
  BuzzCrossDelay: 'JeskolaCrossDelay' as BuzzmachineType,
  BuzzFreeverb: 'JeskolaFreeverb' as BuzzmachineType,
  BuzzPanzerDelay: 'FSMPanzerDelay' as BuzzmachineType,
  BuzzChorus: 'FSMChorus' as BuzzmachineType,
  BuzzChorus2: 'FSMChorus2' as BuzzmachineType,
  BuzzWhiteChorus: 'WhiteNoiseWhiteChorus' as BuzzmachineType,
  BuzzFreqShift: 'BigyoFrequencyShifter' as BuzzmachineType,
  BuzzCompressor: 'GeonikCompressor' as BuzzmachineType,
  BuzzLimiter: 'LdSLimit' as BuzzmachineType,
  BuzzExciter: 'OomekExciter' as BuzzmachineType,
  BuzzMasterizer: 'OomekMasterizer' as BuzzmachineType,
  BuzzStereoGain: 'DedaCodeStereoGain' as BuzzmachineType,
};

export const BuzzmachineEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const machineType = BUZZ_TYPE_MAP[effect.type];
  const info = machineType ? BUZZMACHINE_INFO[machineType] : undefined;
  const params = info?.parameters ?? [];
  const { pre, post } = useEffectAnalyser(effect.id, 'waveform');

  // Group params into rows of 3-4 for layout
  const rows = useMemo(() => {
    const result: typeof params[] = [];
    for (let i = 0; i < params.length; i += 4) {
      result.push(params.slice(i, i + 4));
    }
    return result;
  }, [params]);

  if (!info || params.length === 0) {
    return (
      <div className="space-y-4">
        <EffectOscilloscope pre={pre} post={post} color="#ff9800" />
        <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
          <SectionHeader size="lg" color="#ff9800" title={effect.type} />
          <p className="text-xs text-text-muted text-center">No parameters available</p>
        </section>
        <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
          <div className="flex justify-center">
            <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
              label="Mix" color="#ff9800" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </section>
      </div>
    );
  }

  const formatParamValue = (value: number, min: number, max: number, isByte: boolean) => {
    if (isByte && max <= 1) return value >= 0.5 ? 'ON' : 'OFF';
    if (isByte && max <= 10) return `${Math.round(value)}`;
    const range = max - min;
    if (range <= 100) return `${Math.round(value)}`;
    if (range <= 1000) return `${Math.round(value)}`;
    return `${Math.round(value)}`;
  };

  return (
    <div className="space-y-4">
      <EffectOscilloscope pre={pre} post={post} color="#ff9800" />
      {/* Machine name header */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#ff9800" title={info.name} />
        <p className="text-[10px] text-text-muted text-center -mt-1 mb-2">by {info.author}</p>

        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-around items-end mb-3">
            {row.map((param) => {
              const key = String(param.index);
              const value = typeof effect.parameters[key] === 'number'
                ? (effect.parameters[key] as number)
                : param.defaultValue;
              const isByte = param.type === 'byte';

              return (
                <Knob
                  key={param.index}
                  value={value}
                  min={param.minValue}
                  max={param.maxValue}
                  onChange={(v) => onUpdateParameter(key, isByte ? Math.round(v) : v)}
                  label={param.name}
                  color="#ff9800"
                  formatValue={(v) => formatParamValue(v, param.minValue, param.maxValue, isByte)}
                />
              );
            })}
          </div>
        ))}
      </section>

      {/* Mix */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob value={effect.wet} min={0} max={100} onChange={onUpdateWet}
            label="Mix" color="#ffb74d" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </section>
    </div>
  );
};
