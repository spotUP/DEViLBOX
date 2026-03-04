/**
 * PixiArrangementCanvas — Main arrangement grid with timeline, clips, and automation.
 *
 * Select tool:
 *   - Click clip       → select (shift-click adds)
 *   - Click empty      → deselect all, start rubber-band
 *   - Drag clip body   → move selected clips (ghost preview)
 *   - Drag clip edge   → resize clip end (ghost preview)
 *
 * Draw tool:   drag empty → place new clip
 * Erase tool:  click clip → delete
 * Split tool:  click clip → split at cursor
 */

import { useCallback, useMemo, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useTrackerStore, usePianoRollStore } from '@stores';
import { useArrangementStore } from '@stores/useArrangementStore';
import type { ArrangementToolMode } from '@/types/arrangement';

/** Per-channel note data for multi-channel waveform rendering inside a clip. */
export interface ClipChannelNotes {
  /** XM note values per row for this channel: 1-96 = pitched, 97 = note-off, 0 = empty */
  noteRows: number[];
  /** RGBA hex color for this channel's bars (uses clip color if omitted) */
  color?: number;
}

/** Pre-processed clip data ready for rendering */
export interface ClipRenderData {
  id: string;
  startRow: number;
  lengthRows: number;
  trackIndex: number;
  color: number;
  name: string;
  muted: boolean;
  selected: boolean;
  fadeInRows?: number;
  fadeOutRows?: number;
  /** Note values (XM format: 1-96 = pitched note, 97 = note off, 0 = empty)
   *  for drawing the mini note-preview bars inside the clip (single-channel legacy). */
  noteRows?: number[];
  /** Multi-channel note data for the waveform preview. Up to 4 channels rendered.
   *  When provided, takes precedence over noteRows for the multi-channel draw pass. */
  noteChannels?: ClipChannelNotes[];
}

interface PixiArrangementCanvasProps {
  width: number;
  height: number;
  beatsPerBar?: number;
  pixelsPerBeat?: number;
  scrollBeat?: number;
  totalBeats?: number;
  playbackBeat?: number;
  clips?: ClipRenderData[];
  trackHeight?: number;
  scrollY?: number;
  tool?: ArrangementToolMode;
  snapDivision?: number;
  /** Called when a clip is clicked in select mode */
  onSelectClip?: (id: string, add: boolean) => void;
  /** Called when clicking empty space (deselect all) */
  onDeselectAll?: () => void;
  /** Called on rubber-band release with clip IDs inside the box */
  onSelectBox?: (ids: string[]) => void;
  /** Called on move-drag release */
  onMoveClips?: (ids: string[], deltaRow: number, deltaTrackIndex: number) => void;
  /** Called on resize-end-drag release */
  onResizeClipEnd?: (id: string, newEndRow: number) => void;
  /** Called when draw-drag is released (trackIndex, startRow, lengthRows) */
  onAddClip?: (trackIndex: number, startRow: number, lengthRows: number) => void;
  /** Called when a clip is clicked in erase mode */
  onDeleteClip?: (id: string) => void;
  /** Called when a clip is clicked in split mode */
  onSplitClip?: (id: string, splitRow: number) => void;
  /** Called on double-click of a clip in select mode */
  onOpenInPianoRoll?: (clipId: string) => void;
  /** Called on right-click; clipId is null if clicking empty space */
  onContextMenu?: (clipId: string | null, screenX: number, screenY: number) => void;
  /** Arrangement loop region start row (null = no loop) */
  loopStart?: number | null;
  /** Arrangement loop region end row */
  loopEnd?: number | null;
  /** Timeline markers to display in the ruler */
  markers?: Array<{ id: string; row: number; label: string; color: number; timeSig?: string }>;
  /** Called on right-click in the ruler area — row is the timeline row at cursor */
  onAddMarker?: (row: number) => void;
  /** Called when a marker is dragged to a new row */
  onMoveMarker?: (markerId: string, row: number) => void;
  /** Called when a marker is double-clicked (rename) */
  onRenameMarker?: (markerId: string) => void;
  /** Called on Cmd+click in empty ruler area to add a time sig marker */
  onAddTimeSigMarker?: (row: number) => void;
}

const CLIP_PADDING = 2;
const RULER_HEIGHT = 24;
const RESIZE_ZONE_PX = 8;
const MIN_DRAG_PX = 4;

type DragMode = 'move' | 'resize-end' | 'box' | 'draw';

interface DragState {
  mode: DragMode;
  startLocalX: number;
  startLocalY: number;
  startGlobalX: number;
  startGlobalY: number;
  clipId: string | null;
  originalClips: Array<{ id: string; startRow: number; lengthRows: number; trackIndex: number; color: number }>;
  didDrag: boolean;
  drawTrackIndex: number;
  drawStartRow: number;
}

function snapRow(row: number, division: number): number {
  if (division <= 0) return Math.round(row);
  return Math.round(row / division) * division;
}

/** Collect clip-edge rows for all clips on a given track, excluding the specified clip IDs. */
function getTrackEdgeRows(
  clips: ClipRenderData[],
  trackIndex: number,
  excludeIds: Set<string>,
): number[] {
  const edges: number[] = [];
  for (const c of clips) {
    if (c.trackIndex !== trackIndex) continue;
    if (excludeIds.has(c.id)) continue;
    edges.push(c.startRow);
    edges.push(c.startRow + c.lengthRows);
  }
  return edges;
}

const MAGNETIC_SNAP_ROWS = 3;

/** Apply magnetic edge snapping: if `row` is within MAGNETIC_SNAP_ROWS of any edge, snap to it. */
function magneticSnap(row: number, edges: number[]): number {
  let best = row;
  let bestDist = MAGNETIC_SNAP_ROWS + 1;
  for (const e of edges) {
    const d = Math.abs(row - e);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return bestDist <= MAGNETIC_SNAP_ROWS ? best : row;
}

/** Check if the range [startRow, startRow+lengthRows) overlaps any clip on the same trackIndex,
 *  excluding the specified clip IDs. */
function hasOverlapOnTrack(
  clips: ClipRenderData[],
  trackIndex: number,
  startRow: number,
  lengthRows: number,
  excludeIds: Set<string>,
): boolean {
  const endRow = startRow + lengthRows;
  for (const c of clips) {
    if (c.trackIndex !== trackIndex) continue;
    if (excludeIds.has(c.id)) continue;
    const cEnd = c.startRow + c.lengthRows;
    if (startRow < cEnd && endRow > c.startRow) return true;
  }
  return false;
}

function findClipAt(
  lx: number, ly: number,
  clips: ClipRenderData[],
  scrollBeat: number, pixelsPerBeat: number, trackHeight: number, scrollY: number
): { id: string; mode: 'move' | 'resize-end' } | null {
  for (let i = clips.length - 1; i >= 0; i--) {
    const clip = clips[i];
    const cx = (clip.startRow - scrollBeat) * pixelsPerBeat;
    const cw = clip.lengthRows * pixelsPerBeat;
    const cy = RULER_HEIGHT + clip.trackIndex * trackHeight + CLIP_PADDING - scrollY;
    const ch = trackHeight - CLIP_PADDING * 2;
    if (lx >= cx + CLIP_PADDING && lx <= cx + cw - CLIP_PADDING && ly >= cy && ly <= cy + ch) {
      const isResizeZone = lx >= cx + cw - CLIP_PADDING - RESIZE_ZONE_PX && cw > RESIZE_ZONE_PX * 2;
      return { id: clip.id, mode: isResizeZone ? 'resize-end' : 'move' };
    }
  }
  return null;
}

function findClipsInBox(
  lx1: number, ly1: number, lx2: number, ly2: number,
  clips: ClipRenderData[],
  scrollBeat: number, pixelsPerBeat: number, trackHeight: number, scrollY: number
): string[] {
  const bx1 = Math.min(lx1, lx2), bx2 = Math.max(lx1, lx2);
  const by1 = Math.min(ly1, ly2), by2 = Math.max(ly1, ly2);
  return clips.filter(clip => {
    const cx = (clip.startRow - scrollBeat) * pixelsPerBeat;
    const cw = clip.lengthRows * pixelsPerBeat;
    const cy = RULER_HEIGHT + clip.trackIndex * trackHeight + CLIP_PADDING - scrollY;
    const ch = trackHeight - CLIP_PADDING * 2;
    return cx + cw > bx1 && cx < bx2 && cy + ch > by1 && cy < by2;
  }).map(c => c.id);
}

export const PixiArrangementCanvas: React.FC<PixiArrangementCanvasProps> = ({
  width,
  height,
  beatsPerBar = 4,
  pixelsPerBeat = 20,
  scrollBeat = 0,
  totalBeats = 128,
  playbackBeat,
  clips = [],
  trackHeight = 40,
  scrollY = 0,
  tool = 'select',
  snapDivision = 4,
  onSelectClip,
  onDeselectAll,
  onSelectBox,
  onMoveClips,
  onResizeClipEnd,
  onAddClip,
  onDeleteClip,
  onSplitClip,
  onOpenInPianoRoll,
  onContextMenu,
  loopStart,
  loopEnd,
  markers = [],
  onAddMarker,
  onMoveMarker,
  onRenameMarker,
  onAddTimeSigMarker,
}) => {
  const theme = usePixiTheme();
  const gridHeight = height - RULER_HEIGHT;

  // Keep latest params/callbacks in refs so drag handlers don't go stale
  const paramsRef = useRef({ scrollBeat, pixelsPerBeat, trackHeight, scrollY, clips, tool, snapDivision, width, height, theme, loopStart, loopEnd, markers });
  paramsRef.current = { scrollBeat, pixelsPerBeat, trackHeight, scrollY, clips, tool, snapDivision, width, height, theme, loopStart, loopEnd, markers };

  const callbacksRef = useRef({ onSelectClip, onDeselectAll, onSelectBox, onMoveClips, onResizeClipEnd, onAddClip, onDeleteClip, onSplitClip, onOpenInPianoRoll, onContextMenu, onAddMarker, onMoveMarker, onRenameMarker, onAddTimeSigMarker });
  callbacksRef.current = { onSelectClip, onDeselectAll, onSelectBox, onMoveClips, onResizeClipEnd, onAddClip, onDeleteClip, onSplitClip, onOpenInPianoRoll, onContextMenu, onAddMarker, onMoveMarker, onRenameMarker, onAddTimeSigMarker };

  // Double-click detection for select tool
  const lastClickRef = useRef<{ time: number; clipId: string }>({ time: 0, clipId: '' });
  // Double-click detection for markers
  const lastMarkerClickRef = useRef<{ time: number; markerId: string }>({ time: 0, markerId: '' });

  const dragRef = useRef<DragState | null>(null);
  const overlayRef = useRef<GraphicsType | null>(null);
  // Tracks active marker drag { id, startRow }
  const draggingMarkerRef = useRef<{ id: string; startRow: number } | null>(null);

  // ---------- overlay drawing ----------
  const drawOverlay = useCallback((currentLocalX: number, currentLocalY: number) => {
    const g = overlayRef.current;
    const drag = dragRef.current;
    if (!g || !drag) return;
    g.clear();
    if (!drag.didDrag) return;

    const { scrollBeat: sb, pixelsPerBeat: ppb, trackHeight: th, snapDivision: snap, scrollY: sy } = paramsRef.current;
    const { theme: t } = paramsRef.current;

    if (drag.mode === 'box') {
      const x1 = Math.min(drag.startLocalX, currentLocalX);
      const y1 = Math.min(drag.startLocalY, currentLocalY);
      const x2 = Math.max(drag.startLocalX, currentLocalX);
      const y2 = Math.max(drag.startLocalY, currentLocalY);
      g.rect(x1, y1, x2 - x1, y2 - y1);
      g.fill({ color: t.accent.color, alpha: 0.12 });
      g.rect(x1, y1, x2 - x1, y2 - y1);
      g.stroke({ color: t.accent.color, alpha: 0.7, width: 1 });
      return;
    }

    if (drag.mode === 'move') {
      const rawDeltaX = currentLocalX - drag.startLocalX;
      const rawDeltaRow = rawDeltaX / ppb;
      const rawDeltaTrack = (currentLocalY - drag.startLocalY) / th;
      const dt = Math.round(rawDeltaTrack);

      const { clips: allClips } = paramsRef.current;
      const draggedIds = new Set(drag.originalClips.map(c => c.id));

      // Compute grid-snapped delta from the first clip
      let snappedFirstRow = snapRow(drag.originalClips[0].startRow + rawDeltaRow, snap);

      // Apply magnetic edge snapping for the first dragged clip on its target track
      const firstOrig = drag.originalClips[0];
      const targetTrackIdx = Math.max(0, firstOrig.trackIndex + dt);
      const edgeRows = getTrackEdgeRows(allClips, targetTrackIdx, draggedIds);
      const candidateStart = snappedFirstRow;
      const candidateEnd = candidateStart + firstOrig.lengthRows;
      const magStart = magneticSnap(candidateStart, edgeRows);
      const magEnd = magneticSnap(candidateEnd, edgeRows);
      // Pick whichever magnetic pull is stronger (closest)
      const distStart = Math.abs(magStart - candidateStart);
      const distEnd = Math.abs(magEnd - candidateEnd);
      if (distStart <= MAGNETIC_SNAP_ROWS || distEnd <= MAGNETIC_SNAP_ROWS) {
        if (distStart <= distEnd) {
          snappedFirstRow = magStart;
        } else {
          snappedFirstRow = magEnd - firstOrig.lengthRows;
        }
      }

      const dr = snappedFirstRow - drag.originalClips[0].startRow;

      for (const orig of drag.originalClips) {
        const newStart = Math.max(0, orig.startRow + dr);
        const newTrackIdx = Math.max(0, orig.trackIndex + dt);
        const cx = (newStart - sb) * ppb;
        const cy = RULER_HEIGHT + newTrackIdx * th + CLIP_PADDING - sy;
        const cw = orig.lengthRows * ppb;
        const ch = th - CLIP_PADDING * 2;
        g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
        g.fill({ color: orig.color, alpha: 0.5 });
        g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
        g.stroke({ color: 0xffffff, alpha: 0.7, width: 1 });
      }
      return;
    }

    if (drag.mode === 'resize-end') {
      const orig = drag.originalClips[0];
      if (!orig) return;
      const rawEndRow = sb + currentLocalX / ppb;
      let newEndRow = Math.max(orig.startRow + 1, snapRow(rawEndRow, snap));

      // Magnetic edge snapping for resize
      const { clips: allClips } = paramsRef.current;
      const draggedIds = new Set([orig.id]);
      const edgeRows = getTrackEdgeRows(allClips, orig.trackIndex, draggedIds);
      const magEnd = magneticSnap(newEndRow, edgeRows);
      if (Math.abs(magEnd - newEndRow) <= MAGNETIC_SNAP_ROWS) {
        newEndRow = Math.max(orig.startRow + 1, magEnd);
      }

      const cx = (orig.startRow - sb) * ppb;
      const cw = Math.max(4, (newEndRow - orig.startRow) * ppb);
      const cy = RULER_HEIGHT + orig.trackIndex * th + CLIP_PADDING - sy;
      const ch = th - CLIP_PADDING * 2;
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.fill({ color: orig.color, alpha: 0.5 });
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.stroke({ color: 0xffffff, alpha: 0.7, width: 1 });
      return;
    }

    if (drag.mode === 'draw') {
      const startRow = snapRow(drag.drawStartRow, snap);
      const rawEndRow = sb + currentLocalX / ppb;
      const endRow = Math.max(startRow + Math.max(1, snap), snapRow(rawEndRow, snap));
      const cx = (startRow - sb) * ppb;
      const cw = Math.max(4, (endRow - startRow) * ppb);
      const cy = RULER_HEIGHT + drag.drawTrackIndex * th + CLIP_PADDING - sy;
      const ch = th - CLIP_PADDING * 2;

      // Check for overlap with existing clips on the same track
      const { clips: allClips } = paramsRef.current;
      const overlaps = hasOverlapOnTrack(allClips, drag.drawTrackIndex, startRow, endRow - startRow, new Set());
      const ghostColor = overlaps ? 0xff4444 : 0x4a9eff;

      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.fill({ color: ghostColor, alpha: 0.35 });
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.stroke({ color: ghostColor, alpha: 0.85, width: 1 });
    }
  }, []);

  // ---------- pointer handling ----------
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const pos = e.getLocalPosition(e.currentTarget as any);
    const lx = pos.x;
    const ly = pos.y;
    const { clips: cs, tool: t, scrollBeat: sb, pixelsPerBeat: ppb, trackHeight: th, snapDivision: snap, scrollY: sy } = paramsRef.current;
    const cbs = callbacksRef.current;

    const hit = findClipAt(lx, ly, cs, sb, ppb, th, sy);
    const trackIndex = Math.max(0, Math.floor((ly - RULER_HEIGHT + sy) / th));
    const rowAtCursor = sb + lx / ppb;

    // Right-click: add marker in ruler, context menu elsewhere
    if (e.button === 2) {
      if (ly < RULER_HEIGHT) {
        cbs.onAddMarker?.(Math.round(rowAtCursor));
      } else {
        cbs.onContextMenu?.(hit?.id ?? null, e.clientX, e.clientY);
      }
      return;
    }

    // Ruler clicks: marker drag, double-click rename, Cmd+click for time sig
    if (ly < RULER_HEIGHT) {
      const { markers: ms } = paramsRef.current;
      // Find closest marker within 10px
      let closestMarker: typeof ms[0] | null = null;
      let closestDist = 11;
      for (const m of ms) {
        const mx = (m.row - paramsRef.current.scrollBeat) * paramsRef.current.pixelsPerBeat;
        const d = Math.abs(lx - mx);
        if (d < closestDist) { closestDist = d; closestMarker = m; }
      }

      if (closestMarker) {
        const now = Date.now();
        // Double-click: rename
        if (now - lastMarkerClickRef.current.time < 300 && lastMarkerClickRef.current.markerId === closestMarker.id) {
          cbs.onRenameMarker?.(closestMarker.id);
          lastMarkerClickRef.current = { time: 0, markerId: '' };
          return;
        }
        lastMarkerClickRef.current = { time: now, markerId: closestMarker.id };

        // Start marker drag via document events
        const markerId = closestMarker.id;
        draggingMarkerRef.current = { id: markerId, startRow: closestMarker.row };

        const onMarkerMove = (me: PointerEvent) => {
          if (!draggingMarkerRef.current) return;
          const cameraScale = useWorkbenchStore.getState().camera.scale;
          const deltaX = (me.clientX - e.clientX) / cameraScale;
          const { pixelsPerBeat: ppb2 } = paramsRef.current;
          const newRow = Math.max(0, Math.round(draggingMarkerRef.current.startRow + deltaX / ppb2));
          callbacksRef.current.onMoveMarker?.(markerId, newRow);
        };
        const onMarkerUp = () => {
          document.removeEventListener('pointermove', onMarkerMove);
          document.removeEventListener('pointerup', onMarkerUp);
          draggingMarkerRef.current = null;
        };
        document.addEventListener('pointermove', onMarkerMove);
        document.addEventListener('pointerup', onMarkerUp);
        return;
      }

      // Cmd+click on empty ruler area: add time sig marker
      if (e.metaKey || e.ctrlKey) {
        cbs.onAddTimeSigMarker?.(Math.round(rowAtCursor));
        return;
      }

      // Plain left-click on empty ruler: do nothing special (fall through)
      return;
    }

    // Erase tool
    if (t === 'erase') {
      if (hit) cbs.onDeleteClip?.(hit.id);
      return;
    }

    // Split tool
    if (t === 'split') {
      if (hit) {
        const splitRow = Math.round(rowAtCursor);
        cbs.onSplitClip?.(hit.id, splitRow);
      }
      return;
    }

    // Draw tool — start draw drag on empty space
    if (t === 'draw') {
      if (!hit) {
        const startRow = snapRow(rowAtCursor, snap);
        dragRef.current = {
          mode: 'draw',
          startLocalX: lx, startLocalY: ly,
          startGlobalX: e.clientX, startGlobalY: e.clientY,
          clipId: null,
          originalClips: [],
          didDrag: false,
          drawTrackIndex: trackIndex,
          drawStartRow: startRow,
        };
      }
      return;
    }

    // Select tool
    if (t === 'select') {
      if (hit) {
        // Double-click detection: open in piano roll
        const now = Date.now();
        if (now - lastClickRef.current.time < 300 && lastClickRef.current.clipId === hit.id) {
          lastClickRef.current = { time: 0, clipId: '' };
          if (cbs.onOpenInPianoRoll) {
            // Prefer the provided callback (handles full navigation in PixiArrangementView)
            cbs.onOpenInPianoRoll(hit.id);
          } else {
            // Fallback: wire directly to stores when no callback is provided
            const arrClip = useArrangementStore.getState().clips.find(c => c.id === hit.id);
            if (arrClip) {
              const ts = useTrackerStore.getState();
              const patternIndex = ts.patterns.findIndex(p => p.id === (arrClip as { patternId?: string }).patternId);
              if (patternIndex >= 0) ts.setCurrentPattern(patternIndex);
              const channelIndex = (arrClip as { sourceChannelIndex?: number }).sourceChannelIndex ?? 0;
              const pr = usePianoRollStore.getState();
              pr.setChannelIndex(channelIndex);
              useWorkbenchStore.getState().showWindow('pianoroll');
            }
          }
          return;
        }
        lastClickRef.current = { time: now, clipId: hit.id };

        // Select on pointer down
        if (!cs.find(c => c.id === hit.id)?.selected) {
          cbs.onSelectClip?.(hit.id, e.shiftKey);
        }
        // Gather original clips for drag
        const selectedIds = new Set(cs.filter(c => c.selected || c.id === hit.id).map(c => c.id));
        const originalClips = cs
          .filter(c => selectedIds.has(c.id))
          .map(c => ({ id: c.id, startRow: c.startRow, lengthRows: c.lengthRows, trackIndex: c.trackIndex, color: c.color }));

        dragRef.current = {
          mode: hit.mode,
          startLocalX: lx, startLocalY: ly,
          startGlobalX: e.clientX, startGlobalY: e.clientY,
          clipId: hit.id,
          originalClips,
          didDrag: false,
          drawTrackIndex: 0,
          drawStartRow: 0,
        };
      } else {
        // Click empty — deselect and start rubber-band
        if (!e.shiftKey) cbs.onDeselectAll?.();
        dragRef.current = {
          mode: 'box',
          startLocalX: lx, startLocalY: ly,
          startGlobalX: e.clientX, startGlobalY: e.clientY,
          clipId: null,
          originalClips: [],
          didDrag: false,
          drawTrackIndex: 0,
          drawStartRow: 0,
        };
      }
    }

    const onMove = (me: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const cameraScale = useWorkbenchStore.getState().camera.scale;
      const currentLocalX = drag.startLocalX + (me.clientX - drag.startGlobalX) / cameraScale;
      const currentLocalY = drag.startLocalY + (me.clientY - drag.startGlobalY) / cameraScale;
      const dist = Math.hypot(me.clientX - drag.startGlobalX, me.clientY - drag.startGlobalY);
      if (!drag.didDrag && dist < MIN_DRAG_PX) return;
      drag.didDrag = true;
      drawOverlay(currentLocalX, currentLocalY);
    };

    const onUp = (ue: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      const drag = dragRef.current;
      dragRef.current = null;
      const g = overlayRef.current;
      if (g) g.clear();

      if (!drag) return;
      const { scrollBeat: sb2, pixelsPerBeat: ppb2, trackHeight: th2, snapDivision: snap2, clips: cs2, scrollY: sy2 } = paramsRef.current;
      const cbs2 = callbacksRef.current;
      const cameraScale = useWorkbenchStore.getState().camera.scale;
      const currentLocalX = drag.startLocalX + (ue.clientX - drag.startGlobalX) / cameraScale;
      const currentLocalY = drag.startLocalY + (ue.clientY - drag.startGlobalY) / cameraScale;

      if (!drag.didDrag) {
        // Single click on existing clip in select mode — finalize selection
        if (drag.mode === 'move' && drag.clipId) {
          cbs2.onSelectClip?.(drag.clipId, ue.shiftKey);
        }
        return;
      }

      if (drag.mode === 'box') {
        const ids = findClipsInBox(drag.startLocalX, drag.startLocalY, currentLocalX, currentLocalY, cs2, sb2, ppb2, th2, sy2);
        cbs2.onSelectBox?.(ids);
        return;
      }

      if (drag.mode === 'move') {
        const rawDeltaRow = (currentLocalX - drag.startLocalX) / ppb2;
        const dt = Math.round((currentLocalY - drag.startLocalY) / th2);
        const firstOrig = drag.originalClips[0];
        const draggedIds = new Set(drag.originalClips.map(c => c.id));

        let snappedFirstRow = snapRow(firstOrig.startRow + rawDeltaRow, snap2);

        // Magnetic edge snapping on finalise
        const targetTrackIdx = Math.max(0, firstOrig.trackIndex + dt);
        const edgeRows2 = getTrackEdgeRows(cs2, targetTrackIdx, draggedIds);
        const candidateStart2 = snappedFirstRow;
        const candidateEnd2 = candidateStart2 + firstOrig.lengthRows;
        const magStart2 = magneticSnap(candidateStart2, edgeRows2);
        const magEnd2 = magneticSnap(candidateEnd2, edgeRows2);
        const distStart2 = Math.abs(magStart2 - candidateStart2);
        const distEnd2 = Math.abs(magEnd2 - candidateEnd2);
        if (distStart2 <= MAGNETIC_SNAP_ROWS || distEnd2 <= MAGNETIC_SNAP_ROWS) {
          if (distStart2 <= distEnd2) {
            snappedFirstRow = magStart2;
          } else {
            snappedFirstRow = magEnd2 - firstOrig.lengthRows;
          }
        }

        const dr = snappedFirstRow - firstOrig.startRow;
        if (dr !== 0 || dt !== 0) {
          cbs2.onMoveClips?.(drag.originalClips.map(c => c.id), dr, dt);
        }
        return;
      }

      if (drag.mode === 'resize-end') {
        const orig = drag.originalClips[0];
        if (!orig) return;
        const rawEndRow = sb2 + currentLocalX / ppb2;
        let newEndRow = Math.max(orig.startRow + 1, snapRow(rawEndRow, snap2));

        // Magnetic edge snapping on finalise
        const draggedIds2 = new Set([orig.id]);
        const edgeRowsR = getTrackEdgeRows(cs2, orig.trackIndex, draggedIds2);
        const magEndR = magneticSnap(newEndRow, edgeRowsR);
        if (Math.abs(magEndR - newEndRow) <= MAGNETIC_SNAP_ROWS) {
          newEndRow = Math.max(orig.startRow + 1, magEndR);
        }

        cbs2.onResizeClipEnd?.(orig.id, newEndRow);
        return;
      }

      if (drag.mode === 'draw') {
        const startRow = snapRow(drag.drawStartRow, snap2);
        const rawEndRow = sb2 + currentLocalX / ppb2;
        const endRow = Math.max(startRow + Math.max(1, snap2), snapRow(rawEndRow, snap2));
        cbs2.onAddClip?.(drag.drawTrackIndex, startRow, endRow - startRow);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [drawOverlay]);

  // No-op draw for containers drawn imperatively via ref
  const drawNoop = useCallback((_g: GraphicsType) => {}, []);

  // ---------- grid drawing ----------
  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    g.rect(0, 0, width, RULER_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, RULER_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });

    const numTracks = clips.length > 0
      ? Math.max(...clips.map(c => c.trackIndex)) + 1
      : 0;
    for (let t = 1; t <= numTracks; t++) {
      const ty = RULER_HEIGHT + t * trackHeight - scrollY;
      if (ty < RULER_HEIGHT) continue;
      if (ty > height) break;
      g.rect(0, ty, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.15 });
    }

    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);
    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      const x = (beat - scrollBeat) * pixelsPerBeat;
      if (x < 0 || x > width) continue;
      const isBar = beat % beatsPerBar === 0;
      g.rect(x, RULER_HEIGHT, 1, gridHeight);
      g.fill({ color: theme.border.color, alpha: isBar ? 0.3 : 0.1 });
      if (isBar) {
        g.rect(x, RULER_HEIGHT - 8, 1, 8);
        g.fill({ color: theme.textMuted.color, alpha: 0.5 });
      }
    }

    for (const clip of clips) {
      const cx = (clip.startRow - scrollBeat) * pixelsPerBeat;
      const cw = clip.lengthRows * pixelsPerBeat;
      const cy = RULER_HEIGHT + clip.trackIndex * trackHeight + CLIP_PADDING - scrollY;
      const ch = trackHeight - CLIP_PADDING * 2;
      if (cx + cw < 0 || cx > width) continue;
      if (cy + ch < RULER_HEIGHT || cy > height) continue;

      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.fill({ color: clip.color, alpha: clip.muted ? 0.15 : 0.35 });

      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, 4, 3);
      g.fill({ color: clip.color, alpha: clip.muted ? 0.3 : 0.8 });

      // Fade-in overlay: left-to-right gradient using thin rects
      const fadeInPx = (clip.fadeInRows ?? 0) * pixelsPerBeat;
      if (fadeInPx > 2) {
        const numSlices = 4;
        const sliceW = fadeInPx / numSlices;
        for (let s = 0; s < numSlices; s++) {
          const sliceAlpha = 0.3 * (1 - s / numSlices);
          g.rect(cx + CLIP_PADDING + s * sliceW, cy, sliceW, ch);
          g.fill({ color: 0x000000, alpha: sliceAlpha });
        }
      }

      // Fade-out overlay: right-to-left gradient using thin rects
      const fadeOutPx = (clip.fadeOutRows ?? 0) * pixelsPerBeat;
      if (fadeOutPx > 2) {
        const numSlices = 4;
        const sliceW = fadeOutPx / numSlices;
        const rightEdge = cx + cw - CLIP_PADDING;
        for (let s = 0; s < numSlices; s++) {
          const sliceAlpha = 0.3 * (1 - s / numSlices);
          g.rect(rightEdge - (s + 1) * sliceW, cy, sliceW, ch);
          g.fill({ color: 0x000000, alpha: sliceAlpha });
        }
      }

      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.stroke({
        color: clip.selected ? 0xffffff : clip.color,
        alpha: clip.selected ? 0.8 : 0.4,
        width: clip.selected ? 2 : 1,
      });

      if (playbackBeat != null && playbackBeat >= clip.startRow && playbackBeat < clip.startRow + clip.lengthRows) {
        const progress = (playbackBeat - clip.startRow) / clip.lengthRows;
        const pw = Math.max(2, progress * (cw - CLIP_PADDING * 4));
        g.roundRect(cx + CLIP_PADDING + 1, cy + 1, pw, ch - 2, 2);
        g.fill({ color: clip.color, alpha: 0.2 });
      }

      // Resize handle on right edge of selected clips
      if (clip.selected && cw > RESIZE_ZONE_PX * 2) {
        const rx = cx + cw - CLIP_PADDING - 2;
        g.rect(rx, cy + 2, 2, ch - 4);
        g.fill({ color: 0xffffff, alpha: 0.6 });
      }

      // Note preview: draw mini note bars inside the clip body.
      // Supports both legacy single-channel noteRows and multi-channel noteChannels.
      // Only render when the clip is wide enough to show meaningful detail.
      const clipBodyLeft = cx + CLIP_PADDING;
      const clipBodyRight = cx + cw - CLIP_PADDING;
      const clipBodyTop = cy + 4; // below the header stripe
      const clipBodyBottom = cy + ch;
      const clipBodyH = clipBodyBottom - clipBodyTop;
      const clipBodyW = clipBodyRight - clipBodyLeft;

      if (clipBodyW >= 30 && pixelsPerBeat >= 1) {
        // ── Multi-channel waveform (noteChannels) ──────────────────────────
        if (clip.noteChannels && clip.noteChannels.length > 0) {
          const channelsToDraw = clip.noteChannels.slice(0, 4);
          const noteH = 2;

          for (let chIdx = 0; chIdx < channelsToDraw.length; chIdx++) {
            const channelData = channelsToDraw[chIdx];
            const barColor = channelData.color ?? clip.color;
            const { noteRows: chNoteRows } = channelData;

            for (let rowIdx = 0; rowIdx < chNoteRows.length; rowIdx++) {
              const note = chNoteRows[rowIdx];
              if (note < 1 || note > 96) continue; // skip empty and note-off

              const nx = clipBodyLeft + (rowIdx / clip.lengthRows) * clipBodyW;
              const barW = Math.max(2, pixelsPerBeat);

              if (nx + barW < clipBodyLeft || nx > clipBodyRight) continue;

              // Map MIDI note to Y: high notes near top, low notes near bottom
              const midiNote = note - 1; // XM 1-96 → MIDI 0-95
              const ny = clipBodyTop + clipBodyH * (1 - midiNote / 95) - noteH / 2;

              const drawX = Math.max(clipBodyLeft, nx);
              const drawW = Math.min(clipBodyRight, nx + barW) - drawX;
              if (drawW <= 0) continue;

              g.rect(drawX, ny, drawW, noteH);
              g.fill({ color: barColor, alpha: clip.muted ? 0.15 : 0.4 });
            }
          }
        } else if (clip.noteRows && clip.noteRows.length > 0) {
          // ── Legacy single-channel noteRows ─────────────────────────────
          const noteH = Math.max(1, Math.min(4, ch / 24));
          const noteW = Math.max(1, pixelsPerBeat);

          for (let rowIdx = 0; rowIdx < clip.noteRows.length; rowIdx++) {
            const note = clip.noteRows[rowIdx];
            if (note < 1 || note > 96) continue; // skip empty and note-off

            const nx = clipBodyLeft + rowIdx * noteW;
            if (nx + noteW < clipBodyLeft || nx > clipBodyRight) continue;

            const midiNote = note - 1; // XM note 1-96 → MIDI 0-95
            const ny = clipBodyTop + clipBodyH * (1 - midiNote / 95) - noteH / 2;

            const drawX = Math.max(clipBodyLeft, nx);
            const drawW = Math.min(clipBodyRight, nx + noteW) - drawX;
            if (drawW <= 0) continue;

            g.rect(drawX, ny, drawW, noteH);
            g.fill({ color: 0xffffff, alpha: 0.25 });
          }
        }
      }
    }

    if (playbackBeat != null) {
      const px = (playbackBeat - scrollBeat) * pixelsPerBeat;
      if (px >= 0 && px <= width) {
        g.rect(px, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.8 });
      }
    }

    // Loop region
    if (loopStart != null && loopEnd != null && loopEnd > loopStart) {
      const lx1 = (loopStart - scrollBeat) * pixelsPerBeat;
      const lx2 = (loopEnd - scrollBeat) * pixelsPerBeat;
      const visW = Math.min(lx2, width) - Math.max(lx1, 0);
      if (visW > 0) {
        const lx = Math.max(lx1, 0);
        // Ruler band
        g.rect(lx, 0, visW, RULER_HEIGHT);
        g.fill({ color: theme.accent.color, alpha: 0.12 });
        g.rect(lx, 0, visW, 3);
        g.fill({ color: theme.accent.color, alpha: 0.55 });
        // Grid band
        g.rect(lx, RULER_HEIGHT, visW, gridHeight);
        g.fill({ color: theme.accent.color, alpha: 0.05 });
      }
      // Loop brackets
      if (lx1 >= 0 && lx1 <= width) {
        g.rect(lx1, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.7 });
      }
      if (lx2 >= 0 && lx2 <= width) {
        g.rect(lx2 - 1, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.7 });
      }
    }

    // Draw markers in the ruler
    for (const marker of markers) {
      const mx = (marker.row - scrollBeat) * pixelsPerBeat;
      if (mx < -4 || mx > width + 4) continue;
      // Vertical line spanning full ruler height
      g.rect(mx, 0, 1, RULER_HEIGHT);
      g.fill({ color: marker.color, alpha: 0.8 });
      // Small downward-pointing chevron at the top: 3 rects approximating an arrow
      g.rect(mx - 3, 2, 7, 2);
      g.fill({ color: marker.color, alpha: 0.8 });
      g.rect(mx - 2, 4, 5, 2);
      g.fill({ color: marker.color, alpha: 0.8 });
      g.rect(mx - 1, 6, 3, 2);
      g.fill({ color: marker.color, alpha: 0.8 });
      // Time sig markers: draw a small "=" indicator below the chevron
      if (marker.timeSig) {
        g.rect(mx + 2, 3, 4, 1);
        g.fill({ color: marker.color, alpha: 0.9 });
        g.rect(mx + 2, 5, 4, 1);
        g.fill({ color: marker.color, alpha: 0.9 });
      }
    }
  }, [width, height, scrollBeat, scrollY, pixelsPerBeat, totalBeats, beatsPerBar, playbackBeat, theme, gridHeight, clips, trackHeight, loopStart, loopEnd, markers]);

  const barLabels = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);
    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      if (beat % beatsPerBar === 0) {
        const x = (beat - scrollBeat) * pixelsPerBeat;
        if (x >= 0 && x <= width) {
          labels.push({ x, text: String(Math.floor(beat / beatsPerBar) + 1) });
        }
      }
    }
    return labels;
  }, [scrollBeat, width, pixelsPerBeat, totalBeats, beatsPerBar]);

  const markerLabels = useMemo(() => {
    return markers
      .map(marker => {
        const x = (marker.row - scrollBeat) * pixelsPerBeat;
        if (x < -50 || x > width + 50) return null;
        // For time sig markers, show the timeSig string (e.g. "3/4") as the label
        const text = marker.timeSig ?? marker.label;
        return { id: marker.id, x, text, color: marker.color, isTimeSig: !!marker.timeSig };
      })
      .filter((m): m is { id: string; x: number; text: string; color: number; isTimeSig: boolean } => m !== null);
  }, [markers, scrollBeat, pixelsPerBeat, width]);

  const clipLabels = useMemo(() => {
    const labels: { id: string; x: number; y: number; text: string; color: number; muted: boolean }[] = [];
    for (const clip of clips) {
      const cx = (clip.startRow - scrollBeat) * pixelsPerBeat;
      const cw = clip.lengthRows * pixelsPerBeat;
      if (cx + cw < 0 || cx > width) continue;
      const cy = RULER_HEIGHT + clip.trackIndex * trackHeight + CLIP_PADDING - scrollY;
      if (cy + trackHeight < RULER_HEIGHT || cy > height) continue;
      if (cw > 30) {
        labels.push({
          id: clip.id,
          x: cx + CLIP_PADDING + 4,
          y: cy + 6,
          text: clip.name.length > 20 ? clip.name.slice(0, 18) + '..' : clip.name,
          color: clip.color,
          muted: clip.muted,
        });
      }
    }
    return labels;
  }, [clips, scrollBeat, scrollY, pixelsPerBeat, width, height, trackHeight]);

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height }} />

      {/* Drag overlay (rubber-band / ghost clips) — drawn imperatively via ref */}
      <pixiGraphics draw={drawNoop} layout={{ position: 'absolute', width, height }} ref={overlayRef} />

      {barLabels.map(({ x, text }) => (
        <pixiBitmapText
          key={`bar-${text}`}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          x={x + 3}
          y={3}
        />
      ))}

      {markerLabels.map(({ id, x, text, color, isTimeSig }) => (
        <pixiBitmapText
          key={`marker-${id}`}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={color}
          x={x + (isTimeSig ? 6 : 3)}
          y={isTimeSig ? 10 : 13}
        />
      ))}

      {clipLabels.map(({ id, x, y, text, color, muted }) => (
        <pixiBitmapText
          key={`clip-${id}`}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={muted ? theme.textMuted.color : color}
          alpha={muted ? 0.5 : 0.9}
          x={x}
          y={y}
        />
      ))}
    </pixiContainer>
  );
};
