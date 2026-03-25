/**
 * PixiArrangementView — Arrangement view for WebGL mode.
 * Layout: Toolbar (top) | [Track headers | Arrangement canvas] (flex row)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PixiButton, PixiLabel, PixiViewHeader } from '../components';
import { PixiArrangementCanvas } from './arrangement/PixiArrangementCanvas';
import type { ClipRenderData, ClipChannelNotes } from './arrangement/PixiArrangementCanvas';
import { PixiTrackHeaders } from './arrangement/PixiTrackHeaders';
import { PixiArrangementAutomationLane } from './arrangement/PixiArrangementAutomationLane';
import { PixiPatternOrderSidebar } from './arrangement/PixiPatternOrderSidebar';
import { PixiPatternMatrix } from './arrangement/PixiPatternMatrix';
import { PixiScrollbar } from './pianoroll/PixiScrollbar';
import { useTransportStore, useTrackerStore, useUIStore } from '@stores';
import { usePianoRollStore } from '@/stores/usePianoRollStore';
import { useArrangementStore } from '@/stores/useArrangementStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { TITLE_H } from '../workbench/workbenchLayout';
import type { ArrangementToolMode } from '@/types/arrangement';
import { useArrangementKeyboardShortcuts } from '@/components/arrangement/ArrangementKeyboardShortcuts';
import { useArrangementView } from '@/hooks/views/useArrangementView';
import { MarkerRenameInput } from '@/components/arrangement/MarkerRenameInput';
import { TrackRenameDialog } from '@/components/arrangement/TrackRenameDialog';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import type { MenuItem } from '../components/PixiMenuBar';

// Default channel colors when falling back to tracker channels
const CHANNEL_COLORS = [0x60a5fa, 0xf87171, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xfb923c, 0x38bdf8, 0xe879f9];

/** Convert CSS hex color string to PixiJS number */
function cssColorToPixi(color: string | null, fallback: number): number {
  if (!color) return fallback;
  const hex = color.replace('#', '');
  return parseInt(hex, 16) || fallback;
}

const TRACK_HEADERS_W = 200;
const ARR_TOOLBAR_H = 36;
const SCROLLBAR_SIZE = 8;
const ARR_TRACK_HEIGHT = 40;
const ARR_RULER_HEIGHT = 24;

export const PixiArrangementView: React.FC = () => {
  const isPlaying = useTransportStore(s => s.isPlaying);

  // Resolve actual window pixel dimensions
  const win = useWorkbenchStore(s => s.windows['arrangement']);
  const winW = win?.width ?? 900;
  const winH = win?.height ?? 400;
  const canvasW = Math.max(200, winW - TRACK_HEADERS_W - SCROLLBAR_SIZE);
  const canvasH = Math.max(100, winH - TITLE_H - ARR_TOOLBAR_H - SCROLLBAR_SIZE);

  // Hover ref for wheel scroll gating
  const isHoveredRef = useRef(false);

  // Wheel → horizontal scroll; contextmenu → suppress browser menu
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      if (!isHoveredRef.current) return;
      e.preventDefault();
      const s = useArrangementStore.getState();
      if (e.ctrlKey) {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        s.setPixelsPerRow(s.view.pixelsPerRow * factor);
        return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const rowDelta = e.deltaX / s.view.pixelsPerRow;
        s.setScrollRow(Math.max(0, s.view.scrollRow + rowDelta));
      } else {
        s.setScrollY(s.view.scrollY + e.deltaY);
      }
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', handleContextMenu);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Arrangement store
  const arrangementTracks = useArrangementStore(s => s.tracks);
  const groups = useArrangementStore(s => s.groups);
  const automationLanes = useArrangementStore(s => s.automationLanes);
  const playbackRow = useArrangementStore(s => s.playbackRow);
  const tool = useArrangementStore(s => s.tool);
  const setTool = useArrangementStore(s => s.setTool);
  const view = useArrangementStore(s => s.view);
  const loopStart = useArrangementStore(s => s.view.loopStart);
  const loopEnd = useArrangementStore(s => s.view.loopEnd);
  const scrollY = useArrangementStore(s => s.view.scrollY);

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
        groupId: t.groupId,
      }));
    }
    return trackerChannels.map((ch, i) => ({
      id: ch.id,
      name: ch.name || `Ch ${i + 1}`,
      muted: ch.muted,
      solo: ch.solo,
      color: cssColorToPixi(ch.color, CHANNEL_COLORS[i % CHANNEL_COLORS.length]),
      groupId: null as string | null,
    }));
  }, [arrangementTracks, trackerChannels]);

  // Filter out tracks whose group is folded
  const visibleTracks = useMemo(() => {
    return tracks.filter(track => {
      if (!track.groupId) return true;
      const group = groups.find(g => g.id === track.groupId);
      return !group?.folded;
    });
  }, [tracks, groups]);

  // Markers
  const storeMarkers = useArrangementStore(s => s.markers);
  const markers = useMemo(() => storeMarkers.map(m => ({
    id: m.id,
    row: m.row,
    label: m.name,
    color: cssColorToPixi(m.color, 0x06b6d4),
    timeSig: m.type === 'timesig' ? m.name : undefined,
  })), [storeMarkers]);

  // Clips and selection
  const clips = useArrangementStore(s => s.clips);
  const selectedClipIds = useArrangementStore(s => s.selectedClipIds);
  const patterns = useTrackerStore(s => s.patterns);

  // Dynamic total rows: end of last clip + 25% padding, minimum 128
  const totalRows = useMemo(() => {
    if (clips.length === 0) return 128;
    let maxEnd = 0;
    for (const clip of clips) {
      const len = clip.clipLengthRows ?? 64;
      maxEnd = Math.max(maxEnd, clip.startRow + len);
    }
    return Math.max(128, Math.ceil(maxEnd * 1.25));
  }, [clips]);

  // Pre-compute clip render data for the canvas — uses visibleTracks for layout index
  const clipRenderData = useMemo((): ClipRenderData[] => {
    const trackIdToIndex = new Map<string, number>();
    visibleTracks.forEach((t, i) => trackIdToIndex.set(t.id, i));

    return clips
      .filter(clip => trackIdToIndex.has(clip.trackId))
      .map(clip => {
        // Effective length: clipLengthRows or pattern length minus offset
        let lengthRows = clip.clipLengthRows ?? 64;
        const pat = patterns.find(p => p.id === clip.patternId);
        if (clip.clipLengthRows == null) {
          if (pat) {
            const patLen = pat.channels[0]?.rows?.length ?? 64;
            lengthRows = Math.max(1, patLen - (clip.offsetRows || 0));
          }
        }

        // Color: clip color → track color → default
        const trackIdx = trackIdToIndex.get(clip.trackId) ?? 0;
        const trackColor = visibleTracks[trackIdx]?.color ?? 0x3b82f6;
        const color = clip.color ? cssColorToPixi(clip.color, trackColor) : trackColor;

        // Name: custom name → pattern name → generic
        let name = clip.name || '';
        if (!name) {
          name = pat?.name || `Pattern ${clip.sourceChannelIndex}`;
        }

        // Note preview: collect note values for the clip's channel rows
        let noteRows: number[] | undefined;
        let noteChannels: ClipChannelNotes[] | undefined;
        if (pat) {
          const channelIdx = clip.sourceChannelIndex ?? 0;
          const channel = pat.channels[channelIdx];
          const offsetRows = clip.offsetRows || 0;
          if (channel?.rows) {
            noteRows = channel.rows
              .slice(offsetRows, offsetRows + lengthRows)
              .map(cell => cell.note);
          }

          // Multi-channel waveform: up to 4 channels
          const numChannels = Math.min(4, pat.channels.length);
          if (numChannels > 0) {
            noteChannels = [];
            for (let ci = 0; ci < numChannels; ci++) {
              const ch = pat.channels[ci];
              if (!ch?.rows) continue;
              const rows = ch.rows
                .slice(offsetRows, offsetRows + lengthRows)
                .map(cell => cell.note);
              noteChannels.push({
                noteRows: rows,
                color: CHANNEL_COLORS[ci % CHANNEL_COLORS.length],
              });
            }
            if (noteChannels.length === 0) noteChannels = undefined;
          }
        }

        return {
          id: clip.id,
          patternId: clip.patternId,
          startRow: clip.startRow,
          lengthRows,
          trackIndex: trackIdx,
          color,
          name,
          muted: clip.muted,
          selected: selectedClipIds.has(clip.id),
          fadeInRows: clip.fadeInRows || 0,
          fadeOutRows: clip.fadeOutRows || 0,
          noteRows,
          noteChannels,
        };
      });
  }, [clips, visibleTracks, selectedClipIds, patterns]);

  const AUTOMATION_LANE_H = 40;

  // Per-track visible automation lanes (only for visible tracks)
  const trackAutomationLanes = useMemo(() => {
    const visibleTrackIds = new Set(visibleTracks.map(t => t.id));
    const map = new Map<string, typeof automationLanes>();
    for (const lane of automationLanes) {
      if (!lane.visible) continue;
      if (!visibleTrackIds.has(lane.trackId)) continue;
      const existing = map.get(lane.trackId) ?? [];
      existing.push(lane);
      map.set(lane.trackId, existing);
    }
    return map;
  }, [automationLanes, visibleTracks]);

  // Track interaction: mute/solo
  const useArrangementData = arrangementTracks.length > 0;

  // Shared logic: arrangement mode lifecycle, auto-import, playback rAF loop, automation lanes
  useArrangementView({ canvasWidth: canvasW });

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

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <PixiViewHeader activeView="arrangement" title="ARRANGEMENT">

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
        <PixiButton label="Fit" variant="ghost" size="sm" onClick={() => useArrangementStore.getState().zoomToFit()} />

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

        {/* Export arrangement */}
        <PixiButton
          label="Export"
          variant="ghost"
          size="sm"
          onClick={() => useUIStore.getState().openModal('export', { audioScope: 'arrangement' })}
        />

        {/* Add track */}
        <PixiButton label="+ Track" variant="ghost" size="sm" onClick={handleAddTrack} />

        <PixiLabel
          text={`Row: ${view.scrollRow}`}
          size="xs"
          color="textMuted"
          layout={{ marginRight: 8 }}
        />
      </PixiViewHeader>

      {/* Main area: Track headers | Canvas + scrollbars — hover tracked for wheel scroll */}
      <pixiContainer
        layout={{ flex: 1, width: '100%', flexDirection: 'row' }}
        eventMode="static"
        onPointerOver={() => { isHoveredRef.current = true; }}
        onPointerOut={() => { isHoveredRef.current = false; }}
      >
        {/* Pattern order sidebar */}
        {view.showPatternOrder !== false && (
          <PixiPatternOrderSidebar height={canvasH} />
        )}

        {/* Track headers + blank corner for scrollbar alignment */}
        <pixiContainer layout={{ width: TRACK_HEADERS_W, flexDirection: 'column' }}>
          <PixiTrackHeaders
            tracks={visibleTracks}
            groups={groups}
            width={TRACK_HEADERS_W}
            scrollY={scrollY}
            onToggleMute={handleToggleMute}
            onToggleSolo={handleToggleSolo}
            onRenameTrack={(trackId) => useArrangementStore.getState().setRenamingTrackId(trackId)}
            onCycleColor={(trackId) => useArrangementStore.getState().cycleTrackColor(trackId)}
            onResizeTrack={(trackId, height) => useArrangementStore.getState().setTrackHeight(trackId, height)}
            onToggleGroupFold={(groupId) => useArrangementStore.getState().toggleGroupFold(groupId)}
            onRemoveTrack={(trackId) => useArrangementStore.getState().removeTrack(trackId)}
          />
          <pixiContainer layout={{ width: TRACK_HEADERS_W, height: SCROLLBAR_SIZE }} />
        </pixiContainer>

        {/* Canvas column: grid + H-scrollbar */}
        <pixiContainer layout={{ flex: 1, flexDirection: 'column' }}>
          <PixiArrangementCanvas
            width={canvasW}
            height={canvasH}
            scrollBeat={view.scrollRow}
            pixelsPerBeat={view.pixelsPerRow}
            playbackBeat={isPlaying ? playbackRow : undefined}
            totalBeats={totalRows}
            clips={clipRenderData}
            trackHeight={ARR_TRACK_HEIGHT}
            scrollY={scrollY}
            tool={tool}
            snapDivision={view.snapDivision}
            loopStart={loopStart}
            loopEnd={loopEnd}
            onSelectClip={(id, add) => useArrangementStore.getState().selectClip(id, add)}
            onDeselectAll={() => useArrangementStore.getState().clearSelection()}
            onSelectBox={(ids) => useArrangementStore.getState().selectClips(ids)}
            onMoveClips={(ids, dr, dt) => useArrangementStore.getState().moveClips(ids, dr, dt)}
            onResizeClipEnd={(id, newEndRow) => useArrangementStore.getState().resizeClipEnd(id, newEndRow)}
            onDeleteClip={(id) => useArrangementStore.getState().removeClip(id)}
            onSplitClip={(id, splitRow) => useArrangementStore.getState().splitClip(id, splitRow)}
            onContextMenu={(clipId, screenX, screenY) => {
              const arr = useArrangementStore.getState();
              const close = () => usePixiDropdownStore.getState().closeAll();

              if (clipId) {
                const clip = arr.clips.find(c => c.id === clipId);
                if (!clip) return;
                const items: MenuItem[] = [
                  {
                    type: 'action',
                    label: 'Open in Piano Roll',
                    onClick: () => {
                      close();
                      const ts = useTrackerStore.getState();
                      const patternIndex = ts.patterns.findIndex(p => p.id === clip.patternId);
                      if (patternIndex >= 0) ts.setCurrentPattern(patternIndex);
                      const pr = usePianoRollStore.getState();
                      pr.setChannelIndex(clip.sourceChannelIndex ?? 0);
                      pr.setScroll(clip.offsetRows || 0, pr.view.scrollY);
                      useWorkbenchStore.getState().showWindow('pianoroll');
                    },
                  },
                  { type: 'separator' },
                  {
                    type: 'action',
                    label: 'Rename',
                    onClick: () => { close(); arr.setRenamingClipId(clipId); },
                  },
                  {
                    type: 'action',
                    label: clip.muted ? 'Unmute' : 'Mute',
                    onClick: () => { close(); arr.toggleClipMute(clipId); },
                  },
                  {
                    type: 'action',
                    label: 'Duplicate',
                    onClick: () => {
                      close();
                      arr.pushUndo();
                      const newIds = arr.duplicateClips([clipId]);
                      arr.clearSelection();
                      arr.selectClips(newIds);
                    },
                  },
                  {
                    type: 'action',
                    label: 'Clone as new pattern',
                    onClick: () => {
                      close();
                      arr.pushUndo();
                      arr.cloneClipAsNewPattern(clipId);
                    },
                  },
                  { type: 'separator' },
                  {
                    type: 'checkbox',
                    label: 'Loop clip',
                    checked: !!clip.loopClip,
                    onChange: (v: boolean) => { arr.setClipLoop(clipId, v); close(); },
                  },
                  {
                    type: 'action',
                    label: 'Add volume automation',
                    onClick: () => { close(); arr.addAutomationLane(clip.trackId, 'volume'); },
                  },
                  { type: 'separator' },
                  {
                    type: 'action',
                    label: 'Delete',
                    onClick: () => { close(); arr.pushUndo(); arr.removeClip(clipId); },
                  },
                ];
                usePixiDropdownStore.getState().openDropdown({
                  kind: 'menu',
                  id: 'arr-clip-ctx',
                  x: screenX,
                  y: screenY,
                  width: 200,
                  items,
                  onClose: close,
                });
              } else {
                const items: MenuItem[] = [
                  {
                    type: 'action',
                    label: 'Add Track',
                    onClick: () => { close(); arr.addTrack(); },
                  },
                  { type: 'separator' },
                  {
                    type: 'action',
                    label: 'Fit All',
                    onClick: () => { close(); arr.zoomToFit(); },
                  },
                ];
                usePixiDropdownStore.getState().openDropdown({
                  kind: 'menu',
                  id: 'arr-empty-ctx',
                  x: screenX,
                  y: screenY,
                  width: 160,
                  items,
                  onClose: close,
                });
              }
            }}
            onOpenInPianoRoll={(clipId) => {
              const clip = useArrangementStore.getState().clips.find(c => c.id === clipId);
              if (!clip) return;
              // Switch to the clip's pattern so piano roll edits write to the right data
              const ts = useTrackerStore.getState();
              const patternIndex = ts.patterns.findIndex(p => p.id === clip.patternId);
              if (patternIndex >= 0) ts.setCurrentPattern(patternIndex);
              // Use sourceChannelIndex if set, otherwise derive from track order
              let channelIndex = clip.sourceChannelIndex ?? 0;
              if (!clip.sourceChannelIndex) {
                const arr = useArrangementStore.getState();
                const sortedTracks = arr.tracks.slice().sort((a, b) => a.index - b.index);
                const tIdx = sortedTracks.findIndex(t => t.id === clip.trackId);
                if (tIdx >= 0) channelIndex = tIdx;
              }
              // Scroll piano roll to the clip's start within the pattern
              const pr = usePianoRollStore.getState();
              pr.setChannelIndex(channelIndex);
              pr.setScroll(clip.offsetRows || 0, pr.view.scrollY);
              useWorkbenchStore.getState().showWindow('pianoroll');
            }}
            markers={markers}
            onAddMarker={(row) => {
              useArrangementStore.getState().addMarker({ row, name: `M${row}`, color: '#06b6d4', type: 'cue' });
            }}
            onMoveMarker={(markerId, row) => {
              useArrangementStore.getState().moveMarker(markerId, row);
            }}
            onRenameMarker={(markerId) => {
              useArrangementStore.getState().setRenamingMarkerId(markerId);
            }}
            onAddTimeSigMarker={(row) => {
              useArrangementStore.getState().addTimeSigMarker(row, 3, 4);
            }}
            onAddClip={(trackIndex, startRow, lengthRows) => {
              const arr = useArrangementStore.getState();
              const ts = useTrackerStore.getState();
              const trackList = arr.tracks.slice().sort((a, b) => a.index - b.index);
              const track = trackList[trackIndex];
              if (!track) return;
              // Create a fresh empty pattern for this clip so each clip has independent data
              ts.addPattern();
              const patternId = useTrackerStore.getState().patterns.at(-1)?.id;
              if (!patternId) return;
              arr.addClip({
                patternId,
                trackId: track.id,
                startRow,
                offsetRows: 0,
                clipLengthRows: lengthRows,
                sourceChannelIndex: trackIndex,
                color: null,
                muted: false,
              });
            }}
          />
          {/* Automation lanes — rendered below the clip canvas, one per visible lane per track */}
          {visibleTracks.map((track) => {
            const lanes = trackAutomationLanes.get(track.id);
            if (!lanes || lanes.length === 0) return null;
            return lanes.map((lane) => (
              <PixiArrangementAutomationLane
                key={lane.id}
                lane={lane}
                width={canvasW}
                height={AUTOMATION_LANE_H}
                scrollBeat={view.scrollRow}
                pixelsPerBeat={view.pixelsPerRow}
                totalRows={totalRows}
                onAddPoint={(row, value) => useArrangementStore.getState().addAutomationPoint(lane.id, { row, value, curve: 'linear' })}
                onMovePoint={(index, row, value) => useArrangementStore.getState().moveAutomationPoint(lane.id, index, row, value)}
                onRemovePoint={(index) => useArrangementStore.getState().removeAutomationPoint(lane.id, index)}
              />
            ));
          })}

          {/* Horizontal scrollbar */}
          <PixiScrollbar
            orientation="horizontal"
            width={canvasW}
            height={SCROLLBAR_SIZE}
            value={Math.max(0, Math.min(1, view.scrollRow / Math.max(1, totalRows - canvasW / view.pixelsPerRow)))}
            thumbSize={Math.min(1, (canvasW / view.pixelsPerRow) / Math.max(1, totalRows))}
            onChange={(v) => {
              const s = useArrangementStore.getState();
              s.setScrollRow(v * Math.max(0, totalRows - canvasW / s.view.pixelsPerRow));
            }}
          />
        </pixiContainer>

        {/* Vertical scrollbar — uses visibleTracks count for scroll range */}
        <PixiScrollbar
          orientation="vertical"
          width={SCROLLBAR_SIZE}
          height={canvasH + SCROLLBAR_SIZE}
          value={(() => {
            const totalH = visibleTracks.length * ARR_TRACK_HEIGHT;
            const visibleH = canvasH - ARR_RULER_HEIGHT;
            const maxScroll = Math.max(0, totalH - visibleH);
            return maxScroll > 0 ? Math.min(1, scrollY / maxScroll) : 0;
          })()}
          thumbSize={Math.min(1, (canvasH - ARR_RULER_HEIGHT) / Math.max(1, visibleTracks.length * ARR_TRACK_HEIGHT))}
          onChange={(v) => {
            const totalH = visibleTracks.length * ARR_TRACK_HEIGHT;
            const visibleH = canvasH - ARR_RULER_HEIGHT;
            useArrangementStore.getState().setScrollY(v * Math.max(0, totalH - visibleH));
          }}
        />

        {/* Pattern matrix sidebar (Renoise-style) */}
        {view.showPatternMatrix && (
          <PixiPatternMatrix width={240} height={canvasH + SCROLLBAR_SIZE} />
        )}
      </pixiContainer>

      {/* Marker rename input — DOM overlay rendered via portal */}
      <MarkerRenameInput />
      {/* Track rename dialog — DOM overlay rendered via portal */}
      <TrackRenameDialog />
    </pixiContainer>
  );
};
