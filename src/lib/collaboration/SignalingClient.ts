/**
 * SignalingClient — WebSocket client for the collab signaling server.
 *
 * Handles the initial handshake only. After WebRTC connects, all data
 * flows peer-to-peer via RTCDataChannel.
 */

import type { SignalingClientMsg, SignalingServerMsg } from './types';

type MessageHandler = (msg: SignalingServerMsg) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private onMessage: MessageHandler;
  private onDisconnect: () => void;
  private url: string;

  constructor(url: string, onMessage: MessageHandler, onDisconnect: () => void) {
    this.url = url;
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => resolve();

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as SignalingServerMsg;
          this.onMessage(msg);
        } catch {
          console.error('[SignalingClient] Failed to parse message:', event.data);
        }
      };

      this.ws.onerror = (event) => {
        console.error('[SignalingClient] WebSocket error:', event);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.onDisconnect();
      };
    });
  }

  send(msg: SignalingClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[SignalingClient] Cannot send — WebSocket not open');
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
