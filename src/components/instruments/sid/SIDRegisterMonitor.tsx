import React, { useEffect } from 'react';
import { SectionLabel } from '@components/instruments/shared';
import { SID_VOICE_REGS, SID_FILTER_REGS, hex2 } from '@/lib/sid/sidConstants';

interface Props {
  getSidRegisters: (chipIndex: number) => Uint8Array | null;
  getSidCount: () => number;
  refreshSidRegisters: () => void;
  accentColor: string;
  panelBg: string;
  panelStyle: React.CSSProperties;
  active: boolean;
}

export const SIDRegisterMonitor: React.FC<Props> = ({
  getSidRegisters, getSidCount, refreshSidRegisters,
  accentColor, panelBg, panelStyle, active,
}) => {
  useEffect(() => {
    if (!active) return;
    refreshSidRegisters();
    const id = setInterval(refreshSidRegisters, 66);
    return () => clearInterval(id);
  }, [active, refreshSidRegisters]);

  const chipCount = getSidCount();

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {Array.from({ length: chipCount }, (_, chipIdx) => {
        const regs = getSidRegisters(chipIdx);
        return (
          <div key={chipIdx} className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
            {chipCount > 1 && <SectionLabel color={accentColor} label={`SID ${chipIdx + 1}`} />}
            <div className="font-mono text-xs" style={{ lineHeight: '1.6' }}>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {[0, 1, 2].map((voice) => {
                  const base = voice * 7;
                  return (
                    <div key={voice}>
                      <div className="text-xs font-bold mb-1" style={{ color: accentColor, opacity: 0.6 }}>
                        Voice {voice + 1}
                      </div>
                      <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                        {SID_VOICE_REGS.map(({ offset, label }) => {
                          const reg = base + offset;
                          const val = regs?.[reg] ?? 0;
                          return (
                            <React.Fragment key={reg}>
                              <span className="text-text-secondary text-right">{label}</span>
                              <span style={{ color: val > 0 ? accentColor : '#444' }}>{hex2(val)}</span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div>
                  <div className="text-xs font-bold mb-1" style={{ color: accentColor, opacity: 0.6 }}>
                    Filter
                  </div>
                  <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                    {SID_FILTER_REGS.map(({ offset, label }) => {
                      const val = regs?.[offset] ?? 0;
                      return (
                        <React.Fragment key={offset}>
                          <span className="text-text-secondary text-right">{label}</span>
                          <span style={{ color: val > 0 ? accentColor : '#444' }}>{hex2(val)}</span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
