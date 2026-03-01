/**
 * PixiPianoRollGrid — Interactive note grid with scale highlighting and note rectangles.
 *
 * Select tool:
 *   - Click note        → select (deselects others unless shift/ctrl)
 *   - Click empty       → deselect all, start rubber-band
 *   - Drag note body    → move all selected notes (ghost preview)
 *   - Drag note edge    → resize note (ghost preview)
 *   - Drag empty        → rubber-band select
 *
 * Draw/Erase tools: unchanged click-to-place / click-to-clear behaviour.
 */

import { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { usePianoRollStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

interface Note {
  note: number;      // MIDI note 0-127
  start: number;     // Start position in beats (= tracker row)
  duration: number;  // Duration in beats
  velocity: number;  // 0-127
}

interface MultiChannelNote extends Note {
  channelIndex: number;
}

interface PixiPianoRollGridProps {
  width: number;
  height: number;
  notes: Note[];
  noteHeight?: number;
  pixelsPerBeat?: number;
  scrollNote?: number;
  scrollBeat?: number;
  totalBeats?: number;
  gridDivision?: number;
  /** Selected note IDs in "${channelIndex}-${startRow}" format */
  selectedNotes?: Set<string>;
  /** Channel index used to build note IDs for selection and callbacks */
  channelIndex?: number;
  onNotesChanged?: () => void;
  /** Called when a note is clicked in select mode */
  onSelectNote?: (id: string, addToSelection: boolean) => void;
  /** Called when clicking empty space without shift (clear selection) */
  onDeselectAll?: () => void;
  /** Called on rubber-band release with all note IDs inside the box */
  onSelectBox?: (ids: string[]) => void;
  /** Called on move-drag release (delta in rows and semitones) */
  onMoveNotes?: (ids: string[], deltaRow: number, deltaPitch: number) => void;
  /** Called on resize-drag release with the new endRow */
  onResizeNote?: (id: string, newEndRow: number) => void;
  /** Current playback row — draws a vertical cursor line when set */
  playbackBeat?: number;
  /** When set, renders notes from all channels color-coded (multi-channel overview) */
  allChannelNotes?: MultiChannelNote[];
  /** Per-channel color palette for multi-channel mode */
  channelColors?: number[];
}

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
/** Pixels from the right edge of a note that activate the resize cursor */
const RESIZE_ZONE_PX = 8;
/** Minimum screen pixels moved before a drag is registered */
const MIN_DRAG_PX = 4;

type DragMode = 'move' | 'resize' | 'box';

interface DragState {
  mode: DragMode;
  startLocalX: number;
  startLocalY: number;
  startGlobalX: number;
  startGlobalY: number;
  noteId: string | null;
  /** Snapshot of selected notes for ghost rendering and final commit */
  originalNotes: Array<{ id: string; start: number; duration: number; note: number }>;
  /** For resize: note's endRow at drag start */
  originalEndRow: number;
  /** True once pointer has moved past MIN_DRAG_PX */
  didDrag: boolean;
}

export const PixiPianoRollGrid: React.FC<PixiPianoRollGridProps> = ({
  width,
  height,
  notes,
  noteHeight = 12,
  pixelsPerBeat = 40,
  scrollNote = 36,
  scrollBeat = 0,
  totalBeats = 64,
  gridDivision = 4,
  selectedNotes,
  channelIndex,
  onNotesChanged,
  onSelectNote,
  onDeselectAll,
  onSelectBox,
  onMoveNotes,
  onResizeNote,
  playbackBeat,
  allChannelNotes,
  channelColors = [],
}) => {
  const theme = usePixiTheme();

  // ─── Refs (keep latest values accessible in document event handlers) ─────────

  const paramsRef = useRef({ scrollBeat, scrollNote, pixelsPerBeat, noteHeight, height, width, channelIndex, notes, theme, allChannelNotes, channelColors });
  paramsRef.current = { scrollBeat, scrollNote, pixelsPerBeat, noteHeight, height, width, channelIndex, notes, theme, allChannelNotes, channelColors };

  const callbacksRef = useRef({ onSelectNote, onDeselectAll, onSelectBox, onMoveNotes, onResizeNote, onNotesChanged });
  callbacksRef.current = { onSelectNote, onDeselectAll, onSelectBox, onMoveNotes, onResizeNote, onNotesChanged };

  const dragRef = useRef<DragState | null>(null);

  /** Separate graphics layer for rubber-band rect and ghost notes (drawn imperatively) */
  const overlayRef = useRef<GraphicsType>(null);

  // ─── Hit testing ─────────────────────────────────────────────────────────────

  function findNoteAt(lx: number, ly: number) {
    const { scrollBeat: sb, scrollNote: sn, pixelsPerBeat: ppb, noteHeight: nh, height: h, channelIndex: chi, notes: ns } = paramsRef.current;
    // Iterate in reverse so topmost (last rendered) note wins
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      const nx = (n.start - sb) * ppb;
      const ny = h - (n.note - sn + 1) * nh;
      const nw = Math.max(4, n.duration * ppb);
      if (lx >= nx && lx <= nx + nw && ly >= ny && ly <= ny + nh) {
        const id = chi !== undefined ? `${chi}-${n.start}` : '';
        const isResize = lx >= nx + nw - RESIZE_ZONE_PX;
        return { note: n, id, isResize };
      }
    }
    return null;
  }

  function findNotesInBox(lx1: number, ly1: number, lx2: number, ly2: number): string[] {
    const { scrollBeat: sb, scrollNote: sn, pixelsPerBeat: ppb, noteHeight: nh, height: h, channelIndex: chi, notes: ns } = paramsRef.current;
    const minX = Math.min(lx1, lx2);
    const maxX = Math.max(lx1, lx2);
    const minY = Math.min(ly1, ly2);
    const maxY = Math.max(ly1, ly2);
    const ids: string[] = [];
    for (const n of ns) {
      const nx = (n.start - sb) * ppb;
      const ny = h - (n.note - sn + 1) * nh;
      const nw = Math.max(4, n.duration * ppb);
      if (nx < maxX && nx + nw > minX && ny < maxY && ny + nh > minY && chi !== undefined) {
        ids.push(`${chi}-${n.start}`);
      }
    }
    return ids;
  }

  // ─── Overlay drawing (imperative, no React re-renders during drag) ────────────

  function drawOverlay(drag: DragState, currentLocalX: number, currentLocalY: number) {
    const gfx = overlayRef.current;
    if (!gfx) return;
    gfx.clear();

    const { scrollBeat: sb, scrollNote: sn, pixelsPerBeat: ppb, noteHeight: nh, height: h, theme: t } = paramsRef.current;

    if (drag.mode === 'box') {
      const bx = Math.min(drag.startLocalX, currentLocalX);
      const by = Math.min(drag.startLocalY, currentLocalY);
      const bw = Math.abs(currentLocalX - drag.startLocalX);
      const bh = Math.abs(currentLocalY - drag.startLocalY);
      if (bw > 1 && bh > 1) {
        gfx.rect(bx, by, bw, bh);
        gfx.fill({ color: 0x4a9eff, alpha: 0.1 });
        gfx.rect(bx, by, bw, bh);
        gfx.stroke({ color: 0x4a9eff, alpha: 0.7, width: 1 });
      }
    } else if (drag.mode === 'move' && drag.originalNotes.length > 0) {
      const deltaRow = Math.round((currentLocalX - drag.startLocalX) / ppb);
      const deltaPitch = -Math.round((currentLocalY - drag.startLocalY) / nh);
      for (const n of drag.originalNotes) {
        const newStart = Math.max(0, n.start + deltaRow);
        const newNote = Math.max(0, Math.min(127, n.note + deltaPitch));
        const x = (newStart - sb) * ppb;
        const y = h - (newNote - sn + 1) * nh;
        const w = Math.max(2, n.duration * ppb - 1);
        gfx.roundRect(x + 0.5, y + 1, w, nh - 2, 2);
        gfx.fill({ color: t.accent.color, alpha: 0.5 });
        gfx.roundRect(x + 0.5, y + 1, w, nh - 2, 2);
        gfx.stroke({ color: t.accent.color, alpha: 0.9, width: 1 });
      }
    } else if (drag.mode === 'resize' && drag.noteId) {
      const { notes: ns, channelIndex: chi } = paramsRef.current;
      const note = ns.find(n => chi !== undefined && `${chi}-${n.start}` === drag.noteId);
      if (note) {
        const deltaLocalX = currentLocalX - drag.startLocalX;
        const newDur = Math.max(1, Math.round((note.duration * ppb + deltaLocalX) / ppb));
        const x = (note.start - sb) * ppb;
        const y = h - (note.note - sn + 1) * nh;
        const w = Math.max(2, newDur * ppb - 1);
        gfx.roundRect(x + 0.5, y + 1, w, nh - 2, 2);
        gfx.fill({ color: t.accent.color, alpha: 0.5 });
        gfx.roundRect(x + 0.5, y + 1, w, nh - 2, 2);
        gfx.stroke({ color: t.accent.color, alpha: 0.9, width: 1 });
      }
    }
  }

  // ─── Convert screen position to grid coordinates (for draw/erase) ─────────────

  const screenToGrid = useCallback((localX: number, localY: number) => {
    const beat = Math.floor(localX / pixelsPerBeat + scrollBeat);
    const midiNote = Math.floor((height - localY) / noteHeight + scrollNote);
    return { beat: Math.max(0, beat), midiNote: Math.max(0, Math.min(127, midiNote)) };
  }, [pixelsPerBeat, scrollBeat, noteHeight, scrollNote, height]);

  // ─── Pointer interaction ──────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const tool = usePianoRollStore.getState().tool;
    const local = e.getLocalPosition(e.currentTarget);

    // ── Select tool ────────────────────────────────────────────────────────────
    if (tool === 'select') {
      const hit = findNoteAt(local.x, local.y);

      if (hit && hit.id) {
        const isAlreadySelected = usePianoRollStore.getState().selection.notes.has(hit.id);

        if (hit.isResize) {
          // Resize: select just this note, then drag right edge
          callbacksRef.current.onSelectNote?.(hit.id, false);
          dragRef.current = {
            mode: 'resize',
            startLocalX: local.x,
            startLocalY: local.y,
            startGlobalX: e.globalX,
            startGlobalY: e.globalY,
            noteId: hit.id,
            originalNotes: [],
            originalEndRow: hit.note.start + hit.note.duration,
            didDrag: false,
          };
        } else {
          // Move: if not selected (and no modifier), select only this note
          if (!isAlreadySelected) {
            callbacksRef.current.onSelectNote?.(hit.id, e.shiftKey || e.ctrlKey || e.metaKey);
          }
          // Read the (now updated) selection from the store
          const allSelected = usePianoRollStore.getState().selection.notes;
          const { notes: ns, channelIndex: chi } = paramsRef.current;
          const originalNotes = ns
            .filter(n => chi !== undefined && allSelected.has(`${chi}-${n.start}`))
            .map(n => ({ id: `${chi!}-${n.start}`, start: n.start, duration: n.duration, note: n.note }));

          dragRef.current = {
            mode: 'move',
            startLocalX: local.x,
            startLocalY: local.y,
            startGlobalX: e.globalX,
            startGlobalY: e.globalY,
            noteId: hit.id,
            originalNotes,
            originalEndRow: 0,
            didDrag: false,
          };
        }
      } else {
        // Empty space: clear selection (unless shift), start rubber-band
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          callbacksRef.current.onDeselectAll?.();
        }
        dragRef.current = {
          mode: 'box',
          startLocalX: local.x,
          startLocalY: local.y,
          startGlobalX: e.globalX,
          startGlobalY: e.globalY,
          noteId: null,
          originalNotes: [],
          originalEndRow: 0,
          didDrag: false,
        };
      }

      // Attach document-level drag handlers
      const onMove = (me: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const camScale = useWorkbenchStore.getState().camera.scale;
        const lx = drag.startLocalX + (me.clientX - drag.startGlobalX) / camScale;
        const ly = drag.startLocalY + (me.clientY - drag.startGlobalY) / camScale;
        if (!drag.didDrag) {
          const dist = Math.hypot(me.clientX - drag.startGlobalX, me.clientY - drag.startGlobalY);
          if (dist > MIN_DRAG_PX) drag.didDrag = true;
        }
        if (drag.didDrag) drawOverlay(drag, lx, ly);
      };

      const onUp = (me: PointerEvent) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);

        const drag = dragRef.current;
        dragRef.current = null;
        overlayRef.current?.clear();
        if (!drag) return;

        const camScale = useWorkbenchStore.getState().camera.scale;
        const lx = drag.startLocalX + (me.clientX - drag.startGlobalX) / camScale;
        const ly = drag.startLocalY + (me.clientY - drag.startGlobalY) / camScale;
        const { pixelsPerBeat: ppb, noteHeight: nh } = paramsRef.current;

        if (!drag.didDrag) return; // Pure click — selection already handled on pointerdown

        if (drag.mode === 'box') {
          const ids = findNotesInBox(drag.startLocalX, drag.startLocalY, lx, ly);
          callbacksRef.current.onSelectBox?.(ids);
        } else if (drag.mode === 'move') {
          const deltaRow = Math.round((lx - drag.startLocalX) / ppb);
          const deltaPitch = -Math.round((ly - drag.startLocalY) / nh);
          if (deltaRow !== 0 || deltaPitch !== 0) {
            callbacksRef.current.onMoveNotes?.(drag.originalNotes.map(n => n.id), deltaRow, deltaPitch);
          }
        } else if (drag.mode === 'resize' && drag.noteId) {
          const { notes: ns, channelIndex: chi } = paramsRef.current;
          const note = ns.find(n => chi !== undefined && `${chi}-${n.start}` === drag.noteId);
          if (note) {
            const newDur = Math.max(1, Math.round((note.duration * ppb + (lx - drag.startLocalX)) / ppb));
            callbacksRef.current.onResizeNote?.(drag.noteId, note.start + newDur);
          }
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      return;
    }

    // ── Draw / Erase tools ──────────────────────────────────────────────────────
    const { beat, midiNote } = screenToGrid(local.x, local.y);
    const ts = useTrackerStore.getState();
    const view = usePianoRollStore.getState().view;
    const pat = ts.patterns[ts.currentPatternIndex];
    if (!pat || beat >= pat.length) return;

    const ch = view.channelIndex;
    const trackerNote = midiNote - 11;
    if (trackerNote < 1 || trackerNote > 96) return;

    if (tool === 'draw') {
      const instrumentId = useInstrumentStore.getState().currentInstrumentId ?? 1;
      ts.setCell(ch, beat, { note: trackerNote, instrument: instrumentId, volume: 64 });
      onNotesChanged?.();
    } else if (tool === 'erase') {
      const channel = pat.channels[ch];
      if (channel?.rows[beat]?.note > 0) {
        ts.clearCell(ch, beat);
        onNotesChanged?.();
      }
    }
  }, [screenToGrid, onNotesChanged]);

  // ─── Grid draw ────────────────────────────────────────────────────────────────

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    const visibleNotes = Math.ceil(height / noteHeight) + 1;
    const startNote = Math.max(0, Math.floor(scrollNote));
    const endNote = Math.min(128, startNote + visibleNotes);

    for (let note = startNote; note < endNote; note++) {
      const y = height - (note - scrollNote + 1) * noteHeight;
      if (y > height || y + noteHeight < 0) continue;
      const noteInOctave = note % 12;
      const isBlack = BLACK_KEYS.has(noteInOctave);
      g.rect(0, y, width, noteHeight);
      g.fill({ color: isBlack ? theme.bgSecondary.color : theme.bg.color, alpha: isBlack ? 0.6 : 1 });
      g.rect(0, y + noteHeight - 1, width, 1);
      g.fill({ color: theme.border.color, alpha: noteInOctave === 0 ? 0.3 : 0.08 });
    }

    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);
    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      for (let sub = 0; sub < gridDivision; sub++) {
        const x = (beat + sub / gridDivision - scrollBeat) * pixelsPerBeat;
        if (x < 0 || x > width) continue;
        g.rect(x, 0, 1, height);
        g.fill({ color: theme.border.color, alpha: sub === 0 ? 0.25 : 0.08 });
      }
    }

    // Multi-channel overview: draw all-channel notes first (behind active channel)
    if (allChannelNotes) {
      for (let i = 0; i < allChannelNotes.length; i++) {
        const n = allChannelNotes[i];
        const isActiveChannel = n.channelIndex === channelIndex;
        if (isActiveChannel) continue; // Active channel drawn separately below
        const x = (n.start - scrollBeat) * pixelsPerBeat;
        const y = height - (n.note - scrollNote + 1) * noteHeight;
        const w = n.duration * pixelsPerBeat;
        if (x + w < 0 || x > width || y + noteHeight < 0 || y > height) continue;
        const color = channelColors.length > 0
          ? channelColors[n.channelIndex % channelColors.length]
          : 0x888888;
        const velAlpha = (0.3 + (n.velocity / 127) * 0.3) * 0.5; // Dimmed for non-active channels
        g.roundRect(x + 0.5, y + 1, Math.max(2, w - 1), noteHeight - 2, 2);
        g.fill({ color, alpha: velAlpha });
        g.roundRect(x + 0.5, y + 1, Math.max(2, w - 1), noteHeight - 2, 2);
        g.stroke({ color, alpha: 0.5, width: 1 });
      }
    }

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const x = (n.start - scrollBeat) * pixelsPerBeat;
      const y = height - (n.note - scrollNote + 1) * noteHeight;
      const w = n.duration * pixelsPerBeat;
      if (x + w < 0 || x > width || y + noteHeight < 0 || y > height) continue;

      const isSelected = channelIndex !== undefined && selectedNotes?.has(`${channelIndex}-${n.start}`);
      const velAlpha = 0.4 + (n.velocity / 127) * 0.6;

      // In multi-channel mode, use the active channel's color from the palette
      const activeColor = allChannelNotes && channelColors.length > 0 && channelIndex !== undefined
        ? channelColors[channelIndex % channelColors.length]
        : theme.accent.color;

      g.roundRect(x + 0.5, y + 1, Math.max(2, w - 1), noteHeight - 2, 2);
      g.fill({ color: isSelected ? theme.warning.color : activeColor, alpha: velAlpha });
      g.roundRect(x + 0.5, y + 1, Math.max(2, w - 1), noteHeight - 2, 2);
      g.stroke({ color: isSelected ? theme.warning.color : activeColor, alpha: 0.8, width: 1 });

      // Resize handle on selected notes
      if (isSelected && w > RESIZE_ZONE_PX + 4) {
        g.rect(x + w - RESIZE_ZONE_PX, y + 2, 2, noteHeight - 4);
        g.fill({ color: 0xffffff, alpha: 0.45 });
      }
    }

    // Playback cursor
    if (playbackBeat != null) {
      const px = (playbackBeat - scrollBeat) * pixelsPerBeat;
      if (px >= 0 && px <= width) {
        g.rect(px, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.85 });
      }
    }
  }, [width, height, notes, noteHeight, pixelsPerBeat, scrollNote, scrollBeat, totalBeats, gridDivision, selectedNotes, channelIndex, playbackBeat, theme, allChannelNotes, channelColors]);

  // Initial empty draw for overlay (only runs once on mount)
  const drawOverlayInit = useCallback((g: GraphicsType) => { g.clear(); }, []);

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
      cursor="crosshair"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height }} />
      <pixiGraphics ref={overlayRef} draw={drawOverlayInit} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
