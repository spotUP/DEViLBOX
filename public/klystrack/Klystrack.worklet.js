/**
 * Klystrack.worklet.js - AudioWorklet processor for klystron WASM replayer
 *
 * Uses direct sample-by-sample rendering (no frame-based ring buffer needed
 * since klystron renders arbitrary sample counts via cyd_output_buffer_stereo).
 */

class KlystrackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.initialized = false;
    this.playing = false;
    this.songLoaded = false;
    this.looping = true;

    // WASM float buffers for decode output
    this.decodePtrL = 0;
    this.decodePtrR = 0;
    this.decodeCapacity = 0;

    // Position reporting
    this.reportCounter = 0;
    this.reportInterval = 8;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadSong':
        this.loadSong(data.buffer);
        break;

      case 'freeSong':
        this.freeSong();
        break;

      case 'play':
        this.playing = true;
        if (this.wasm) this.wasm._klys_pause(0);
        break;

      case 'stop':
        if (this.wasm) this.wasm._klys_stop();
        this.playing = false;
        break;

      case 'pause':
        this.playing = false;
        if (this.wasm) this.wasm._klys_pause(1);
        break;

      case 'setLooping':
        this.looping = data.value !== false;
        break;

      case 'dispose':
        this.freeSong();
        this.playing = false;
        this.initialized = false;
        break;
    }
  }

  async initWasm(sr, wasmBinary, jsCode) {
    try {
      // Polyfill document for Emscripten in worker context
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
      if (jsCode && !globalThis.createKlystrack) {
        const wrappedCode = jsCode + '\nreturn createKlystrack;';
        const factory = new Function(wrappedCode);
        const result = factory();
        if (typeof result === 'function') {
          globalThis.createKlystrack = result;
        }
      }

      if (!globalThis.createKlystrack) {
        throw new Error('createKlystrack factory not available');
      }

      this.wasm = await globalThis.createKlystrack({
        wasmBinary: wasmBinary,
      });

      this.wasm._klys_init(Math.floor(sr));

      // Allocate decode buffers (128 samples is the standard AudioWorklet block)
      this.ensureDecodeBuffers(128);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[Klystrack Worklet] Init failed:', err);
      this.port.postMessage({ type: 'error', message: err.message || String(err) });
    }
  }

  ensureDecodeBuffers(samples) {
    if (samples > this.decodeCapacity) {
      if (this.decodePtrL) this.wasm._free(this.decodePtrL);
      if (this.decodePtrR) this.wasm._free(this.decodePtrR);
      const bytes = samples * 4; // float32
      this.decodePtrL = this.wasm._malloc(bytes);
      this.decodePtrR = this.wasm._malloc(bytes);
      this.decodeCapacity = samples;
    }
  }

  loadSong(buffer) {
    if (!this.wasm || !this.initialized) return;

    const data = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(data.length);
    const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length);
    heap.set(data);

    const ok = this.wasm._klys_load_song(ptr, data.length);
    this.wasm._free(ptr);

    if (ok) {
      this.songLoaded = true;
      this.playing = true;

      const channels = this.wasm._klys_get_num_channels();
      const numPatterns = this.wasm._klys_get_num_patterns();
      const numInstruments = this.wasm._klys_get_num_instruments();

      const meta = {
        type: 'songLoaded',
        title: this.wasm.UTF8ToString(this.wasm._klys_get_title()),
        channels,
        songLength: this.wasm._klys_get_song_length(),
        numInstruments,
        numPatterns,
        songSpeed: this.wasm._klys_get_song_speed(),
        songSpeed2: this.wasm._klys_get_song_speed2(),
        songRate: this.wasm._klys_get_song_rate(),
        loopPoint: this.wasm._klys_get_loop_point(),
        masterVolume: this.wasm._klys_get_master_volume(),
        flags: this.wasm._klys_get_flags(),
      };
      this.port.postMessage(meta);

      // Extract pattern data from WASM and send to main thread
      this.extractAndSendData(numPatterns, channels, numInstruments);
    } else {
      this.port.postMessage({ type: 'error', message: 'Failed to load klystrack song' });
    }
  }

  freeSong() {
    if (this.wasm && this.songLoaded) {
      this.wasm._klys_free_song();
      this.songLoaded = false;
      this.playing = false;
    }
  }

  extractAndSendData(numPatterns, numChannels, numInstruments) {
    const w = this.wasm;
    const MAX_STEPS = 256;
    const STEP_BYTES = 6;
    const patBufSize = MAX_STEPS * STEP_BYTES;
    const patPtr = w._malloc(patBufSize);

    // Extract patterns
    const patterns = [];
    for (let i = 0; i < numPatterns; i++) {
      const patLen = w._klys_get_pattern_length(i);
      const n = w._klys_get_pattern_data(i, patPtr, MAX_STEPS);
      const raw = new Uint8Array(w.HEAPU8.buffer, patPtr, n * STEP_BYTES);
      const steps = [];
      for (let s = 0; s < n; s++) {
        const off = s * STEP_BYTES;
        steps.push({
          note: raw[off],
          instrument: raw[off + 1],
          ctrl: raw[off + 2],
          volume: raw[off + 3],
          command: raw[off + 4] | (raw[off + 5] << 8),
        });
      }
      patterns.push({ numSteps: patLen, steps });
    }
    w._free(patPtr);

    // Extract sequences (per channel)
    const MAX_SEQ = 512;
    const SEQ_BYTES = 5;
    const seqBufSize = MAX_SEQ * SEQ_BYTES;
    const seqPtr = w._malloc(seqBufSize);
    const sequences = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const n = w._klys_get_sequence_data(ch, seqPtr, MAX_SEQ);
      const raw = new Uint8Array(w.HEAPU8.buffer, seqPtr, n * SEQ_BYTES);
      const entries = [];
      for (let s = 0; s < n; s++) {
        const off = s * SEQ_BYTES;
        entries.push({
          position: raw[off] | (raw[off + 1] << 8),
          pattern: raw[off + 2] | (raw[off + 3] << 8),
          noteOffset: raw[off + 4] > 127 ? raw[off + 4] - 256 : raw[off + 4],
        });
      }
      sequences.push({ entries });
    }
    w._free(seqPtr);

    // Extract instruments
    const INST_BUF = 256;
    const instPtr = w._malloc(INST_BUF);
    const instruments = [];
    for (let i = 0; i < numInstruments; i++) {
      const n = w._klys_get_instrument_data(i, instPtr, INST_BUF);
      if (n < 32) { instruments.push(null); continue; }
      const raw = new Uint8Array(w.HEAPU8.buffer, instPtr, n);
      let p = 0;
      const adsr = { a: raw[p++], d: raw[p++], s: raw[p++], r: raw[p++] };
      const flags = raw[p] | (raw[p + 1] << 8); p += 2;
      const cydflags = raw[p++];
      const baseNote = raw[p++];
      const finetune = raw[p++];
      const slideSpeed = raw[p++];
      const pw = raw[p] | (raw[p + 1] << 8); p += 2;
      const volume = raw[p++];
      const progPeriod = raw[p++];
      const vibratoSpeed = raw[p++];
      const vibratoDepth = raw[p++];
      const pwmSpeed = raw[p++];
      const pwmDepth = raw[p++];
      const cutoff = raw[p] | (raw[p + 1] << 8); p += 2;
      const resonance = raw[p++];
      const flttype = raw[p++];
      const fxBus = raw[p++];
      const buzzOffset = raw[p] | (raw[p + 1] << 8); p += 2;
      const ringMod = raw[p++];
      const syncSource = raw[p++];
      const wavetableEntry = raw[p++];
      const fmModulation = raw[p++];
      const fmFeedback = raw[p++];
      const fmHarmonic = raw[p++];
      const fmAdsr = { a: raw[p++], d: raw[p++], s: raw[p++], r: raw[p++] };

      // Program (32 steps, 2 bytes each)
      const program = [];
      for (let pi = 0; pi < 32 && p + 1 < n; pi++) {
        program.push(raw[p] | (raw[p + 1] << 8));
        p += 2;
      }

      // Name (32 bytes, null-terminated)
      let name = '';
      if (p + 32 <= n) {
        const nameBytes = raw.slice(p, p + 32);
        const nullIdx = nameBytes.indexOf(0);
        name = new TextDecoder().decode(nameBytes.slice(0, nullIdx >= 0 ? nullIdx : 32));
      }

      instruments.push({
        name, adsr, flags, cydflags, baseNote, finetune, slideSpeed,
        pw, volume, progPeriod, vibratoSpeed, vibratoDepth, pwmSpeed, pwmDepth,
        cutoff, resonance, flttype, fxBus, buzzOffset, ringMod, syncSource,
        wavetableEntry, fmModulation, fmFeedback, fmHarmonic, fmAdsr, program,
      });
    }
    w._free(instPtr);

    this.port.postMessage({
      type: 'songData',
      patterns,
      sequences,
      instruments,
    });
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const numSamples = outputL.length;

    outputL.fill(0);
    outputR.fill(0);

    if (this.playing && this.songLoaded) {
      this.ensureDecodeBuffers(numSamples);

      const decoded = this.wasm._klys_decode(this.decodePtrL, this.decodePtrR, numSamples);
      if (decoded > 0) {
        const heapF32 = this.wasm.HEAPF32;
        const offL = this.decodePtrL >> 2;
        const offR = this.decodePtrR >> 2;
        for (let i = 0; i < decoded; i++) {
          outputL[i] = heapF32[offL + i];
          outputR[i] = heapF32[offR + i];
        }
      }
    }

    // Report position periodically
    this.reportCounter++;
    if (this.reportCounter >= this.reportInterval) {
      this.reportCounter = 0;
      if (this.songLoaded) {
        this.port.postMessage({
          type: 'position',
          songPosition: this.wasm._klys_get_song_position(),
          patternPosition: this.wasm._klys_get_pattern_position(),
          speed: this.wasm._klys_get_song_speed(),
        });
      }
    }

    return true;
  }
}

registerProcessor('klystrack-processor', KlystrackProcessor);
