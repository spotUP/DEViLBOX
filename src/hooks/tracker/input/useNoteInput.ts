/**
 * useNoteInput - QWERTY piano note entry, octave changes, held note tracking.
 * Handles piano key mapping, note preview/release, note-off entry,
 * octave selection, and edit step cycling — all behavior-aware per scheme.
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

// XM note values for IT-style note types
const XM_NOTE_OFF = 97;
const XM_NOTE_CUT = 254;   // ^^^ (IT note cut)
const XM_NOTE_FADE = 255;  // ~~~ (IT note fade)

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

  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);

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
    (note: string, octave: number, key: string, shiftKey = false) => {
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

      // Trigger audio FIRST — ensureInstrumentReady is fire-and-forget.
      // The await was deferring audio to the microtask queue, adding latency
      // to every note. Most instruments are already ready; for WASM synths
      // that need init, the first note may be silent but all subsequent are instant.
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

  // Enter note into cell (respects noteColumnIndex for chord columns)
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

      let targetRow = (recordMode && isPlaying) ? playbackRow : cursorRef.current.rowIndex;

      // Record quantization: snap to nearest boundary when recording during playback
      if (recordMode && isPlaying && pattern) {
        const editor = useEditorStore.getState();
        if (editor.recQuantEnabled && editor.recQuantRes > 0) {
          const res = editor.recQuantRes;
          const remainder = targetRow % res;
          targetRow = remainder >= res / 2
            ? Math.min(targetRow + (res - remainder), pattern.length - 1)
            : targetRow - remainder;
        }
      }

      const nci = cursorRef.current.noteColumnIndex ?? 0;

      if (insertMode && !isPlaying) {
        insertRow(targetChannel, targetRow);
      }

      // Write to the correct note column field based on noteColumnIndex
      const cellUpdate: Partial<import('@typedefs').TrackerCell> = {};
      if (nci === 0) {
        cellUpdate.note = xmNote;
        cellUpdate.instrument = currentInstrumentId !== null ? currentInstrumentId : undefined;
      } else if (nci === 1) {
        cellUpdate.note2 = xmNote;
        cellUpdate.instrument2 = currentInstrumentId !== null ? currentInstrumentId : undefined;
      } else if (nci === 2) {
        cellUpdate.note3 = xmNote;
        cellUpdate.instrument3 = currentInstrumentId !== null ? currentInstrumentId : undefined;
      } else {
        cellUpdate.note4 = xmNote;
        cellUpdate.instrument4 = currentInstrumentId !== null ? currentInstrumentId : undefined;
      }

      setCell(targetChannel, targetRow, cellUpdate);

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

      // Chord entry mode: advance to next note column, then next channel
      const chordEntry = useUIStore.getState().chordEntryMode;
      if (chordEntry && !isPlaying && targetChannelOverride === undefined) {
        const ch = pattern.channels[cursorRef.current.channelIndex];
        const totalNoteCols = ch?.channelMeta?.noteCols ?? 1;
        const nextNci = nci + 1;
        if (nextNci < totalNoteCols) {
          // Advance to next note column within the same track
          useCursorStore.getState().moveCursorToChannelAndColumn(
            cursorRef.current.channelIndex, 'note', nextNci
          );
          return;
        }
        // All note columns used — fall through to next channel
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
      if ((e as any).__handled) return false;
      const key = e.key;
      const keyLower = key.toLowerCase();
      const behavior = useEditorStore.getState().activeBehavior;

      // ── Note-off entry (behavior-aware) ──────────────────────────────────
      // FT2: CapsLock = note off.  IT: ` = note off, Shift+` = note fade, 1 = note cut
      if (cursorRef.current.columnType === 'note') {
        // Note Off (===)
        if (
          (behavior.noteOff.noteOffKey === 'CapsLock' && key === 'CapsLock') ||
          (behavior.noteOff.noteOffKey === '`' && key === '`' && !e.shiftKey)
        ) {
          e.preventDefault();
          const targetRow = (recordMode && isPlaying) ? playbackRow : cursorRef.current.rowIndex;
          const nci = cursorRef.current.noteColumnIndex ?? 0;
          const noteField = nci === 0 ? 'note' : nci === 1 ? 'note2' : nci === 2 ? 'note3' : 'note4';
          if (recordMode) {
            setCell(cursorRef.current.channelIndex, targetRow, { [noteField]: XM_NOTE_OFF });
            if (editStep > 0 && !isPlaying) {
              moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
            }
          }
          return true;
        }

        // Note Cut (^^^ — IT/OpenMPT)
        if (behavior.noteOff.noteCutKey === '1' && key === '1' && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          const targetRow = (recordMode && isPlaying) ? playbackRow : cursorRef.current.rowIndex;
          const nci = cursorRef.current.noteColumnIndex ?? 0;
          const noteField = nci === 0 ? 'note' : nci === 1 ? 'note2' : nci === 2 ? 'note3' : 'note4';
          if (recordMode) {
            setCell(cursorRef.current.channelIndex, targetRow, { [noteField]: XM_NOTE_CUT });
            if (editStep > 0 && !isPlaying) {
              moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
            }
          }
          return true;
        }

        // Note Fade (~~~ — IT)
        if (behavior.noteOff.noteFadeKey === 'Shift+`' && key === '~' && e.shiftKey) {
          e.preventDefault();
          const targetRow = (recordMode && isPlaying) ? playbackRow : cursorRef.current.rowIndex;
          const nci = cursorRef.current.noteColumnIndex ?? 0;
          const noteField = nci === 0 ? 'note' : nci === 1 ? 'note2' : nci === 2 ? 'note3' : 'note4';
          if (recordMode) {
            setCell(cursorRef.current.channelIndex, targetRow, { [noteField]: XM_NOTE_FADE });
            if (editStep > 0 && !isPlaying) {
              moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
            }
          }
          return true;
        }
      }

      // ── Octave selection (behavior-aware) ────────────────────────────────
      if (behavior.octaveSelectMode === 'fkeys-direct') {
        // FT2/OpenMPT: F1-F7 set octave directly
        if (key >= 'F1' && key <= 'F7' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          const octave = parseInt(key.substring(1));
          if (octave >= behavior.octaveRange[0] && octave <= behavior.octaveRange[1]) {
            setCurrentOctave(octave);
            useUIStore.getState().setStatusMessage(`OCTAVE ${octave}`);
          }
          return true;
        }
      } else if (behavior.octaveSelectMode === 'fkeys-lohi') {
        // ProTracker: F1 = low octave, F2 = high octave
        if (key === 'F1' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setCurrentOctave(behavior.octaveRange[0]);
          useUIStore.getState().setStatusMessage(`LOW OCTAVE (${behavior.octaveRange[0]})`);
          return true;
        }
        if (key === 'F2' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setCurrentOctave(behavior.octaveRange[1]);
          useUIStore.getState().setStatusMessage(`HIGH OCTAVE (${behavior.octaveRange[1]})`);
          return true;
        }
      }
      // 'numpad-only': no F-key octave selection — numpad +/- handled below

      // ── Edit step cycling (behavior-aware) ───────────────────────────────
      if (behavior.editStepCycleKey === '`' && (key === '`' || key === '~')) {
        // Skip if this was consumed as IT note-off above
        if (behavior.noteOff.noteOffKey === '`') {
          // Already handled above — don't also cycle edit step
        } else {
          e.preventDefault();
          const [minStep, maxStep] = behavior.editStepRange;
          let newStep: number;
          if (e.shiftKey) {
            newStep = editStep <= minStep ? maxStep : editStep - 1;
          } else {
            newStep = editStep >= maxStep ? minStep : editStep + 1;
          }
          setEditStep(newStep);
          useUIStore.getState().setStatusMessage(`EDIT STEP ${newStep}`);
          return true;
        }
      }

      // Numpad +/- for octave (all schemes except PT where numpad selects samples)
      if (!behavior.ptNumpadSampleSelect) {
        if (e.code === 'NumpadAdd' || (key === '+' && !e.shiftKey && e.location === 3)) {
          e.preventDefault();
          if (currentOctave < behavior.octaveRange[1]) {
            setCurrentOctave(currentOctave + 1);
          }
          return true;
        }
        if (e.code === 'NumpadSubtract' || (key === '-' && e.location === 3)) {
          e.preventDefault();
          if (currentOctave > behavior.octaveRange[0]) {
            setCurrentOctave(currentOctave - 1);
          }
          return true;
        }
      } else {
        // PT numpad sample bank selection:
        // KP_Enter toggles hi/lo bank (0-15 vs 16-31)
        // KP_0-9 select sample within current bank (3×3 grid + 0)
        const ptBank = useEditorStore.getState().ptSampleBank ?? 0; // 0 = low (0-15), 16 = high (16-31)
        const PT_NUMPAD_MAP: Record<string, number> = {
          'Numpad1': 12, 'Numpad2': 13, 'Numpad3': 14,
          'Numpad4': 8,  'Numpad5': 9,  'Numpad6': 10,
          'Numpad7': 4,  'Numpad8': 5,  'Numpad9': 6,
          'Numpad0': 0,
        };
        if (e.code === 'NumpadEnter') {
          e.preventDefault();
          const newBank = ptBank === 0 ? 16 : 0;
          useEditorStore.getState().setPtSampleBank(newBank);
          useUIStore.getState().setStatusMessage(`SAMPLE BANK ${newBank === 0 ? '01-16' : '17-32'}`);
          return true;
        }
        const sampleOffset = PT_NUMPAD_MAP[e.code];
        if (sampleOffset !== undefined) {
          e.preventDefault();
          const sampleIndex = ptBank + sampleOffset;
          const instruments = useInstrumentStore.getState().instruments;
          if (sampleIndex < instruments.length) {
            useInstrumentStore.getState().setCurrentInstrument(instruments[sampleIndex].id);
            useUIStore.getState().setStatusMessage(`SAMPLE ${sampleIndex + 1}`);
          }
          return true;
        }
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

          // Shift+Note: auto-advance to next note column for chord entry
          if (e.shiftKey && !isPlaying && targetChannel === undefined) {
            const chIdx = cursorRef.current.channelIndex;
            const ch = pattern.channels[chIdx];
            const nci = cursorRef.current.noteColumnIndex ?? 0;
            const totalNoteCols = ch?.channelMeta?.noteCols ?? 1;
            if (nci + 1 < totalNoteCols) {
              // Move to next existing note column
              useCursorStore.getState().moveCursorToChannelAndColumn(chIdx, 'note', nci + 1);
            } else if (totalNoteCols < 4) {
              // Auto-expand: add a new note column
              const newNoteCols = totalNoteCols + 1;
              useTrackerStore.getState().setChannelMeta(chIdx, { noteCols: newNoteCols });
              useCursorStore.getState().moveCursorToChannelAndColumn(chIdx, 'note', nci + 1);
            }
          }
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
