/**
 * useNoteInput - QWERTY piano note entry, octave changes, held note tracking.
 * Handles piano key mapping, note preview/release, CapsLock note-off,
 * F1-F7 octave selection, numpad octave changes, and edit step cycling.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useCursorStore, useTransportStore, useInstrumentStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { stringNoteToXM } from '@/lib/xmConversions';
import { NOTE_MAP, type HeldNote, type TrackerInputRefs } from './inputConstants';
import { validateEdit } from '@/lib/import/formatConstraints';
import { notify } from '@/stores/useNotificationStore';
import type { TrackerFormat } from '@/engine/TrackerReplayer';

export const useNoteInput = (refs: TrackerInputRefs) => {
  const { cursorRef } = refs;

  const {
    patterns,
    currentPatternIndex,
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
  })));

  const {
    currentOctave,
    recordMode,
    editStep,
    insertMode,
    multiRecEnabled,
    multiEditEnabled,
    recReleaseEnabled,
  } = useEditorStore(useShallow((state) => ({
    currentOctave: state.currentOctave,
    recordMode: state.recordMode,
    editStep: state.editStep,
    insertMode: state.insertMode,
    multiRecEnabled: state.multiRecEnabled,
    multiEditEnabled: state.multiEditEnabled,
    recReleaseEnabled: state.recReleaseEnabled,
  })));

  const setCell = useTrackerStore((state) => state.setCell);
  const setCurrentOctave = useEditorStore((state) => state.setCurrentOctave);
  const setEditStep = useEditorStore((state) => state.setEditStep);
  const setKeyOn = useEditorStore((state) => state.setKeyOn);
  const setKeyOff = useEditorStore((state) => state.setKeyOff);
  const findBestChannel = useTrackerStore((state) => state.findBestChannel);
  const insertRow = useTrackerStore((state) => state.insertRow);
  const setColumnVisibility = useEditorStore((state) => state.setColumnVisibility);

  const moveCursorToRow = useCursorStore((state) => state.moveCursorToRow);
  const moveCursorToChannel = useCursorStore((state) => state.moveCursorToChannel);

  const {
    isPlaying,
    currentRow: playbackRow,
  } = useTransportStore(useShallow((state) => ({
    isPlaying: state.isPlaying,
    currentRow: state.currentRow,
  })));

  const {
    instruments,
    currentInstrumentId,
  } = useInstrumentStore();

  const pattern = patterns[currentPatternIndex];

  // Track held notes by key to enable proper release
  const heldNotesRef = useRef<Map<string, HeldNote>>(new Map());

  // Avoid spamming format constraint warnings
  const lastWarningRef = useRef<string>('');

  // FT2: Get the channel to use for note entry (multi-channel allocation)
  const getTargetChannel = useCallback(() => {
    const editMode = recordMode && !isPlaying;
    const recMode = recordMode && isPlaying;

    if ((multiEditEnabled && editMode) || (multiRecEnabled && recMode)) {
      return findBestChannel();
    }

    return cursorRef.current.channelIndex;
  }, [recordMode, isPlaying, multiEditEnabled, multiRecEnabled, findBestChannel, cursorRef]);

  // Preview note with attack (called on keydown)
  const previewNote = useCallback(
    async (note: string, octave: number, key: string, shiftKey = false) => {
      if (currentInstrumentId === null) return;

      const engine = getToneEngine();
      const instrument = instruments.find((i) => i.id === currentInstrumentId);
      if (!instrument) return;

      const fullNote = `${note}${octave}`;
      const noteStr = `${note}-${octave}`;
      const xmNote = stringNoteToXM(noteStr);

      if (heldNotesRef.current.has(key)) {
        return;
      }

      // TB-303 LEGATO DETECTION
      const hasHeldNotes = heldNotesRef.current.size > 0;
      const is303Synth = instrument.synthType === 'TB303' ||
                         instrument.synthType === 'Buzz3o3';
      const slideActive = hasHeldNotes && is303Synth;
      const accent = shiftKey;

      const targetChannel = getTargetChannel();

      await engine.ensureInstrumentReady(instrument);

      // PERFORMANCE: Trigger audio FIRST before any state updates
      const { midiPolyphonic } = useSettingsStore.getState();
      if (midiPolyphonic) {
        engine.triggerPolyNoteAttack(currentInstrumentId, fullNote, 1, instrument, accent, slideActive);
      } else {
        engine.triggerNoteAttack(currentInstrumentId, fullNote, 0, 1, instrument, undefined, accent, slideActive);
      }

      heldNotesRef.current.set(key, {
        note: fullNote,
        xmNote,
        instrumentId: currentInstrumentId,
        channelIndex: targetChannel,
      });

      setKeyOn(targetChannel, xmNote);
    },
    [currentInstrumentId, instruments, getTargetChannel, setKeyOn]
  );

  // Release note (called on keyup)
  const releaseNote = useCallback(
    (key: string) => {
      const heldNote = heldNotesRef.current.get(key);
      if (!heldNote) return;

      const engine = getToneEngine();
      const instrument = instruments.find((i) => i.id === heldNote.instrumentId);

      const { midiPolyphonic } = useSettingsStore.getState();
      if (midiPolyphonic && instrument) {
        engine.triggerPolyNoteRelease(heldNote.instrumentId, heldNote.note, instrument);
      } else {
        engine.releaseNote(heldNote.instrumentId, heldNote.note);
      }

      setKeyOff(heldNote.channelIndex);

      if (recReleaseEnabled && recordMode && isPlaying) {
        setCell(heldNote.channelIndex, playbackRow, { note: 97 });
      }

      heldNotesRef.current.delete(key);
    },
    [instruments, setKeyOff, recReleaseEnabled, recordMode, isPlaying, setCell, playbackRow]
  );

  // Enter note into cell
  const enterNote = useCallback(
    (note: string, octave: number, targetChannelOverride?: number) => {
      const noteStr = `${note}-${octave}`;
      const xmNote = stringNoteToXM(noteStr);

      if (xmNote === 0) {
        console.warn(`Invalid note: ${noteStr}`);
        return;
      }

      const targetChannel = targetChannelOverride !== undefined
        ? targetChannelOverride
        : getTargetChannel();

      const targetRow = (recordMode && isPlaying) ? playbackRow : cursorRef.current.rowIndex;

      if (insertMode && !isPlaying) {
        insertRow(targetChannel, targetRow);
      }

      setCell(targetChannel, targetRow, {
        note: xmNote,
        instrument: currentInstrumentId !== null ? currentInstrumentId : undefined,
      });

      // Format constraint validation — warn if edit exceeds source format limits
      const fmt = pattern.importMetadata?.sourceFormat as TrackerFormat | undefined;
      if (fmt && fmt !== 'XM' && fmt !== 'MOD') {
        const warnings = validateEdit(fmt, targetChannel, xmNote, currentInstrumentId ?? undefined, 0);
        if (warnings.length > 0) {
          const key = warnings[0];
          if (key !== lastWarningRef.current) {
            lastWarningRef.current = key;
            notify.warning(warnings[0]);
          }
        }
      }

      // Auto-enable 303 flag columns when entering notes with a TB-303/Buzz3o3 instrument
      if (currentInstrumentId !== null) {
        const inst = instruments.find((i) => i.id === currentInstrumentId);
        if (inst && (inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3')) {
          const vis = useEditorStore.getState().columnVisibility;
          if (!vis.flag1 || !vis.flag2) {
            setColumnVisibility({ flag1: true, flag2: true });
          }
        }
      }

      // Chord entry mode: advance to next channel instead of next row
      const chordEntry = useUIStore.getState().chordEntryMode;
      if (chordEntry && !isPlaying && targetChannelOverride === undefined) {
        const channelCount = pattern.channels.length;
        const nextChannel = cursorRef.current.channelIndex + 1;
        if (nextChannel < channelCount) {
          moveCursorToChannel(nextChannel);
          return;
        }
      }

      if (editStep > 0 && !isPlaying) {
        moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
      }
    },
    [setCell, recordMode, editStep, pattern, moveCursorToRow, moveCursorToChannel, isPlaying, playbackRow, insertMode, insertRow, getTargetChannel, currentInstrumentId, instruments, setColumnVisibility, cursorRef]
  );

  // Handle note-related keydown events. Returns true if handled.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const key = e.key;
      const keyLower = key.toLowerCase();

      // CapsLock: Enter note-off (XM note 97)
      if (key === 'CapsLock') {
        e.preventDefault();
        if (cursorRef.current.columnType === 'note') {
          const targetRow = (recordMode && isPlaying) ? playbackRow : cursorRef.current.rowIndex;
          setCell(cursorRef.current.channelIndex, targetRow, { note: 97 });
          if (editStep > 0 && !isPlaying) {
            moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
          }
        }
        return true;
      }

      // F1-F7: Select octave 1-7
      if (key >= 'F1' && key <= 'F7') {
        e.preventDefault();
        const octave = parseInt(key.substring(1));
        setCurrentOctave(octave);
        useUIStore.getState().setStatusMessage(`OCTAVE ${octave}`);
        return true;
      }

      // FT2: Grave key (`) - Cycle edit step (0-16)
      if (key === '`' || key === '~') {
        e.preventDefault();
        let newStep: number;
        if (e.shiftKey) {
          newStep = editStep === 0 ? 16 : editStep - 1;
        } else {
          newStep = editStep === 16 ? 0 : editStep + 1;
        }
        setEditStep(newStep);
        useUIStore.getState().setStatusMessage(`EDIT STEP ${newStep}`);
        return true;
      }

      // FT2: Numpad +/- to change octave
      if (e.code === 'NumpadAdd' || (key === '+' && !e.shiftKey && e.location === 3)) {
        e.preventDefault();
        if (currentOctave < 7) {
          setCurrentOctave(currentOctave + 1);
        }
        return true;
      }
      if (e.code === 'NumpadSubtract' || (key === '-' && e.location === 3)) {
        e.preventDefault();
        if (currentOctave > 1) {
          setCurrentOctave(currentOctave - 1);
        }
        return true;
      }

      // Note Entry (Piano Keys)
      // Only on NOTE column; otherwise let effect/volume entry handle it
      if (NOTE_MAP[keyLower] && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && cursorRef.current.columnType === 'note') {
        e.preventDefault();
        const { note, octaveOffset } = NOTE_MAP[keyLower];
        const octave = currentOctave + octaveOffset;

        previewNote(note, octave, keyLower, e.shiftKey);

        if (recordMode) {
          const heldNote = heldNotesRef.current.get(keyLower);
          const targetChannel = heldNote?.channelIndex;
          enterNote(note, octave, targetChannel);
        }
        return true;
      }

      // FT2: Key repeat - only repeat note entry in edit mode
      if (NOTE_MAP[keyLower] && e.repeat && cursorRef.current.columnType === 'note') {
        e.preventDefault();
        if (recordMode && !isPlaying) {
          const { note, octaveOffset } = NOTE_MAP[keyLower];
          const octave = currentOctave + octaveOffset;
          const heldNote = heldNotesRef.current.get(keyLower);
          enterNote(note, octave, heldNote?.channelIndex);
        }
        return true;
      }

      return false;
    },
    [pattern, currentOctave, recordMode, editStep, isPlaying, playbackRow, setCell, moveCursorToRow, setCurrentOctave, setEditStep, previewNote, enterNote, cursorRef]
  );

  // Handle note-related keyup events. Returns true if handled.
  const handleKeyUp = useCallback(
    (e: KeyboardEvent): boolean => {
      const keyLower = e.key.toLowerCase();

      if (NOTE_MAP[keyLower]) {
        releaseNote(keyLower);
        return true;
      }

      return false;
    },
    [releaseNote]
  );

  return useMemo(() => ({
    handleKeyDown,
    handleKeyUp,
    previewNote,
    enterNote,
    heldNotesRef,
    currentOctave,
    setCurrentOctave,
  }), [handleKeyDown, handleKeyUp, previewNote, enterNote, heldNotesRef, currentOctave, setCurrentOctave]);
};
