/**
 * CZ101 AudioWorklet Processor
 * Wraps the UPD933 WASM emulation for the Casio CZ-101 synthesizer
 */

class CZ101Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasmModule = null;
    this.wasmInstance = null;
    this.isInitialized = false;
    this.sampleRate = 44100;

    // UPD933 state
    this.csState = 0;  // Chip select (active low)
    this.idState = 1;  // IRQ disable

    // Pending register writes
    this.pendingWrites = [];

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, register, value } = event.data;

    switch (type) {
      case 'init':
        await this.initWasm();
        break;

      case 'writeReg':
        // Queue register write for processing in audio thread
        this.pendingWrites.push({ register, value });
        break;

      case 'setCS':
        this.csState = value;
        break;
    }
  }

  async initWasm() {
    try {
      // Fetch the CZ101 WASM module
      const response = await fetch('/cz101/CZ101.wasm');
      const wasmBytes = await response.arrayBuffer();

      // Compile and instantiate
      const wasmModule = await WebAssembly.compile(wasmBytes);
      this.wasmInstance = await WebAssembly.instantiate(wasmModule, {
        env: {
          // Minimal environment stubs
          emscripten_memcpy_js: () => {},
          emscripten_resize_heap: () => 0,
          _abort: () => { throw new Error('abort'); },
          _emscripten_get_now: () => performance.now(),
        }
      });

      // Initialize the UPD933 chip
      // Clock for CZ-101 is approximately 4.5MHz
      const clock = 4500000;
      if (this.wasmInstance.exports._upd933_create) {
        this.chipHandle = this.wasmInstance.exports._upd933_create(clock);
      }

      this.isInitialized = true;
      this.port.postMessage({ type: 'initialized' });

      console.log('[CZ101.worklet] WASM initialized');
    } catch (err) {
      console.error('[CZ101.worklet] Init error:', err);

      // Fallback: use JavaScript-based synthesis
      this.useFallback = true;
      this.initFallbackSynth();
      this.isInitialized = true;
      this.port.postMessage({ type: 'initialized' });
    }
  }

  /**
   * Fallback JavaScript Phase Distortion synthesizer
   * Used when WASM is not available
   */
  initFallbackSynth() {
    this.voices = [];
    for (let i = 0; i < 8; i++) {
      this.voices.push({
        active: false,
        phase: 0,
        phaseInc: 0,
        pitch: 0,
        dcaLevel: 0,
        dcaTarget: 0,
        dcaRate: 0,
        dcwLevel: 0,
        dcwTarget: 0,
        dcwRate: 0,
        waveform: 0,
        window: 0
      });
    }

    // Precompute cosine table (like UPD933)
    this.cosineTable = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      this.cosineTable[i] = (1 - Math.cos(2 * Math.PI * i / 2047)) / 2;
    }

    console.log('[CZ101.worklet] Using JavaScript fallback synth');
  }

  /**
   * Write register in fallback mode
   */
  writeFallbackReg(register, value) {
    const voiceNum = register & 7;
    const regType = register >> 3;
    const voice = this.voices[voiceNum];

    switch (regType) {
      case 0: // DCA step (0x00-0x07)
        voice.dcaDirection = (value >> 15) & 1;
        voice.dcaRate = this.envRate((value >> 8) & 0x7F);
        voice.dcaSustain = (value >> 7) & 1;
        voice.dcaTarget = (value & 0x7F) / 127;
        break;

      case 4: // DCW step (0x20-0x27)
        voice.dcwDirection = (value >> 15) & 1;
        voice.dcwRate = this.envRate((value >> 8) & 0x7F);
        voice.dcwSustain = (value >> 7) & 1;
        voice.dcwTarget = (value & 0x7F) / 127;
        break;

      case 12: // Pitch (0x60-0x67)
        voice.pitch = value;
        // Convert 7.9 fixed point semitones to frequency
        const semitones = value / 512;  // 9 bits fractional
        // Note 62 = A4 (442Hz)
        const freq = 442 * Math.pow(2, (semitones - 62) / 12);
        voice.phaseInc = (freq * 2048) / this.sampleRate;
        voice.active = true;
        break;

      case 13: // Waveform (0x68-0x6F)
        voice.waveform = (value >> 13) & 7;
        voice.window = (value >> 6) & 7;
        break;

      case 19: // Phase reset (0x98-0x9F)
        voice.phase = 0;
        voice.dcaLevel = 0;
        voice.dcwLevel = 0;
        break;
    }
  }

  envRate(data) {
    // Convert rate value to envelope speed
    return ((8 + (data & 7)) << (data >> 3)) / 1000000;
  }

  /**
   * Apply phase distortion waveform
   */
  applyWaveform(phase, waveform, dcw) {
    const pos = phase & 2047;
    const pivot = Math.floor(1024 - dcw * 1024);
    let distortedPhase = 0;

    switch (waveform) {
      case 0: // Sawtooth
        if (pos < pivot) {
          distortedPhase = Math.floor(pos * 1024 / pivot);
        } else {
          distortedPhase = 1024 + Math.floor((pos - pivot) * 1024 / (2048 - pivot));
        }
        break;

      case 1: // Square
        if ((pos & 1023) < pivot) {
          distortedPhase = Math.floor((pos & 1023) * 1024 / pivot);
        } else {
          distortedPhase = 1023;
        }
        distortedPhase |= (pos & 1024);
        break;

      case 2: // Pulse
        if (pos < pivot * 2) {
          distortedPhase = Math.floor(pos * 2048 / (pivot * 2));
        } else {
          distortedPhase = 2047;
        }
        break;

      case 4: // Double sine
        if (pos < pivot) {
          distortedPhase = Math.floor(pos * 2048 / pivot);
        } else {
          distortedPhase = Math.floor((pos - pivot) * 2048 / (2048 - pivot));
        }
        break;

      case 6: // Resonance
        distortedPhase = (pos + Math.floor(pos * dcw * 16)) & 2047;
        break;

      default:
        distortedPhase = pos;
    }

    return this.cosineTable[distortedPhase & 2047];
  }

  /**
   * Update envelope
   */
  updateEnvelope(current, target, rate, direction) {
    if (direction === 0) {
      // Rising
      if (current < target) {
        current = Math.min(current + rate, target);
      }
    } else {
      // Falling
      if (current > target) {
        current = Math.max(current - rate, target);
      }
    }
    return current;
  }

  /**
   * Process audio
   */
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || left;
    const numSamples = left.length;

    // Process pending register writes
    while (this.pendingWrites.length > 0) {
      const { register, value } = this.pendingWrites.shift();
      if (this.useFallback) {
        this.writeFallbackReg(register, value);
      } else if (this.wasmInstance?.exports._upd933_write) {
        // Write to WASM (3-byte serial protocol)
        this.wasmInstance.exports._upd933_write(this.chipHandle, register);
        this.wasmInstance.exports._upd933_write(this.chipHandle, (value >> 8) & 0xFF);
        this.wasmInstance.exports._upd933_write(this.chipHandle, value & 0xFF);
      }
    }

    if (!this.isInitialized) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    if (this.useFallback) {
      // JavaScript fallback synthesis
      for (let i = 0; i < numSamples; i++) {
        let sample = 0;

        for (let v = 0; v < 8; v++) {
          const voice = this.voices[v];
          if (!voice.active || voice.dcaLevel < 0.001) continue;

          // Update envelopes
          voice.dcaLevel = this.updateEnvelope(
            voice.dcaLevel, voice.dcaTarget, voice.dcaRate, voice.dcaDirection
          );
          voice.dcwLevel = this.updateEnvelope(
            voice.dcwLevel, voice.dcwTarget, voice.dcwRate, voice.dcwDirection
          );

          // Generate sample
          const wave = this.applyWaveform(voice.phase, voice.waveform, voice.dcwLevel);
          sample += (wave * 2 - 1) * voice.dcaLevel;

          // Advance phase
          voice.phase = (voice.phase + voice.phaseInc) % 2048;
        }

        // Clamp and output
        sample = Math.max(-1, Math.min(1, sample / 4));
        left[i] = sample;
        right[i] = sample;
      }
    } else if (this.wasmInstance?.exports._upd933_render) {
      // WASM rendering
      const bufferPtr = this.wasmInstance.exports._upd933_get_buffer(this.chipHandle);
      this.wasmInstance.exports._upd933_render(this.chipHandle, numSamples);

      const heap = new Float32Array(this.wasmInstance.exports.memory.buffer);
      const offset = bufferPtr / 4;

      for (let i = 0; i < numSamples; i++) {
        left[i] = heap[offset + i];
        right[i] = heap[offset + i];
      }
    }

    return true;
  }
}

registerProcessor('cz101-processor', CZ101Processor);
