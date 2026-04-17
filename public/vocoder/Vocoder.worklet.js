/**
 * Vocoder.worklet.js — AudioWorkletProcessor for voclib WASM vocoder.
 *
 * Input 0: Modulator (microphone signal, mono)
 * Output 0: Vocoded signal (mono)
 *
 * Directly instantiates the WASM binary (no Emscripten JS glue) to avoid
 * CSP issues. Only imports emscripten_resize_heap.
 */

class VocoderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.alive = true;
    this.ready = false;
    this.vocoderPtr = 0;
    this.modulatorBuf = 0;
    this.outputBuf = 0;

    this.exports = null;
    this.HEAPF32 = null;
    this.memory = null;

    this.rmsCounter = 0;
    this.rmsInterval = 17; // ~50ms at 44100/128

    // Noise gate — smooth open/close to avoid clicks
    this.gateOpen = 0;          // 0 = closed, 1 = open
    this.gateThreshold = 0.015; // mic peak must exceed this to open (covers normal
                                // speech on built-in laptop mics after 2x preamp;
                                // still above typical room/keyboard/HVAC floor)
    this.gateAttack = 0.05;     // how fast it opens (per block, 0-1)
    this.gateRelease = 0.008;   // how fast it closes (per block, 0-1)

    this.port.onmessage = (e) => this.handleMessage(e.data);
    console.log('[Vocoder Worklet] Processor constructed');
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data);
        break;
      case 'reinit':
        this.reinitVocoder(data);
        break;
      case 'setCarrierType':
        if (this.ready) this.exports.i(this.vocoderPtr, data.value);
        break;
      case 'setCarrierFreq':
        if (this.ready) this.exports.j(this.vocoderPtr, data.value);
        break;
      case 'setWet':
        if (this.ready) this.exports.k(this.vocoderPtr, data.value);
        break;
      case 'setReactionTime':
        if (this.ready) this.exports.l(this.vocoderPtr, data.value);
        break;
      case 'setFormantShift':
        if (this.ready) this.exports.m(this.vocoderPtr, data.value);
        break;
      case 'reset':
        if (this.ready) this.exports.n(this.vocoderPtr);
        break;
      case 'dispose':
        this.dispose();
        break;
    }
  }

  /** Recreate the vocoder with new bands/filtersPerBand (e.g. on preset change) */
  reinitVocoder(data) {
    if (!this.ready || !this.exports || !this.vocoderPtr) return;
    const ex = this.exports;
    const { sampleRate: sr, bands, filtersPerBand } = data;

    // Destroy old instance + buffers
    ex.f(this.vocoderPtr);
    if (this.modulatorBuf) ex.q(this.modulatorBuf);
    if (this.outputBuf) ex.q(this.outputBuf);

    // Create new
    this.vocoderPtr = ex.d(sr || sampleRate, bands || 32, filtersPerBand || 6);
    this.modulatorBuf = ex.o(128);
    this.outputBuf = ex.o(128);
    console.log('[Vocoder Worklet] Reinit: bands=' + bands + ' filters=' + filtersPerBand + ' ptr=' + this.vocoderPtr);
  }

  updateHeapViews() {
    if (this.memory) {
      this.HEAPF32 = new Float32Array(this.memory.buffer);
    }
  }

  async initWasm(data) {
    try {
      const { wasmBinary, sampleRate: sr, bands, filtersPerBand } = data;

      console.log('[Vocoder Worklet] initWasm called, wasmBinary:', wasmBinary ? wasmBinary.byteLength + ' bytes' : 'MISSING');
      console.log('[Vocoder Worklet] WebAssembly available:', typeof WebAssembly !== 'undefined');

      if (!wasmBinary || wasmBinary.byteLength === 0) {
        this.port.postMessage({ type: 'error', message: 'No WASM binary received (got ' + (wasmBinary ? wasmBinary.byteLength : 'null') + ')' });
        return;
      }

      const self = this;
      const importObject = {
        a: {
          a: function emscripten_resize_heap(requestedSize) {
            const mem = self.memory;
            if (!mem) { console.error('[Vocoder Worklet] resize_heap called but memory is null'); return 0; }
            const oldSize = mem.buffer.byteLength;
            const maxSize = 2147483648;
            if (requestedSize > maxSize) return 0;
            for (let cutDown = 1; cutDown <= 4; cutDown *= 2) {
              let overGrown = oldSize * (1 + 0.2 / cutDown);
              overGrown = Math.min(overGrown, requestedSize + 100663296);
              const newSize = Math.min(maxSize, Math.ceil(Math.max(requestedSize, overGrown) / 65536) * 65536);
              const pages = (newSize - oldSize + 65535) / 65536 | 0;
              try {
                mem.grow(pages);
                self.updateHeapViews();
                return 1;
              } catch (e) { /* retry */ }
            }
            return 0;
          }
        }
      };

      console.log('[Vocoder Worklet] Calling WebAssembly.instantiate...');
      const result = await WebAssembly.instantiate(wasmBinary, importObject);
      const ex = result.instance.exports;
      this.exports = ex;
      this.memory = ex.b;
      this.updateHeapViews();
      console.log('[Vocoder Worklet] WASM instantiated, exports:', Object.keys(ex).join(','));

      ex.c(); // Emscripten init
      console.log('[Vocoder Worklet] Emscripten init done');

      this.vocoderPtr = ex.d(sr || sampleRate, bands || 48, filtersPerBand || 6);
      console.log('[Vocoder Worklet] vocoder_create ptr:', this.vocoderPtr);

      if (!this.vocoderPtr) {
        this.port.postMessage({ type: 'error', message: 'vocoder_create returned null' });
        return;
      }

      // Set sane carrier defaults immediately so process() works before
      // the main thread round-trips with applyCurrentParams().
      ex.i(this.vocoderPtr, 3);      // chord carrier
      ex.j(this.vocoderPtr, 130.81); // C3 frequency
      ex.k(this.vocoderPtr, 1.0);    // 100% wet
      ex.l(this.vocoderPtr, 0.03);   // 30ms reaction time
      ex.m(this.vocoderPtr, 1.0);    // no formant shift

      this.modulatorBuf = ex.o(128);
      this.outputBuf = ex.o(128);
      console.log('[Vocoder Worklet] Buffers allocated: mod=' + this.modulatorBuf + ' out=' + this.outputBuf);

      this.ready = true;
      this.port.postMessage({ type: 'ready' });
      console.log('[Vocoder Worklet] Ready!');
    } catch (err) {
      console.error('[Vocoder Worklet] initWasm failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  dispose() {
    if (this.exports && this.vocoderPtr) {
      this.exports.f(this.vocoderPtr);
      if (this.modulatorBuf) this.exports.q(this.modulatorBuf);
      if (this.outputBuf) this.exports.q(this.outputBuf);
    }
    this.ready = false;
    this.alive = false;
    this.vocoderPtr = 0;
  }

  process(inputs, outputs) {
    if (!this.alive) return false;
    if (!this.ready || !this.vocoderPtr) return true;

    const input = inputs[0];
    const output = outputs[0];
    const inputChannel = input && input[0];
    const outputChannel = output && output[0];

    if (!outputChannel) return true;

    const frames = outputChannel.length;

    if (!inputChannel || inputChannel.length === 0) {
      outputChannel.fill(0);
      // Log once when we have no input
      if (!this._warnedNoInput) {
        console.warn('[Vocoder Worklet] No input channel — mic may not be connected');
        this._warnedNoInput = true;
      }
      return true;
    }

    const ex = this.exports;

    // Refresh HEAPF32 in case memory grew
    const HEAPF32 = new Float32Array(this.memory.buffer);

    // Compute mic peak for noise gate + diagnostics
    let micMax = 0;
    for (let i = 0; i < frames; i++) {
      const v = Math.abs(inputChannel[i]);
      if (v > micMax) micMax = v;
    }

    // Noise gate — smoothly open/close based on mic level to kill ambient noise
    if (micMax > this.gateThreshold) {
      this.gateOpen = Math.min(1, this.gateOpen + this.gateAttack);
    } else {
      this.gateOpen = Math.max(0, this.gateOpen - this.gateRelease);
    }

    let rms = 0;
    const outOffset = this.outputBuf >> 2;

    // If gate is fully closed, skip processing and output silence
    if (this.gateOpen < 0.001) {
      outputChannel.fill(0);
    } else {
      // Copy modulator (mic) into WASM heap
      const modOffset = this.modulatorBuf >> 2;
      HEAPF32.set(inputChannel.subarray(0, frames), modOffset);

      // Process vocoder
      rms = ex.g(this.vocoderPtr, this.modulatorBuf, this.outputBuf, frames);

      // Copy output with gain boost + gate envelope
      // Vocoder filter banks distribute energy across bands → output is naturally very quiet.
      // tanh prevents harsh clipping regardless of gain amount.
      const MAKEUP_GAIN = 50.0;
      const gate = this.gateOpen;
      for (let i = 0; i < frames; i++) {
        const raw = HEAPF32[outOffset + i] * MAKEUP_GAIN * gate;
        outputChannel[i] = Math.tanh(raw);
      }
    }

    // Report RMS + mic peak continuously
    this.rmsCounter++;
    if (this.rmsCounter >= this.rmsInterval) {
      this.rmsCounter = 0;

      // Send both vocoder RMS and mic peak to main thread
      this.port.postMessage({ type: 'rms', value: rms, micPeak: micMax });

      // Log to console for first 20 reports + whenever mic peak exceeds threshold
      this._diagCount = (this._diagCount || 0) + 1;
      if (this._diagCount <= 20 || micMax > 0.05) {
        let outMax = 0;
        const outHeap = new Float32Array(this.memory.buffer);
        for (let i = 0; i < frames; i++) {
          const v = Math.abs(outHeap[outOffset + i]);
          if (v > outMax) outMax = v;
        }
        console.log('[Vocoder Worklet] mic peak=' + micMax.toFixed(6) +
          ' vocoderOut peak=' + outMax.toFixed(6) +
          ' rms=' + rms.toFixed(6) +
          (this._diagCount === 20 ? ' (continuous logging for loud signals)' : ''));
      }
    }

    return true;
  }
}

registerProcessor('vocoder-processor', VocoderProcessor);
