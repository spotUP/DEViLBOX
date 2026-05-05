/**
 * MaschineHIDBridge — browser-side WebSocket client for the Maschine MK2 HID bridge.
 *
 * Connects to tools/maschine-bridge.ts on ws://localhost:4005 and routes:
 *   knob events  → MIDIManager message handlers (as CC messages, ch 15)
 *   pad events   → MIDIManager message handlers (as note on/off, ch 15)
 *   button events → MIDIManager message handlers (as note on/off, ch 14)
 *
 * This makes Maschine events indistinguishable from standard MIDI inside the app,
 * so NKSAutoMapper and parameterRouter work unchanged.
 *
 * Also exposes setPadColor() / setAllPadColors() for LED feedback.
 */

import { getMIDIManager } from './MIDIManager';
import type { MIDIMessage } from './types';

// Maschine encoder CC base — chosen to avoid ALL NKS TB303 CCs (7,71,74,85-87,91-92,94,102-106)
const KNOB_CC_BASE = 110;

// Pad → note mapping (pads 0-15 → notes 36-51, standard GM drum layout)
const PAD_NOTE_BASE = 36;

// Button → note mapping (buttons on ch 14, pads on ch 15 to avoid collision)
const BUTTON_NOTES: Record<string, number> = {
  play:      116,
  rec:       117,
  erase:     118,
  restart:   119,
  scene:     80,
  pattern:   81,
  padMode:   82,
  navigate:  83,
  duplicate: 84,
  select:    85,
  solo:      86,
  mute:      87,
  groupA:    0,
  groupB:    1,
  groupC:    2,
  groupD:    3,
  groupE:    4,
  groupF:    5,
  groupG:    6,
  groupH:    7,
};

type MaschineEvent =
  | { type: 'encoder'; index: number; name: string; value: number; raw: number }
  | { type: 'pad';     pad: number; velocity: number; pressed: boolean }
  | { type: 'button';  name: string; pressed: boolean };

type MaschineCommand =
  | { type: 'setPadColor';     pad: number; r: number; g: number; b: number }
  | { type: 'setAllPadColors'; colors: Array<{ r: number; g: number; b: number }> }
  | { type: 'setButtonLed';    leds: number[] }
  | { type: 'drawDisplay';     screen: 0 | 1; pixels: number[] };

class MaschineHIDBridge {
  private static instance: MaschineHIDBridge | null = null;

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  private constructor() {}

  static getInstance(): MaschineHIDBridge {
    if (!MaschineHIDBridge.instance) {
      MaschineHIDBridge.instance = new MaschineHIDBridge();
    }
    return MaschineHIDBridge.instance;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.attemptConnect();
  }

  private attemptConnect(): void {
    try {
      this.ws = new WebSocket('ws://localhost:4005');

      this.ws.addEventListener('open', () => {
        this.connected = true;
        console.log('[MaschineHID] Connected to bridge');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const evt = JSON.parse(event.data as string) as MaschineEvent;
          this.routeEvent(evt);
        } catch {
          // ignore
        }
      });

      this.ws.addEventListener('close', () => {
        this.connected = false;
        console.log('[MaschineHID] Bridge disconnected, retrying in 2s...');
        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', () => {
        // close event will fire after error — reconnect handled there
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptConnect();
    }, 2000);
  }

  private routeEvent(evt: MaschineEvent): void {
    const mgr = getMIDIManager();

    if (evt.type === 'encoder') {
      const cc = KNOB_CC_BASE + evt.index;
      const msg: MIDIMessage = {
        type: 'cc',
        channel: 15,
        cc,
        value: evt.value,
        data: new Uint8Array([0xBF, cc, evt.value]),
        timestamp: performance.now(),
      };
      mgr.dispatchMessage(msg);
    } else if (evt.type === 'pad') {
      const note = PAD_NOTE_BASE + evt.pad;
      const msg: MIDIMessage = {
        type: evt.pressed ? 'noteOn' : 'noteOff',
        channel: 15,
        note,
        velocity: evt.velocity,
        data: new Uint8Array([
          evt.pressed ? 0x9F : 0x8F,
          note,
          evt.velocity,
        ]),
        timestamp: performance.now(),
      };
      mgr.dispatchMessage(msg);
    } else if (evt.type === 'button') {
      const note = BUTTON_NOTES[evt.name];
      if (note === undefined) return;
      const msg: MIDIMessage = {
        type: evt.pressed ? 'noteOn' : 'noteOff',
        channel: 14,
        note,
        velocity: evt.pressed ? 127 : 0,
        data: new Uint8Array([
          evt.pressed ? 0x9E : 0x8E,
          note,
          evt.pressed ? 127 : 0,
        ]),
        timestamp: performance.now(),
      };
      mgr.dispatchMessage(msg);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  setPadColor(pad: number, r: number, g: number, b: number): void {
    this.send({ type: 'setPadColor', pad, r, g, b });
  }

  setAllPadColors(colors: Array<{ r: number; g: number; b: number }>): void {
    this.send({ type: 'setAllPadColors', colors });
  }

  setButtonLed(leds: number[]): void {
    this.send({ type: 'setButtonLed', leds });
  }

  drawDisplay(screen: 0 | 1, pixels: Uint8Array): void {
    this.send({ type: 'drawDisplay', screen, pixels: Array.from(pixels) });
  }

  private send(cmd: MaschineCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
    }
  }
}

export function getMaschineHIDBridge(): MaschineHIDBridge {
  return MaschineHIDBridge.getInstance();
}

export function initMaschineHIDBridge(): void {
  getMaschineHIDBridge().connect();
}
