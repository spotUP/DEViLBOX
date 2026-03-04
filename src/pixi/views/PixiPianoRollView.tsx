/**
 * PixiPianoRollView — Piano roll view for WebGL mode.
 * Layout: Toolbar (top) | [Piano keyboard | Note grid] (flex row) | Velocity lane
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiButton, PixiLabel, PixiViewHeader } from '../components';
import { PixiPianoKeyboard } from './pianoroll/PixiPianoKeyboard';
import { PixiPianoRollGrid } from './pianoroll/PixiPianoRollGrid';
import { PixiScrollbar } from './pianoroll/PixiScrollbar';
import { PixiVelocityLane } from './pianoroll/PixiVelocityLane';
import { usePianoRollStore, useUIStore, useTransportStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { usePianoRollData } from '@/hooks/pianoroll/usePianoRollData';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { patternToPianoRollNotes } from '@/hooks/pianoroll/usePianoRollData';
import { TITLE_H } from '../workbench/workbenchLayout';
import { getMIDIManager } from '@/midi/MIDIManager';
import type { MIDIMessage } from '@/midi/types';
import { detectChord } from '@/lib/music/chordDetection';

const VELOCITY_HEIGHT = 80;
const TOOLBAR_HEIGHT = 36;
const KEYBOARD_WIDTH = 60;
const SCROLLBAR_SIZE = 8;

const CHANNEL_COLORS = [0x4a9eff, 0xff6b6b, 0x51cf66, 0xffd43b, 0xcc5de8, 0xff922b, 0x20c997, 0xf06595];

const MIDI_NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToNoteStr(midi: number): string {
  const oct = Math.floor(midi / 12);
  return MIDI_NOTE_NAMES[midi % 12] + oct;
}

const GRID_DIVISIONS = [1, 2, 4, 8, 16];

/** QWERTY keyboard → semitone offset from base octave */
const QWERTY_NOTE_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

export const PixiPianoRollView: React.FC<{ isActive?: boolean; windowId?: string }> = ({
  isActive: _isActive = true,
  windowId = 'pianoroll',
}) => {
  const [followPlayback, setFollowPlayback] = useState(true);
  const theme = usePixiTheme();
  const tool = usePianoRollStore(s => s.tool);
  const setTool = usePianoRollStore(s => s.setTool);
  const view = usePianoRollStore(s => s.view);
  const selectedNotes = usePianoRollStore(s => s.selection.notes);
  const chordBuffer = usePianoRollStore(s => s.chordBuffer);
  const horizontalZoom = usePianoRollStore(s => s.view.horizontalZoom);
  const verticalZoom = usePianoRollStore(s => s.view.verticalZoom);
  const channelCount = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.channels.length ?? 1;
  });
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentGlobalRow = useTransportStore(s => s.currentGlobalRow);
  const currentRow = useTransportStore(s => s.currentRow);

  // Resolve actual window pixel dimensions from the workbench store
  const win = useWorkbenchStore(s => s.windows[windowId]);
  const winW = win?.width ?? 700;
  const winH = win?.height ?? 500;
  const gridW = Math.max(200, winW - KEYBOARD_WIDTH - SCROLLBAR_SIZE);
  const gridH = Math.max(150, winH - TITLE_H - TOOLBAR_HEIGHT - VELOCITY_HEIGHT - SCROLLBAR_SIZE);

  // Pattern length for scrollbar calculations
  const patternLength = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.length ?? 64;
  });

  // Hover ref for scroll event gating
  const isHoveredRef = useRef(false);

  // Track held piano key for MIDI note release
  const heldPitchRef = useRef<number | null>(null);

  // -----------------------------------------------------------------------
  // Feature: MIDI recording into piano roll
  // -----------------------------------------------------------------------
  const [isRecording, setIsRecording] = useState(false);

  // Track when each MIDI note was pressed (midiNote → startRow at press time)
  const midiNoteStartRef = useRef<Map<number, number>>(new Map());

  // Toggle recording mode
  const handleToggleRecord = useCallback(() => {
    setIsRecording(prev => !prev);
  }, []);

  // Subscribe to the MIDIManager when recording is active
  useEffect(() => {
    if (!isRecording) {
      midiNoteStartRef.current.clear();
      return;
    }

    const manager = getMIDIManager();

    const handleMIDIMessage = (msg: MIDIMessage) => {
      if (!msg.data || msg.data.length < 2) return;
      const [status, note = 0, velocity = 0] = msg.data;
      const messageType = (status >> 4) & 0x0f;

      // Determine insert row: use transport current row when playing, else scroll position
      const pianoStore = usePianoRollStore.getState();
      const insertRow = isPlaying ? currentRow : Math.floor(pianoStore.view.scrollX);
      const channelIndex = pianoStore.view.channelIndex;

      if (messageType === 0x09 && velocity > 0) {
        // Note-on: record the start row for this MIDI note number
        midiNoteStartRef.current.set(note, insertRow);

        // Insert note cell immediately
        const ts = useTrackerStore.getState();
        const pattern = ts.patterns[ts.currentPatternIndex];
        if (!pattern) return;
        // Convert MIDI note → XM note: XM note = (octave * 12) + semitone + 1
        const xmNote = note + 1; // simplified XM conversion
        const volumeValue = Math.round((velocity / 127) * 64);
        const volume = 0x10 + volumeValue;
        ts.setCell(channelIndex, insertRow, { note: xmNote, volume });
      } else if (messageType === 0x08 || (messageType === 0x09 && velocity === 0)) {
        // Note-off: place note-off marker at current row
        const startRow = midiNoteStartRef.current.get(note);
        if (startRow === undefined) return;
        midiNoteStartRef.current.delete(note);

        const nowRow = isPlaying ? currentRow : Math.floor(usePianoRollStore.getState().view.scrollX);
        const duration = Math.max(1, nowRow - startRow);

        const ts = useTrackerStore.getState();
        const pattern = ts.patterns[ts.currentPatternIndex];
        if (!pattern) return;
        const chIdx = usePianoRollStore.getState().view.channelIndex;
        const endRow = startRow + duration;
        if (endRow < pattern.length) {
          ts.setCell(chIdx, endRow, { note: 97 }); // 97 = note-off
        }
      }
    };

    manager.addMessageHandler(handleMIDIMessage);
    return () => {
      manager.removeMessageHandler(handleMIDIMessage);
      midiNoteStartRef.current.clear();
    };
  }, [isRecording, isPlaying, currentRow]);

  // Version counter to force note recalculation after edits
  const [noteVersion, setNoteVersion] = useState(0);
  const handleNotesChanged = useCallback(() => setNoteVersion(v => v + 1), []);

  // Note manipulation API from usePianoRollData
  const pianoData = usePianoRollData(view.channelIndex);

  // -----------------------------------------------------------------------
  // Feature: Chord detection from selected notes
  // -----------------------------------------------------------------------
  const chordName = useMemo(() => {
    if (selectedNotes.size < 2) return '';
    const selectedNoteIds = Array.from(selectedNotes);
    const pitches = selectedNoteIds
      .map(id => {
        const note = pianoData.notes.find(n => n.id === id);
        return note?.midiNote ?? null;
      })
      .filter((p): p is number => p !== null);
    if (pitches.length < 2) return '';
    return detectChord(pitches);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNotes, pianoData.notes, noteVersion]);

  // Wheel → scroll the piano roll (horizontal = beat scroll, vertical = note scroll)
  // Ctrl+wheel → horizontal zoom
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      if (!isHoveredRef.current) return;
      e.preventDefault();
      if (e.ctrlKey) {
        const store = usePianoRollStore.getState();
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        store.setHorizontalZoom(store.view.horizontalZoom * factor);
        return;
      }
      const store = usePianoRollStore.getState();
      store.scrollBy(e.deltaX / 40, e.deltaY / 12);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Prevent browser native right-click context menu on the canvas
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener('contextmenu', handleContextMenu);
    return () => canvas.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Follow-playback auto-scroll: keep playhead visible when playing
  useEffect(() => {
    if (!isPlaying || !followPlayback) return;
    const gridWidthBeats = gridW / horizontalZoom;
    const currentView = usePianoRollStore.getState().view;
    if (
      currentGlobalRow < currentView.scrollX ||
      currentGlobalRow > currentView.scrollX + gridWidthBeats * 0.9
    ) {
      usePianoRollStore.getState().setScroll(
        Math.max(0, currentGlobalRow - gridWidthBeats * 0.1),
        currentView.scrollY,
      );
    }
  }, [isPlaying, currentGlobalRow, followPlayback, gridW, horizontalZoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      const isMod = e.ctrlKey || e.metaKey;
      const store = usePianoRollStore.getState();
      const selectedIds = Array.from(store.selection.notes);

      // Copy/Cut/Paste/Undo/Redo
      if (isMod) {
        if (key === 'c') {
          const selectedNotes = pianoData.notes.filter(n => store.selection.notes.has(n.id));
          if (selectedNotes.length > 0) store.copyNotes(selectedNotes);
          e.preventDefault(); return;
        }
        if (key === 'x') {
          const selectedNotes = pianoData.notes.filter(n => store.selection.notes.has(n.id));
          if (selectedNotes.length > 0) {
            store.copyNotes(selectedNotes);
            pianoData.deleteNotes(selectedIds);
            store.clearSelection();
            handleNotesChanged();
          }
          e.preventDefault(); return;
        }
        if (key === 'v') {
          const clip = store.clipboard;
          if (clip) {
            pianoData.pasteNotes(clip, Math.floor(store.view.scrollX), Math.round(store.view.scrollY + 60), view.channelIndex);
            handleNotesChanged();
          }
          e.preventDefault(); return;
        }
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) useHistoryStore.getState().redo();
          else useHistoryStore.getState().undo();
          handleNotesChanged();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          useHistoryStore.getState().redo();
          handleNotesChanged();
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          store.selectAll(pianoData.notes.map(n => n.id));
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          if (selectedIds.length > 0) {
            pianoData.duplicateNotes(selectedIds);
            handleNotesChanged();
          }
          return;
        }
        if (key === 'q') {
          e.preventDefault();
          const gridDivision = usePianoRollStore.getState().view.gridDivision;
          const idsToQuantize = selectedIds.length > 0
            ? selectedIds
            : pianoData.notes.map(n => n.id);
          if (idsToQuantize.length > 0) {
            pianoData.quantizeNotes(idsToQuantize, gridDivision);
            handleNotesChanged();
          }
          return;
        }
        return;
      }

      // Enter — commit chord buffer (if non-empty) as notes at current scroll position
      if (key === 'enter') {
        const chordPitches = store.chordBuffer;
        if (chordPitches.length > 0) {
          const gridStep = Math.max(1, Math.floor(4 / store.view.gridDivision));
          const startRow = Math.floor(store.view.scrollX);
          chordPitches.forEach(pitch => {
            pianoData.addNote(pitch, startRow, gridStep, 100);
          });
          store.clearChordBuffer();
          handleNotesChanged();
          e.preventDefault();
          return;
        }
      }

      // Delete/Backspace
      if (key === 'delete' || key === 'backspace') {
        if (selectedIds.length > 0) {
          pianoData.deleteNotes(selectedIds);
          store.clearSelection();
          handleNotesChanged();
        }
        e.preventDefault(); return;
      }

      // Escape — clear selection
      if (key === 'escape') {
        store.clearSelection();
        return;
      }

      // Arrow keys — transpose / adjust length
      if (selectedIds.length > 0) {
        if (key === 'arrowup') {
          pianoData.transposeNotes(selectedIds, e.shiftKey ? 12 : 1);
          handleNotesChanged();
          e.preventDefault(); return;
        }
        if (key === 'arrowdown') {
          pianoData.transposeNotes(selectedIds, e.shiftKey ? -12 : -1);
          handleNotesChanged();
          e.preventDefault(); return;
        }
        if (key === 'arrowleft' && e.shiftKey) {
          const gridStep = Math.max(1, Math.floor(4 / store.view.gridDivision));
          pianoData.adjustNoteLengths(selectedIds, -gridStep);
          handleNotesChanged();
          e.preventDefault(); return;
        }
        if (key === 'arrowright' && e.shiftKey) {
          const gridStep = Math.max(1, Math.floor(4 / store.view.gridDivision));
          pianoData.adjustNoteLengths(selectedIds, gridStep);
          handleNotesChanged();
          e.preventDefault(); return;
        }
      }

      // Tool selection (only when NOT in draw mode where keys are note input)
      if (tool !== 'draw') {
        if (key === '1') { setTool('select'); e.preventDefault(); return; }
        if (key === '2') { setTool('draw'); e.preventDefault(); return; }
        if (key === '3') { setTool('erase'); e.preventDefault(); return; }
      }

      // Select-mode shortcuts
      if (tool === 'select' && selectedIds.length > 0) {
        if (key === 'q') { pianoData.quantizeNotes(selectedIds, store.view.gridDivision); handleNotesChanged(); return; }
        if (key === 's') { pianoData.toggleSlide(selectedIds, true); handleNotesChanged(); return; }
        if (key === 'a') { pianoData.toggleAccent(selectedIds, true); handleNotesChanged(); return; }
      }

      // Velocity adjust (+/-)
      if (key === '+' || key === '=') {
        if (selectedIds.length > 0) {
          pianoData.adjustVelocities(selectedIds, 10);
          handleNotesChanged();
        }
        return;
      }
      if (key === '-' || key === '_') {
        if (selectedIds.length > 0) {
          pianoData.adjustVelocities(selectedIds, -10);
          handleNotesChanged();
        }
        return;
      }

      // QWERTY note input (draw mode)
      if (tool === 'draw') {
        const semitone = QWERTY_NOTE_MAP[key];
        if (semitone != null) {
          const baseOctave = 4; // C4 = MIDI 60
          const midiNote = baseOctave * 12 + semitone;
          const gridStep = Math.max(1, Math.floor(4 / store.view.gridDivision));
          pianoData.addNote(midiNote, Math.floor(store.view.scrollX), gridStep, 100);
          handleNotesChanged();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tool, setTool, view.channelIndex, pianoData, handleNotesChanged]);

  // Derive grid-format notes from pianoData (reactive, correct velocity conversion)
  const notes = useMemo(() =>
    pianoData.notes.map(n => ({
      note: n.midiNote,
      start: n.startRow,
      duration: n.endRow - n.startRow,
      velocity: n.velocity,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pianoData.notes, noteVersion],
  );

  // Derive multi-channel notes for the "all channels" overview mode
  const allChannelNotes = useMemo(() => {
    if (!view.multiChannel) return null;
    const ts = useTrackerStore.getState();
    const pattern = ts.patterns[ts.currentPatternIndex];
    if (!pattern) return null;
    const allNotes = patternToPianoRollNotes(pattern);
    return allNotes.map(n => ({
      note: n.midiNote,
      start: n.startRow,
      duration: n.endRow - n.startRow,
      velocity: n.velocity,
      channelIndex: n.channelIndex,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.multiChannel, noteVersion]);

  // Release a held piano key — stop audio preview
  const handlePianoKeyRelease = useCallback((_pitch: number) => {
    const held = heldPitchRef.current;
    if (held === null) return;
    heldPitchRef.current = null;
    const instrumentId = useInstrumentStore.getState().currentInstrumentId;
    const instruments = useInstrumentStore.getState().instruments;
    const instrument = instruments.find(i => i.id === instrumentId);
    if (!instrument) return;
    const engine = getToneEngine();
    const note = midiToNoteStr(held);
    engine.triggerNoteRelease(instrumentId!, note, 0, instrument);
  }, []);

  // Piano keyboard click handler — Shift+click adds to chord buffer, plain click plays note
  const handlePianoKeyClick = useCallback((pitch: number, shiftHeld: boolean) => {
    const store = usePianoRollStore.getState();
    if (shiftHeld) {
      // Toggle pitch in chord buffer
      if (store.chordBuffer.includes(pitch)) {
        store.removeFromChordBuffer(pitch);
      } else {
        store.addToChordBuffer(pitch);
      }
    } else {
      // Plain click in draw mode: insert a single note at current scroll position
      if (store.tool === 'draw') {
        const gridStep = Math.max(1, Math.floor(4 / store.view.gridDivision));
        pianoData.addNote(pitch, Math.floor(store.view.scrollX), gridStep, 100);
        handleNotesChanged();
      }
    }

    // Trigger audio preview for any click (not shift)
    if (!shiftHeld) {
      const instrumentId = useInstrumentStore.getState().currentInstrumentId;
      const instruments = useInstrumentStore.getState().instruments;
      const instrument = instruments.find(i => i.id === instrumentId);
      if (instrument) {
        // Release previously held key if any
        if (heldPitchRef.current !== null) {
          const engine = getToneEngine();
          const prevNote = midiToNoteStr(heldPitchRef.current);
          engine.triggerNoteRelease(instrumentId!, prevNote, 0, instrument);
        }
        heldPitchRef.current = pitch;
        const engine = getToneEngine();
        const note = midiToNoteStr(pitch);
        engine.triggerNoteAttack(instrumentId!, note, 0, 100, instrument);

        // Also release on global pointerup (handles release outside the canvas)
        const onGlobalUp = () => {
          document.removeEventListener('pointerup', onGlobalUp);
          handlePianoKeyRelease(pitch);
        };
        document.addEventListener('pointerup', onGlobalUp, { once: true });
      }
    }
  }, [pianoData, handleNotesChanged, handlePianoKeyRelease]);

  const handleCycleGrid = useCallback(() => {
    const s = usePianoRollStore.getState();
    const idx = GRID_DIVISIONS.indexOf(s.view.gridDivision);
    const next = GRID_DIVISIONS[(idx + 1) % GRID_DIVISIONS.length];
    s.setGridDivision(next);
  }, []);

  const handleToggleSnap = useCallback(() => {
    usePianoRollStore.setState(state => {
      state.view.snapToGrid = !state.view.snapToGrid;
    });
  }, []);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <PixiViewHeader activeView="pianoroll" title="PIANO ROLL">

        <PixiButton
          label="Select"
          variant={tool === 'select' ? 'ft2' : 'ghost'}
          color={tool === 'select' ? 'blue' : undefined}
          size="sm"
          active={tool === 'select'}
          onClick={() => setTool('select')}
        />
        <PixiButton
          label="Draw"
          variant={tool === 'draw' ? 'ft2' : 'ghost'}
          color={tool === 'draw' ? 'green' : undefined}
          size="sm"
          active={tool === 'draw'}
          onClick={() => setTool('draw')}
        />
        <PixiButton
          label="Erase"
          variant={tool === 'erase' ? 'ft2' : 'ghost'}
          color={tool === 'erase' ? 'red' : undefined}
          size="sm"
          active={tool === 'erase'}
          onClick={() => setTool('erase')}
        />

        {/* MIDI Record toggle */}
        <PixiButton
          label=""
          icon="record"
          variant={isRecording ? 'ft2' : 'ghost'}
          color={isRecording ? 'red' : undefined}
          size="sm"
          active={isRecording}
          onClick={handleToggleRecord}
        />

        {/* Follow playback toggle */}
        <PixiButton
          label="FOLLOW"
          variant={followPlayback ? 'ft2' : 'ghost'}
          color={followPlayback ? 'blue' : 'default'}
          size="sm"
          active={followPlayback}
          onClick={() => setFollowPlayback(prev => !prev)}
        />

        {/* Horizontal zoom */}
        <PixiButton label="-" variant="ghost" size="sm" onClick={() => usePianoRollStore.getState().setHorizontalZoom(horizontalZoom / 2)} />
        <PixiLabel text="H" size="xs" color="textMuted" />
        <PixiButton label="+" variant="ghost" size="sm" onClick={() => usePianoRollStore.getState().setHorizontalZoom(horizontalZoom * 2)} />

        {/* Vertical zoom */}
        <PixiButton label="-" variant="ghost" size="sm" onClick={() => usePianoRollStore.getState().setVerticalZoom(verticalZoom - 4)} />
        <PixiLabel text="V" size="xs" color="textMuted" />
        <PixiButton label="+" variant="ghost" size="sm" onClick={() => usePianoRollStore.getState().setVerticalZoom(verticalZoom + 4)} />

        <PixiButton
          label={`Grid:1/${view.gridDivision}`}
          variant="ghost"
          size="sm"
          onClick={handleCycleGrid}
        />
        <PixiButton
          label={view.snapToGrid ? 'Snap:ON' : 'Snap:OFF'}
          variant={view.snapToGrid ? 'ft2' : 'ghost'}
          color={view.snapToGrid ? 'blue' : undefined}
          size="sm"
          active={view.snapToGrid}
          onClick={handleToggleSnap}
        />

        {/* All-channels overview toggle */}
        <PixiButton
          label="ALL CH"
          variant={view.multiChannel ? 'ft2' : 'ghost'}
          color={view.multiChannel ? 'blue' : undefined}
          size="sm"
          active={view.multiChannel}
          onClick={() => usePianoRollStore.getState().setMultiChannel(!view.multiChannel)}
        />

        {/* Chord name display — shown when 2+ notes are selected and a chord is detected */}
        {chordName !== '' && (
          <PixiLabel text={chordName} size="sm" weight="bold" color="accent" />
        )}

        <pixiContainer layout={{ flex: 1 }} />

        {/* Channel switcher */}
        <PixiButton
          label="<"
          variant="ghost"
          size="sm"
          onClick={() => {
            const s = usePianoRollStore.getState();
            s.setChannelIndex(Math.max(0, s.view.channelIndex - 1));
          }}
        />
        <PixiLabel text={`Ch ${view.channelIndex + 1}/${channelCount}`} size="xs" color="textMuted" />
        <PixiButton
          label=">"
          variant="ghost"
          size="sm"
          onClick={() => {
            const s = usePianoRollStore.getState();
            s.setChannelIndex(Math.min(channelCount - 1, s.view.channelIndex + 1));
          }}
          layout={{ marginRight: 8 }}
        />
      </PixiViewHeader>

      {/* Main area: Keyboard | Grid | V-scrollbar — hover tracked for wheel scroll */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
        eventMode="static"
        onPointerOver={() => { isHoveredRef.current = true; }}
        onPointerOut={() => { isHoveredRef.current = false; }}
      >
        <PixiPianoKeyboard
          width={KEYBOARD_WIDTH}
          height={gridH}
          noteHeight={verticalZoom}
          scrollNote={view.scrollY}
          chordBuffer={chordBuffer}
          onKeyClick={handlePianoKeyClick}
          onKeyRelease={handlePianoKeyRelease}
        />
        <pixiContainer
          layout={{ flex: 1, flexDirection: 'column' }}
          eventMode="static"
          onPointerDown={(e: FederatedPointerEvent) => {
            if (e.button !== 2) return;
            e.stopPropagation();
            const pr = usePianoRollStore.getState();
            const selectedIds = Array.from(pr.selection.notes);
            const noNotes = pianoData.notes.length === 0;
            const noSelection = selectedIds.length === 0;
            const close = () => usePixiDropdownStore.getState().closeAll();
            usePixiDropdownStore.getState().openDropdown({
              kind: 'menu',
              id: 'pianoroll-ctx',
              x: e.global.x,
              y: e.global.y,
              width: 180,
              items: [
                {
                  type: 'action',
                  label: 'Select All',
                  shortcut: 'Ctrl+A',
                  onClick: () => {
                    pr.selectAll(pianoData.notes.map(n => n.id));
                    close();
                  },
                },
                { type: 'separator' },
                {
                  type: 'action',
                  label: 'Quantize',
                  shortcut: 'Q',
                  disabled: noNotes,
                  onClick: () => {
                    const gridDivision = usePianoRollStore.getState().view.gridDivision;
                    const idsToQuantize = selectedIds.length > 0
                      ? selectedIds
                      : pianoData.notes.map(n => n.id);
                    if (idsToQuantize.length > 0) {
                      pianoData.quantizeNotes(idsToQuantize, gridDivision);
                      handleNotesChanged();
                    }
                    close();
                  },
                },
                {
                  type: 'action',
                  label: 'Transpose +1',
                  shortcut: '↑',
                  disabled: noSelection,
                  onClick: () => {
                    pianoData.transposeNotes(selectedIds, 1);
                    handleNotesChanged();
                    close();
                  },
                },
                {
                  type: 'action',
                  label: 'Transpose −1',
                  shortcut: '↓',
                  disabled: noSelection,
                  onClick: () => {
                    pianoData.transposeNotes(selectedIds, -1);
                    handleNotesChanged();
                    close();
                  },
                },
                { type: 'separator' },
                {
                  type: 'action',
                  label: 'Delete',
                  shortcut: 'Del',
                  disabled: noSelection,
                  onClick: () => {
                    pianoData.deleteNotes(selectedIds);
                    pr.clearSelection();
                    handleNotesChanged();
                    close();
                  },
                },
              ],
              onClose: close,
            });
          }}
        >
        <PixiPianoRollGrid
          width={gridW}
          height={gridH}
          notes={notes}
          pixelsPerBeat={horizontalZoom}
          noteHeight={verticalZoom}
          scrollBeat={view.scrollX}
          scrollNote={view.scrollY}
          channelIndex={view.channelIndex}
          selectedNotes={selectedNotes}
          playbackBeat={isPlaying ? currentGlobalRow : undefined}
          allChannelNotes={allChannelNotes ?? undefined}
          channelColors={CHANNEL_COLORS}
          onNotesChanged={handleNotesChanged}
          onSelectNote={(id, add) => usePianoRollStore.getState().selectNote(id, add)}
          onDeselectAll={() => usePianoRollStore.getState().clearSelection()}
          onSelectBox={(ids) => usePianoRollStore.getState().selectNotes(ids)}
          onMoveNotes={(ids, dr, dp) => {
            ids.forEach(id => pianoData.moveNote(id, dr, dp));
            handleNotesChanged();
          }}
          onResizeNote={(id, newEndRow) => {
            pianoData.resizeNote(id, newEndRow);
            handleNotesChanged();
          }}
        />
        {/* Horizontal scrollbar */}
        <PixiScrollbar
          orientation="horizontal"
          width={gridW}
          height={SCROLLBAR_SIZE}
          value={Math.max(0, Math.min(1, view.scrollX / Math.max(1, patternLength - gridW / horizontalZoom)))}
          thumbSize={Math.min(1, (gridW / horizontalZoom) / Math.max(1, patternLength))}
          onChange={(v) => {
            const s = usePianoRollStore.getState();
            const target = v * Math.max(0, patternLength - gridW / horizontalZoom);
            s.scrollBy(target - s.view.scrollX, 0);
          }}
        />
        </pixiContainer>

        {/* Vertical scrollbar */}
        <PixiScrollbar
          orientation="vertical"
          width={SCROLLBAR_SIZE}
          height={gridH + SCROLLBAR_SIZE}
          value={Math.max(0, Math.min(1, 1 - (view.scrollY + gridH / verticalZoom) / 128))}
          thumbSize={Math.min(1, (gridH / verticalZoom) / 128)}
          onChange={(v) => {
            const s = usePianoRollStore.getState();
            const target = Math.max(0, (1 - v) * 128 - gridH / verticalZoom);
            s.scrollBy(0, target - s.view.scrollY);
          }}
        />
      </pixiContainer>

      {/* Velocity lane — aligned with grid (keyboard area left blank) */}
      <pixiContainer layout={{ width: '100%', height: VELOCITY_HEIGHT, flexDirection: 'row' }}>
        <pixiContainer layout={{ width: KEYBOARD_WIDTH, height: VELOCITY_HEIGHT }} />
        <PixiVelocityLane
          width={gridW}
          height={VELOCITY_HEIGHT}
          scrollBeat={view.scrollX}
          pixelsPerBeat={horizontalZoom}
          notes={pianoData.notes.map(n => ({ id: n.id, start: n.startRow, velocity: n.velocity }))}
          selectedIds={selectedNotes}
          onDragStart={() => pianoData.beginVelocityDrag()}
          onVelocityChange={(id, vel) => {
            pianoData.setVelocityNoUndo(id, vel);
            handleNotesChanged();
          }}
          onDragEnd={() => {
            pianoData.endVelocityDrag();
            handleNotesChanged();
          }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
