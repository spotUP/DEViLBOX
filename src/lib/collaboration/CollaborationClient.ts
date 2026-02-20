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

export class CollaborationClient {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement;
  private _localAudioMuted = false;

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
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.onDisconnected?.();
      }
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
      console.log('[CollaborationClient] Data channel open');
      this.onConnected?.();
    };

    channel.onclose = () => {
      console.log('[CollaborationClient] Data channel closed');
      this.onDisconnected?.();
    };

    channel.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as DataChannelMsg;
        this.onPatch?.(msg);
      } catch {
        console.error('[CollaborationClient] Failed to parse data channel message:', event.data);
      }
    };

    channel.onerror = (event) => {
      console.error('[CollaborationClient] Data channel error:', event);
    };
  }

  send(msg: DataChannelMsg): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
    }
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
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.dataChannel?.close();
    this.dataChannel = null;
    this.remoteAudio.srcObject = null;
    this.pc.close();
  }
}
