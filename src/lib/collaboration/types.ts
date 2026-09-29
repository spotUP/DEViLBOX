/**
 * Collaboration types — signaling and data channel message definitions
 */

import type { Pattern, TrackerCell } from '@typedefs';

// ─── Signaling messages (WebSocket ↔ server) ──────────────────────────────────

export type SignalingClientMsg =
  | { type: 'create_room' }
  | { type: 'join_room'; roomCode: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice_candidate'; candidate: RTCIceCandidateInit };

export type SignalingServerMsg =
  | { type: 'room_created'; roomCode: string }
  | { type: 'peer_joined' }
  | { type: 'peer_left' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice_candidate'; candidate: RTCIceCandidateInit }
  | { type: 'error'; message: string };

// ─── Data channel messages (peer ↔ peer) ─────────────────────────────────────

/**
 * A whole song sent to a peer: the same snapshot every save uses
 * (snapshotSong). It carried only patterns, instruments, BPM, master chain,
 * metadata and order, so a peer never got a native-engine song's data, speed
 * or mixer (2026-09-29 audit).
 */
export type SavedProject = import('@/lib/song/savedSong').SavedSongFields;

export interface CellOp {
  pi: number;
  ci: number;
  ri: number;
  cell: TrackerCell;
}

export type DataChannelMsg =
  | { type: 'full_sync'; project: SavedProject }
  | { type: 'cell'; pi: number; ci: number; ri: number; cell: TrackerCell }
  | { type: 'patch_batch'; ops: CellOp[] }
  | { type: 'full_pattern'; pi: number; pattern: Pattern }
  | { type: 'pattern_add'; pattern: Pattern }
  | { type: 'pattern_delete'; pi: number }
  | { type: 'bpm'; value: number }
  | { type: 'peer_view'; patternIndex: number }
  | { type: 'peer_cursor'; patternIndex: number; channelIndex: number; rowIndex: number }
  | { type: 'peer_mouse'; nx: number; ny: number }
  | { type: 'peer_selection'; patternIndex: number; startChannel: number; endChannel: number; startRow: number; endRow: number }
  | { type: 'peer_selection_clear' };
