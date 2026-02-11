/**
 * DB303 AudioWorklet Processor
 * TB-303 Bass Synthesizer for DEViLBOX
 *
 * IMPORTANT: AudioWorklets don't support dynamic import().
 * The WASM module JS is passed as a string and executed via Function constructor.
 */

// Performance: Disable note event logging (causes severe slowdown if true)
const DEBUG_NOTE_EVENTS = true;

class DB303Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.module = null;
    this.outputPtrL = 0;
    this.outputPtrR = 0;
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.initialized = false;
    this.bufferSize = 128;
    this.lastHeapBuffer = null;
    this.currentNote = -1; // Track currently held note for slide logic
    this.pendingMessages = []; // Queue messages received before WASM init completes
    this.initializing = false;
    this.eventQueue = []; // Queue for sample-accurate events
    
    // Parameter smoothing for glitch-sensitive params (delay time, etc.)
    // Rate is per audio block (~128 samples = 2.9ms at 44.1kHz)
    // Higher rate = faster response, lower rate = smoother
    // delayTime needs VERY slow smoothing to avoid tape-warble/garbage artifacts
    this.smoothedParams = {
      delayTime: { current: 0.3, target: 0.3, rate: 0.002 },  // VERY slow - delay time changes cause glitches
      // cutoff NOT smoothed — WASM engine has internal smoothing; JS smoothing
      // on top makes sweeps sluggish vs original db303.pages.dev
    };
    
    console.log('[DB303 Worklet] v1.3.2 (FilterSelect Validation)');

    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }
  
  // Update smoothed parameters - called each process() block
  updateSmoothedParams() {
    if (!this.synth) return;
    
    for (const [paramId, state] of Object.entries(this.smoothedParams)) {
      if (state.current !== state.target) {
        const diff = state.target - state.current;
        if (Math.abs(diff) < 0.0001) {
          state.current = state.target;
        } else {
          state.current += diff * state.rate;
        }
        // Apply the smoothed value to WASM
        const setterName = 'set' + paramId.charAt(0).toUpperCase() + paramId.slice(1);
        if (typeof this.synth[setterName] === 'function') {
          this.synth[setterName](state.current);
        }
      }
    }
  }

  async handleMessage(data) {
    // Queue non-init messages while WASM is still loading
    if (data.type !== 'init' && data.type !== 'dispose' && !this.synth && this.initializing) {
      if (data.type === 'setParameter') {
        this.pendingMessages.push(data);
      }
      return;
    }

    switch (data.type) {
      case 'init':
        await this.initSynth(data.sampleRate, data.wasmBinary, data.jsCode);
        break;
      case 'noteOn':
        // Real TB-303 behavior: new note trigger cancels any pending gate-off
        // This ensures the sequencer's note always takes priority
        this.eventQueue = this.eventQueue.filter(e => e.type !== 'gateOff');
        if (data.time !== undefined) {
          this.eventQueue.push(data);
          this.eventQueue.sort((a, b) => a.time - b.time);
        } else {
          this.processEvent(data);
        }
        break;
      case 'noteOff':
      case 'gateOff':
        // Queue for sample-accurate timing (authentic 303 sequencer behavior)
        if (data.time !== undefined) {
          this.eventQueue.push(data);
          this.eventQueue.sort((a, b) => a.time - b.time);
        } else {
          this.processEvent(data);
        }
        break;
      case 'allNotesOff':
        if (this.synth) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] ALL NOTES OFF');
          this.synth.allNotesOff();
          this.currentNote = -1;
          this.eventQueue = [];
        }
        break;
      case 'setParameter':
        if (this.synth) {
          // Convert string to number
          const numericValue = parseFloat(data.value);
          
          // Try BOTH approaches:
          // 1. Named setters (setCutoff, etc.)
          // 2. Numeric setParameter(id, value) if it exists
          
          // Numeric parameter IDs (from JUCE source)
          const paramIdMap = {
            cutoff: 2,
            resonance: 3,
            envMod: 4,
            decay: 5,
            accent: 6,
            volume: 7,
            waveform: 0,
            tuning: 1
          };
          
          // Try numeric setParameter first (if it exists)
          const numericId = paramIdMap[data.paramId];
          if (numericId !== undefined && typeof this.synth.setParameter === 'function') {
            try {
              this.synth.setParameter(numericId, numericValue);
            } catch (e) {
              // setParameter not supported, will use named setters below
            }
          }
          
          // Also try named setter
          const setterMap = {
            // Core 303 Parameters
            cutoff: 'setCutoff',
            resonance: 'setResonance',
            envMod: 'setEnvMod',
            decay: 'setDecay',
            accent: 'setAccent',
            volume: 'setVolume',
            waveform: 'setWaveform',
            tuning: 'setTuning',
            // Oscillator
            pulseWidth: 'setPulseWidth',
            subOscGain: 'setSubOscGain',
            subOscBlend: 'setSubOscBlend',
            pitchToPw: 'setPitchToPw',
            // Alternative name formats
            cutoffHz: 'setCutoffHz',
            envModPercent: 'setEnvModPercent',
            // DevilFish mods - Envelope
            slideTime: 'setSlideTime',
            normalDecay: 'setNormalDecay',
            accentDecay: 'setAccentDecay',
            softAttack: 'setSoftAttack',
            normalAttack: 'setSoftAttack', // Alias
            accentSoftAttack: 'setAccentSoftAttack',
            accentAttack: 'setAccentSoftAttack', // Alias
            ampSustain: 'setAmpSustain',
            ampDecay: 'setAmpDecay',
            ampRelease: 'setAmpRelease',
            // DevilFish mods - Filter
            filterTracking: 'setFilterTracking',
            filterInputDrive: 'setFilterInputDrive',
            passbandCompensation: 'setPassbandCompensation',
            resTracking: 'setResTracking',
            filterSelect: 'setFilterSelect',
            lpBpMix: 'setLpBpMix',
            // DevilFish mods - Korg-style filter params
            diodeCharacter: 'setDiodeCharacter',
            duffingAmount: 'setDuffingAmount',
            filterFmDepth: 'setFilterFmDepth',
            stageNLAmount: 'setStageNLAmount',
            korgWarmth: 'setKorgWarmth',
            korgStiffness: 'setKorgStiffness',
            korgFilterFm: 'setKorgFilterFm',
            korgIbiasScale: 'setKorgIbiasScale',
            // LFO Parameters
            lfoWaveform: 'setLfoWaveform',
            lfoRate: 'setLfoRate',
            lfoContour: 'setLfoContour',
            lfoPitchDepth: 'setLfoPitchDepth',
            lfoPwmDepth: 'setLfoPwmDepth',
            lfoFilterDepth: 'setLfoFilterDepth',
            lfoStiffDepth: 'setLfoStiffDepth',
            // Effects - Chorus
            chorusMode: 'setChorusMode',
            chorusMix: 'setChorusMix',
            // Effects - Phaser (both naming conventions)
            phaserRate: 'setPhaserLfoRate',
            phaserLfoRate: 'setPhaserLfoRate',  // Alias from TypeScript
            phaserWidth: 'setPhaserLfoWidth',
            phaserLfoWidth: 'setPhaserLfoWidth',  // Alias from TypeScript
            phaserFeedback: 'setPhaserFeedback',
            phaserMix: 'setPhaserMix',
            // Effects - Delay
            delayTime: 'setDelayTime',
            delayFeedback: 'setDelayFeedback',
            delayTone: 'setDelayTone',
            delayMix: 'setDelayMix',
            delaySpread: 'setDelaySpread',
            // Misc
            ensembleAmount: 'setEnsembleAmount',
            oversamplingOrder: 'setOversamplingOrder',
          };
          
          let setterName = setterMap[data.paramId];
          if (!setterName) {
            console.warn('[DB303] Unknown parameter:', data.paramId);
            break;
          }
          
          if (typeof this.synth[setterName] === 'function') {
            // CRITICAL: Convert to number - values come as strings via postMessage
            let numericValue = parseFloat(data.value);
            
            // Safety check: Clamp filterSelect to valid range (0-5)
            if (data.paramId === 'filterSelect') {
              if (numericValue > 5 || numericValue < 0) {
                console.warn('[DB303] Invalid filterSelect:', numericValue, '- clamping to 0');
                numericValue = 0;
              }
            }
            
            // Debug waveform specifically
            if (data.paramId === 'waveform') {
              console.log('[DB303] Setting waveform via', setterName, '=', numericValue);
              // ALSO try setParameter fallback since setWaveform may not work
              if (typeof this.synth.setParameter === 'function') {
                this.synth.setParameter(0, numericValue);
                console.log('[DB303] Also calling setParameter(0, ' + numericValue + ') for waveform');
              }
              // Try getting waveform back to verify
              if (typeof this.synth.getParameter === 'function') {
                const readBack = this.synth.getParameter(0);
                console.log('[DB303] Waveform readback:', readBack);
              }
            }
            
            // Use smoothing for glitch-sensitive parameters
            if (this.smoothedParams[data.paramId]) {
              this.smoothedParams[data.paramId].target = numericValue;
              // Don't set directly - updateSmoothedParams will ramp to target
            } else {
              this.synth[setterName](numericValue);
            }
          } else {
            // Fallback: try numeric setParameter for known parameter IDs
            const paramIdMap = {
              waveform: 0,
              tuning: 1,
              cutoff: 2,
              resonance: 3,
              envMod: 4,
              decay: 5,
              accent: 6,
              volume: 7
            };
            const numericId = paramIdMap[data.paramId];
            if (numericId !== undefined && typeof this.synth.setParameter === 'function') {
              const numericValue = parseFloat(data.value);
              this.synth.setParameter(numericId, numericValue);
              console.log('[DB303] Fallback setParameter(' + numericId + ', ' + numericValue + ') for ' + data.paramId);
            } else {
              // Special case: waveform might need different method name
              if (data.paramId === 'waveform') {
                console.warn('[DB303] Waveform: setWaveform not found, trying alternatives...');
                const alts = ['setOscWaveform', 'setWaveForm', 'setOscillatorWaveform'];
                for (const alt of alts) {
                  if (typeof this.synth[alt] === 'function') {
                    this.synth[alt](parseFloat(data.value));
                    console.log('[DB303] Found waveform method:', alt);
                    break;
                  }
                }
              }
              console.warn('[DB303] Method not found:', setterName, '(and no setParameter fallback)');
            }
          }
        }
        break;
      case 'controlChange':
        if (this.synth) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;
      case 'pitchBend':
        if (this.synth) {
          this.synth.pitchBend(data.value);
        }
        break;
      case 'programChange':
        if (this.synth) {
          this.synth.programChange(data.program);
        }
        break;
      case 'getDiagnostics':
        if (this.synth) {
          try {
            var peak = 0;
            if (this.outputBufferL) {
              for (var di = 0; di < this.bufferSize; di++) {
                var abs = Math.abs(this.outputBufferL[di] || 0);
                if (abs > peak) peak = abs;
              }
            }
            this.port.postMessage({
              type: 'diagnostics',
              cutoff: this.synth.getParameter(2),
              resonance: this.synth.getParameter(3),
              envMod: this.synth.getParameter(4),
              decay: this.synth.getParameter(5),
              accent: this.synth.getParameter(6),
              waveform: this.synth.getParameter(0),
              volume: this.synth.getParameter(7),
              peakAmplitude: peak,
              currentNote: this.currentNote,
              initialized: this.initialized
            });
          } catch (e) {
            this.port.postMessage({ type: 'diagnostics', error: e.message });
          }
        } else {
          this.port.postMessage({ type: 'diagnostics', error: 'synth not initialized', initialized: this.initialized, initializing: this.initializing });
        }
        break;
      case 'dispose':
        this.cleanup();
        break;
    }
  }

  processEvent(data) {
    if (!this.synth) return;

    switch (data.type) {
      case 'noteOn':
        if (!data.slide && this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] TRIGGER: allNotesOff() then noteOn(' + data.note + ') vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
          // Use allNotesOff instead of noteOff(currentNote) to clear orphan notes
          // left in the WASM noteList by slides. During slides, noteOn is called
          // without noteOff, so previous notes accumulate. If we only noteOff the
          // currentNote, slide-source notes remain orphaned and degrade audio output.
          this.synth.allNotesOff();
        } else if (data.slide && this.currentNote >= 0) {
          // FIX: Skip noteOn entirely for same-pitch slides
          // When sliding to the same pitch, just sustain the note without any WASM call.
          // This prevents artifacts from calling noteOn for an already-playing note.
          if (data.note === this.currentNote) {
            if (DEBUG_NOTE_EVENTS) console.log('[DB303] SAME-PITCH SLIDE: sustaining note ' + this.currentNote + ' (no WASM call) at ' + currentTime.toFixed(3));
            // Gate stays high, pitch stays same, no action needed
            return;
          }
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] SLIDE: noteOn(' + data.note + ') over held note ' + this.currentNote + ' vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
        } else {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] FIRST NOTE: noteOn(' + data.note + ') vel=' + data.velocity + ' at ' + currentTime.toFixed(3));
        }
        this.synth.noteOn(data.note, data.velocity);
        this.currentNote = data.note;
        break;
      case 'noteOff':
        if (data.note > 0 && data.note === this.currentNote) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] RELEASE: noteOff(' + data.note + ') at ' + currentTime.toFixed(3));
          this.synth.noteOff(data.note);
          this.currentNote = -1;
        }
        break;
      case 'gateOff':
        // Use allNotesOff to clear the entire noteList - during slides, multiple notes
        // accumulate in the WASM noteList, so we need to clear them all
        if (this.currentNote >= 0) {
          if (DEBUG_NOTE_EVENTS) console.log('[DB303] GATE OFF: allNotesOff() at ' + currentTime.toFixed(3));
          this.synth.allNotesOff();
          this.currentNote = -1;
        }
        break;
    }
  }

  async initSynth(sampleRate, wasmBinary, jsCode) {
    this.initializing = true;
    try {
      // Cleanup any existing allocation
      this.cleanup();

      // Load JS module via Function constructor (dynamic import not allowed in worklets)
      if (jsCode && !globalThis.DB303) {
        console.log('[DB303 Worklet] Loading JS module...');

        // Polyfills for DOM objects that Emscripten expects
        if (typeof globalThis.document === 'undefined') {
          globalThis.document = {
            createElement: () => ({
              relList: { supports: () => false },
              tagName: 'DIV',
              rel: '',
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

        // Polyfill MutationObserver
        if (typeof globalThis.MutationObserver === 'undefined') {
          globalThis.MutationObserver = class MutationObserver {
            constructor() {}
            observe() {}
            disconnect() {}
          };
        }

        // Polyfill DOMParser
        if (typeof globalThis.DOMParser === 'undefined') {
          globalThis.DOMParser = class DOMParser {
            parseFromString() {
              return { querySelector: () => null, querySelectorAll: () => [] };
            }
          };
        }

        // Polyfill URL if not available in AudioWorklet scope
        if (typeof globalThis.URL === 'undefined') {
          globalThis.URL = class URL {
            constructor(path) { this.href = path; }
          };
        }

        // The Emscripten module defines createDB303Module, aliased to DB303
        const wrappedCode = jsCode + '\nreturn DB303;';
        const factory = new Function(wrappedCode);
        const result = factory();

        if (typeof result === 'function') {
          globalThis.DB303 = result;
          console.log('[DB303 Worklet] ✓ JS module loaded');
        } else {
          console.error('[DB303 Worklet] Unexpected result type:', typeof result);
          this.port.postMessage({ type: 'error', message: 'Failed to load JS module' });
          return;
        }
      }

      if (typeof globalThis.DB303 !== 'function') {
        console.error('[DB303 Worklet] DB303 factory not available');
        this.port.postMessage({ type: 'error', message: 'DB303 factory not available' });
        return;
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      // (Emscripten may not export HEAPF32/wasmMemory on Module)
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

      // Initialize WASM module
      const config = {};
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      try {
        this.module = await globalThis.DB303(config);
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Store captured memory for buffer access
      if (!this.module.wasmMemory && capturedMemory) {
        this.module.wasmMemory = capturedMemory;
      }
      console.log('[DB303 Worklet] WASM loaded');

      // Create synth engine instance - db303 WASM exports DB303Engine class
      if (this.module.DB303Engine) {
        this.synth = new this.module.DB303Engine(Math.floor(sampleRate));
        console.log('[DB303 Worklet] Created DB303Engine at', sampleRate, 'Hz');
        
        // Log all available methods for debugging
        const methods = [];
        for (const key in this.synth) {
          if (typeof this.synth[key] === 'function') {
            methods.push(key);
          }
        }
        console.log('[DB303 Worklet] Available methods:', methods.join(', '));
        
        // Ensure filter is enabled
        if (typeof this.synth.setFilterSelect === 'function') {
          this.synth.setFilterSelect(0);
        }
        
        // DB303Engine/DB303Synth are Emscripten classes - methods are on the object directly
        // No need to wrap, just use them as-is
      } else if (this.module.DB303Synth) {
        // Fallback for older WASM builds
        this.synth = new this.module.DB303Synth();
        this.synth.initialize(sampleRate);
        console.log('[DB303 Worklet] Created DB303Synth');
      } else if (this.module._initSynth) {
        // Alternative API: direct function calls (C-style, not class-based)
        this.module._initSynth(sampleRate);
        // Create wrapper object for C-style functions
        this.synth = {
          noteOn: (note, vel) => this.module._noteOn(note, vel),
          noteOff: (note) => this.module._noteOff(note),
          allNotesOff: () => this.module._allNotesOff && this.module._allNotesOff(),
          setParameter: (id, val) => this.module._setParameter && this.module._setParameter(id, val),
          controlChange: (cc, val) => this.module._controlChange && this.module._controlChange(cc, val),
          pitchBend: (val) => this.module._pitchBend && this.module._pitchBend(val),
          programChange: (prog) => this.module._programChange && this.module._programChange(prog),
          process: (ptrL, ptrR, n) => this.module._render ? this.module._render(ptrL, ptrR, n) : this.module._process && this.module._process(ptrL, ptrR, n)
        };
      } else {
        throw new Error('No DB303 WASM interface found');
      }

      // Allocate output buffers in WASM memory (4 bytes per float)
      const malloc = this.module._malloc || this.module.malloc;
      if (malloc) {
        this.outputPtrL = malloc(this.bufferSize * 4);
        this.outputPtrR = malloc(this.bufferSize * 4);
      }

      // Create typed array views
      this.updateBufferViews();

      this.initialized = true;
      this.initializing = false;

      // Replay queued parameter messages that arrived during WASM init
      if (this.pendingMessages.length > 0) {
        console.log('[DB303 Worklet] Replaying ' + this.pendingMessages.length + ' queued parameter messages');
        // Deduplicate: keep only the last value for each paramId
        const paramMap = new Map();
        for (const msg of this.pendingMessages) {
          paramMap.set(msg.paramId, msg.value);
        }
        for (const [paramId, value] of paramMap) {
          // Use named setters (e.g., 'cutoff' -> 'setCutoff')
          if (typeof paramId === 'string') {
            const setterName = 'set' + paramId.charAt(0).toUpperCase() + paramId.slice(1);
            if (typeof this.synth[setterName] === 'function') {
              this.synth[setterName](value);
            }
          }
        }
        this.pendingMessages = [];
      }

      this.port.postMessage({ type: 'ready' });
      console.log('[DB303 Worklet] ✓ Ready');
    } catch (error) {
      this.initializing = false;
      console.error('[DB303 Worklet] Init error:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  updateBufferViews() {
    if (!this.module || !this.outputPtrL) return;

    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return;

    // Check if WASM memory has grown (buffer changed)
    if (this.lastHeapBuffer !== heapF32.buffer) {
      this.outputBufferL = new Float32Array(heapF32.buffer, this.outputPtrL, this.bufferSize);
      this.outputBufferR = new Float32Array(heapF32.buffer, this.outputPtrR, this.bufferSize);
      this.lastHeapBuffer = heapF32.buffer;
    }
  }

  cleanup() {
    const free = this.module?._free || this.module?.free;
    if (free && this.outputPtrL) {
      free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (free && this.outputPtrR) {
      free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
    this.initialized = false;
    this.lastHeapBuffer = null;
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized || !this.synth) {
      return true;
    }
    
    // Update smoothed parameters for glitch-free ramping
    this.updateSmoothedParams();

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const outputL = output[0];
    const outputR = output[1] || output[0];
    const blockLength = outputL.length;
    const numSamples = Math.min(blockLength, this.bufferSize);

    // Get HEAPF32 for reading output
    const heapF32 = this.module.HEAPF32 || (this.module.wasmMemory && new Float32Array(this.module.wasmMemory.buffer));
    if (!heapF32) return true;

    // Sample-accurate event processing (authentic TB-303 sequencer timing)
    const sampleTime = 1.0 / sampleRate;
    let processedSamples = 0;

    while (processedSamples < numSamples) {
      // Find the next event within this audio block
      let nextEvent = null;
      const blockEndTime = currentTime + numSamples * sampleTime;
      
      if (this.eventQueue.length > 0 && this.eventQueue[0].time <= blockEndTime) {
        nextEvent = this.eventQueue[0];
      }

      let samplesToProcess;
      if (nextEvent) {
        // Calculate samples to render before the event
        const eventSampleOffset = Math.max(0, (nextEvent.time - currentTime) / sampleTime - processedSamples);
        samplesToProcess = Math.min(numSamples - processedSamples, Math.floor(eventSampleOffset));
      } else {
        samplesToProcess = numSamples - processedSamples;
      }

      // Render audio sub-block
      if (samplesToProcess > 0) {
        if (typeof this.synth.process === 'function' && typeof this.synth.getOutputBufferPtr === 'function') {
          this.synth.process(samplesToProcess);
          const outputPtr = this.synth.getOutputBufferPtr();
          const ptrIndex = outputPtr >> 2;
          
          for (let i = 0; i < samplesToProcess; i++) {
            outputL[processedSamples + i] = heapF32[ptrIndex + i * 2];
            outputR[processedSamples + i] = heapF32[ptrIndex + i * 2 + 1];
          }
        } else {
          this.updateBufferViews();
          if (this.outputBufferL && this.outputBufferR) {
            this.synth.process(this.outputPtrL, this.outputPtrR, samplesToProcess);
            for (let i = 0; i < samplesToProcess; i++) {
              outputL[processedSamples + i] = this.outputBufferL[i];
              outputR[processedSamples + i] = this.outputBufferR[i];
            }
          }
        }
        processedSamples += samplesToProcess;
      }

      // Process the event if we've reached it
      if (nextEvent && this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        this.processEvent(event);
      } else if (!nextEvent) {
        break; // No more events, done with this block
      }
    }

    return true;
  }
}

registerProcessor('db303-processor', DB303Processor);
