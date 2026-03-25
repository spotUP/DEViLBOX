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
  setClipName: (clipId: string, name: string) => void;
  setClipLength: (clipId: string, rows: number | undefined) => void;
  setClipLoop: (clipId: string, loop: boolean) => void;

  // === Rename UI state (not persisted) ===
  renamingClipId: string | null;
  setRenamingClipId: (id: string | null) => void;

  // === Context menu UI state (not persisted) ===
  clipContextMenu: { clipId: string; screenX: number; screenY: number } | null;
  setClipContextMenu: (menu: { clipId: string; screenX: number; screenY: number } | null) => void;

  // === Track CRUD ===
  addTrack: (name?: string, instrumentId?: number | null) => string;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;
  updateTrack: (trackId: string, updates: Partial<ArrangementTrack>) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setTrackHeight: (trackId: string, height: number) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;

  // === Track rename/color UI state (not persisted) ===
  renamingTrackId: string | null;
  setRenamingTrackId: (id: string | null) => void;
  cycleTrackColor: (trackId: string) => void;

  // === Markers ===
  addMarker: (marker: Omit<ArrangementMarker, 'id'>) => string;
  removeMarker: (markerId: string) => void;
  moveMarker: (markerId: string, row: number) => void;
  updateMarker: (markerId: string, updates: Partial<ArrangementMarker>) => void;
  addTimeSigMarker: (row: number, num: number, denom: number) => string;

  // === Marker rename UI state (not persisted) ===
  renamingMarkerId: string | null;
  setRenamingMarkerId: (id: string | null) => void;

  // === Groups ===
  addGroup: (name: string) => string;
  removeGroup: (groupId: string) => void;
  assignTrackToGroup: (trackId: string, groupId: string | null) => void;
  toggleGroupCollapse: (groupId: string) => void;
  toggleGroupFold: (groupId: string) => void;

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

  // === Clone ===
  /** Clone the clip's pattern as a new independent pattern, update clip reference. */
  cloneClipAsNewPattern: (clipId: string) => void;

  // === Tracker Integration ===
  /** Jump to tracker view at the clip's pattern and row. Returns {patternIndex, row} or null. */
  getClipTrackerPosition: (clipId: string) => { patternIndex: number; row: number } | null;

  /** Auto-create arrangement tracks 1:1 with pattern channels. */
  syncTracksToChannels: () => void;

  // === View ===
  /** Ruler display mode: 'bars' (default) or 'rows' */
  rulerMode: 'bars' | 'rows';
  setRulerMode: (mode: 'bars' | 'rows') => void;

  // === Consolidate ===
  /** Merge all selected clips on the same track into a single new pattern+clip per track. */
  consolidateClips: (clipIds: string[]) => void;

  // === Computed ===
  getTotalRows: () => number;
  getClipsForTrack: (trackId: string) => ArrangementClip[];
  getClipEndRow: (clip: ArrangementClip, patterns: Pattern[]) => number;
  /** Returns the display label for the current snapDivision given the active patternLength.
   *  e.g. snapDivision === patternLength → "1 bar", otherwise falls back to row count. */
  getSnapLabel: (patternLength: number) => string;
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
      showPatternMatrix: false,
      showPatternOrder: true,
    },
    tool: 'select',
    isArrangementMode: false,
    rulerMode: 'bars' as const,

    selectedClipIds: new Set<string>(),
    selectedTrackId: null,

    drag: null,
    playbackRow: 0,
    renamingClipId: null,
    renamingMarkerId: null,

    undoStack: [],
    redoStack: [],

    // === Clip CRUD ===

    addClip: (clipData) => {
      const id = generateId('clip');
      set((state) => {
        // Overlap prevention: auto-trim new clip against same-track clips.
        let startRow = clipData.startRow;
        let clipLengthRows = clipData.clipLengthRows;
        const newEnd = startRow + (clipLengthRows ?? 64);

        const sameTrack = state.clips.filter(c => c.trackId === clipData.trackId);
        // Sort by startRow so we can find the immediate predecessor and successor.
        sameTrack.sort((a, b) => a.startRow - b.startRow);

        for (const existing of sameTrack) {
          const existEnd = existing.startRow + (existing.clipLengthRows ?? 64);
          // Check if the new clip overlaps this existing clip.
          if (startRow < existEnd && newEnd > existing.startRow) {
            // Two possible resolutions:
            // a) Push new clip's start to after existing clip's end.
            // b) Trim new clip's end to before existing clip's start.
            const violationPushStart = existEnd - startRow;       // rows to lose at the front
            const violationTrimEnd = newEnd - existing.startRow;  // rows to lose at the back

            if (violationPushStart <= violationTrimEnd) {
              // Smaller violation: push start forward
              startRow = existEnd;
            } else {
              // Smaller violation: trim end back
              if (clipLengthRows !== null) {
                clipLengthRows = existing.startRow - startRow;
              }
            }
          }
        }

        // If the clip has been trimmed to 0 or negative width, don't add it.
        const finalLength = clipLengthRows ?? 64;
        if (finalLength <= 0 || startRow < 0) return;

        state.clips.push({
          id,
          ...clipData,
          startRow,
          clipLengthRows,
          // Defaults for new DAW features (applied only if not provided)
          fadeInRows: clipData.fadeInRows ?? 0,
          fadeOutRows: clipData.fadeOutRows ?? 0,
          fadeInCurve: clipData.fadeInCurve ?? 'linear',
          fadeOutCurve: clipData.fadeOutCurve ?? 'linear',
          gain: clipData.gain ?? 1.0,
          transpose: clipData.transpose ?? 0,
          reversed: clipData.reversed ?? false,
          timeStretch: clipData.timeStretch ?? 1.0,
          crossfadeInRows: clipData.crossfadeInRows ?? 0,
          crossfadeOutRows: clipData.crossfadeOutRows ?? 0,
        });
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

        // Second half - copy all properties from original clip
        state.clips.push({
          ...clip, // Copy all existing properties
          id: secondClipId,
          startRow: splitRow,
          offsetRows: clip.offsetRows + rowsBeforeSplit,
          clipLengthRows: clip.clipLengthRows !== null
            ? clip.clipLengthRows - rowsBeforeSplit
            : null,
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

    setClipName: (clipId, name) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) clip.name = name || undefined;
      }),

    setClipLength: (clipId, rows) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) clip.clipLength = rows;
      }),

    setClipLoop: (clipId, loop) =>
      set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) clip.loopClip = loop;
      }),

    setRenamingClipId: (id) =>
      set((state) => { state.renamingClipId = id; }),

    clipContextMenu: null,
    setClipContextMenu: (menu) =>
      set((state) => { state.clipContextMenu = menu as any; }),

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
          // New DAW features
          frozen: false,
          armRecord: false,
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

    setTrackVolume: (trackId, volume) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) track.volume = Math.max(0, Math.min(100, volume));
      }),

    setTrackPan: (trackId, pan) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (track) track.pan = Math.max(-100, Math.min(100, pan));
      }),

    renamingTrackId: null,
    setRenamingTrackId: (id) =>
      set((state) => { state.renamingTrackId = id; }),

    cycleTrackColor: (trackId) =>
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return;
        const currentIdx = TRACK_COLORS.indexOf(track.color ?? '');
        track.color = TRACK_COLORS[(currentIdx + 1) % TRACK_COLORS.length];
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

    addTimeSigMarker: (row, num, denom) => {
      const id = generateId('marker');
      set((state) => {
        state.markers.push({
          id,
          row,
          name: `${num}/${denom}`,
          type: 'timesig',
          color: '#f59e0b',
          timeSigNum: num,
          timeSigDenom: denom,
        });
      });
      return id;
    },

    setRenamingMarkerId: (id) =>
      set((state) => { state.renamingMarkerId = id; }),

    // === Groups ===

    addGroup: (name) => {
      const id = generateId('group');
      set((state) => {
        state.groups.push({
          id,
          name,
          color: null,
          collapsed: false,
          folded: false,  // New feature
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

    toggleGroupFold: (groupId) =>
      set((state) => {
        const group = state.groups.find(g => g.id === groupId);
        if (group) group.folded = !group.folded;
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
        // Add defaults for new curve features
        const pointWithDefaults = {
          ...point,
          curve: point.curve ?? ('linear' as const),
          tension: point.tension ?? 0.5,
        };
        // Insert sorted by row
        const idx = lane.points.findIndex(p => p.row > point.row);
        if (idx === -1) {
          lane.points.push(pointWithDefaults);
        } else {
          lane.points.splice(idx, 0, pointWithDefaults);
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
            frozen: false,
            armRecord: false,
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
              fadeInRows: 0,
              fadeOutRows: 0,
              fadeInCurve: 'linear',
              fadeOutCurve: 'linear',
              gain: 1.0,
              transpose: 0,
              reversed: false,
              timeStretch: 1.0,
              crossfadeInRows: 0,
              crossfadeOutRows: 0,
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

    // === Clone ===

    cloneClipAsNewPattern: (clipId) => {
      const clip = get().clips.find(c => c.id === clipId);
      if (!clip) return;

      // Use tracker store to clone the underlying pattern
      const { useTrackerStore } = require('@stores');
      const trackerState = useTrackerStore.getState();
      const patternIndex = trackerState.patterns.findIndex((p: { id: string }) => p.id === clip.patternId);
      if (patternIndex < 0) return;

      // Clone pattern (creates new pattern at patternIndex + 1)
      trackerState.clonePattern(patternIndex);

      // Get the new pattern's ID
      const newPatternId = useTrackerStore.getState().patterns[patternIndex + 1]?.id;
      if (!newPatternId) return;

      // Update clip to reference the new pattern
      set((state) => {
        const c = state.clips.find(c2 => c2.id === clipId);
        if (c) c.patternId = newPatternId;
      });
    },

    // === Tracker Integration ===

    getClipTrackerPosition: (clipId) => {
      const clip = get().clips.find(c => c.id === clipId);
      if (!clip) return null;

      const { useTrackerStore } = require('@stores');
      const patterns = useTrackerStore.getState().patterns;
      const patternIndex = patterns.findIndex((p: { id: string }) => p.id === clip.patternId);
      if (patternIndex < 0) return null;

      return { patternIndex, row: clip.offsetRows ?? 0 };
    },

    syncTracksToChannels: () => {
      const { useTrackerStore } = require('@stores');
      const trackerState = useTrackerStore.getState();
      const pattern = trackerState.patterns[trackerState.currentPatternIndex];
      if (!pattern) return;

      set((state) => {
        // Remove existing tracks
        state.tracks = [];
        state.clips = [];

        // Create one track per channel
        const channelColors = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#f06595'];
        pattern.channels.forEach((ch: { name?: string; instrumentId?: number | null }, i: number) => {
          const trackId = generateId('track');
          state.tracks.push({
            id: trackId,
            name: ch.name || `Channel ${i + 1}`,
            index: i,
            volume: 100,
            pan: 0,
            muted: false,
            solo: false,
            collapsed: false,
            color: channelColors[i % channelColors.length],
            height: 60,
            instrumentId: ch.instrumentId ?? null,
            groupId: null,
            automationVisible: false,
            automationParameter: null,
            frozen: false,
            armRecord: false,
          });

          // Create a clip for each pattern at this channel position
          trackerState.patternOrder.forEach((patIdx: number, posIdx: number) => {
            const pat = trackerState.patterns[patIdx];
            if (!pat) return;
            state.clips.push({
              id: generateId('clip'),
              trackId,
              patternId: pat.id,
              startRow: posIdx * pat.length,
              sourceChannelIndex: i,
              muted: false,
              offsetRows: 0,
              clipLengthRows: null,
              color: null,
            });
          });
        });
      });
    },

    // === View ===

    setRulerMode: (mode) =>
      set((state) => {
        state.rulerMode = mode;
      }),

    // === Consolidate ===

    consolidateClips: (clipIds) => {
      if (clipIds.length < 2) return;

      const state = get();
      const clipsToMerge = state.clips.filter(c => clipIds.includes(c.id));
      if (clipsToMerge.length < 2) return;

      // Lazily import tracker store to avoid circular deps at module load time
      import('@stores/useTrackerStore').then(({ useTrackerStore }) => {
        const trackerState = useTrackerStore.getState();
        const allPatterns = trackerState.patterns;

        // Group clips by trackId — consolidate per track independently
        const byTrack = new Map<string, ArrangementClip[]>();
        for (const clip of clipsToMerge) {
          const group = byTrack.get(clip.trackId) ?? [];
          group.push(clip);
          byTrack.set(clip.trackId, group);
        }

        const idsToRemove: string[] = [];
        const clipsToAdd: Omit<ArrangementClip, 'id'>[] = [];
        const newPatterns: Pattern[] = [];

        for (const [, trackClips] of byTrack) {
          if (trackClips.length < 2) continue;

          // Sort by start position
          trackClips.sort((a, b) => a.startRow - b.startRow);

          const minStart = trackClips[0].startRow;
          const maxEnd = Math.max(...trackClips.map(c => {
            const pattern = allPatterns.find(p => p.id === c.patternId);
            const len = c.clipLengthRows ?? (pattern ? pattern.length - c.offsetRows : 64);
            return c.startRow + len;
          }));
          const totalLength = maxEnd - minStart;
          if (totalLength <= 0) continue;

          // Pick channel count from first clip's source pattern
          const firstPattern = allPatterns.find(p => p.id === trackClips[0].patternId);
          const numChannels = firstPattern?.channels.length ?? 1;

          // Build merged pattern: empty rows × channels
          const mergedChannels: Pattern['channels'] = Array.from({ length: numChannels }, (_, i) => ({
            id: `ch-${i}`,
            name: firstPattern?.channels[i]?.name ?? `Channel ${i + 1}`,
            rows: Array.from({ length: totalLength }, () => ({
              note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            })),
            muted: firstPattern?.channels[i]?.muted ?? false,
            solo: false,
            collapsed: false,
            volume: firstPattern?.channels[i]?.volume ?? 80,
            pan: firstPattern?.channels[i]?.pan ?? 0,
            instrumentId: firstPattern?.channels[i]?.instrumentId ?? null,
            color: firstPattern?.channels[i]?.color ?? null,
          }));

          // Copy each clip's data into merged pattern at the correct row offset
          for (const clip of trackClips) {
            const srcPattern = allPatterns.find(p => p.id === clip.patternId);
            if (!srcPattern) continue;

            const clipLen = clip.clipLengthRows ?? (srcPattern.length - clip.offsetRows);
            const destOffset = clip.startRow - minStart;
            const srcChannelIndex = clip.sourceChannelIndex;
            const srcChannel = srcPattern.channels[srcChannelIndex];
            if (!srcChannel) continue;

            for (let row = 0; row < clipLen; row++) {
              const srcRow = clip.offsetRows + row;
              const destRow = destOffset + row;
              if (srcRow >= srcChannel.rows.length) break;
              if (destRow >= totalLength) break;

              // Copy into the matching channel (sourceChannelIndex maps to same index in merged)
              const destChannel = mergedChannels[srcChannelIndex];
              if (!destChannel) continue;
              destChannel.rows[destRow] = { ...srcChannel.rows[srcRow] };
            }
          }

          const mergedPattern: Pattern = {
            id: `pattern-consolidated-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: 'Consolidated',
            length: totalLength,
            channels: mergedChannels,
          };

          newPatterns.push(mergedPattern);

          // Queue removal of original clips
          for (const clip of trackClips) idsToRemove.push(clip.id);

          // Queue addition of new consolidated clip
          clipsToAdd.push({
            patternId: mergedPattern.id,
            trackId: trackClips[0].trackId,
            startRow: minStart,
            offsetRows: 0,
            clipLengthRows: totalLength,
            sourceChannelIndex: trackClips[0].sourceChannelIndex,
            color: null,
            muted: false,
            fadeInRows: 0,
            fadeOutRows: 0,
            fadeInCurve: 'linear',
            fadeOutCurve: 'linear',
            gain: 1.0,
            transpose: 0,
            reversed: false,
            timeStretch: 1.0,
            crossfadeInRows: 0,
            crossfadeOutRows: 0,
          });
        }

        if (newPatterns.length === 0) return;

        // Import new patterns into tracker store
        for (const pattern of newPatterns) {
          trackerState.importPattern(pattern);
        }

        // Apply clip replacements to arrangement store
        set((draft) => {
          const idSet = new Set(idsToRemove);
          draft.clips = draft.clips.filter(c => !idSet.has(c.id));
          for (const id of idsToRemove) draft.selectedClipIds.delete(id);
          for (const clipData of clipsToAdd) {
            const newId = generateId('clip');
            draft.clips.push({ id: newId, ...clipData });
            draft.selectedClipIds.add(newId);
          }
        });
      });
    },

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

    getSnapLabel: (patternLength) => {
      const snap = get().view.snapDivision;
      if (snap === 0) return 'Off';
      if (snap === 1) return 'Row';
      if (patternLength > 0 && snap === patternLength) return '1 bar';
      if (patternLength > 0 && patternLength % snap === 0) {
        const barsPerSnap = patternLength / snap;
        if (barsPerSnap > 1) return `1/${barsPerSnap} bar`;
        if (barsPerSnap < 1) return `${Math.round(1 / barsPerSnap)} bars`;
      }
      return `${snap} rows`;
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
  return structuredClone({
    tracks: state.tracks,
    clips: state.clips,
    markers: state.markers,
    groups: state.groups,
    automationLanes: state.automationLanes,
  });
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
