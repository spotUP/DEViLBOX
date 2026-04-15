/**
 * MixerCueSection - PFL/headphone cueing section
 *
 * Two PFL toggle buttons for Deck A/B, a cue volume knob, and
 * an output device selector dropdown for routing to headphones.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Headphones } from 'lucide-react';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import { useDJStore } from '@/stores/useDJStore';
import { DJCueEngine } from '@/engine/dj/DJCueEngine';

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
  const setCueDevice = useDJStore((s) => s.setCueDevice);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [supportsMultiOutput, setSupportsMultiOutput] = useState(false);

  // Ref pattern for toggle callbacks
  const stateRef = useRef<CueState>({ pflA, pflB, cueVolume, cueMix });
  useEffect(() => {
    stateRef.current = { pflA, pflB, cueVolume, cueMix };
  }, [pflA, pflB, cueVolume, cueMix]);

  // Enumerate audio output devices on mount
  useEffect(() => {
    setSupportsMultiOutput(DJCueEngine.supportsSetSinkId());

    const loadDevices = async () => {
      // Request audio permissions to get device labels
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Immediately release
      } catch (_err) {
        console.warn('[MixerCueSection] Microphone permission denied, device labels may be unavailable');
      }

      const audioOutputs = await DJCueEngine.getOutputDevices();
      setDevices(audioOutputs);
    };

    void loadDevices();
  }, []);

  const handlePFLToggle = useCallback((deck: 'A' | 'B' | 'C') => {
    const current = deck === 'A' ? stateRef.current.pflA : stateRef.current.pflB;
    useDJStore.getState().setDeckPFL(deck, !current);
  }, []);

  const handleCueVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setCueVolume(value);
  }, []);

  const handleCueMixChange = useCallback((value: number) => {
    useDJStore.getState().setCueMix(value);
  }, []);

  const handleDeviceChange = useCallback((v: string) => {
    const deviceId = v || null;
    setCueDevice(deviceId);
  }, [setCueDevice]);

  return (
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

      {/* Cue/Master crossfader — horizontal slider for quick headphone blend */}
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

      {/* PFL buttons — headphone pre-listen per deck */}
      <div className="flex gap-1 items-center">
        <Headphones size={10} className="text-text-muted flex-shrink-0" />
        <button
          onClick={() => handlePFLToggle('A')}
          title={`Headphone cue Deck A — ${pflA ? 'disable' : 'enable'} pre-fader listen`}
          className={`
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${
              pflA
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
            ${
              pflB
                ? 'bg-accent-warning text-text-inverse'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
            }
          `}
        >
          B
        </button>
      </div>

      {/* Headphone output device selector */}
      <div className="flex flex-col items-center w-full gap-0.5">
        <label className="text-[7px] font-mono text-text-muted uppercase tracking-wider">Phones</label>
        <CustomSelect
          value={cueDeviceId || ''}
          onChange={handleDeviceChange}
          options={[
            { value: '', label: 'System Default' },
            ...devices.map(d => ({
              value: d.deviceId,
              label: d.label || 'Unknown Device',
            })),
          ]}
          className="w-full px-1 py-0.5 text-[8px] font-mono bg-dark-bgTertiary text-text-secondary border border-dark-borderLight rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
          title="Headphone output device — only affects cue/PFL monitoring, not main speakers"
        />
        {!supportsMultiOutput && (
          <span className="text-[7px] text-accent-warning opacity-70" title="setSinkId not supported - requires Chrome/Edge or Y-splitter cable">
            ⚠ Y-splitter required
          </span>
        )}
        {supportsMultiOutput && (
          <span className="text-[7px] text-accent-success opacity-70" title="Multi-output supported">
            ✓ Multi-output
          </span>
        )}
      </div>
    </div>
  );
};
