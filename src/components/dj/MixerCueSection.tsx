/**
 * MixerCueSection - PFL/headphone cueing section
 *
 * Two PFL toggle buttons for Deck A/B, a cue volume knob,
 * a Setup Headphones button, and a cue/master blend slider.
 * Auto-opens the setup wizard when PFL is pressed without a device configured.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Headphones, Settings } from 'lucide-react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import { HeadphoneSetupDialog } from './HeadphoneSetupDialog';

interface CueState {
  pflA: boolean;
  pflB: boolean;
  cueVolume: number;
  cueMix: number;
}

export const MixerCueSection: React.FC = () => {
  const pflA = useDJStore((s) => s.decks.A.pflEnabled);
  const pflB = useDJStore((s) => s.decks.B.pflEnabled);
  const cueVolume = useDJStore((s) => s.cueVolume);
  const cueMix = useDJStore((s) => s.cueMix);
  const cueDeviceId = useDJStore((s) => s.cueDeviceId);
  const cueDeviceName = useDJStore((s) => s.cueDeviceName);

  const [showSetup, setShowSetup] = useState(false);

  // Ref pattern for toggle callbacks
  const stateRef = useRef<CueState>({ pflA, pflB, cueVolume, cueMix });
  useEffect(() => {
    stateRef.current = { pflA, pflB, cueVolume, cueMix };
  }, [pflA, pflB, cueVolume, cueMix]);

  const handlePFLToggle = useCallback((deck: 'A' | 'B' | 'C') => {
    const state = useDJStore.getState();
    // Auto-prompt setup if no headphone device is configured
    if (!state.cueDeviceId && !state.headphoneSetupDone) {
      setShowSetup(true);
      return;
    }
    const current = deck === 'A' ? stateRef.current.pflA : stateRef.current.pflB;
    useDJStore.getState().setDeckPFL(deck, !current);
  }, []);

  const handleCueVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setCueVolume(value);
  }, []);

  const handleCueMixChange = useCallback((value: number) => {
    useDJStore.getState().setCueMix(value);
  }, []);

  const isConfigured = !!cueDeviceId;

  return (
    <>
      <div className="flex flex-col items-center gap-1" title="Headphone cue section">
        {/* CUE volume knob */}
        <Knob
          value={cueVolume}
          min={0}
          max={1.5}
          onChange={handleCueVolumeChange}
          label="CUE"
          size="sm"
          color="#ffcc00"
          defaultValue={1}
          hideValue
          title="Cue volume — headphone pre-fader listen level"
        />

        {/* Cue/Master crossfader */}
        <div className="w-full px-1">
          <div className="flex justify-between text-[7px] font-mono text-text-muted mb-0.5">
            <span>CUE</span>
            <span>MST</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={cueMix}
            onChange={(e) => handleCueMixChange(parseFloat(e.target.value))}
            onDoubleClick={() => handleCueMixChange(0.5)}
            onContextMenu={(e) => { e.preventDefault(); handleCueMixChange(0.5); }}
            className="w-full h-2 appearance-none bg-dark-bgTertiary rounded-full cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-[#66ccff] [&::-webkit-slider-thumb]:border
              [&::-webkit-slider-thumb]:border-[#66ccff]/50 [&::-webkit-slider-thumb]:shadow-sm
              [&::-webkit-slider-thumb]:hover:bg-[#88ddff]"
            title="Cue crossfader — left = PFL only, center = blend, right = master only. Double-click to center."
          />
        </div>

        {/* PFL buttons */}
        <div className="flex gap-1 items-center">
          <Headphones size={10} className="text-text-muted flex-shrink-0" />
          <button
            onClick={() => handlePFLToggle('A')}
            title={`Headphone cue Deck A — ${pflA ? 'disable' : 'enable'} pre-fader listen`}
            className={`
              px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
              ${pflA
                ? 'bg-accent-warning text-text-inverse'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
              }
            `}
          >
            A
          </button>
          <button
            onClick={() => handlePFLToggle('B')}
            title={`Headphone cue Deck B — ${pflB ? 'disable' : 'enable'} pre-fader listen`}
            className={`
              px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
              ${pflB
                ? 'bg-accent-warning text-text-inverse'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
              }
            `}
          >
            B
          </button>
        </div>

        {/* Headphone device status + setup button */}
        <div className="flex flex-col items-center w-full gap-0.5">
          {isConfigured ? (
            <>
              <div className="text-[8px] font-mono text-accent-success truncate max-w-full px-1" title={cueDeviceName || ''}>
                {cueDeviceName || 'Headphones'}
              </div>
              <button
                onClick={() => setShowSetup(true)}
                className="flex items-center gap-1 px-2 py-0.5 text-[8px] font-mono
                         text-text-muted hover:text-text-secondary border border-dark-borderLight
                         bg-dark-bgTertiary rounded hover:bg-dark-bgHover transition-colors"
                title="Change headphone output device"
              >
                <Settings size={8} />
                Change
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowSetup(true)}
              className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono font-medium
                       text-accent-primary border border-accent-primary/40 bg-accent-primary/10
                       rounded hover:bg-accent-primary/20 transition-colors w-full justify-center"
              title="Set up headphone output for cue monitoring"
            >
              <Headphones size={10} />
              Setup Phones
            </button>
          )}
        </div>
      </div>

      <HeadphoneSetupDialog
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
      />
    </>
  );
};
