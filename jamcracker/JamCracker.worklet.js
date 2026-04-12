/**
 * JamCracker.worklet.js - AudioWorklet processor for JamCracker WASM replayer
 *
 * Renders at 28150 Hz (PAL) via Paula emulation, resampled to AudioContext rate.
 * Ring-buffered: ~563 samples/tick at 50Hz → 128-sample AudioWorklet blocks.
 */

class JamCrackerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.initialized = false;
    this.playing = false;
    this.tuneLoaded = false;

    // Ring buffer for bridging Paula rate (28150) to AudioContext rate
    this.ringSize = 16384;
    this.ringL = new Float32Array(this.ringSize);
    this.ringR = new Float32Array(this.ringSize);
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;

    // WASM decode buffer (stereo interleaved at 28150 Hz)
    this.decodeBufPtr = 0;
    this.decodeBufSize = 1024; // frames per decode call

    // Resampling state
    this.srcRate = 28150;
    this.dstRate = 48000;
    this.resamplePos = 0.0;

    // Position reporting
    this.reportCounter = 0;
    this.reportInterval = 8;
    this.previewActive = false;

    // Channel levels
    this.levelsPtr = 0;
    this.levelsCounter = 0;
    this.muteMask = 0xFFFFFFFF;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initWasm(data.wasmBinary, data.jsCode);
        break;
      case 'loadTune':
        this.loadTune(data.buffer);
        break;
      case 'play':
        this.playing = true;
        break;
      case 'stop':
        this.playing = false;
        this.resetRingBuffer();
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'setMuteMask':
        this.muteMask = data.mask;
        break;
      case 'dispose':
        if (this.tuneLoaded && this.wasm) {
          this.wasm._jc_stop();
          this.tuneLoaded = false;
        }
        this.playing = false;
        this.initialized = false;
        break;
      case 'noteOn':
        this.handleNoteOn(data.instrument, data.note, data.velocity);
        break;
      case 'noteOff':
        this.handleNoteOff();
        break;

      // Pattern data access
      case 'get-pattern-data': {
        const { patIdx, requestId } = data;
        if (!this.wasm || !this.tuneLoaded) {
          this.port.postMessage({ type: 'pattern-data', requestId, patIdx, numRows: 0, rows: [] });
          break;
        }
        const numRows = this.wasm._jc_get_pattern_rows(patIdx);
        const rows = [];
        for (let r = 0; r < numRows; r++) {
          const channels = [];
          for (let ch = 0; ch < 4; ch++) {
            channels.push({
              period:   this.wasm._jc_get_pattern_cell(patIdx, r, ch, 0),
              instr:    this.wasm._jc_get_pattern_cell(patIdx, r, ch, 1),
              speed:    this.wasm._jc_get_pattern_cell(patIdx, r, ch, 2),
              arpeggio: this.wasm._jc_get_pattern_cell(patIdx, r, ch, 3),
              vibrato:  this.wasm._jc_get_pattern_cell(patIdx, r, ch, 4),
              phase:    this.wasm._jc_get_pattern_cell(patIdx, r, ch, 5),
              volume:   this.wasm._jc_get_pattern_cell(patIdx, r, ch, 6),
              porta:    this.wasm._jc_get_pattern_cell(patIdx, r, ch, 7),
            });
          }
          rows.push(channels);
        }
        this.port.postMessage({ type: 'pattern-data', requestId, patIdx, numRows, rows });
        break;
      }

      case 'set-pattern-cell': {
        if (!this.wasm || !this.tuneLoaded) break;
        const { patIdx: pi, row: rw, channel: ch, field: fld, value: val } = data;
        this.wasm._jc_set_pattern_cell(pi, rw, ch, fld, val);
        break;
      }

      case 'get-song-structure': {
        if (!this.wasm || !this.tuneLoaded) break;
        const songLen = this.wasm._jc_get_song_length();
        const numPats = this.wasm._jc_get_num_patterns();
        const numInst = this.wasm._jc_get_num_instruments();
        const entries = [];
        for (let i = 0; i < songLen; i++) {
          entries.push(this.wasm._jc_get_song_entry(i));
        }
        this.port.postMessage({ type: 'song-structure', songLen, numPats, numInst, entries });
        break;
      }

      case 'setChannelGain':
        if (this.wasm && typeof this.wasm._jc_set_channel_gain === 'function') {
          this.wasm._jc_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'save': {
        if (!this.wasm || !this.tuneLoaded) break;
        const saveSize = this.wasm._jc_save();
        if (saveSize > 0) {
          const ptr = this.wasm._jc_save_ptr();
          const data = new Uint8Array(saveSize);
          data.set(new Uint8Array(this.wasm.HEAPU8.buffer, ptr, saveSize));
          this.wasm._jc_save_free();
          this.port.postMessage({ type: 'save-data', data: data.buffer }, [data.buffer]);
        }
        break;
      }
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      // Evaluate the Emscripten glue JS to get the factory function
      const factory = new Function(jsCode + '\nreturn createJamCracker;')();
      this.wasm = await factory({ wasmBinary });

      // Allocate decode buffer (stereo interleaved float32)
      this.decodeBufPtr = this.wasm._malloc(this.decodeBufSize * 2 * 4);

      // Allocate 4-float buffer for channel levels
      this.levelsPtr = this.wasm._malloc(4 * 4);

      this.initialized = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'WASM init failed: ' + err.message });
    }
  }

  loadTune(buffer) {
    if (!this.wasm || !this.initialized) return;

    // Stop previous tune
    if (this.tuneLoaded) {
      this.wasm._jc_stop();
      this.tuneLoaded = false;
    }

    // Upload module data to WASM heap
    const bytes = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(bytes.length);
    this.wasm.HEAPU8.set(bytes, ptr);

    const result = this.wasm._jc_init(ptr, bytes.length);
    this.wasm._free(ptr);

    if (result === 0) {
      this.tuneLoaded = true;
      this.resetRingBuffer();
      this.resamplePos = 0.0;
      this.port.postMessage({
        type: 'loaded',
        songLength: this.wasm._jc_get_song_length(),
        numPatterns: this.wasm._jc_get_num_patterns(),
        numInstruments: this.wasm._jc_get_num_instruments(),
        sampleRate: this.wasm._jc_get_sample_rate(),
      });
    } else {
      this.port.postMessage({ type: 'error', message: 'jc_init failed: ' + result });
    }
  }

  resetRingBuffer() {
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;
  }

  // Decode more Paula audio into the ring buffer
  fillRingBuffer() {
    if (!this.wasm || !this.tuneLoaded || !this.initialized) return;
    // In preview mode, use jc_render_preview instead of jc_render
    if (this.previewActive && !this.playing) return this.fillRingBufferPreview();

    const space = this.ringSize - this.ringAvailable;
    if (space < this.decodeBufSize) return;

    const frames = Math.min(this.decodeBufSize, space);
    this.wasm._jc_render(this.decodeBufPtr, frames);

    // Read stereo interleaved float32 from WASM heap
    const floatOffset = this.decodeBufPtr >> 2;
    const heap = this.wasm.HEAPF32;

    for (let i = 0; i < frames; i++) {
      const wp = (this.ringWritePos + i) & (this.ringSize - 1);
      this.ringL[wp] = heap[floatOffset + i * 2];
      this.ringR[wp] = heap[floatOffset + i * 2 + 1];
    }
    this.ringWritePos = (this.ringWritePos + frames) & (this.ringSize - 1);
    this.ringAvailable += frames;
  }

  // ---- Per-note instrument preview ----

  handleNoteOn(instrIndex, noteIndex, velocity) {
    if (!this.wasm || !this.initialized || !this.tuneLoaded) return;
    this.wasm._jc_note_on(instrIndex, noteIndex, velocity);
    this.previewActive = true;
    this.resetRingBuffer();
    this.resamplePos = 0.0;
  }

  handleNoteOff() {
    if (!this.wasm || !this.initialized) return;
    this.wasm._jc_note_off();
    this.previewActive = false;
  }

  fillRingBufferPreview() {
    if (!this.wasm || !this.tuneLoaded) return;

    const space = this.ringSize - this.ringAvailable;
    if (space < this.decodeBufSize) return;

    const frames = Math.min(this.decodeBufSize, space);
    this.wasm._jc_render_preview(this.decodeBufPtr, frames);

    const floatOffset = this.decodeBufPtr >> 2;
    const heap = this.wasm.HEAPF32;

    for (let i = 0; i < frames; i++) {
      const wp = (this.ringWritePos + i) & (this.ringSize - 1);
      this.ringL[wp] = heap[floatOffset + i * 2];
      this.ringR[wp] = heap[floatOffset + i * 2 + 1];
    }
    this.ringWritePos = (this.ringWritePos + frames) & (this.ringSize - 1);
    this.ringAvailable += frames;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const blockSize = outL.length; // typically 128

    if ((!this.playing && !this.previewActive) || !this.tuneLoaded || !this.initialized) {
      outL.fill(0);
      outR.fill(0);
      return true;
    }

    // Ensure ring buffer has enough source samples
    const ratio = this.srcRate / this.dstRate;
    const needed = Math.ceil(blockSize * ratio) + 4;
    while (this.ringAvailable < needed) {
      this.fillRingBuffer();
      if (this.ringAvailable < needed) break;
    }

    // Linear interpolation resample from srcRate to dstRate
    for (let i = 0; i < blockSize; i++) {
      const srcIdx = Math.floor(this.resamplePos);
      const frac = this.resamplePos - srcIdx;

      if (this.ringAvailable < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }

      const rp0 = (this.ringReadPos + srcIdx) & (this.ringSize - 1);
      const rp1 = (rp0 + 1) & (this.ringSize - 1);

      outL[i] = this.ringL[rp0] + frac * (this.ringL[rp1] - this.ringL[rp0]);
      outR[i] = this.ringR[rp0] + frac * (this.ringR[rp1] - this.ringR[rp0]);

      this.resamplePos += ratio;
    }

    // Advance ring read pointer
    const consumed = Math.floor(this.resamplePos);
    this.ringReadPos = (this.ringReadPos + consumed) & (this.ringSize - 1);
    this.ringAvailable -= consumed;
    if (this.ringAvailable < 0) this.ringAvailable = 0;
    this.resamplePos -= consumed;

    // Position reporting
    if (++this.reportCounter >= this.reportInterval) {
      this.reportCounter = 0;
      if (this.wasm && this.tuneLoaded) {
        this.port.postMessage({
          type: 'position',
          songPos: this.wasm._jc_get_song_pos(),
          row: this.wasm._jc_get_row(),
          speed: this.wasm._jc_get_speed(),
          tick: this.wasm._jc_get_tick(),
        });
      }
    }

    // Post per-channel levels every 8 process() calls
    if (++this.levelsCounter >= 8 && this.levelsPtr && typeof this.wasm._jc_get_channel_levels === 'function') {
      this.levelsCounter = 0;
      this.wasm._jc_get_channel_levels(this.levelsPtr);
      const off = this.levelsPtr >> 2;
      this.port.postMessage({ type: 'chLevels', levels: [this.wasm.HEAPF32[off], this.wasm.HEAPF32[off+1], this.wasm.HEAPF32[off+2], this.wasm.HEAPF32[off+3]] });
    }

    return true;
  }
}

registerProcessor('jamcracker-processor', JamCrackerProcessor);
