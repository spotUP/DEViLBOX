/**
 * StatusBar - Bottom status bar showing current state
 * Shows tracker info in tracker/arrangement views, DJ info in DJ view.
 */

import React from 'react';
import { useTrackerStore, useTransportStore, useAudioStore, useMIDIStore, useUIStore } from '@stores';
import { useDJStore } from '@/stores/useDJStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';
import { useShallow } from 'zustand/react/shallow';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';
import type { KnobBankMode } from '@/midi/types';
import { Lightbulb, Disc, Activity, Settings, Sliders, Waves, ChevronDown, ChevronUp } from 'lucide-react';

interface StatusBarProps {
  onShowTips?: () => void;
}

// ─── DJ Status Bar Content ────────────────────────────────────────────────────

const DJStatusContent: React.FC = () => {
  const {
    deck1Playing, deck2Playing,
    deck1BPM, deck2BPM,
    deck1Name, deck2Name,
    deck1Pos, deck1Total,
    deck2Pos, deck2Total,
    crossfader, curve,
  } = useDJStore(useShallow((s) => ({
    deck1Playing: s.decks.A.isPlaying,
    deck2Playing: s.decks.B.isPlaying,
    deck1BPM: s.decks.A.effectiveBPM || 0,
    deck2BPM: s.decks.B.effectiveBPM || 0,
    deck1Name: s.decks.A.trackName,
    deck2Name: s.decks.B.trackName,
    deck1Pos: s.decks.A.songPos,
    deck1Total: s.decks.A.totalPositions,
    deck2Pos: s.decks.B.songPos,
    deck2Total: s.decks.B.totalPositions,
    crossfader: s.crossfaderPosition,
    curve: s.crossfaderCurve,
  })));

  const sep = <div className="w-px h-3 bg-border opacity-50" />;

  return (
    <div className="flex items-center gap-4">
      {/* Deck 1 */}
      <span className="text-text-primary">
        <span className="text-blue-400 font-semibold">D1</span>{' '}
        {deck1Playing ? (
          <span className="text-accent-success">PLAY</span>
        ) : (
          <span className="text-text-muted">STOP</span>
        )}
      </span>
      {deck1Name && (
        <span className="text-text-muted truncate max-w-[120px]" title={deck1Name}>
          {deck1Name}
        </span>
      )}
      <span className="text-text-primary tabular-nums">
        <span className="text-blue-400">{deck1BPM.toFixed(1)}</span> BPM
      </span>
      {deck1Total > 0 && (
        <span className="text-text-muted tabular-nums">
          Pos {deck1Pos}/{deck1Total}
        </span>
      )}

      {sep}

      {/* Crossfader */}
      <span className="text-text-primary">
        X-Fade{' '}
        <span className="text-accent-primary tabular-nums">{(crossfader * 100).toFixed(0)}%</span>
        <span className="text-text-muted ml-1">({curve})</span>
      </span>

      {sep}

      {/* Deck 2 */}
      <span className="text-text-primary">
        <span className="text-red-400 font-semibold">D2</span>{' '}
        {deck2Playing ? (
          <span className="text-accent-success">PLAY</span>
        ) : (
          <span className="text-text-muted">STOP</span>
        )}
      </span>
      {deck2Name && (
        <span className="text-text-muted truncate max-w-[120px]" title={deck2Name}>
          {deck2Name}
        </span>
      )}
      <span className="text-text-primary tabular-nums">
        <span className="text-red-400">{deck2BPM.toFixed(1)}</span> BPM
      </span>
      {deck2Total > 0 && (
        <span className="text-text-muted tabular-nums">
          Pos {deck2Pos}/{deck2Total}
        </span>
      )}
    </div>
  );
};

// ─── Tracker Status Bar Content ───────────────────────────────────────────────

const TrackerStatusContent: React.FC = () => {
  const { cursor, currentOctave, insertMode, recordMode, patternLength } = useTrackerStore(
    useShallow((s) => ({
      cursor: s.cursor,
      currentOctave: s.currentOctave,
      insertMode: s.insertMode,
      recordMode: s.recordMode,
      patternLength: s.patterns[s.currentPatternIndex]?.length || 64,
    }))
  );
  const { isPlaying, currentRow } = useTransportStore(
    useShallow((s) => ({ isPlaying: s.isPlaying, currentRow: s.currentRow }))
  );

  const displayRow = isPlaying ? currentRow : cursor.rowIndex;
  const rowDisplay = `${String(displayRow).padStart(2, '0')}/${String(patternLength - 1).padStart(2, '0')}`;
  const channelDisplay = `Ch ${cursor.channelIndex + 1}`;

  return (
    <div className="flex items-center gap-4">
      <span className="text-text-primary">
        Row <span className="text-accent-primary font-semibold">{rowDisplay}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary">{channelDisplay}</span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary capitalize">{cursor.columnType}</span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary">
        Oct <span className="text-accent-primary font-semibold">{currentOctave}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary" title={insertMode ? 'Insert mode: new data shifts rows down' : 'Overwrite mode: new data replaces existing'}>
        Mode: <span className={insertMode ? 'text-accent-warning' : 'text-accent-primary'}>{insertMode ? 'INS' : 'OVR'}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className={`px-2 py-0.5 rounded ${recordMode ? 'bg-accent-error/20 text-accent-error' : 'text-text-primary'}`}>
        {recordMode ? 'REC' : 'EDIT'}
      </span>
    </div>
  );
};

// ─── Main StatusBar ───────────────────────────────────────────────────────────

export const StatusBar: React.FC<StatusBarProps> = React.memo(({ onShowTips }) => {
  const activeView = useUIStore((s) => s.activeView);
  const { contextState } = useAudioStore();
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabRoomCode = useCollaborationStore((s) => s.roomCode);

  // MIDI state
  const { knobBank, setKnobBank, isInitialized, inputDevices, selectedInputId, showKnobBar, setShowKnobBar } = useMIDIStore();

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
      {/* MIDI Knob Controls - Expanded (tracker/arrangement only) */}
      {activeView !== 'dj' && activeView !== 'vj' && hasMIDIDevice && showKnobBar && (
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
        {/* Left: View-specific content */}
        {activeView === 'dj' ? <DJStatusContent /> : activeView === 'vj' ? (
          <div className="flex items-center gap-3 text-text-muted">
            <span className="text-accent">VJ</span>
            <span className="text-[10px]">Esc: back • ⌘⇧V: toggle • Milkdrop | ISF | 3D</span>
          </div>
        ) : <TrackerStatusContent />}

        {/* Right: MIDI Device, Audio State & Tips */}
        <div className="flex items-center gap-4">
          {/* MIDI Device Status */}
          {hasMIDIDevice && activeView !== 'dj' && activeView !== 'vj' && (
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

          {/* Collab connected badge */}
          {collabStatus === 'connected' && collabRoomCode && (
            <>
              <span className="flex items-center gap-1.5 text-accent-success">
                <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse" />
                <span className="font-bold">Collab</span>
                <span className="font-mono text-[10px] text-text-muted">{collabRoomCode}</span>
              </span>
              <div className="w-px h-3 bg-border opacity-50" />
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
