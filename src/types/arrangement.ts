/**
 * Arrangement Types - DAW-style timeline data structures
 *
 * The arrangement view is a horizontal multi-track timeline with clips,
 * track headers, markers, automation lanes, and note density previews.
 *
 * Time unit: Rows (native to tracker). Beat/bar conversion for display only:
 * - 1 beat = speed rows (default 6)
 * - 1 bar = beatsPerBar * speed rows (default 4 * 6 = 24)
 */

/**
 * A clip on the arrangement timeline.
 * Clips are references to patterns (shared data, not copies).
 */
export interface ArrangementClip {
  id: string;
  patternId: string;            // References Pattern.id
  trackId: string;              // Which arrangement track
  startRow: number;             // Position on timeline (global rows)
  offsetRows: number;           // Trim start (skip N rows of pattern)
  clipLengthRows: number | null; // Trim end (null = full pattern length)
  sourceChannelIndex: number;   // Which channel of the pattern to use
  color: string | null;         // Override color (null = use track color)
  muted: boolean;
}

/**
 * A track in the arrangement.
 * Tracks are horizontal lanes that contain clips.
 */
export interface ArrangementTrack {
  id: string;
  name: string;
  index: number;                // Vertical position (sort order)
  color: string | null;
  volume: number;               // 0-100
  pan: number;                  // -100 to 100
  muted: boolean;
  solo: boolean;
  collapsed: boolean;
  height: number;               // Track height in pixels (default 60)
  groupId: string | null;       // Optional group membership
  instrumentId: number | null;  // Linked instrument
  automationVisible: boolean;
  automationParameter: string | null;
}

/**
 * A collapsible group of tracks.
 */
export interface TrackGroup {
  id: string;
  name: string;
  color: string | null;
  collapsed: boolean;
  index: number;                // Sort order among groups
}

/**
 * A marker on the timeline (section label, loop point, tempo change, etc.)
 */
export interface ArrangementMarker {
  id: string;
  row: number;                  // Global row position
  name: string;
  type: 'section' | 'loop-start' | 'loop-end' | 'tempo' | 'cue';
  color: string;
  bpm?: number;                 // For tempo markers
}

/**
 * A single automation point (row + value).
 */
export interface TimelineAutomationPoint {
  row: number;
  value: number;                // 0-1 normalized
}

/**
 * An automation lane attached to a track.
 */
export interface TimelineAutomationLane {
  id: string;
  trackId: string;
  parameter: string;            // e.g. 'volume', 'pan', 'cutoff', 'resonance'
  points: TimelineAutomationPoint[];
  enabled: boolean;
  visible: boolean;
}

/**
 * Serializable snapshot of the entire arrangement state.
 * Used for persistence and undo/redo.
 */
export interface ArrangementSnapshot {
  tracks: ArrangementTrack[];
  clips: ArrangementClip[];
  markers: ArrangementMarker[];
  groups: TrackGroup[];
  automationLanes: TimelineAutomationLane[];
}

/**
 * Arrangement view state (zoom, scroll, snap settings).
 */
export interface ArrangementViewState {
  pixelsPerRow: number;         // Horizontal zoom (default 4)
  scrollRow: number;            // Horizontal scroll position (rows)
  scrollY: number;              // Vertical scroll position (pixels)
  snapDivision: number;         // Snap grid: 1=row, 4=beat, 16=bar, etc.
  followPlayback: boolean;
  loopStart: number | null;     // Loop region start row (null = no loop)
  loopEnd: number | null;       // Loop region end row (null = no loop)
}

/**
 * Tool modes for the arrangement interaction state machine.
 */
export type ArrangementToolMode = 'select' | 'draw' | 'erase' | 'split';

/**
 * Drag interaction state.
 */
export interface ArrangementDragState {
  type: 'move-clips' | 'resize-clip-start' | 'resize-clip-end' | 'select-box' | 'draw-clip' | 'move-playhead' | 'edit-automation' | 'erase';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startRow: number;
  startTrackIndex: number;
  clipIds: string[];            // Clips being dragged
  originalClips: ArrangementClip[]; // Snapshot before drag
}

/**
 * Result of resolving an arrangement into a flat playback schedule.
 */
export interface ResolvedArrangement {
  songPositions: number[];      // Pattern indices in play order
  virtualPatterns: import('./tracker').Pattern[];  // Includes any synthesized sliced patterns
  totalRows: number;
  rowToGlobalRow: Map<number, number>; // Map resolved row → global arrangement row
}
