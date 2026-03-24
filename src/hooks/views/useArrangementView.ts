/**
 * useArrangementView — Shared logic hook for ArrangementView (DOM) and
 * PixiArrangementView (Pixi).
 *
 * Responsibilities:
 *  - Activate/deactivate arrangement mode on mount/unmount
 *  - Auto-import from pattern order when no tracks exist (first open)
 *  - Zoom-to-fit after a successful auto-import
 *  - Drive the rAF playback loop:
 *      · sync playbackRow into the arrangement store
 *      · auto-scroll to follow the playhead (when followPlayback is enabled)
 *      · switch the UI to the currently-active clip's pattern
 *      · wrap the visual playhead at the loop region boundary
 *      · apply automation lane values to the mixer / instrument stores
 *
 * All rendering logic stays in the individual view components.
 */

import { useEffect, useRef } from 'react';
import { useArrangementStore } from '@/stores/useArrangementStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@stores';
import { useMixerStore } from '@/stores/useMixerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { notify } from '@/stores/useNotificationStore';
import type { TimelineAutomationPoint } from '@/types/arrangement';

// ---------------------------------------------------------------------------
// Helper: linear interpolation across sorted automation points
// ---------------------------------------------------------------------------

function getAutomationValue(points: TimelineAutomationPoint[], row: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;

  if (row <= points[0].row) return points[0].value;
  if (row >= points[points.length - 1].row) return points[points.length - 1].value;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (row >= a.row && row <= b.row) {
      const span = b.row - a.row;
      if (span === 0) return a.value;
      const t = (row - a.row) / span;
      return a.value + t * (b.value - a.value);
    }
  }

  return points[points.length - 1].value;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseArrangementViewOptions {
  /**
   * Width of the visible canvas in pixels — used to compute when the playhead
   * would scroll out of view (follow-playback feature).
   * Pass 0 or omit when the canvas width is not yet known.
   */
  canvasWidth?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useArrangementView(options: UseArrangementViewOptions = {}): void {
  const { canvasWidth = 0 } = options;

  const isPlaying = useTransportStore(s => s.isPlaying);

  // Refs — stable across renders, used inside rAF callbacks
  const isArrangementModeRef = useRef(false);
  const playbackRowRef = useRef(0);
  const lastArrangementPatternIdRef = useRef<string | null>(null);
  const canvasWidthRef = useRef(canvasWidth);

  // Keep canvasWidthRef current without causing re-renders
  useEffect(() => {
    canvasWidthRef.current = canvasWidth;
  }, [canvasWidth]);

  // ── Lifecycle: activate arrangement mode, auto-import, zoom-to-fit ─────────
  useEffect(() => {
    isArrangementModeRef.current = true;
    useArrangementStore.getState().setIsArrangementMode(true);

    const arr = useArrangementStore.getState();
    if (arr.tracks.length === 0) {
      const ts = useTrackerStore.getState();
      if (ts.patternOrder.length > 0 && ts.patterns.length > 0) {
        arr.importFromPatternOrder(ts.patternOrder, ts.patterns);
        arr.zoomToFit();
        notify.success('Converted pattern order to arrangement');
      }
    }

    return () => {
      isArrangementModeRef.current = false;
      useArrangementStore.getState().setIsArrangementMode(false);
    };
  }, []);

  // ── Playback rAF loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;

    // Immediately sync so the playhead isn't stale on the first frame
    const initialGlobalRow = useTransportStore.getState().currentGlobalRow;
    useArrangementStore.getState().setPlaybackRow(initialGlobalRow);

    let rafId: number;

    const update = () => {
      if (!isArrangementModeRef.current) return;

      const globalRow = useTransportStore.getState().currentGlobalRow;

      if (globalRow !== playbackRowRef.current) {
        playbackRowRef.current = globalRow;
        const arr = useArrangementStore.getState();
        arr.setPlaybackRow(globalRow);

        // ── Follow playback: auto-scroll when playhead nears the edge ────────
        if (arr.view.followPlayback && canvasWidthRef.current > 0) {
          const { scrollRow, pixelsPerRow } = arr.view;
          const w = canvasWidthRef.current;
          const playheadX = (globalRow - scrollRow) * pixelsPerRow;
          if (playheadX < 0 || playheadX > w - 20) {
            const visibleRows = w / pixelsPerRow;
            arr.setScrollRow(Math.max(0, globalRow - visibleRows * 0.1));
          }
        }

        // ── Clip switching: update UI to show the active clip's pattern ──────
        if (arr.isArrangementMode) {
          const ts = useTrackerStore.getState();
          const activeClip = arr.clips.find(clip => {
            if (clip.muted) return false;
            const pat = ts.patterns.find(p => p.id === clip.patternId);
            const clipLen = clip.clipLengthRows ?? (pat ? pat.length - clip.offsetRows : 64);
            return globalRow >= clip.startRow && globalRow < clip.startRow + clipLen;
          });

          if (activeClip) {
            if (activeClip.patternId !== lastArrangementPatternIdRef.current) {
              lastArrangementPatternIdRef.current = activeClip.patternId;
              const patIdx = ts.patterns.findIndex(p => p.id === activeClip.patternId);
              if (patIdx >= 0 && patIdx !== ts.currentPatternIndex) {
                // fromReplayer=true → UI-only, does NOT call replayer.jumpToPattern()
                ts.setCurrentPattern(patIdx, true);
              }
            }
          } else {
            lastArrangementPatternIdRef.current = null;
          }
        }

        // ── Loop wrap: reset visual playhead when it reaches loopEnd ─────────
        const isLooping = useTransportStore.getState().isLooping;
        const { loopStart, loopEnd } = arr.view;
        if (isLooping && loopStart != null && loopEnd != null && globalRow >= loopEnd) {
          playbackRowRef.current = loopStart;
          arr.setPlaybackRow(loopStart);
        }

        // ── Automation lanes: apply values to mixer / instrument stores ───────
        const { automationLanes, tracks } = arr;
        const sortedTracks = [...tracks].sort((a, b) => a.index - b.index);
        for (const lane of automationLanes) {
          if (!lane.enabled || lane.points.length === 0) continue;
          const value = getAutomationValue(lane.points, globalRow);

          if (lane.parameter === 'volume') {
            const chIdx = sortedTracks.findIndex(t => t.id === lane.trackId);
            if (chIdx >= 0) useMixerStore.getState().setChannelVolume(chIdx, value);
          } else if (lane.parameter === 'pan') {
            const chIdx = sortedTracks.findIndex(t => t.id === lane.trackId);
            if (chIdx >= 0) useMixerStore.getState().setChannelPan(chIdx, value);
          } else if (
            lane.parameter === 'cutoff' ||
            lane.parameter === 'resonance' ||
            lane.parameter === 'envMod'
          ) {
            const track = tracks.find(t => t.id === lane.trackId);
            const instrumentId = track?.instrumentId ?? null;
            if (instrumentId !== null) {
              useInstrumentStore.getState().updateInstrument(instrumentId, {
                tb303: { [lane.parameter]: value },
              });
            }
          }
        }
      }

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);
}
