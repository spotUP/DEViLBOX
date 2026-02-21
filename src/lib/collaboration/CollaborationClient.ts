/**
 * CollaborationClient — WebRTC peer connection + voice chat + data channel.
 *
 * Lifecycle:
 *  1. Room creator calls createOffer() after peer_joined signal
 *  2. Room joiner calls handleOffer() then sends answer
 *  3. ICE candidates are exchanged via signaling
 *  4. Data channel opens → song sync begins
 *  5. Voice enabled optionally via enableVoice()
 */

import type { DataChannelMsg } from './types';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** Internal envelope for chunked large messages */
interface ChunkEnvelope {
  __chunk: true;
  id: string;
  index: number;
  total: number;
  data: string;
}

export class CollaborationClient {
  /** Max bytes per data-channel send — well under Chrome's negotiated SCTP limit */
  private static readonly CHUNK_SIZE = 16_384; // 16 KB

  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement;
  private _localAudioMuted = false;
  /** Reassembly buffer for incoming chunked messages */
  private _pendingChunks = new Map<string, { total: number; received: number; chunks: string[] }>();

  /** Called when the data channel opens */
  onConnected: (() => void) | null = null;

  /** Called when the data channel closes */
  onDisconnected: (() => void) | null = null;

  /** Called for each incoming data channel message */
  onPatch: ((msg: DataChannelMsg) => void) | null = null;

  /** Called when an ICE candidate is ready to be sent via signaling */
  onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.ontrack = (event) => {
      this.remoteAudio.srcObject = event.streams[0];
      this.remoteAudio.play().catch(() => {
        // Autoplay policy — will start on next user interaction
      });
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log('[CollaborationClient] Connection state:', state);
      if (state === 'failed' || state === 'closed') {
        this.onDisconnected?.();
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[CollaborationClient] ICE state:', this.pc.iceConnectionState);
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('[CollaborationClient] ICE gathering:', this.pc.iceGatheringState);
    };
  }

  // ─── WebRTC Handshake ───────────────────────────────────────────────────────

  /** Room creator: create data channel and offer */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dataChannel = this.pc.createDataChannel('song', {
      ordered: true,
    });
    this._setupDataChannel(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** Room joiner: accept offer and create answer */
  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._setupDataChannel(event.channel);
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  addIceCandidate(candidate: RTCIceCandidateInit): void {
    this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
      console.warn('[CollaborationClient] Failed to add ICE candidate:', err);
    });
  }

  // ─── Data Channel ───────────────────────────────────────────────────────────

  private _setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log('[CollaborationClient] Data channel open, maxMessageSize:', (channel as unknown as Record<string, unknown>)['maxMessageSize']);
      this.onConnected?.();
    };

    channel.onclose = () => {
      console.log('[CollaborationClient] Data channel closed');
      this.onDisconnected?.();
    };

    channel.onmessage = (event: MessageEvent) => {
      try {
        const raw = JSON.parse(event.data as string) as DataChannelMsg | ChunkEnvelope;
        if ('__chunk' in raw && raw.__chunk) {
          const assembled = this._receiveChunk(raw);
          if (assembled) {
            console.log('[CollaborationClient] Received (assembled):', assembled.type);
            this.onPatch?.(assembled);
          }
          return;
        }
        console.log('[CollaborationClient] Received:', (raw as DataChannelMsg).type);
        this.onPatch?.(raw as DataChannelMsg);
      } catch {
        console.error('[CollaborationClient] Failed to parse data channel message');
      }
    };

    channel.onerror = (event) => {
      const rtcError = (event as RTCErrorEvent).error;
      console.error('[CollaborationClient] Data channel error:', rtcError?.errorDetail, rtcError?.message ?? event);
    };
  }

  /** Send a message, automatically splitting into 16 KB chunks if needed. */
  send(msg: DataChannelMsg): void {
    if (this.dataChannel?.readyState !== 'open') {
      console.warn('[CollaborationClient] send() skipped — readyState:', this.dataChannel?.readyState);
      return;
    }
    const json = JSON.stringify(msg);
    if (json.length <= CollaborationClient.CHUNK_SIZE) {
      console.log('[CollaborationClient] Sending:', msg.type);
      this.dataChannel.send(json);
      return;
    }
    // Large message — split into chunks and send each individually
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const total = Math.ceil(json.length / CollaborationClient.CHUNK_SIZE);
    console.log(`[CollaborationClient] Chunking ${msg.type}: ${json.length} bytes → ${total} chunks`);
    for (let i = 0; i < total; i++) {
      const data = json.slice(i * CollaborationClient.CHUNK_SIZE, (i + 1) * CollaborationClient.CHUNK_SIZE);
      this.dataChannel.send(JSON.stringify({ __chunk: true, id, index: i, total, data } satisfies ChunkEnvelope));
    }
  }

  private _receiveChunk(chunk: ChunkEnvelope): DataChannelMsg | null {
    let entry = this._pendingChunks.get(chunk.id);
    if (!entry) {
      // Fill with empty strings so join() works correctly even for out-of-order arrival
      entry = { total: chunk.total, received: 0, chunks: new Array(chunk.total).fill('') };
      this._pendingChunks.set(chunk.id, entry);
    }
    if (!entry.chunks[chunk.index]) {
      entry.chunks[chunk.index] = chunk.data;
      entry.received++;
    }
    if (entry.received < entry.total) return null;

    this._pendingChunks.delete(chunk.id);
    return JSON.parse(entry.chunks.join('')) as DataChannelMsg;
  }

  // ─── Voice Chat ─────────────────────────────────────────────────────────────

  async enableVoice(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      for (const track of this.localStream.getAudioTracks()) {
        this.pc.addTrack(track, this.localStream);
      }
    } catch (err) {
      console.error('[CollaborationClient] getUserMedia failed:', err);
      throw err;
    }
  }

  muteVoice(muted: boolean): void {
    this._localAudioMuted = muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  get localAudioMuted(): boolean {
    return this._localAudioMuted;
  }

  /**
   * Control remote audio volume.
   * listenMode:
   *  - 'mine'   → silence remote (volume=0)
   *  - 'both'   → hear both (volume=1)
   *  - 'theirs' → hear only remote (volume=1, but caller should also mute Tone.js)
   */
  setRemoteVolume(vol: number): void {
    this.remoteAudio.volume = Math.max(0, Math.min(1, vol));
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  destroy(): void {
    console.log('[CollaborationClient] destroy() called');
    // Null all callbacks first — closing the data channel and peer connection
    // fires async events (onclose, onconnectionstatechange) that would otherwise
    // re-enter teardown via onDisconnected → disconnect() → _teardown() → destroy().
    this.onConnected = null;
    this.onDisconnected = null;
    this.onPatch = null;
    this.onIceCandidate = null;
    this._pendingChunks.clear();

    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onmessage = null;
      this.dataChannel.onerror = null;
      this.dataChannel.close();
      this.dataChannel = null;
    }

    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.ondatachannel = null;

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remoteAudio.srcObject = null;
    this.pc.close();
  }
}
