/**
 * SymphonieWasm.worklet.js — AudioWorklet for Symphonie Pro WASM replayer
 *
 * Pattern: Emscripten JS glue + WASM binary sent from main thread,
 * evaluated in worklet scope. Follows the PumaTracker/Hippel worklet pattern.
 */
'use strict';

class SymphonieWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.interleavedPtr = 0;
    this.initialized = false;
    this.playing = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.masterVolume = 0.8;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initModule(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'load':
        this.loadSong(data.playbackData);
        break;

      case 'play':
        if (this.module && this.module._player_play) {
          this.module._player_play();
          this.playing = true;
        }
        break;

      case 'stop':
        if (this.module && this.module._player_stop) {
          this.module._player_stop();
          this.playing = false;
        }
        break;

      case 'volume':
        this.masterVolume = data.value;
        break;

      case 'setInterpMode':
        if (this.module && this.module._player_set_interp_mode) {
          this.module._player_set_interp_mode(data.mode);
        }
        break;

      case 'setPatternStep':
        if (this.module && this.module._player_set_pattern_step) {
          this.module._player_set_pattern_step(
            data.pattern, data.row, data.channel,
            data.fx, data.pitch, data.volume, data.instr
          );
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  async initModule(sr, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.createSymphonie) {
        // Emscripten glue needs some DOM shims in worklet scope
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

        const wrappedCode = jsCode + '\nreturn createSymphonie;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.createSymphonie = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load Symphonie JS module' });
          return;
        }
      }

      if (typeof globalThis.createSymphonie !== 'function') {
        this.port.postMessage({ type: 'error', message: 'createSymphonie factory not available' });
        return;
      }

      // Capture WASM memory from instantiation
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
        this.module = await globalThis.createSymphonie(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Init player
      this.module._player_init(sr || sampleRate);

      // Default to cubic interpolation for modern playback quality
      if (this.module._player_set_interp_mode) {
        this.module._player_set_interp_mode(2);
      }

      // Allocate render buffer (128 stereo frames = 128*2*4 bytes)
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.interleavedPtr = malloc(this.bufferSize * 2 * 4);
        if (!this.interleavedPtr) {
          this.port.postMessage({ type: 'error', message: 'malloc failed for output buffer' });
          return;
        }
      }

      this.initialized = true;
      this.port.postMessage({ type: 'wasmReady' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'WASM init failed: ' + err.message });
    } finally {
      this.initializing = false;
    }
  }

  loadSong(data) {
    if (!this.module) return;
    const m = this.module;

    // Set channel count
    m._player_set_num_channels(data.numChannels);

    // Load instruments
    if (data.instruments) {
      // Debug: log ALL instruments that have sample data
      const withData = [];
      for (let i = 0; i < data.instruments.length; i++) {
        const inst = data.instruments[i];
        if (inst.samples && inst.samples.length > 0) {
          withData.push(`i${i}[type=${inst.type} smp=${inst.samples.length}]`);
        }
      }
      this.port.postMessage({ type: 'debug', message: `instruments with data (${withData.length}): ${withData.join(' ')}` });

      for (let i = 0; i < data.instruments.length; i++) {
        const inst = data.instruments[i];
        m._player_set_instrument(
          i, inst.type, inst.volume, inst.tune, inst.fineTune,
          inst.noDsp ? 2 : 0,  // playFlags: bit1 = NODSP
          inst.multiChannel || 0,
          inst.sampledFrequency || 8363
        );

        // Load sample data (convert Float32 → Int16)
        if (inst.samples && inst.samples.length > 0) {
          const numSamples = inst.samples.length;
          const malloc = m._malloc || m.malloc;
          if (!malloc) continue;

          const bufPtr = malloc(numSamples * 2);
          if (!bufPtr) continue;

          const heap16 = new Int16Array(this.getMemoryBuffer(), bufPtr, numSamples);
          for (let s = 0; s < numSamples; s++) {
            // Store samples at full 16-bit precision — both delta8 and delta16 formats
            // are normalized to Float32 [-1,1] by the parser. The C mixer's output
            // divisor (numPairs * 32768) handles the level correctly.
            heap16[s] = Math.max(-32768, Math.min(32767, Math.round(inst.samples[s] * 32767)));
          }
          m._player_set_instrument_sample(i, bufPtr, numSamples);

          const free = m._free || m.free;
          if (free) free(bufPtr);

          // Set loop info
          const hasLoop = (inst.loopLen > 0) && (inst.type === 4 || inst.type === 8);
          if (hasLoop) {
            const N = numSamples;
            const loopStartSample = Math.floor((inst.loopStart * N) / (100 * 65536));
            const loopLenSamples = Math.floor((inst.loopLen * N) / (100 * 65536));
            const loopEnd = loopStartSample + loopLenSamples;

            let sustStart = 0, sustEnd = 0;
            if (inst.type === 8) {
              sustStart = loopEnd;
              sustEnd = N;
            }

            m._player_set_instrument_loop(
              i, loopStartSample, loopEnd,
              sustStart, sustEnd, inst.numLoops || 0
            );
          }
        }
      }
    }

    // Load patterns
    if (data.patterns) {
      const numTrackChannels = Math.max(1, data.numChannels / 2);

      // Debug: find first few events with non-zero instrument
      const noteEvents = [];
      for (const pat of data.patterns) {
        if (!pat || !pat.events) continue;
        for (const ev of pat.events) {
          if (ev.instrument > 0 && ev.note > 0 && noteEvents.length < 10) {
            noteEvents.push(`[p${data.patterns.indexOf(pat)} r${ev.row} ch${ev.channel} n=${ev.note} i=${ev.instrument} v=${ev.volume} cmd=${ev.cmd}]`);
          }
        }
      }
      this.port.postMessage({ type: 'debug', message: `first note events with instrument: ${noteEvents.join(' ')}` });

      for (let patIdx = 0; patIdx < data.patterns.length; patIdx++) {
        const pat = data.patterns[patIdx];
        if (!pat) continue;

        m._player_set_pattern(patIdx, pat.numRows);

        if (pat.events) {
          for (const ev of pat.events) {
            // ASM pattern layout: channels are interleaved [L0,R0,L1,R1,...].
            // Only process L channels (even indices) and map to pair indices.
            // R channels are handled by the C player's stereo pair logic.
            if (ev.channel % 2 === 0) {
              const pairIdx = ev.channel >> 1;
              if (pairIdx >= numTrackChannels) continue;

              // The WASM SymNote.volume byte is dual-purpose:
              //   - For note-on (cmd=0): actual volume (0-100, or volume command 242-254)
              //   - For effects (cmd>0): effect parameter value
              // The parser separates these into .volume and .param, so we merge back.
              const volOrParam = ev.cmd > 0
                ? (ev.param || 0)
                : (ev.volume !== undefined && ev.volume !== 255 ? ev.volume : 0);

              m._player_set_pattern_note(
                patIdx, ev.row, pairIdx,
                ev.cmd || 0,
                ev.note > 0 ? ev.note - 1 : 0xFF,
                volOrParam,
                ev.instrument > 0 ? ev.instrument - 1 : 0xFF
              );
            }
          }
        }
      }
    }

    // Load positions from orderList with per-position speed and transpose
    if (data.orderList) {
      for (let i = 0; i < data.orderList.length; i++) {
        const patIdx = data.orderList[i];
        const pat = data.patterns ? data.patterns[patIdx] : null;
        const numRows = pat ? pat.numRows : 64;
        const spd = (data.orderSpeeds && data.orderSpeeds[i]) || data.cycle || 6;
        const tune = (data.orderTranspose && data.orderTranspose[i]) || 0;
        m._player_set_position(i, patIdx, 0, numRows, spd, tune, 1);
      }
    }

    // Single sequence covering all positions
    const orderLen = data.orderList ? data.orderList.length : 0;
    m._player_set_sequence(0, 0, orderLen, 1, 0, 0);
    m._player_set_sequence(1, 0, 0, 0, -1, 0); // end marker

    if (data.cycle) m._player_set_speed(data.cycle);

    // Stereo phase (DOSAMPLEDIFF): R channel sample start offset
    if (data.sampleDiff > 0 && m._player_set_sample_diff) {
      m._player_set_sample_diff(data.sampleDiff);
    }

    // Debug: report what we loaded
    const numInst = data.instruments ? data.instruments.length : 0;
    const numPat = data.patterns ? data.patterns.length : 0;
    const numOrd = data.orderList ? data.orderList.length : 0;
    let totalEvents = 0;
    let totalSamples = 0;
    if (data.patterns) {
      for (const p of data.patterns) {
        if (p && p.events) totalEvents += p.events.length;
      }
    }
    if (data.instruments) {
      for (const inst of data.instruments) {
        if (inst.samples) totalSamples += inst.samples.length;
      }
    }
    this.port.postMessage({ type: 'debug', message: `loaded: ${numInst} instruments (${totalSamples} total samples), ${numPat} patterns (${totalEvents} events), ${numOrd} orders, ${data.numChannels} channels, cycle=${data.cycle}` });

    this.port.postMessage({ type: 'ready' });
  }

  getMemoryBuffer() {
    if (this.module.wasmMemory) {
      return this.module.wasmMemory.buffer;
    }
    if (this.module.HEAPF32) {
      return this.module.HEAPF32.buffer;
    }
    return this.module.buffer || new ArrayBuffer(0);
  }

  process(_inputs, outputs) {
    if (!this.initialized || !this.playing || !this.module) return true;

    const out = outputs[0];
    if (!out || !out[0]) return true;

    const L = out[0];
    const R = out[1] || out[0];
    const frames = L.length;

    if (!this.interleavedPtr) return true;

    // Detect heap growth
    const memBuf = this.getMemoryBuffer();
    if (memBuf !== this.lastHeapBuffer) {
      this.lastHeapBuffer = memBuf;
    }

    // Render
    this.module._player_render(this.interleavedPtr, frames);

    // Read from WASM heap
    const heap = new Float32Array(this.getMemoryBuffer(), this.interleavedPtr, frames * 2);
    const vol = this.masterVolume;

    // Debug: comprehensive state dump (~1x per second)
    if (!this._debugCounter) this._debugCounter = 0;
    this._debugCounter++;
    if (this._debugCounter % 344 === 1) { // ~1x per second at 44100/128
      let maxSample = 0;
      for (let j = 0; j < frames * 2; j++) {
        const abs = Math.abs(heap[j]);
        if (abs > maxSample) maxSample = abs;
      }

      const m = this.module;
      const playing = m._player_debug_playing ? m._player_debug_playing() : '?';
      const nCh = m._player_debug_num_channels ? m._player_debug_num_channels() : '?';
      const nInst = m._player_debug_num_instruments ? m._player_debug_num_instruments() : '?';
      const nPat = m._player_debug_num_patterns ? m._player_debug_num_patterns() : '?';
      const nPos = m._player_debug_num_positions ? m._player_debug_num_positions() : '?';
      const nSeq = m._player_debug_num_sequences ? m._player_debug_num_sequences() : '?';
      const spd = m._player_debug_speed ? m._player_debug_speed() : '?';
      const spdCnt = m._player_debug_speed_count ? m._player_debug_speed_count() : '?';
      const spt = m._player_debug_samples_per_tick ? m._player_debug_samples_per_tick() : '?';
      const seq = m._player_get_seq_idx ? m._player_get_seq_idx() : '?';
      const pos = m._player_get_pos_idx ? m._player_get_pos_idx() : '?';
      const row = m._player_get_row_idx ? m._player_get_row_idx() : '?';

      // Voice state for first 8 voices
      let voiceInfo = '';
      if (m._player_debug_voice_status) {
        for (let ch = 0; ch < Math.min(8, typeof nCh === 'number' ? nCh : 8); ch++) {
          const st = m._player_debug_voice_status(ch);
          const end = m._player_debug_voice_end_reached(ch);
          const fr = m._player_debug_voice_freq(ch);
          const vl = m._player_debug_voice_volume(ch);
          const hs = m._player_debug_voice_has_sample(ch);
          const hi = m._player_debug_voice_has_instrument(ch);
          voiceInfo += ` ch${ch}[s=${st} e=${end} f=${fr} v=${vl} smp=${hs} inst=${hi}]`;
        }
      }

      // Instrument info for first 4 instruments
      let instInfo = '';
      if (m._player_debug_inst_type) {
        for (let i = 0; i < Math.min(4, typeof nInst === 'number' ? nInst : 4); i++) {
          const tp = m._player_debug_inst_type(i);
          const ns = m._player_debug_inst_num_samples(i);
          const hd = m._player_debug_inst_has_data(i);
          instInfo += ` i${i}[type=${tp} n=${ns} data=${hd}]`;
        }
      }

      // First pattern note data
      let patInfo = '';
      if (m._player_debug_pat_note) {
        for (let n = 0; n < 4; n++) {
          const packed = m._player_debug_pat_note(0, n);
          if (packed >= 0) {
            const fx = (packed >> 24) & 0xFF;
            const pitch = (packed >> 16) & 0xFF;
            const vol2 = (packed >> 8) & 0xFF;
            const instr = packed & 0xFF;
            patInfo += ` n${n}[fx=${fx} p=${pitch} v=${vol2} i=${instr}]`;
          }
        }
      }

      this.port.postMessage({ type: 'debug', message:
        `maxSmp=${maxSample.toFixed(6)} playing=${playing} seq=${seq} pos=${pos} row=${row} spd=${spd}/${spdCnt} spt=${typeof spt === 'number' ? spt.toFixed(1) : spt}\n` +
        `  data: ch=${nCh} inst=${nInst} pat=${nPat} pos=${nPos} seq=${nSeq}\n` +
        `  voices:${voiceInfo}\n` +
        `  instruments:${instInfo}\n` +
        `  pat0 notes:${patInfo}`
      });
    }

    for (let i = 0; i < frames; i++) {
      L[i] = heap[i * 2] * vol;
      R[i] = heap[i * 2 + 1] * vol;
    }

    // Check if finished
    if (this.module._player_is_finished && this.module._player_is_finished()) {
      this.playing = false;
      this.port.postMessage({ type: 'finished' });
    }

    return true;
  }

  cleanup() {
    if (this.module) {
      if (this.module._player_stop) this.module._player_stop();
      if (this.interleavedPtr) {
        const free = this.module._free || this.module.free;
        if (free) free(this.interleavedPtr);
        this.interleavedPtr = 0;
      }
    }
    this.module = null;
    this.initialized = false;
    this.playing = false;
    this.lastHeapBuffer = null;
  }
}

registerProcessor('symphonie-wasm-processor', SymphonieWasmProcessor);
