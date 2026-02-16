/**
 * StatusBar - Bottom status bar showing current state
 */

import React from 'react';
import { useTrackerStore, useTransportStore, useAudioStore, useMIDIStore } from '@stores';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';
import type { KnobBankMode } from '@/midi/types';
import { Lightbulb, Disc, Activity, Settings, Sliders, Waves, ChevronDown, ChevronUp } from 'lucide-react';

interface StatusBarProps {
  onShowTips?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = React.memo(({ onShowTips }) => {
  // Optimize: Only subscribe to specific values, not entire patterns array
  const cursor = useTrackerStore((state) => state.cursor);
  const currentOctave = useTrackerStore((state) => state.currentOctave);
  const insertMode = useTrackerStore((state) => state.insertMode);
  const recordMode = useTrackerStore((state) => state.recordMode);
  const patternLength = useTrackerStore((state) => state.patterns[state.currentPatternIndex]?.length || 64);

  const { isPlaying, currentRow } = useTransportStore();
  const { contextState } = useAudioStore();
  
  // MIDI state
  const { knobBank, setKnobBank, isInitialized, inputDevices, selectedInputId, showKnobBar, setShowKnobBar } = useMIDIStore();

  const displayRow = isPlaying ? currentRow : cursor.rowIndex;
  const rowDisplay = `${String(displayRow).padStart(2, '0')}/${String(patternLength - 1).padStart(2, '0')}`;
  const channelDisplay = `Ch ${cursor.channelIndex + 1}`;

  // MIDI controller info
  const hasMIDIDevice = isInitialized && inputDevices.length > 0;
  const selectedDevice = hasMIDIDevice ? (inputDevices.find(d => d.id === selectedInputId) || inputDevices[0]) : null;
  const deviceName = selectedDevice?.name || 'MIDI Controller';

  const banks: { id: KnobBankMode; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: '303', label: '303/Synth', icon: Settings },
    { id: 'Siren', label: 'Dub Siren', icon: Activity },
    { id: 'FX', label: 'Effects', icon: Waves },
    { id: 'Mixer', label: 'Mixer', icon: Sliders },
  ];

  const currentAssignments = hasMIDIDevice ? KNOB_BANKS[knobBank] : [];

  return (
    <div className="flex flex-col">
      {/* MIDI Knob Controls - Expanded */}
      {hasMIDIDevice && showKnobBar && (
        <div className="bg-dark-bgTertiary border-t border-dark-border px-4 py-2 flex flex-col gap-2">
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
      )}
      
      {/* Main Status Bar */}
      <div className="bg-dark-bgSecondary border-t border-dark-border flex items-center justify-between px-4 py-1.5 text-xs font-mono">
        {/* Left: Cursor Position & Mode */}
      <div className="flex items-center gap-4">
        <span className="text-text-primary">
          Row <span className="text-accent-primary font-semibold">{rowDisplay}</span>
        </span>
        <div className="w-px h-3 bg-border opacity-50"></div>
        <span className="text-text-primary">
          {channelDisplay}
        </span>
        <div className="w-px h-3 bg-border opacity-50"></div>
        <span className="text-text-primary capitalize">
          {cursor.columnType}
        </span>
        <div className="w-px h-3 bg-border opacity-50"></div>
        <span className="text-text-primary">
          Oct <span className="text-accent-primary font-semibold">{currentOctave}</span>
        </span>
        <div className="w-px h-3 bg-border opacity-50"></div>
        <span className="text-text-primary" title={insertMode ? 'Insert mode: new data shifts rows down' : 'Overwrite mode: new data replaces existing'}>
          Mode: <span className={insertMode ? 'text-accent-warning' : 'text-accent-primary'}>{insertMode ? 'INS' : 'OVR'}</span>
        </span>
        <div className="w-px h-3 bg-border opacity-50"></div>
        <span className={`px-2 py-0.5 rounded ${recordMode ? 'bg-accent-error/20 text-accent-error' : 'text-text-primary'}`}>
          {recordMode ? 'REC' : 'EDIT'}
        </span>
      </div>

      {/* Right: MIDI Device, Audio State & Tips */}
      <div className="flex items-center gap-4">
        {/* MIDI Device Status */}
        {hasMIDIDevice && (
          <>
            <button
              onClick={() => setShowKnobBar(!showKnobBar)}
              className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-accent-primary transition-colors"
              title={showKnobBar ? "Hide MIDI controls" : "Show MIDI controls"}
            >
              <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse"></span>
              <span className="font-bold uppercase">{deviceName}</span>
              {showKnobBar ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
            <div className="w-px h-3 bg-border opacity-50"></div>
          </>
        )}
        
        {onShowTips && (
          <>
            <button
              onClick={onShowTips}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent-warning/10 text-accent-warning hover:bg-accent-warning/20 transition-colors"
              title="Tip of the Day"
            >
              <Lightbulb size={12} />
              <span className="text-[10px] font-bold uppercase tracking-tight">Tips</span>
            </button>
            <div className="w-px h-3 bg-border opacity-50"></div>
          </>
        )}

        <span
          className={`flex items-center gap-1.5 ${
            contextState === 'running' ? 'text-accent-success' : 'text-text-muted'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${contextState === 'running' ? 'bg-accent-success' : 'bg-text-muted'}`}></span>
          {contextState === 'running' ? 'Audio Active' : 'Audio Off'}
        </span>
      </div>
    </div>
  </div>
  );
});
