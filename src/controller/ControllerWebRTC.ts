/**
 * ControllerWebRTC — sends iPhone mic audio to desktop via WebRTC.
 *
 * Uses the existing collab signaling server (port 4002) for
 * offer/answer/ICE exchange. Audio flows iPhone → Desktop only.
 */

type SignalingMsg =
  | { type: 'room_created'; roomCode: string }
  | { type: 'peer_joined' }
  | { type: 'peer_left' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice_candidate'; candidate: RTCIceCandidateInit }
  | { type: 'error'; message: string };

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class ControllerWebRTC {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  roomCode: string | null = null;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;

  /**
   * Connect to the signaling server and join a room.
   * The desktop creates the room and provides the code.
   */
  async connect(signalingHost: string, roomCode: string, port = 4002): Promise<void> {
    this.roomCode = roomCode;
    this.onStatusChange?.('connecting');

    return new Promise((resolve, reject) => {
      const url = `ws://${signalingHost}:${port}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ type: 'join_room', roomCode }));
      };

      this.ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data as string) as SignalingMsg;

        switch (msg.type) {
          case 'peer_joined':
            // We joined — desktop is the other peer. Create offer with mic audio.
            await this.createOffer();
            resolve();
            break;

          case 'offer':
            // Desktop sent offer (desktop is the initiator in some flows)
            await this.handleOffer(msg.sdp);
            resolve();
            break;

          case 'answer':
            await this.pc?.setRemoteDescription(msg.sdp);
            this.onStatusChange?.('connected');
            break;

          case 'ice_candidate':
            await this.pc?.addIceCandidate(msg.candidate);
            break;

          case 'error':
            console.error('[ControllerWebRTC] Signaling error:', msg.message);
            reject(new Error(msg.message));
            break;

          case 'peer_left':
            this.onStatusChange?.('disconnected');
            break;
        }
      };

      this.ws.onerror = () => reject(new Error('Signaling connection failed'));
      this.ws.onclose = () => this.onStatusChange?.('disconnected');
    });
  }

  /** Acquire mic and create WebRTC offer */
  private async createOffer(): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.ws?.send(JSON.stringify({ type: 'ice_candidate', candidate: e.candidate.toJSON() }));
      }
    };

    // Get mic — start muted (PTT controls enabled state)
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    this.audioTrack = this.stream.getAudioTracks()[0];
    this.audioTrack.enabled = false; // muted until PTT

    this.pc.addTrack(this.audioTrack, this.stream);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.ws?.send(JSON.stringify({ type: 'offer', sdp: this.pc.localDescription }));
  }

  /** Handle incoming offer from desktop */
  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.ws?.send(JSON.stringify({ type: 'ice_candidate', candidate: e.candidate.toJSON() }));
      }
    };

    // Get mic
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    this.audioTrack = this.stream.getAudioTracks()[0];
    this.audioTrack.enabled = false;

    this.pc.addTrack(this.audioTrack, this.stream);

    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.ws?.send(JSON.stringify({ type: 'answer', sdp: this.pc.localDescription }));
    this.onStatusChange?.('connected');
  }

  /** Enable/disable mic track (called by PTT) */
  setMicEnabled(enabled: boolean): void {
    if (this.audioTrack) {
      this.audioTrack.enabled = enabled;
    }
  }

  /** Disconnect everything */
  disconnect(): void {
    this.audioTrack?.stop();
    this.pc?.close();
    this.ws?.close();
    this.stream = null;
    this.audioTrack = null;
    this.pc = null;
    this.ws = null;
    this.roomCode = null;
    this.onStatusChange?.('disconnected');
  }
}
