/**
 * VSTBridge.worklet.js - Universal AudioWorklet Processor for WASM Synths
 *
 * A single generic worklet that loads ANY conforming WASMSynthBase module.
 * The synth-specific details (class name, module factory name) are passed
 * via processorOptions at construction time.
 *
 * Based on the proven Dexed.worklet.js pattern with parameterized parts:
 *  - Module factory name (e.g. 'createDexedModule') → processorOptions.moduleFactoryName
 *  - Synth class name (e.g. 'DexedSynth') → processorOptions.synthClassName
 *  - Extension commands routed through synth.handleCommand()
 *
 * WASM binary and JS code are received via postMessage to avoid
 * dynamic import which is not allowed in WorkletGlobalScope.
 */

// Track processor registration
let processorRegistered = false;

class VSTBridgeProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Extract synth descriptor from processorOptions
    const opts = options.processorOptions || {};
    this.synthClassName = opts.synthClassName || 'WASMSynth';
    this.moduleFactoryName = opts.moduleFactoryName || 'createModule';

    this.synth = null;
    this.isInitialized = false;
    this.pendingMessages = [];
    this.outputBufferL = null;
    this.outputBufferR = null;

    this.port.onmessage = this.handleMessage.bind(this);
  }

  async handleMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'init':
        await this.initialize(data);
        break;

      case 'noteOn':
        if (this.synth && this.isInitialized) {
          this.synth.noteOn(data.note, data.velocity || 100);
        } else {
          this.pendingMessages.push(event.data);
        }
        break;

      case 'noteOff':
        if (this.synth && this.isInitialized) {
          this.synth.noteOff(data.note);
        }
        break;

      case 'allNotesOff':
        if (this.synth && this.isInitialized) {
          this.synth.allNotesOff();
        }
        break;

      case 'parameter':
        if (this.synth && this.isInitialized) {
          this.synth.setParameter(data.paramId, data.value);
        }
        break;

      case 'controlChange':
        if (this.synth && this.isInitialized) {
          this.synth.controlChange(data.cc, data.value);
        }
        break;

      case 'pitchBend':
        if (this.synth && this.isInitialized) {
          this.synth.pitchBend(data.value);
        }
        break;

      case 'programChange':
        if (this.synth && this.isInitialized) {
          this.synth.programChange(data.program);
        }
        break;

      // Extension command — forwards arbitrary typed commands to WASM handleCommand()
      case 'command':
        if (this.synth && this.isInitialized && data.commandType) {
          try {
            if (typeof this.synth.handleCommand !== 'function') {
              this.port.postMessage({
                type: 'commandResult',
                commandType: data.commandType,
                handled: false,
              });
              break;
            }
            const cmdData = data.data ? new Uint8Array(data.data) : new Uint8Array(0);
            const handled = this.synth.handleCommand(data.commandType, cmdData);
            this.port.postMessage({
              type: 'commandResult',
              commandType: data.commandType,
              handled,
            });
          } catch (e) {
            console.error(`VSTBridge command '${data.commandType}' error:`, e);
          }
        }
        break;

      // Query parameter metadata from WASM
      case 'getParams':
        if (this.synth && this.isInitialized) {
          const params = [];
          const s = this.synth;
          if (typeof s.getParameterCount === 'function' &&
              typeof s.getParameterName === 'function' &&
              typeof s.getParameterMin === 'function' &&
              typeof s.getParameterMax === 'function' &&
              typeof s.getParameterDefault === 'function') {
            const count = s.getParameterCount();
            for (let i = 0; i < count; i++) {
              params.push({
                id: i,
                name: s.getParameterName(i),
                min: s.getParameterMin(i),
                max: s.getParameterMax(i),
                defaultValue: s.getParameterDefault(i),
              });
            }
          }
          this.port.postMessage({ type: 'params', params });
        }
        break;

      case 'dispose':
        this.cleanup();
        break;
    }
  }

  cleanup() {
    if (this.Module && this.outputPtrL) {
      this.Module._free(this.outputPtrL);
      this.outputPtrL = 0;
    }
    if (this.Module && this.outputPtrR) {
      this.Module._free(this.outputPtrR);
      this.outputPtrR = 0;
    }
    this.outputBufferL = null;
    this.outputBufferR = null;
    this.synth = null;
    this.isInitialized = false;
  }

  async initialize(data) {
    try {
      const { wasmBinary, jsCode } = data;

      if (!wasmBinary || !jsCode) {
        throw new Error('Missing wasmBinary or jsCode in init message');
      }

      // Evaluate the JS code to get the module factory
      // Try the descriptor's moduleFactoryName first, then common fallbacks
      let createModule;
      try {
        const factoryName = this.moduleFactoryName;
        const wrappedCode = `${jsCode}; return typeof ${factoryName} !== 'undefined' ? ${factoryName} : (typeof Module !== 'undefined' ? Module : null);`;
        createModule = new Function(wrappedCode)();
      } catch (evalErr) {
        console.error(`VSTBridge: Failed to evaluate JS for ${this.synthClassName}:`, evalErr);
        throw new Error(`Could not evaluate module factory '${this.moduleFactoryName}'`);
      }

      if (!createModule) {
        throw new Error(`Could not load module factory '${this.moduleFactoryName}'`);
      }

      // Intercept WebAssembly.instantiate to capture WASM memory
      let capturedMemory = null;
      const origInstantiate = WebAssembly.instantiate;
      WebAssembly.instantiate = async function (...args) {
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

      // Initialize the WASM module with the provided binary
      let Module;
      try {
        Module = await createModule({ wasmBinary });
      } finally {
        WebAssembly.instantiate = origInstantiate;
      }

      // Create synth instance using the class name from descriptor
      const SynthClass = Module[this.synthClassName];
      if (!SynthClass) {
        throw new Error(`WASM module does not export class '${this.synthClassName}'`);
      }
      this.synth = new SynthClass();
      this.synth.initialize(sampleRate);

      // Allocate output buffers in WASM memory
      const bufferSize = 128 * 4; // 128 samples * 4 bytes per float
      this.outputPtrL = Module._malloc(bufferSize);
      this.outputPtrR = Module._malloc(bufferSize);

      // Get WASM memory buffer - try multiple sources
      const wasmMem = Module.wasmMemory || capturedMemory;
      const heapBuffer = Module.HEAPF32
        ? Module.HEAPF32.buffer
        : wasmMem
          ? wasmMem.buffer
          : null;

      if (!heapBuffer) {
        throw new Error('Cannot access WASM memory buffer');
      }

      // Store the memory reference for buffer regeneration in process()
      this._wasmMemory = wasmMem;

      // Create typed array views into WASM memory
      this.outputBufferL = new Float32Array(heapBuffer, this.outputPtrL, 128);
      this.outputBufferR = new Float32Array(heapBuffer, this.outputPtrR, 128);

      this.Module = Module;
      this.isInitialized = true;

      // Process any pending messages
      for (const msg of this.pendingMessages) {
        this.handleMessage({ data: msg });
      }
      this.pendingMessages = [];

      // Notify main thread
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      console.error(`VSTBridge initialization error (${this.synthClassName}):`, error);
      this.port.postMessage({
        type: 'error',
        error: error.message,
      });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.synth || !this.isInitialized) {
      return true;
    }

    const outputL = outputs[0][0];
    const outputR = outputs[0][1] || outputs[0][0];
    const numSamples = outputL.length;

    try {
      // Process audio through WASM
      this.synth.process(this.outputPtrL, this.outputPtrR, numSamples);

      // Copy from WASM memory to output
      // Need to recreate views if WASM memory was resized
      const currentBuffer = this._wasmMemory
        ? this._wasmMemory.buffer
        : this.Module.HEAPF32
          ? this.Module.HEAPF32.buffer
          : null;
      if (currentBuffer && this.outputBufferL.buffer !== currentBuffer) {
        this.outputBufferL = new Float32Array(currentBuffer, this.outputPtrL, 128);
        this.outputBufferR = new Float32Array(currentBuffer, this.outputPtrR, 128);
      }

      outputL.set(this.outputBufferL.subarray(0, numSamples));
      outputR.set(this.outputBufferR.subarray(0, numSamples));
    } catch (error) {
      console.error(`VSTBridge process error (${this.synthClassName}):`, error);
    }

    return true;
  }
}

// Register processor only once
if (!processorRegistered) {
  registerProcessor('vstbridge-processor', VSTBridgeProcessor);
  processorRegistered = true;
}
