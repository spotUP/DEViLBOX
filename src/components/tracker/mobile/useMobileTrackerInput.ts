/**
 * The parts of the old `MobileTrackerView` that were genuinely about a phone
 * and not about forking the tree: the three-state piano, note and hex entry
 * through it, and the channel window that shows one channel in portrait and
 * four in landscape.
 *
 * Phase 3 of thoughts/shared/plans/2026-09-22-responsive-mobile.md moved this
 * out of the second tree and into a hook the ONE tree calls. The surfaces it
 * drives — `MobileTransportBar`, `MobilePatternInput` — stay as components,
 * because a phone genuinely needs a piano and a desktop does not. Only the
 * fork is gone.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTransportStore, useTrackerStore, useCursorStore, useInstrumentStore, useEditorStore } from '@stores';
import { useOrientation } from '@/hooks/useOrientation';
import { haptics } from '@/utils/haptics';

/** Piano input collapse states. */
export type PianoState = 'full' | 'compact' | 'hidden';

const AUTO_COMPACT_MS = 4000; // Auto-collapse to compact after 4s idle

export interface MobileTrackerInput {
  pianoState: PianoState;
  /** Which channel the portrait window starts at. */
  startChannel: number;
  /** How many channels fit: 1 in portrait, 4 in landscape. */
  visibleChannels: number;
  mobileChannel: number;
  maxChannels: number;
  showChannelNav: boolean;
  handleChannelPrev: () => void;
  handleChannelNext: () => void;
  handleNoteInput: (note: number) => void;
  handleHexInput: (value: number) => void;
  handleDelete: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handlePianoExpand: () => void;
  handleCollapseChange: (collapsed: boolean) => void;
  handlePatternSwipeLeft: () => void;
  handlePatternSwipeRight: () => void;
}

export function useMobileTrackerInput(isCustomFormat: boolean): MobileTrackerInput {
  const [mobileChannel, setMobileChannel] = useState(0);
  const [pianoState, setPianoState] = useState<PianoState>('compact');
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  // The cursor is read when a key is pressed, not subscribed: it follows the
  // playback row, and TrackerView (which mounts this hook on every screen)
  // re-rendered with it ~33 times a second while a song played.
  const moveCursor = useCursorStore((s) => s.moveCursor);
  const moveCursorToRow = useCursorStore((s) => s.moveCursorToRow);
  const { patterns, currentPatternIndex, setCell, copySelection, cutSelection, paste } = useTrackerStore(
    useShallow((s) => ({
      patterns: s.patterns,
      currentPatternIndex: s.currentPatternIndex,
      setCell: s.setCell,
      copySelection: s.copySelection,
      cutSelection: s.cutSelection,
      paste: s.paste,
    }))
  );
  const { recordMode, editStep } = useEditorStore(
    useShallow((s) => ({ recordMode: s.recordMode, editStep: s.editStep }))
  );
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const { isPortrait, isLandscape } = useOrientation();

  const pattern = patterns[currentPatternIndex];
  const maxChannels = pattern?.channels.length || 8;
  const visibleChannels = isLandscape ? 4 : 1;
  const startChannel = isPortrait ? mobileChannel : 0;

  // Auto-hide piano during playback (when not in record mode)
  useEffect(() => {
    if (isPlaying && !recordMode) {
      setPianoState('hidden');
    } else if (!isPlaying && pianoState === 'hidden') {
      setPianoState('compact');
    }
  }, [isPlaying, recordMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse from full -> compact after idle
  const resetAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
    autoCollapseTimer.current = setTimeout(() => {
      setPianoState((prev) => (prev === 'full' ? 'compact' : prev));
    }, AUTO_COMPACT_MS);
  }, []);

  useEffect(() => () => {
    if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
  }, []);

  const handleChannelPrev = useCallback(() => {
    setMobileChannel((c) => {
      if (c <= 0) return c;
      haptics.selection();
      return c - 1;
    });
  }, []);

  const handleChannelNext = useCallback(() => {
    setMobileChannel((c) => {
      if (c >= maxChannels - 1) return c;
      haptics.selection();
      return c + 1;
    });
  }, [maxChannels]);

  const handleNoteInput = useCallback((note: number) => {
    haptics.medium();
    const { cursor } = useCursorStore.getState();
    setCell(cursor.channelIndex, cursor.rowIndex, { note, instrument: currentInstrumentId ?? 1 });
    if (recordMode && editStep > 0) {
      const patternLength = patterns[currentPatternIndex]?.length ?? 64;
      moveCursorToRow((cursor.rowIndex + editStep) % patternLength);
    }
    resetAutoCollapse();
  }, [setCell, currentInstrumentId, recordMode, editStep, patterns, currentPatternIndex, moveCursorToRow, resetAutoCollapse]);

  const handleHexInput = useCallback((value: number) => {
    haptics.medium();
    const { channelIndex, rowIndex, columnType } = useCursorStore.getState().cursor;
    switch (columnType) {
      case 'instrument': setCell(channelIndex, rowIndex, { instrument: value }); break;
      case 'volume': setCell(channelIndex, rowIndex, { volume: value }); break;
      case 'effTyp': setCell(channelIndex, rowIndex, { effTyp: value }); break;
      case 'effParam': setCell(channelIndex, rowIndex, { eff: value }); break;
    }
    moveCursor('right');
    resetAutoCollapse();
  }, [setCell, moveCursor, resetAutoCollapse]);

  const handleDelete = useCallback(() => {
    haptics.rigid();
    const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
    setCell(channelIndex, rowIndex, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
  }, [setCell]);

  const handleCopy = useCallback(() => { haptics.success(); copySelection(); }, [copySelection]);
  const handleCut = useCallback(() => { haptics.success(); cutSelection(); }, [cutSelection]);
  const handlePaste = useCallback(() => { haptics.success(); paste(); }, [paste]);

  const handlePatternSwipeLeft = useCallback(() => { moveCursor('left'); }, [moveCursor]);
  const handlePatternSwipeRight = useCallback(() => { moveCursor('right'); }, [moveCursor]);

  // Tap the piano area to expand from compact -> full and back.
  const handlePianoExpand = useCallback(() => {
    setPianoState((prev) => {
      if (prev === 'compact') { resetAutoCollapse(); return 'full'; }
      if (prev === 'full') return 'compact';
      return prev;
    });
  }, [resetAutoCollapse]);

  const handleCollapseChange = useCallback((collapsed: boolean) => {
    setPianoState(collapsed ? 'compact' : 'full');
    if (!collapsed) resetAutoCollapse();
  }, [resetAutoCollapse]);

  return {
    pianoState,
    startChannel,
    visibleChannels,
    mobileChannel,
    maxChannels,
    showChannelNav: isPortrait && !isCustomFormat,
    handleChannelPrev,
    handleChannelNext,
    handleNoteInput,
    handleHexInput,
    handleDelete,
    handleCopy,
    handleCut,
    handlePaste,
    handlePianoExpand,
    handleCollapseChange,
    handlePatternSwipeLeft,
    handlePatternSwipeRight,
  };
}
