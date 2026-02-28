/**
 * MusicLine.worklet.js — AudioWorklet processor for MusicLine Editor WASM replayer
 *
 * Song player mode: WASM renders at 28150 Hz (INTERNAL_RATE); worklet runs at
 * AudioContext sample rate (typically 48000 Hz). Linear interpolation resampling
 * bridges the two rates.
 *
 * Preview mode: single-note instrument audition, also resampled.
 */

class MusicLineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.wasm = null;
    this.initialized = false;
    this.playing = false;
    this.songLoaded = false;
    this.previewing = false;

    // Resampling state — updated after WASM init via ml_get_sample_rate()
    this._srcRate = 28150;        // WASM native output rate (INTERNAL_RATE)
    this._dstRate = sampleRate;   // AudioContext rate (48000 Hz typically)
    this._resampPos = 0.0;        // fractional read position into source buffer
    this._previewResampPos = 0.0; // fractional read position for preview resampler

    // Position reporting (~250ms intervals)
    this._reportCounter = 0;
    // 250ms / (128 samples / dstRate) = dstRate * 0.25 / 128
    this._reportInterval = Math.ceil(sampleRate * 0.25 / 128);

    // WASM heap pointers for audio buffers
    this._renderPtr = 0;     // song render buffer (stereo interleaved F32)
    this._renderFrames = 0;  // size of _renderPtr in frames
    this._previewPtr = 0;    // preview render buffer (stereo interleaved F32)
    this._previewFrames = 0; // size of _previewPtr in frames

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  // --------------------------------------------------------------------------
  // Message handling
  // --------------------------------------------------------------------------

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;

      case 'load':
        this.loadSong(data.buffer);
        break;

      case 'play':
        this.playing = true;
        this._resampPos = 0.0;
        break;

      case 'stop':
        this.playing = false;
        this._resampPos = 0.0;
        if (this.wasm && this.songLoaded) {
          this.wasm._ml_stop();
          this.songLoaded = false;
        }
        break;

      case 'set-subsong':
        if (this.wasm && this.songLoaded) {
          this.wasm._ml_set_subsong(data.subsong || 0);
          this._resampPos = 0.0;
        }
        break;

      case 'preview-load':
        this.loadPreview(data.buffer);
        break;

      case 'preview-note-on':
        if (this.wasm) {
          this.wasm._ml_preview_note_on(
            data.instIdx || 0,
            data.midiNote || 60,
            data.velocity || 100
          );
          this.previewing = true;
        }
        break;

      case 'preview-note-off':
        if (this.wasm) {
          this.wasm._ml_preview_note_off(data.instIdx || 0);
        }
        break;

      case 'preview-stop':
        if (this.wasm) {
          this.wasm._ml_preview_stop();
          this.previewing = false;
        }
        break;

      default:
        break;
    }
  }

  // --------------------------------------------------------------------------
  // WASM initialization — mirrors Hively.worklet.js exactly
  // --------------------------------------------------------------------------

  async initWasm(wasmBinary, jsCode) {
    try {
      // Polyfill browser globals that Emscripten expects in a non-window context
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

      // Execute Emscripten JS via Function constructor
      // (import() is not available inside AudioWorklet processors)
      if (jsCode && !globalThis.createMusicLine) {
        const wrappedCode = jsCode + '\nreturn createMusicLine;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createMusicLine = result;
        }
      }

      if (!globalThis.createMusicLine) {
        throw new Error('createMusicLine factory not available');
      }

      // Instantiate WASM module
      this.wasm = await globalThis.createMusicLine({
        wasmBinary: wasmBinary,
      });

      // Initialize the song engine (pass AudioContext rate; WASM will still
      // output at INTERNAL_RATE = 28150 Hz internally)
      this.wasm._ml_init(Math.floor(sampleRate));

      // Query the actual native output rate from the WASM
      this._srcRate = this.wasm._ml_get_sample_rate(); // 28150

      // Pre-allocate a render buffer large enough for one block's worth of
      // source frames plus two guard frames for the interpolation look-ahead.
      // Worst case: ceil(128 * srcRate / dstRate) + 2
      const maxSrcFrames = Math.ceil(128 * this._srcRate / this._dstRate) + 4;
      const songBufBytes = maxSrcFrames * 2 * 4; // stereo F32
      this._renderPtr = this.wasm._malloc(songBufBytes);
      this._renderFrames = maxSrcFrames;

      // Allocate a separate buffer for preview (same size is fine)
      this._previewPtr = this.wasm._malloc(songBufBytes);
      this._previewFrames = maxSrcFrames;

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[MusicLine Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Song loading
  // --------------------------------------------------------------------------

  loadSong(buffer) {
    if (!this.wasm || !this.initialized) return;

    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length).set(data);

    const ok = this.wasm._ml_load(ptr, data.length);
    this.wasm._free(ptr);

    if (ok) {
      this.songLoaded = true;
      this.playing = false;
      this._resampPos = 0.0;

      const title  = this.wasm.UTF8ToString(this.wasm._ml_get_title());
      const author = this.wasm.UTF8ToString(this.wasm._ml_get_author());
      const subsongs = this.wasm._ml_get_subsong_count();

      this.port.postMessage({
        type: 'loaded',
        title,
        author,
        subsongs,
      });
    } else {
      this.port.postMessage({ type: 'error', message: 'Failed to load MusicLine module' });
    }
  }

  // --------------------------------------------------------------------------
  // Preview loading
  // --------------------------------------------------------------------------

  loadPreview(buffer) {
    if (!this.wasm || !this.initialized) return;

    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length).set(data);

    const ok = this.wasm._ml_preview_load(ptr, data.length);
    this.wasm._free(ptr);

    if (!ok) {
      this.port.postMessage({ type: 'error', message: 'Failed to load preview module' });
    }
  }

  // --------------------------------------------------------------------------
  // Resampling helper — linear interpolation from srcRate → dstRate
  //
  // srcBuf: Float32Array view of stereo-interleaved source (frames * 2 elements)
  // srcFrames: number of valid frames in srcBuf
  // outL/outR: destination Float32Arrays of length `count`
  // count: number of output frames to fill
  // posRef: { pos: number } — fractional read position, updated in place
  // --------------------------------------------------------------------------
  _resample(srcBuf, srcFrames, outL, outR, count, posRef) {
    const ratio = this._srcRate / this._dstRate;
    let pos = posRef.pos;

    for (let i = 0; i < count; i++) {
      const srcIdx = Math.floor(pos);
      const frac   = pos - srcIdx;

      const i0 = srcIdx * 2;
      const i1 = Math.min((srcIdx + 1) * 2, (srcFrames - 1) * 2);

      outL[i] = srcBuf[i0]     + frac * (srcBuf[i1]     - srcBuf[i0]);
      outR[i] = srcBuf[i0 + 1] + frac * (srcBuf[i1 + 1] - srcBuf[i0 + 1]);

      pos += ratio;
    }

    // Retain only the fractional part so next block starts at the right offset
    posRef.pos = pos - Math.floor(pos);
  }

  // --------------------------------------------------------------------------
  // process() — called every 128 samples by the Web Audio engine
  // --------------------------------------------------------------------------

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outL = output[0];
    const outR = output[1] || output[0];
    const numOut = outL.length; // always 128

    outL.fill(0);
    outR.fill(0);

    // ── Song playback ──────────────────────────────────────────────────────
    if (this.playing && this.songLoaded) {
      // How many source frames we need to produce `numOut` destination frames
      // given the fractional position already consumed.
      const srcNeeded = Math.min(
        Math.ceil(numOut * this._srcRate / this._dstRate) + 2,
        this._renderFrames
      );

      // Render srcNeeded native-rate frames from WASM
      const framesWritten = this.wasm._ml_render(this._renderPtr, srcNeeded);

      if (framesWritten === 0 || this.wasm._ml_is_finished()) {
        // Song ended — emit event, stop playing, then fall through so the
        // rest of process() can still output silence and report position.
        this.port.postMessage({ type: 'ended' });
        this.playing = false;
        this._resampPos = 0.0;
        // (no early return — fall through to preview mixing and position report)
      }

      if (framesWritten > 0) {
        // Build a typed view directly into WASM heap (no copy needed)
        const heapF32 = this.wasm.HEAPF32;
        const off = this._renderPtr >> 2;
        const srcBuf = heapF32.subarray(off, off + framesWritten * 2);

        const posRef = { pos: this._resampPos };
        this._resample(srcBuf, framesWritten, outL, outR, numOut, posRef);
        this._resampPos = posRef.pos;
      }
    }

    // ── Instrument preview ─────────────────────────────────────────────────
    if (this.previewing) {
      const srcNeeded = Math.min(
        Math.ceil(numOut * this._srcRate / this._dstRate) + 2,
        this._previewFrames
      );

      const framesWritten = this.wasm._ml_preview_render(this._previewPtr, srcNeeded);

      if (framesWritten > 0) {
        const heapF32 = this.wasm.HEAPF32;
        const off = this._previewPtr >> 2;
        const srcBuf = heapF32.subarray(off, off + framesWritten * 2);

        // Preview resampler has its own independent position
        const posRef = { pos: this._previewResampPos };

        // Mix preview into output (additive)
        const tmpL = new Float32Array(numOut);
        const tmpR = new Float32Array(numOut);
        this._resample(srcBuf, framesWritten, tmpL, tmpR, numOut, posRef);
        this._previewResampPos = posRef.pos;

        for (let i = 0; i < numOut; i++) {
          outL[i] += tmpL[i];
          outR[i] += tmpR[i];
        }
      }
    }

    // ── Position reporting (~250ms) ────────────────────────────────────────
    this._reportCounter++;
    if (this._reportCounter >= this._reportInterval) {
      this._reportCounter = 0;
      if (this.songLoaded) {
        this.port.postMessage({
          type: 'position',
          position: this.wasm._ml_get_position(),
          row:      this.wasm._ml_get_row(),
          speed:    this.wasm._ml_get_speed(),
        });
      }
    }

    return true;
  }
}

registerProcessor('musicline-processor', MusicLineProcessor);
