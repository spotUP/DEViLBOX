/**
 * PixiPianoRollView — Piano roll view for WebGL mode.
 * Layout: Toolbar (top) | [Piano keyboard | Note grid] (flex row) | Velocity lane
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PixiButton, PixiLabel, PixiSelect } from '../components';
import { PixiPianoKeyboard } from './pianoroll/PixiPianoKeyboard';
import { PixiPianoRollGrid } from './pianoroll/PixiPianoRollGrid';
import { PixiScrollbar } from './pianoroll/PixiScrollbar';
import { PixiVelocityLane } from './pianoroll/PixiVelocityLane';
import { usePianoRollStore, useUIStore, useTransportStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { usePianoRollData } from '@/hooks/pianoroll/usePianoRollData';
import { useHistoryStore } from '@/stores/useHistoryStore';
import { TITLE_H } from '../workbench/PixiWindow';

const VELOCITY_HEIGHT = 80;
const TOOLBAR_HEIGHT = 36;
const KEYBOARD_WIDTH = 60;
const SCROLLBAR_SIZE = 8;

const GRID_DIVISIONS = [1, 2, 4, 8, 16];

const VIEW_OPTIONS = [
  { value: 'tracker', label: 'Tracker' },
  { value: 'arrangement', label: 'Arrangement' },
  { value: 'pianoroll', label: 'Piano Roll' },
  { value: 'dj', label: 'DJ Mixer' },
  { value: 'drumpad', label: 'Drum Pads' },
  { value: 'vj', label: 'VJ View' },
];

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
  const theme = usePixiTheme();
  const tool = usePianoRollStore(s => s.tool);
  const setTool = usePianoRollStore(s => s.setTool);
  const view = usePianoRollStore(s => s.view);
  const selectedNotes = usePianoRollStore(s => s.selection.notes);
  const horizontalZoom = usePianoRollStore(s => s.view.horizontalZoom);
  const verticalZoom = usePianoRollStore(s => s.view.verticalZoom);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentGlobalRow = useTransportStore(s => s.currentGlobalRow);

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

  // Wheel → scroll the piano roll (horizontal = beat scroll, vertical = note scroll)
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      if (!isHoveredRef.current) return;
      e.preventDefault();
      const store = usePianoRollStore.getState();
      store.scrollBy(e.deltaX / 40, e.deltaY / 12);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Version counter to force note recalculation after edits
  const [noteVersion, setNoteVersion] = useState(0);
  const handleNotesChanged = useCallback(() => setNoteVersion(v => v + 1), []);

  // Note manipulation API from usePianoRollData
  const pianoData = usePianoRollData(view.channelIndex);

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
        return;
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

  // Get notes from the current pattern/channel
  const notes = useMemo(() => {
    const ts = useTrackerStore.getState();
    const pat = ts.patterns[ts.currentPatternIndex];
    if (!pat) return [];
    const ch = pat.channels[view.channelIndex];
    if (!ch) return [];
    // Convert tracker rows to piano roll note format
    const result: { note: number; start: number; duration: number; velocity: number }[] = [];
    for (let row = 0; row < pat.length; row++) {
      const cell = ch.rows[row];
      if (cell && cell.note > 0 && cell.note < 97) {
        // Find note-off or next note to determine duration
        let dur = 1;
        for (let r = row + 1; r < pat.length; r++) {
          const next = ch.rows[r];
          if (next && (next.note > 0 || next.note === 97)) break;
          dur++;
        }
        result.push({
          note: cell.note + 11, // Convert tracker note to MIDI
          start: row,
          duration: dur,
          velocity: cell.volume !== null ? cell.volume : 64,
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.channelIndex, noteVersion]);

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

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, winW, TOOLBAR_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_HEIGHT - 1, winW, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [winW, theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <pixiContainer
        layout={{
          width: '100%',
          height: TOOLBAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width: '100%', height: TOOLBAR_HEIGHT }} />

        {/* View mode selector */}
        <PixiSelect
          value="pianoroll"
          options={VIEW_OPTIONS}
          onChange={(v) => useUIStore.getState().setActiveView(v as any)}
          width={100}
          height={24}
        />

        <PixiLabel text="PIANO ROLL" size="sm" weight="bold" color="accent" />

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

        <pixiContainer layout={{ flex: 1 }} />

        <PixiLabel
          text={`Ch ${view.channelIndex + 1}`}
          size="xs"
          color="textMuted"
          layout={{ marginRight: 8 }}
        />
      </pixiContainer>

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
        <PixiPianoKeyboard width={KEYBOARD_WIDTH} height={gridH} noteHeight={verticalZoom} scrollNote={view.scrollY} />
        <pixiContainer layout={{ flex: 1, flexDirection: 'column' }}>
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

      {/* Velocity lane */}
      <PixiVelocityLane
        width={winW}
        height={VELOCITY_HEIGHT}
        scrollBeat={view.scrollX}
        notes={notes.map(n => ({ start: n.start, velocity: n.velocity }))}
      />
    </pixiContainer>
  );
};
