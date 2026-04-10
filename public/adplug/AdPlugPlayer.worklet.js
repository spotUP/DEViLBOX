/**
 * AdPlug AudioWorklet Processor
 *
 * Loads the AdPlug WASM module and renders OPL/AdLib audio in real-time.
 * Supports 50+ OPL music formats via the AdPlug library.
 */

class AdPlugPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.initialized = false;
    this.playing = false;
    this.renderBuffer = null;
    this.renderBufferSize = 0;
    this.positionReportCounter = 0;
    this.lastReportedOrder = -1;
    this.lastReportedRow = -1;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        await this.initModule(msg.sampleRate, msg.wasmBinary, msg.jsCode);
        break;
      case 'load':
        this.loadFile(msg.data, msg.filename, msg.companions, msg.autoPlay !== false);
        break;
      case 'play':
        if (this.gain !== undefined) this.gain = 1;
        this.playing = true;
        break;
      case 'stop':
        this.playing = false;
        break;
      case 'rewind':
        if (this.module) {
          this.module._adplug_rewind(msg.subsong || 0);
          this.playing = true;
        }
        break;
    }
  }

  async initModule(sampleRate, wasmBinary, jsCode) {
    try {
      const createModule = new Function(jsCode + '\nreturn createAdPlugPlayer;')();

      this.module = await createModule({
        wasmBinary: wasmBinary,
        print: () => {},
        printErr: () => {},
      });

      const result = this.module._adplug_init(sampleRate);
      if (result === 0) {
        this.initialized = true;
        // Pre-allocate render buffer: 128 stereo S16 samples = 512 bytes
        this.renderBufferSize = 128;
        this.renderBuffer = this.module._malloc(this.renderBufferSize * 2 * 2);
        this.port.postMessage({ type: 'initialized' });
      } else {
        this.port.postMessage({ type: 'error', error: 'Failed to initialize AdPlug' });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }

  loadFile(data, filename, companions, autoPlay) {
    if (!this.initialized) {
      this.port.postMessage({ type: 'error', error: 'Not initialized' });
      return;
    }

    try {
      // Helper: encode string to Uint8Array (AudioWorklet has no TextEncoder)
      function strToBytes(str) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
        return bytes;
      }

      // Add companion files first (e.g. patch.003 for SCI)
      if (companions && companions.length > 0) {
        for (const comp of companions) {
          const cPtr = this.module._adplug_alloc(comp.data.length);
          this.module.HEAPU8.set(comp.data, cPtr);
          const cnBytes = strToBytes(comp.name + '\0');
          const cnPtr = this.module._malloc(cnBytes.length);
          this.module.HEAPU8.set(cnBytes, cnPtr);
          this.module._adplug_add_companion(cPtr, comp.data.length, cnPtr);
          this.module._free(cnPtr);
          this.module._adplug_free(cPtr);
        }
      }

      const ptr = this.module._adplug_alloc(data.length);
      this.module.HEAPU8.set(data, ptr);

      // Pass filename as C string
      const fnBytes = strToBytes(filename + '\0');
      const fnPtr = this.module._malloc(fnBytes.length);
      this.module.HEAPU8.set(fnBytes, fnPtr);

      const result = this.module._adplug_load(ptr, data.length, fnPtr);

      this.module._free(fnPtr);
      this.module._adplug_free(ptr);

      if (result === 0) {
        this.playing = autoPlay;

        // Read metadata
        const titlePtr = this.module._adplug_get_title();
        const typePtr = this.module._adplug_get_type();
        const title = this.module.UTF8ToString(titlePtr);
        const type = this.module.UTF8ToString(typePtr);
        const subsongs = this.module._adplug_get_subsongs();
        const numInst = this.module._adplug_get_num_instruments();

        const instruments = [];
        for (let i = 0; i < Math.min(numInst, 64); i++) {
          const namePtr = this.module._adplug_get_instrument_name(i);
          instruments.push(this.module.UTF8ToString(namePtr));
        }

        this.port.postMessage({
          type: 'loaded',
          title,
          formatType: type,
          subsongs,
          instruments,
        });
      } else {
        this.playing = false;
        this.port.postMessage({ type: 'error', error: 'AdPlug failed to load file' });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', error: error.message });
    }
  }

  process(inputs, outputs) {
    if (!this.initialized || !this.playing || !this.renderBuffer) {
      return true;
    }

    const output = outputs[0];
    const numFrames = output[0].length; // Usually 128

    // Render S16 stereo into WASM heap
    const result = this.module._adplug_render(this.renderBuffer, numFrames);

    // Convert S16 interleaved to float separate channels
    const heap16 = this.module.HEAP16;
    const baseIdx = this.renderBuffer >> 1; // byte offset to int16 index

    const left = output[0];
    const right = output[1] || output[0];

    for (let i = 0; i < numFrames; i++) {
      left[i] = heap16[baseIdx + i * 2] / 32768.0;
      right[i] = heap16[baseIdx + i * 2 + 1] / 32768.0;
    }

    // Report position ~15 times per second (48000/128 = 375 callbacks/sec, 375/25 = 15)
    if (++this.positionReportCounter >= 25) {
      this.positionReportCounter = 0;
      const order = this.module._adplug_get_position();
      const row = this.module._adplug_get_row();
      if (order !== this.lastReportedOrder || row !== this.lastReportedRow) {
        this.lastReportedOrder = order;
        this.lastReportedRow = row;
        this.port.postMessage({ type: 'position', order, row });
      }
    }

    if (result === 0) {
      this.playing = false;
      this.port.postMessage({ type: 'ended' });
    }

    return true;
  }
}

registerProcessor('adplug-player-processor', AdPlugPlayerProcessor);
