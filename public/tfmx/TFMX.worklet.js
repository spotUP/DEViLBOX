/**
 * TFMX.worklet.js — AudioWorklet processor for TFMX WASM synth
 *
 * Architecture:
 *   - Multiple simultaneous instrument players (handles 0..MAX_PLAYERS-1)
 *   - Each player owns one tfmx_create_player() handle
 *   - Messages from main thread: init, createPlayer, destroyPlayer,
 *     loadInstrument, noteOn, noteOff, setParam
 *   - Audio rendering: tfmx_render() per-player, mixed into stereo output
 *
 * Follows the SoundMon worklet pattern exactly (SoundMon → TFMX renaming).
 */

class TFMXProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm        = null;
    this.ctx         = null;
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
        const handle = this.wasm._tfmx_create_player(this.ctx);
        if (handle >= 0) {
          const floatBytes = 256 * 4; // 128 samples × 2 channels × 4 bytes
          this.players[handle] = {
            outPtrL: this.wasm._malloc(floatBytes),
            outPtrR: this.wasm._malloc(floatBytes),
          };
          this.port.postMessage({ type: 'playerCreated', handle });
        } else {
          this.port.postMessage({ type: 'error', message: 'tfmx_create_player failed (max players reached)' });
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
        this.wasm._tfmx_destroy_player(this.ctx, h);
        break;
      }

      case 'resetPlayers': {
        // Free all player handles without destroying the WASM context.
        // Called on stop() to prevent player pool exhaustion across song loads.
        if (!this.wasm || !this.ctx) break;
        for (const hp of Object.keys(this.players)) {
          const hi = parseInt(hp);
          this.wasm._free(this.players[hi].outPtrL);
          this.wasm._free(this.players[hi].outPtrR);
          this.wasm._tfmx_destroy_player(this.ctx, hi);
        }
        this.players = {};
        this._modulePlaying = false;
        break;
      }

      case 'loadInstrument': {
        if (!this.wasm || !this.ctx) break;
        const insData = new Uint8Array(data.buffer);
        const ptr = this.wasm._malloc(insData.length);
        const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, insData.length);
        heap.set(insData);
        const result = this.wasm._tfmx_load_instrument(this.ctx, data.handle, ptr, insData.length);
        this.wasm._free(ptr);
        if (result !== 0) {
          this.port.postMessage({ type: 'error', message: `tfmx_load_instrument failed: ${result}` });
        }
        break;
      }

      case 'noteOn':
        if (this.wasm && this.ctx) {
          this.wasm._tfmx_note_on(this.ctx, data.handle, data.note, data.velocity || 100);
        }
        break;

      case 'noteOff':
        if (this.wasm && this.ctx) {
          this.wasm._tfmx_note_off(this.ctx, data.handle);
        }
        break;

      // ── Full-module playback messages ────────────────────────────────────
      case 'loadModule': {
        if (!this.wasm || !this.ctx) break;
        // Clean up any standalone instrument players from previous loads
        for (const hp of Object.keys(this.players)) {
          const hi = parseInt(hp);
          this.wasm._free(this.players[hi].outPtrL);
          this.wasm._free(this.players[hi].outPtrR);
          this.wasm._tfmx_destroy_player(this.ctx, hi);
        }
        this.players = {};
        const mdat = new Uint8Array(data.mdatBuffer);
        const smpl = data.smplBuffer ? new Uint8Array(data.smplBuffer) : null;
        const mdatPtr = this.wasm._malloc(mdat.byteLength);
        this.wasm.HEAPU8.set(mdat, mdatPtr);
        let smplPtr = 0, smplLen = 0;
        if (smpl && smpl.byteLength > 0) {
          smplLen = smpl.byteLength;
          smplPtr = this.wasm._malloc(smplLen);
          this.wasm.HEAPU8.set(smpl, smplPtr);
        }
        const ret = this.wasm._tfmx_load_module(this.ctx, mdatPtr, mdat.byteLength,
          smplPtr, smplLen, data.subsong || 0);
        this.wasm._free(mdatPtr);
        if (smplPtr) this.wasm._free(smplPtr);
        if (ret === 0) {
          this._moduleMode = true;
          this._modulePlaying = false;
          this._sampleRate = sampleRate;
          const voices = this.wasm._tfmx_module_voices(this.ctx);
          const songs = this.wasm._tfmx_module_songs(this.ctx);
          const duration = this.wasm._tfmx_module_duration(this.ctx);
          this._moduleDuration = duration;
          this.port.postMessage({ type: 'moduleLoaded', voices, songs, duration });
        } else {
          this.port.postMessage({ type: 'error', message: 'tfmx_load_module failed: ' + ret });
        }
        break;
      }

      case 'reloadModule': {
        // Re-runs tfmx_load_module with patched bytes — used by macro editor
        // for live preview after instrument edits.
        if (!this.wasm || !this.ctx) break;
        const wasPlaying = this._modulePlaying;
        this._modulePlaying = false;
        this.wasm._tfmx_module_stop(this.ctx);
        const mdat = new Uint8Array(data.mdatBuffer);
        const smpl = data.smplBuffer ? new Uint8Array(data.smplBuffer) : null;
        const mdatPtr = this.wasm._malloc(mdat.byteLength);
        this.wasm.HEAPU8.set(mdat, mdatPtr);
        let smplPtr = 0, smplLen = 0;
        if (smpl && smpl.byteLength > 0) {
          smplLen = smpl.byteLength;
          smplPtr = this.wasm._malloc(smplLen);
          this.wasm.HEAPU8.set(smpl, smplPtr);
        }
        const ret = this.wasm._tfmx_load_module(this.ctx, mdatPtr, mdat.byteLength,
          smplPtr, smplLen, data.subsong || 0);
        this.wasm._free(mdatPtr);
        if (smplPtr) this.wasm._free(smplPtr);
        if (ret === 0 && wasPlaying) {
          this._modulePlaying = true;
        }
        this.port.postMessage({ type: 'moduleReloaded', ok: ret === 0 });
        break;
      }

      case 'modulePlay':
        this._modulePlaying = true;
        break;

      case 'moduleStop':
        this._modulePlaying = false;
        if (this.wasm && this.ctx) {
          this.wasm._tfmx_module_stop(this.ctx);
        }
        break;

      case 'moduleMuteVoice':
        if (this.wasm && this.ctx) {
          this.wasm._tfmx_module_mute_voice(this.ctx, data.voice, data.mute ? 1 : 0);
        }
        break;

      case 'modulePreviewMacro':
        // DEViLBOX extension — trigger an instrument macro on a chosen voice
        // for editor audition. The C side calls TFMXDecoder::previewMacro
        // which sets up the cmd struct and runs the regular noteCmd path,
        // so the next render tick produces audio for that voice.
        if (this.wasm && this.ctx && this.wasm._tfmx_module_preview_macro) {
          this.wasm._tfmx_module_preview_macro(
            this.ctx,
            data.macroIdx | 0,
            data.note | 0,
            data.volume | 0,
            data.channel | 0,
          );
        }
        break;

      case 'setParam':
        if (this.wasm && this.ctx) {
          this.wasm._tfmx_set_param(this.ctx, data.handle, data.paramId, data.value);
        }
        break;

      case 'dispose':
        if (this.wasm && this.ctx) {
          for (const h of Object.keys(this.players)) {
            const hi = parseInt(h);
            this.wasm._free(this.players[hi].outPtrL);
            this.wasm._free(this.players[hi].outPtrR);
            this.wasm._tfmx_destroy_player(this.ctx, hi);
          }
          this.players = {};
          this.wasm._tfmx_dispose(this.ctx);
          this.ctx = null;
        }
        this.initialized = false;
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      // Polyfill browser APIs for Emscripten in AudioWorklet context
      if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
          createElement: () => ({
            setAttribute: () => {},
            appendChild:  () => {},
            style: {},
            addEventListener: () => {},
          }),
          head:            { appendChild: () => {} },
          body:            { appendChild: () => {} },
          createTextNode:  () => ({}),
          getElementById:  () => null,
          querySelector:   () => null,
        };
      }
      if (typeof globalThis.location === 'undefined') {
        globalThis.location = { href: '.', pathname: '/' };
      }
      if (typeof globalThis.performance === 'undefined') {
        globalThis.performance = { now: () => Date.now() };
      }

      // Load Emscripten factory via Function constructor (no import() in worklets)
      if (jsCode && !globalThis.createTFMX) {
        const wrappedCode = jsCode + '\nreturn createTFMX;';
        const factory = new Function(wrappedCode);
        const result  = factory();
        if (typeof result === 'function') {
          globalThis.createTFMX = result;
        }
      }

      if (!globalThis.createTFMX) {
        throw new Error('createTFMX factory not available');
      }

      // Instantiate WASM module with pre-fetched binary
      this.wasm = await globalThis.createTFMX({ wasmBinary });

      // Create the global synthesis context
      this.ctx = this.wasm._tfmx_init(Math.floor(sr));
      if (!this.ctx) {
        throw new Error('tfmx_init returned null');
      }

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[TFMX Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  process(_inputs, outputs, _parameters) {
    if (!this.initialized || !this.wasm || !this.ctx) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL   = output[0];
    const outputR   = output[1] || output[0];
    const numSamples = outputL.length;

    outputL.fill(0);
    outputR.fill(0);

    // Full-module playback (dedicated player slot 0)
    if (this._moduleMode && this._modulePlaying) {
      // Allocate output buffers for module render (reuse player 0's if available)
      if (!this._moduleOutL) {
        this._moduleOutL = this.wasm._malloc(256 * 4);
        this._moduleOutR = this.wasm._malloc(256 * 4);
      }
      this.wasm._tfmx_module_render(this.ctx, this._moduleOutL, this._moduleOutR, numSamples);
      const heapF32 = this.wasm.HEAPF32;
      const offL = this._moduleOutL >> 2;
      const offR = this._moduleOutR >> 2;
      for (let i = 0; i < numSamples; i++) {
        outputL[i] += heapF32[offL + i];
        outputR[i] += heapF32[offR + i];
      }

      // Send position update every ~100ms (4410 samples at 44100Hz)
      this._positionCounter = (this._positionCounter || 0) + numSamples;
      if (this._positionCounter >= 4410) {
        this._positionCounter -= 4410;
        const samplesRendered = this.wasm._tfmx_get_samples_rendered(this.ctx);
        const songEnd = this.wasm._tfmx_module_song_end(this.ctx);
        const sampleRate = this._sampleRate || 44100;
        const elapsedMs = Math.round((samplesRendered / sampleRate) * 1000);
        this.port.postMessage({ type: 'modulePosition', samplesRendered, elapsedMs, songEnd: songEnd !== 0 });

        // If song ended, notify main thread (even with loop_mode=1, some songs don't loop)
        if (songEnd !== 0) {
          this.port.postMessage({ type: 'songEnd' });
          this._modulePlaying = false;
        }
      }
      return true;
    }

    // Per-instrument synth playback
    const heapF32 = this.wasm.HEAPF32;

    for (const h of Object.keys(this.players)) {
      const hi   = parseInt(h);
      const ptrs = this.players[hi];
      if (!ptrs) continue;

      this.wasm._tfmx_render(this.ctx, hi, ptrs.outPtrL, ptrs.outPtrR, numSamples);

      const offL = ptrs.outPtrL >> 2;
      const offR = ptrs.outPtrR >> 2;

      for (let i = 0; i < numSamples; i++) {
        outputL[i] += heapF32[offL + i];
        outputR[i] += heapF32[offR + i];
      }
    }

    return true;
  }
}

registerProcessor('tfmx-processor', TFMXProcessor);
