import React from 'react';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';
import type { KnobBankMode } from '@/midi/types';
import { Disc, Activity, Settings, Sliders, Waves } from 'lucide-react';

export const MIDIKnobControlBar: React.FC = () => {
  const { knobBank, setKnobBank, isInitialized } = useMIDIStore();

  if (!isInitialized) return null;

  const banks: { id: KnobBankMode; label: string; icon: any }[] = [
    { id: '303', label: '303/Synth', icon: Settings },
    { id: 'Siren', label: 'Dub Siren', icon: Activity },
    { id: 'FX', label: 'Effects', icon: Waves },
    { id: 'Mixer', label: 'Mixer', icon: Sliders },
  ];

  const currentAssignments = KNOB_BANKS[knobBank];

  return (
    <div className="bg-dark-bgTertiary border-t border-dark-border px-4 py-2 flex flex-col gap-2 shadow-inner">
      {/* Bank Tabs */}
      <div className="flex items-center gap-1">
        <div className="text-[10px] font-bold text-text-muted uppercase mr-2 tracking-widest">Knob Bank:</div>
        {banks.map((bank) => {
          const Icon = bank.icon;
          const isActive = knobBank === bank.id;
          return (
            <button
              key={bank.id}
              onClick={() => setKnobBank(bank.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border
                ${isActive 
                  ? 'bg-accent-primary text-dark-bg border-accent-primary shadow-[0_0_10px_rgba(0,255,255,0.3)]' 
                  : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:border-text-muted'
                }
              `}
            >
              <Icon size={12} />
              {bank.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 text-[9px] text-text-muted bg-dark-bgSecondary px-2 py-1 rounded border border-dark-border">
          <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse"></span>
          AKAI MPK MINI ACTIVE
        </div>
      </div>

      {/* Knob Assignment Grid */}
      <div className="grid grid-cols-8 gap-2">
        {currentAssignments.map((assignment: KnobAssignment, index: number) => (
          <div 
            key={index} 
            className="flex flex-col items-center p-1.5 rounded bg-dark-bgSecondary border border-dark-border relative group overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[2px] bg-accent-primary/20 group-hover:bg-accent-primary/50 transition-colors"></div>
            <span className="text-[8px] font-mono text-text-muted mb-1 flex items-center gap-1">
              <Disc size={8} /> K{index + 1} (CC {assignment.cc})
            </span>
            <span className="text-[10px] font-bold text-accent-primary uppercase truncate w-full text-center">
              {assignment.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};