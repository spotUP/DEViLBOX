import React from 'react';
import { SectionLabel } from '@components/instruments/shared';
import { WAVEFORM_BITS, CONTROL_BITS, hex2 } from '@/lib/sid/sidConstants';
import type { SIDWaveform } from './SIDInstrumentAdapter';

interface Props {
  waveform: SIDWaveform;
  onChange: (wf: Partial<SIDWaveform>) => void;
  accentColor: string;
  panelBg: string;
  panelStyle: React.CSSProperties;
  showControlBits?: boolean;
  readOnly?: boolean;
}

export const SIDWaveformSection: React.FC<Props> = ({
  waveform, onChange, accentColor, panelBg, panelStyle,
  showControlBits = true, readOnly,
}) => {
  const rawByte = (waveform.tri ? 0x10 : 0) | (waveform.saw ? 0x20 : 0) |
    (waveform.pul ? 0x40 : 0) | (waveform.noi ? 0x80 : 0) |
    (waveform.gate ? 0x01 : 0) | (waveform.sync ? 0x02 : 0) |
    (waveform.ring ? 0x04 : 0) | (waveform.test ? 0x08 : 0);

  const wfKeyMap: Record<string, keyof SIDWaveform> = {
    TRI: 'tri', SAW: 'saw', PUL: 'pul', NOI: 'noi',
  };

  return (
    <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
      <SectionLabel color={accentColor} label="Waveform" />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {WAVEFORM_BITS.map(({ label }) => {
          const key = wfKeyMap[label];
          const active = waveform[key];
          return (
            <button key={label} onClick={() => !readOnly && onChange({ [key]: !active })}
              className="px-2.5 py-1 text-xs font-mono rounded transition-colors"
              style={{
                background: active ? accentColor : '#111',
                color: active ? '#000' : '#666',
                border: `1px solid ${active ? accentColor : 'var(--color-border-light)'}`,
                opacity: readOnly ? 0.5 : 1,
              }}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={waveform.gate}
            onChange={() => !readOnly && onChange({ gate: !waveform.gate })}
            disabled={readOnly} style={{ accentColor }} />
          <span className="text-[10px] text-text-secondary">Gate on</span>
        </label>
        <span className="text-[9px] font-mono text-text-secondary ml-auto">${hex2(rawByte)}</span>
      </div>
      {showControlBits && (
        <div className="flex gap-3 mt-2">
          {CONTROL_BITS.map(({ label, name }) => {
            const key = label.toLowerCase() as keyof SIDWaveform;
            return (
              <label key={label} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={!!waveform[key]}
                  onChange={() => !readOnly && onChange({ [key]: !waveform[key] })}
                  disabled={readOnly} style={{ accentColor }} />
                <span className="text-[9px] text-text-secondary" title={name}>{label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
