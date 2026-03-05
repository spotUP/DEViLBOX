/**
 * MDX AudioWorklet — mdxmini playback in Web Audio.
 * Messages IN:  init, loadFile, play, stop, pause
 * Messages OUT: ready, loaded, position, trackEnded, error
 */

/* global sampleRate, registerProcessor */

const RENDER_FRAMES = 960;
const RING_SIZE = RENDER_FRAMES * 4;

class MDXWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._module = null;
    this._playing = false;
    this._ring = new Float32Array(RING_SIZE);
    this._ringRead = 0;
    this._ringWrite = 0;
    this._ringAvail = 0;
    this._i16Ptr = 0;
    this._i16Buf = null;
    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'init': this._initWASM(msg.wasmUrl); break;
      case 'loadFile': this._loadFile(msg.data, msg.pdxData); break;
      case 'play': this._playing = true; break;
      case 'stop':
        this._playing = false;
        this._ringRead = this._ringWrite = this._ringAvail = 0;
        break;
      case 'pause': this._playing = false; break;
    }
  }

  async _initWASM(wasmUrl) {
    try {
      const wasmModule = await import(wasmUrl || '/mdx/MDX.js');
      const factory = wasmModule.default || wasmModule.createMDX || wasmModule;
      this._module = await (typeof factory === 'function' ? factory() : factory);
      const bytes = RENDER_FRAMES * 2 * 2;
      this._i16Ptr = this._module._malloc(bytes);
      this._i16Buf = new Int16Array(this._module.HEAP16.buffer, this._i16Ptr, RENDER_FRAMES * 2);
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'MDX WASM init failed: ' + err.message });
    }
  }

  _loadFile(arrayBuffer, pdxBuffer) {
    if (!this._module) return;
    const u8 = new Uint8Array(arrayBuffer);
    const ptr = this._module._malloc(u8.length);
    this._module.HEAPU8.set(u8, ptr);

    let pdxPtr = 0, pdxSize = 0;
    if (pdxBuffer) {
      const pdxU8 = new Uint8Array(pdxBuffer);
      pdxPtr = this._module._malloc(pdxU8.length);
      this._module.HEAPU8.set(pdxU8, pdxPtr);
      pdxSize = pdxU8.length;
    }

    const result = this._module._mdx_bridge_open(ptr, u8.length, pdxPtr, pdxSize);
    this._module._free(ptr);
    if (pdxPtr) this._module._free(pdxPtr);

    if (result < 0) {
      this.port.postMessage({ type: 'error', message: 'Failed to open MDX' });
      return;
    }

    const title = this._module.UTF8ToString(this._module._mdx_bridge_get_title());
    const duration = this._module._mdx_bridge_get_length();
    this.port.postMessage({ type: 'loaded', title, duration, channels: 8 });
  }

  _renderToRing() {
    if (!this._module || !this._i16Buf) return;
    if (this._ringAvail >= RING_SIZE - RENDER_FRAMES * 2) return;
    if (this._i16Buf.buffer !== this._module.HEAP16.buffer) {
      this._i16Buf = new Int16Array(this._module.HEAP16.buffer, this._i16Ptr, RENDER_FRAMES * 2);
    }
    this._module._mdx_bridge_calc(this._i16Ptr >> 1, RENDER_FRAMES);
    const count = RENDER_FRAMES * 2;
    for (let i = 0; i < count; i++) {
      this._ring[this._ringWrite] = this._i16Buf[i] / 32768.0;
      this._ringWrite = (this._ringWrite + 1) % RING_SIZE;
    }
    this._ringAvail += count;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const left = output[0];
    const right = output.length > 1 ? output[1] : left;
    const blockSize = left.length;

    if (!this._playing || !this._module) {
      left.fill(0); right.fill(0); return true;
    }

    while (this._ringAvail < blockSize * 2) {
      this._renderToRing();
      if (this._module._mdx_bridge_track_ended()) {
        this.port.postMessage({ type: 'trackEnded' });
        this._playing = false;
        break;
      }
    }

    const available = Math.min(this._ringAvail >> 1, blockSize);
    for (let i = 0; i < available; i++) {
      left[i] = this._ring[this._ringRead];
      this._ringRead = (this._ringRead + 1) % RING_SIZE;
      right[i] = this._ring[this._ringRead];
      this._ringRead = (this._ringRead + 1) % RING_SIZE;
    }
    this._ringAvail -= available * 2;
    for (let i = available; i < blockSize; i++) { left[i] = 0; right[i] = 0; }

    if (this._posCounter === undefined) this._posCounter = 0;
    this._posCounter += blockSize;
    if (this._posCounter >= sampleRate / 4) {
      this._posCounter = 0;
      this.port.postMessage({ type: 'position', msec: this._module._mdx_bridge_get_pos() });
    }
    return true;
  }
}

registerProcessor('mdx-worklet', MDXWorklet);
