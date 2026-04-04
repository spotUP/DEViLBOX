/**
 * Sfizz AudioWorklet Processor
 * SFZ format sample player for DEViLBOX
 * Port of sfztools/sfizz (BSD-2-Clause)
 */

class SfizzProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.initializing = false;
    this.sfzLoaded = false;

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  async handleMessage(data) {
    switch (data.type) {
      case 'init':
        await this.initEngine(data.sampleRate, data.wasmBinary, data.jsCode);
        break;

      case 'loadSfzString':
        this.loadSfzString(data.sfzText, data.virtualPath);
        break;

      case 'loadSfzFile':
        this.loadSfzFile(data.path);
        break;

      case 'writeSample':
        this.writeSampleToFS(data.path, data.data);
        break;

      case 'writeFiles':
        this.writeFilesToFS(data.files);
        break;

      case 'mkdirp':
        this.mkdirp(data.path);
        break;

      case 'noteOn':
        if (this.engine) {
          this.module._sfizz_bridge_note_on(this.engine, data.delay || 0, data.note, data.velocity);
        }
        break;

      case 'noteOff':
        if (this.engine) {
          this.module._sfizz_bridge_note_off(this.engine, data.delay || 0, data.note, data.velocity || 0);
        }
        break;

      case 'cc':
        if (this.engine) {
          this.module._sfizz_bridge_send_cc(this.engine, data.delay || 0, data.cc, data.value);
        }
        break;

      case 'pitchWheel':
        if (this.engine) {
          this.module._sfizz_bridge_pitch_wheel(this.engine, data.delay || 0, data.value);
        }
        break;

      case 'aftertouch':
        if (this.engine) {
          this.module._sfizz_bridge_aftertouch(this.engine, data.delay || 0, data.value);
        }
        break;

      case 'polyAftertouch':
        if (this.engine) {
          this.module._sfizz_bridge_poly_aftertouch(this.engine, data.delay || 0, data.note, data.value);
        }
        break;

      case 'programChange':
        if (this.engine) {
          this.module._sfizz_bridge_program_change(this.engine, data.delay || 0, data.program);
        }
        break;

      case 'allSoundOff':
        if (this.engine) {
          this.module._sfizz_bridge_all_sound_off(this.engine);
        }
        break;

      case 'setVolume':
        if (this.engine) {
          this.module._sfizz_bridge_set_volume(this.engine, data.value);
        }
        break;

      case 'setNumVoices':
        if (this.engine) {
          this.module._sfizz_bridge_set_num_voices(this.engine, data.value);
        }
        break;

      case 'setOversampling':
        if (this.engine) {
          this.module._sfizz_bridge_set_oversampling(this.engine, data.value);
        }
        break;

      case 'setPreloadSize':
        if (this.engine) {
          this.module._sfizz_bridge_set_preload_size(this.engine, data.value);
        }
        break;

      case 'setSampleQuality':
        if (this.engine) {
          this.module._sfizz_bridge_set_sample_quality(this.engine, data.value);
        }
        break;

      case 'setOscillatorQuality':
        if (this.engine) {
          this.module._sfizz_bridge_set_oscillator_quality(this.engine, data.value);
        }
        break;

      case 'setTempo':
        if (this.engine) {
          this.module._sfizz_bridge_set_tempo(this.engine, data.bpm);
        }
        break;

      case 'setScalaRootKey':
        if (this.engine) {
          this.module._sfizz_bridge_set_scala_root_key(this.engine, data.value);
        }
        break;

      case 'setTuningFrequency':
        if (this.engine) {
          this.module._sfizz_bridge_set_tuning_frequency(this.engine, data.value);
        }
        break;

      case 'getInfo':
        if (this.engine) {
          this.port.postMessage({
            type: 'info',
            numRegions: this.module._sfizz_bridge_get_num_regions(this.engine),
            numGroups: this.module._sfizz_bridge_get_num_groups(this.engine),
            numVoices: this.module._sfizz_bridge_get_num_voices(this.engine),
            activeVoices: this.module._sfizz_bridge_get_num_active_voices(this.engine),
            preloadedSamples: this.module._sfizz_bridge_get_num_preloaded_samples(this.engine),
            volume: this.module._sfizz_bridge_get_volume(this.engine),
            oversampling: this.module._sfizz_bridge_get_oversampling(this.engine),
            sfzLoaded: this.sfzLoaded,
          });
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  mkdirp(path) {
    if (!this.module || !this.module.FS) return;
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      try {
        this.module.FS.mkdir(current);
      } catch (e) {
        // Directory already exists — ignore
      }
    }
  }

  writeSampleToFS(path, data) {
    if (!this.module || !this.module.FS) return;
    try {
      const dir = path.substring(0, path.lastIndexOf('/'));
      if (dir) this.mkdirp(dir);
      this.module.FS.writeFile(path, new Uint8Array(data));
    } catch (e) {
      console.error('[Sfizz Worklet] Error writing file:', path, e);
    }
  }

  writeFilesToFS(files) {
    if (!this.module || !this.module.FS) return;
    console.log(`[Sfizz Worklet] writeFilesToFS: ${files.length} files`);
    for (const { path, data } of files) {
      console.log(`[Sfizz Worklet]   writing: ${path} (${data.byteLength} bytes)`);
      this.writeSampleToFS(path, data);
    }
    // List what's in /sfz/ after writing
    try {
      const listDir = (p) => {
        try { return this.module.FS.readdir(p).filter(n => n !== '.' && n !== '..'); } catch { return []; }
      };
      console.log('[Sfizz Worklet]   /sfz/ contents:', listDir('/sfz'));
      const sub = listDir('/sfz').find(d => { try { return this.module.FS.isDir(this.module.FS.stat('/sfz/' + d).mode); } catch { return false; } });
      if (sub) console.log(`[Sfizz Worklet]   /sfz/${sub}/ contents:`, listDir('/sfz/' + sub));
    } catch {}
    this.port.postMessage({ type: 'filesWritten', count: files.length });
  }

  loadSfzString(sfzText, virtualPath) {
    if (!this.engine || !this.module) return;
    const textPtr = this.module._malloc(sfzText.length + 1);
    const pathStr = virtualPath || '/virtual.sfz';
    const pathPtr = this.module._malloc(pathStr.length + 1);

    // Re-read HEAPU8 after malloc — heap may have grown, invalidating old view
    const heap = new Uint8Array(this.module.wasmMemory.buffer);

    // Write strings to WASM heap
    for (let i = 0; i < sfzText.length; i++) {
      heap[textPtr + i] = sfzText.charCodeAt(i);
    }
    heap[textPtr + sfzText.length] = 0;

    for (let i = 0; i < pathStr.length; i++) {
      heap[pathPtr + i] = pathStr.charCodeAt(i);
    }
    heap[pathPtr + pathStr.length] = 0;

    const ok = this.module._sfizz_bridge_load_string(this.engine, textPtr, pathPtr);
    this.module._free(textPtr);
    this.module._free(pathPtr);

    this.sfzLoaded = !!ok;
    this.port.postMessage({
      type: 'sfzLoaded',
      success: !!ok,
      numRegions: ok ? this.module._sfizz_bridge_get_num_regions(this.engine) : 0,
      numGroups: ok ? this.module._sfizz_bridge_get_num_groups(this.engine) : 0,
    });
  }

  loadSfzFile(path) {
    if (!this.engine || !this.module) return;
    console.log(`[Sfizz Worklet] loadSfzFile: ${path}`);
    const pathPtr = this.module._malloc(path.length + 1);
    const heap = new Uint8Array(this.module.wasmMemory.buffer);
    for (let i = 0; i < path.length; i++) {
      heap[pathPtr + i] = path.charCodeAt(i);
    }
    heap[pathPtr + path.length] = 0;

    const ok = this.module._sfizz_bridge_load_file(this.engine, pathPtr);
    this.module._free(pathPtr);

    this.sfzLoaded = !!ok;
    this.port.postMessage({
      type: 'sfzLoaded',
      success: !!ok,
      numRegions: ok ? this.module._sfizz_bridge_get_num_regions(this.engine) : 0,
      numGroups: ok ? this.module._sfizz_bridge_get_num_groups(this.engine) : 0,
    });
  }

  async initEngine(sr, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      this.cleanup();

      if (jsCode && !globalThis.SfizzFactory) {
        // Polyfill DOM APIs for Emscripten in worklet context
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({
              relList: { supports: () => false },
              tagName: 'DIV', rel: '',
              addEventListener: () => {},
              removeEventListener: () => {}
            }),
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementsByTagName: () => [],
            head: { appendChild: () => {} },
            addEventListener: () => {},
            removeEventListener: () => {}
          };
        }

        if (typeof globalThis.window === 'undefined') {
          globalThis.window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => {},
            customElements: { whenDefined: () => Promise.resolve() },
            location: { href: '', pathname: '' }
          };
        }

        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class MutationObserver {
            constructor() {}
            observe() {}
            disconnect() {}
          };
        }

        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class DOMParser {
            parseFromString() {
              return { querySelector: () => null, querySelectorAll: () => [] };
            }
          };
        }

        const wrappedCode = jsCode + '\nreturn createSfizz;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.SfizzFactory = result;
        } else {
          this.port.postMessage({ type: 'error', message: 'Failed to load Sfizz JS module' });
          return;
        }
      }

      if (typeof globalThis.SfizzFactory !== 'function') {
        this.port.postMessage({ type: 'error', message: 'Sfizz factory not available' });
        return;
      }

      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function(...args) {
        const result = await origInstantiate.apply(this, args);
        const instance = result.instance || result;
        if (instance.exports) {
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) {
              capturedMemory = value;
              break;
            }
          }
        }
        return result;
      };

      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      try {
        this.module = await globalThis.SfizzFactory(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }

      // Create synth with sample rate and buffer size
      this.engine = this.module._sfizz_bridge_create(sr || sampleRate, this.bufferSize);

      // Allocate output buffers
      this.outputPtrL = this.module._malloc(this.bufferSize * 4);
      this.outputPtrR = this.module._malloc(this.bufferSize * 4);

      // Enable freewheeling mode for synchronous single-threaded operation
      this.module._sfizz_bridge_enable_freewheeling(this.engine);

      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.initializing = false;
      console.error('[Sfizz Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;

    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.outputBufferL = new Float32Array(heapF32.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(heapF32.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    if (this.engine && this.module) {
      this.module._sfizz_bridge_destroy(this.engine);
    }
    if (this.outputPtrL && this.module) this.module._free(this.outputPtrL);
    if (this.outputPtrR && this.module) this.module._free(this.outputPtrR);
    this.engine = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.sfzLoaded = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.engine || this.initializing) {
      return true;
    }

    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1];
    const frames = outL.length;

    this.updateBufferViews();

    if (!this.outputBufferL || !this.outputBufferR) {
      return true;
    }

    // Clear output buffers (sfizz renders additively)
    this.outputBufferL.fill(0);
    this.outputBufferR.fill(0);

    // Render audio
    this.module._sfizz_bridge_render(this.engine, this.outputPtrL, this.outputPtrR, frames);

    // Copy to output
    outL.set(this.outputBufferL.subarray(0, frames));
    outR.set(this.outputBufferR.subarray(0, frames));

    return true;
  }
}

registerProcessor('sfizz-processor', SfizzProcessor);
