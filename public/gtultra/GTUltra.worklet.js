/**
 * GTUltra AudioWorklet processor
 * Runs the GoatTracker engine at audio rate, renders SID audio via reSID WASM
 */

class GTUltraProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.ready = false;
    this.playing = false;
    this.posCounter = 0;

    // Wrapped WASM functions
    this._init = null;
    this._render = null;
    this._play = null;
    this._stop = null;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init': {
        try {
          // Evaluate preprocessed Emscripten JS in worklet scope
          const factory = new Function(msg.jsCode + '\nreturn createGTUltra;')();
          this.module = await factory({ wasmBinary: msg.wasmBinary });

          // Wrap functions
          this._init = this.module.cwrap('gt_init', null, ['number', 'number']);
          this._render = this.module.cwrap('gt_render_audio', null, ['number', 'number', 'number']);
          this._play = this.module.cwrap('gt_play', null, ['number', 'number', 'number']);
          this._stop = this.module.cwrap('gt_stop', null, []);
          this._shutdown = this.module.cwrap('gt_shutdown', null, []);
          this._loadSng = this.module.cwrap('gt_load_sng', 'number', ['number', 'number']);
          this._isPlaying = this.module.cwrap('gt_is_playing', 'number', []);
          this._getCurrentRow = this.module.cwrap('gt_get_current_row', 'number', []);
          this._getCurrentPos = this.module.cwrap('gt_get_current_pos', 'number', []);
          this._newSong = this.module.cwrap('gt_new_song', null, []);
          this._enableAsid = this.module.cwrap('gt_enable_asid', null, ['number']);
          this._setSidModel = this.module.cwrap('gt_set_sid_model', null, ['number']);
          this._setSidCount = this.module.cwrap('gt_set_sid_count', null, ['number']);
          this._jamNoteOn = this.module.cwrap('gt_jam_note_on', null, ['number', 'number', 'number']);
          this._jamNoteOff = this.module.cwrap('gt_jam_note_off', null, ['number']);

          // Initialize with sample rate and SID model (0=6581, 1=8580)
          this._init(sampleRate, msg.sidModel || 0);

          // Allocate persistent render buffers (128 frames * 4 bytes per float)
          this._ptrL = this.module._malloc(128 * 4);
          this._ptrR = this.module._malloc(128 * 4);

          this.ready = true;
          this.port.postMessage({ type: 'ready' });
        } catch (err) {
          this.port.postMessage({ type: 'error', error: err.message || String(err) });
        }
        break;
      }

      case 'loadSng': {
        if (!this.ready) return;
        const data = new Uint8Array(msg.data);
        const ptr = this.module._malloc(data.length);
        this.module.HEAPU8.set(data, ptr);
        const ok = this._loadSng(ptr, data.length);
        this.module._free(ptr);
        this.port.postMessage({ type: 'songLoaded', ok: ok !== 0 });
        break;
      }

      case 'newSong': {
        if (!this.ready) return;
        this._newSong();
        this.port.postMessage({ type: 'songCleared' });
        break;
      }

      case 'play': {
        if (!this.ready) return;
        this._play(msg.songNum || 0, msg.fromPos || 0, msg.fromRow || 0);
        this.playing = true;
        break;
      }

      case 'stop': {
        if (!this.ready) return;
        this._stop();
        this.playing = false;
        break;
      }

      case 'jamNoteOn': {
        if (!this.ready) return;
        this._jamNoteOn(msg.channel, msg.note, msg.instrument);
        break;
      }

      case 'jamNoteOff': {
        if (!this.ready) return;
        this._jamNoteOff(msg.channel);
        break;
      }

      case 'setSidModel': {
        if (!this.ready) return;
        this._setSidModel(msg.model);
        break;
      }

      case 'setSidCount': {
        if (!this.ready) return;
        this._setSidCount(msg.count);
        break;
      }

      case 'enableAsid': {
        if (!this.ready) return;
        this._enableAsid(msg.enabled ? 1 : 0);
        if (msg.enabled) {
          this.module._asidCallback = (chip, reg, value) => {
            this.port.postMessage({ type: 'asid', chip, reg, value });
          };
        } else {
          this.module._asidCallback = null;
        }
        break;
      }

      default:
        break;
    }
  }

  process(inputs, outputs) {
    if (!this.ready || !this.playing) return true;

    const outL = outputs[0][0];
    const outR = outputs[0][1] || outL;
    const frames = outL.length; // typically 128

    // Render audio into pre-allocated WASM buffers
    this._render(this._ptrL, this._ptrR, frames);

    // Copy from WASM heap to output
    const heapF32 = new Float32Array(this.module.HEAPU8.buffer);
    const offL = this._ptrL >> 2;
    const offR = this._ptrR >> 2;

    for (let i = 0; i < frames; i++) {
      outL[i] = heapF32[offL + i];
      if (outR !== outL) outR[i] = heapF32[offR + i];
    }

    // Send position updates ~every 180ms
    if (++this.posCounter >= 32) {
      this.posCounter = 0;
      this.port.postMessage({
        type: 'position',
        row: this._getCurrentRow(),
        pos: this._getCurrentPos()
      });
    }

    return true;
  }
}

registerProcessor('gtultra-processor', GTUltraProcessor);
