/**
 * OctaMED.worklet.js - AudioWorklet processor for OctaMED synth instrument replayer
 *
 * Standalone instrument-only mode: no song playback ring buffer.
 * Handles up to MAX_PLAYERS simultaneous instrument voices.
 */

class OctaMEDProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.initialized = false;
    this.playerOutPtrs = {};

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
        if (!this.wasm) break;
        const h = this.wasm._octamed_create_player(Math.floor(sampleRate));
        if (h >= 0) {
          const floatBytes = 128 * 4;
          this.playerOutPtrs[h] = {
            l: this.wasm._malloc(floatBytes),
            r: this.wasm._malloc(floatBytes),
          };
          this.port.postMessage({ type: 'playerCreated', handle: h });
        }
        break;
      }

      case 'destroyPlayer': {
        if (!this.wasm) break;
        const h = data.handle;
        if (this.playerOutPtrs[h]) {
          this.wasm._free(this.playerOutPtrs[h].l);
          this.wasm._free(this.playerOutPtrs[h].r);
          delete this.playerOutPtrs[h];
        }
        this.wasm._octamed_destroy_player(h);
        break;
      }

      case 'setInstrument': {
        if (!this.wasm) break;
        const insData = new Uint8Array(data.buffer);
        const ptr = this.wasm._malloc(insData.length);
        const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, insData.length);
        heap.set(insData);
        this.wasm._octamed_player_set_instrument(data.handle, ptr, insData.length);
        this.wasm._free(ptr);
        break;
      }

      case 'noteOn':
        if (this.wasm) {
          this.wasm._octamed_player_note_on(data.handle, data.note, data.velocity || 127);
        }
        break;

      case 'noteOff':
        if (this.wasm) {
          this.wasm._octamed_player_note_off(data.handle);
        }
        break;

      case 'dispose':
        this.destroyAllPlayers();
        this.initialized = false;
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      /* Polyfill document for Emscripten in worker context */
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

      /* Execute Emscripten JS via Function constructor */
      if (jsCode && !globalThis.createOctaMED) {
        const wrappedCode = jsCode + '\nreturn createOctaMED;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createOctaMED = result;
        }
      }

      if (!globalThis.createOctaMED) {
        throw new Error('createOctaMED factory not available');
      }

      this.wasm = await globalThis.createOctaMED({
        wasmBinary: wasmBinary,
      });

      this.wasm._octamed_init(Math.floor(sr));

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[OctaMED Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  destroyAllPlayers() {
    if (!this.wasm) return;
    for (const h of Object.keys(this.playerOutPtrs)) {
      const hi = parseInt(h);
      if (this.playerOutPtrs[hi]) {
        this.wasm._free(this.playerOutPtrs[hi].l);
        this.wasm._free(this.playerOutPtrs[hi].r);
        this.wasm._octamed_destroy_player(hi);
      }
    }
    this.playerOutPtrs = {};
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    outputL.fill(0);
    outputR.fill(0);

    /* Mix all active instrument players */
    if (this.wasm) {
      const heapF32 = this.wasm.HEAPF32;
      for (const h of Object.keys(this.playerOutPtrs)) {
        const hi = parseInt(h);
        const ptrs = this.playerOutPtrs[hi];
        if (!ptrs) continue;

        const n = this.wasm._octamed_player_render(hi, ptrs.l, ptrs.r, numSamples);
        if (n > 0) {
          const offL = ptrs.l >> 2;
          const offR = ptrs.r >> 2;
          for (let i = 0; i < n; i++) {
            outputL[i] += heapF32[offL + i];
            outputR[i] += heapF32[offR + i];
          }
        }
      }
    }

    return true;
  }
}

registerProcessor('octamed-processor', OctaMEDProcessor);
