/**
 * Arrangement Store - Zustand store for DAW-style arrangement timeline
 *
 * Manages clips, tracks, markers, groups, automation lanes, and view state.
 * Own undo/redo stacks (arrangement edits don't touch pattern data).
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  ArrangementClip,
  ArrangementTrack,
  ArrangementMarker,
  TrackGroup,
  TimelineAutomationLane,
  TimelineAutomationPoint,
  ArrangementSnapshot,
  ArrangementViewState,
  ArrangementToolMode,
  ArrangementDragState,
} from '@typedefs/arrangement';
import type { Pattern } from '@typedefs/tracker';

// ============================================================================
// HELPERS
// ============================================================================

let nextId = 1;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

// Track colors palette (for auto-assigning to new tracks)
const TRACK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface ArrangementStore {
  // === Data ===
  tracks: ArrangementTrack[];
  clips: ArrangementClip[];
  markers: ArrangementMarker[];
  groups: TrackGroup[];
  automationLanes: TimelineAutomationLane[];

  // === View State ===
  view: ArrangementViewState;
  tool: ArrangementToolMode;
  isArrangementMode: boolean; // True = use arrangement for playback, False = use patternOrder

  // === Selection ===
  selectedClipIds: Set<string>;
  selectedTrackId: string | null;

  // === Drag ===
  drag: ArrangementDragState | null;

  // === Playback ===
  playbackRow: number; // Current global row during playback

  // === Undo/Redo ===
  undoStack: ArrangementSnapshot[];
  redoStack: ArrangementSnapshot[];

  // === Clip CRUD ===
  addClip: (clip: Omit<ArrangementClip, 'id'>) => string;
  removeClip: (clipId: string) => void;
  removeClips: (clipIds: string[]) => void;
  moveClip: (clipId: string, startRow: number, trackId: string) => void;
  moveClips: (clipIds: string[], deltaRow: number, deltaTrackIndex: number) => void;
  resizeClipStart: (clipId: string, newStartRow: number) => void;
  resizeClipEnd: (clipId: string, newEndRow: number) => void;
  splitClip: (clipId: string, splitRow: number) => void;
  duplicateClips: (clipIds: string[]) => string[];
  toggleClipMute: (clipId: string) => void;
  setClipColor: (clipId: string, color: string | null) => void;

  // === Track CRUD ===
  addTrack: (name?: string, instrumentId?: number | null) => string;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;
  updateTrack: (trackId: string, updates: Partial<ArrangementTrack>) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setTrackHeight: (trackId: string, height: number) => void;

  // === Markers ===
  addMarker: (marker: Omit<ArrangementMarker, 'id'>) => string;
  removeMarker: (markerId: string) => void;
  moveMarker: (markerId: string, row: number) => void;
  updateMarker: (markerId: string, updates: Partial<ArrangementMarker>) => void;

  // === Groups ===
  addGroup: (name: string) => string;
  removeGroup: (groupId: string) => void;
  assignTrackToGroup: (trackId: string, groupId: string | null) => void;
  toggleGroupCollapse: (groupId: string) => void;

  // === Selection ===
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  clearSelection: () => void;
  selectClipsInRange: (startRow: number, endRow: number, trackIds: string[]) => void;
  selectAllClipsOnTrack: (trackId: string) => void;

  // === View ===
  setPixelsPerRow: (ppr: number) => void;
  setScrollRow: (row: number) => void;
  setScrollY: (y: number) => void;
  setSnapDivision: (snap: number) => void;
  setFollowPlayback: (follow: boolean) => void;
  setLoopRegion: (start: number | null, end: number | null) => void;
  clearLoopRegion: () => void;
  zoomToFit: () => void;
  setTool: (tool: ArrangementToolMode) => void;
  setIsArrangementMode: (mode: boolean) => void;

  // === Drag ===
  setDrag: (drag: ArrangementDragState | null) => void;

  // === Playback ===
  setPlaybackRow: (row: number) => void;

  // === Automation ===
  addAutomationLane: (trackId: string, parameter: string) => string;
  removeAutomationLane: (laneId: string) => void;
  addAutomationPoint: (laneId: string, point: TimelineAutomationPoint) => void;
  removeAutomationPoint: (laneId: string, index: number) => void;
  moveAutomationPoint: (laneId: string, index: number, row: number, value: number) => void;
  toggleAutomationLaneVisibility: (laneId: string) => void;

  // === Undo/Redo ===
  pushUndo: (preSnapshot?: ArrangementSnapshot) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // === Migration ===
  importFromPatternOrder: (patternOrder: number[], patterns: Pattern[]) => void;

  // === Snapshot ===
  getSnapshot: () => ArrangementSnapshot;
  loadSnapshot: (snapshot: ArrangementSnapshot) => void;

  // === Computed ===
  getTotalRows: () => number;
  getClipsForTrack: (trackId: string) => ArrangementClip[];
  getClipEndRow: (clip: ArrangementClip, patterns: Pattern[]) => number;
}

// ============================================================================
// STORE
// ============================================================================

export const useArrangementStore = create<ArrangementStore>()(
  immer((set, get) => ({
    // === Initial State ===
    tracks: [],
    clips: [],
    markers: [],
    groups: [],
    automationLanes: [],

    view: {
      pixelsPerRow: 4,
      scrollRow: 0,
      scrollY: 0,
      snapDivision: 1,
      followPlayback: true,
      loopStart: null,
      loopEnd: null,
    },
    tool: 'select',
    isArrangementMode: false,

    selectedClipIds: new Set<string>(),
    selectedTrackId: null,

    drag: null,
    playbackRow: 0,

    undoStack: [],
    redoStack: [],

    // === Clip CRUD ===

    addClip: (clipData) => {
      const id = generateId('clip');
      set((state) => {
        state.clips.push({ ...clipData, id });
      });
      return id;
    },

    removeClip: (clipId) =>
      set((state) => {
        state.clips = state.clips.filter(c => c.id !== clipId);
        state.selectedClipIds.delete(clipId);
      }),

    removeClips: (clipIds) =>
      set((state) => {
        const idSet = new Set(clipIds);
        state.clips = state.clips.filter(c => !idSet.has(c.id));
        for (const id of clipIds) {
          state.selectedClipIds.delete(id);
        }
      }),

    moveClip: (clipId, startRow, trackId) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) {
          clip.startRow = Math.max(0, startRow);
          clip.trackId = trackId;
        }
      }),

    moveClips: (clipIds, deltaRow, deltaTrackIndex) =>
      set((state) => {
        const tracksByIndex = [...state.tracks].sort((a, b) => a.index - b.index);
        for (const id of clipIds) {
          const clip = state.clips.find(c => c.id === id);
          if (!clip) continue;
          clip.startRow = Math.max(0, clip.startRow + deltaRow);
          if (deltaTrackIndex !== 0) {
            const currentTrack = state.tracks.find(t => t.id === clip.trackId);
            if (currentTrack) {
              const newIdx = Math.max(0, Math.min(tracksByIndex.length - 1, currentTrack.index + deltaTrackIndex));
              const newTrack = tracksByIndex[newIdx];
              if (newTrack) clip.trackId = newTrack.id;
            }
          }
        }
      }),

    resizeClipStart: (clipId, newStartRow) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const clampedStart = Math.max(0, newStartRow);
        const delta = clampedStart - clip.startRow;
        if (delta === 0) return;
        clip.offsetRows = Math.max(0, clip.offsetRows + delta);
        clip.startRow = clampedStart;
        if (clip.clipLengthRows !== null) {
          clip.clipLengthRows = Math.max(1, clip.clipLengthRows - delta);
        }
      }),

    resizeClipEnd: (clipId, newEndRow) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const newLength = Math.max(1, newEndRow - clip.startRow);
        clip.clipLengthRows = newLength;
      }),

    splitClip: (clipId, splitRow) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return;
        const endRow = clip.startRow + (clip.clipLengthRows ?? 64);
        if (splitRow <= clip.startRow || splitRow >= endRow) return;

        const secondClipId = generateId('clip');
        const rowsBeforeSplit = splitRow - clip.startRow;

        // Second half
        state.clips.push({
          id: secondClipId,
          patternId: clip.patternId,
          trackId: clip.trackId,
          startRow: splitRow,
          offsetRows: clip.offsetRows + rowsBeforeSplit,
          clipLengthRows: clip.clipLengthRows !== null
            ? clip.clipLengthRows - rowsBeforeSplit
            : null,
          sourceChannelIndex: clip.sourceChannelIndex,
          color: clip.color,
          muted: clip.muted,
        });

        // Trim first half
        clip.clipLengthRows = rowsBeforeSplit;
      }),

    duplicateClips: (clipIds) => {
      const newIds: string[] = [];
      set((state) => {
        for (const id of clipIds) {
          const clip = state.clips.find(c => c.id === id);
          if (!clip) continue;
          const newId = generateId('clip');
          const length = clip.clipLengthRows ?? 64;
          state.clips.push({
            ...clip,
            id: newId,
            startRow: clip.startRow + length,
          });
          newIds.push(newId);
        }
      });
      return newIds;
    },

    toggleClipMute: (clipId) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) clip.muted = !clip.muted;
      }),

    setClipColor: (clipId, color) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) clip.color = color;
      }),

    // === Track CRUD ===

    addTrack: (name?, instrumentId?) => {
      const id = generateId('track');
      set((state) => {
        const index = state.tracks.length;
        state.tracks.push({
          id,
          name: name ?? `Track ${index + 1}`,
          index,
          color: TRACK_COLORS[index % TRACK_COLORS.length],
          volume: 100,
          pan: 0,
          muted: false,
          solo: false,
          collapsed: false,
          height: 80,
          groupId: null,
          instrumentId: instrumentId ?? null,
          automationVisible: false,
          automationParameter: null,
        });
      });
      return id;
    },

    removeTrack: (trackId) =>
      set((state) => {
        state.tracks = state.tracks.filter(t => t.id !== trackId);
        state.clips = state.clips.filter(c => c.trackId !== trackId);
        state.automationLanes = state.automationLanes.filter(l => l.trackId !== trackId);
        // Re-index remaining tracks
        state.tracks.sort((a, b) => a.index - b.index).forEach((t, i) => { t.index = i; });
      }),

    reorderTrack: (trackId, newIndex) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return;
        const oldIndex = track.index;
        if (oldIndex === newIndex) return;

        for (const t of state.tracks) {
          if (t.id === trackId) {
            t.index = newIndex;
          } else if (oldIndex < newIndex && t.index > oldIndex && t.index <= newIndex) {
            t.index--;
          } else if (oldIndex > newIndex && t.index >= newIndex && t.index < oldIndex) {
            t.index++;
          }
        }
      }),

    updateTrack: (trackId, updates) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return;
        const { id: trackIdIgnored, ...safeUpdates } = updates;
        void trackIdIgnored;
        Object.assign(track, safeUpdates);
      }),

    toggleTrackMute: (trackId) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) track.muted = !track.muted;
      }),

    toggleTrackSolo: (trackId) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) track.solo = !track.solo;
      }),

    setTrackHeight: (trackId, height) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) track.height = Math.max(30, Math.min(200, height));
      }),

    // === Markers ===

    addMarker: (markerData) => {
      const id = generateId('marker');
      set((state) => {
        state.markers.push({ ...markerData, id });
      });
      return id;
    },

    removeMarker: (markerId) =>
      set((state) => {
        state.markers = state.markers.filter(m => m.id !== markerId);
      }),

    moveMarker: (markerId, row) =>
      set((state) => {
        const marker = state.markers.find(m => m.id === markerId);
        if (marker) marker.row = Math.max(0, row);
      }),

    updateMarker: (markerId, updates) =>
      set((state) => {
        const marker = state.markers.find(m => m.id === markerId);
        if (marker) Object.assign(marker, updates);
      }),

    // === Groups ===

    addGroup: (name) => {
      const id = generateId('group');
      set((state) => {
        state.groups.push({
          id,
          name,
          color: null,
          collapsed: false,
          index: state.groups.length,
        });
      });
      return id;
    },

    removeGroup: (groupId) =>
      set((state) => {
        state.groups = state.groups.filter(g => g.id !== groupId);
        // Unassign tracks from this group
        for (const t of state.tracks) {
          if (t.groupId === groupId) t.groupId = null;
        }
      }),

    assignTrackToGroup: (trackId, groupId) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) track.groupId = groupId;
      }),

    toggleGroupCollapse: (groupId) =>
      set((state) => {
        const group = state.groups.find(g => g.id === groupId);
        if (group) group.collapsed = !group.collapsed;
      }),

    // === Selection ===

    selectClip: (clipId, addToSelection = false) =>
      set((state) => {
        if (!addToSelection) {
          state.selectedClipIds = new Set([clipId]);
        } else {
          state.selectedClipIds.add(clipId);
        }
      }),

    selectClips: (clipIds) =>
      set((state) => {
        state.selectedClipIds = new Set(clipIds);
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedClipIds = new Set();
      }),

    selectClipsInRange: (startRow, endRow, trackIds) =>
      set((state) => {
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const trackSet = new Set(trackIds);
        const selected = new Set<string>();

        for (const clip of state.clips) {
          if (!trackSet.has(clip.trackId)) continue;
          const clipEnd = clip.startRow + (clip.clipLengthRows ?? 64);
          if (clip.startRow < maxRow && clipEnd > minRow) {
            selected.add(clip.id);
          }
        }

        state.selectedClipIds = selected;
      }),

    selectAllClipsOnTrack: (trackId) =>
      set((state) => {
        state.selectedClipIds = new Set(
          state.clips.filter(c => c.trackId === trackId).map(c => c.id)
        );
      }),

    // === View ===

    setPixelsPerRow: (ppr) =>
      set((state) => {
        state.view.pixelsPerRow = Math.max(0.5, Math.min(32, ppr));
      }),

    setScrollRow: (row) =>
      set((state) => {
        state.view.scrollRow = Math.max(0, row);
      }),

    setScrollY: (y) =>
      set((state) => {
        state.view.scrollY = Math.max(0, y);
      }),

    setSnapDivision: (snap) =>
      set((state) => {
        state.view.snapDivision = snap;
      }),

    setFollowPlayback: (follow) =>
      set((state) => {
        state.view.followPlayback = follow;
      }),

    setLoopRegion: (start, end) =>
      set((state) => {
        state.view.loopStart = start;
        state.view.loopEnd = end;
      }),

    clearLoopRegion: () =>
      set((state) => {
        state.view.loopStart = null;
        state.view.loopEnd = null;
      }),

    zoomToFit: () =>
      set((state) => {
        const totalRows = getTotalRowsFromState(state);
        if (totalRows <= 0) return;
        // Assume ~800px canvas width; this will be recalculated by the component
        state.view.pixelsPerRow = Math.max(0.5, Math.min(32, 800 / totalRows));
        state.view.scrollRow = 0;
        state.view.scrollY = 0;
      }),

    setTool: (tool) =>
      set((state) => {
        state.tool = tool;
      }),

    setIsArrangementMode: (mode) =>
      set((state) => {
        state.isArrangementMode = mode;
      }),

    // === Drag ===

    setDrag: (drag) =>
      set((state) => {
        state.drag = drag;
      }),

    // === Playback ===

    setPlaybackRow: (row) =>
      set((state) => {
        state.playbackRow = row;
      }),

    // === Automation ===

    addAutomationLane: (trackId, parameter) => {
      const id = generateId('autolane');
      set((state) => {
        state.automationLanes.push({
          id,
          trackId,
          parameter,
          points: [],
          enabled: true,
          visible: true,
        });
      });
      return id;
    },

    removeAutomationLane: (laneId) =>
      set((state) => {
        state.automationLanes = state.automationLanes.filter(l => l.id !== laneId);
      }),

    addAutomationPoint: (laneId, point) =>
      set((state) => {
        const lane = state.automationLanes.find(l => l.id === laneId);
        if (!lane) return;
        // Insert sorted by row
        const idx = lane.points.findIndex(p => p.row > point.row);
        if (idx === -1) {
          lane.points.push(point);
        } else {
          lane.points.splice(idx, 0, point);
        }
      }),

    removeAutomationPoint: (laneId, index) =>
      set((state) => {
        const lane = state.automationLanes.find(l => l.id === laneId);
        if (lane && index >= 0 && index < lane.points.length) {
          lane.points.splice(index, 1);
        }
      }),

    moveAutomationPoint: (laneId, index, row, value) =>
      set((state) => {
        const lane = state.automationLanes.find(l => l.id === laneId);
        if (!lane || !lane.points[index]) return;
        // Remove from current position, update, and re-insert sorted
        const [point] = lane.points.splice(index, 1);
        point.row = Math.max(0, row);
        point.value = Math.max(0, Math.min(1, value));
        const insertIdx = lane.points.findIndex(p => p.row > point.row);
        if (insertIdx === -1) {
          lane.points.push(point);
        } else {
          lane.points.splice(insertIdx, 0, point);
        }
      }),

    toggleAutomationLaneVisibility: (laneId) =>
      set((state) => {
        const lane = state.automationLanes.find(l => l.id === laneId);
        if (lane) lane.visible = !lane.visible;
      }),

    // === Undo/Redo ===

    pushUndo: (preSnapshot?) =>
      set((state) => {
        const snapshot = preSnapshot ?? getSnapshotFromState(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > 50) state.undoStack.shift();
        state.redoStack = [];
      }),

    undo: () =>
      set((state) => {
        if (state.undoStack.length === 0) return;
        const current = getSnapshotFromState(state);
        state.redoStack.push(current);
        const prev = state.undoStack.pop()!;
        applySnapshot(state, prev);
      }),

    redo: () =>
      set((state) => {
        if (state.redoStack.length === 0) return;
        const current = getSnapshotFromState(state);
        state.undoStack.push(current);
        const next = state.redoStack.pop()!;
        applySnapshot(state, next);
      }),

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // === Migration ===

    importFromPatternOrder: (patternOrder, patterns) =>
      set((state) => {
        if (patterns.length === 0 || patternOrder.length === 0) return;

        // Determine channel count from first pattern
        const numChannels = patterns[0]?.channels?.length ?? 1;

        // Create one track per channel
        state.tracks = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const channelData = patterns[0].channels[ch];
          state.tracks.push({
            id: generateId('track'),
            name: channelData?.name ?? `Track ${ch + 1}`,
            index: ch,
            color: channelData?.color ?? TRACK_COLORS[ch % TRACK_COLORS.length],
            volume: channelData?.volume ?? 100,
            pan: channelData?.pan ?? 0,
            muted: channelData?.muted ?? false,
            solo: channelData?.solo ?? false,
            collapsed: false,
            height: 80,
            groupId: null,
            instrumentId: channelData?.instrumentId ?? null,
            automationVisible: false,
            automationParameter: null,
          });
        }

        // Place clips sequentially along the timeline
        state.clips = [];
        let currentRow = 0;
        for (const patIdx of patternOrder) {
          const pattern = patterns[patIdx];
          if (!pattern) continue;

          for (let ch = 0; ch < numChannels; ch++) {
            const track = state.tracks[ch];
            if (!track) continue;
            state.clips.push({
              id: generateId('clip'),
              patternId: pattern.id,
              trackId: track.id,
              startRow: currentRow,
              offsetRows: 0,
              clipLengthRows: null, // Full pattern length
              sourceChannelIndex: ch,
              color: null,
              muted: false,
            });
          }

          currentRow += pattern.length;
        }

        // Clear markers, groups, automation
        state.markers = [];
        state.groups = [];
        state.automationLanes = [];
        state.isArrangementMode = true;
      }),

    // === Snapshot ===

    getSnapshot: () => getSnapshotFromState(get()),

    loadSnapshot: (snapshot) =>
      set((state) => {
        applySnapshot(state, snapshot);
      }),

    // === Computed ===

    getTotalRows: () => getTotalRowsFromState(get()),

    getClipsForTrack: (trackId) => get().clips.filter(c => c.trackId === trackId),

    getClipEndRow: (clip, patterns) => {
      if (clip.clipLengthRows !== null) {
        return clip.startRow + clip.clipLengthRows;
      }
      const pattern = patterns.find(p => p.id === clip.patternId);
      return clip.startRow + (pattern?.length ?? 64) - clip.offsetRows;
    },
  }))
);

// ============================================================================
// SNAPSHOT HELPERS
// ============================================================================

function getSnapshotFromState(state: {
  tracks: ArrangementTrack[];
  clips: ArrangementClip[];
  markers: ArrangementMarker[];
  groups: TrackGroup[];
  automationLanes: TimelineAutomationLane[];
}): ArrangementSnapshot {
  return JSON.parse(JSON.stringify({
    tracks: state.tracks,
    clips: state.clips,
    markers: state.markers,
    groups: state.groups,
    automationLanes: state.automationLanes,
  }));
}

function applySnapshot(
  state: {
    tracks: ArrangementTrack[];
    clips: ArrangementClip[];
    markers: ArrangementMarker[];
    groups: TrackGroup[];
    automationLanes: TimelineAutomationLane[];
  },
  snapshot: ArrangementSnapshot
): void {
  state.tracks = snapshot.tracks;
  state.clips = snapshot.clips;
  state.markers = snapshot.markers;
  state.groups = snapshot.groups;
  state.automationLanes = snapshot.automationLanes;
}

function getTotalRowsFromState(state: {
  clips: ArrangementClip[];
}): number {
  let maxRow = 0;
  for (const clip of state.clips) {
    const endRow = clip.startRow + (clip.clipLengthRows ?? 64);
    if (endRow > maxRow) maxRow = endRow;
  }
  return maxRow;
}
