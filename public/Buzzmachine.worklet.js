/**
 * Buzzmachine AudioWorklet Processor
 *
 * Runs buzzmachine WASM modules in the AudioWorklet thread for real-time processing.
 * Similar architecture to FurnaceChips.worklet.js but for Buzz machines.
 *
 * Each machine type (Arguru Distortion, Elak SVF, etc.) loads its own WASM module.
 */

console.log('[BuzzmachineWorklet] Loading worklet module...');

// Polyfill URL for AudioWorklet scope (Emscripten needs it)
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(url, base) {
      this.href = url;
      this.pathname = url;
      this.origin = '';
      this.protocol = 'https:';
      this.host = '';
      this.hostname = '';
      this.port = '';
      this.search = '';
      this.hash = '';
    }
    toString() { return this.href; }
    static createObjectURL() { return ''; }
    static revokeObjectURL() {}
  };
}

// Polyfill other globals Emscripten might need
if (typeof document === 'undefined') {
  globalThis.document = {
    currentScript: { src: '' },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {} }),
    body: { appendChild: () => {} }
  };
}

if (typeof window === 'undefined') {
  globalThis.window = globalThis;
}

if (typeof location === 'undefined') {
  globalThis.location = { href: '', origin: '', pathname: '' };
}

// Polyfill fetch (AudioWorklet doesn't have it, but Emscripten code references it)
if (typeof fetch === 'undefined') {
  globalThis.fetch = () => {
    return Promise.reject(new Error('fetch not available in AudioWorklet'));
  };
}

// Polyfill XMLHttpRequest (some Emscripten paths use it)
if (typeof XMLHttpRequest === 'undefined') {
  globalThis.XMLHttpRequest = class XMLHttpRequest {
    open() {}
    send() { if (this.onerror) this.onerror(new Error('XMLHttpRequest not available')); }
  };
}

// Polyfill setTimeout/clearTimeout (not available in AudioWorklet scope)
// Use a simple implementation that executes immediately (no actual delay in worklet context)
if (typeof setTimeout === 'undefined') {
  let timerId = 0;
  const timers = new Map();
  globalThis.setTimeout = (fn, delay) => {
    const id = ++timerId;
    // Execute asynchronously via Promise.resolve() to mimic setTimeout behavior
    Promise.resolve().then(() => {
      if (timers.has(id)) {
        timers.delete(id);
        try { fn(); } catch (e) { console.error('[setTimeout polyfill]', e); }
      }
    });
    timers.set(id, true);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
}

class BuzzmachineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    console.log('[BuzzmachineWorklet] Constructor starting...');

    // WASM module instance
    this.buzzModule = null;
    this.isInitialized = false;

    // Machine instance pointer (from buzz_create_machine)
    this.machinePtr = null;

    // Audio buffer pointers in WASM memory
    this.audioBufferPtr = 0;
    this.bufferSize = 128; // Standard AudioWorklet buffer size

    // Parameter values (GlobalVals pointer)
    this.globalValsPtr = 0;

    // Message handling
    this.port.onmessage = this.handleMessage.bind(this);

    // Generator state
    this.isGenerator = false;
    this.triggerPending = false;
    this.triggerVelocity = 127;
    this.triggerAccent = false;
    this.triggerSlide = false;
    this.noteFrequency = 440;
    this.isNoteOn = false;

    console.log('[BuzzmachineWorklet] Processor created, sampleRate:', sampleRate);

    // Don't send worklet-ready from constructor - wait for ping from main thread
    // This avoids race condition where ready message is sent before handler is attached
  }

  async initWasm(wasmBinary, jsCode, machineType) {
    try {
      console.log('[BuzzmachineWorklet] Initializing', machineType, 'jsCode length:', jsCode?.length, 'wasmBinary size:', wasmBinary?.byteLength);

      // Load WASM module factory from JS code
      if (jsCode && !globalThis[machineType]) {
        try {
          console.log('[BuzzmachineWorklet] Parsing JS module for', machineType);
          // Strip ES6 module syntax that doesn't work with new Function()
          // The export is typically at the very end: }export default FuncName;
          let cleanedCode = jsCode
            .replace(/export\s+default\s+\w+;?\s*$/, '')    // Remove export default at end
            .replace(/}export\s+default\s+\w+;?/, '}')      // Handle }export (no space)
            .replace(/import\.meta\.url/g, '"."')           // Replace import.meta.url
            .replace(/await\s+import\s*\([^)]+\)/g, 'null'); // Remove dynamic imports

          console.log('[BuzzmachineWorklet] Cleaned code ends with:', cleanedCode.slice(-100));

          const wrappedCode = cleanedCode + `\nreturn ${machineType};`;
          console.log('[BuzzmachineWorklet] Executing factory function...');
          const factory = new Function(wrappedCode);
          const result = factory();

          console.log('[BuzzmachineWorklet] Factory result type:', typeof result, result?.name);

          if (typeof result === 'function') {
            globalThis[machineType] = result;
            console.log('[BuzzmachineWorklet] ✓ JS module loaded');
          } else {
            console.error('[BuzzmachineWorklet] Unexpected result type:', typeof result);
            this.port.postMessage({ type: 'error', error: 'Factory returned ' + typeof result });
            return;
          }
        } catch (evalErr) {
          console.error('[BuzzmachineWorklet] Failed to load JS:', evalErr.message, evalErr.stack);
          this.port.postMessage({ type: 'error', error: 'JS eval failed: ' + evalErr.message });
          return;
        }
      }

      if (typeof globalThis[machineType] !== 'function') {
        console.error('[BuzzmachineWorklet] Factory not available for', machineType);
        this.port.postMessage({ type: 'error', error: 'Factory not available' });
        return;
      }

      // Initialize WASM module with timeout
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      console.log('[BuzzmachineWorklet] Instantiating WASM module...');

      // Note: Main thread already has timeout handling, so we just await here
      this.buzzModule = await globalThis[machineType](config);
      console.log('[BuzzmachineWorklet] WASM loaded, exports:', Object.keys(this.buzzModule).filter(k => k.startsWith('_')).join(', '));

      // Debug: Check what runtime methods are available
      console.log('[BuzzmachineWorklet] setValue available:', typeof this.buzzModule.setValue);
      console.log('[BuzzmachineWorklet] getValue available:', typeof this.buzzModule.getValue);
      console.log('[BuzzmachineWorklet] HEAPU8 available:', typeof this.buzzModule.HEAPU8);
      console.log('[BuzzmachineWorklet] HEAPF32 available:', typeof this.buzzModule.HEAPF32);
      console.log('[BuzzmachineWorklet] wasmMemory available:', typeof this.buzzModule.wasmMemory);
      console.log('[BuzzmachineWorklet] asm.memory available:', typeof this.buzzModule.asm?.memory);

      // Verify required exports exist
      const requiredExports = ['_buzz_create_machine', '_buzz_init', '_buzz_tick', '_buzz_work'];
      const missingExports = requiredExports.filter(e => typeof this.buzzModule[e] !== 'function');
      if (missingExports.length > 0) {
        throw new Error('Missing WASM exports: ' + missingExports.join(', '));
      }

      // Create machine instance
      this.machinePtr = this.buzzModule._buzz_create_machine();
      console.log('[BuzzmachineWorklet] Machine created, ptr:', this.machinePtr);

      // Validate machine pointer
      if (!this.machinePtr || this.machinePtr === 0) {
        throw new Error('_buzz_create_machine() returned null pointer');
      }

      // Set sample rate before init (AudioWorklet runs at 44100 or context sample rate)
      if (typeof this.buzzModule._buzz_set_sample_rate === 'function') {
        this.buzzModule._buzz_set_sample_rate(sampleRate);
        console.log('[BuzzmachineWorklet] Set sample rate:', sampleRate);
      }

      // Initialize machine (passing NULL for data input)
      this.buzzModule._buzz_init(this.machinePtr, 0);
      console.log('[BuzzmachineWorklet] Machine initialized');

      // Set number of tracks (some machines need at least 1 track)
      if (typeof this.buzzModule._buzz_set_num_tracks === 'function') {
        this.buzzModule._buzz_set_num_tracks(this.machinePtr, 1);
        console.log('[BuzzmachineWorklet] Set num tracks to 1');
      }

      // Get GlobalVals pointer for parameter access
      this.globalValsPtr = this.buzzModule._buzz_get_global_vals(this.machinePtr);
      console.log('[BuzzmachineWorklet] GlobalVals ptr:', this.globalValsPtr);

      // Allocate audio buffer (stereo interleaved float32)
      const bufferSizeBytes = this.bufferSize * 2 * 4; // 128 samples * 2 channels * 4 bytes
      this.audioBufferPtr = this.buzzModule._malloc(bufferSizeBytes);
      console.log('[BuzzmachineWorklet] Audio buffer ptr:', this.audioBufferPtr);

      // Clear the audio buffer
      if (this.audioBufferPtr) {
        const wasmMemory = this.getWasmMemory();
        if (wasmMemory) {
          const bufferView = new Uint8Array(wasmMemory, this.audioBufferPtr, bufferSizeBytes);
          bufferView.fill(0);
        }
      }

      this.isInitialized = true;
      
      // Pre-cache views for WASM memory
      const wasmMemory = this.getWasmMemory();
      if (wasmMemory) {
        this.wasmAudioView = new Float32Array(wasmMemory, this.audioBufferPtr, this.bufferSize);
      }

      this.port.postMessage({ type: 'initialized' });
      console.log('[BuzzmachineWorklet] ✓ Ready:', machineType);

    } catch (err) {
      console.error('[BuzzmachineWorklet] Init failed:', err);
      this.port.postMessage({ type: 'error', error: err.message });
    }
  }

  handleMessage(event) {
    const { type, wasmBinary, jsCode, machineType, paramIndex, paramValue, frequency, velocity, accent, slide } = event.data;

    switch (type) {
      case 'ping':
        // Respond to ping from main thread - this confirms worklet is ready
        console.log('[BuzzmachineWorklet] Received ping, sending worklet-ready');
        this.port.postMessage({ type: 'worklet-ready' });
        break;

      case 'init':
        console.log('[BuzzmachineWorklet] Received init message for', machineType);
        // Check if this is a generator type
        this.isGenerator = this.isGeneratorType(machineType);
        this.machineTypeName = machineType;
        // Start async init and catch any errors
        this.initWasm(wasmBinary, jsCode, machineType).catch(err => {
          console.error('[BuzzmachineWorklet] Unhandled init error:', err);
          this.port.postMessage({ type: 'error', error: 'Init error: ' + (err.message || err) });
        });
        break;

      case 'setParameter':
        if (this.isInitialized && this.globalValsPtr) {
          this.setParameter(paramIndex, paramValue);
        }
        break;

      case 'noteOn':
        if (this.isInitialized && this.isGenerator) {
          this.triggerPending = true;
          this.triggerVelocity = velocity || 127;
          this.triggerAccent = accent || false;
          this.triggerSlide = slide || false;
          this.noteFrequency = frequency || 440;
          this.isNoteOn = true;
          
          if (this.triggerAccent || this.triggerSlide) {
            console.log('[BuzzmachineWorklet] noteOn with extras:', { accent: this.triggerAccent, slide: this.triggerSlide });
          }
          
          // Trigger the generator immediately
          this.triggerGenerator();
        }
        break;

      case 'noteOff':
        if (this.isInitialized && this.isGenerator) {
          this.isNoteOn = false;
          // Some generators need explicit release
          this.releaseGenerator();
        }
        break;

      case 'stop':
        if (this.isInitialized && this.machinePtr) {
          this.buzzModule._buzz_stop(this.machinePtr);
        }
        break;
    }
  }

  isGeneratorType(machineType) {
    // Generators that produce sound (vs effects that process sound)
    // Use enum values (no underscores) to match BuzzmachineType values
    const generators = [
      'CyanPhaseDTMF', 'ElenzilFrequencyBomb',
      'FSMKick', 'FSMKickXP',
      'JeskolaNoise', 'JeskolaTrilok',
      'MadBrain4FM2F', 'MadBrainDynamite6',
      'MakkM3', 'MakkM4', 'OomekAggressor'
    ];
    return generators.some(g => machineType && machineType.includes(g));
  }

  // Get the WASM memory ArrayBuffer
  getWasmMemory() {
    if (!this.buzzModule) return null;
    // Try various ways Emscripten exposes memory
    if (this.buzzModule.wasmMemory?.buffer) return this.buzzModule.wasmMemory.buffer;
    if (this.buzzModule.asm?.memory?.buffer) return this.buzzModule.asm.memory.buffer;
    if (this.buzzModule.HEAPU8?.buffer) return this.buzzModule.HEAPU8.buffer;
    if (this.buzzModule.HEAPF32?.buffer) return this.buzzModule.HEAPF32.buffer;
    // Last resort: try to find memory on the module
    if (this.buzzModule.memory?.buffer) return this.buzzModule.memory.buffer;
    return null;
  }

  // Helper to write a byte to WASM memory using setValue or direct HEAPU8 access
  writeByte(ptr, value) {
    if (!this.buzzModule || !ptr) {
      console.warn('[BuzzmachineWorklet] writeByte: no module or ptr=0');
      return;
    }
    if (this.buzzModule.setValue) {
      this.buzzModule.setValue(ptr, value & 0xFF, 'i8');
      // Debug: verify write worked
      if (this.buzzModule.getValue) {
        const readBack = this.buzzModule.getValue(ptr, 'i8');
        if (!this.writeByteDebugLogged) {
          console.log('[BuzzmachineWorklet] writeByte via setValue:', ptr, '=', value, ', readBack:', readBack);
          this.writeByteDebugLogged = true;
        }
      }
    } else {
      const buffer = this.getWasmMemory();
      if (buffer) {
        new Uint8Array(buffer)[ptr] = value & 0xFF;
        if (!this.writeByteDebugLogged) {
          console.log('[BuzzmachineWorklet] writeByte via buffer:', ptr, '=', value);
          this.writeByteDebugLogged = true;
        }
      } else {
        console.error('[BuzzmachineWorklet] writeByte: no memory buffer available!');
      }
    }
  }

  // Helper to write a word (16-bit) to WASM memory
  writeWord(ptr, value) {
    if (!this.buzzModule || !ptr) {
      console.warn('[BuzzmachineWorklet] writeWord: no module or ptr=0');
      return;
    }
    if (this.buzzModule.setValue) {
      this.buzzModule.setValue(ptr, value & 0xFFFF, 'i16');
      // Debug: verify write worked
      if (this.buzzModule.getValue && !this.writeWordDebugLogged) {
        const readBack = this.buzzModule.getValue(ptr, 'i16');
        console.log('[BuzzmachineWorklet] writeWord via setValue:', ptr, '=', value, ', readBack:', readBack & 0xFFFF);
        this.writeWordDebugLogged = true;
      }
    } else {
      const buffer = this.getWasmMemory();
      if (buffer) {
        // Note: ptr must be 2-byte aligned for Uint16Array
        if (ptr % 2 === 0) {
          new Uint16Array(buffer, ptr, 1)[0] = value & 0xFFFF;
        } else {
          // Unaligned access - write two bytes
          const view = new Uint8Array(buffer);
          view[ptr] = value & 0xFF;
          view[ptr + 1] = (value >> 8) & 0xFF;
        }
        if (!this.writeWordDebugLogged) {
          console.log('[BuzzmachineWorklet] writeWord via buffer:', ptr, '=', value);
          this.writeWordDebugLogged = true;
        }
      } else {
        console.error('[BuzzmachineWorklet] writeWord: no memory buffer available!');
      }
    }
  }

  triggerGenerator() {
    if (!this.buzzModule || !this.machinePtr) return;

    // Unmute on trigger (some machines like FrequencyBomb/Aggressor303 don't naturally stop)
    this.muted = false;

    // Different generators have different trigger mechanisms
    // Most use a trigger parameter that needs to be set before Tick()
    const machineType = this.machineTypeName || '';
    console.log('[BuzzmachineWorklet] Triggering generator:', machineType, 'freq:', this.noteFrequency, 'vel:', this.triggerVelocity);

    if (machineType.includes('FSMKickXP')) {
      // FSM Kick XP has 15 track params:
      // 0:pitchlimit, 1:volume(trigger), 2:startfrq, 3:endfrq, 4:buzz, 5:click, 6:punch,
      // 7:tdecay, 8:tshape, 9:bdecay, 10:cdecay, 11:dslope, 12:dtime, 13:rslope, 14:ndelay
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        if (!this.fsmKickXPInitialized) {
          this.writeByte(trackValsPtr + 0, 255);   // pitchlimit = no value
          this.writeByte(trackValsPtr + 2, 145);   // startfrq default
          this.writeByte(trackValsPtr + 3, 50);    // endfrq default
          this.writeByte(trackValsPtr + 4, 55);    // buzz default
          this.writeByte(trackValsPtr + 5, 28);    // click default
          this.writeByte(trackValsPtr + 6, 47);    // punch default
          this.writeByte(trackValsPtr + 7, 30);    // tdecay default
          this.writeByte(trackValsPtr + 8, 27);    // tshape default
          this.writeByte(trackValsPtr + 9, 55);    // bdecay default
          this.writeByte(trackValsPtr + 10, 55);   // cdecay default
          this.writeByte(trackValsPtr + 11, 1);    // dslope default
          this.writeByte(trackValsPtr + 12, 32);   // dtime default
          this.writeByte(trackValsPtr + 13, 105);  // rslope default
          this.writeByte(trackValsPtr + 14, 0);    // ndelay default
          this.fsmKickXPInitialized = true;
        }
        // Trigger with volume at offset 1
        const vol = Math.min(240, Math.round(this.triggerVelocity * 1.9));
        this.writeByte(trackValsPtr + 1, vol);
        console.log('[BuzzmachineWorklet] FSMKickXP triggered with volume:', vol);
        this.pendingFsmKickXPClear = trackValsPtr;
      }
    } else if (machineType.includes('FSMKick')) {
      // FSM Kick (non-XP) has 6 track params:
      // 0:volume(trigger), 1:startfrq, 2:endfrq, 3:tdecay, 4:tshape, 5:adecay
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        if (!this.fsmKickInitialized) {
          this.writeByte(trackValsPtr + 1, 198);   // startfrq default
          this.writeByte(trackValsPtr + 2, 64);    // endfrq default
          this.writeByte(trackValsPtr + 3, 46);    // tdecay default
          this.writeByte(trackValsPtr + 4, 27);    // tshape default
          this.writeByte(trackValsPtr + 5, 55);    // adecay default
          this.fsmKickInitialized = true;
        }
        const vol = Math.min(240, Math.round(this.triggerVelocity * 1.9));
        this.writeByte(trackValsPtr, vol);
        console.log('[BuzzmachineWorklet] FSMKick triggered with volume:', vol);
        this.pendingFsmKickClear = trackValsPtr;
      }
    } else if (machineType.includes('JeskolaTrilok')) {
      // Trilok global params: bd_trigger (switch), bd_tone, bd_decay, bd_volume
      // Switch type: SWITCH_ON=1, SWITCH_OFF=0, SWITCH_NO=255
      if (this.globalValsPtr) {
        // Set defaults first
        if (!this.trilokInitialized) {
          this.writeByte(this.globalValsPtr + 1, 64);  // bd_tone default
          this.writeByte(this.globalValsPtr + 2, 64);  // bd_decay default
          this.trilokInitialized = true;
        }
        // Set volume based on velocity
        const vol = Math.min(254, Math.round(this.triggerVelocity * 2));
        this.writeByte(this.globalValsPtr + 3, vol);  // bd_volume
        // Set trigger LAST
        this.writeByte(this.globalValsPtr, 1);  // bd_trigger = SWITCH_ON
        console.log('[BuzzmachineWorklet] JeskolaTrilok triggered:', { volume: vol });

        // Mark for clearing after Tick
        this.pendingTrilokClear = this.globalValsPtr;
      }
    } else if (machineType.includes('JeskolaNoise')) {
      // Noise: Track params structure (from Noise.cpp tvals class):
      // - Attack (word, offset 0) - time in ms, NoValue=0, MinValue=1, MaxValue=0xFFFF
      // - Sustain (word, offset 2) - time in ms, NoValue=0, MinValue=1, MaxValue=0xFFFF
      // - Release (word, offset 4) - time in ms, NoValue=0, MinValue=1, MaxValue=0xFFFF
      // - Color (word, offset 6) - 0 to 0x1000, NoValue=0xFFFF
      // - Volume (byte, offset 8) - 0x00 to 0xFE, NoValue=0xFF
      // - Trigger (switch, offset 9) - SWITCH_OFF=0, SWITCH_ON=1, SWITCH_NO=0xFF
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      console.log('[BuzzmachineWorklet] JeskolaNoise trackValsPtr:', trackValsPtr, 'setValue:', typeof this.buzzModule.setValue);
      if (trackValsPtr) {
        // Set envelope parameters in milliseconds
        // Using longer values to ensure we hear something
        const attackMs = 50;    // 50ms attack
        const sustainMs = 500;  // 500ms sustain
        const releaseMs = 300;  // 300ms release
        const color = 0x0800;   // Mid-range color (2048 out of 4096)

        this.writeWord(trackValsPtr + 0, attackMs);
        this.writeWord(trackValsPtr + 2, sustainMs);
        this.writeWord(trackValsPtr + 4, releaseMs);
        this.writeWord(trackValsPtr + 6, color);

        // Set volume based on velocity (0x80 = 100%)
        const vol = Math.min(0xFE, Math.round(this.triggerVelocity * 2));
        this.writeByte(trackValsPtr + 8, vol); // volume
        this.writeByte(trackValsPtr + 9, 1);   // trigger ON (SWITCH_ON = 1)

        // Debug: Read back values to verify writes
        if (this.buzzModule.getValue) {
          const readAttack = this.buzzModule.getValue(trackValsPtr + 0, 'i16') & 0xFFFF;
          const readSustain = this.buzzModule.getValue(trackValsPtr + 2, 'i16') & 0xFFFF;
          const readRelease = this.buzzModule.getValue(trackValsPtr + 4, 'i16') & 0xFFFF;
          const readColor = this.buzzModule.getValue(trackValsPtr + 6, 'i16') & 0xFFFF;
          const readVol = this.buzzModule.getValue(trackValsPtr + 8, 'i8') & 0xFF;
          const readTrigger = this.buzzModule.getValue(trackValsPtr + 9, 'i8') & 0xFF;
          console.log('[BuzzmachineWorklet] JeskolaNoise params written & read back:', {
            attack: attackMs, readAttack,
            sustain: sustainMs, readSustain,
            release: releaseMs, readRelease,
            color, readColor,
            vol, readVol,
            trigger: 1, readTrigger
          });
        } else {
          console.log('[BuzzmachineWorklet] JeskolaNoise params set:', { attackMs, sustainMs, releaseMs, color, vol });
        }

        // Store ptr for clearing after Tick()
        this.pendingNoiseClear = trackValsPtr;
      } else {
        console.warn('[BuzzmachineWorklet] No trackValsPtr for JeskolaNoise!');
      }
    } else if (machineType.includes('CyanPhaseDTMF')) {
      // DTMF uses GLOBAL parameters (not track params):
      // - Number (byte, offset 0) - 0-11 for dial tones, NoValue=0xFF
      // - Sustain (byte, offset 1) - centiseconds (40 = 0.4s), NoValue=0xFF
      // - Twist (byte, offset 2) - dB difference, NoValue=0xFF
      // - Volume (byte, offset 3) - amplitude (0xC0 = default), NoValue=0xFF
      //
      // DTMF also has 2 ATTRIBUTES that MUST be initialized:
      // - Attack (int, aval offset 0) - default 10ms
      // - Release (int, aval offset 4) - default 20ms
      // These are initialized in BuzzmachineWrapper.cpp before Init() is called
      if (this.globalValsPtr) {
        // Map note frequency to dial number (0-11)
        const midiNote = Math.round(12 * Math.log2(this.noteFrequency / 440) + 69);
        const dialNum = midiNote % 12; // Map to 0-11

        // Set sustain (100 centiseconds = 1.0s for more audible tone)
        this.writeByte(this.globalValsPtr + 1, 100);
        // Set twist (0 = no difference)
        this.writeByte(this.globalValsPtr + 2, 0);
        // Set volume based on velocity (0xC0 = default)
        const vol = Math.min(0xFE, Math.max(0xC0, Math.round(this.triggerVelocity * 2)));
        this.writeByte(this.globalValsPtr + 3, vol);
        // Set number LAST to trigger the tone
        this.writeByte(this.globalValsPtr + 0, dialNum);

        // Debug: Read back values to verify
        if (this.buzzModule.getValue) {
          const readNum = this.buzzModule.getValue(this.globalValsPtr + 0, 'i8') & 0xFF;
          const readSustain = this.buzzModule.getValue(this.globalValsPtr + 1, 'i8') & 0xFF;
          const readTwist = this.buzzModule.getValue(this.globalValsPtr + 2, 'i8') & 0xFF;
          const readVol = this.buzzModule.getValue(this.globalValsPtr + 3, 'i8') & 0xFF;
          console.log('[BuzzmachineWorklet] CyanPhaseDTMF params written & verified:', {
            dialNum, readNum,
            sustain: 100, readSustain,
            twist: 0, readTwist,
            volume: vol, readVol,
            globalValsPtr: this.globalValsPtr
          });
        } else {
          console.log('[BuzzmachineWorklet] CyanPhaseDTMF triggered:', { dialNum, sustain: 100, volume: vol, globalValsPtr: this.globalValsPtr });
        }

        // Store ptr for clearing after Tick()
        this.pendingDTMFClear = this.globalValsPtr;
      } else {
        console.warn('[BuzzmachineWorklet] CyanPhaseDTMF has no globalValsPtr!');
      }
    } else if (machineType.includes('OomekAggressor')) {
      // Oomek Aggressor (TB-303 style synth)
      //
      // From 303.cpp source code:
      // Global params (gvals at globalValsPtr):
      //   offset 0: osctype (switch) - 0=saw, 1=square
      //   offset 1: cutoff (byte 0x00-0xF0)
      //   offset 2: resonance (byte 0x00-0x80)
      //   offset 3: envmod (byte 0x00-0x80)
      //   offset 4: decay (byte 0x00-0x80)
      //   offset 5: acclevel (byte 0x00-0x80)
      //   offset 6: finetune (byte 0x00-0xC8, center=0x64)
      //   offset 7: volume (byte 0x00-0xC8)
      //
      // Track params (tvals at trackValsPtr):
      //   offset 0: note (pt_note)
      //   offset 1: slide (switch) - 0xFF=no value, 0=off, 1=on
      //   offset 2: accent (switch) - 0xFF=no value, 0=off, 1=on

      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;

      if (trackValsPtr) {
        // Initialize global params on first trigger (if not already initialized)
        if (!this.aggressorInitialized && this.globalValsPtr) {
          // Set default global params (matching 303.cpp defaults)
          this.writeByte(this.globalValsPtr + 0, 0xFF);   // osctype = no value (keep current)
          this.writeByte(this.globalValsPtr + 1, 0x78);   // cutoff default
          this.writeByte(this.globalValsPtr + 2, 0x40);   // resonance default
          this.writeByte(this.globalValsPtr + 3, 0x40);   // envmod default
          this.writeByte(this.globalValsPtr + 4, 0x40);   // decay default
          this.writeByte(this.globalValsPtr + 5, 0x40);   // acclevel default
          this.writeByte(this.globalValsPtr + 6, 0x64);   // finetune = 100 (center, 0 cents)
          this.writeByte(this.globalValsPtr + 7, 0x64);   // volume = 100%

          // Devil Fish extra params (offsets 8-16) - only for DF variant
          if (machineType.includes('OomekAggressorDF')) {
            this.writeByte(this.globalValsPtr + 8, 0x40);   // accentDecay default
            this.writeByte(this.globalValsPtr + 9, 0x60);   // vegDecay default (longer than filter decay)
            this.writeByte(this.globalValsPtr + 10, 0x00);  // vegSustain = 0 (normal 303)
            this.writeByte(this.globalValsPtr + 11, 0x00);  // softAttack = 0 (0.3ms, normal 303)
            this.writeByte(this.globalValsPtr + 12, 0x00);  // filterTracking = 0 (off)
            this.writeByte(this.globalValsPtr + 13, 0xFF);  // highResonance = no value (keep current/off)
            this.writeByte(this.globalValsPtr + 14, 0x1E);  // slideTime = 30 (~60ms, original 303)
            this.writeByte(this.globalValsPtr + 15, 0x00);  // muffler = 0 (off)
            this.writeByte(this.globalValsPtr + 16, 0x01);  // sweepSpeed = 1 (normal)
            console.log('[BuzzmachineWorklet] OomekAggressorDF Devil Fish params initialized');
          }

          this.aggressorInitialized = true;
          console.log('[BuzzmachineWorklet] OomekAggressor global params initialized');
        }

        // Convert frequency to Buzz note format
        const midiNote = Math.round(12 * Math.log2(this.noteFrequency / 440) + 69);
        const octave = Math.floor(midiNote / 12);
        const noteInOctave = midiNote % 12;
        // Buzz note format: (octave << 4) | (note + 1), where note is 1-12 not 0-11
        // NOTE_MIN = 0x01, NOTE_MAX = 0x79
        const buzzNote = ((octave) << 4) | (noteInOctave + 1);

        // TB-303 SLIDE SEMANTICS:
        // "Slide is ON on a step if the PREVIOUSLY played step had Slide AND the current step is a valid Note"
        // The worklet receives the slide flag which was computed by the tracker/sequencer
        // If slide=true, we should NOT retrigger envelopes - just glide pitch
        const slideActive = this.triggerSlide && this.aggressorPreviousNote !== null && this.aggressorGateHigh;

        if (slideActive) {
          // Slide mode: Set slide flag ON, don't reset envelope state
          // Aggressor will glide from previous note to new note without retriggering
          this.writeByte(trackValsPtr + 1, 1);  // slide = ON
        } else {
          // Normal note: Set slide flag OFF
          this.writeByte(trackValsPtr + 1, 0);  // slide = OFF
        }

        // Handle Accent - set per-note accent flag
        if (this.triggerAccent) {
          this.writeByte(trackValsPtr + 2, 1);  // accent = ON
        } else {
          this.writeByte(trackValsPtr + 2, 0);  // accent = OFF
        }

        // Set note LAST to trigger (offset 0)
        this.writeByte(trackValsPtr + 0, Math.max(1, Math.min(0x79, buzzNote)));

        // Track state for proper 303 slide handling
        this.aggressorPreviousNote = buzzNote;
        this.aggressorGateHigh = true;

        // Store the current slide flag for next note's slide decision
        // (The tracker should handle this, but we track it here too for safety)
        this.aggressorPreviousSlideFlag = this.triggerSlide;

        if (this.triggerAccent || this.triggerSlide) {
          console.log('[BuzzmachineWorklet] OomekAggressor triggered with 303 params:', {
            midiNote,
            buzzNote: buzzNote.toString(16),
            slide: slideActive,
            accent: this.triggerAccent,
            freq: this.noteFrequency
          });
        } else {
          console.log('[BuzzmachineWorklet] OomekAggressor triggered:', { midiNote, buzzNote: buzzNote.toString(16) });
        }

        // Store for clearing - Aggressor holds note until gate drops
        this.pendingSynthNotePtr = trackValsPtr;
        this.pendingSynthType = 'OomekAggressor';
      }
    } else if (machineType.includes('MakkM3')) {
      // Makk M3 synth - 35 track params (all bytes):
      // 0:Note (pt_note, NoValue=0xFF), 1:Wave1, 2:PW1, 3:Wave2, 4:PW2, 5:DetuneSemi, 6:DetuneFine, 7:Sync,
      // 8:MixType, 9:Mix, 10:SubOscWave, 11:SubOscVol, 12:PEGAttack, 13:PEGDecay,
      // 14:PEnvMod, 15:Glide, 16:Volume (default 0x40), 17:AEGAttack, 18:AEGSustain, 19:AEGRelease,
      // 20:FilterType, 21:Cutoff, 22:Resonance, 23:FEGAttack, 24:FEGSustain, 25:FEGRelease, 26:FEnvMod
      // 27:LFO1Dest, 28:LFO1Wave, 29:LFO1Freq, 30:LFO1Amount, 31:LFO2Dest, 32:LFO2Wave, 33:LFO2Freq, 34:LFO2Amount
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        const midiNote = Math.round(12 * Math.log2(this.noteFrequency / 440) + 69);
        const octave = Math.floor(midiNote / 12);
        const note = midiNote % 12;
        // Buzz note format: (octave << 4) | semitone, where semitone is 1-12 (NOT 0-11!)
        // M3's freqTab is indexed as j*16+i where i goes from 1 to 12
        const buzzNote = ((octave) << 4) | (note + 1);

        // Initialize params on first trigger (use actual defaults from source)
        // Most params default to 0xFF (NoValue), meaning "don't change"
        // Volume MUST be set on first trigger because machine starts with default from Reset()
        if (!this.makkM3Initialized) {
          // Set all params to NoValue (0xFF) first
          for (let i = 0; i < 35; i++) {
            this.writeByte(trackValsPtr + i, 0xFF);
          }
          // Then set critical params with sensible values
          this.writeByte(trackValsPtr + 1, 0);     // Wave1: saw (default)
          this.writeByte(trackValsPtr + 3, 0);     // Wave2: saw
          this.writeByte(trackValsPtr + 5, 0x40);  // DetuneSemi (centered)
          this.writeByte(trackValsPtr + 6, 0x40);  // DetuneFine (centered)
          this.writeByte(trackValsPtr + 16, 0x60); // Volume - above default for louder sound
          this.writeByte(trackValsPtr + 17, 5);    // AEGAttack (fast)
          this.writeByte(trackValsPtr + 18, 40);   // AEGSustain
          this.writeByte(trackValsPtr + 19, 30);   // AEGRelease
          this.writeByte(trackValsPtr + 20, 1);    // FilterType: lowpass
          this.writeByte(trackValsPtr + 21, 80);   // Cutoff
          this.writeByte(trackValsPtr + 22, 30);   // Resonance
          this.makkM3Initialized = true;
          console.log('[BuzzmachineWorklet] MakkM3 initialized with default params');
        }

        // Set note - ALWAYS set this to trigger sound
        this.writeByte(trackValsPtr, Math.max(1, Math.min(0x9C, buzzNote))); // NOTE_MAX is 156 (0x9C)

        // Also ensure volume is not NoValue on each note
        const vol = Math.min(127, Math.max(0x40, Math.round(this.triggerVelocity)));
        this.writeByte(trackValsPtr + 16, vol);

        console.log('[BuzzmachineWorklet] MakkM3 triggered:', { midiNote, buzzNote: buzzNote.toString(16), volume: vol });

        // Store for clearing on release
        this.pendingSynthNotePtr = trackValsPtr;
        this.pendingSynthType = 'MakkM3';
      }
    } else if (machineType.includes('ElenzilFrequencyBomb') || machineType.includes('FrequencyBomb')) {
      // FrequencyBomb uses TRACK params (not global!):
      // Only 4 active parameters (others commented out in pParameters):
      // - Freq x 100 (word, offset 0) - target freq * 100, NoValue=65535, default=5000 (50Hz)
      // - LFOPeriod (word, offset 2) - LFO period in centiseconds, NoValue=65535, default=1000 (10s)
      // - LFOAmt (word, offset 4) - LFO amount Hz*1000, NoValue=65535, default=0
      // - Wave (byte, offset 6) - waveform (0=sine,1=saw,2=square,3=tri,4=noise), NoValue=255, default=0
      //
      // IMPORTANT: FrequencyBomb's Work() returns false if mode != WM_WRITE!
      // This is why we set isGenerator machines to use WM_WRITE mode.
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        const freqX100 = Math.min(65534, Math.max(1, Math.round(this.noteFrequency * 100)));
        this.writeWord(trackValsPtr + 0, freqX100);  // Frequency
        this.writeWord(trackValsPtr + 2, 0xFFFF);    // LFO period = NoValue (don't change)
        this.writeWord(trackValsPtr + 4, 0xFFFF);    // LFO amount = NoValue (don't change)
        this.writeByte(trackValsPtr + 6, 0xFF);      // Wave = NoValue (don't change, keep default sine)

        console.log('[BuzzmachineWorklet] FrequencyBomb triggered:', { freqX100, freq: this.noteFrequency, trackValsPtr });

        // Debug: Read back to verify
        if (this.buzzModule.getValue) {
          const readFreq = this.buzzModule.getValue(trackValsPtr + 0, 'i16') & 0xFFFF;
          console.log('[BuzzmachineWorklet] FrequencyBomb freq readback:', readFreq);
        }

        // Store ptr for clearing after Tick()
        this.pendingFreqBombClear = trackValsPtr;
      } else {
        console.warn('[BuzzmachineWorklet] FrequencyBomb has no trackValsPtr!');
      }
    } else if (machineType.includes('MadBrainDynamite6')) {
      // Dynamite6 track params: note (byte, offset 0), volume (byte, offset 1)
      // Note: NOTE_NO=0 (no change), NOTE_OFF=255 (stop)
      // Volume: NoValue=0xFF, default=0x80 (100%)
      // CRITICAL: Dynamite6 has uninitialized 'final_amp' - need to set global 'amplification' param!

      // Initialize global params on first trigger
      if (!this.dynamite6Initialized && this.globalValsPtr) {
        // Global vals struct:
        // offset 0: coarse_tune (byte)
        // offset 1: fine_tune (byte)
        // offset 2: amplification (byte) - CRITICAL: final_amp = pow(2,(amp-128)/8), 128=unity gain
        this.writeByte(this.globalValsPtr + 2, 0x80); // amplification = 128 = unity gain
        this.dynamite6Initialized = true;
        console.log('[BuzzmachineWorklet] Dynamite6 global params initialized');
      }

      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        const midiNote = Math.round(12 * Math.log2(this.noteFrequency / 440) + 69);
        const octave = Math.floor(midiNote / 12);
        const note = midiNote % 12;
        // Buzz note format: high nibble = octave (1-9), low nibble = semitone (1-12)
        const buzzNote = ((octave) << 4) | (note + 1); // +1 because semitones are 1-12 not 0-11

        // Set volume FIRST (offset 1)
        const vol = Math.min(0xFE, Math.max(0x80, Math.round(this.triggerVelocity * 2)));
        this.writeByte(trackValsPtr + 1, vol);

        // Set note SECOND (offset 0) - this triggers the envelope
        this.writeByte(trackValsPtr, Math.max(1, Math.min(0xFE, buzzNote)));

        console.log('[BuzzmachineWorklet] Dynamite6 triggered:', { midiNote, buzzNote: buzzNote.toString(16), volume: vol });

        this.pendingSynthNotePtr = trackValsPtr;
        this.pendingSynthType = 'Dynamite6';
      }
    } else if (machineType.includes('MadBrain4FM2F')) {
      // 4FM2F: 4-operator FM synth
      // Track params: note (byte, offset 0), volume (byte, offset 1)
      // CRITICAL: Oscillator volumes in global params default to 0xFF (no value) but vc.osc
      // initializes to 0x10000000 (very low). Must set osc volumes to their actual defaults!

      // Initialize global params on first trigger
      if (!this.fm4fm2fInitialized && this.globalValsPtr) {
        // Global vals struct (41 bytes total):
        // offset 0: routing (default 1)
        // offset 1-8: Osc4 (wave, freq, fine, vol, a, d, s, r)
        // offset 9-16: Osc3 (same)
        // offset 17-24: Osc2 (same)
        // offset 25-32: Osc1 (same)
        // offset 33-40: LPF (cutoff, reso, kf, env, a, d, s, r)

        // Set routing to algorithm 1 (4->3->2->1)
        this.writeByte(this.globalValsPtr + 0, 1);

        // Set oscillator volumes to defaults (vol is 4th param in each osc group)
        // Osc4: vol default=32 at offset 4 (1 + 3)
        this.writeByte(this.globalValsPtr + 4, 32);
        // Osc3: vol default=32 at offset 12 (9 + 3)
        this.writeByte(this.globalValsPtr + 12, 32);
        // Osc2: vol default=32 at offset 20 (17 + 3)
        this.writeByte(this.globalValsPtr + 20, 32);
        // Osc1: vol default=56 (carrier, louder) at offset 28 (25 + 3)
        this.writeByte(this.globalValsPtr + 28, 56);

        // Set reasonable ADSR defaults for Osc1 (carrier)
        // a=16, d=16, s=16, r=16 (moderate envelope)
        this.writeByte(this.globalValsPtr + 29, 16); // a
        this.writeByte(this.globalValsPtr + 30, 16); // d
        this.writeByte(this.globalValsPtr + 31, 16); // s
        this.writeByte(this.globalValsPtr + 32, 16); // r

        this.fm4fm2fInitialized = true;
        console.log('[BuzzmachineWorklet] 4FM2F global params initialized');
      }

      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        const midiNote = Math.round(12 * Math.log2(this.noteFrequency / 440) + 69);
        const octave = Math.floor(midiNote / 12);
        const note = midiNote % 12;
        // Buzz note format: high nibble = octave (1-9), low nibble = semitone (1-12)
        const buzzNote = ((octave) << 4) | (note + 1);

        // Set volume FIRST (offset 1)
        const vol = Math.min(0xFE, Math.max(0x40, Math.round(this.triggerVelocity)));
        this.writeByte(trackValsPtr + 1, vol);

        // Set note SECOND (offset 0) - this triggers the envelope
        this.writeByte(trackValsPtr, Math.max(1, Math.min(0xFE, buzzNote)));

        console.log('[BuzzmachineWorklet] 4FM2F triggered:', { midiNote, buzzNote: buzzNote.toString(16), volume: vol });

        this.pendingSynthNotePtr = trackValsPtr;
        this.pendingSynthType = '4FM2F';
      }
    } else {
      // Generic fallback for unknown generators
      // Try to set track param 0 as a note or trigger
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        const midiNote = Math.round(12 * Math.log2(this.noteFrequency / 440) + 69);
        const octave = Math.floor(midiNote / 12);
        const note = midiNote % 12;
        const buzzNote = ((octave) << 4) | note;
        this.writeByte(trackValsPtr, Math.max(1, Math.min(0x79, buzzNote)));
        console.log('[BuzzmachineWorklet] Generic trigger for', machineType, ':', { buzzNote, trackValsPtr });
      } else if (this.globalValsPtr) {
        // Try global params
        this.writeByte(this.globalValsPtr, 1); // Generic trigger
        console.log('[BuzzmachineWorklet] Generic global trigger for', machineType);
      }
    }

    // Call Tick to process the trigger
    if (this.buzzModule._buzz_tick) {
      this.buzzModule._buzz_tick(this.machinePtr);
      console.log('[BuzzmachineWorklet] Tick() called for', machineType);
    }

    // IMPORTANT: After Tick() processes the trigger, reset params to NoValue
    // Otherwise, subsequent Tick() calls will re-trigger the sound!
    if (this.pendingFsmKickClear) {
      // FSM Kick (non-XP): 6 params starting with volume at offset 0
      this.writeByte(this.pendingFsmKickClear, 255);     // volume
      this.writeByte(this.pendingFsmKickClear + 1, 255); // startfrq
      this.writeByte(this.pendingFsmKickClear + 2, 255); // endfrq
      this.writeByte(this.pendingFsmKickClear + 3, 255); // tdecay
      this.writeByte(this.pendingFsmKickClear + 4, 255); // tshape
      this.writeByte(this.pendingFsmKickClear + 5, 255); // adecay
      this.pendingFsmKickClear = null;
      console.log('[BuzzmachineWorklet] FSMKick params reset to NoValue after trigger');
    }

    if (this.pendingFsmKickXPClear) {
      // FSM Kick XP: 15 params, all to NoValue (255)
      for (let i = 0; i < 15; i++) {
        this.writeByte(this.pendingFsmKickXPClear + i, 255);
      }
      this.pendingFsmKickXPClear = null;
      console.log('[BuzzmachineWorklet] FSMKickXP params reset to NoValue after trigger');
    }

    if (this.pendingNoiseClear) {
      // Set all params to NoValue so they don't re-trigger
      // Attack/Sustain/Release NoValue = 0, Color NoValue = 0xFFFF, Volume NoValue = 0xFF, Trigger NoValue = 0xFF
      this.writeWord(this.pendingNoiseClear + 0, 0);       // attack = NoValue
      this.writeWord(this.pendingNoiseClear + 2, 0);       // sustain = NoValue
      this.writeWord(this.pendingNoiseClear + 4, 0);       // release = NoValue
      this.writeWord(this.pendingNoiseClear + 6, 0xFFFF);  // color = NoValue
      this.writeByte(this.pendingNoiseClear + 8, 0xFF);    // volume = NoValue
      this.writeByte(this.pendingNoiseClear + 9, 0xFF);    // trigger = NoValue (SWITCH_NO)
      this.pendingNoiseClear = null;
      console.log('[BuzzmachineWorklet] JeskolaNoise params reset to NoValue after trigger');
    }

    if (this.pendingDTMFClear) {
      // Reset DTMF params to NoValue
      this.writeByte(this.pendingDTMFClear + 0, 0xFF);  // number = NoValue
      this.writeByte(this.pendingDTMFClear + 1, 0xFF);  // sustain = NoValue
      this.writeByte(this.pendingDTMFClear + 2, 0xFF);  // twist = NoValue
      this.writeByte(this.pendingDTMFClear + 3, 0xFF);  // volume = NoValue
      this.pendingDTMFClear = null;
      console.log('[BuzzmachineWorklet] CyanPhaseDTMF params reset to NoValue after trigger');
    }

    if (this.pendingFreqBombClear) {
      // Reset FrequencyBomb params to NoValue
      this.writeWord(this.pendingFreqBombClear + 0, 0xFFFF);  // freq = NoValue
      this.writeWord(this.pendingFreqBombClear + 2, 0xFFFF);  // LFOPeriod = NoValue
      this.writeWord(this.pendingFreqBombClear + 4, 0xFFFF);  // LFOAmt = NoValue
      this.writeByte(this.pendingFreqBombClear + 6, 0xFF);    // wave = NoValue
      this.pendingFreqBombClear = null;
      console.log('[BuzzmachineWorklet] FrequencyBomb params reset to NoValue after trigger');
    }

    if (this.pendingTrilokClear) {
      // Reset Trilok trigger to SWITCH_NO (255) so it doesn't re-trigger
      this.writeByte(this.pendingTrilokClear, 255);       // bd_trigger = SWITCH_NO
      this.writeByte(this.pendingTrilokClear + 1, 255);   // bd_tone = NoValue
      this.writeByte(this.pendingTrilokClear + 2, 255);   // bd_decay = NoValue
      this.writeByte(this.pendingTrilokClear + 3, 255);   // bd_volume = NoValue
      this.pendingTrilokClear = null;
      console.log('[BuzzmachineWorklet] JeskolaTrilok params reset to NoValue after trigger');
    }

    this.triggerPending = false;
  }

  releaseGenerator() {
    if (!this.buzzModule || !this.machinePtr) return;

    const machineType = this.machineTypeName || '';
    console.log('[BuzzmachineWorklet] Releasing generator:', machineType);

    // Clear triggers for generators that need it
    if (machineType.includes('JeskolaTrilok')) {
      // Trilok: Set trigger to SWITCH_NO (255) to prevent re-triggering
      // NOTE: Setting to SWITCH_OFF (0) would RETRIGGER because Trilok checks != SWITCH_NO
      if (this.globalValsPtr) {
        this.writeByte(this.globalValsPtr, 255); // bd_trigger = SWITCH_NO (don't change)
      }
      // Call Stop to force immediate silence (drum has its own envelope, but this ensures stop)
      if (this.buzzModule._buzz_stop) {
        this.buzzModule._buzz_stop(this.machinePtr);
      }
    } else if (machineType.includes('JeskolaNoise')) {
      // Jeskola Noise: Just clear the trigger to enter release phase
      // Don't set volume to 0 - let the envelope handle the release
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        // Set trigger to "no value" (0xFF) so it doesn't re-trigger or force off
        // The machine should continue in release phase
        this.writeByte(trackValsPtr + 9, 0xFF); // trigger = no value
        console.log('[BuzzmachineWorklet] JeskolaNoise trigger cleared (0xFF)');
      }
      // Don't call buzz_stop - let envelope finish naturally
    } else if (machineType.includes('OomekAggressor')) {
      // Oomek Aggressor TB-303 gate handling:
      //
      // The Aggressor has mid-step gate timing built-in (see 303.cpp line 798):
      //   if ((pMasterInfo->PosInTick > pMasterInfo->SamplesPerTick / 2) &&
      //       (vcaphase < 1600) && (slidestate == false)) vcaphase++;
      //
      // This means:
      // - Gate drops at midpoint of step if NOT sliding
      // - If sliding (slidestate=true), gate stays HIGH through the step
      //
      // For note-off handling:
      // - Set gate LOW (aggressorGateHigh = false)
      // - The Aggressor's internal VCA will handle the release naturally
      // - Don't mute - let the envelope decay naturally

      // Track gate state
      this.aggressorGateHigh = false;

      // If we were sliding, the next note should NOT slide (previous slide flag resets)
      this.aggressorPreviousSlideFlag = false;

      // Send NOTE_OFF to the Aggressor
      // In Buzz format: NOTE_OFF is typically handled by the machine's internal state
      // The Aggressor checks slidestate to determine if gate should drop
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        // Set slide to OFF so the gate will drop on next tick
        this.writeByte(trackValsPtr + 1, 0);  // slide = OFF
        // Don't send NOTE_OFF - Aggressor doesn't have one, it uses the VCA envelope
        console.log('[BuzzmachineWorklet] OomekAggressor gate LOW, slide cleared');
      }

      // Call Tick to process the gate change
      if (this.buzzModule._buzz_tick) {
        this.buzzModule._buzz_tick(this.machinePtr);
      }
    } else if (machineType.includes('MakkM3') || machineType.includes('MadBrain')) {
      // These synths properly respond to NOTE_OFF
      // In Buzz: NOTE_NO=0 (no change), NOTE_OFF=255 (turn off), NOTE_MIN=1, NOTE_MAX=156
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        // NOTE_OFF in Buzz is 255, not 0 (0 is NOTE_NO meaning "no change")
        this.writeByte(trackValsPtr, 255); // NOTE_OFF = 255
        console.log('[BuzzmachineWorklet] Sent NOTE_OFF (255) to', machineType);
      }
      // Call Tick to process the note off
      if (this.buzzModule._buzz_tick) {
        this.buzzModule._buzz_tick(this.machinePtr);
      }
      // Then call Stop for good measure
      if (this.buzzModule._buzz_stop) {
        this.buzzModule._buzz_stop(this.machinePtr);
      }
    } else if (machineType.includes('FSMKick')) {
      // FSM Kick: Set volume to 0xFF (no value) to stop
      const trackValsPtr = this.buzzModule._buzz_get_track_vals ?
        this.buzzModule._buzz_get_track_vals(this.machinePtr, 0) : 0;
      if (trackValsPtr) {
        this.writeByte(trackValsPtr, 0xFF); // volume = no value (stops trigger)
      }
    } else if (machineType.includes('Elenzil') || machineType.includes('FrequencyBomb')) {
      // FrequencyBomb: Has no natural envelope and no Stop() function
      // It's a continuous tone generator that always returns true from Work()
      // The only way to stop it is to mute the output in the worklet
      this.muted = true;
      console.log('[BuzzmachineWorklet] FrequencyBomb muted (no natural stop)');
    } else if (machineType.includes('CyanPhase')) {
      // DTMF and other CyanPhase: Set number to no-value
      if (this.globalValsPtr) {
        this.writeByte(this.globalValsPtr, 0xFF); // number = no value
      }
    } else {
      // Generic: try buzz_stop
      if (this.buzzModule._buzz_stop) {
        this.buzzModule._buzz_stop(this.machinePtr);
      }
    }

    // Call Tick to process release
    if (this.buzzModule._buzz_tick) {
      this.buzzModule._buzz_tick(this.machinePtr);
    }
  }

  setParameter(paramIndex, value) {
    if (!this.buzzModule || !this.globalValsPtr) return;

    // GlobalVals structure varies by machine - handle each type appropriately
    const machineType = this.machineTypeName || '';

    if (machineType.includes('OomekAggressor')) {
      // Oomek Aggressor uses BYTE (8-bit) parameters for all global vals:
      // osctype(0), cutoff(1), resonance(2), envmod(3), decay(4), acclevel(5), finetune(6), volume(7)
      // Each is 1 byte, sequential from offset 0
      const offset = this.globalValsPtr + paramIndex;
      this.writeByte(offset, Math.min(0xFF, Math.max(0, Math.round(value))));
      console.log('[BuzzmachineWorklet] OomekAggressor setParameter:', { paramIndex, value, offset });
    } else {
      // Default: Most parameters are word (16-bit)
      // Offset = paramIndex * 2 bytes (word size)
      const offset = this.globalValsPtr + (paramIndex * 2);
      this.writeWord(offset, value);
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.isInitialized || !this.machinePtr || this.processingDisabled) {
      // Pass through silence
      const output = outputs[0];
      if (output[0]) output[0].fill(0);
      if (output[1]) output[1].fill(0);
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];
    const numSamples = output[0]?.length || 128;

    try {
      // Validate WASM functions exist
      if (typeof this.buzzModule._buzz_work !== 'function') {
        if (!this.workFunctionMissing) {
          console.error('[BuzzmachineWorklet] _buzz_work function not found');
          this.workFunctionMissing = true;
        }
        output[0].fill(0);
        if (output[1]) output[1].fill(0);
        return true;
      }

      // Call Tick() for EFFECTS to process parameter changes
      // NOTE: For generators, Tick() is called once in triggerGenerator() when a note is triggered.
      // Generators have their envelopes advanced in Work(), not in Tick().
      // Calling Tick() continuously for generators could cause re-triggering issues.
      if (!this.isGenerator && typeof this.buzzModule._buzz_tick === 'function') {
        this.buzzModule._buzz_tick(this.machinePtr);
      }

      // Determine work mode
      // WM_NOIO=0, WM_READ=1, WM_WRITE=2, WM_READWRITE=3
      // IMPORTANT: Generators (synths, drums) should use WM_WRITE (2), not WM_READWRITE (3)
      // Some machines (e.g., FrequencyBomb) explicitly check for mode == WM_WRITE and return false otherwise
      const hasInput = input && input[0] && input[0].length > 0;
      const workMode = this.isGenerator ? 2 : (hasInput ? 3 : 2); // Generators always use WM_WRITE

      // Get WASM memory buffer
      const wasmMemory = this.getWasmMemory();
      if (!wasmMemory) {
        // Only log once
        if (!this.noMemoryLogged) {
          console.error('[BuzzmachineWorklet] No WASM memory available');
          this.noMemoryLogged = true;
        }
        output[0].fill(0);
        if (output[1]) output[1].fill(0);
        return true;
      }

      // Check if memory grew
      if (this.wasmAudioView.buffer !== wasmMemory) {
        this.wasmAudioView = new Float32Array(wasmMemory, this.audioBufferPtr, this.bufferSize);
      }

      // Copy input to WASM buffer if present
      // Note: Buzz machines use MONO buffers - mix stereo to mono
      if (hasInput && this.audioBufferPtr) {
        const leftIn = input[0];
        const rightIn = input[1] || leftIn;

        // Mix stereo to mono
        for (let i = 0; i < numSamples; i++) {
          this.wasmAudioView[i] = (leftIn[i] + rightIn[i]) * 0.5;
        }
      }

      // Process audio
      const isActive = this.buzzModule._buzz_work(
        this.machinePtr,
        this.audioBufferPtr,
        numSamples,
        workMode
      );

      // Reset error count on successful processing
      this.errorCount = 0;

      // Copy output from WASM buffer (unless muted)
      if (isActive && this.audioBufferPtr && !this.muted) {
        const leftOut = output[0];
        const rightOut = output[1] || leftOut;

        // Copy mono to both channels with normalization
        // Buzz machines output values in short range (-32768 to 32767)
        for (let i = 0; i < numSamples; i++) {
          const sample = this.wasmAudioView[i] / 32768.0;
          // Clamp to prevent clipping artifacts
          const clamped = Math.max(-1.0, Math.min(1.0, sample));
          leftOut[i] = clamped;
          rightOut[i] = clamped;
        }
      } else {
        // Machine returned false = silence
        output[0].fill(0);
        if (output[1]) output[1].fill(0);
      }

    } catch (err) {
      // Track errors and disable processing after too many
      this.errorCount = (this.errorCount || 0) + 1;

      // Only log first few errors to prevent spam
      if (this.errorCount <= 3) {
        console.error('[BuzzmachineWorklet] Process error #' + this.errorCount + ':', err.message || err);
      }

      // Disable processing after 10 consecutive errors
      if (this.errorCount >= 10) {
        console.error('[BuzzmachineWorklet] Too many errors, disabling processing for', this.machineTypeName);
        this.processingDisabled = true;
        this.port.postMessage({ type: 'error', error: 'Processing disabled due to repeated errors' });
      }

      // Output silence on error
      output[0].fill(0);
      if (output[1]) output[1].fill(0);
    }

    return true;
  }
}

try {
  registerProcessor('buzzmachine-processor', BuzzmachineProcessor);
  console.log('[BuzzmachineWorklet] Processor registered successfully');
} catch (err) {
  console.error('[BuzzmachineWorklet] Failed to register processor:', err);
}
