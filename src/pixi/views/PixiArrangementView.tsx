/**
 * PixiArrangementView — Arrangement view for WebGL mode.
 * Layout: Toolbar (top) | [Track headers | Arrangement canvas] (flex row)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PixiButton, PixiLabel } from '../components';
import { PixiArrangementCanvas } from './arrangement/PixiArrangementCanvas';
import type { ClipRenderData } from './arrangement/PixiArrangementCanvas';
import { PixiTrackHeaders } from './arrangement/PixiTrackHeaders';
import { useTransportStore, useTrackerStore } from '@stores';
import { useArrangementStore } from '@/stores/useArrangementStore';
import type { ArrangementToolMode } from '@/types/arrangement';
import { useArrangementKeyboardShortcuts } from '@/components/arrangement/ArrangementKeyboardShortcuts';

// Default channel colors when falling back to tracker channels
const CHANNEL_COLORS = [0x60a5fa, 0xf87171, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xfb923c, 0x38bdf8, 0xe879f9];

/** Convert CSS hex color string to PixiJS number */
function cssColorToPixi(color: string | null, fallback: number): number {
  if (!color) return fallback;
  const hex = color.replace('#', '');
  return parseInt(hex, 16) || fallback;
}

export const PixiArrangementView: React.FC = () => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const playbackRowRef = useRef(0);

  // Arrangement store
  const arrangementTracks = useArrangementStore(s => s.tracks);
  const isArrangementMode = useArrangementStore(s => s.isArrangementMode);
  const playbackRow = useArrangementStore(s => s.playbackRow);
  const tool = useArrangementStore(s => s.tool);
  const setTool = useArrangementStore(s => s.setTool);
  const view = useArrangementStore(s => s.view);

  // Fall back to tracker channels if no arrangement tracks
  const trackerChannels = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.channels || [];
  });

  // Build track list: prefer arrangement tracks, fall back to tracker channels
  const tracks = useMemo(() => {
    if (arrangementTracks.length > 0) {
      return arrangementTracks.map((t, i) => ({
        id: t.id,
        name: t.name,
        muted: t.muted,
        solo: t.solo,
        color: cssColorToPixi(t.color, CHANNEL_COLORS[i % CHANNEL_COLORS.length]),
      }));
    }
    return trackerChannels.map((ch, i) => ({
      id: ch.id,
      name: ch.name || `Ch ${i + 1}`,
      muted: ch.muted,
      solo: ch.solo,
      color: cssColorToPixi(ch.color, CHANNEL_COLORS[i % CHANNEL_COLORS.length]),
    }));
  }, [arrangementTracks, trackerChannels]);

  // Clips and selection
  const clips = useArrangementStore(s => s.clips);
  const selectedClipIds = useArrangementStore(s => s.selectedClipIds);
  const patterns = useTrackerStore(s => s.patterns);

  // Pre-compute clip render data for the canvas
  const clipRenderData = useMemo((): ClipRenderData[] => {
    const trackIdToIndex = new Map<string, number>();
    tracks.forEach((t, i) => trackIdToIndex.set(t.id, i));

    return clips.map(clip => {
      // Effective length: clipLengthRows or pattern length minus offset
      let lengthRows = clip.clipLengthRows ?? 64;
      if (clip.clipLengthRows == null) {
        const pat = patterns.find(p => p.id === clip.patternId);
        if (pat) {
          const patLen = pat.channels[0]?.rows?.length ?? 64;
          lengthRows = Math.max(1, patLen - (clip.offsetRows || 0));
        }
      }

      // Color: clip color → track color → default
      const trackIdx = trackIdToIndex.get(clip.trackId) ?? 0;
      const trackColor = tracks[trackIdx]?.color ?? 0x3b82f6;
      const color = clip.color ? cssColorToPixi(clip.color, trackColor) : trackColor;

      // Name: custom name → pattern name → generic
      let name = clip.name || '';
      if (!name) {
        const pat = patterns.find(p => p.id === clip.patternId);
        name = pat?.name || `Pattern ${clip.sourceChannelIndex}`;
      }

      return {
        id: clip.id,
        startRow: clip.startRow,
        lengthRows,
        trackIndex: trackIdx,
        color,
        name,
        muted: clip.muted,
        selected: selectedClipIds.has(clip.id),
      };
    });
  }, [clips, tracks, selectedClipIds, patterns]);

  // Track interaction: mute/solo
  const useArrangementData = arrangementTracks.length > 0;

  // Activate arrangement mode on mount, deactivate on unmount
  useEffect(() => {
    useArrangementStore.getState().setIsArrangementMode(true);

    // Auto-import from pattern order if no arrangement tracks exist
    const arr = useArrangementStore.getState();
    if (arr.tracks.length === 0) {
      const ts = useTrackerStore.getState();
      if (ts.patternOrder.length > 0) {
        arr.importFromPatternOrder(ts.patternOrder, ts.patterns);
        arr.zoomToFit();
      }
    }

    return () => {
      useArrangementStore.getState().setIsArrangementMode(false);
    };
  }, []);

  // Playback row sync via rAF loop
  useEffect(() => {
    if (!isPlaying || !isArrangementMode) return;

    let rafId: number;
    const update = () => {
      const globalRow = useTransportStore.getState().currentGlobalRow;
      if (globalRow !== playbackRowRef.current) {
        playbackRowRef.current = globalRow;
        useArrangementStore.getState().setPlaybackRow(globalRow);
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isArrangementMode]);

  // Full arrangement keyboard shortcuts (Cmd+D duplicate, Cmd+E split, zoom presets, etc.)
  useArrangementKeyboardShortcuts();

  const handleToggleMute = useCallback((trackId: string) => {
    if (useArrangementData) {
      useArrangementStore.getState().toggleTrackMute(trackId);
    } else {
      // Find channel index by id
      const state = useTrackerStore.getState();
      const pat = state.patterns[state.currentPatternIndex];
      const idx = pat?.channels.findIndex(ch => ch.id === trackId) ?? -1;
      if (idx >= 0) state.toggleChannelMute(idx);
    }
  }, [useArrangementData]);

  const handleToggleSolo = useCallback((trackId: string) => {
    if (useArrangementData) {
      useArrangementStore.getState().toggleTrackSolo(trackId);
    } else {
      const state = useTrackerStore.getState();
      const pat = state.patterns[state.currentPatternIndex];
      const idx = pat?.channels.findIndex(ch => ch.id === trackId) ?? -1;
      if (idx >= 0) state.toggleChannelSolo(idx);
    }
  }, [useArrangementData]);

  const handleSetTool = useCallback((t: ArrangementToolMode) => {
    setTool(t);
  }, [setTool]);

  // Tool selection shortcuts (V/D/E/S)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'v': handleSetTool('select'); break;
        case 'd': handleSetTool('draw'); break;
        case 'e': handleSetTool('erase'); break;
        case 's': handleSetTool('split'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSetTool]);

  // Zoom
  const handleZoomIn = useCallback(() => {
    const s = useArrangementStore.getState();
    s.setPixelsPerRow(s.view.pixelsPerRow * 2);
  }, []);

  const handleZoomOut = useCallback(() => {
    const s = useArrangementStore.getState();
    s.setPixelsPerRow(s.view.pixelsPerRow / 2);
  }, []);

  // Snap division cycling
  const SNAP_VALUES = [1, 2, 4, 8, 16];
  const handleCycleSnap = useCallback(() => {
    const s = useArrangementStore.getState();
    const idx = SNAP_VALUES.indexOf(s.view.snapDivision);
    const next = SNAP_VALUES[(idx + 1) % SNAP_VALUES.length];
    s.setSnapDivision(next);
  }, []);

  // Follow playback
  const handleToggleFollow = useCallback(() => {
    const s = useArrangementStore.getState();
    s.setFollowPlayback(!s.view.followPlayback);
  }, []);

  // Add track
  const handleAddTrack = useCallback(() => {
    useArrangementStore.getState().addTrack();
  }, []);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, 36);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, 35, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

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
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 8,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width: '100%', height: 36 }} />
        <PixiLabel text="ARRANGEMENT" size="sm" weight="bold" color="accent" />

        <PixiButton
          label="Select"
          variant={tool === 'select' ? 'ft2' : 'ghost'}
          color={tool === 'select' ? 'blue' : undefined}
          size="sm"
          active={tool === 'select'}
          onClick={() => handleSetTool('select')}
        />
        <PixiButton
          label="Draw"
          variant={tool === 'draw' ? 'ft2' : 'ghost'}
          color={tool === 'draw' ? 'green' : undefined}
          size="sm"
          active={tool === 'draw'}
          onClick={() => handleSetTool('draw')}
        />
        <PixiButton
          label="Erase"
          variant={tool === 'erase' ? 'ft2' : 'ghost'}
          color={tool === 'erase' ? 'red' : undefined}
          size="sm"
          active={tool === 'erase'}
          onClick={() => handleSetTool('erase')}
        />
        <PixiButton
          label="Split"
          variant={tool === 'split' ? 'ft2' : 'ghost'}
          color={tool === 'split' ? 'yellow' : undefined}
          size="sm"
          active={tool === 'split'}
          onClick={() => handleSetTool('split')}
        />

        {/* Zoom */}
        <PixiButton label="-" variant="ghost" size="sm" onClick={handleZoomOut} />
        <PixiLabel text="Zoom" size="xs" color="textMuted" />
        <PixiButton label="+" variant="ghost" size="sm" onClick={handleZoomIn} />

        {/* Snap */}
        <PixiButton
          label={`Snap:${view.snapDivision}`}
          variant="ghost"
          size="sm"
          onClick={handleCycleSnap}
        />

        {/* Follow playback */}
        <PixiButton
          label="Follow"
          variant={view.followPlayback ? 'ft2' : 'ghost'}
          color={view.followPlayback ? 'blue' : undefined}
          size="sm"
          active={view.followPlayback}
          onClick={handleToggleFollow}
        />

        <pixiContainer layout={{ flex: 1 }} />

        {/* Add track */}
        <PixiButton label="+ Track" variant="ghost" size="sm" onClick={handleAddTrack} />

        <PixiLabel
          text={`Row: ${view.scrollRow}`}
          size="xs"
          color="textMuted"
          layout={{ marginRight: 8 }}
        />
      </pixiContainer>

      {/* Main area: Track headers | Canvas */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <PixiTrackHeaders tracks={tracks} width={160} onToggleMute={handleToggleMute} onToggleSolo={handleToggleSolo} />

        <PixiArrangementCanvas
          width={4000}
          height={4000}
          scrollBeat={view.scrollRow}
          pixelsPerBeat={view.pixelsPerRow}
          playbackBeat={isPlaying ? playbackRow : undefined}
          clips={clipRenderData}
          trackHeight={40}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
