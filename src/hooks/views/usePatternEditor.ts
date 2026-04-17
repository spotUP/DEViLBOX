// src/hooks/views/usePatternEditor.ts
/**
 * usePatternEditor — Shared logic hook for PatternEditorCanvas.
 *
 * The view calls this hook and keeps only renderer-specific markup.
 *
 * Shared:
 *  - TrackerStore slice (pattern, patterns, actions)
 *  - EditorStore (showGhostPatterns, columnVisibility, recordMode)
 *  - channelMuted / channelSolo derived arrays
 *  - trackerZoom → rowHeight + rowHeightRef
 *  - Cursor/selection refs (init from useCursorStore.getState())
 *  - Collaboration peer cursor/selection effects (subscribe + broadcast)
 *  - useBDAnimations
 *  - Channel layout useMemo (non-format mode path)
 *
 * NOT shared (kept in each view):
 *  - DOM: format mode state/refs, mobile gestures, OffscreenBridge, DOM refs,
 *         showChannelNames, showAutomationLanes, showMacroLanes, useInstrumentStore
 *  - Pixi: Pixi refs (Graphics, MegaText, etc.), useTick, usePixiTheme,
 *          smooth scroll, Pixi context menu, viewport width/height
 */

import { useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useTrackerStore,
  useCursorStore,
  useEditorStore,
  useAutomationStore,
} from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useCollaborationStore, getCollabClient } from '@stores/useCollaborationStore';
import { useBDAnimations } from '@hooks/tracker/useBDAnimations';
import type { CursorPosition, BlockSelection } from '@typedefs';

// ─── Layout constants (must match PatternEditorCanvas) ───
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
export const AUTOMATION_LANE_WIDTH = 56; // base width for a single automation lane
// Minimum per-lane width when multiple lanes share space.
// Set to ~LANE_WIDTH so each lane in a multi-lane channel gets its own full
// dedicated draw width instead of being squeezed into the single-lane area.
export const AUTOMATION_LANE_MIN = 52;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePatternEditor() {
  // ── TrackerStore slice ────────────────────────────────────────────────────
  const {
    pattern,
    patterns,
    currentPatternIndex,
    addChannel,
    toggleChannelMute,
    toggleChannelSolo,
    toggleChannelCollapse,
    setChannelColor,
    updateChannelName,
    setCell,
    copyTrack,
    cutTrack,
    pasteTrack,
  } = useTrackerStore(useShallow((s) => ({
    pattern: s.patterns[s.currentPatternIndex],
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    addChannel: s.addChannel,
    toggleChannelMute: s.toggleChannelMute,
    toggleChannelSolo: s.toggleChannelSolo,
    toggleChannelCollapse: s.toggleChannelCollapse,
    setChannelColor: s.setChannelColor,
    updateChannelName: s.updateChannelName,
    setCell: s.setCell,
    copyTrack: s.copyTrack,
    cutTrack: s.cutTrack,
    pasteTrack: s.pasteTrack,
  })));

  // ── EditorStore ───────────────────────────────────────────────────────────
  const showGhostPatterns = useEditorStore((s) => s.showGhostPatterns);
  const columnVisibility = useEditorStore((s) => s.columnVisibility);
  const recordMode = useEditorStore((s) => s.recordMode);

  // ── Muted / solo arrays — separate useShallow to avoid infinite re-render ─
  // .map() always returns a new array; inside a combined useShallow object
  // Zustand compares by reference → always changed → infinite loop.
  const channelMuted = useTrackerStore(useShallow((s) =>
    (s.patterns[s.currentPatternIndex]?.channels ?? []).map((ch) => ch.muted)));
  const channelSolo = useTrackerStore(useShallow((s) =>
    (s.patterns[s.currentPatternIndex]?.channels ?? []).map((ch) => ch.solo)));

  // ── Transport ─────────────────────────────────────────────────────────────
  const isPlaying = useTransportStore((s) => s.isPlaying);

  // ── UI / display settings ─────────────────────────────────────────────────
  const trackerZoom = useUIStore((s) => s.trackerZoom);
  const trackWidthZoom = useUIStore((s) => s.trackWidthZoom);
  const showAutomationLanes = useUIStore((s) => s.showAutomationLanes);
  const rowHeight = Math.round(24 * (trackerZoom / 100));

  // Per-channel automation lane count (for multi-lane width allocation)
  // Counts both explicitly active params AND params with existing curve data
  const channelLaneCounts = useAutomationStore(useShallow((s) => {
    if (!showAutomationLanes) return [] as number[];
    const nc = pattern?.channels.length ?? 0;
    const patId = pattern?.id ?? '';
    const counts: number[] = [];
    for (let ch = 0; ch < nc; ch++) {
      const lane = s.channelLanes.get(ch);
      const explicit = new Set<string>();
      if (lane?.activeParameters?.length) {
        lane.activeParameters.forEach(p => explicit.add(p));
      } else if (lane?.activeParameter) {
        explicit.add(lane.activeParameter);
      }
      // Also count params that have curves with data
      for (const c of s.curves) {
        if (c.patternId === patId && c.channelIndex === ch && c.points.length > 0) {
          explicit.add(c.parameter);
        }
      }
      counts.push(Math.max(1, explicit.size));
    }
    return counts;
  }));

  // Ref-tracked row height for hot loops (avoids restarting effects on zoom change)
  const rowHeightRef = useRef(rowHeight);
  useEffect(() => { rowHeightRef.current = rowHeight; }, [rowHeight]);

  const trackerVisualBg = useSettingsStore((s) => s.trackerVisualBg);

  // ── Cursor / selection refs ───────────────────────────────────────────────
  // PERF: Keep in refs, updated via subscription — never React state.
  // Cursor changes are the hottest path (every keypress). React state would
  // cause 30-50 fps drops from excess reconciliation.
  const cursorRef = useRef<CursorPosition>(useCursorStore.getState().cursor);
  const selectionRef = useRef<BlockSelection | null>(useCursorStore.getState().selection);

  useEffect(() => {
    const unsub = useCursorStore.subscribe((state) => {
      cursorRef.current = state.cursor;
      selectionRef.current = state.selection;
    });
    return unsub;
  }, []);

  // ── Collaboration — peer cursor/selection refs ────────────────────────────
  const peerCursorRef = useRef({ row: 0, channel: 0, active: false, patternIndex: -1 });
  const peerSelectionRef = useRef<{
    startChannel: number; endChannel: number;
    startRow: number; endRow: number;
    patternIndex: number;
  } | null>(null);

  useEffect(() => {
    const unsub = useCollaborationStore.subscribe((state) => {
      peerCursorRef.current = {
        row: state.peerCursorRow,
        channel: state.peerCursorChannel,
        active: state.status === 'connected' && state.listenMode === 'shared',
        patternIndex: state.peerPatternIndex,
      };
      peerSelectionRef.current = (state.status === 'connected' && state.listenMode === 'shared')
        ? state.peerSelection : null;
    });
    return unsub;
  }, []);

  // Broadcast local selection changes to peer
  useEffect(() => {
    const unsub = useCursorStore.subscribe((state, prev) => {
      if (state.selection === prev.selection) return;
      if (useCollaborationStore.getState().status !== 'connected') return;
      const sel = state.selection;
      if (sel) {
        getCollabClient()?.send({
          type: 'peer_selection',
          patternIndex: useTrackerStore.getState().currentPatternIndex,
          startChannel: sel.startChannel, endChannel: sel.endChannel,
          startRow: sel.startRow, endRow: sel.endRow,
        });
      } else {
        getCollabClient()?.send({ type: 'peer_selection_clear' });
      }
    });
    return unsub;
  }, []);

  // ── B/D Animations ────────────────────────────────────────────────────────
  const bdAnimations = useBDAnimations();

  // ── Channel layout ────────────────────────────────────────────────────────
  // Computes per-channel offsets and widths for the tracker grid.
  // NOTE: PatternEditorCanvas extends this with a format mode branch; that
  // branch is kept in the Canvas component. The Pixi view uses these values
  // directly (it has no format mode).
  const { numChannels, channelOffsets, channelWidths, totalChannelsWidth } = useMemo(() => {
    if (!pattern) {
      return {
        numChannels: 0,
        channelOffsets: [] as number[],
        channelWidths: [] as number[],
        totalChannelsWidth: 0,
      };
    }

    const nc = pattern.channels.length;
    const zoomMultipliers = [0.6, 0.7, 0.85, 1.0, 1.2, 1.5, 1.8];
    const zoomFactor = zoomMultipliers[trackWidthZoom ?? 3] ?? 1.0;
    const noteWidth = Math.round((CHAR_WIDTH * 3 + 4) * zoomFactor);
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;

    const offsets: number[] = [];
    const widths: number[] = [];
    let currentX = LINE_NUMBER_WIDTH;

    for (let ch = 0; ch < nc; ch++) {
      const channel = pattern.channels[ch];
      const isCollapsed = channel?.collapsed;
      const noteCols = channel?.channelMeta?.noteCols ?? 1;
      // Per-channel automation area: scale with lane count
      const laneCount = showAutomationLanes ? (channelLaneCounts[ch] ?? 1) : 0;
      const autoLaneExtra = laneCount <= 0 ? 0
        : laneCount === 1 ? AUTOMATION_LANE_WIDTH
        : Math.max(AUTOMATION_LANE_WIDTH, laneCount * AUTOMATION_LANE_MIN + 4);

      if (isCollapsed) {
        const cw = noteWidth + Math.round(40 * zoomFactor) + autoLaneExtra;
        offsets.push(currentX);
        widths.push(cw);
        currentX += cw;
      } else {
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        const effectWidth = Math.round(effectCols * (CHAR_WIDTH * 3 + 4) * zoomFactor);
        // Extra note columns: each adds note(34) + inst(20) + vol(20) + gaps(12) = 86px
        const extraNoteColWidth = Math.round((noteCols - 1) * (noteWidth + CHAR_WIDTH * 4 + 12));
        const paramWidth = Math.round((CHAR_WIDTH * 4 + 8) * zoomFactor)
          + effectWidth
          + (showAcid ? Math.round((CHAR_WIDTH * 2 + 8) * zoomFactor) : 0)
          + (showProb ? Math.round((CHAR_WIDTH * 2 + 4) * zoomFactor) : 0);
        const chWidth = noteWidth + extraNoteColWidth + paramWidth + Math.round(60 * zoomFactor) + autoLaneExtra;
        offsets.push(currentX);
        widths.push(chWidth);
        currentX += chWidth;
      }
    }

    return {
      numChannels: nc,
      channelOffsets: offsets,
      channelWidths: widths,
      totalChannelsWidth: currentX - LINE_NUMBER_WIDTH,
    };
  }, [pattern, columnVisibility, showAutomationLanes, channelLaneCounts, trackWidthZoom]);

  // ─────────────────────────────────────────────────────────────────────────

  return {
    // TrackerStore
    pattern,
    patterns,
    currentPatternIndex,
    addChannel,
    toggleChannelMute,
    toggleChannelSolo,
    toggleChannelCollapse,
    setChannelColor,
    updateChannelName,
    setCell,
    copyTrack,
    cutTrack,
    pasteTrack,
    // EditorStore
    showGhostPatterns,
    columnVisibility,
    recordMode,
    // Channel state
    channelMuted,
    channelSolo,
    // Transport
    isPlaying,
    // UI / display
    trackerZoom,
    rowHeight,
    rowHeightRef,
    trackerVisualBg,
    // Cursor / selection refs
    cursorRef,
    selectionRef,
    // Collaboration refs
    peerCursorRef,
    peerSelectionRef,
    // B/D animations
    bdAnimations,
    // Channel layout
    numChannels,
    channelOffsets,
    channelWidths,
    totalChannelsWidth,
  };
}
