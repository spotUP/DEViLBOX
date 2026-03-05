/**
 * SC68 AudioWorklet — sc68 playback in Web Audio.
 * Messages IN:  init, loadFile, startTrack, play, stop, pause
 * Messages OUT: ready, loaded, position, trackEnded, error
 */

/* global sampleRate, registerProcessor */

const RENDER_FRAMES = 960;
const RING_SIZE = RENDER_FRAMES * 4;

class SC68Worklet extends AudioWorkletProcessor {
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
      case 'loadFile': this._loadFile(msg.data); break;
      case 'startTrack':
        if (this._module) this._module._sc68_bridge_play(msg.track || 1);
        break;
      case 'play': this._playing = true; break;
      case 'stop':
        this._playing = false;
        if (this._module) this._module._sc68_bridge_stop();
        this._ringRead = this._ringWrite = this._ringAvail = 0;
        break;
      case 'pause': this._playing = false; break;
    }
  }

  async _initWASM(wasmUrl) {
    try {
      const wasmModule = await import(wasmUrl || '/sc68/SC68.js');
      const factory = wasmModule.default || wasmModule.createSC68 || wasmModule;
      this._module = await (typeof factory === 'function' ? factory() : factory);
      this._module._sc68_bridge_init();
      const bytes = RENDER_FRAMES * 2 * 2;
      this._i16Ptr = this._module._malloc(bytes);
      this._i16Buf = new Int16Array(this._module.HEAP16.buffer, this._i16Ptr, RENDER_FRAMES * 2);
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'SC68 WASM init failed: ' + err.message });
    }
  }

  _loadFile(arrayBuffer) {
    if (!this._module) return;
    const u8 = new Uint8Array(arrayBuffer);
    const ptr = this._module._malloc(u8.length);
    this._module.HEAPU8.set(u8, ptr);

    const result = this._module._sc68_bridge_load(ptr, u8.length);
    this._module._free(ptr);

    if (result < 0) {
      this.port.postMessage({ type: 'error', message: 'Failed to open SC68/SNDH' });
      return;
    }

    const title = this._module.UTF8ToString(this._module._sc68_bridge_get_title());
    const author = this._module.UTF8ToString(this._module._sc68_bridge_get_author());
    const trackCount = this._module._sc68_bridge_get_tracks();
    const duration = this._module._sc68_bridge_get_duration();
    this.port.postMessage({ type: 'loaded', title, author, trackCount, duration });
  }

  _renderToRing() {
    if (!this._module || !this._i16Buf) return;
    if (this._ringAvail >= RING_SIZE - RENDER_FRAMES * 2) return;
    if (this._i16Buf.buffer !== this._module.HEAP16.buffer) {
      this._i16Buf = new Int16Array(this._module.HEAP16.buffer, this._i16Ptr, RENDER_FRAMES * 2);
    }
    const result = this._module._sc68_bridge_process(this._i16Ptr, RENDER_FRAMES);
    if (result < 0) return;
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
      if (this._module._sc68_bridge_track_ended()) {
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
      this.port.postMessage({ type: 'position', msec: this._module._sc68_bridge_tell() });
    }
    return true;
  }
}

registerProcessor('sc68-worklet', SC68Worklet);
