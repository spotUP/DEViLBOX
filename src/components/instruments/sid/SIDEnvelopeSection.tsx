import React from 'react';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { ATTACK_MS, DECAY_MS, RELEASE_MS, timeLabel } from '@/lib/sid/sidConstants';
import type { SIDADSR } from './SIDInstrumentAdapter';

interface Props {
  adsr: SIDADSR;
  onChange: (adsr: Partial<SIDADSR>) => void;
  accentColor: string;
  panelBg: string;
  panelStyle: React.CSSProperties;
  readOnly?: boolean;
}

const AdsrSlider = ({ label, value, timeMs, accentColor, onChange, readOnly }: {
  label: string; value: number; timeMs: number; accentColor: string;
  onChange: (v: number) => void; readOnly?: boolean;
}) => (
  <div className="flex flex-col items-center gap-0.5" style={{ width: 36 }}>
    <span className="text-[9px] font-mono" style={{ color: accentColor }}>
      {value.toString(16).toUpperCase()}
    </span>
    <input type="range" min={0} max={15} step={1} value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      disabled={readOnly}
      style={{
        writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
        direction: 'rtl', width: 20, height: 64, accentColor,
        opacity: readOnly ? 0.5 : 1,
      }} />
    <span className="text-[9px] font-bold text-text-secondary">{label}</span>
    <span className="text-[8px] text-text-secondary font-mono">{timeLabel(timeMs)}</span>
  </div>
);

export const SIDEnvelopeSection: React.FC<Props> = ({
  adsr, onChange, accentColor, panelBg, panelStyle, readOnly,
}) => {
  const { attack, decay, sustain, release } = adsr;
  const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

  return (
    <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
      <SectionLabel color={accentColor} label="ADSR Envelope" />
      <EnvelopeVisualization
        mode="sid"
        attack={attack} decay={decay} sustain={sustain} release={release}
        width="auto" height={72}
        color={accentColor} backgroundColor="#060a08" border="none"
      />
      <div className="flex justify-center gap-2">
        <AdsrSlider label="A" value={attack} timeMs={ATTACK_MS[attack]}
          accentColor={accentColor} readOnly={readOnly}
          onChange={(v) => onChange({ attack: v })} />
        <AdsrSlider label="D" value={decay} timeMs={DECAY_MS[decay]}
          accentColor={accentColor} readOnly={readOnly}
          onChange={(v) => onChange({ decay: v })} />
        <AdsrSlider label="S" value={sustain} timeMs={0}
          accentColor={accentColor} readOnly={readOnly}
          onChange={(v) => onChange({ sustain: v })} />
        <AdsrSlider label="R" value={release} timeMs={RELEASE_MS[release]}
          accentColor={accentColor} readOnly={readOnly}
          onChange={(v) => onChange({ release: v })} />
      </div>
      <div className="text-[9px] text-text-secondary text-center mt-1 font-mono">
        AD=${hex2((attack << 4) | decay)} SR=${hex2((sustain << 4) | release)}
      </div>
    </div>
  );
};
