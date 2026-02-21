/**
 * UADE.worklet.js — AudioWorklet processor for UADE exotic Amiga format playback
 *
 * Runs inside an AudioWorkletGlobalScope (separate thread from main JS).
 * Communicates with UADEEngine.ts via port messages.
 *
 * Message protocol (from main thread):
 *   { type: 'init', sampleRate, wasmBinary }
 *   { type: 'load', buffer: ArrayBuffer, filenameHint: string }
 *   { type: 'play' }
 *   { type: 'stop' }
 *   { type: 'pause' }
 *   { type: 'setSubsong', index: number }
 *   { type: 'setLooping', value: boolean }
 *   { type: 'dispose' }
 *
 * Messages sent to main thread:
 *   { type: 'ready' }                            — WASM initialized
 *   { type: 'loaded', player, formatName, subsongCount, minSubsong, maxSubsong }
 *   { type: 'error', message }                   — Load/init error
 *   { type: 'songEnd' }                          — Song playback finished
 *   { type: 'position', subsong, position }      — Periodic position update
 */

class UADEProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._wasm = null;         // Emscripten module instance
    this._ready = false;
    this._playing = false;
    this._paused = false;

    // Float32 output buffers allocated in WASM heap
    this._outL = null;
    this._outR = null;
    this._outFrames = 256;    // Larger than 128 to handle render calls > quantum size

    this.port.onmessage = (event) => this._handleMessage(event.data);
  }

  async _handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this._init(data.sampleRate, data.wasmBinary);
        break;

      case 'load':
        this._load(data.buffer, data.filenameHint);
        break;

      case 'play':
        this._playing = true;
        this._paused = false;
        break;

      case 'stop':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_stop();
        }
        this._playing = false;
        this._paused = false;
        break;

      case 'pause':
        this._paused = !this._paused;
        break;

      case 'setSubsong':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_set_subsong(data.index);
        }
        break;

      case 'setLooping':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_set_looping(data.value ? 1 : 0);
        }
        break;

      case 'dispose':
        if (this._wasm && this._ready) {
          this._wasm._uade_wasm_cleanup();
        }
        this._ready = false;
        this._playing = false;
        break;
    }
  }

  async _init(sampleRate, wasmBinary) {
    try {
      // Load the Emscripten-generated UADE.js glue code
      // (We load it via importScripts since we're in a WorkletGlobalScope)
      if (typeof createUADE === 'undefined') {
        importScripts('./UADE.js');
      }

      // Instantiate the WASM module with the provided binary
      this._wasm = await createUADE({
        wasmBinary,
        locateFile: (path) => './' + path,
      });

      // Allocate float32 buffers in WASM heap for audio output
      const frameBytes = this._outFrames * 4;  // float32
      this._ptrL = this._wasm._malloc(frameBytes);
      this._ptrR = this._wasm._malloc(frameBytes);

      // Initialize UADE engine
      const ret = this._wasm._uade_wasm_init(sampleRate || 44100);
      if (ret !== 0) {
        throw new Error('uade_wasm_init failed with code ' + ret);
      }

      this._ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  _load(buffer, filenameHint) {
    if (!this._wasm || !this._ready) {
      this.port.postMessage({ type: 'error', message: 'WASM not ready' });
      return;
    }

    try {
      // Copy file data into WASM heap
      const data = new Uint8Array(buffer);
      const ptr = this._wasm._malloc(data.byteLength);
      this._wasm.HEAPU8.set(data, ptr);

      // Write filename hint into WASM heap
      const hintBytes = new TextEncoder().encode(filenameHint + '\0');
      const hintPtr = this._wasm._malloc(hintBytes.byteLength);
      this._wasm.HEAPU8.set(hintBytes, hintPtr);

      // Load the file
      const ret = this._wasm._uade_wasm_load(ptr, data.byteLength, hintPtr);

      this._wasm._free(ptr);
      this._wasm._free(hintPtr);

      if (ret !== 0) {
        this.port.postMessage({
          type: 'error',
          message: `UADE could not play: ${filenameHint}`
        });
        return;
      }

      // Read back metadata
      const nameBuf = this._wasm._malloc(256);
      this._wasm._uade_wasm_get_player_name(nameBuf, 256);
      const player = this._wasm.UTF8ToString(nameBuf);

      this._wasm._uade_wasm_get_format_name(nameBuf, 256);
      const formatName = this._wasm.UTF8ToString(nameBuf);
      this._wasm._free(nameBuf);

      const minSubsong = this._wasm._uade_wasm_get_subsong_min();
      const maxSubsong = this._wasm._uade_wasm_get_subsong_max();
      const subsongCount = this._wasm._uade_wasm_get_subsong_count();

      this._playing = false;  // Caller must explicitly call 'play'

      this.port.postMessage({
        type: 'loaded',
        player: player || 'Unknown',
        formatName: formatName || 'Unknown',
        minSubsong,
        maxSubsong,
        subsongCount,
      });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  process(_inputs, outputs) {
    const outL = outputs[0][0];
    const outR = outputs[0][1] || outputs[0][0];  // Mono fallback
    const frames = outL.length;  // Usually 128

    if (!this._ready || !this._playing || this._paused) {
      // Silence
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    try {
      // Render audio into WASM-allocated float32 buffers
      const ret = this._wasm._uade_wasm_render(this._ptrL, this._ptrR, frames);

      if (ret === 0) {
        // Song ended
        this._playing = false;
        this.port.postMessage({ type: 'songEnd' });
        outL.fill(0);
        if (outR !== outL) outR.fill(0);
        return true;
      }

      if (ret < 0) {
        // Error — silence and continue
        outL.fill(0);
        if (outR !== outL) outR.fill(0);
        return true;
      }

      // Copy float32 from WASM heap to Web Audio output buffers
      const heapF32 = this._wasm.HEAPF32;
      const baseL = this._ptrL >> 2;  // Convert byte offset to float32 index
      const baseR = this._ptrR >> 2;

      for (let i = 0; i < frames; i++) {
        outL[i] = heapF32[baseL + i];
        if (outR !== outL) outR[i] = heapF32[baseR + i];
      }
    } catch (err) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
    }

    return true;  // Keep processor alive
  }
}

registerProcessor('uade-processor', UADEProcessor);
