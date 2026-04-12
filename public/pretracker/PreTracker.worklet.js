/**
 * PreTracker.worklet.js - AudioWorklet processor for PreTracker WASM synth
 *
 * Uses emoon's C port of the Raspberry Casket replayer.
 * Supports metadata queries, track cell access, and live playback state.
 */

class PreTrackerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.interleavedBuf = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.levelsPtr = 0;
    this.waveInfoPtr = 0;
    this.instInfoPtr = 0;
    this.processCount = 0;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    if (data.type !== 'init' && !this.module && this.initializing) {
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadModule':
        this.loadModuleData(data.moduleData);
        break;

      case 'stop':
        if (this.module && typeof this.module._player_stop === 'function') {
          this.module._player_stop();
          this.port.postMessage({ type: 'stopped' });
        }
        break;

      case 'setSubsong':
        if (this.module && typeof this.module._player_set_subsong === 'function') {
          this.module._player_set_subsong(data.subsong);
        }
        break;

      case 'setChannelGain':
        if (this.module && typeof this.module._player_set_channel_gain === 'function') {
          this.module._player_set_channel_gain(data.channel, data.gain);
        }
        break;

      case 'setSoloChannel':
        if (this.module && typeof this.module._player_set_solo_channel === 'function') {
          this.module._player_set_solo_channel(data.channel);
        }
        break;

      case 'setStereoMix':
        if (this.module && typeof this.module._player_set_stereo_mix === 'function') {
          this.module._player_set_stereo_mix(data.mix);
        }
        break;

      case 'setInterpMode':
        if (this.module && typeof this.module._player_set_interp_mode === 'function') {
          this.module._player_set_interp_mode(data.mode);
        }
        break;

      case 'setWaveInfo':
        this.writeWaveInfo(data.waveIdx, data.fields);
        break;

      case 'setInstInfo':
        this.writeInstInfo(data.instIdx, data.fields);
        break;

      case 'setInstPatternStep':
        if (this.module && typeof this.module._player_set_inst_pattern_step === 'function') {
          this.module._player_set_inst_pattern_step(data.instIdx, data.step, data.pitchByte, data.cmdByte, data.cmdData);
        }
        break;

      case 'setTrackCell':
        if (this.module && typeof this.module._player_set_track_cell === 'function') {
          this.module._player_set_track_cell(data.track, data.row, data.pitchCtrl, data.instEffect, data.effectData);
        }
        break;

      case 'setPositionEntry':
        if (this.module && typeof this.module._player_set_position_entry === 'function') {
          this.module._player_set_position_entry(data.position, data.channel, data.trackNum, data.pitchShift);
        }
        break;

      case 'getMetadata':
        this.sendMetadata();
        break;

      case 'getTrackCell':
        this.sendTrackCell(data.track, data.row);
        break;

      case 'getPositionEntry':
        this.sendPositionEntry(data.position, data.channel);
        break;

      case 'getWaveInfo':
        this.sendWaveInfo(data.waveIdx);
        break;

      case 'getInstInfo':
        this.sendInstInfo(data.instIdx);
        break;

      case 'getAllWaveInfo':
        this.sendAllWaveInfo();
        break;

      case 'getAllInstInfo':
        this.sendAllInstInfo();
        break;

      case 'getInstPattern':
        this.sendInstPattern(data.instIdx);
        break;

      case 'getAllInstPatterns':
        this.sendAllInstPatterns();
        break;

      case 'getRawFile':
        this.sendRawFile();
        break;

      case 'getAllRawInstInfo':
        this.sendAllRawInstInfo();
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  loadModuleData(moduleData) {
    if (!this.module || typeof this.module._player_init !== 'function') return;
    try {
      const uint8Data = new Uint8Array(moduleData);
      const malloc = this.module._malloc || this.module.malloc;
      if (!malloc) {
        this.port.postMessage({ type: 'error', message: 'malloc not available' });
        return;
      }

      const wasmPtr = malloc(uint8Data.length);
      if (!wasmPtr) {
        this.port.postMessage({ type: 'error', message: 'malloc failed for module data' });
        return;
      }

      const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
      if (!heapU8) {
        const free = this.module._free || this.module.free;
        if (free) free(wasmPtr);
        this.port.postMessage({ type: 'error', message: 'HEAPU8 not available' });
        return;
      }

      heapU8.set(uint8Data, wasmPtr);
      const result = this.module._player_init(wasmPtr, uint8Data.length);
      const free = this.module._free || this.module.free;
      if (free) free(wasmPtr);

      if (result !== 0) {
        this.port.postMessage({ type: 'error', message: `player_init returned ${result}` });
        return;
      }

      this.port.postMessage({ type: 'moduleLoaded' });
      this.sendMetadata();
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  readCString(ptr) {
    if (!ptr || !this.module) return '';
    if (typeof this.module.UTF8ToString === 'function') {
      return this.module.UTF8ToString(ptr);
    }
    const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
    if (!heapU8) return '';
    let s = '';
    for (let i = 0; i < 256; i++) {
      const ch = heapU8[ptr + i];
      if (ch === 0) break;
      s += String.fromCharCode(ch);
    }
    return s;
  }

  sendMetadata() {
    if (!this.module) return;
    const m = this.module;
    const title = this.readCString(m._player_get_title());
    const author = this.readCString(m._player_get_author());
    const numWaves = m._player_get_num_waves();
    const numInstruments = m._player_get_num_instruments();
    const numPositions = m._player_get_num_positions();
    const numSteps = m._player_get_num_steps();
    const subsongCount = m._player_get_subsong_count();

    const waveNames = [];
    for (let i = 0; i < numWaves; i++) {
      waveNames.push(this.readCString(m._player_get_wave_name(i)));
    }

    const instrumentNames = [];
    for (let i = 0; i < numInstruments; i++) {
      instrumentNames.push(this.readCString(m._player_get_instrument_name(i)));
    }

    this.port.postMessage({
      type: 'metadata',
      title, author, numWaves, numInstruments, numPositions, numSteps, subsongCount,
      waveNames, instrumentNames
    });
  }

  sendTrackCell(track, row) {
    if (!this.module) return;
    const ok = this.module._player_get_track_cell(track, row);
    if (!ok) {
      this.port.postMessage({ type: 'trackCell', track, row, valid: false });
      return;
    }
    this.port.postMessage({
      type: 'trackCell', track, row, valid: true,
      note: this.module._player_cell_note(),
      instrument: this.module._player_cell_instrument(),
      hasArpeggio: this.module._player_cell_has_arpeggio() !== 0,
      effectCmd: this.module._player_cell_effect_cmd(),
      effectData: this.module._player_cell_effect_data()
    });
  }

  sendPositionEntry(position, channel) {
    if (!this.module) return;
    const ok = this.module._player_get_position_entry(position, channel);
    if (!ok) {
      this.port.postMessage({ type: 'positionEntry', position, channel, valid: false });
      return;
    }
    this.port.postMessage({
      type: 'positionEntry', position, channel, valid: true,
      trackNum: this.module._player_pos_track_num(),
      pitchShift: this.module._player_pos_pitch_shift()
    });
  }

  writeWaveInfo(waveIdx, fields) {
    if (!this.module || !this.waveInfoPtr || typeof this.module._player_set_wave_info !== 'function') return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    const off = this.waveInfoPtr >> 2;
    for (let i = 0; i < 39 && i < fields.length; i++) heapF32[off + i] = fields[i];
    this.module._player_set_wave_info(waveIdx, this.waveInfoPtr);
  }

  writeInstInfo(instIdx, fields) {
    if (!this.module || !this.instInfoPtr || typeof this.module._player_set_inst_info !== 'function') return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    const off = this.instInfoPtr >> 2;
    for (let i = 0; i < 8 && i < fields.length; i++) heapF32[off + i] = fields[i];
    this.module._player_set_inst_info(instIdx, this.instInfoPtr);
  }

  sendWaveInfo(waveIdx) {
    if (!this.module || !this.waveInfoPtr) return;
    const ok = this.module._player_get_wave_info(waveIdx, this.waveInfoPtr);
    if (!ok) {
      this.port.postMessage({ type: 'waveInfo', waveIdx, valid: false });
      return;
    }
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    const off = this.waveInfoPtr >> 2;
    const fields = new Float32Array(39);
    for (let i = 0; i < 39; i++) fields[i] = heapF32[off + i];
    this.port.postMessage({ type: 'waveInfo', waveIdx, valid: true, fields: Array.from(fields) });
  }

  sendAllWaveInfo() {
    if (!this.module || !this.waveInfoPtr) return;
    const numWaves = this.module._player_get_num_waves();
    const waves = [];
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    const off = this.waveInfoPtr >> 2;
    for (let w = 0; w < numWaves; w++) {
      const ok = this.module._player_get_wave_info(w, this.waveInfoPtr);
      if (!ok) { waves.push(null); continue; }
      const fields = new Float32Array(39);
      for (let i = 0; i < 39; i++) fields[i] = heapF32[off + i];
      waves.push(Array.from(fields));
    }
    this.port.postMessage({ type: 'allWaveInfo', waves });
  }

  sendInstInfo(instIdx) {
    if (!this.module || !this.instInfoPtr) return;
    const ok = this.module._player_get_inst_info(instIdx, this.instInfoPtr);
    if (!ok) {
      this.port.postMessage({ type: 'instInfo', instIdx, valid: false });
      return;
    }
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    const off = this.instInfoPtr >> 2;
    const fields = new Float32Array(8);
    for (let i = 0; i < 8; i++) fields[i] = heapF32[off + i];
    this.port.postMessage({ type: 'instInfo', instIdx, valid: true, fields: Array.from(fields) });
  }

  sendAllInstInfo() {
    if (!this.module || !this.instInfoPtr) return;
    const numInst = this.module._player_get_num_instruments();
    const instruments = [];
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    const off = this.instInfoPtr >> 2;
    for (let i = 0; i < numInst; i++) {
      const ok = this.module._player_get_inst_info(i, this.instInfoPtr);
      if (!ok) { instruments.push(null); continue; }
      const fields = new Float32Array(8);
      for (let j = 0; j < 8; j++) fields[j] = heapF32[off + j];
      instruments.push(Array.from(fields));
    }
    this.port.postMessage({ type: 'allInstInfo', instruments });
  }

  sendAllRawInstInfo() {
    if (!this.module || typeof this.module._player_get_raw_inst_info !== 'function') return;
    const numInst = this.module._player_get_num_instruments();
    const malloc = this.module._malloc;
    const free = this.module._free;
    if (!malloc || !free) return;
    const buf = malloc(8);
    const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
    if (!heapU8) { free(buf); return; }
    const instruments = [];
    for (let i = 0; i < numInst; i++) {
      const ok = this.module._player_get_raw_inst_info(i, buf);
      if (!ok) { instruments.push(null); continue; }
      instruments.push(Array.from(heapU8.subarray(buf, buf + 8)));
    }
    free(buf);
    this.port.postMessage({ type: 'allRawInstInfo', instruments });
  }

  sendInstPattern(instIdx) {
    if (!this.module) return;
    const steps = this.module._player_get_inst_pattern_steps(instIdx);
    if (steps <= 0) {
      this.port.postMessage({ type: 'instPattern', instIdx, valid: false });
      return;
    }
    const malloc = this.module._malloc;
    const free = this.module._free;
    if (!malloc || !free) return;
    const buf = malloc(3 * 4); // 3 ints
    const heap32 = this.module.HEAP32 || (this.module.wasmMemory && new Int32Array(this.module.wasmMemory.buffer));
    if (!heap32) { free(buf); return; }
    const entries = [];
    for (let s = 0; s < steps; s++) {
      const ok = this.module._player_get_inst_pattern_step(instIdx, s, buf);
      if (!ok) { entries.push([0, 0, 0]); continue; }
      const off = buf >> 2;
      entries.push([heap32[off], heap32[off + 1], heap32[off + 2]]);
    }
    free(buf);
    this.port.postMessage({ type: 'instPattern', instIdx, valid: true, steps, entries });
  }

  sendAllInstPatterns() {
    if (!this.module) return;
    const numInst = this.module._player_get_num_instruments();
    const malloc = this.module._malloc;
    const free = this.module._free;
    if (!malloc || !free) return;
    const buf = malloc(3 * 4);
    const heap32 = this.module.HEAP32 || (this.module.wasmMemory && new Int32Array(this.module.wasmMemory.buffer));
    if (!heap32) { free(buf); return; }
    const patterns = [];
    for (let i = 0; i < numInst; i++) {
      const steps = this.module._player_get_inst_pattern_steps(i);
      if (steps <= 0) { patterns.push(null); continue; }
      const entries = [];
      for (let s = 0; s < steps; s++) {
        const ok = this.module._player_get_inst_pattern_step(i, s, buf);
        if (!ok) { entries.push([0, 0, 0]); continue; }
        const off = buf >> 2;
        entries.push([heap32[off], heap32[off + 1], heap32[off + 2]]);
      }
      patterns.push({ steps, entries });
    }
    free(buf);
    this.port.postMessage({ type: 'allInstPatterns', patterns });
  }

  sendRawFile() {
    if (!this.module) return;
    const size = this.module._player_get_raw_file_size();
    if (size <= 0) {
      this.port.postMessage({ type: 'rawFile', valid: false });
      return;
    }
    const ptr = this.module._player_get_raw_file_data();
    if (!ptr) {
      this.port.postMessage({ type: 'rawFile', valid: false });
      return;
    }
    const heapU8 = this.module.HEAPU8 || (this.module.wasmMemory && new Uint8Array(this.module.wasmMemory.buffer));
    if (!heapU8) return;
    const data = new Uint8Array(size);
    data.set(heapU8.subarray(ptr, ptr + size));
    this.port.postMessage({ type: 'rawFile', valid: true, data: data.buffer }, [data.buffer]);
  }

  async initModule(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.Pretracker) {
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({ relList: { supports: () => false }, tagName: 'DIV', rel: '', addEventListener: () => {}, removeEventListener: () => {} }),
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            getElementsByTagName: () => [], head: { appendChild: () => {} },
            addEventListener: () => {}, removeEventListener: () => {}
          };
        }
        if (typeof globalThis.window === 'undefined') {
          globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, customElements: { whenDefined: () => Promise.resolve() }, location: { href: '', pathname: '' } };
        }
        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
        }
        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [] }; } };
        }
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class { constructor(path) { this.href = path; } };
        }

        const wrappedCode = jsCode + '\nreturn createPretracker;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.Pretracker = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.Pretracker !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Pretracker factory not available' });
        return;
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) { capturedMemory = value; break; }
          }
        }
        return result;
      };

      const config = {};
      if (wasmBinary) config.wasmBinary = wasmBinary;

      try {
        this.module = await globalThis.Pretracker(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.interleavedPtr = malloc(this.bufferSize * 2 * 4);
        this.levelsPtr = malloc(4 * 4);
        this.waveInfoPtr = malloc(39 * 4);
        this.instInfoPtr = malloc(8 * 4);
      }

      if (typeof this.module._player_set_sample_rate === 'function') {
        this.module._player_set_sample_rate(sampleRate);
      }

      this.updateBufferViews();
      this.initialized = true;
      this.initializing = false;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.interleavedPtr) return;
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.interleavedBuf = new Float32Array(heapF32.buffer, this.interleavedPtr, this.bufferSize * 2);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    const free = this.module?._free || this.module?.free;
    if (free) {
      if (this.interleavedPtr) { free(this.interleavedPtr); this.interleavedPtr = 0; }
      if (this.levelsPtr) { free(this.levelsPtr); this.levelsPtr = 0; }
      if (this.waveInfoPtr) { free(this.waveInfoPtr); this.waveInfoPtr = 0; }
      if (this.instInfoPtr) { free(this.instInfoPtr); this.instInfoPtr = 0; }
    }
    this.interleavedBuf = null;
    this.module = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.module) return true;
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    const outputL = output[0];
    const outputR = output[1];
    if (!outputL || !outputR) return true;

    const numSamples = Math.min(outputL.length, this.bufferSize);

    if (typeof this.module._player_render === 'function') {
      this.updateBufferViews();
      if (this.interleavedBuf) {
        const rendered = this.module._player_render(this.interleavedPtr, numSamples);
        if (rendered > 0) {
          for (let i = 0; i < rendered; i++) {
            outputL[i] = this.interleavedBuf[i * 2];
            outputR[i] = this.interleavedBuf[i * 2 + 1];
          }
        }
      }
    }

    if (++this.processCount >= 8 && this.levelsPtr && typeof this.module._player_get_channel_levels === 'function') {
      this.processCount = 0;
      this.module._player_get_channel_levels(this.levelsPtr);
      const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
      if (heapF32) {
        const off = this.levelsPtr >> 2;
        const levels = [heapF32[off], heapF32[off+1], heapF32[off+2], heapF32[off+3]];
        const pos = typeof this.module._player_get_position === 'function' ? this.module._player_get_position() : 0;
        const row = typeof this.module._player_get_row === 'function' ? this.module._player_get_row() : 0;
        this.port.postMessage({ type: 'chLevels', levels, position: pos, row });
      }
    }

    return true;
  }
}

registerProcessor('pretracker-processor', PreTrackerProcessor);
