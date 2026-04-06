/**
 * FuturePlayer.worklet.js - AudioWorklet processor for Future Player WASM replayer
 *
 * Renders at 28150 Hz (PAL) via Paula emulation, resampled to AudioContext rate.
 * Ring-buffered: ~563 samples/tick at 50Hz → 128-sample AudioWorklet blocks.
 */

class FuturePlayerProcessor extends AudioWorkletProcessor {
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

    this.previewActive = false;
    this.muteMask = 0xFFFFFFFF;

    // Channel levels
    this.levelsPtr = 0;
    this.levelsCounter = 0;

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
      case 'setSubsong':
        if (this.wasm && this.tuneLoaded) {
          this.wasm._fp_wasm_set_subsong(data.subsong);
        }
        break;
      case 'setMuteMask':
        this.muteMask = data.mask;
        break;
      case 'dispose':
        if (this.tuneLoaded && this.wasm) {
          this.wasm._fp_wasm_stop();
          this.tuneLoaded = false;
        }
        this.playing = false;
        this.previewActive = false;
        this.initialized = false;
        break;
      case 'noteOn':
        this.handleNoteOn(data.instrPtr, data.note, data.velocity);
        break;
      case 'noteOff':
        this.handleNoteOff();
        break;
      case 'getInstrumentInfo':
        this.handleGetInstrumentInfo(data.instrPtr, data.requestId);
        break;

      // Pattern editing — shadow array access
      case 'get-pattern-data': {
        if (!this.wasm || !this.tuneLoaded) break;
        const { patIdx, rowsPerPattern, requestId } = data;
        const rpp = rowsPerPattern || 64;
        const startRow = patIdx * rpp;
        const rows = [];
        for (let r = 0; r < rpp; r++) {
          const channels = [];
          for (let ch = 0; ch < 4; ch++) {
            const voiceLen = this.wasm._fp_wasm_get_voice_length(ch);
            const absRow = startRow + r;
            if (absRow < voiceLen) {
              const packed = this.wasm._fp_wasm_get_cell(ch, absRow);
              channels.push({
                note:       (packed >>> 24) & 0xFF,
                instrument: (packed >>> 16) & 0xFF,
                effect:     (packed >>> 8)  & 0xFF,
                param:       packed         & 0xFF,
              });
            } else {
              channels.push({ note: 0, instrument: 0, effect: 0, param: 0 });
            }
          }
          rows.push(channels);
        }
        // Get total rows (max across all voices)
        let totalRows = 0;
        for (let ch = 0; ch < 4; ch++) {
          const vl = this.wasm._fp_wasm_get_voice_length(ch);
          if (vl > totalRows) totalRows = vl;
        }
        this.port.postMessage({
          type: 'pattern-data', requestId, patIdx,
          numRows: Math.min(rpp, Math.max(0, totalRows - startRow)),
          totalRows, rows,
        });
        break;
      }

      case 'set-pattern-cell': {
        if (!this.wasm || !this.tuneLoaded) break;
        const { voice, row, note, instrument, effect, param } = data;
        this.wasm._fp_wasm_set_cell(voice, row, note, instrument, effect, param);
        break;
      }

      case 'write-byte': {
        // Live edit a single byte in the loaded module buffer. Used by
        // FuturePlayerControls to push instrument parameter changes to the
        // running WASM. fp_wasm_write_byte returns -1 on out-of-range.
        if (!this.wasm || !this.tuneLoaded) break;
        this.wasm._fp_wasm_write_byte(data.addr | 0, data.value & 0xFF);
        break;
      }

      case 'write-bytes': {
        // Bulk variant — copies a Uint8Array via heap malloc/free.
        if (!this.wasm || !this.tuneLoaded || !data.bytes) break;
        const bytes = data.bytes instanceof Uint8Array ? data.bytes : new Uint8Array(data.bytes);
        const ptr = this.wasm._malloc(bytes.byteLength);
        this.wasm.HEAPU8.set(bytes, ptr);
        this.wasm._fp_wasm_write_bytes(data.addr | 0, ptr, bytes.byteLength);
        this.wasm._free(ptr);
        break;
      }

      case 'get-voice-lengths': {
        if (!this.wasm || !this.tuneLoaded) break;
        const lengths = [];
        for (let ch = 0; ch < 4; ch++) {
          lengths.push(this.wasm._fp_wasm_get_voice_length(ch));
        }
        this.port.postMessage({ type: 'voice-lengths', requestId: data.requestId, lengths });
        break;
      }

      case 'get-all-shadow-data': {
        if (!this.wasm || !this.tuneLoaded) {
          this.port.postMessage({ type: 'all-shadow-data', requestId: data.requestId, voices: [] });
          break;
        }
        const voices = [];
        for (let ch = 0; ch < 4; ch++) {
          const voiceLen = this.wasm._fp_wasm_get_voice_length(ch);
          const cells = [];
          for (let r = 0; r < voiceLen; r++) {
            const packed = this.wasm._fp_wasm_get_cell(ch, r);
            cells.push({
              note:       (packed >>> 24) & 0xFF,
              instrument: (packed >>> 16) & 0xFF,
              effect:     (packed >>> 8)  & 0xFF,
              param:       packed         & 0xFF,
            });
          }
          voices.push(cells);
        }
        this.port.postMessage({ type: 'all-shadow-data', requestId: data.requestId, voices });
        break;
      }
    }
  }

  async initWasm(wasmBinary, jsCode) {
    try {
      const factory = new Function(jsCode + '\nreturn createFuturePlayer;')();
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
      this.wasm._fp_wasm_stop();
      this.tuneLoaded = false;
    }

    // Upload module data to WASM heap
    const bytes = new Uint8Array(buffer);
    const ptr = this.wasm._malloc(bytes.length);
    this.wasm.HEAPU8.set(bytes, ptr);

    const result = this.wasm._fp_wasm_init(ptr, bytes.length);
    this.wasm._free(ptr);

    if (result === 0) {
      this.tuneLoaded = true;
      this.resetRingBuffer();
      this.resamplePos = 0.0;

      const sampleRate = this.wasm._fp_wasm_get_sample_rate();
      if (sampleRate > 0) this.srcRate = sampleRate;

      this.port.postMessage({
        type: 'loaded',
        numSubsongs: this.wasm._fp_wasm_get_num_subsongs(),
        sampleRate: sampleRate,
      });
    } else {
      this.port.postMessage({ type: 'error', message: 'fp_wasm_init failed: ' + result });
    }
  }

  resetRingBuffer() {
    this.ringWritePos = 0;
    this.ringReadPos = 0;
    this.ringAvailable = 0;
  }

  fillRingBuffer() {
    if (!this.wasm || !this.tuneLoaded || !this.initialized) return;
    // In preview mode, use fp_wasm_render_preview instead of fp_wasm_render
    if (this.previewActive && !this.playing) return this.fillRingBufferPreview();
    if (!this.playing) return;

    const space = this.ringSize - this.ringAvailable;
    if (space < this.decodeBufSize) return;

    const frames = Math.min(this.decodeBufSize, space);
    this.wasm._fp_wasm_render(this.decodeBufPtr, frames);

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

  handleNoteOn(instrPtr, note, velocity) {
    if (!this.wasm || !this.initialized || !this.tuneLoaded) return;
    this.wasm._fp_wasm_note_on(instrPtr, note, velocity);
    this.previewActive = true;
    this.resetRingBuffer();
    this.resamplePos = 0.0;
  }

  handleNoteOff() {
    if (!this.wasm || !this.initialized) return;
    this.wasm._fp_wasm_note_off();
    this.previewActive = false;
  }

  handleGetInstrumentInfo(instrPtr, requestId) {
    if (!this.wasm || !this.initialized || !this.tuneLoaded) {
      this.port.postMessage({ type: 'instrumentInfo', requestId, sampleSize: 0, isWavetable: false });
      return;
    }
    const packed = this.wasm._fp_wasm_get_instrument_info(instrPtr);
    const isWavetable = !!(packed & (1 << 30));
    const sampleSize = packed & 0x3FFFFFFF;
    this.port.postMessage({ type: 'instrumentInfo', requestId, sampleSize, isWavetable });
  }

  fillRingBufferPreview() {
    if (!this.wasm || !this.tuneLoaded) return;

    const space = this.ringSize - this.ringAvailable;
    if (space < this.decodeBufSize) return;

    const frames = Math.min(this.decodeBufSize, space);
    this.wasm._fp_wasm_render_preview(this.decodeBufPtr, frames);

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
    const blockSize = outL.length;

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

    // Post per-channel levels every 8 process() calls
    if (++this.levelsCounter >= 8 && this.levelsPtr && typeof this.wasm._fp_wasm_get_channel_levels === 'function') {
      this.levelsCounter = 0;
      this.wasm._fp_wasm_get_channel_levels(this.levelsPtr);
      const off = this.levelsPtr >> 2;
      this.port.postMessage({ type: 'chLevels', levels: [this.wasm.HEAPF32[off], this.wasm.HEAPF32[off+1], this.wasm.HEAPF32[off+2], this.wasm.HEAPF32[off+3]] });
    }

    return true;
  }
}

registerProcessor('futureplayer-processor', FuturePlayerProcessor);
