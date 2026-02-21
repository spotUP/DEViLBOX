/**
 * useCollaborationStore — Zustand store for live collaboration session state.
 *
 * Class instances (CollaborationClient, SignalingClient) are module-level
 * singletons — Immer cannot proxy class instances safely.
 * The store holds only primitive/serializable state.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { CollaborationClient } from '@lib/collaboration/CollaborationClient';
import { SignalingClient } from '@lib/collaboration/SignalingClient';
import { startSongSync, stopSongSync, snapshotProject, applyRemotePatch } from '@lib/collaboration/SongSyncLayer';
import type { SignalingServerMsg } from '@lib/collaboration/types';
import { useTrackerStore } from './useTrackerStore';

// ─── Config ───────────────────────────────────────────────────────────────────

const SIGNALING_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_COLLAB_URL ??
  'ws://localhost:4002';

// ─── Module-level singletons (safe from Immer proxy issues) ──────────────────

let _client: CollaborationClient | null = null;
let _signaling: SignalingClient | null = null;
let _isCreator = false;
/** Suppresses echo peer_view when we apply a remote navigation in 'shared' mode */
let _applyingRemotePeerView = false;

export function getCollabClient(): CollaborationClient | null {
  return _client;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CollabStatus = 'idle' | 'creating' | 'joining' | 'waiting' | 'connected' | 'error';
export type ListenMode = 'mine' | 'both' | 'theirs' | 'shared';
export type ViewMode = 'fullscreen' | 'split';

interface CollaborationState {
  // Connection
  status: CollabStatus;
  roomCode: string | null;
  errorMessage: string | null;

  // View
  viewMode: ViewMode;

  // Peer
  peerPatternIndex: number;
  peerCursorRow: number;
  peerCursorChannel: number;
  peerMouseNX: number;
  peerMouseNY: number;
  peerMouseActive: boolean;
  peerSelection: { startChannel: number; endChannel: number; startRow: number; endRow: number; patternIndex: number } | null;

  // Audio
  listenMode: ListenMode;
  micMuted: boolean;

  // Actions
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  disconnect: () => void;
  setViewMode: (mode: ViewMode) => void;
  setListenMode: (mode: ListenMode) => void;
  toggleMic: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCollaborationStore = create<CollaborationState>()(
  immer((set, get) => ({
    status: 'idle',
    roomCode: null,
    errorMessage: null,
    viewMode: 'fullscreen',
    peerPatternIndex: 0,
    peerCursorRow: 0,
    peerCursorChannel: 0,
    peerMouseNX: 0,
    peerMouseNY: 0,
    peerMouseActive: false,
    peerSelection: null,
    listenMode: 'shared',
    micMuted: false,

    createRoom: async () => {
      set((s) => { s.status = 'creating'; s.errorMessage = null; });
      try {
        _teardown();
        _isCreator = true;
        _client = new CollaborationClient();
        _setupClientCallbacks();

        _signaling = new SignalingClient(
          SIGNALING_URL,
          _onSignalingMessage,
          () => {
            const s0 = useCollaborationStore.getState().status;
            console.log('[Collab] Signaling WS closed, status was:', s0);
            if (s0 !== 'connected') {
              set((s) => { s.status = 'error'; s.errorMessage = 'Signaling server disconnected'; });
            }
          },
        );

        await _signaling.connect();
        _signaling.send({ type: 'create_room' });

      } catch (err) {
        set((s) => {
          s.status = 'error';
          s.errorMessage = err instanceof Error ? err.message : 'Failed to create room';
        });
      }
    },

    joinRoom: async (code: string) => {
      const roomCode = code.toUpperCase().trim();
      set((s) => { s.status = 'joining'; s.errorMessage = null; s.roomCode = roomCode; });
      try {
        _teardown();
        _isCreator = false;
        _client = new CollaborationClient();
        _setupClientCallbacks();

        _signaling = new SignalingClient(
          SIGNALING_URL,
          _onSignalingMessage,
          () => {
            const s0 = useCollaborationStore.getState().status;
            console.log('[Collab] Signaling WS closed, status was:', s0);
            if (s0 !== 'connected') {
              set((s) => { s.status = 'error'; s.errorMessage = 'Signaling server disconnected'; });
            }
          },
        );

        await _signaling.connect();
        _signaling.send({ type: 'join_room', roomCode });

      } catch (err) {
        set((s) => {
          s.status = 'error';
          s.errorMessage = err instanceof Error ? err.message : 'Failed to join room';
        });
      }
    },

    disconnect: () => {
      _teardown();
      set((s) => {
        s.status = 'idle';
        s.roomCode = null;
        s.errorMessage = null;
        s.viewMode = 'fullscreen';
        s.peerPatternIndex = 0;
        s.peerCursorRow = 0;
        s.peerCursorChannel = 0;
        s.peerMouseNX = 0;
        s.peerMouseNY = 0;
        s.peerMouseActive = false;
        s.peerSelection = null;
        s.listenMode = 'shared';
        s.micMuted = false;
      });
    },

    setViewMode: (mode) => set((s) => { s.viewMode = mode; }),

    setListenMode: (mode) => {
      set((s) => { s.listenMode = mode; });
      if (!_client) return;
      _client.setRemoteVolume(mode === 'mine' ? 0 : 1);
      // Mute/unmute local Tone.js output for 'theirs' mode
      try {
        const dest = (window as unknown as { Tone?: { getDestination: () => { mute: boolean } } }).Tone?.getDestination();
        if (dest) dest.mute = mode === 'theirs';
      } catch { /* ignore */ }
    },

    toggleMic: () => {
      const muted = !get().micMuted;
      set((s) => { s.micMuted = muted; });
      _client?.muteVoice(muted);
    },
  })),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _teardown(): void {
  stopSongSync();
  _client?.destroy();
  _client = null;
  _signaling?.disconnect();
  _signaling = null;
}

function _setupClientCallbacks(): void {
  if (!_client) return;

  _client.onIceCandidate = (candidate) => {
    _signaling?.send({ type: 'ice_candidate', candidate });
  };

  _client.onConnected = () => {
    useCollaborationStore.setState((s) => {
      s.status = 'connected';
      s.viewMode = 'split';
    });

    if (!_client) return;
    startSongSync(_client);

    // Broadcast our current cursor position immediately so the peer sees it
    // without needing to wait for us to move the cursor.
    setTimeout(() => {
      const ts = useTrackerStore.getState();
      _client?.send({
        type: 'peer_cursor',
        patternIndex: ts.currentPatternIndex,
        channelIndex: ts.cursor.channelIndex,
        rowIndex: ts.cursor.rowIndex,
      });
    }, 300);

    // Room creator sends full project snapshot to the joiner.
    // CollaborationClient.send() automatically chunks large payloads into 16 KB pieces.
    if (_isCreator) {
      setTimeout(() => {
        try {
          const project = snapshotProject();
          _client?.send({ type: 'full_sync', project });
        } catch (err) {
          console.error('[Collab] Failed to send full_sync:', err);
        }
      }, 500);
    }
  };

  _client.onDisconnected = () => {
    useCollaborationStore.getState().disconnect();
  };

  _client.onPatch = (msg) => {
    if (msg.type === 'peer_view') {
      useCollaborationStore.setState((s) => { s.peerPatternIndex = msg.patternIndex; });
      // In 'shared' mode, follow the peer's navigation locally
      if (useCollaborationStore.getState().listenMode === 'shared') {
        _applyingRemotePeerView = true;
        useTrackerStore.getState().setCurrentPattern(msg.patternIndex);
        _applyingRemotePeerView = false;
      }
      return;
    }
    if (msg.type === 'peer_cursor') {
      useCollaborationStore.setState((s) => {
        s.peerPatternIndex = msg.patternIndex;
        s.peerCursorRow = msg.rowIndex;
        s.peerCursorChannel = msg.channelIndex;
      });
      return;
    }
    if (msg.type === 'peer_mouse') {
      useCollaborationStore.setState((s) => {
        s.peerMouseNX = msg.nx; s.peerMouseNY = msg.ny; s.peerMouseActive = true;
      });
      return;
    }
    if (msg.type === 'peer_selection') {
      useCollaborationStore.setState((s) => {
        s.peerSelection = { startChannel: msg.startChannel, endChannel: msg.endChannel,
          startRow: msg.startRow, endRow: msg.endRow, patternIndex: msg.patternIndex };
      });
      return;
    }
    if (msg.type === 'peer_selection_clear') {
      useCollaborationStore.setState((s) => { s.peerSelection = null; });
      return;
    }
    applyRemotePatch(msg);
  };
}

const _onSignalingMessage = async (msg: SignalingServerMsg): Promise<void> => {
  if (!_client || !_signaling) return;

  switch (msg.type) {
    case 'room_created':
      useCollaborationStore.setState((s) => { s.status = 'waiting'; s.roomCode = msg.roomCode; });
      break;

    case 'peer_joined': {
      // We're the creator — initiate WebRTC offer
      const offer = await _client.createOffer();
      _signaling.send({ type: 'offer', sdp: offer });
      break;
    }

    case 'offer': {
      // We're the joiner — respond with answer
      const answer = await _client.handleOffer(msg.sdp);
      _signaling.send({ type: 'answer', sdp: answer });
      break;
    }

    case 'answer':
      await _client.handleAnswer(msg.sdp);
      break;

    case 'ice_candidate':
      _client.addIceCandidate(msg.candidate);
      break;

    case 'peer_left':
      console.log('[Collab] Received peer_left from signaling server — calling disconnect');
      useCollaborationStore.getState().disconnect();
      break;

    case 'error':
      useCollaborationStore.setState((s) => {
        s.status = 'error';
        s.errorMessage = msg.message;
      });
      break;
  }
};

// ─── Side effect: broadcast peer_view when local pattern changes ───────────────
useTrackerStore.subscribe((state, prev) => {
  if (state.currentPatternIndex === prev.currentPatternIndex) return;
  if (_applyingRemotePeerView) return;
  if (useCollaborationStore.getState().status !== 'connected') return;
  _client?.send({ type: 'peer_view', patternIndex: state.currentPatternIndex });
});

// ─── Side effect: broadcast peer_cursor when local cursor moves ────────────────
useTrackerStore.subscribe((state, prev) => {
  if (
    state.cursor.rowIndex === prev.cursor.rowIndex &&
    state.cursor.channelIndex === prev.cursor.channelIndex &&
    state.currentPatternIndex === prev.currentPatternIndex
  ) return;
  if (useCollaborationStore.getState().status !== 'connected') return;
  _client?.send({
    type: 'peer_cursor',
    patternIndex: state.currentPatternIndex,
    channelIndex: state.cursor.channelIndex,
    rowIndex: state.cursor.rowIndex,
  });
});
