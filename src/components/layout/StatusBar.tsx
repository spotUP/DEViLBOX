/**
 * StatusBar - Bottom status bar showing current state
 * Shows tracker info in tracker/arrangement views, DJ info in DJ view.
 */

import React, { useCallback, useEffect, useRef, useState as useReactState } from 'react';
import { useTrackerStore, useCursorStore, useTransportStore, useAudioStore, useMIDIStore, useUIStore, useFormatStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useDJStore } from '@/stores/useDJStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useShallow } from 'zustand/react/shallow';
import type { KnobAssignment } from '@/midi/knobBanks';
import { getKnobBankForSynth, getKnobPageName } from '@/midi/knobBanks';
import { DJ_KNOB_BANKS, DJ_KNOB_PAGE_NAMES } from '@/midi/djKnobBanks';
import { Knob } from '@/components/controls/Knob';
import { routeParameterToEngine } from '@/midi/performance/parameterRouter';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const contextState = useAudioStore((s) => s.contextState);
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabRoomCode = useCollaborationStore((s) => s.roomCode);

  // MIDI state
  const {
    djKnobPage, setDJKnobPage,
    isInitialized, inputDevices, selectedInputId,
    showKnobBar, setShowKnobBar, knobValues, setKnobValue,
    nksKnobAssignments, nksKnobTotalPages, nksActiveSynthType,
    nksKnobPage, nextKnobPage, prevKnobPage,
  } = useMIDIStore();

  const hasMIDIDevice = isInitialized && inputDevices.length > 0;
  const selectedDevice = hasMIDIDevice ? (inputDevices.find(d => d.id === selectedInputId) || inputDevices[0]) : null;
  const deviceName = selectedDevice?.name || 'MIDI Controller';

  const masterEffects = useAudioStore(s => s.masterEffects);

  const isDJ = activeView === 'dj';

  // Build context-aware knob assignments:
  // - Synth params from NKS2 (auto-mapped to current instrument)
  // - Always include mixer controls (filter, volume)
  // - Include master FX wet knobs for loaded effects
  const contextKnobs = React.useMemo((): KnobAssignment[] => {
    if (isDJ) return (DJ_KNOB_BANKS[djKnobPage] ?? []) as KnobAssignment[];

    const hasSynth = nksKnobAssignments.length > 0;
    const enabledFx = masterEffects.filter(fx => fx.enabled !== false);

    // Nothing loaded — no synth, no FX → empty (hides bar)
    if (!hasSynth && enabledFx.length === 0) return [];

    // Curated legacy banks (303, Synare, etc.) are self-contained — use as-is.
    // The page system handles additional knob pages.
    const hasCuratedBank = nksActiveSynthType
      ? getKnobBankForSynth(nksActiveSynthType as import('@/types/instrument').SynthType) !== null
      : false;

    if (hasSynth && hasCuratedBank) {
      return nksKnobAssignments;
    }

    // NKS2-generated or no-bank synths: append mixer + FX + master
    const all: KnobAssignment[] = [];

    if (hasSynth) all.push(...nksKnobAssignments);

    if (hasSynth) {
      all.push(
        { cc: 70, param: 'mixer.filterPosition', label: 'Filter' },
        { cc: 71, param: 'mixer.filterResonance', label: 'Reso' },
        { cc: 72, param: 'mixer.volume', label: 'Volume' },
        { cc: 73, param: 'mixer.pan', label: 'Pan' },
      );
    }

    for (let i = 0; i < Math.min(enabledFx.length, 3); i++) {
      all.push({
        cc: 74 + i,
        param: `masterFx.slot${i}.wet` as KnobAssignment['param'],
        label: `${enabledFx[i].type.substring(0, 6)} Wet`,
      });
    }

    all.push({ cc: 77, param: 'masterFx.masterVolume', label: 'Master' });

    const seen = new Set<string>();
    return all.filter(k => {
      if (seen.has(k.param)) return false;
      seen.add(k.param);
      return true;
    });
  }, [isDJ, djKnobPage, nksKnobAssignments, nksActiveSynthType, masterEffects]);

  // Curated banks use MIDI store pagination; NKS2/generic use local pagination
  const hasCuratedBank = !!(nksActiveSynthType
    && getKnobBankForSynth(nksActiveSynthType as import('@/types/instrument').SynthType));
  const useStorePaging = hasCuratedBank && nksKnobTotalPages > 1;

  // Local pagination for NKS2/generic banks that exceed 8 knobs
  const [knobPage, setKnobPage] = useReactState(0);
  const localTotalPages = Math.max(1, Math.ceil(contextKnobs.length / 8));

  // Effective page state — curated banks use MIDI store, others use local
  const effectivePage = useStorePaging ? nksKnobPage : knobPage;
  const effectiveTotalPages = useStorePaging ? nksKnobTotalPages : localTotalPages;
  const pageKnobs = useStorePaging ? contextKnobs : contextKnobs.slice(effectivePage * 8, effectivePage * 8 + 8);
  const showPageNav = effectiveTotalPages > 1;

  // Page label: curated banks show page name, others show synth type
  const pageLabel = isDJ
    ? DJ_KNOB_PAGE_NAMES[djKnobPage]
    : useStorePaging
      ? getKnobPageName(nksActiveSynthType as import('@/types/instrument').SynthType, nksKnobPage)
      : nksActiveSynthType || 'Master FX';

  const handlePrevPage = useCallback(() => {
    if (isDJ) setDJKnobPage(Math.max(0, djKnobPage - 1));
    else if (useStorePaging) prevKnobPage();
    else setKnobPage(Math.max(0, knobPage - 1));
  }, [isDJ, djKnobPage, setDJKnobPage, useStorePaging, prevKnobPage, knobPage]);

  const handleNextPage = useCallback(() => {
    if (isDJ) setDJKnobPage(Math.min(DJ_KNOB_PAGE_NAMES.length - 1, djKnobPage + 1));
    else if (useStorePaging) nextKnobPage();
    else setKnobPage(Math.min(localTotalPages - 1, knobPage + 1));
  }, [isDJ, djKnobPage, setDJKnobPage, useStorePaging, nextKnobPage, knobPage, localTotalPages]);

  // Reset page when context changes
  useEffect(() => {
    setKnobPage(0);
  }, [nksActiveSynthType, masterEffects.length]);

  // Auto-select DJ knob page when a deck starts playing
  useEffect(() => {
    if (!isDJ || !hasMIDIDevice) return;
    const unsub = useDJStore.subscribe(
      (s) => ({ a: s.decks.A.isPlaying, b: s.decks.B.isPlaying }),
      ({ a, b }, prev) => {
        // Any deck started → switch to EQ page (has both decks)
        if ((a && !prev.a) || (b && !prev.b)) setDJKnobPage(0);
        // Both playing → switch to Mixer page (crossfader/volumes)
        if (a && b && (!prev.a || !prev.b)) setDJKnobPage(1);
      },
      { equalityFn: (a, b) => a.a === b.a && a.b === b.b },
    );
    return unsub;
  }, [isDJ, hasMIDIDevice, setDJKnobPage]);

  return (
    <div className="flex flex-col">
      {/* MIDI Knob Controls - Expanded (hidden when nothing to control) */}
      {activeView !== 'vj' && activeView !== 'dj' && showKnobBar && contextKnobs.length > 0 && (
        <div className="bg-dark-bgTertiary border-t border-dark-border px-4 py-2 flex items-center gap-2">
          {/* Page nav left */}
          {showPageNav && (
            <button
              onClick={handlePrevPage}
              className="p-1 text-text-muted hover:text-accent-primary transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
          )}

          {/* Context label — shows page name for curated banks */}
          <div className="text-[9px] font-bold text-text-muted uppercase tracking-widest whitespace-nowrap min-w-[60px]">
            {pageLabel}
          </div>

          {/* Knobs */}
          <div className="grid grid-cols-8 gap-3 flex-1">
            {pageKnobs.map((assignment, index: number) => {
              const param = assignment.param || '';
              const currentValue = knobValues[param] ?? 0.5;
              const isBipolar = param === 'mixer.pan' || param === 'mixer.filterPosition' || param.endsWith('.crossfader');
              return (
                <Knob
                  key={`${param}-${index}`}
                  value={currentValue}
                  min={0}
                  max={1}
                  size="sm"
                  label={assignment.label}
                  bipolar={isBipolar}
                  hideValue
                  onChange={(v) => {
                    setKnobValue(param, v);
                    if (param) routeParameterToEngine(param, v);
                  }}
                />
              );
            })}
          </div>

          {/* Page nav right + page indicator */}
          {showPageNav && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-text-muted font-mono whitespace-nowrap">
                {effectivePage + 1}/{effectiveTotalPages}
              </span>
              <button
                onClick={handleNextPage}
                className="p-1 text-text-muted hover:text-accent-primary transition-colors"
                title="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
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
          : <TrackerStatusContent />}

        {/* Right: MIDI Device, Audio State & Tips */}
        <div className="flex items-center gap-4">
          {/* Knob Bar Toggle — only show when there are knobs to control */}
          {activeView !== 'vj' && activeView !== 'dj' && (contextKnobs.length > 0 || hasMIDIDevice) && (
            <>
              <button
                onClick={() => setShowKnobBar(!showKnobBar)}
                className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-accent-primary transition-colors"
                title={showKnobBar ? "Hide knob bank" : "Show knob bank"}
              >
                {hasMIDIDevice && <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse"></span>}
                <span className="font-bold uppercase">{hasMIDIDevice ? deviceName : 'Knobs'}</span>
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
