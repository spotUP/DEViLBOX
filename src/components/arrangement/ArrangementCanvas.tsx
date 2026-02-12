/**
 * ArrangementCanvas - Main canvas component with RAF render loop
 *
 * Renders clips, grid, automation, playhead, selection box, and ghost clips.
 * Uses same RAF + dirty flag pattern as PianoRollCanvas.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores';
import { ArrangementViewport } from './engine/ArrangementViewport';
import { TrackLayout } from './engine/TrackLayout';
import { ArrangementGridRenderer } from './engine/ArrangementGridRenderer';
import { ClipRenderer } from './engine/ClipRenderer';
import { TimelineRulerRenderer } from './engine/TimelineRulerRenderer';
import { ArrangementHitTester } from './engine/ArrangementHitTester';
import { ArrangementInteractionSM } from './engine/ArrangementInteractionSM';
import { ArrangementEditCommand } from './engine/ArrangementEditCommand';
import { AutomationLaneRenderer } from './engine/AutomationLaneRenderer';

const RULER_HEIGHT = 36;

export const ArrangementCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dirtyRef = useRef(true);

  // Engine refs (plain TS classes, not React state)
  const vpRef = useRef(new ArrangementViewport());
  const layoutRef = useRef(new TrackLayout());
  const gridRef = useRef(new ArrangementGridRenderer());
  const clipRendererRef = useRef(new ClipRenderer());
  const rulerRef = useRef(new TimelineRulerRenderer());
  const hitTesterRef = useRef(new ArrangementHitTester());
  const ismRef = useRef(new ArrangementInteractionSM());
  const editCmdRef = useRef(new ArrangementEditCommand());
  const autoRendererRef = useRef(new AutomationLaneRenderer());

  // Mark dirty on any store change
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);

  // Subscribe to stores
  useEffect(() => {
    let prevTool = useArrangementStore.getState().tool;
    let prevPatterns = useTrackerStore.getState().patterns;

    const unsubs = [
      useArrangementStore.subscribe((state) => {
        // Sync tool state from store to ISM
        if (state.tool !== prevTool) {
          prevTool = state.tool;
          ismRef.current.setTool(state.tool);
        }
        markDirty();
      }),
      useTransportStore.subscribe(markDirty),
      // Invalidate clip preview cache when pattern data changes
      useTrackerStore.subscribe((state) => {
        if (state.patterns !== prevPatterns) {
          prevPatterns = state.patterns;
          clipRendererRef.current.invalidateCache();
          markDirty();
        }
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [markDirty]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        vpRef.current.update({ width, height: height - RULER_HEIGHT });
        dirtyRef.current = true;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // RAF render loop
  useEffect(() => {
    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check ISM for dirty flag too
      const rs = ismRef.current.getRenderState();
      if (!dirtyRef.current && !rs.dirty) return;
      dirtyRef.current = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const state = useArrangementStore.getState();
      const transport = useTransportStore.getState();
      const patterns = useTrackerStore.getState().patterns;

      const vp = vpRef.current;
      const layout = layoutRef.current;

      // Follow-playback auto-scroll
      if (state.view.followPlayback && state.isArrangementMode && transport.isPlaying) {
        const playheadX = (state.playbackRow - state.view.scrollRow) * state.view.pixelsPerRow;
        const canvasW = canvas.getBoundingClientRect().width;
        if (playheadX > canvasW * 0.8 || playheadX < 0) {
          // Scroll to keep playhead at 20% from left
          state.setScrollRow(Math.max(0, state.playbackRow - canvasW * 0.2 / state.view.pixelsPerRow));
        }
      }

      // Update viewport from store
      vp.update({
        scrollRow: state.view.scrollRow,
        scrollY: state.view.scrollY,
        pixelsPerRow: state.view.pixelsPerRow,
      });

      // Rebuild track layout
      layout.rebuild(state.tracks, state.groups, state.automationLanes);

      // Rebuild hit tester
      hitTesterRef.current.rebuild(state.clips, state.tracks, patterns, vp, layout);

      // Set canvas buffer size
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== Math.ceil(w * dpr) || canvas.height !== Math.ceil(h * dpr)) {
        canvas.width = Math.ceil(w * dpr);
        canvas.height = Math.ceil(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const visibleEntries = layout.getVisibleEntries(state.view.scrollY, h - RULER_HEIGHT);
      const speed = transport.speed || 6;
      const beatsPerBar = transport.timeSignature[0] || 4;
      const totalRows = state.getTotalRows();

      // 1. Ruler
      const rulerCanvas = rulerRef.current.render(
        vp, speed, beatsPerBar, state.markers,
        state.view.loopStart, state.view.loopEnd, dpr,
      );
      if (rulerCanvas) {
        ctx.drawImage(rulerCanvas, 0, 0, w, RULER_HEIGHT);
      }

      // Translate for content area below ruler
      ctx.save();
      ctx.translate(0, RULER_HEIGHT);

      // 2. Grid
      const gridCanvas = gridRef.current.render(
        vp, visibleEntries, speed, beatsPerBar, totalRows, dpr,
      );
      if (gridCanvas) {
        ctx.drawImage(gridCanvas, 0, 0, w, h - RULER_HEIGHT);
      }

      // 2b. Loop region overlay
      if (state.view.loopStart !== null && state.view.loopEnd !== null && state.view.loopEnd > state.view.loopStart) {
        const lx = vp.rowToPixelX(state.view.loopStart);
        const lw = (state.view.loopEnd - state.view.loopStart) * vp.pixelsPerRow;
        ctx.fillStyle = 'rgba(34,197,94,0.06)';
        ctx.fillRect(lx, 0, lw, h - RULER_HEIGHT);
      }

      // 3. Clips
      clipRendererRef.current.render(
        ctx, vp, state.clips, state.tracks, visibleEntries, patterns,
        state.selectedClipIds, rs.ghostClips.length > 0 ? rs.ghostClips : null,
      );

      // 4. Automation curves
      autoRendererRef.current.render(ctx, vp, state.automationLanes, visibleEntries);

      // 5. Selection box
      if (rs.selectionBox) {
        const { x1, y1, x2, y2 } = rs.selectionBox;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          Math.min(x1, x2),
          Math.min(y1, y2) - RULER_HEIGHT,
          Math.abs(x2 - x1),
          Math.abs(y2 - y1),
        );
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(59,130,246,0.08)';
        ctx.fillRect(
          Math.min(x1, x2),
          Math.min(y1, y2) - RULER_HEIGHT,
          Math.abs(x2 - x1),
          Math.abs(y2 - y1),
        );
      }

      // 6. Draw preview
      if (rs.drawPreview) {
        const entry = layout.getEntryForTrack(rs.drawPreview.trackId);
        if (entry && entry.visible) {
          const px = vp.rowToPixelX(rs.drawPreview.startRow);
          const pw = (rs.drawPreview.endRow - rs.drawPreview.startRow) * vp.pixelsPerRow;
          const py = vp.trackYToScreenY(entry.y);
          ctx.fillStyle = 'rgba(59,130,246,0.2)';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1;
          ctx.fillRect(px, py, pw, entry.bodyHeight);
          ctx.strokeRect(px, py, pw, entry.bodyHeight);
        }
      }

      // 7. Playhead (in content area)
      if (state.isArrangementMode) {
        const playheadX = vp.rowToPixelX(state.playbackRow);
        if (playheadX >= -2 && playheadX <= w + 2) {
          // Subtle glow
          ctx.fillStyle = 'rgba(239,68,68,0.15)';
          ctx.fillRect(playheadX - 3, 0, 8, h - RULER_HEIGHT);

          // Main playhead line
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(playheadX, 0, 2, h - RULER_HEIGHT);
        }
      }

      ctx.restore();

      // 8. Playhead marker on ruler (drawn in ruler space, above content)
      if (state.isArrangementMode) {
        const playheadX = vp.rowToPixelX(state.playbackRow);
        if (playheadX >= -6 && playheadX <= w + 6) {
          // Triangle marker at bottom of ruler
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(playheadX + 1, RULER_HEIGHT);
          ctx.lineTo(playheadX - 5, RULER_HEIGHT - 7);
          ctx.lineTo(playheadX + 7, RULER_HEIGHT - 7);
          ctx.closePath();
          ctx.fill();

          // Thin line through ruler
          ctx.fillStyle = 'rgba(239,68,68,0.5)';
          ctx.fillRect(playheadX, 0, 1, RULER_HEIGHT);
        }
      }

      // Update cursor
      if (canvas.style.cursor !== rs.cursor) {
        canvas.style.cursor = rs.cursor;
      }
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Mouse handlers
  const getCanvasPos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasPos(e);
    const vp = vpRef.current;
    const layout = layoutRef.current;
    const ism = ismRef.current;
    const state = useArrangementStore.getState();

    const hit = hitTesterRef.current.hitTest(x, y, vp, layout, RULER_HEIGHT);

    if (hit.type === 'ruler') {
      // Click on ruler = move playhead
      ism.beginDrag('moving-playhead', x, y, hit.row, 0, null, state.selectedClipIds, []);
      useArrangementStore.getState().setPlaybackRow(hit.row);
      useTransportStore.getState().setCurrentGlobalRow(hit.row);
      return;
    }

    if (ism.tool === 'select') {
      if (hit.type === 'clip') {
        if (hit.zone === 'body') {
          // Select + begin move
          if (!e.shiftKey && !state.selectedClipIds.has(hit.clipId)) {
            state.selectClip(hit.clipId);
          } else if (e.shiftKey) {
            state.selectClip(hit.clipId, true);
          }

          const selected = useArrangementStore.getState().selectedClipIds;
          const originalClips = state.clips.filter(c => selected.has(c.id));
          ism.beginDrag('moving-clips', x, y, hit.row, 0, hit.clipId, selected, originalClips);

          // Push undo before move
          editCmdRef.current.begin(state.getSnapshot(), 'Move clips');
        } else if (hit.zone === 'resize-start') {
          state.selectClip(hit.clipId);
          ism.beginDrag('resizing-clip-start', x, y, hit.row, 0, hit.clipId, state.selectedClipIds, []);
          editCmdRef.current.begin(state.getSnapshot(), 'Resize clip start');
        } else if (hit.zone === 'resize-end') {
          state.selectClip(hit.clipId);
          ism.beginDrag('resizing-clip-end', x, y, hit.row, 0, hit.clipId, state.selectedClipIds, []);
          editCmdRef.current.begin(state.getSnapshot(), 'Resize clip end');
        }
      } else if (hit.type === 'empty') {
        // Start selection box
        if (!e.shiftKey) state.clearSelection();
        ism.beginDrag('select-box', x, y, hit.row, hit.trackIndex, null, state.selectedClipIds, []);
      }
    } else if (ism.tool === 'draw') {
      if (hit.type === 'empty') {
        // Start drawing a clip
        const snap = state.view.snapDivision || 1;
        const snappedRow = vp.snapRow(hit.row, snap);
        ism.beginDrag('drawing-clip', x, y, snappedRow, hit.trackIndex, null, state.selectedClipIds, []);
        ism.setDrawPreview({ trackId: hit.trackId, startRow: snappedRow, endRow: snappedRow + snap });
      }
    } else if (ism.tool === 'erase') {
      if (hit.type === 'clip') {
        editCmdRef.current.begin(state.getSnapshot(), 'Erase clip');
        state.removeClip(hit.clipId);
        editCmdRef.current.commit((snap) => useArrangementStore.getState().pushUndo(snap));
      }
    } else if (ism.tool === 'split') {
      if (hit.type === 'clip') {
        const snap = state.view.snapDivision || 1;
        const splitRow = vp.snapRow(hit.row, snap);
        editCmdRef.current.begin(state.getSnapshot(), 'Split clip');
        state.splitClip(hit.clipId, splitRow);
        editCmdRef.current.commit((snap) => useArrangementStore.getState().pushUndo(snap));
      }
    }

    dirtyRef.current = true;
  }, [getCanvasPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasPos(e);
    const vp = vpRef.current;
    const layout = layoutRef.current;
    const ism = ismRef.current;

    if (ism.state !== 'idle' && ism.drag) {
      ism.updateDrag(x, y);
      const state = useArrangementStore.getState();
      const snap = state.view.snapDivision || 1;

      if (ism.state === 'moving-clips') {
        const { deltaRow } = ism.getDragDelta(vp.pixelsPerRow, 60);
        const snappedDelta = Math.round(deltaRow / snap) * snap;
        // Ghost clips preview
        const ghosts = ism.drag.originalClips.map(c => ({
          ...c,
          startRow: Math.max(0, c.startRow + snappedDelta),
        }));
        ism.setGhostClips(ghosts);
      } else if (ism.state === 'select-box') {
        ism.setSelectionBox({ x1: ism.drag.startX, y1: ism.drag.startY, x2: x, y2: y });
        // Find clips in box
        const clipIds = hitTesterRef.current.findClipsInRect(
          ism.drag.startX, ism.drag.startY - RULER_HEIGHT,
          x, y - RULER_HEIGHT,
        );
        state.selectClips(clipIds);
      } else if (ism.state === 'drawing-clip') {
        const currentRow = Math.max(0, vp.snapRow(vp.pixelXToRow(x), snap));
        const startRow = ism.drag.startRow;
        ism.setDrawPreview({
          trackId: '', // Will be filled from hit test
          startRow: Math.min(startRow, currentRow),
          endRow: Math.max(startRow + snap, currentRow),
        });
      } else if (ism.state === 'resizing-clip-end') {
        const newRow = Math.max(1, vp.snapRow(vp.pixelXToRow(x), snap));
        if (ism.drag.targetClipId) {
          state.resizeClipEnd(ism.drag.targetClipId, newRow);
        }
      } else if (ism.state === 'resizing-clip-start') {
        const newRow = Math.max(0, vp.snapRow(vp.pixelXToRow(x), snap));
        if (ism.drag.targetClipId) {
          state.resizeClipStart(ism.drag.targetClipId, newRow);
        }
      } else if (ism.state === 'moving-playhead') {
        const row = Math.max(0, Math.round(vp.pixelXToRow(x)));
        state.setPlaybackRow(row);
        useTransportStore.getState().setCurrentGlobalRow(row);
      }
    } else {
      // Hover - update cursor
      const hit = hitTesterRef.current.hitTest(x, y, vp, layout, RULER_HEIGHT);
      ism.updateCursor(hit);
    }

    dirtyRef.current = true;
  }, [getCanvasPos]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const ism = ismRef.current;
    const state = useArrangementStore.getState();

    if (ism.state === 'moving-clips' && ism.drag) {
      const snap = state.view.snapDivision || 1;
      const { deltaRow } = ism.getDragDelta(vpRef.current.pixelsPerRow, 60);
      const snappedDelta = Math.round(deltaRow / snap) * snap;
      if (snappedDelta !== 0) {
        state.moveClips([...state.selectedClipIds], snappedDelta, 0);
        editCmdRef.current.commit((snap) => state.pushUndo(snap));
      } else {
        editCmdRef.current.cancel();
      }
    } else if (ism.state === 'drawing-clip' && ism.drag) {
      // Create clip at draw location
      const vp = vpRef.current;
      const snap = state.view.snapDivision || 1;
      const currentRow = Math.max(0, vp.snapRow(vp.pixelXToRow(getCanvasPos(e).x), snap));
      const startRow = Math.min(ism.drag.startRow, currentRow);
      const endRow = Math.max(ism.drag.startRow + snap, currentRow);

      // Find which track was targeted
      const hitY = vp.screenYToTrackY(getCanvasPos(e).y - RULER_HEIGHT);
      const trackHit = layoutRef.current.hitTestY(hitY);

      if (trackHit) {
        const patterns = useTrackerStore.getState().patterns;
        if (patterns.length > 0) {
          editCmdRef.current.begin(state.getSnapshot(), 'Draw clip');
          state.addClip({
            patternId: patterns[0].id,
            trackId: trackHit.trackId,
            startRow,
            offsetRows: 0,
            clipLengthRows: endRow - startRow,
            sourceChannelIndex: 0,
            color: null,
            muted: false,
          });
          editCmdRef.current.commit((snap) => state.pushUndo(snap));
        }
      }
    } else if (ism.state === 'resizing-clip-start' || ism.state === 'resizing-clip-end') {
      editCmdRef.current.commit((snap) => state.pushUndo(snap));
    }

    ism.endDrag();
    dirtyRef.current = true;
  }, [getCanvasPos]);

  // Window-level mouseup to handle drags that leave the canvas
  useEffect(() => {
    const handleWindowMouseUp = () => {
      const ism = ismRef.current;
      if (ism.state !== 'idle') {
        ism.endDrag();
        dirtyRef.current = true;
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  // Wheel handler - use native listener with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useArrangementStore.getState();

      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        state.setPixelsPerRow(Math.max(0.5, Math.min(32, state.view.pixelsPerRow * factor)));
      } else if (e.shiftKey) {
        // Horizontal scroll
        state.setScrollRow(Math.max(0, state.view.scrollRow + e.deltaY / state.view.pixelsPerRow));
      } else {
        // Vertical scroll
        state.setScrollY(Math.max(0, state.view.scrollY + e.deltaY));
      }

      dirtyRef.current = true;
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
};
