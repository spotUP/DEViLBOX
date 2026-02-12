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
import { useArrangementKeyboardShortcuts } from './ArrangementKeyboardShortcuts';

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

  // Click suppression after drag
  const dragClickSuppressRef = useRef(false);

  // Hover state tracking
  const [hoveredClipId, setHoveredClipId] = React.useState<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = React.useState<string | null>(null);

  // Selected automation point (for deletion with Delete key)
  const selectedAutomationPointRef = useRef<{ laneId: string; pointIndex: number } | null>(null);

  // Keyboard shortcuts
  useArrangementKeyboardShortcuts();

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

      // 2c. Track hover highlight (drawn before clips)
      if (hoveredTrackId) {
        const entry = layout.getEntryForTrack(hoveredTrackId);
        if (entry && entry.visible) {
          const y = vp.trackYToScreenY(entry.y);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.03)';
          ctx.fillRect(0, y, w, entry.bodyHeight);
        }
      }

      // 3. Clips
      clipRendererRef.current.render(
        ctx, vp, state.clips, state.tracks, visibleEntries, patterns,
        state.selectedClipIds, rs.ghostClips.length > 0 ? rs.ghostClips : null,
        state.playbackRow, transport.isPlaying, hoveredClipId,
      );

      // 4. Automation curves
      const ism = ismRef.current;
      let activeLaneId: string | null = null;
      let activePointIndex: number | null = null;
      if (ism.state === 'moving-automation-point' && ism.drag) {
        activeLaneId = ism.drag.automationLaneId ?? null;
        activePointIndex = ism.drag.automationPointIndex ?? null;
      }
      autoRendererRef.current.render(ctx, vp, state.automationLanes, visibleEntries, activeLaneId, activePointIndex);

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

      // 6b. Track resize preview
      if (ism.state === 'resizing-track-height' && ism.drag && ism.drag.trackId && ism.drag.startHeight !== undefined) {
        const entry = layout.getEntryForTrack(ism.drag.trackId);
        if (entry) {
          const deltaY = ism.drag.currentY - ism.drag.startY;
          const newHeight = Math.max(30, Math.min(200, ism.drag.startHeight + deltaY));
          const previewY = vp.trackYToScreenY(entry.y + newHeight);

          // Draw preview line at new height
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, previewY);
          ctx.lineTo(w, previewY);
          ctx.stroke();
        }
      }

      // 6c. Snap grid during drag
      if ((ism.state === 'moving-clips' || ism.state === 'drawing-clip' || ism.state === 'resizing-clip-start' || ism.state === 'resizing-clip-end') && state.view.snapDivision > 0) {
        const snap = state.view.snapDivision;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Draw snap grid lines in visible range
        const range = vp.getVisibleRowRange();
        for (let row = Math.floor(range.startRow / snap) * snap; row <= range.endRow; row += snap) {
          const x = vp.rowToPixelX(row);
          if (x >= 0 && x <= w) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h - RULER_HEIGHT);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
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

    // Check automation hit first
    const autoHit = autoRendererRef.current.hitTest(x, y - RULER_HEIGHT, vp, state.automationLanes, layout.getEntries());

    const hit = hitTesterRef.current.hitTest(x, y, vp, layout, RULER_HEIGHT, state.view.loopStart, state.view.loopEnd, autoHit);

    if (hit.type === 'ruler') {
      // Click on ruler = move playhead
      ism.beginDrag('moving-playhead', x, y, hit.row, 0, null, state.selectedClipIds, []);
      useArrangementStore.getState().setPlaybackRow(hit.row);
      useTransportStore.getState().setCurrentGlobalRow(hit.row);
      return;
    }

    if (hit.type === 'loop-start') {
      // Start dragging loop start marker
      const loopEnd = state.view.loopEnd;
      ism.beginDrag('moving-loop-start', x, y, hit.row, 0, null, state.selectedClipIds, []);
      if (ism.drag) {
        ism.drag.loopStart = hit.row;
        ism.drag.loopEnd = loopEnd ?? undefined;
      }
      return;
    }

    if (hit.type === 'loop-end') {
      // Start dragging loop end marker
      const loopStart = state.view.loopStart;
      ism.beginDrag('moving-loop-end', x, y, hit.row, 0, null, state.selectedClipIds, []);
      if (ism.drag) {
        ism.drag.loopStart = loopStart ?? undefined;
        ism.drag.loopEnd = hit.row;
      }
      return;
    }

    if (hit.type === 'track-resize') {
      // Start dragging track height resize
      const entry = layout.getEntryForTrack(hit.trackId);
      if (entry) {
        ism.beginDrag('resizing-track-height', x, y, 0, 0, null, state.selectedClipIds, []);
        if (ism.drag) {
          ism.drag.trackId = hit.trackId;
          ism.drag.startHeight = entry.bodyHeight;
        }
      }
      return;
    }

    if (hit.type === 'automation-point') {
      // Select automation point
      selectedAutomationPointRef.current = { laneId: hit.laneId, pointIndex: hit.pointIndex };

      // Start dragging automation point
      const lane = state.automationLanes.find(l => l.id === hit.laneId);
      if (lane && lane.points[hit.pointIndex]) {
        const point = lane.points[hit.pointIndex];
        ism.beginDrag('moving-automation-point', x, y, 0, 0, null, state.selectedClipIds, []);
        if (ism.drag) {
          ism.drag.automationLaneId = hit.laneId;
          ism.drag.automationPointIndex = hit.pointIndex;
          ism.drag.automationStartValue = point.value;
          ism.drag.automationStartRow = point.row;
        }
      }
      return;
    }

    if (hit.type === 'automation-segment') {
      // Add new automation point
      const newPoint = {
        row: hit.row,
        value: hit.value,
        curve: 'linear' as const,
      };
      state.addAutomationPoint(hit.laneId, newPoint);

      // Start dragging the newly added point
      const lane = state.automationLanes.find(l => l.id === hit.laneId);
      if (lane) {
        const newIndex = hit.insertAfterIndex + 1;
        ism.beginDrag('moving-automation-point', x, y, 0, 0, null, state.selectedClipIds, []);
        if (ism.drag) {
          ism.drag.automationLaneId = hit.laneId;
          ism.drag.automationPointIndex = newIndex;
          ism.drag.automationStartValue = hit.value;
          ism.drag.automationStartRow = hit.row;
        }
      }
      return;
    }

    if (ism.tool === 'select') {
      if (hit.type === 'clip') {
        if (hit.zone === 'body') {
          // Cmd/Ctrl+Click: Toggle selection
          if (e.metaKey || e.ctrlKey) {
            state.selectClip(hit.clipId, true); // Toggle
            return; // Don't start drag on Cmd+Click
          }

          // Shift+Click: Add to selection
          if (e.shiftKey) {
            state.selectClip(hit.clipId, true);
          } else if (!state.selectedClipIds.has(hit.clipId)) {
            // Regular click on unselected clip - select it
            state.selectClip(hit.clipId);
          }

          // Alt+Drag: Duplicate selected clips
          if (e.altKey) {
            const selected = useArrangementStore.getState().selectedClipIds;
            const newIds = state.duplicateClips([...selected]);

            // Select the duplicates instead
            state.clearSelection();
            state.selectClips(newIds);

            // Start dragging the duplicates
            const duplicatedClips = state.clips.filter(c => newIds.includes(c.id));
            ism.beginDrag('moving-clips', x, y, hit.row, 0, newIds[0], new Set(newIds), duplicatedClips);
            editCmdRef.current.begin(state.getSnapshot(), 'Duplicate and move clips');
          } else {
            // Normal drag
            const selected = useArrangementStore.getState().selectedClipIds;
            const originalClips = state.clips.filter(c => selected.has(c.id));
            ism.beginDrag('moving-clips', x, y, hit.row, 0, hit.clipId, selected, originalClips);
            editCmdRef.current.begin(state.getSnapshot(), 'Move clips');
          }
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
        const { deltaRow, deltaTrackIndex } = ism.getDragDelta(vp.pixelsPerRow, 80);
        const snappedDelta = Math.round(deltaRow / snap) * snap;

        // Calculate target tracks for vertical movement
        const tracksByIndex = [...state.tracks].sort((a, b) => a.index - b.index);

        // Ghost clips preview (with both horizontal and vertical movement)
        const ghosts = ism.drag.originalClips.map(c => {
          const currentTrack = state.tracks.find(t => t.id === c.trackId);
          let newTrackId = c.trackId;

          if (currentTrack && deltaTrackIndex !== 0) {
            const newIdx = Math.max(0, Math.min(tracksByIndex.length - 1, currentTrack.index + deltaTrackIndex));
            const newTrack = tracksByIndex[newIdx];
            if (newTrack) newTrackId = newTrack.id;
          }

          return {
            ...c,
            startRow: Math.max(0, c.startRow + snappedDelta),
            trackId: newTrackId,
          };
        });
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
      } else if (ism.state === 'moving-automation-point' && ism.drag && ism.drag.automationLaneId && ism.drag.automationPointIndex !== undefined) {
        // Move automation point
        const newRow = Math.max(0, Math.round(vp.pixelXToRow(x)));

        // Find the lane and entry to calculate value from Y position
        const lane = state.automationLanes.find(l => l.id === ism.drag!.automationLaneId);
        if (lane) {
          const entry = layout.getEntryForTrack(lane.trackId);
          if (entry) {
            // Find lane index within track
            const trackLanes = state.automationLanes.filter(l => l.trackId === lane.trackId && l.visible && l.enabled);
            const laneIndex = trackLanes.findIndex(l => l.id === lane.id);
            if (laneIndex >= 0) {
              const AUTOMATION_LANE_HEIGHT = 40;
              const laneY = vp.trackYToScreenY(entry.automationY) + laneIndex * AUTOMATION_LANE_HEIGHT;
              const laneH = AUTOMATION_LANE_HEIGHT;
              const newValue = Math.max(0, Math.min(1, (laneY + laneH - (y - RULER_HEIGHT)) / laneH));

              state.moveAutomationPoint(ism.drag.automationLaneId, ism.drag.automationPointIndex, newRow, newValue);
            }
          }
        }
      }
      // No need to update hover state during drag
    } else {
      // Hover - update cursor and hover state
      const state = useArrangementStore.getState();

      // Check automation hit first
      const autoHit = autoRendererRef.current.hitTest(x, y - RULER_HEIGHT, vp, state.automationLanes, layout.getEntries());

      const hit = hitTesterRef.current.hitTest(x, y, vp, layout, RULER_HEIGHT, state.view.loopStart, state.view.loopEnd, autoHit);
      ism.updateCursor(hit);

      // Update hovered clip
      if (hit.type === 'clip' && hit.clipId !== hoveredClipId) {
        setHoveredClipId(hit.clipId);
      } else if (hit.type !== 'clip' && hoveredClipId !== null) {
        setHoveredClipId(null);
      }

      // Update hovered track
      const newHoveredTrackId = hit.type === 'empty' || hit.type === 'clip' || hit.type === 'track-resize'
        ? (hit.type === 'track-resize' ? hit.trackId : ('trackId' in hit ? hit.trackId : null))
        : null;
      if (newHoveredTrackId !== hoveredTrackId) {
        setHoveredTrackId(newHoveredTrackId);
      }
    }

    dirtyRef.current = true;
  }, [getCanvasPos, hoveredClipId, hoveredTrackId]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const ism = ismRef.current;
    const state = useArrangementStore.getState();

    if (ism.state === 'moving-clips' && ism.drag) {
      const snap = state.view.snapDivision || 1;
      const { deltaRow, deltaTrackIndex } = ism.getDragDelta(vpRef.current.pixelsPerRow, 80);
      const snappedDelta = Math.round(deltaRow / snap) * snap;

      if (snappedDelta !== 0 || deltaTrackIndex !== 0) {
        state.moveClips([...state.selectedClipIds], snappedDelta, deltaTrackIndex);
        editCmdRef.current.commit((snap) => state.pushUndo(snap));
        // Suppress click after drag
        dragClickSuppressRef.current = true;
        setTimeout(() => { dragClickSuppressRef.current = false; }, 100);
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
    } else if (ism.state === 'resizing-track-height' && ism.drag) {
      // Commit track height change
      const { trackId, startHeight } = ism.drag;
      if (trackId && startHeight !== undefined) {
        const deltaY = ism.drag.currentY - ism.drag.startY;
        const newHeight = Math.max(30, Math.min(200, startHeight + deltaY));
        state.setTrackHeight(trackId, newHeight);
      }
    } else if (ism.state === 'moving-loop-start' && ism.drag) {
      // Commit loop start change
      const { loopEnd } = ism.drag;
      const vp = vpRef.current;
      const snap = state.view.snapDivision || 1;
      const newLoopStart = vp.snapRow(vp.pixelXToRow(ism.drag.currentX), snap);
      state.setLoopRegion(newLoopStart, loopEnd ?? null);
    } else if (ism.state === 'moving-loop-end' && ism.drag) {
      // Commit loop end change
      const { loopStart } = ism.drag;
      const vp = vpRef.current;
      const snap = state.view.snapDivision || 1;
      const newLoopEnd = vp.snapRow(vp.pixelXToRow(ism.drag.currentX), snap);
      state.setLoopRegion(loopStart ?? null, newLoopEnd);
    } else if (ism.state === 'moving-automation-point') {
      // Automation point move already committed during drag via moveAutomationPoint
      // No additional action needed on mouse up
    }

    ism.endDrag();
    dirtyRef.current = true;
  }, [getCanvasPos]);

  // Double-click handler - open pattern in tracker view
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (dragClickSuppressRef.current) {
      dragClickSuppressRef.current = false;
      return;
    }

    const { x, y } = getCanvasPos(e);
    const vp = vpRef.current;
    const layout = layoutRef.current;
    const state = useArrangementStore.getState();
    const hit = hitTesterRef.current.hitTest(x, y, vp, layout, RULER_HEIGHT, state.view.loopStart, state.view.loopEnd);

    if (hit.type === 'clip') {
      const state = useArrangementStore.getState();
      const clip = state.clips.find(c => c.id === hit.clipId);
      if (!clip) return;

      // Switch to tracker view
      const uiStore = require('@stores/useUIStore').useUIStore.getState();
      uiStore.setActiveView('tracker');

      // Find pattern index and set as current
      const patterns = useTrackerStore.getState().patterns;
      const patternIndex = patterns.findIndex(p => p.id === clip.patternId);
      if (patternIndex >= 0) {
        useTrackerStore.getState().setCurrentPattern(patternIndex);
      }
    }
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

  // Keyboard handler for deleting automation points
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = selectedAutomationPointRef.current;
        if (selected) {
          const state = useArrangementStore.getState();
          state.removeAutomationPoint(selected.laneId, selected.pointIndex);
          selectedAutomationPointRef.current = null;
          dirtyRef.current = true;
          e.preventDefault();
        }
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      // Make canvas focusable and focus it
      canvas.tabIndex = 0;
      canvas.addEventListener('keydown', handleKeyDown);
      return () => canvas.removeEventListener('keydown', handleKeyDown);
    }
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
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
};
