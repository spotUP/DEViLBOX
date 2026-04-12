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

    // Channel levels
    this.levelsPtr = 0;
    this.levelsCapacity = 0;
    this.levelsCounter = 0;
    this.numChannels = 0;

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

      case 'setPatternStep': {
        if (!this.wasm) break;
        const { patIdx, stepIdx, note, instrument, ctrl, volume, cmdLo, cmdHi } = data;
        this.wasm._klys_set_pattern_step(patIdx, stepIdx, note, instrument, ctrl, volume, cmdLo, cmdHi);
        break;
      }

      case 'setSequenceEntry': {
        if (!this.wasm) break;
        const { chan, pos, position, pattern, noteOffset } = data;
        this.wasm._klys_set_sequence_entry(chan, pos, position, pattern, noteOffset);
        break;
      }

      case 'setInstrumentParam': {
        if (!this.wasm) break;
        const { idx, paramId, value } = data;
        this.wasm._klys_set_instrument_param(idx, paramId, value);
        break;
      }

      case 'setInstrumentName': {
        if (!this.wasm || typeof this.wasm._klys_set_instrument_name !== 'function') break;
        const { idx, name } = data;
        const bytes = new TextEncoder().encode((name || '').slice(0, 32));
        const ptr = this.wasm._malloc(bytes.length + 1);
        this.wasm.HEAPU8.set(bytes, ptr);
        this.wasm.HEAPU8[ptr + bytes.length] = 0;
        this.wasm._klys_set_instrument_name(idx, ptr);
        this.wasm._free(ptr);
        break;
      }

      case 'setInstrumentProgramStep': {
        if (!this.wasm) break;
        const { idx: progIdx, step, value: progVal } = data;
        this.wasm._klys_set_instrument_program_step(progIdx, step, progVal);
        break;
      }

      case 'setChannelGain':
        if (this.wasm && typeof this.wasm._klys_set_channel_gain === 'function') {
          this.wasm._klys_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'setMuteMask':
        this.muteMask = data.mask;
        if (this.wasm && typeof this.wasm._klys_set_channel_gain === 'function') {
          for (let ch = 0; ch < 32; ch++) {
            const active = (data.mask & (1 << ch)) !== 0;
            this.wasm._klys_set_channel_gain(ch, active ? 1.0 : 0.0);
          }
        }
        break;

      case 'serializeSong': {
        if (!this.wasm) {
          this.port.postMessage({ type: 'serializeSongResult', error: 'WASM not loaded' });
          break;
        }
        try {
          // First call to get required size
          const needed = this.wasm._klys_save_song(0, 0);
          if (needed <= 0) {
            this.port.postMessage({ type: 'serializeSongResult', error: 'No song loaded' });
            break;
          }
          // Allocate buffer and serialize
          const ptr = this.wasm._malloc(needed);
          const written = this.wasm._klys_save_song(ptr, needed);
          const bytes = new Uint8Array(written);
          bytes.set(new Uint8Array(this.wasm.HEAPU8.buffer, ptr, written));
          this.wasm._free(ptr);
          this.port.postMessage({ type: 'serializeSongResult', data: bytes.buffer }, [bytes.buffer]);
        } catch (e) {
          this.port.postMessage({ type: 'serializeSongResult', error: e.message });
        }
        break;
      }
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
    console.log('[Klystrack Worklet] loadSong: buffer size:', data.length);
    const ptr = this.wasm._malloc(data.length);
    const heap = new Uint8Array(this.wasm.HEAPU8.buffer, ptr, data.length);
    heap.set(data);

    const ok = this.wasm._klys_load_song(ptr, data.length);
    console.log('[Klystrack Worklet] _klys_load_song returned:', ok);
    this.wasm._free(ptr);

    if (ok) {
      this.songLoaded = true;
      this.playing = true;

      const channels = this.wasm._klys_get_num_channels();
      const numPatterns = this.wasm._klys_get_num_patterns();
      const numInstruments = this.wasm._klys_get_num_instruments();
      this.numChannels = channels;
      // Allocate levels buffer if needed
      if (channels > this.levelsCapacity) {
        if (this.levelsPtr) this.wasm._free(this.levelsPtr);
        this.levelsPtr = this.wasm._malloc(channels * 4);
        this.levelsCapacity = channels;
      }
      console.log('[Klystrack Worklet] Song loaded - channels:', channels, 'patterns:', numPatterns, 'instruments:', numInstruments);

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
    try {
    console.log('[Klystrack Worklet] extractAndSendData:', { numPatterns, numChannels, numInstruments });
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
      console.log(`[Klystrack Worklet] Pattern ${i}: length=${patLen}, steps=${n}`);
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

    // Extract instruments — MAXIMIZED layout: every MusInstrument field
    const INST_BUF = 512;
    const instPtr = w._malloc(INST_BUF);
    const instruments = [];
    for (let i = 0; i < numInstruments; i++) {
      const n = w._klys_get_instrument_data(i, instPtr, INST_BUF);
      if (n < 32) { instruments.push(null); continue; }
      const raw = new Uint8Array(w.HEAPU8.buffer, instPtr, n);
      let p = 0;
      const u8 = () => raw[p++];
      const s8 = () => { const v = raw[p++]; return v > 127 ? v - 256 : v; };
      const u16 = () => { const v = raw[p] | (raw[p+1] << 8); p += 2; return v; };
      const s16 = () => { const v = raw[p] | (raw[p+1] << 8); p += 2; return v > 32767 ? v - 65536 : v; };
      const u32 = () => { const v = (raw[p] | (raw[p+1] << 8) | (raw[p+2] << 16) | (raw[p+3] << 24)) >>> 0; p += 4; return v; };

      const adsr = { a: u8(), d: u8(), s: u8(), r: u8() };
      const flags = u32();
      const cydflags = u32();
      const baseNote = u8();
      const finetune = s8();
      const slideSpeed = u8();
      const pw = u16();
      const volume = u8();
      const progPeriod = u8();
      const vibratoSpeed = u8();
      const vibratoDepth = u8();
      const pwmSpeed = u8();
      const pwmDepth = u8();
      const cutoff = u16();
      const resonance = u8();
      const flttype = u8();
      const ymEnvShape = u8();
      const buzzOffset = s16();
      const fxBus = u8();
      const vibShape = u8();
      const vibDelay = u8();
      const pwmShape = u8();
      const lfsrType = u8();
      const wavetableEntry = u8();
      const ringMod = u8();
      const syncSource = u8();
      const fmFlags = u32();
      const fmModulation = u8();
      const fmFeedback = u8();
      const fmWave = u8();
      const fmHarmonic = u8();
      const fmAdsr = { a: u8(), d: u8(), s: u8(), r: u8() };
      const fmAttackStart = u8();

      // Program (32 steps, 2 bytes each)
      const program = [];
      for (let pi = 0; pi < 32 && p + 1 < n; pi++) {
        program.push(u16());
      }

      // Name (33 bytes, null-terminated) — no TextDecoder in AudioWorklet
      let name = '';
      const nameMax = Math.min(p + 33, n);
      for (let ci = p; ci < nameMax; ci++) {
        if (raw[ci] === 0) break;
        name += String.fromCharCode(raw[ci]);
      }
      p = nameMax;

      instruments.push({
        name, adsr, flags, cydflags, baseNote, finetune, slideSpeed,
        pw, volume, progPeriod, vibratoSpeed, vibratoDepth, pwmSpeed, pwmDepth,
        cutoff, resonance, flttype, ymEnvShape, buzzOffset,
        fxBus, vibShape, vibDelay, pwmShape, lfsrType, wavetableEntry,
        ringMod, syncSource,
        fmFlags, fmModulation, fmFeedback, fmWave, fmHarmonic, fmAdsr, fmAttackStart,
        program,
      });
    }
    w._free(instPtr);

    console.log('[Klystrack Worklet] Sending songData:', {
      patterns: patterns.length,
      sequences: sequences.length,
      instruments: instruments.length,
    });
    this.port.postMessage({
      type: 'songData',
      patterns,
      sequences,
      instruments,
    });
    console.log('[Klystrack Worklet] songData message posted');
    } catch (err) {
      console.error('[Klystrack Worklet] extractAndSendData failed:', err);
      this.port.postMessage({ type: 'error', message: 'extractAndSendData: ' + (err.message || String(err)) });
    }
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

    // Post per-channel levels every 8 process() calls
    if (++this.levelsCounter >= 8 && this.levelsPtr && this.numChannels > 0 && typeof this.wasm._klys_get_channel_levels === 'function') {
      this.levelsCounter = 0;
      this.wasm._klys_get_channel_levels(this.levelsPtr, this.numChannels);
      const heapF32 = this.wasm.HEAPF32;
      if (heapF32) {
        const off = this.levelsPtr >> 2;
        const levels = new Float32Array(this.numChannels);
        for (let i = 0; i < this.numChannels; i++) {
          levels[i] = heapF32[off + i];
        }
        this.port.postMessage({ type: 'chLevels', levels });
      }
    }

    return true;
  }
}

registerProcessor('klystrack-processor', KlystrackProcessor);
