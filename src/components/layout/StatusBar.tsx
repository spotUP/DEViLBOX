/**
 * StatusBar - Bottom status bar showing current state
 * Shows tracker info in tracker/arrangement views, DJ info in DJ view.
 */

import React, { useEffect, useRef, useState as useReactState } from 'react';
import { useTrackerStore, useCursorStore, useTransportStore, useAudioStore, useMIDIStore, useUIStore, useFormatStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useDJStore } from '@/stores/useDJStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useShallow } from 'zustand/react/shallow';
import { KNOB_BANKS } from '@/midi/knobBanks';
import { DJ_KNOB_BANKS, DJ_KNOB_PAGE_NAMES } from '@/midi/djKnobBanks';
import type { KnobBankMode } from '@/midi/types';
import { Disc, Activity, Settings, Sliders, Waves, ChevronDown, ChevronUp } from 'lucide-react';

interface StatusBarProps {}

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
  const cursor = useCursorStore((s) => s.cursor);
  const { currentOctave, insertMode, recordMode } = useEditorStore(
    useShallow((s) => ({
      currentOctave: s.currentOctave,
      insertMode: s.insertMode,
      recordMode: s.recordMode,
    }))
  );
  const { patternLength } = useTrackerStore(
    useShallow((s) => ({
      patternLength: s.patterns[s.currentPatternIndex]?.length || 64,
    }))
  );
  const { songDBInfo, sidMetadata } = useFormatStore(
    useShallow((s) => ({
      songDBInfo: s.songDBInfo,
      sidMetadata: s.sidMetadata,
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
        Row <span className="text-accent-primary font-semibold tabular-nums">{rowDisplay}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary tabular-nums min-w-[3.5ch]">{channelDisplay}</span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary min-w-[6ch]">{cursor.columnType}</span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary">
        Oct <span className="text-accent-primary font-semibold tabular-nums">{currentOctave}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className="text-text-primary min-w-[7ch]" title={insertMode ? 'Insert mode: new data shifts rows down' : 'Overwrite mode: new data replaces existing'}>
        Mode: <span className={insertMode ? 'text-accent-warning' : 'text-accent-primary'}>{insertMode ? 'INS' : 'OVR'}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
      <span className={`px-2 py-0.5 rounded min-w-[4ch] text-center ${recordMode ? 'bg-accent-error/20 text-accent-error' : 'text-text-primary'}`}>
        {recordMode ? 'REC' : 'EDIT'}
      </span>
      {sidMetadata && (
        <>
          <div className="w-px h-3 bg-border opacity-50" />
          <div className="flex items-center gap-2 text-text-muted text-xs">
            {sidMetadata.title && (
              <span className="text-text-primary">{sidMetadata.title}</span>
            )}
            {sidMetadata.author && (
              <span>by <span className="text-text-primary font-semibold">{sidMetadata.author}</span></span>
            )}
            {sidMetadata.chipModel !== 'Unknown' && (
              <span className="text-text-muted">[MOS {sidMetadata.chipModel}]</span>
            )}
            {sidMetadata.clockSpeed !== 'Unknown' && (
              <span className="text-text-muted">{sidMetadata.clockSpeed}</span>
            )}
            {sidMetadata.subsongs > 1 && (
              <span className="text-text-muted tabular-nums">Sub {sidMetadata.currentSubsong + 1}/{sidMetadata.subsongs}</span>
            )}
          </div>
        </>
      )}
      {songDBInfo && (
        <>
          <div className="w-px h-3 bg-border opacity-50" />
          <div className="flex items-center gap-2 text-text-muted text-xs">
            {songDBInfo.album && (
              <span>
                <span className="text-text-primary">{songDBInfo.album}</span>
              </span>
            )}
            {songDBInfo.year && (
              <span className="text-text-muted">({songDBInfo.year})</span>
            )}
            {songDBInfo.format && (
              <span className="text-text-muted">
                [{songDBInfo.format}]
              </span>
            )}
            {songDBInfo.authors?.length > 0 && (
              <span>
                by <span className="text-text-primary font-semibold">{songDBInfo.authors.join(', ')}</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Drum Pad Status Bar Content ─────────────────────────────────────────────

const DrumPadStatusContent: React.FC = () => {
  const currentBank = useDrumPadStore(s => s.currentBank);
  const programCount = useDrumPadStore(s => s.programs.size);
  const noteRepeatEnabled = useDrumPadStore(s => s.noteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore(s => s.noteRepeatRate);

  const sep = <div className="w-px h-3 bg-border opacity-50" />;

  return (
    <div className="flex items-center gap-4">
      <span className="text-accent-primary font-semibold">Bank {currentBank}</span>
      {sep}
      <span className="text-text-primary">{programCount} program{programCount !== 1 ? 's' : ''}</span>
      {sep}
      <span className="text-text-muted">16 pads</span>
      {noteRepeatEnabled && (
        <>
          {sep}
          <span className="text-accent-warning">Repeat: {noteRepeatRate}</span>
        </>
      )}
    </div>
  );
};

// ─── Mixer Status Bar Content ────────────────────────────────────────────────

const MixerStatusContent: React.FC = () => {
  const mutedChannels = useMixerStore(s => s.channels.filter(c => c.muted).length);
  const soloChannels = useMixerStore(s => s.channels.filter(c => c.soloed).length);

  const sep = <div className="w-px h-3 bg-border opacity-50" />;

  return (
    <div className="flex items-center gap-4">
      <span className="text-accent-primary font-semibold">MIXER</span>
      {sep}
      <span className="text-text-primary">16 channels</span>
      {mutedChannels > 0 && (
        <>
          {sep}
          <span className="text-accent-warning">{mutedChannels} muted</span>
        </>
      )}
      {soloChannels > 0 && (
        <>
          {sep}
          <span className="text-accent-success">{soloChannels} solo</span>
        </>
      )}
    </div>
  );
};

// ─── Studio Status Bar Content ───────────────────────────────────────────────

const StudioStatusContent: React.FC = () => {
  const windowCount = useWorkbenchStore(s => Object.keys(s.windows).length);
  const zoom = useWorkbenchStore(s => s.camera.scale);

  const sep = <div className="w-px h-3 bg-border opacity-50" />;

  return (
    <div className="flex items-center gap-4">
      <span className="text-accent-primary font-semibold">STUDIO</span>
      {sep}
      <span className="text-text-primary">{windowCount} window{windowCount !== 1 ? 's' : ''}</span>
      {sep}
      <span className="text-text-muted tabular-nums">Zoom: {Math.round(zoom * 100)}%</span>
    </div>
  );
};

// ─── SID Hardware Badge ───────────────────────────────────────────────────────

const SIDHardwareBadge: React.FC = () => {
  const sidHwMode = useSettingsStore(s => s.sidHardwareMode);
  const [connected, setConnected] = useReactState(false);
  const [active, setActive] = useReactState(false);
  const lastWriteCountRef = useRef(0);

  useEffect(() => {
    if (sidHwMode === 'off') { setConnected(false); setActive(false); return; }
    let unsub: (() => void) | undefined;
    import('@lib/sid/SIDHardwareManager').then(({ getSIDHardwareManager }) => {
      const mgr = getSIDHardwareManager();
      const update = () => {
        const st = mgr.getStatus();
        setConnected(st.connected);
        if (st.writeCount !== lastWriteCountRef.current) {
          lastWriteCountRef.current = st.writeCount;
          setActive(true);
        } else {
          setActive(false);
        }
      };
      update();
      const iv = setInterval(update, 500);
      unsub = mgr.onStatusChange(update);
      return () => { clearInterval(iv); unsub?.(); };
    });
    return () => unsub?.();
  }, [sidHwMode]);

  if (sidHwMode === 'off') return null;

  const label = `SID ${sidHwMode === 'webusb' ? 'USB' : 'ASID'}`;
  const dotClass = connected
    ? (active ? 'bg-accent-success animate-pulse' : 'bg-accent-success')
    : 'bg-accent-error';
  const textClass = connected ? 'text-accent-success' : 'text-accent-error';

  return (
    <>
      <span className={`flex items-center gap-1.5 ${textClass}`}>
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="font-bold text-[10px] uppercase">{label}</span>
      </span>
      <div className="w-px h-3 bg-border opacity-50" />
    </>
  );
};

// ─── Main StatusBar ───────────────────────────────────────────────────────────

export const StatusBar: React.FC<StatusBarProps> = React.memo(() => {
  const activeView = useUIStore((s) => s.activeView);
  const { contextState } = useAudioStore();
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabRoomCode = useCollaborationStore((s) => s.roomCode);

  // MIDI state
  const { knobBank, setKnobBank, djKnobPage, setDJKnobPage, isInitialized, inputDevices, selectedInputId, showKnobBar, setShowKnobBar } = useMIDIStore();

  const hasMIDIDevice = isInitialized && inputDevices.length > 0;
  const selectedDevice = hasMIDIDevice ? (inputDevices.find(d => d.id === selectedInputId) || inputDevices[0]) : null;
  const deviceName = selectedDevice?.name || 'MIDI Controller';

  const banks: { id: KnobBankMode; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: '303', label: '303/Synth', icon: Settings },
    { id: 'Siren', label: 'Dub Siren', icon: Activity },
    { id: 'FX', label: 'Effects', icon: Waves },
    { id: 'Mixer', label: 'Mixer', icon: Sliders },
  ];

  const isDJ = activeView === 'dj';
  const currentAssignments = hasMIDIDevice
    ? isDJ ? DJ_KNOB_BANKS[djKnobPage] ?? [] : KNOB_BANKS[knobBank]
    : [];

  return (
    <div className="flex flex-col">
      {/* MIDI Knob Controls - Expanded */}
      {activeView !== 'vj' && hasMIDIDevice && showKnobBar && (
        <div className="bg-dark-bgTertiary border-t border-dark-border px-4 py-2 flex flex-col gap-2">
          {/* Bank Tabs */}
          <div className="flex items-center gap-1">
            <div className="text-[10px] font-bold text-text-muted uppercase mr-2 tracking-widest">
              {isDJ ? 'DJ Knobs:' : 'Knob Bank:'}
            </div>
            {isDJ ? (
              DJ_KNOB_PAGE_NAMES.map((pageName, i) => {
                const isActive = djKnobPage === i;
                return (
                  <button
                    key={i}
                    onClick={() => setDJKnobPage(i)}
                    className={`
                      flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border
                      ${isActive
                        ? 'bg-accent-primary text-dark-bg border-accent-primary shadow-[0_0_10px_rgba(0,255,255,0.3)]'
                        : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:border-text-muted'
                      }
                    `}
                  >
                    {pageName}
                  </button>
                );
              })
            ) : (
              banks.map((bank) => {
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
              })
            )}
          </div>

          {/* Knob Assignment Grid */}
          <div className="grid grid-cols-8 gap-2">
            {currentAssignments.map((assignment: { cc: number; label: string }, index: number) => (
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
        {activeView === 'dj' ? <DJStatusContent />
          : activeView === 'vj' ? (
            <div className="flex items-center gap-3 text-text-muted">
              <span className="text-accent">VJ</span>
              <span className="text-[10px]">Esc: back | Milkdrop | ISF | 3D</span>
            </div>
          )
          : activeView === 'drumpad' ? <DrumPadStatusContent />
          : activeView === 'mixer' ? <MixerStatusContent />
          : activeView === 'studio' ? <StudioStatusContent />
          : <TrackerStatusContent />}

        {/* Right: MIDI Device, Audio State & Tips */}
        <div className="flex items-center gap-4">
          {/* MIDI Device Status */}
          {hasMIDIDevice && activeView !== 'vj' && (
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

          {/* SID hardware badge */}
          <SIDHardwareBadge />

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
