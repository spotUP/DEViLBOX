/**
 * Maschine MK2 HID Bridge
 *
 * Reads the Maschine MK2 HID interface directly via node-hid (bypassing
 * Chrome's WebHID restriction on MIDI-class devices) and forwards events
 * to the DEViLBOX browser over WebSocket on port 4005.
 *
 * Protocol reverse-engineered by hansfbaier/open-maschine + community.
 *
 * INPUT  — two report types (same 63-byte (index, value) pair format):
 *
 *   Report 0x10 — buttons + encoders (sent on change):
 *     byte 0:      report ID (0x10)
 *     bytes 1-3:   button bitmasks
 *     bytes 4-33:  15 encoder (index, value) pairs
 *                    index = 0x10 * n  (0x10…0xf0)
 *                    value = 0–255 absolute position
 *     bytes 34-62: duplicate / second group (ignored)
 *
 *   Report 0x20 — pad pressure (sent continuously):
 *     byte 0:      report ID (0x20)
 *     bytes 1-3:   unknown header
 *     bytes 4-35:  16 pad (index, value) pairs (12-bit or 8-bit, TBC)
 *     bytes 36-62: second group / duplicate
 *
 * OUTPUT LED reports:
 *   0x80: pad RGB — [0x80, r,g,b × 16]  (49 bytes)
 *   0x81: group/transport — [0x81, r,g,b × 8 (A-D), r,g,b × 8 (E-H), byte × 8 transport] (57 bytes)
 *   0x82: general button LEDs — [0x82, × 31] (32 bytes)
 *
 * OUTPUT DISPLAY reports (128×64 OLED, two screens):
 *   0xe0: left display  — [0xe0, 0x00, 0x00, segment, 0x00, 0x20, 0x00, 0x08, × 256 pixel bytes]
 *   0xe1: right display — same with 0xe1
 *   8 segments per screen (segment offset = i*8 for i in 0..7)
 *
 * Usage:
 *   npx tsx tools/maschine-bridge.ts            — normal mode
 *   npx tsx tools/maschine-bridge.ts --discover  — log raw diffs only
 */

import HID from 'node-hid';
import { WebSocketServer, WebSocket } from 'ws';

const VENDOR_ID  = 0x17CC;
const PRODUCT_ID = 0x1140;
const WS_PORT    = 4005;
const DISCOVER   = process.argv.includes('--discover');

// ── Encoder layout ────────────────────────────────────────────────────────────
// 8 main knobs + Volume + Swing + Tempo = 11 used encoders (indices 0x10–0xb0)
// Indices 0xc0–0xf0 are present in the report but unused on MK2

const ENCODER_COUNT = 11; // 8 main knobs + volume + swing + tempo (indices 0x10-0xb0)

// Physical labels for known indices (index = 0x10 * n, n=1..15)
const ENCODER_NAMES: Record<number, string> = {
  0x10: 'knob1',
  0x20: 'knob2',
  0x30: 'knob3',
  0x40: 'knob4',
  0x50: 'knob5',
  0x60: 'knob6',
  0x70: 'knob7',
  0x80: 'knob8',
  0x90: 'volume',
  0xa0: 'swing',
  0xb0: 'tempo',
  0xc0: 'encoder12',
  0xd0: 'encoder13',
  0xe0: 'encoder14',
  0xf0: 'encoder15',
};

// ── Button bitmasks (bytes 1-3 of input report) ───────────────────────────────
// Derived from community reverse-engineering — verify by pressing buttons in --discover mode

const BUTTON_MAP: Record<string, { byte: number; bit: number }> = {
  restart:   { byte: 1, bit: 0 },
  stepLeft:  { byte: 1, bit: 1 },
  stepRight: { byte: 1, bit: 2 },
  grid:      { byte: 1, bit: 3 },
  play:      { byte: 1, bit: 4 },
  rec:       { byte: 1, bit: 5 },
  erase:     { byte: 1, bit: 6 },
  shift:     { byte: 1, bit: 7 },
  scene:     { byte: 2, bit: 0 },
  pattern:   { byte: 2, bit: 1 },
  padMode:   { byte: 2, bit: 2 },
  navigate:  { byte: 2, bit: 3 },
  duplicate: { byte: 2, bit: 4 },
  select:    { byte: 2, bit: 5 },
  solo:      { byte: 2, bit: 6 },
  mute:      { byte: 2, bit: 7 },
  volume:    { byte: 3, bit: 0 },
  swing:     { byte: 3, bit: 1 },
  tempo:     { byte: 3, bit: 2 },
  navLeft:   { byte: 3, bit: 3 },
  navRight:  { byte: 3, bit: 4 },
  enter:     { byte: 3, bit: 5 },
  browse:    { byte: 3, bit: 6 },
  sampling:  { byte: 3, bit: 7 },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type MaschineEvent =
  | { type: 'encoder'; index: number; name: string; value: number; raw: number }
  | { type: 'pad';     pad: number; velocity: number; pressed: boolean }
  | { type: 'button';  name: string; pressed: boolean };

export type MaschineCommand =
  | { type: 'setPadColor';     pad: number; r: number; g: number; b: number }
  | { type: 'setAllPadColors'; colors: Array<{ r: number; g: number; b: number }> }
  | { type: 'setButtonLed';    leds: number[] }   // 31-byte array for report 0x82
  | { type: 'drawDisplay';     screen: 0 | 1; pixels: Uint8Array };  // 1024-byte pixel data

// ── State ─────────────────────────────────────────────────────────────────────

// Raw encoder values 0-255 (absolute position)
const encoderValues = new Uint8Array(ENCODER_COUNT);
const buttonStates  = new Map<string, boolean>();

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[maschine] Browser connected (${clients.size} clients)`);

  ws.on('message', (data) => {
    try {
      const cmd = JSON.parse(data.toString()) as MaschineCommand;
      handleCommand(cmd);
    } catch { /* ignore malformed */ }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[maschine] Browser disconnected (${clients.size} clients)`);
  });
});

function broadcast(event: MaschineEvent): void {
  if (clients.size === 0) return;
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ── HID ───────────────────────────────────────────────────────────────────────

let device: HID.HID | null = null;


// Init sequence from open-maschine — sets button LED brightness and may activate hardware controls
function sendInitSequence(dev: HID.HID): void {
  try {
    // 0x82: general button LEDs — 0x0a = dim, 0x3f = bright
    const btnLeds = Buffer.from([
      0x82,
      0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a,
      0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a,
      0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a,
      0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f,
    ]);
    dev.write(Array.from(btnLeds));

    // 0x80: pad RGB — all off
    const padLeds = Buffer.alloc(1 + 16 * 3, 0);
    padLeds[0] = 0x80;
    dev.write(Array.from(padLeds));

    // 0x81: group + transport LEDs — all off
    const groupLeds = Buffer.alloc(1 + 8 * 3 + 8 * 3 + 8, 0);
    groupLeds[0] = 0x81;
    dev.write(Array.from(groupLeds));

    console.log('[maschine] Init sequence sent');
  } catch (err) {
    console.warn('[maschine] Init write failed:', (err as Error).message);
  }
}

function openDevice(): HID.HID | null {
  try {
    const devs = HID.devices(VENDOR_ID, PRODUCT_ID);
    if (!devs.length) throw new Error('device not found');
    const dev = new HID.HID(devs[0].path!);
    console.log(`[maschine] Opened Maschine MK2 via path: ${devs[0].path}`);
    sendInitSequence(dev);
    return dev;
  } catch (err) {
    console.error('[maschine] Cannot open device:', (err as Error).message);
    console.error('[maschine] Is the browser holding the MIDI port? Close it and retry.');
    return null;
  }
}

function retryOpen(): void {
  console.log('[maschine] Retrying in 3s...');
  setTimeout(() => {
    device = openDevice();
    if (device) attachHandlers(device);
    else retryOpen();
  }, 3000);
}

// ── Input parsing ─────────────────────────────────────────────────────────────

// Baseline for 0x20 pad report (learned from first stable readings)
let padBaseline: Buffer | null = null;
let padBaselineSamples: Buffer[] = [];

function parseReport(raw: Buffer): void {
  const reportId = raw[0];

  if (DISCOVER) {
    // 0x10 = encoders/buttons (fire on change, never flood) — always show
    if (reportId === 0x10) {
      const hex = [...raw].map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[maschine] 0x10 ENCODER: ${hex}`);
      return;
    }
    // 0x20 = pad pressure (floods continuously) — learn baseline then diff
    if (!padBaseline) {
      padBaselineSamples.push(Buffer.from(raw));
      if (padBaselineSamples.length >= 20) {
        padBaseline = padBaselineSamples[padBaselineSamples.length - 1];
        padBaselineSamples = [];
        console.log('[maschine] Pad baseline learned. Move controls...');
      }
      return;
    }
    if (raw.equals(padBaseline)) return;
    const diffs: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== padBaseline[i]) {
        diffs.push(`b${i}:${padBaseline[i].toString(16)}→${raw[i].toString(16)}`);
      }
    }
    if (diffs.length) console.log(`[maschine] 0x20 PAD: ${diffs.join('  ')}`);
    return;
  }

  // Normal mode: 0x10 = knob/button encoders, 0x20 = pad pressure
  if (reportId === 0x10) {
    parseEncoderReport(raw);
  } else if (reportId === 0x20) {
    parsePadPressure(raw);
  }
}

function parseEncoderReport(raw: Buffer): void {
  // Buttons: bytes 1-3
  for (const [name, pos] of Object.entries(BUTTON_MAP)) {
    const pressed = (raw[pos.byte] & (1 << pos.bit)) !== 0;
    if (pressed !== (buttonStates.get(name) ?? false)) {
      buttonStates.set(name, pressed);
      broadcast({ type: 'button', name, pressed });
    }
  }

  // Encoders: bytes 4-33, pairs of (index_byte, value_byte)
  // Data is mirrored in bytes 34-62 — only read the first group.
  for (let n = 0; n < ENCODER_COUNT; n++) {
    const offset    = 4 + n * 2;
    const indexByte = raw[offset];      // 0x10, 0x20, ... 0xf0
    const rawValue  = raw[offset + 1];  // 0-255 absolute position

    if (indexByte === 0) continue;

    const prev = encoderValues[n];
    if (Math.abs(rawValue - prev) < 6) continue; // suppress sensor drift (±5 counts)
    if (rawValue !== prev) {
      encoderValues[n] = rawValue;
      const value = Math.round(rawValue * 127 / 255);
      const name  = ENCODER_NAMES[indexByte] ?? `encoder${indexByte.toString(16)}`;
      broadcast({ type: 'encoder', index: n, name, value, raw: rawValue });
    }
  }
}

function parsePadPressure(raw: Buffer): void {
  // 0x20 report: 16 pad pressure values in (index, value) pairs starting at byte 4.
  // Baseline is used to detect actual presses above resting capacitance.
  if (!padBaseline) return;

  for (let i = 0; i < 16; i++) {
    const offset   = 4 + i * 2;
    const rawValue = raw[offset + 1];
    const resting  = padBaseline[offset + 1];
    const delta    = rawValue - resting;
    const velocity = Math.max(0, Math.min(127, Math.round((delta / (255 - resting)) * 127)));
    const pressed  = velocity > 10;

    if (pressed !== (padStates[i] > 0)) {
      padStates[i] = velocity;
      broadcast({ type: 'pad', pad: i, velocity, pressed });
    }
  }
}

// ── LED / Display output ──────────────────────────────────────────────────────

function writePadColors(colors: Array<{ r: number; g: number; b: number }>): void {
  if (!device) return;
  const buf = Buffer.alloc(1 + 16 * 3);
  buf[0] = 0x80;
  for (let i = 0; i < 16; i++) {
    const c = colors[i] ?? { r: 0, g: 0, b: 0 };
    buf[1 + i * 3]     = c.r;
    buf[1 + i * 3 + 1] = c.g;
    buf[1 + i * 3 + 2] = c.b;
  }
  deviceWrite(buf);
}

function writeDisplay(screen: 0 | 1, pixels: Uint8Array): void {
  if (!device) return;
  // 8 segments, 128 bytes each = 1024 bytes for 128×64 mono display
  for (let seg = 0; seg < 8; seg++) {
    const buf = Buffer.alloc(265);
    buf[0] = screen === 0 ? 0xe0 : 0xe1;
    buf[1] = 0x00;
    buf[2] = 0x00;
    buf[3] = seg * 8;   // segment offset
    buf[4] = 0x00;
    buf[5] = 0x20;      // width = 32 columns
    buf[6] = 0x00;
    buf[7] = 0x08;      // height = 8 rows
    const srcStart = seg * (256);
    for (let i = 0; i < 256; i++) {
      buf[8 + i] = pixels[srcStart + i] ?? 0;
    }
    deviceWrite(buf);
  }
}

function deviceWrite(buf: Buffer): void {
  try {
    device!.write(Array.from(buf));
  } catch (err) {
    console.error('[maschine] Write error:', (err as Error).message);
  }
}

function handleCommand(cmd: MaschineCommand): void {
  if (cmd.type === 'setPadColor') {
    const colors = Array.from({ length: 16 }, (_, i) =>
      i === cmd.pad ? { r: cmd.r, g: cmd.g, b: cmd.b } : { r: 0, g: 0, b: 0 }
    );
    writePadColors(colors);
  } else if (cmd.type === 'setAllPadColors') {
    writePadColors(cmd.colors);
  } else if (cmd.type === 'setButtonLed') {
    if (!device) return;
    const buf = Buffer.alloc(32);
    buf[0] = 0x82;
    for (let i = 0; i < 31; i++) buf[1 + i] = cmd.leds[i] ?? 0;
    deviceWrite(buf);
  } else if (cmd.type === 'drawDisplay') {
    writeDisplay(cmd.screen, cmd.pixels);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function attachHandlers(dev: HID.HID): void {
  dev.on('data', (data: Buffer) => parseReport(data));
  dev.on('error', (err: Error) => {
    console.error('[maschine] HID error:', err.message);
    device = null;
    retryOpen();
  });
}

console.log(`[maschine] Maschine MK2 HID bridge starting on ws://localhost:${WS_PORT}`);
if (DISCOVER) console.log('[maschine] DISCOVER MODE — showing byte diffs only');

device = openDevice();
if (device) attachHandlers(device);
else retryOpen();
