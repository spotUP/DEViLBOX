/**
 * Geonkick.worklet.js — AudioWorklet processor for the Geonkick WASM synth.
 *
 * Geonkick is a percussion synthesizer that bakes each "kick" sample offline
 * when parameters change (see geonkick-wasm/common/worker_stub.c) and then
 * reads the baked buffer at trigger time via gk_wasm_render_mono.
 *
 * The worklet runs at the AudioContext sample rate (no resampling needed —
 * gk_wasm_create takes the context's sampleRate). It receives trigger events
 * via port messages and renders into the worklet output each quantum.
 */

class GeonkickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.handle = 0;
    this.initialized = false;
    this.outPtr = 0;
    this.outLen = 0;

    // Scratch buffer for envelope uploads — max 256 points × 3 floats.
    // Shared across all envelope writes; the bridge copies before returning.
    this.envPtr = 0;
    this.envMaxPoints = 256;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async handleMessage(data) {
    if (data.type === 'init') {
      await this.initWasm(data.wasmBinary, data.jsCode);
      return;
    }
    if (!this.initialized || !this.handle) return;

    const h = this.handle;
    const w = this.wasm;

    switch (data.type) {
      case 'noteOn':
        w._gk_wasm_key_pressed(h, 1, data.note | 0, data.velocity | 0);
        break;
      case 'noteOff':
        w._gk_wasm_key_pressed(h, 0, data.note | 0, 0);
        break;
      case 'setLength':
        w._gk_wasm_set_length(h, Number(data.seconds) || 0.3);
        break;
      case 'setLimiter':
        w._gk_wasm_set_limiter(h, Number(data.value) || 1.0);
        break;
      case 'setFilterEnabled':
        w._gk_wasm_set_filter_enabled(h, data.enabled ? 1 : 0);
        break;
      case 'setFilterCutoff':
        w._gk_wasm_set_filter_cutoff(h, Number(data.frequency) || 200);
        break;
      case 'setFilterFactor':
        w._gk_wasm_set_filter_factor(h, Number(data.q) || 1);
        break;
      case 'setFilterType':
        w._gk_wasm_set_filter_type(h, data.filterType | 0);
        break;
      case 'setDistortionEnabled':
        w._gk_wasm_set_distortion_enabled(h, data.enabled ? 1 : 0);
        break;
      case 'setDistortionDrive':
        w._gk_wasm_set_distortion_drive(h, Number(data.drive) || 1);
        break;
      case 'setDistortionVolume':
        w._gk_wasm_set_distortion_volume(h, Number(data.volume) || 1);
        break;
      case 'enableOsc':
        w._gk_wasm_enable_osc(h, data.oscIndex | 0, data.enabled ? 1 : 0);
        break;
      case 'enableGroup':
        w._gk_wasm_enable_group(h, data.groupIndex | 0, data.enabled ? 1 : 0);
        break;
      case 'setGroupAmplitude':
        w._gk_wasm_set_group_amplitude(h, data.groupIndex | 0, Number(data.amplitude) || 1);
        break;
      case 'setKickAmplitude':
        w._gk_wasm_set_kick_amplitude(h, Number(data.amplitude) || 1);
        break;
      case 'setOscFilterEnabled':
        w._gk_wasm_set_osc_filter_enabled(h, data.oscIndex | 0, data.enabled ? 1 : 0);
        break;
      case 'setOscFilterCutoff':
        w._gk_wasm_set_osc_filter_cutoff(h, data.oscIndex | 0, Number(data.frequency) || 800);
        break;
      case 'setOscFilterFactor':
        w._gk_wasm_set_osc_filter_factor(h, data.oscIndex | 0, Number(data.q) || 1);
        break;
      case 'setOscFilterType':
        w._gk_wasm_set_osc_filter_type(h, data.oscIndex | 0, data.filterType | 0);
        break;
      case 'setOscFm':
        w._gk_wasm_set_osc_fm(h, data.oscIndex | 0, data.isFm ? 1 : 0);
        break;
      case 'setOscPhase':
        w._gk_wasm_set_osc_phase(h, data.oscIndex | 0, Number(data.phase) || 0);
        break;
      case 'setOscSeed':
        w._gk_wasm_set_osc_seed(h, data.oscIndex | 0, data.seed | 0);
        break;
      case 'setOscAmplitude':
        w._gk_wasm_set_osc_amplitude(h, data.oscIndex | 0, Number(data.amplitude) || 0);
        break;
      case 'setOscFrequency':
        w._gk_wasm_set_osc_frequency(h, data.oscIndex | 0, Number(data.frequency) || 440);
        break;
      case 'setOscFunction':
        w._gk_wasm_set_osc_function(h, data.oscIndex | 0, data.func | 0);
        break;
      case 'setKickEnvelope': {
        const n = this.uploadEnvPoints(data.points);
        if (n > 0) {
          w._gk_wasm_set_kick_envelope(h, data.envType | 0, this.envPtr, n);
        }
        break;
      }
      case 'setOscEnvelope': {
        const n = this.uploadEnvPoints(data.points);
        if (n > 0) {
          w._gk_wasm_set_osc_envelope(
            h,
            data.oscIndex | 0,
            data.envIndex | 0,
            this.envPtr,
            n,
          );
        }
        break;
      }
      case 'dispose':
        w._gk_wasm_destroy(h);
        this.handle = 0;
        if (this.outPtr) {
          w._free(this.outPtr);
          this.outPtr = 0;
        }
        if (this.envPtr) {
          w._free(this.envPtr);
          this.envPtr = 0;
        }
        this.initialized = false;
        break;
    }
  }

  /**
   * Copy a points Float32Array (interleaved [x, y, ctrl, x, y, ctrl, ...])
   * into the preallocated envelope scratch buffer, clamping to the max
   * point count. Returns the number of points written.
   */
  uploadEnvPoints(points) {
    if (!points || !this.envPtr) return 0;
    const available = Math.floor(points.length / 3);
    const n = Math.min(available, this.envMaxPoints);
    if (n === 0) return 0;
    const heap = this.wasm.HEAPF32;
    const offset = this.envPtr >> 2;
    for (let i = 0; i < n * 3; i++) {
      heap[offset + i] = points[i];
    }
    return n;
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      const factory = new Function(jsCode + '\nreturn createGeonkickModule;')();
      this.wasm = await factory({ wasmBinary });

      // Build-time scratch: one quantum (128 frames is typical, but give
      // 2048 headroom to match GK_RENDER_CHUNK in the bridge).
      this.outLen = 2048;
      this.outPtr = this.wasm._malloc(this.outLen * 4);

      // Envelope scratch: 256 points × 3 floats × 4 bytes = 3 KB.
      this.envPtr = this.wasm._malloc(this.envMaxPoints * 3 * 4);

      // Create the synth instance at the worklet's context sample rate.
      this.handle = this.wasm._gk_wasm_create(sampleRate | 0);
      if (!this.handle) {
        throw new Error('gk_wasm_create returned null');
      }

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'Geonkick WASM init failed: ' + err.message });
    }
  }

  process(inputs, outputs, _parameters) {
    const output = outputs[0];
    if (!output || output.length < 1) return true;

    const outL = output[0];
    const outR = output.length > 1 ? output[1] : null;
    const blockSize = outL.length;

    if (!this.initialized || !this.handle || !this.outPtr) {
      outL.fill(0);
      if (outR) outR.fill(0);
      return true;
    }

    // Render mono from geonkick into WASM heap.
    this.wasm._gk_wasm_render_mono(this.handle, this.outPtr, blockSize);

    // Copy to both L and R. HEAPF32 is exposed via EXPORTED_RUNTIME_METHODS.
    const heap = this.wasm.HEAPF32;
    const offset = this.outPtr >> 2;
    for (let i = 0; i < blockSize; i++) {
      const v = heap[offset + i];
      outL[i] = v;
      if (outR) outR[i] = v;
    }

    return true;
  }
}

registerProcessor('geonkick-processor', GeonkickProcessor);
