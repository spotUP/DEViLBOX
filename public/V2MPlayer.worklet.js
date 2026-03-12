/**
 * V2MPlayer AudioWorklet Processor
 * 
 * Loads the V2MPlayer WASM module and renders V2M audio in real-time.
 */

class V2MPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this.playing = false;
    this.renderBuffer = null;
    
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }
  
  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this.initModule(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'load':
        this.loadV2M(msg.data);
        break;
      case 'play':
        this.play(msg.timeMs || 0);
        break;
      case 'stop':
        this.stop(msg.fadeMs || 0);
        break;
      case 'seek':
        this.seek(msg.timeMs);
        break;
    }
  }
  
  async initModule(sampleRate, wasmBinary, jsCode) {
    try {
      // Execute the Emscripten module code
      // The JS is "var createV2MPlayer=..." so we append the return statement
      const createModule = new Function(jsCode + '\nreturn createV2MPlayer;')();
      
      this.module = await createModule({
        wasmBinary: wasmBinary,
        print: (text) => console.log('[V2M]', text),
        printErr: (text) => console.error('[V2M]', text),
      });
      
      // Initialize the V2M player
      const result = this.module._v2m_init(sampleRate);
      
      if (result === 0) {
        this.initialized = true;
        // Pre-allocate render buffer for 128 stereo samples
        this.renderBuffer = this.module._malloc(128 * 2 * 4);
        this.port.postMessage({ type: 'initialized' });
      } else {
        this.port.postMessage({ type: 'error', error: 'Failed to initialize V2M player' });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }
  
  loadV2M(data) {
    if (!this.initialized) {
      this.port.postMessage({ type: 'error', error: 'Not initialized' });
      return;
    }
    
    try {
      // Allocate memory for the V2M data
      const ptr = this.module._v2m_alloc(data.length);
      
      // Copy data to WASM memory
      this.module.HEAPU8.set(data, ptr);
      
      // Load the file
      const result = this.module._v2m_load(ptr, data.length);
      
      // Free the input buffer
      this.module._v2m_free(ptr);
      
      if (result === 0) {
        const length = this.module._v2m_get_length();
        this.port.postMessage({ type: 'loaded', lengthSeconds: length });
      } else {
        this.port.postMessage({ type: 'error', error: 'Failed to load V2M file' });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }
  
  play(timeMs) {
    if (!this.initialized) return;
    this.module._v2m_play(timeMs);
    this.playing = true;
    this.port.postMessage({ type: 'playing' });
  }
  
  stop(fadeMs) {
    if (!this.initialized) return;
    this.module._v2m_stop(fadeMs);
    this.playing = false;
    this.port.postMessage({ type: 'stopped' });
  }
  
  seek(timeMs) {
    if (!this.initialized) return;
    // V2M doesn't have direct seek - we reopen and play from position
    this.module._v2m_play(timeMs);
    this.playing = true;
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    
    const left = output[0];
    const right = output[1] || output[0];
    const numSamples = left.length;
    
    if (!this.initialized || !this.playing) {
      // Fill with silence
      left.fill(0);
      right.fill(0);
      return true;
    }
    
    // Render audio
    const stillPlaying = this.module._v2m_render(this.renderBuffer, numSamples);
    
    // Copy from WASM buffer to output (interleaved stereo F32)
    const heapF32 = this.module.HEAPF32;
    const offset = this.renderBuffer / 4; // F32 offset
    
    for (let i = 0; i < numSamples; i++) {
      left[i] = heapF32[offset + i * 2];
      right[i] = heapF32[offset + i * 2 + 1];
    }
    
    // Check if playback finished
    if (!stillPlaying) {
      this.playing = false;
      this.port.postMessage({ type: 'finished' });
    }
    
    return true;
  }
}

registerProcessor('v2m-player-processor', V2MPlayerProcessor);
