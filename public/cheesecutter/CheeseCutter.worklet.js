/**
 * CheeseCutter AudioWorklet — drives the 6502 CPU + reSID WASM module.
 *
 * Messages:
 *   init: { wasmBinary, jsCode, sampleRate, sidModel }
 *   load: { data (ArrayBuffer — 64KB C64 memory image) }
 *   play: { subtune, multiplier }
 *   stop: {}
 */
class CheeseCutterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.ready = false;
    this.playing = false;
    this._init = null;
    this._load = null;
    this._setMultiplier = null;
    this._playInit = null;
    this._render = null;
    this._getSidRegs = null;
    this._shutdown = null;
    this._outLPtr = 0;
    this._outRPtr = 0;
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init': {
        try {
          const factory = new Function(msg.jsCode + '; return createCheeseCutter;')();
          this.module = await factory({ wasmBinary: msg.wasmBinary });

          this._init = this.module.cwrap('cc_init', null, ['number', 'number']);
          this._load = this.module.cwrap('cc_load', 'number', ['number', 'number']);
          this._setMultiplier = this.module.cwrap('cc_set_multiplier', null, ['number']);
          this._playInit = this.module.cwrap('cc_play_init', null, ['number']);
          this._render = this.module.cwrap('cc_render', null, ['number', 'number', 'number']);
          this._getSidRegs = this.module.cwrap('cc_get_sid_regs', 'number', []);
          this._writeByte = this.module.cwrap('cc_write_byte', null, ['number', 'number']);
          this._readByte = this.module.cwrap('cc_read_byte', 'number', ['number']);
          this._getRam = this.module.cwrap('cc_get_ram', 'number', []);
          this._shutdown = this.module.cwrap('cc_shutdown', null, []);

          this._init(msg.sampleRate || 44100, msg.sidModel || 0);

          // Allocate output buffers (128 samples per channel)
          this._outLPtr = this.module._malloc(128 * 4);
          this._outRPtr = this.module._malloc(128 * 4);

          this.ready = true;
          this.port.postMessage({ type: 'ready' });
        } catch (err) {
          this.port.postMessage({ type: 'error', error: String(err) });
        }
        break;
      }

      case 'load': {
        if (!this.ready) break;
        const data = new Uint8Array(msg.data);
        const ptr = this.module._malloc(data.length);
        this.module.HEAPU8.set(data, ptr);
        this._load(ptr, data.length);
        this.module._free(ptr);
        this.port.postMessage({ type: 'loaded' });
        break;
      }

      case 'play': {
        if (!this.ready) break;
        this._setMultiplier(msg.multiplier || 1);
        this._playInit(msg.subtune || 0);
        this.playing = true;
        this.port.postMessage({ type: 'playing' });
        break;
      }

      case 'stop': {
        this.playing = false;
        this.port.postMessage({ type: 'stopped' });
        break;
      }

      case 'getSidRegs': {
        if (!this.ready) break;
        const ptr = this._getSidRegs();
        const regs = new Uint8Array(this.module.HEAPU8.buffer, ptr, 25).slice();
        this.port.postMessage({ type: 'sidRegs', regs }, [regs.buffer]);
        break;
      }

      case 'writeByte': {
        if (!this.ready) break;
        this._writeByte(msg.addr, msg.value);
        break;
      }

      case 'writeBytes': {
        if (!this.ready) break;
        for (let i = 0; i < msg.addrs.length; i++) {
          this._writeByte(msg.addrs[i], msg.values[i]);
        }
        break;
      }

      case 'readBytes': {
        if (!this.ready) break;
        const result = new Uint8Array(msg.length);
        const ramPtr = this._getRam();
        result.set(new Uint8Array(this.module.HEAPU8.buffer, ramPtr + msg.addr, msg.length));
        this.port.postMessage({ type: 'readBytes', id: msg.id, data: result }, [result.buffer]);
        break;
      }
    }
  }

  process(inputs, outputs) {
    if (!this.ready || !this.playing || !outputs[0]) return true;

    const outL = outputs[0][0];
    const outR = outputs[0][1] || outL;
    const frames = outL.length;

    this._render(this._outLPtr, this._outRPtr, frames);

    const heapF32 = this.module.HEAPF32;
    const lOff = this._outLPtr >> 2;
    const rOff = this._outRPtr >> 2;

    for (let i = 0; i < frames; i++) {
      outL[i] = heapF32[lOff + i];
      outR[i] = heapF32[rOff + i];
    }

    return true;
  }
}

registerProcessor('cheesecutter-processor', CheeseCutterProcessor);
