/**
 * Fred.worklet.js — AudioWorklet processor for Fred Editor PWM synthesis
 *
 * Wraps fred_synth.c (compiled to Fred.wasm) as an AudioWorkletProcessor.
 * Handles per-player note rendering with the fred_ WASM API.
 *
 * Messages from main thread:
 *   { type: 'init',            sampleRate, wasmBinary, jsCode }
 *   { type: 'createPlayer'   }  → responds { type: 'playerCreated', handle }
 *   { type: 'destroyPlayer',   handle }
 *   { type: 'loadInstrument',  handle, buffer }  (buffer transferred)
 *   { type: 'noteOn',          handle, note, velocity }
 *   { type: 'noteOff',         handle }
 *   { type: 'setParam',        handle, paramId, value }
 *   { type: 'dispose'         }
 */

const PROCESSOR_NAME = 'fred-processor';

class FredProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._module   = null;
    this._players  = new Map();   // handle → { ctx: ptr, outPtrL, outPtrR }
    this._ready    = false;
    this._initQueue = [];

    this.port.onmessage = (event) => this._onMessage(event.data);
  }

  _onMessage(data) {
    switch (data.type) {
      case 'init':
        this._initWasm(data).catch(err =>
          this.port.postMessage({ type: 'error', message: String(err) })
        );
        break;
      case 'createPlayer':
        if (!this._ready) { this._initQueue.push(data); break; }
        this._createPlayer();
        break;
      case 'destroyPlayer':
        if (!this._ready) break;
        this._destroyPlayer(data.handle);
        break;
      case 'loadInstrument':
        if (!this._ready) break;
        this._loadInstrument(data.handle, data.buffer);
        break;
      case 'noteOn':
        if (!this._ready) break;
        this._noteOn(data.handle, data.note, data.velocity);
        break;
      case 'noteOff':
        if (!this._ready) break;
        this._noteOff(data.handle);
        break;
      case 'setParam':
        if (!this._ready) break;
        this._module._fred_set_param(data.handle, data.paramId, data.value);
        break;
      case 'dispose':
        if (this._module) this._module._fred_dispose();
        break;
    }
  }

  async _initWasm({ sampleRate, wasmBinary, jsCode }) {
    const workerSelf = self;

    // Polyfill browser globals expected by Emscripten
    workerSelf.document    = workerSelf.document    || {};
    workerSelf.performance = workerSelf.performance || { now: () => Date.now() };
    workerSelf.location    = workerSelf.location    || { href: './' };

    // Execute the Emscripten factory via Function() to stay in AudioWorklet scope
    const factory = new Function(`${jsCode}; return createFred;`)();

    this._module = await factory({
      wasmBinary,
      locateFile: (path) => path,
    });

    const sr = sampleRate || 44100;
    this._module._fred_init(sr);
    this._ready = true;

    this.port.postMessage({ type: 'ready' });

    // Flush queued messages
    for (const msg of this._initQueue) this._onMessage(msg);
    this._initQueue = [];
  }

  _createPlayer() {
    const m = this._module;
    const handle = m._fred_create_player();
    if (handle < 0) {
      this.port.postMessage({ type: 'error', message: 'FredSynth: max players reached' });
      return;
    }
    // Allocate persistent stereo output buffers (128 frames × 4 bytes each)
    const BUF = 128 * 4;
    const outPtrL = m._malloc(BUF);
    const outPtrR = m._malloc(BUF);
    this._players.set(handle, { handle, outPtrL, outPtrR });
    this.port.postMessage({ type: 'playerCreated', handle });
  }

  _destroyPlayer(handle) {
    const p = this._players.get(handle);
    if (!p) return;
    this._module._fred_destroy_player(handle);
    this._module._free(p.outPtrL);
    this._module._free(p.outPtrR);
    this._players.delete(handle);
  }

  _loadInstrument(handle, buffer) {
    const m = this._module;
    const bytes = new Uint8Array(buffer);
    const ptr   = m._malloc(bytes.length);
    m.HEAPU8.set(bytes, ptr);
    m._fred_load_instrument(handle, ptr, bytes.length);
    m._free(ptr);
  }

  _noteOn(handle, note, velocity) {
    this._module._fred_note_on(handle, note, velocity);
  }

  _noteOff(handle) {
    this._module._fred_note_off(handle);
  }

  process(_inputs, outputs) {
    if (!this._ready || !this._module || this._players.size === 0) return true;

    const m      = this._module;
    const chL    = outputs[0][0];
    const chR    = outputs[0][1] || chL;
    const frames = chL ? chL.length : 128;

    // Mix all active players into the output
    const mixL = new Float32Array(frames);
    const mixR = new Float32Array(frames);

    for (const [handle, p] of this._players) {
      m._fred_render(handle, p.outPtrL, p.outPtrR, frames);

      const srcL = m.HEAPF32.subarray(p.outPtrL >> 2, (p.outPtrL >> 2) + frames);
      const srcR = m.HEAPF32.subarray(p.outPtrR >> 2, (p.outPtrR >> 2) + frames);

      for (let i = 0; i < frames; i++) {
        mixL[i] += srcL[i];
        mixR[i] += srcR[i];
      }
    }

    if (chL) chL.set(mixL);
    if (chR) chR.set(mixR);

    return true;
  }
}

registerProcessor(PROCESSOR_NAME, FredProcessor);
