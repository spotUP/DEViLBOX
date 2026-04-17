/**
 * DJRemoteMicReceiver — receives iPhone mic audio via WebRTC.
 *
 * Connects to the collab signaling server, creates a room, and waits
 * for the controller to join. Received audio is routed to the DJ mixer's
 * samplerInput (bypasses crossfader, goes straight to master).
 *
 * Can optionally route through VocoderEngine for robot voice effect.
 */

import * as Tone from 'tone';
import type { SignalingClientMsg, SignalingServerMsg } from '@/lib/collaboration/types';
import { getDJEngineIfActive } from './DJEngine';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class DJRemoteMicReceiver {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private remoteSource: MediaStreamAudioSourceNode | null = null;
  private remoteGain: GainNode | null = null;
  // Chromium will not deliver samples from an inbound WebRTC audio track to a
  // MediaStreamAudioSourceNode unless the stream is also consumed by an <audio>
  // element. Muted sink keeps the track "playing" so Web Audio actually receives PCM.
  // See crbug.com/933677.
  private audioSink: HTMLAudioElement | null = null;
  roomCode: string | null = null;
  onStatusChange?: (status: 'waiting' | 'connected' | 'disconnected') => void;

  /**
   * Create a room and wait for the controller to join.
   * Returns the room code for display/QR generation.
   */
  async createRoom(signalingPort = 4002): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${signalingPort}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ type: 'create_room' } as SignalingClientMsg));
      };

      this.ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data as string) as SignalingServerMsg;

        switch (msg.type) {
          case 'room_created':
            this.roomCode = msg.roomCode;
            this.onStatusChange?.('waiting');
            console.log(`[RemoteMic] Room created: ${msg.roomCode}`);
            resolve(msg.roomCode);
            break;

          case 'peer_joined':
            // Controller joined — wait for their offer
            console.log('[RemoteMic] Controller peer joined');
            break;

          case 'offer':
            await this.handleOffer(msg.sdp);
            break;

          case 'answer':
            await this.pc?.setRemoteDescription(msg.sdp);
            break;

          case 'ice_candidate':
            await this.pc?.addIceCandidate(msg.candidate);
            break;

          case 'peer_left':
            console.log('[RemoteMic] Controller disconnected');
            this.cleanupPeerConnection();
            this.onStatusChange?.('waiting');
            break;

          case 'error':
            console.error('[RemoteMic] Signaling error:', msg.message);
            reject(new Error(msg.message));
            break;
        }
      };

      this.ws.onerror = () => reject(new Error('Cannot reach signaling server'));
      this.ws.onclose = () => {
        this.onStatusChange?.('disconnected');
      };
    });
  }

  /** Handle WebRTC offer from controller */
  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.ws?.send(JSON.stringify({ type: 'ice_candidate', candidate: e.candidate.toJSON() } as SignalingClientMsg));
      }
    };

    // Receive audio from controller
    this.pc.ontrack = (e) => {
      if (e.track.kind === 'audio') {
        console.log('[RemoteMic] Received audio track from controller');
        this.routeRemoteAudio(e.streams[0]);
        this.onStatusChange?.('connected');
      }
    };

    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.ws?.send(JSON.stringify({ type: 'answer', sdp: this.pc.localDescription } as SignalingClientMsg));
  }

  /** Route the received audio stream to the DJ mixer */
  private routeRemoteAudio(stream: MediaStream): void {
    const ctx = Tone.getContext().rawContext as AudioContext;

    // Chromium silent-inbound-track workaround (crbug.com/933677): the stream
    // must be attached to an HTMLAudioElement and playing, otherwise the
    // MediaStreamAudioSourceNode below produces silence.
    this.audioSink = new Audio();
    this.audioSink.srcObject = stream;
    this.audioSink.muted = true;
    this.audioSink.autoplay = true;
    this.audioSink.play().catch((err) => {
      console.warn('[RemoteMic] audio sink play() rejected (autoplay policy?):', err);
    });

    this.remoteSource = ctx.createMediaStreamSource(stream);
    this.remoteGain = ctx.createGain();
    this.remoteGain.gain.value = 1.0;

    this.remoteSource.connect(this.remoteGain);

    // Route to DJ mixer's sampler input (bypasses crossfader → master)
    const engine = getDJEngineIfActive();
    if (engine) {
      this.remoteGain.connect(engine.mixer.samplerInput);
      console.log('[RemoteMic] Audio routed to DJ mixer samplerInput');
    } else {
      // Fallback: direct to speakers
      this.remoteGain.connect(ctx.destination);
      console.log('[RemoteMic] Audio routed to audioContext.destination (no DJ engine)');
    }
  }

  /** Set the remote mic volume */
  setGain(value: number): void {
    if (this.remoteGain) {
      this.remoteGain.gain.value = Math.max(0, Math.min(2, value));
    }
  }

  private cleanupPeerConnection(): void {
    this.remoteSource?.disconnect();
    this.remoteGain?.disconnect();
    if (this.audioSink) {
      this.audioSink.pause();
      this.audioSink.srcObject = null;
      this.audioSink = null;
    }
    this.pc?.close();
    this.remoteSource = null;
    this.remoteGain = null;
    this.pc = null;
  }

  /** Shut down everything */
  disconnect(): void {
    this.cleanupPeerConnection();
    this.ws?.close();
    this.ws = null;
    this.roomCode = null;
    this.onStatusChange?.('disconnected');
  }
}
