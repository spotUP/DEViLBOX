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
import { useTransportStore } from '../stores/useTransportStore';
import { getMK2ScreenManager } from './performance/screens/MK2ScreenManager';

// Maschine encoder CC base = 70 → routes through NKS bank knob system (CC 70-77)
// The MIDI store's NKS handler maps these to the active synth's page parameters
const KNOB_CC_BASE = 70;

// Pad → note mapping (pads 0-15 → notes 36-51, standard GM drum layout)
const PAD_NOTE_BASE = 36;

// Button → note mapping (buttons on ch 14, pads on ch 15 to avoid collision)
// Named keys for known buttons; numeric btnN keys discovered via NIHIA
const BUTTON_NOTES: Record<string, number> = {
  // Transport
  play:      116, rec:       117, erase:     118, restart:   119,
  stepLeft:  120, stepRight: 121, grid:      122, shift:     123,
  // Left column
  scene:     80,  pattern:   81,  padMode:   82,  navigate:  83,
  duplicate: 84,  select:    85,  solo:      86,  mute:      87,
  // Groups A-H
  groupA:    0,   groupB:    1,   groupC:    2,   groupD:    3,
  groupE:    4,   groupF:    5,   groupG:    6,   groupH:    7,
  // Top row
  control:   88,  step:      89,  browse:    90,  sampling:  91,
  left:      92,  right:     93,  all:       94,  auto:      95,
  // Encoder area
  volume:    96,  swing:     97,  tempo:     98,
  navLeft:   99,  navRight:  100, enter:     101, noteRepeat:102,
  encoderPush:103,
  // Soft buttons (above screens)
  soft1:     104, soft2:     105, soft3:     106, soft4:     107,
  soft5:     108, soft6:     109, soft7:     110, soft8:     111,
};

// NIHIA button ID → semantic name (discovered by physical button presses)
// Button IDs are the raw uint32 from EVT_BTN_DATA offset 16.
// Extend this map as buttons are discovered — press buttons with bridge
// running and read stderr for "[maschine] BTN N PRESSED" log lines.
const NIHIA_BTN_ID_TO_NAME: Record<number, string> = {
  // Soft buttons (above screens, unlabeled, context-dependent)
  0: 'soft1', 1: 'soft2', 2: 'soft3', 3: 'soft4',
  4: 'soft5', 5: 'soft6', 6: 'soft7', 7: 'soft8',
  // Top row
  8: 'control', 9: 'step', 10: 'browse', 11: 'sampling',
  12: 'left', 13: 'right', 14: 'all', 15: 'auto',
  // Encoder area
  16: 'volume', 17: 'swing', 18: 'tempo',
  19: 'navLeft', 20: 'navRight', 21: 'enter', 22: 'noteRepeat',
  23: 'encoderPush',
  // Group buttons (A-H)
  24: 'groupA', 25: 'groupB', 26: 'groupC', 27: 'groupD',
  28: 'groupE', 29: 'groupF', 30: 'groupG', 31: 'groupH',
  // Transport
  32: 'restart', 33: 'stepLeft', 34: 'stepRight', 35: 'grid',
  36: 'play', 37: 'rec', 38: 'erase', 39: 'shift',
  // Left column
  40: 'scene', 41: 'pattern', 42: 'padMode', 43: 'navigate',
  44: 'duplicate', 45: 'select', 46: 'solo', 47: 'mute',
};

// HID button name → screen manager name normalization
// HID reader sends names from MK2_BUTTON_NAMES[] in maschine-nihia.c;
// screen manager expects slightly different names for a couple buttons.
const HID_NAME_NORMALIZE: Record<string, string> = {
  nav: 'encoderPush',
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
    // Survive Vite HMR — store singleton on window to prevent orphaned WebSocket
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win?.__mk2Bridge) {
      MaschineHIDBridge.instance = win.__mk2Bridge as MaschineHIDBridge;
    }
    if (!MaschineHIDBridge.instance) {
      MaschineHIDBridge.instance = new MaschineHIDBridge();
      if (win) win.__mk2Bridge = MaschineHIDBridge.instance;
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
        // Start the screen manager now that we have a connection
        this.initScreenManager();
        // MK2 has 16 pads — tell the drum pad UI
        import('@/stores/useDrumPadStore').then(({ useDrumPadStore }) => {
          useDrumPadStore.getState().setControllerPadCount(16);
        });
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const evt = JSON.parse(event.data as string) as MaschineEvent;
          this.routeEvent(evt);
        } catch (err) {
          console.error('[MaschineHID] Event routing error:', err);
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
      console.log(`[MaschineHID] KNOB: index=${evt.index} value=${evt.value}`);
      // Let screen manager handle knob first (mixer volumes, browse scroll, etc.)
      const screenMgr = getMK2ScreenManager();
      if (screenMgr.handleKnob(evt.index, evt.value)) {
        return; // consumed by screen manager
      }
      // Fall through to MIDI CC routing for NKS params
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
      // Force screen update for visual feedback after NKS param change
      screenMgr.markDirty();
    } else if (evt.type === 'pad') {
      // Let screen manager handle pad first (step toggle, mixer select, etc.)
      const screenMgr = getMK2ScreenManager();
      if (screenMgr.handlePad(evt.pad, evt.velocity, evt.pressed)) {
        return; // consumed by screen manager
      }
      // Fall through to MIDI note routing for instrument auditioning
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
      // HID path sends semantic names directly (play, step, mute, etc.)
      // Normalize HID-specific variants to screen manager names
      let resolvedName = evt.name;
      if (HID_NAME_NORMALIZE[resolvedName]) {
        resolvedName = HID_NAME_NORMALIZE[resolvedName];
      } else if (evt.btnId !== undefined && NIHIA_BTN_ID_TO_NAME[evt.btnId]) {
        // Fallback: NIHIA protocol button ID mapping (legacy path)
        resolvedName = NIHIA_BTN_ID_TO_NAME[evt.btnId];
      }
      console.log(`[MaschineHID] BUTTON: "${resolvedName}" pressed=${evt.pressed}`);

      // Handle transport buttons directly on press
      if (evt.pressed) {
        const transport = useTransportStore.getState();
        switch (resolvedName) {
          case 'play':     transport.togglePlayPause(); return;
          case 'restart':  transport.stop(); transport.togglePlayPause(); return;
          default:
            break;
        }

        // Let the screen manager handle mode & navigation buttons
        if (getMK2ScreenManager().handleButton(resolvedName)) {
          return; // consumed by screen manager
        }
      }

      // Dispatch as MIDI note on ch14 for ButtonMapManager / learn system
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

  private initScreenManager(): void {
    Promise.all([
      import('./performance/screens/InstrumentScreen'),
      import('./performance/screens/MixerScreen'),
      import('./performance/screens/StepScreen'),
      import('./performance/screens/SampleScreen'),
      import('./performance/screens/BrowseScreen'),
      import('./performance/screens/SongScreen'),
      import('./performance/screens/PlaybackScreen'),
    ]).then(([instMod, mixMod, stepMod, sampleMod, browseMod, songMod, playMod]) => {
      const mgr = getMK2ScreenManager();
      mgr.registerScreen('instrument', new instMod.InstrumentScreen());
      mgr.registerScreen('mixer', new mixMod.MixerScreen());
      mgr.registerScreen('step', new stepMod.StepScreen());
      mgr.registerScreen('sample', new sampleMod.SampleScreen());
      mgr.registerScreen('browse', new browseMod.BrowseScreen());
      mgr.registerScreen('song', new songMod.SongScreen());
      mgr.registerScreen('playback', new playMod.PlaybackScreen());
      // Always (re)start — handles HMR and WebSocket reconnects
      mgr.start();
      // Reset hashes so first render always sends display data
      mgr.resetDisplayHashes();
      mgr.forceRender();
      console.log('[MaschineHID] Screen manager initialized with 7 modes');
    }).catch((err) => {
      console.warn('[MaschineHID] Failed to init screen manager:', err);
    });
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
