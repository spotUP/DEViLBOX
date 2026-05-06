/**
 * Maschine MK2 NIHIA Bridge
 *
 * Spawns tools/maschine-nihia (C/CoreFoundation) which connects to the
 * NIHostIntegrationAgent and receives knob/pad/button events directly from
 * the hardware via the NIHIA IPC protocol.
 *
 * Forwards events to the DEViLBOX browser over WebSocket on port 4005.
 *
 * Knob mapping (indices 0-7 → CC 14-21):
 *   0 → cutoff    1 → resonance   2 → envMod    3 → decay
 *   4 → accent    5 → overdrive   6 → slideTime  7 → volume
 *
 * LED output (via WebSocket commands from browser):
 *   setPadColor      → 0x80 report
 *   setAllPadColors  → 0x80 report
 *   setButtonLed     → 0x82 report
 *   drawDisplay      → 0xe0/0xe1 reports (128×64 OLED)
 */

import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NIHIA_BIN = resolve(__dirname, '../tools/maschine-nihia');
const WS_PORT   = 4005;

// ── Types ─────────────────────────────────────────────────────────────────────

type NIHIAEvent =
  | { type: 'knob';    knob: number; delta: number; raw: number }
  | { type: 'encoder'; index: number; name: string; value: number; raw: number }
  | { type: 'pad';     pad: number;  velocity: number; pressed: boolean }
  | { type: 'button';  btn?: number; btnId?: number; name?: string; pressed: number | boolean };

export type MaschineEvent =
  | { type: 'encoder'; index: number; name: string; value: number; raw: number }
  | { type: 'pad';     pad: number;   velocity: number; pressed: boolean }
  | { type: 'button';  name: string; btnId: number; pressed: boolean };

export type MaschineCommand =
  | { type: 'setPadColor';     pad: number; r: number; g: number; b: number }
  | { type: 'setAllPadColors'; colors: Array<{ r: number; g: number; b: number }> }
  | { type: 'setButtonLed';    leds: number[] }
  | { type: 'drawDisplay';     screen: 0 | 1; pixels: number[] }
  | { type: 'setProjectName';  name: string };

// ── Knob config ───────────────────────────────────────────────────────────────

const KNOB_NAMES = [
  'knob1', 'knob2', 'knob3', 'knob4',
  'knob5', 'knob6', 'knob7', 'knob8',
];

// Accumulated absolute positions (0-127), start at midpoint
const knobValues = new Array<number>(8).fill(64);

// Sensitivity: how much each NIHIA delta tick changes the 0-127 value
// NIHIA gives one event per physical detent, so 1 = 1 CC step per click
const KNOB_STEP = 3;

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[maschine] Browser connected (${clients.size} clients)`);

  // Send current knob positions on connect
  for (let i = 0; i < 8; i++) {
    broadcast({
      type: 'encoder', index: i, name: KNOB_NAMES[i],
      value: knobValues[i], raw: knobValues[i],
    });
  }

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

// ── NIHIA event routing ───────────────────────────────────────────────────────

function routeNIHIAEvent(evt: NIHIAEvent): void {
  if (evt.type === 'knob') {
    const i = evt.knob;
    if (i < 0 || i > 7) return;
    knobValues[i] = Math.max(0, Math.min(127, knobValues[i] + evt.delta * KNOB_STEP));
    broadcast({
      type: 'encoder', index: i, name: KNOB_NAMES[i],
      value: knobValues[i], raw: evt.raw,
    });
  } else if (evt.type === 'encoder') {
    // HID path: C binary sends encoder events directly with index/value
    broadcast(evt as MaschineEvent);
  } else if (evt.type === 'pad') {
    broadcast({ type: 'pad', pad: evt.pad, velocity: evt.velocity, pressed: evt.pressed });
  } else if (evt.type === 'button') {
    // HID path sends {name, btnId, pressed: bool}, NIHIA path sends {btn, pressed: 0|1}
    const btnId = evt.btnId ?? evt.btn ?? -1;
    const name = evt.name ?? `btn${btnId}`;
    const pressed = !!evt.pressed;
    console.error(`[maschine] BTN ${btnId} "${name}" ${pressed ? 'PRESSED' : 'RELEASED'}`);
    broadcast({ type: 'button', name, btnId, pressed });
  }
}

// ── NIHIA process ─────────────────────────────────────────────────────────────

let nihia: ChildProcess | null = null;

function startNIHIA(): void {
  console.log(`[maschine] Spawning NIHIA bridge: ${NIHIA_BIN}`);

  nihia = spawn(NIHIA_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });

  // Route stderr to our console
  nihia.stderr?.on('data', (d: Buffer) => {
    process.stderr.write(d);
  });

  // Parse JSON events from stdout
  const rl = createInterface({ input: nihia.stdout! });
  rl.on('line', (line) => {
    try {
      const evt = JSON.parse(line) as NIHIAEvent;
      routeNIHIAEvent(evt);
    } catch { /* ignore malformed JSON */ }
  });

  nihia.on('exit', (code) => {
    console.log(`[maschine] NIHIA process exited (${code}) — restarting in 3s`);
    nihia = null;
    setTimeout(startNIHIA, 3000);
  });
}

// ── LED / Display output ──────────────────────────────────────────────────────
// Commands are forwarded to maschine-nihia via its stdin pipe.
// The C bridge parses JSON lines and dispatches MSG_LED / MSG_PROJECTNAME
// via the NIHIA instance request port on the main CFRunLoop thread.

function handleCommand(cmd: MaschineCommand): void {
  if (!nihia?.stdin?.writable) return;
  try {
    nihia.stdin.write(JSON.stringify(cmd) + '\n');
  } catch {
    // stdin closed — ignore
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log(`[maschine] Maschine MK2 NIHIA bridge starting on ws://localhost:${WS_PORT}`);
startNIHIA();
