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

// Maschine encoder CC base = 70 → routes through NKS bank knob system (CC 70-77)
// The MIDI store's NKS handler maps these to the active synth's page parameters
const KNOB_CC_BASE = 70;

// Pad → note mapping (pads 0-15 → notes 36-51, standard GM drum layout)
const PAD_NOTE_BASE = 36;

// Button → note mapping (buttons on ch 14, pads on ch 15 to avoid collision)
// Named keys for known buttons; numeric btnN keys discovered via NIHIA
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

// NIHIA button ID → semantic name (discovered by physical button presses)
// Button IDs are the raw uint32 from EVT_BTN_DATA offset 16.
// Extend this map as buttons are discovered — press buttons with bridge
// running and read stderr for "[maschine] BTN N PRESSED" log lines.
const NIHIA_BTN_ID_TO_NAME: Record<number, string> = {
  // Populated by physical discovery — press each button, note the ID,
  // add it here. The log line format is:
  //   [maschine] BTN 45 PRESSED
  // Then add:  45: 'play',
};

type MaschineEvent =
  | { type: 'encoder'; index: number; name: string; value: number; raw: number }
  | { type: 'pad';     pad: number; velocity: number; pressed: boolean }
  | { type: 'button';  name: string; btnId?: number; pressed: boolean };

type MaschineCommand =
  | { type: 'setPadColor';     pad: number; r: number; g: number; b: number }
  | { type: 'setAllPadColors'; colors: Array<{ r: number; g: number; b: number }> }
  | { type: 'setButtonLed';    leds: number[] }
  | { type: 'drawDisplay';     screen: 0 | 1; pixels: string } /* base64 RGB565 big-endian */
  | { type: 'setProjectName';  name: string };

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
      // Resolve button name: try NIHIA btnId → name mapping first, then raw name
      let resolvedName = evt.name;
      if (evt.btnId !== undefined) {
        const mapped = NIHIA_BTN_ID_TO_NAME[evt.btnId];
        if (mapped) {
          resolvedName = mapped;
        } else {
          // Unknown button ID — log for discovery
          console.debug(`[MaschineHID] Unknown button ID ${evt.btnId} (${evt.name}), add to NIHIA_BTN_ID_TO_NAME`);
        }
      }
      const note = BUTTON_NOTES[resolvedName];
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

  /** Send a packed 1bpp bitmap to one of the two MK2 OLED displays.
   *  pixels: Uint8Array of 128×64/8 = 1024 bytes (bit 7 = leftmost pixel per byte).
   *  Base64-encoded for transport (~1.4 KB per frame). */
  drawDisplay(screen: 0 | 1, pixels: Uint8Array): void {
    let binary = '';
    for (let i = 0; i < pixels.length; i++) binary += String.fromCharCode(pixels[i]);
    this.send({ type: 'drawDisplay', screen, pixels: btoa(binary) });
  }

  /** Update the project name shown on the Maschine MK2 screen via MSG_PROJECTNAME. */
  setProjectName(name: string): void {
    this.send({ type: 'setProjectName', name });
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
