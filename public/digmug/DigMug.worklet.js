/**
 * DigMug.worklet.js - AudioWorklet processor for Digital Mugician WASM synth
 *
 * Handles per-note wavetable synthesis for Digital Mugician instruments.
 * Uses dm_ prefix functions. Follows the SoundMon.worklet.js pattern exactly.
 */

class DigMugProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.ctx = null;
    this.initialized = false;
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
        const handle = this.wasm._dm_create_player(this.ctx);
        if (handle >= 0) {
          const floatBytes = 256 * 4;
          this.players[handle] = {
            outPtrL: this.wasm._malloc(floatBytes),
            outPtrR: this.wasm._malloc(floatBytes),
          };
          this.port.postMessage({ type: 'playerCreated', handle });
        } else {
          this.port.postMessage({ type: 'error', message: 'dm_create_player failed (max players reached)' });
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
        this.wasm._dm_destroy_player(this.ctx, h);
        break;
      }

      case 'loadInstrument': {
        if (!this.wasm || !this.ctx) break;
        const insData = new Uint8Array(data.buffer);
        const ptr = this.wasm._malloc(insData.length);
        const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, insData.length);
        heap.set(insData);
        const result = this.wasm._dm_load_instrument(this.ctx, data.handle, ptr, insData.length);
        this.wasm._free(ptr);
        if (result !== 0) {
          this.port.postMessage({ type: 'error', message: `dm_load_instrument failed: ${result}` });
        }
        break;
      }

      case 'noteOn':
        if (this.wasm && this.ctx) {
          this.wasm._dm_note_on(this.ctx, data.handle, data.note, data.velocity || 100);
        }
        break;

      case 'noteOff':
        if (this.wasm && this.ctx) {
          this.wasm._dm_note_off(this.ctx, data.handle);
        }
        break;

      case 'setParam':
        if (this.wasm && this.ctx) {
          this.wasm._dm_set_param(this.ctx, data.handle, data.paramId, data.value);
        }
        break;

      case 'dispose':
        if (this.wasm && this.ctx) {
          for (const h of Object.keys(this.players)) {
            const hi = parseInt(h);
            this.wasm._free(this.players[hi].outPtrL);
            this.wasm._free(this.players[hi].outPtrR);
            this.wasm._dm_destroy_player(this.ctx, hi);
          }
          this.players = {};
          this.wasm._dm_dispose(this.ctx);
          this.ctx = null;
        }
        this.initialized = false;
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
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

      if (jsCode && !globalThis.createDigMug) {
        const wrappedCode = jsCode + '\nreturn createDigMug;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createDigMug = result;
        }
      }

      if (!globalThis.createDigMug) {
        throw new Error('createDigMug factory not available');
      }

      this.wasm = await globalThis.createDigMug({ wasmBinary });

      this.ctx = this.wasm._dm_init(Math.floor(sr));
      if (!this.ctx) {
        throw new Error('dm_init returned null');
      }

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[DigMug Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
    if (!this.initialized || !this.wasm || !this.ctx) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const blockSize = outputL.length;

    outputL.fill(0);
    outputR.fill(0);

    for (const h of Object.keys(this.players)) {
      const hi = parseInt(h);
      const player = this.players[hi];

      this.wasm._dm_render(this.ctx, hi, player.outPtrL, player.outPtrR, blockSize);

      const heapF32 = new Float32Array(this.wasm.HEAPF32.buffer);
      const lOff = player.outPtrL / 4;
      const rOff = player.outPtrR / 4;

      for (let i = 0; i < blockSize; i++) {
        outputL[i] += heapF32[lOff + i];
        outputR[i] += heapF32[rOff + i];
      }
    }

    return true;
  }
}

registerProcessor('digmug-processor', DigMugProcessor);
