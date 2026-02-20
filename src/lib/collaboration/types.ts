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

export interface SavedProject {
  patterns: Pattern[];
  instruments: unknown[];
  bpm: number;
  masterEffects?: unknown[];
  metadata?: { name: string; author: string; description: string };
  patternOrder?: number[];
}

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
  | { type: 'peer_cursor'; patternIndex: number; channelIndex: number; rowIndex: number };
