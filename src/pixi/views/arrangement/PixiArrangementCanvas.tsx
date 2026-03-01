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
import type { ArrangementToolMode } from '@/types/arrangement';

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
}) => {
  const theme = usePixiTheme();
  const gridHeight = height - RULER_HEIGHT;

  // Keep latest params/callbacks in refs so drag handlers don't go stale
  const paramsRef = useRef({ scrollBeat, pixelsPerBeat, trackHeight, scrollY, clips, tool, snapDivision, width, height, theme });
  paramsRef.current = { scrollBeat, pixelsPerBeat, trackHeight, scrollY, clips, tool, snapDivision, width, height, theme };

  const callbacksRef = useRef({ onSelectClip, onDeselectAll, onSelectBox, onMoveClips, onResizeClipEnd, onAddClip, onDeleteClip, onSplitClip, onOpenInPianoRoll });
  callbacksRef.current = { onSelectClip, onDeselectAll, onSelectBox, onMoveClips, onResizeClipEnd, onAddClip, onDeleteClip, onSplitClip, onOpenInPianoRoll };

  // Double-click detection for select tool
  const lastClickRef = useRef<{ time: number; clipId: string }>({ time: 0, clipId: '' });

  const dragRef = useRef<DragState | null>(null);
  const overlayRef = useRef<GraphicsType | null>(null);

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

      const snappedFirstRow = snapRow(drag.originalClips[0].startRow + rawDeltaRow, snap);
      const dr = snappedFirstRow - drag.originalClips[0].startRow;
      const dt = Math.round(rawDeltaTrack);

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
      const newEndRow = Math.max(orig.startRow + 1, snapRow(rawEndRow, snap));
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
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.fill({ color: 0x4a9eff, alpha: 0.35 });
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.stroke({ color: 0x4a9eff, alpha: 0.85, width: 1 });
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
          cbs.onOpenInPianoRoll?.(hit.id);
          lastClickRef.current = { time: 0, clipId: '' };
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
        const snappedFirstRow = snapRow(drag.originalClips[0].startRow + rawDeltaRow, snap2);
        const dr = snappedFirstRow - drag.originalClips[0].startRow;
        const dt = Math.round((currentLocalY - drag.startLocalY) / th2);
        if (dr !== 0 || dt !== 0) {
          cbs2.onMoveClips?.(drag.originalClips.map(c => c.id), dr, dt);
        }
        return;
      }

      if (drag.mode === 'resize-end') {
        const orig = drag.originalClips[0];
        if (!orig) return;
        const rawEndRow = sb2 + currentLocalX / ppb2;
        const newEndRow = Math.max(orig.startRow + 1, snapRow(rawEndRow, snap2));
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
    }

    if (playbackBeat != null) {
      const px = (playbackBeat - scrollBeat) * pixelsPerBeat;
      if (px >= 0 && px <= width) {
        g.rect(px, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.8 });
      }
    }
  }, [width, height, scrollBeat, scrollY, pixelsPerBeat, totalBeats, beatsPerBar, playbackBeat, theme, gridHeight, clips, trackHeight]);

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
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          x={x + 3}
          y={3}
        />
      ))}

      {clipLabels.map(({ id, x, y, text, color, muted }) => (
        <pixiBitmapText
          key={`clip-${id}`}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={muted ? theme.textMuted.color : color}
          alpha={muted ? 0.5 : 0.9}
          x={x}
          y={y}
        />
      ))}
    </pixiContainer>
  );
};
