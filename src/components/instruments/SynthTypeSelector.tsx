/**
 * SynthTypeSelector - Grid of synth types to choose from
 */

import React from 'react';
import {
  Music2,
  Radio,
  Layers,
  Waves,
  Signal,
  Guitar,
  Bell,
  Drum,
  Wind,
  Volume2,
  Disc,
  Play
} from 'lucide-react';
import type { InstrumentConfig, SynthType } from '../../types/instrument';
import { useInstrumentStore } from '../../stores';

interface SynthTypeSelectorProps {
  instrument: InstrumentConfig;
}

const SYNTH_TYPES: {
  type: SynthType;
  name: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}[] = [
  {
    type: 'Synth',
    name: 'Synth',
    Icon: Music2,
    description: 'Basic polyphonic synthesizer',
  },
  {
    type: 'MonoSynth',
    name: 'MonoSynth',
    Icon: Radio,
    description: 'Monophonic analog-style synth',
  },
  {
    type: 'DuoSynth',
    name: 'DuoSynth',
    Icon: Layers,
    description: 'Two oscillators with frequency offset',
  },
  {
    type: 'FMSynth',
    name: 'FMSynth',
    Icon: Waves,
    description: 'Frequency modulation synthesis',
  },
  {
    type: 'AMSynth',
    name: 'AMSynth',
    Icon: Signal,
    description: 'Amplitude modulation synthesis',
  },
  {
    type: 'PluckSynth',
    name: 'PluckSynth',
    Icon: Guitar,
    description: 'Karplus-Strong string synthesis',
  },
  {
    type: 'MetalSynth',
    name: 'MetalSynth',
    Icon: Bell,
    description: 'Metallic bell and percussion',
  },
  {
    type: 'MembraneSynth',
    name: 'MembraneSynth',
    Icon: Drum,
    description: 'Kick drum and membrane sounds',
  },
  {
    type: 'NoiseSynth',
    name: 'NoiseSynth',
    Icon: Wind,
    description: 'Filtered noise generator',
  },
  {
    type: 'TB303',
    name: 'TB-303',
    Icon: Volume2,
    description: 'Authentic acid bass synthesizer',
  },
  {
    type: 'Sampler',
    name: 'Sampler',
    Icon: Disc,
    description: 'Sample playback engine',
  },
  {
    type: 'Player',
    name: 'Player',
    Icon: Play,
    description: 'Audio file player',
  },
];

export const SynthTypeSelector: React.FC<SynthTypeSelectorProps> = ({ instrument }) => {
  const { updateInstrument } = useInstrumentStore();

  const handleTypeChange = (type: SynthType) => {
    updateInstrument(instrument.id, { synthType: type });
  };

  return (
    <div className="bg-dark-bg p-4">
      <div className="grid grid-cols-3 gap-3">
        {SYNTH_TYPES.map((synth) => {
          const isActive = instrument.synthType === synth.type;
          return (
            <button
              key={synth.type}
              onClick={() => handleTypeChange(synth.type)}
              className={`
                p-4 border rounded-lg transition-all text-left
                ${
                  isActive
                    ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                    : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight hover:bg-dark-bgHover'
                }
              `}
            >
              <div className="flex items-center gap-2 mb-1">
                <synth.Icon size={20} className={isActive ? '' : 'text-accent-primary'} />
                <span className="font-mono text-sm font-bold">{synth.name}</span>
              </div>
              <div className={`text-xs ${isActive ? 'opacity-90' : 'text-text-muted'}`}>
                {synth.description}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 text-sm bg-dark-bgSecondary p-3 rounded-lg border border-dark-border">
        <span className="text-text-muted">Current: </span>
        <span className="text-accent-primary font-bold font-mono">{instrument.synthType}</span>
      </div>
    </div>
  );
};
