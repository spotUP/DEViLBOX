# SuperCollider Synth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a SuperCollider synth instrument to DEViLBOX — users write real SynthDef code in a CodeMirror editor, compile server-side via sclang, play via scsynth.wasm in an AudioWorklet, tweak auto-extracted params via knobs, and import/export `.scpreset` files.

**Architecture:** scsynth WASM (extended build with sc3-plugins) runs in an AudioWorklet following the UADE pattern. Main thread sends OSC packets via port messages. A backend endpoint runs sclang to compile SC source → binary and extract param metadata.

**Tech Stack:** scsynth.wasm (scsynth-wasm-builds), CodeMirror 6, Vitest, TypeScript, existing backend (sclang).

**Design doc:** `docs/plans/2026-02-28-supercollider-synth-design.md`

---

## Before Starting

**Read these files completely before touching anything:**
- `docs/plans/2026-02-28-supercollider-synth-design.md` — approved design
- `public/uade/UADE.worklet.js` — the worklet pattern to clone
- `src/engine/uade/UADEEngine.ts` — the engine pattern to clone
- `src/engine/uade/UADESynth.ts` — the synth wrapper pattern to clone
- `src/types/instrument.ts:192-210` — where to insert new SynthType
- `src/types/instrument.ts:3514-3543` — where to insert config field

**Run typecheck baseline before any changes:**
```bash
npm run type-check
```
Must pass clean before you touch anything.

---

## Task 1: Acquire scsynth WASM Binary

> This is a manual step. No tests needed. The binary is a build artifact, not code.

**Files:**
- Create: `public/sc/` (directory)

**Step 1: Download extended scsynth WASM build**

Go to https://github.com/rd--/scsynth-wasm-builds and download the extended build files (256MB memory, sc3-plugins). The files will be named something like `scsynth.js` and `scsynth.wasm` (check the repo for exact filenames — they may use underscores or release tags).

Place them at:
```
public/sc/SC.js
public/sc/SC.wasm
```

If the repo uses different filenames (e.g. `scsynth.wasm`), rename them to `SC.wasm` and `SC.js` for consistency with DEViLBOX conventions.

**Step 2: Check what WASM exports are available**

Study the SuperSonic source at https://github.com/samaaron/supersonic to understand the exact WASM API surface:
- What function initializes scsynth? (e.g. `_scsynth_init`)
- What function renders audio? (e.g. `_scsynth_perform`)
- How are OSC packets sent to the server? (e.g. `_scsynth_send_osc_async`)
- What function reads output samples?

**Record the exact export names** — you'll need them in Task 3 (the worklet).

**Step 3: Verify the files exist and are non-empty**

```bash
ls -lh public/sc/
```

Expected: `SC.wasm` > 10MB (it's a large binary), `SC.js` exists.

**Step 4: Commit**

```bash
git add public/sc/SC.js public/sc/SC.wasm
git commit -m "feat(sc): add scsynth WASM binary with sc3-plugins (extended build)"
```

---

## Task 2: OSC Encoder — Tests First

**Files:**
- Create: `src/engine/sc/oscEncoder.ts`
- Create: `src/engine/sc/__tests__/oscEncoder.test.ts`

**Step 1: Create the test file**

```typescript
// src/engine/sc/__tests__/oscEncoder.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodeOSCMessage,
  oscLoadSynthDef,
  oscNewSynth,
  oscSetParams,
  oscFreeNode,
} from '../oscEncoder';

describe('encodeOSCMessage', () => {
  it('encodes address string padded to 4 bytes', () => {
    const msg = encodeOSCMessage('/a', []);
    // "/a\0\0" = 4 bytes, ",\0\0\0" = 4 bytes
    expect(msg.byteLength).toBe(8);
    expect(msg[0]).toBe(0x2f); // '/'
    expect(msg[1]).toBe(0x61); // 'a'
    expect(msg[2]).toBe(0);    // null terminator
    expect(msg[3]).toBe(0);    // padding
  });

  it('encodes int32 argument in big-endian', () => {
    const msg = encodeOSCMessage('/x', [{ type: 'i', value: 42 }]);
    const view = new DataView(msg.buffer);
    // Address: 4 bytes, type tag ",i\0\0": 4 bytes, then int32
    const intVal = view.getInt32(8, false); // big-endian
    expect(intVal).toBe(42);
  });

  it('encodes float32 argument in big-endian', () => {
    const msg = encodeOSCMessage('/x', [{ type: 'f', value: 440.0 }]);
    const view = new DataView(msg.buffer);
    const fVal = view.getFloat32(8, false);
    expect(fVal).toBeCloseTo(440.0, 1);
  });

  it('encodes string argument padded to 4 bytes', () => {
    const msg = encodeOSCMessage('/x', [{ type: 's', value: 'hi' }]);
    // "hi\0\0" = 4 bytes
    expect(msg[8]).toBe(0x68); // 'h'
    expect(msg[9]).toBe(0x69); // 'i'
    expect(msg[10]).toBe(0);
    expect(msg[11]).toBe(0);
  });

  it('encodes blob with 4-byte size prefix padded to 4 bytes', () => {
    const data = new Uint8Array([1, 2, 3]);
    const msg = encodeOSCMessage('/x', [{ type: 'b', value: data }]);
    const view = new DataView(msg.buffer);
    // After address+type tag: int32 length = 3, then [1,2,3,0] padded
    const blobLen = view.getInt32(8, false);
    expect(blobLen).toBe(3);
    expect(msg[12]).toBe(1);
    expect(msg[13]).toBe(2);
    expect(msg[14]).toBe(3);
  });
});

describe('oscNewSynth', () => {
  it('creates /s_new with defName, nodeId, addAction=0, group=0, then key-value pairs', () => {
    const msg = oscNewSynth('mySynth', 1000, { cutoff: 800, resonance: 0.3 });
    const decoder = new TextDecoder();
    // Address should start with /s_new
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/s_new');
    expect(msg.byteLength).toBeGreaterThan(0);
  });
});

describe('oscSetParams', () => {
  it('creates /n_set with nodeId and key-value pairs', () => {
    const msg = oscSetParams(1000, { gate: 0 });
    const decoder = new TextDecoder();
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/n_set');
  });
});

describe('oscFreeNode', () => {
  it('creates /n_free with nodeId', () => {
    const msg = oscFreeNode(1000);
    const decoder = new TextDecoder();
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/n_free');
  });
});

describe('oscLoadSynthDef', () => {
  it('creates /d_recv with binary blob', () => {
    const binary = new Uint8Array([0xDE, 0xAD]);
    const msg = oscLoadSynthDef(binary);
    const decoder = new TextDecoder();
    const addr = decoder.decode(msg.slice(0, 8)).replace(/\0/g, '');
    expect(addr).toBe('/d_recv');
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/engine/sc/__tests__/oscEncoder.test.ts
```
Expected: FAIL — `Cannot find module '../oscEncoder'`

**Step 3: Implement oscEncoder.ts**

```typescript
// src/engine/sc/oscEncoder.ts

function pad4(n: number): number {
  return Math.ceil(n / 4) * 4;
}

function encodeString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  const size = pad4(bytes.length + 1); // +1 for null terminator
  const buf = new Uint8Array(size);
  buf.set(bytes);
  // remaining bytes already 0 (null terminator + padding)
  return buf;
}

function encodeInt32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setInt32(0, value, false); // false = big-endian
  return buf;
}

function encodeFloat32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setFloat32(0, value, false);
  return buf;
}

function encodeBlob(data: Uint8Array): Uint8Array {
  const paddedLen = pad4(data.length);
  const buf = new Uint8Array(4 + paddedLen);
  const view = new DataView(buf.buffer);
  view.setInt32(0, data.length, false);
  buf.set(data, 4);
  return buf;
}

export type OSCArg =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Uint8Array };

export function encodeOSCMessage(address: string, args: OSCArg[]): Uint8Array {
  const addrBytes = encodeString(address);
  const typeTags = ',' + args.map(a => a.type).join('');
  const typeBytes = encodeString(typeTags);

  const argParts: Uint8Array[] = args.map(arg => {
    switch (arg.type) {
      case 'i': return encodeInt32BE(arg.value);
      case 'f': return encodeFloat32BE(arg.value);
      case 's': return encodeString(arg.value);
      case 'b': return encodeBlob(arg.value);
    }
  });

  const totalSize = addrBytes.length + typeBytes.length +
    argParts.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  result.set(addrBytes, offset); offset += addrBytes.length;
  result.set(typeBytes, offset); offset += typeBytes.length;
  for (const part of argParts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** /d_recv <blob> — load a compiled SynthDef binary */
export function oscLoadSynthDef(binary: Uint8Array): Uint8Array {
  return encodeOSCMessage('/d_recv', [{ type: 'b', value: binary }]);
}

/** /s_new — create a new synth node */
export function oscNewSynth(
  defName: string,
  nodeId: number,
  params: Record<string, number>,
): Uint8Array {
  const args: OSCArg[] = [
    { type: 's', value: defName },
    { type: 'i', value: nodeId },
    { type: 'i', value: 0 }, // addAction: addToHead
    { type: 'i', value: 0 }, // targetGroup: root group
  ];
  for (const [key, val] of Object.entries(params)) {
    args.push({ type: 's', value: key });
    args.push({ type: 'f', value: val });
  }
  return encodeOSCMessage('/s_new', args);
}

/** /n_set — update named parameters on a running node */
export function oscSetParams(nodeId: number, params: Record<string, number>): Uint8Array {
  const args: OSCArg[] = [{ type: 'i', value: nodeId }];
  for (const [key, val] of Object.entries(params)) {
    args.push({ type: 's', value: key });
    args.push({ type: 'f', value: val });
  }
  return encodeOSCMessage('/n_set', args);
}

/** /n_free — release a node */
export function oscFreeNode(nodeId: number): Uint8Array {
  return encodeOSCMessage('/n_free', [{ type: 'i', value: nodeId }]);
}
```

**Step 4: Run tests — confirm all pass**

```bash
npx vitest run src/engine/sc/__tests__/oscEncoder.test.ts
```
Expected: all PASS.

**Step 5: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 6: Commit**

```bash
git add src/engine/sc/oscEncoder.ts src/engine/sc/__tests__/oscEncoder.test.ts
git commit -m "feat(sc): add OSC 1.0 message encoder with tests"
```

---

## Task 3: SC AudioWorklet

**Files:**
- Create: `public/sc/SC.worklet.js`

> **Important:** Before writing this, read `public/uade/UADE.worklet.js` completely to understand the pattern, then read the SuperSonic source (https://github.com/samaaron/supersonic) to find the exact scsynth WASM API function names. The worklet is plain JS (not TypeScript) because AudioWorklets are loaded as bare scripts.

**Step 1: Create SC.worklet.js**

Follow the UADE worklet pattern exactly. Replace UADE-specific calls with scsynth API calls.

```javascript
// public/sc/SC.worklet.js
//
// SuperCollider (scsynth) AudioWorklet processor.
// Follows the same message-passing pattern as UADE.worklet.js.
//
// Messages IN (from SuperColliderEngine):
//   { type: 'init', sampleRate, wasmBinary, jsCode }
//   { type: 'sendOSC', packet: ArrayBuffer }   — raw OSC packet bytes
//   { type: 'dispose' }
//
// Messages OUT (to SuperColliderEngine):
//   { type: 'ready' }
//   { type: 'error', message }

class SCProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._wasm = null;
    this._ready = false;
    this._outL = null;      // WASM heap pointer for left channel output
    this._outR = null;      // WASM heap pointer for right channel output
    this._blockSize = 64;   // scsynth default block size (one hardware period)
    this.port.onmessage = (event) => this._handleMessage(event.data);
  }

  async _handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this._init(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'sendOSC': {
        if (!this._wasm || !this._ready) {
          console.warn('[SC.worklet] sendOSC before WASM ready — dropping');
          break;
        }
        const bytes = new Uint8Array(data.packet);
        // Write OSC bytes to WASM heap, call scsynth's OSC receive function.
        // NOTE: Check SuperSonic source for exact function name.
        // Likely: this._wasm._scsynth_send_osc_async(ptr, length)
        const ptr = this._wasm._malloc(bytes.byteLength);
        this._wasm.HEAPU8.set(bytes, ptr);
        this._wasm._scsynth_send_osc_async(ptr, bytes.byteLength);
        this._wasm._free(ptr);
        break;
      }

      case 'dispose':
        this._ready = false;
        if (this._wasm) {
          if (this._outL) { this._wasm._free(this._outL); this._outL = null; }
          if (this._outR) { this._wasm._free(this._outR); this._outR = null; }
        }
        break;
    }
  }

  async _init(sr, wasmBinary, jsCode) {
    try {
      // Execute the Emscripten JS glue code inside the worklet scope.
      // This defines the factory function (same technique as UADE).
      const factoryFn = new Function(jsCode + '\nreturn createSCModule;');
      const createSCModule = factoryFn();

      this._wasm = await createSCModule({
        wasmBinary,
        noInitialRun: true,
        print: (msg) => console.log('[scsynth]', msg),
        printErr: (msg) => console.warn('[scsynth]', msg),
      });

      // Initialize scsynth. Check SuperSonic for exact init signature.
      // Typical: _scsynth_init(sampleRate, blockSize, numOutputChannels)
      this._wasm._scsynth_init(sr, this._blockSize, 2);

      // Allocate output buffers on WASM heap (one float per frame × blockSize)
      this._outL = this._wasm._malloc(this._blockSize * 4); // float32 = 4 bytes
      this._outR = this._wasm._malloc(this._blockSize * 4);

      this._ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  process(_inputs, outputs) {
    if (!this._wasm || !this._ready) return true;

    const output = outputs[0];
    const leftCh = output[0];
    const rightCh = output[1] ?? output[0];
    const frames = leftCh?.length ?? 128;

    let written = 0;
    while (written < frames) {
      const toWrite = Math.min(this._blockSize, frames - written);

      // Render one block. Check SuperSonic for exact signature.
      // Typical: _scsynth_perform(outLPtr, outRPtr, numFrames)
      this._wasm._scsynth_perform(this._outL, this._outR, toWrite);

      // Copy WASM heap → AudioWorklet output buffers
      const heapF32 = new Float32Array(this._wasm.HEAPU8.buffer);
      const lOffset = this._outL / 4; // byte ptr → float32 index
      const rOffset = this._outR / 4;

      for (let i = 0; i < toWrite; i++) {
        leftCh[written + i]  = heapF32[lOffset + i];
        rightCh[written + i] = heapF32[rOffset + i];
      }
      written += toWrite;
    }

    return true;
  }
}

registerProcessor('sc-processor', SCProcessor);
```

> ⚠️ **The function names `_scsynth_init`, `_scsynth_perform`, `_scsynth_send_osc_async` are guesses based on convention.** Before committing, verify these against the actual WASM exports. Load the WASM in Node.js and call `Object.keys(module).filter(k => k.startsWith('_'))` to list all exported functions, or read the SuperSonic worklet source directly.

**Step 2: Verify worklet syntax**

```bash
node --input-type=module <<'EOF'
// Quick syntax check — import as text, parse as module
import { readFileSync } from 'fs';
const src = readFileSync('public/sc/SC.worklet.js', 'utf-8');
new Function(src); // Will throw if syntax error
console.log('Syntax OK');
EOF
```

**Step 3: Commit**

```bash
git add public/sc/SC.worklet.js
git commit -m "feat(sc): add SC AudioWorklet processor (scsynth WASM wrapper)"
```

---

## Task 4: SuperColliderEngine.ts

**Files:**
- Create: `src/engine/sc/SuperColliderEngine.ts`

> Read `src/engine/uade/UADEEngine.ts` lines 75-200 for the exact singleton + worklet init pattern to clone.

**Step 1: Create the engine**

```typescript
// src/engine/sc/SuperColliderEngine.ts
import { getDevilboxAudioContext } from '@/engine/audioContext';
import { oscLoadSynthDef, oscNewSynth, oscSetParams, oscFreeNode } from './oscEncoder';

export class SuperColliderEngine {
  private static instance: SuperColliderEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _rejectInit: ((err: Error) => void) | null = null;
  private _disposed = false;
  private _nextNodeId = 1000; // scsynth node IDs start above 0

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });
    this.initialize();
  }

  static getInstance(): SuperColliderEngine {
    if (!SuperColliderEngine.instance || SuperColliderEngine.instance._disposed) {
      SuperColliderEngine.instance = new SuperColliderEngine();
    }
    return SuperColliderEngine.instance;
  }

  private async initialize(): Promise<void> {
    try {
      await SuperColliderEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[SCEngine] Initialization failed:', err);
      this._rejectInit?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existing = this.initPromises.get(context);
    if (existing) return existing;

    const promise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}sc/SC.worklet.js`);
      } catch {
        // May already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmRes, jsRes] = await Promise.all([
          fetch(`${baseUrl}sc/SC.wasm`),
          fetch(`${baseUrl}sc/SC.js`),
        ]);
        if (!wasmRes.ok) throw new Error('[SCEngine] Failed to fetch SC.wasm');
        if (!jsRes.ok)   throw new Error('[SCEngine] Failed to fetch SC.js');

        this.wasmBinary = await wasmRes.arrayBuffer();
        let code = await jsRes.text();
        // Same transforms as UADE: fix import.meta.url, strip ESM exports
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '')
          .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];');
        this.jsCode = code;
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, promise);
    return promise;
  }

  private createNode(): void {
    this.workletNode = new AudioWorkletNode(this.audioContext, 'sc-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const { type, message } = event.data;
      if (type === 'ready') {
        console.log('[SCEngine] scsynth WASM ready');
        this._resolveInit?.();
        this._resolveInit = null;
        this._rejectInit = null;
      } else if (type === 'error') {
        console.error('[SCEngine] Worklet error:', message);
        this._rejectInit?.(new Error(message));
      }
    };

    this.workletNode.connect(this.output);

    // Send init message with WASM assets
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: this.audioContext.sampleRate,
      wasmBinary: SuperColliderEngine.wasmBinary,
      jsCode: SuperColliderEngine.jsCode,
    }, [SuperColliderEngine.wasmBinary!.slice(0)]); // Transfer a copy
  }

  /** Wait until scsynth WASM is initialized and ready */
  async waitReady(): Promise<void> {
    return this._initPromise;
  }

  /** Load a compiled SynthDef binary (base64 or raw bytes) */
  async loadSynthDef(binary: Uint8Array): Promise<void> {
    await this.waitReady();
    this._sendOSC(oscLoadSynthDef(binary));
  }

  /** Create a new synth node. Returns the nodeId for later control. */
  noteOn(defName: string, params: Record<string, number>): number {
    const nodeId = this._nextNodeId++;
    this._sendOSC(oscNewSynth(defName, nodeId, params));
    return nodeId;
  }

  /** Release a node by setting gate=0 (for EnvGen-controlled synthdefs) */
  noteOff(nodeId: number): void {
    this._sendOSC(oscSetParams(nodeId, { gate: 0 }));
  }

  /** Set named parameters on a running node */
  setNodeParams(nodeId: number, params: Record<string, number>): void {
    this._sendOSC(oscSetParams(nodeId, params));
  }

  /** Free a node immediately (hard kill, no envelope release) */
  freeNode(nodeId: number): void {
    this._sendOSC(oscFreeNode(nodeId));
  }

  private _sendOSC(packet: Uint8Array): void {
    if (!this.workletNode) return;
    const copy = packet.slice();
    this.workletNode.port.postMessage(
      { type: 'sendOSC', packet: copy.buffer },
      [copy.buffer],
    );
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    SuperColliderEngine.instance = null;
  }
}
```

**Step 2: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 3: Commit**

```bash
git add src/engine/sc/SuperColliderEngine.ts
git commit -m "feat(sc): add SuperColliderEngine (worklet lifecycle, OSC routing)"
```

---

## Task 5: SuperColliderSynth.ts

**Files:**
- Create: `src/engine/sc/SuperColliderSynth.ts`

**Step 1: Create the synth**

```typescript
// src/engine/sc/SuperColliderSynth.ts
import { getDevilboxAudioContext } from '@/engine/audioContext';
import type { DevilboxSynth } from '@/types/synth';
import { SuperColliderEngine } from './SuperColliderEngine';

export interface SuperColliderConfig {
  synthDefName: string;
  source: string;            // SC source code (for editor display)
  binary: string;            // base64-encoded compiled .scsyndef, empty until compiled
  params: SCParam[];         // Tweakable params (freq/amp/gate excluded)
}

export interface SCParam {
  name: string;
  value: number;
  default: number;
  min: number;
  max: number;
}

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function base64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export class SuperColliderSynth implements DevilboxSynth {
  readonly name = 'SuperColliderSynth';
  readonly output: GainNode;

  private engine: SuperColliderEngine;
  private _config: SuperColliderConfig | null = null;
  private _currentNodeId: number | null = null;
  private _disposed = false;
  private _synthDefLoaded = false;

  constructor() {
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
    this.engine = SuperColliderEngine.getInstance();
    this.engine.output.connect(this.output);
  }

  async setConfig(config: SuperColliderConfig): Promise<void> {
    if (this._disposed) return;
    this._config = config;
    this._synthDefLoaded = false;

    if (config.binary) {
      const bytes = base64ToBytes(config.binary);
      await this.engine.loadSynthDef(bytes);
      this._synthDefLoaded = true;
    }
  }

  triggerAttack(note: string | number, _time?: number, velocity = 1): void {
    if (this._disposed || !this._config || !this._synthDefLoaded) return;

    const midiNote = typeof note === 'string' ? parseFloat(note) : note;
    const freq = midiToHz(midiNote);
    const amp = Math.max(0, Math.min(1, velocity));

    // Build params: reserved (freq, amp, gate) + current user params
    const params: Record<string, number> = { freq, amp, gate: 1 };
    for (const p of this._config.params) {
      params[p.name] = p.value;
    }

    this._currentNodeId = this.engine.noteOn(this._config.synthDefName, params);
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed || this._currentNodeId === null) return;
    this.engine.noteOff(this._currentNodeId);
    this._currentNodeId = null;
  }

  triggerAttackRelease(
    note: string | number,
    _duration: number,
    time?: number,
    velocity = 1,
  ): void {
    this.triggerAttack(note, time, velocity);
    // For fixed-duration notes, rely on SynthDef's own envelope (doneAction: 2)
    // Gate release happens via triggerRelease or the synth frees itself
  }

  set(param: string, value: number): void {
    if (!this._config) return;
    const p = this._config.params.find(x => x.name === param);
    if (p) {
      p.value = value;
      if (this._currentNodeId !== null) {
        this.engine.setNodeParams(this._currentNodeId, { [param]: value });
      }
    }
    if (param === 'volume') {
      this.output.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  get(param: string): number | undefined {
    if (param === 'volume') return this.output.gain.value;
    return this._config?.params.find(p => p.name === param)?.value;
  }

  dispose(): void {
    this._disposed = true;
    if (this._currentNodeId !== null) {
      this.engine.freeNode(this._currentNodeId);
      this._currentNodeId = null;
    }
    this.engine.output.disconnect(this.output);
  }
}
```

**Step 2: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 3: Commit**

```bash
git add src/engine/sc/SuperColliderSynth.ts
git commit -m "feat(sc): add SuperColliderSynth (DevilboxSynth wrapper)"
```

---

## Task 6: Types + Config in instrument.ts

**Files:**
- Modify: `src/types/instrument.ts`

**Step 1: Add `SuperCollider` to the SynthType union**

Find line 197 (near `'UADESynth'`) and add:

```typescript
  // SuperCollider — real scsynth.wasm with user SynthDefs
  | 'SuperCollider'   // Real SuperCollider synth (scsynth WASM + server-side compilation)
```

Place it near the other WASM-based synths (around line 197, after `'HivelySynth'`).

**Step 2: Add `SuperColliderConfig` and `SCParam` interfaces**

Find the section near `HivelyConfig` (around line 638) and add before it:

```typescript
// ── SuperCollider ──────────────────────────────────────────────────────────

export interface SCParam {
  name: string;
  value: number;
  default: number;
  min: number;
  max: number;
}

export interface SuperColliderConfig {
  synthDefName: string;    // Name declared in SynthDef(\name, ...)
  source: string;          // SC source code (for editor display)
  binary: string;          // base64-encoded compiled .scsyndef (empty until compiled)
  params: SCParam[];       // Tweakable params (freq, amp, gate excluded)
}

export const DEFAULT_SUPERCOLLIDER: SuperColliderConfig = {
  synthDefName: 'mySynth',
  source: `SynthDef(\\mySynth, { |freq=440, amp=0.5, gate=1|
  var sig = SinOsc.ar(freq) * amp;
  var env = EnvGen.kr(Env.adsr(0.01, 0.1, 0.7, 0.5), gate, doneAction: 2);
  Out.ar(0, (sig * env).dup);
}).add`,
  binary: '',
  params: [],
};
```

**Step 3: Add `superCollider?` to InstrumentConfig**

Find the section around line 3514-3516 (near `hively?: HivelyConfig`) and add:

```typescript
  // SuperCollider synth (scsynth WASM + server-side compilation)
  superCollider?: SuperColliderConfig;
```

**Step 4: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 5: Commit**

```bash
git add src/types/instrument.ts
git commit -m "feat(sc): add SuperCollider SynthType, SuperColliderConfig, SCParam types"
```

---

## Task 7: Wire into InstrumentFactory

**Files:**
- Modify: `src/engine/InstrumentFactory.ts`

**Step 1: Add import near the other engine imports (around line 44)**

```typescript
import { SuperColliderSynth } from './sc/SuperColliderSynth';
```

**Step 2: Add factory case before `default:` (around line 999)**

```typescript
      case 'SuperCollider': {
        const scSynth = new SuperColliderSynth();
        if (config.superCollider) {
          scSynth.setConfig(config.superCollider).catch(err =>
            console.error('[InstrumentFactory] SuperCollider load failed:', err)
          );
        }
        instrument = scSynth;
        break;
      }
```

**Step 3: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 4: Commit**

```bash
git add src/engine/InstrumentFactory.ts
git commit -m "feat(sc): wire SuperCollider into InstrumentFactory"
```

---

## Task 8: Compilation Server Endpoint

> This is backend work. The exact implementation depends on your server stack. This task specifies the contract — implement it according to your backend conventions.

**Files:** (backend — path depends on your stack)

**Contract:**

```
POST /api/sc/compile
Content-Type: application/json

Body: { "source": "SynthDef(\\mySynth, { ... }).add" }

Success response (200):
{
  "success": true,
  "synthDefName": "mySynth",     // extracted from SynthDef(\name, ...)
  "binary": "<base64 string>",   // compiled .scsyndef binary
  "params": [                    // extracted from args, excluding freq/amp/gate
    { "name": "cutoff",    "default": 800,  "min": 20,   "max": 20000 },
    { "name": "resonance", "default": 0.3,  "min": 0,    "max": 1    }
  ]
}

Error response (200 with success:false):
{
  "success": false,
  "error": "ERROR: SyntaxError: unexpected token",
  "line": 4,
  "col": 12
}
```

**Step 1: Implement the endpoint**

The endpoint must:

1. Write the SC source to a temp file (e.g. `/tmp/sc_compile_<uuid>.scd`)
2. Run sclang to compile:
   ```bash
   sclang -e "
   thisProcess.addToCleanup({ 0.exit });
   SynthDef.new(\"mySynth\", { |freq=440, amp=0.5, gate=1|
     // source here
   }).writeDefFile(\"/tmp/output\");
   "
   ```
   Or more practically: write the source to a temp `.scd`, execute with `sclang temp.scd`, capture stdout/stderr.
3. Read the resulting `.scsyndef` binary from the output directory
4. Extract the SynthDef name from source with regex: `/SynthDef\(\\?(\w+)/`
5. Extract params with regex: `/\|([^|]*)\|/` on the function body, split by commas, parse `name=value` pairs — skip `freq`, `amp`, `gate`
6. For each param with a numeric default, set `min: default * 0, max: default * 2` (sensible range guesses — user can adjust in editor)
7. Base64-encode the binary and return the JSON response

**Step 2: Test the endpoint manually**

```bash
curl -X POST /api/sc/compile \
  -H 'Content-Type: application/json' \
  -d '{"source": "SynthDef(\\\\mySynth, { |freq=440, amp=0.5, gate=1| var sig = SinOsc.ar(freq) * amp; var env = EnvGen.kr(Env.adsr, gate, doneAction: 2); Out.ar(0, (sig * env).dup); }).add"}'
```

Expected: JSON with `success: true`, `binary` (long base64 string), `params: []` (freq/amp/gate excluded).

**Step 3: Test an error case**

```bash
curl -X POST /api/sc/compile \
  -H 'Content-Type: application/json' \
  -d '{"source": "this is not valid SC code"}'
```

Expected: JSON with `success: false`, `error` containing sclang's error output.

**Step 4: Commit**

Commit according to your backend conventions.

---

## Task 9: SuperColliderEditor.tsx — Code Editor Pane

**Files:**
- Create: `src/components/instruments/SuperColliderEditor.tsx`

**Step 1: Install CodeMirror 6 dependencies**

```bash
npm install @codemirror/view @codemirror/state @codemirror/language @codemirror/commands @codemirror/theme-one-dark
```

**Step 2: Create a minimal SC language highlighter**

SuperCollider isn't in CodeMirror's language packages, so we write a minimal one. Add this as a helper inside the editor file or a small separate file `src/engine/sc/scLanguage.ts`:

```typescript
// src/engine/sc/scLanguage.ts
import { StreamLanguage } from '@codemirror/language';

// Minimal SC tokenizer — keywords, strings, comments, numbers
export const superColliderLanguage = StreamLanguage.define({
  name: 'supercollider',
  token(stream) {
    if (stream.match(/\/\/.*/)) return 'comment';
    if (stream.match(/\/\*[\s\S]*?\*\//)) return 'comment';
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/'[^']*'/)) return 'string'; // symbols
    if (stream.match(/\\[a-zA-Z_]\w*/)) return 'atom'; // \symbol
    if (stream.match(/\b(var|arg|SynthDef|Out|In|EnvGen|Env|LFO|LFNoise|SinOsc|Saw|Pulse|VarSaw|RLPF|RHPF|LPF|HPF|Resonz|Pan2|Mix|doneAction|addToHead|add|kr|ar|ir)\b/)) return 'keyword';
    if (stream.match(/\b\d+\.?\d*\b/)) return 'number';
    stream.next();
    return null;
  },
});
```

**Step 3: Create SuperColliderEditor.tsx (code pane only, no params yet)**

```tsx
// src/components/instruments/SuperColliderEditor.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { superColliderLanguage } from '@/engine/sc/scLanguage';
import type { SuperColliderConfig, SCParam } from '@/engine/sc/SuperColliderSynth';

interface Props {
  config: SuperColliderConfig;
  onChange: (config: SuperColliderConfig) => void;
}

type CompileStatus =
  | { state: 'idle' }
  | { state: 'compiling' }
  | { state: 'success' }
  | { state: 'error'; message: string; line?: number };

export const SuperColliderEditor: React.FC<Props> = ({ config, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<CompileStatus>({ state: 'idle' });
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: config.source,
      extensions: [
        basicSetup,
        oneDark,
        superColliderLanguage,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newSource = update.state.doc.toString();
            onChange({ ...configRef.current, source: newSource });
          }
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: editorRef.current });
    return () => { viewRef.current?.destroy(); viewRef.current = null; };
  }, []); // Only mount once

  const handleCompile = useCallback(async () => {
    const source = viewRef.current?.state.doc.toString() ?? configRef.current.source;
    setStatus({ state: 'compiling' });
    try {
      const res = await fetch('/api/sc/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (data.success) {
        const newParams: SCParam[] = (data.params ?? []).map((p: { name: string; default: number; min: number; max: number }) => ({
          name: p.name,
          default: p.default,
          value: p.default,
          min: p.min,
          max: p.max,
        }));
        onChange({
          ...configRef.current,
          source,
          synthDefName: data.synthDefName,
          binary: data.binary,
          params: newParams,
        });
        setStatus({ state: 'success' });
      } else {
        setStatus({ state: 'error', message: data.error, line: data.line });
      }
    } catch (err) {
      setStatus({ state: 'error', message: 'Compilation server unavailable' });
    }
  }, [onChange]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Code editor */}
      <div
        ref={editorRef}
        className="flex-1 overflow-auto rounded border border-ft2-border font-mono text-xs min-h-[200px]"
      />

      {/* Status bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleCompile}
          disabled={status.state === 'compiling'}
          className="px-3 py-1 text-xs font-mono bg-ft2-cursor text-black rounded hover:opacity-90 disabled:opacity-40"
        >
          {status.state === 'compiling' ? 'Compiling...' : 'Compile & Load'}
        </button>
        <span className="text-xs font-mono text-ft2-textDim">
          {status.state === 'idle' && (config.binary ? '● Compiled' : '⚠ Not compiled')}
          {status.state === 'compiling' && '⟳ Compiling...'}
          {status.state === 'success' && '● Compiled'}
          {status.state === 'error' && (
            <span className="text-red-400">
              ✗ {status.message}{status.line ? ` (line ${status.line})` : ''}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};
```

**Step 4: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 5: Commit**

```bash
git add src/components/instruments/SuperColliderEditor.tsx src/engine/sc/scLanguage.ts
git commit -m "feat(sc): add SuperColliderEditor with CodeMirror 6 SC editor and compile button"
```

---

## Task 10: SuperColliderEditor — Param Knob Panel + Preset I/O

**Files:**
- Modify: `src/components/instruments/SuperColliderEditor.tsx`

**Step 1: Add the param knob panel and preset import/export to the editor**

Replace the `return` block in `SuperColliderEditor.tsx` with a two-column layout:

```tsx
  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header: name + preset I/O */}
      <div className="flex items-center justify-between">
        <span className="text-ft2-text text-xs font-mono font-bold">SuperCollider</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="px-2 py-0.5 text-[10px] font-mono border border-ft2-border text-ft2-textDim rounded hover:text-ft2-text"
          >
            Import
          </button>
          <button
            onClick={handleExport}
            disabled={!config.binary}
            className="px-2 py-0.5 text-[10px] font-mono border border-ft2-border text-ft2-textDim rounded hover:text-ft2-text disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </div>

      {/* Main: editor (left) + params (right) */}
      <div className="flex flex-1 gap-2 min-h-0">
        {/* Code editor */}
        <div
          ref={editorRef}
          className="flex-1 overflow-auto rounded border border-ft2-border font-mono text-xs"
        />

        {/* Param panel */}
        <div className="w-44 flex flex-col gap-1 overflow-y-auto">
          <span className="text-[9px] text-ft2-textDim font-mono uppercase tracking-widest">Parameters</span>
          {config.params.length === 0 && (
            <span className="text-[9px] text-ft2-textDim font-mono italic">Compile to extract params</span>
          )}
          {config.params.map((param) => (
            <div key={param.name} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-ft2-textDim font-mono">{param.name}</span>
                <span className="text-[9px] text-ft2-text font-mono w-10 text-right">
                  {param.value.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={(param.max - param.min) / 200}
                value={param.value}
                onChange={(e) => handleParamChange(param.name, Number(e.target.value))}
                className="w-full h-1 accent-ft2-cursor"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleCompile}
          disabled={status.state === 'compiling'}
          className="px-3 py-1 text-xs font-mono bg-ft2-cursor text-black rounded hover:opacity-90 disabled:opacity-40"
        >
          {status.state === 'compiling' ? 'Compiling...' : 'Compile & Load'}
        </button>
        <span className="text-xs font-mono text-ft2-textDim">
          {status.state === 'idle' && (config.binary ? '● Compiled' : '⚠ Not compiled')}
          {status.state === 'compiling' && '⟳ Compiling...'}
          {status.state === 'success' && '● Compiled'}
          {status.state === 'error' && (
            <span className="text-red-400">
              ✗ {status.message}{status.line ? ` (line ${status.line})` : ''}
            </span>
          )}
        </span>
      </div>

      {/* Hidden import input */}
      <input ref={importInputRef} type="file" accept=".scpreset" className="hidden" onChange={handleImportFile} />
    </div>
  );
```

**Step 2: Add the `handleParamChange`, `handleImport`, `handleExport`, `handleImportFile` handlers**

Add these inside the component (before the return):

```tsx
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleParamChange = useCallback((name: string, value: number) => {
    const newParams = configRef.current.params.map(p =>
      p.name === name ? { ...p, value } : p
    );
    onChange({ ...configRef.current, params: newParams });
    // Live update the running synth (if playing) — component owner handles this
  }, [onChange]);

  const handleExport = useCallback(() => {
    const preset = {
      version: 1,
      name: configRef.current.synthDefName || 'untitled',
      synthDefName: configRef.current.synthDefName,
      source: configRef.current.source,
      binary: configRef.current.binary,
      params: configRef.current.params,
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name}.scpreset`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const preset = JSON.parse(ev.target?.result as string);
        if (!preset.source || !preset.synthDefName) throw new Error('Invalid .scpreset file');
        onChange({
          synthDefName: preset.synthDefName,
          source: preset.source,
          binary: preset.binary ?? '',
          params: preset.params ?? [],
        });
        setStatus({ state: preset.binary ? 'success' : 'idle' });
        // Update editor content
        if (viewRef.current) {
          viewRef.current.dispatch({
            changes: {
              from: 0,
              to: viewRef.current.state.doc.length,
              insert: preset.source,
            },
          });
        }
      } catch {
        alert('Failed to import .scpreset — invalid file format');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-importing same file
  }, [onChange]);
```

**Step 3: Typecheck**

```bash
npm run type-check
```
Must be clean.

**Step 4: Commit**

```bash
git add src/components/instruments/SuperColliderEditor.tsx
git commit -m "feat(sc): add param knob panel and .scpreset import/export to SuperColliderEditor"
```

---

## Task 11: Integration Test (Manual)

> This is a manual verification task. No automated test can cover live audio + WASM without a full browser.

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Create a SuperCollider instrument**

In DEViLBOX, add a new instrument and select `SuperCollider` as the synth type.

**Step 3: Verify the editor loads**

- CodeMirror editor should show with the default SinOsc SynthDef source
- "Compile & Load" button should be visible
- Status should show "⚠ Not compiled"
- Parameter panel should show "Compile to extract params"

**Step 4: Compile a SynthDef**

Click "Compile & Load". Expected:
- Status changes to "⟳ Compiling..."
- Then: "● Compiled"
- Parameter panel populates with knobs for any non-reserved params

**Step 5: Play a note**

Trigger a note in the pattern editor or piano keyboard. Expected: audible sine wave.

**Step 6: Test knob control**

If the SynthDef has extra params (e.g. `cutoff`), adjust the knob while a note is held. Expected: live parameter update.

**Step 7: Test export and re-import**

- Export as `.scpreset` — verify the file is valid JSON with `source`, `binary`, `params`
- Create a new SC instrument, import the `.scpreset` — verify it loads correctly
- Click "Compile & Load" — should succeed without errors

**Step 8: Test a compile error**

Introduce a syntax error in the SC code and click "Compile & Load". Expected: red error message with line number.

---

## Task 12: Final Typecheck + Cleanup

**Step 1: Full typecheck**

```bash
npm run type-check
```
Must be clean with zero errors.

**Step 2: Run all tests**

```bash
npm test
```
Must pass — new code shouldn't break anything else.

**Step 3: Final commit if anything was cleaned up**

```bash
git add -p  # stage only the cleanup changes
git commit -m "chore(sc): typecheck cleanup and final integration"
```

---

## Summary of New Files

| File | Description |
|---|---|
| `public/sc/SC.wasm` | scsynth WASM binary (extended build, sc3-plugins) |
| `public/sc/SC.js` | Emscripten JS glue for scsynth |
| `public/sc/SC.worklet.js` | AudioWorklet processor (scsynth wrapper) |
| `src/engine/sc/oscEncoder.ts` | OSC 1.0 message encoder |
| `src/engine/sc/__tests__/oscEncoder.test.ts` | OSC encoder unit tests |
| `src/engine/sc/scLanguage.ts` | CodeMirror 6 SC language definition |
| `src/engine/sc/SuperColliderEngine.ts` | Worklet lifecycle + OSC message routing |
| `src/engine/sc/SuperColliderSynth.ts` | DevilboxSynth implementation |
| `src/components/instruments/SuperColliderEditor.tsx` | Editor UI (code + knobs + preset I/O) |

## Modified Files

| File | Change |
|---|---|
| `src/types/instrument.ts` | `SuperCollider` SynthType, `SuperColliderConfig`, `SCParam`, `DEFAULT_SUPERCOLLIDER` |
| `src/engine/InstrumentFactory.ts` | `SuperCollider` case |
