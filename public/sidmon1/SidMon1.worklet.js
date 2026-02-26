/**
 * SidMon1.worklet.js - AudioWorklet processor for SidMon 1.0 WASM synth
 *
 * Architecture:
 *   - Multiple simultaneous instrument players (handles 0..MAX_PLAYERS-1)
 *   - Each player is a standalone sm1_create_player() instance
 *   - Messages from main thread: init, createPlayer, destroyPlayer,
 *     loadInstrument, noteOn, noteOff, setParam
 *   - Audio rendering: sm1_render() per-player, mixed into output
 *
 * Follows the HippelCoSo worklet pattern exactly, adapted for the sm1_ prefix.
 */

class SidMon1Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.ctx = null;
    this.initialized = false;

    // Per-player state: { outPtrL, outPtrR }
    this.players = {};

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'createPlayer': {
        if (!this.wasm || !this.ctx) break;
        const handle = this.wasm._sm1_create_player(this.ctx);
        if (handle >= 0) {
          const floatBytes = 256 * 4; // max block size (128) * 2 for safety
          this.players[handle] = {
            outPtrL: this.wasm._malloc(floatBytes),
            outPtrR: this.wasm._malloc(floatBytes),
          };
          this.port.postMessage({ type: 'playerCreated', handle });
        } else {
          this.port.postMessage({ type: 'error', message: 'sm1_create_player failed (max players reached)' });
        }
        break;
      }

      case 'destroyPlayer': {
        if (!this.wasm || !this.ctx) break;
        const h = data.handle;
        if (this.players[h]) {
          this.wasm._free(this.players[h].outPtrL);
          this.wasm._free(this.players[h].outPtrR);
          delete this.players[h];
        }
        this.wasm._sm1_destroy_player(this.ctx, h);
        break;
      }

      case 'loadInstrument': {
        if (!this.wasm || !this.ctx) break;
        const insData = new Uint8Array(data.buffer);
        const ptr = this.wasm._malloc(insData.length);
        const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, insData.length);
        heap.set(insData);
        const result = this.wasm._sm1_load_instrument(this.ctx, data.handle, ptr, insData.length);
        this.wasm._free(ptr);
        if (result !== 0) {
          this.port.postMessage({ type: 'error', message: `sm1_load_instrument failed: ${result}` });
        }
        break;
      }

      case 'noteOn':
        if (this.wasm && this.ctx) {
          this.wasm._sm1_note_on(this.ctx, data.handle, data.note, data.velocity || 100);
        }
        break;

      case 'noteOff':
        if (this.wasm && this.ctx) {
          this.wasm._sm1_note_off(this.ctx, data.handle);
        }
        break;

      case 'setParam':
        if (this.wasm && this.ctx) {
          this.wasm._sm1_set_param(this.ctx, data.handle, data.paramId, data.value);
        }
        break;

      case 'dispose':
        if (this.wasm && this.ctx) {
          // Destroy all players
          for (const h of Object.keys(this.players)) {
            const hi = parseInt(h);
            this.wasm._free(this.players[hi].outPtrL);
            this.wasm._free(this.players[hi].outPtrR);
            this.wasm._sm1_destroy_player(this.ctx, hi);
          }
          this.players = {};
          this.wasm._sm1_dispose(this.ctx);
          this.ctx = null;
        }
        this.initialized = false;
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      // Polyfill document for Emscripten in worker context
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            setAttribute: () => {},
            appendChild: () => {},
            style: {},
            addEventListener: () => {},
          }),
          head: { appendChild: () => {} },
          body: { appendChild: () => {} },
          createTextNode: () => ({}),
          getElementById: () => null,
          querySelector: () => null,
        };
      }
      if (typeof globalThis.location === 'undefined') {
        globalThis.location = { href: '.', pathname: '/' };
      }
      if (typeof globalThis.performance === 'undefined') {
        globalThis.performance = { now: () => Date.now() };
      }

      // Execute Emscripten JS via Function constructor (can't use import() in worklets)
      if (jsCode && !globalThis.createSidMon1) {
        const wrappedCode = jsCode + '\nreturn createSidMon1;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createSidMon1 = result;
        }
      }

      if (!globalThis.createSidMon1) {
        throw new Error('createSidMon1 factory not available');
      }

      // Instantiate WASM module
      this.wasm = await globalThis.createSidMon1({
        wasmBinary: wasmBinary,
      });

      // Create the global synthesis context
      this.ctx = this.wasm._sm1_init(Math.floor(sr));
      if (!this.ctx) {
        throw new Error('sm1_init returned null');
      }

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[SidMon1 Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
    if (!this.initialized || !this.wasm || !this.ctx) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    // Start with silence
    outputL.fill(0);
    outputR.fill(0);

    // Mix all active players into output
    const heapF32 = this.wasm.HEAPF32;

    for (const h of Object.keys(this.players)) {
      const hi = parseInt(h);
      const ptrs = this.players[hi];
      if (!ptrs) continue;

      this.wasm._sm1_render(this.ctx, hi, ptrs.outPtrL, ptrs.outPtrR, numSamples);

      const offL = ptrs.outPtrL >> 2; // byte ptr → float32 index
      const offR = ptrs.outPtrR >> 2;

      for (let i = 0; i < numSamples; i++) {
        outputL[i] += heapF32[offL + i];
        outputR[i] += heapF32[offR + i];
      }
    }

    return true;
  }
}

registerProcessor('sidmon1-processor', SidMon1Processor);
