/**
 * NES 2A03 instrument panel for the FamiStudio native-player route.
 *
 * Shows only what the FamiStudio sound engine plays from an instrument
 * (src/lib/export/nes/famistudioSong.ts): the duty cycle the duty envelope
 * steps through, drawn as pulse waveforms, and the noise mode the same
 * envelope selects on the noise channel. Volume, arpeggio, duty and pitch are
 * edited as macros in the macro list; hardware envelope and length counter
 * are pattern effects and sweep is not exported, so the panel offers neither.
 */
import React from 'react';
import { Activity } from 'lucide-react';
import { FurnaceMacroType, type FurnaceConfig } from '@typedefs/instrument';
import { PULSE_DUTY_FRACTIONS, PULSE_DUTY_NAMES } from '@/lib/furnace/chipMacroProfiles';

const WAVE_WIDTH = 96;
const WAVE_HEIGHT = 32;

/** Two periods of a pulse wave whose high part is `fraction` of the period. */
function pulsePath(fraction: number): string {
  const period = WAVE_WIDTH / 2;
  const high = 4;
  const low = WAVE_HEIGHT - 4;
  let d = `M 0 ${low}`;
  for (let p = 0; p < 2; p++) {
    const x0 = p * period;
    const x1 = x0 + period * fraction;
    d += ` L ${x0} ${high} L ${x1} ${high} L ${x1} ${low} L ${x0 + period} ${low}`;
  }
  return d;
}

export const NESPanel: React.FC<{ config: FurnaceConfig }> = ({ config }) => {
  const dutyMacro = config.macros.find((m) => m.type === FurnaceMacroType.DUTY && m.data.length > 0);
  // No duty macro: the converter writes the default duty envelope, which holds duty 0 (12.5%).
  const steps = dutyMacro ? dutyMacro.data.map((v) => Math.max(0, Math.min(3, v))) : [0];
  const used = new Set(steps);
  const start = steps[0];
  const noiseLong = steps.filter((v) => (v & 1) === 0).length;
  const noiseShort = steps.length - noiseLong;

  return (
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-accent-primary" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
          NES 2A03 Pulse and Noise
        </h3>
      </div>

      <div className="text-[10px] font-mono text-text-muted mb-2">
        Duty cycle on the pulse channels. Highlighted shapes are steps of the duty macro.
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {PULSE_DUTY_FRACTIONS.map((fraction, duty) => {
          const isUsed = used.has(duty);
          const isStart = duty === start;
          return (
            <div
              key={duty}
              className={`rounded border p-1.5 flex flex-col items-center gap-1 ${
                isStart ? 'border-accent-primary bg-accent-primary/10' : isUsed ? 'border-accent-primary/50' : 'border-dark-borderLight'
              }`}
            >
              <svg
                viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}
                className={`w-full h-8 ${isUsed ? 'text-accent-primary' : 'text-text-muted'}`}
                aria-label={`Pulse wave at ${PULSE_DUTY_NAMES[duty]} duty`}
              >
                <path d={pulsePath(fraction)} fill="none" stroke="currentColor" strokeWidth={2} />
              </svg>
              <span className={`text-[10px] font-mono ${isUsed ? 'text-text-primary' : 'text-text-muted'}`}>
                {duty}: {PULSE_DUTY_NAMES[duty]}
              </span>
              {isStart && <span className="text-[9px] font-mono text-accent-primary">First step</span>}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] font-mono text-text-muted mb-1">
        Noise channel: the same macro picks the noise mode (even value long noise, odd value short looped noise).
      </div>
      <div className="flex gap-2 text-[10px] font-mono mb-3">
        <span className={`px-2 py-0.5 rounded border ${noiseLong > 0 ? 'border-accent-secondary text-accent-secondary' : 'border-dark-borderLight text-text-muted'}`}>
          Long noise: {noiseLong} {noiseLong === 1 ? 'step' : 'steps'}
        </span>
        <span className={`px-2 py-0.5 rounded border ${noiseShort > 0 ? 'border-accent-secondary text-accent-secondary' : 'border-dark-borderLight text-text-muted'}`}>
          Short noise: {noiseShort} {noiseShort === 1 ? 'step' : 'steps'}
        </span>
      </div>

      <div className="text-[10px] font-mono text-text-muted leading-relaxed">
        Native NES export plays the Volume, Arpeggio, Duty Cycle and Pitch macros. A release point is kept on Volume only.
        Macros stop after 240 frames; pitch steps are limited to plus or minus 63. Hardware envelope (15xx) and length
        counter (16xx) are pattern effects; sweep is not exported.
      </div>
    </div>
  );
};
