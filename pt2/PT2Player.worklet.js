/**
 * PT2Player AudioWorklet processor
 * Runs the pt2-clone replayer at audio rate via WASM
 */

class PT2PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.ready = false;
    this.playing = false;
    this.posCounter = 0;

    // WASM function wrappers
    this._init = null;
    this._render = null;
    this._loadModule = null;

    // Persistent render buffers
    this._ptrL = 0;
    this._ptrR = 0;

    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'init': {
        try {
          const factory = new Function(msg.jsCode + '\nreturn createPT2Replayer;')();
          this.module = await factory({ wasmBinary: msg.wasmBinary });

          // Core
          this._init = this.module.cwrap('pt2_init', 'number', ['number']);
          this._render = this.module.cwrap('pt2_render', null, ['number', 'number', 'number']);
          this._loadModule = this.module.cwrap('pt2_load_module', 'number', ['number', 'number']);
          this._free = this.module.cwrap('pt2_free', null, []);

          // Playback
          this._play = this.module.cwrap('pt2_play', null, ['number', 'number']);
          this._playPattern = this.module.cwrap('pt2_play_pattern', null, ['number']);
          this._stop = this.module.cwrap('pt2_stop', null, []);
          this._setPosition = this.module.cwrap('pt2_set_position', null, ['number', 'number']);

          // State
          this._getPosition = this.module.cwrap('pt2_get_position', 'number', []);
          this._getRow = this.module.cwrap('pt2_get_row', 'number', []);
          this._getPattern = this.module.cwrap('pt2_get_pattern', 'number', []);
          this._getSpeed = this.module.cwrap('pt2_get_speed', 'number', []);
          this._getBpm = this.module.cwrap('pt2_get_bpm', 'number', []);
          this._isPlaying = this.module.cwrap('pt2_is_playing', 'number', []);
          this._getSongLength = this.module.cwrap('pt2_get_song_length', 'number', []);
          this._getNumChannels = this.module.cwrap('pt2_get_num_channels', 'number', []);
          this._getSongName = this.module.cwrap('pt2_get_song_name', 'number', ['number', 'number']);
          this._getNumPatterns = this.module.cwrap('pt2_get_num_patterns', 'number', []);

          // Order list
          this._getOrderEntry = this.module.cwrap('pt2_get_order_entry', 'number', ['number']);
          this._setOrderEntry = this.module.cwrap('pt2_set_order_entry', null, ['number', 'number']);
          this._setSongLength = this.module.cwrap('pt2_set_song_length', null, ['number']);

          // Pattern data
          this._getPatternCell = this.module.cwrap('pt2_get_pattern_cell', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
          this._setPatternCell = this.module.cwrap('pt2_set_pattern_cell', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
          this._getPatternPtr = this.module.cwrap('pt2_get_pattern_ptr', 'number', ['number']);

          // Samples
          this._getSampleName = this.module.cwrap('pt2_get_sample_name', 'number', ['number', 'number', 'number']);
          this._getSampleLength = this.module.cwrap('pt2_get_sample_length', 'number', ['number']);
          this._getSampleLoopStart = this.module.cwrap('pt2_get_sample_loop_start', 'number', ['number']);
          this._getSampleLoopLength = this.module.cwrap('pt2_get_sample_loop_length', 'number', ['number']);
          this._getSampleVolume = this.module.cwrap('pt2_get_sample_volume', 'number', ['number']);
          this._getSampleFinetune = this.module.cwrap('pt2_get_sample_finetune', 'number', ['number']);
          this._setSampleVolume = this.module.cwrap('pt2_set_sample_volume', null, ['number', 'number']);
          this._setSampleFinetune = this.module.cwrap('pt2_set_sample_finetune', null, ['number', 'number']);
          this._setSampleLoopStart = this.module.cwrap('pt2_set_sample_loop_start', null, ['number', 'number']);
          this._setSampleLoopLength = this.module.cwrap('pt2_set_sample_loop_length', null, ['number', 'number']);
          this._setSampleName = this.module.cwrap('pt2_set_sample_name', null, ['number', 'string']);
          this._getSampleDataPtr = this.module.cwrap('pt2_get_sample_data_ptr', 'number', ['number']);
          this._setSampleData = this.module.cwrap('pt2_set_sample_data', 'number', ['number', 'number', 'number']);

          // Channels
          this._getChannelVolume = this.module.cwrap('pt2_get_channel_volume', 'number', ['number']);
          this._getChannelPeriod = this.module.cwrap('pt2_get_channel_period', 'number', ['number']);
          this._getChannelSample = this.module.cwrap('pt2_get_channel_sample', 'number', ['number']);
          this._setMute = this.module.cwrap('pt2_set_mute', null, ['number', 'number']);
          this._getMute = this.module.cwrap('pt2_get_mute', 'number', ['number']);

          // Config
          this._setStereoSeparation = this.module.cwrap('pt2_set_stereo_separation', null, ['number']);
          this._setAmigaModel = this.module.cwrap('pt2_set_amiga_model', null, ['number']);
          this._setLedFilter = this.module.cwrap('pt2_set_led_filter', null, ['number']);
          this._setOversampling = this.module.cwrap('pt2_set_oversampling', null, ['number']);

          // Save
          this._saveModule = this.module.cwrap('pt2_save_module', 'number', ['number', 'number']);

          // Initialize replayer at AudioWorklet sample rate
          this._init(sampleRate);

          // Allocate persistent float buffers (128 frames)
          this._ptrL = this.module._malloc(128 * 4);
          this._ptrR = this.module._malloc(128 * 4);

          this.ready = true;
          this.port.postMessage({ type: 'ready' });
        } catch (err) {
          this.port.postMessage({ type: 'error', error: err.message || String(err) });
        }
        break;
      }

      case 'loadModule': {
        if (!this.ready) break;
        const data = new Uint8Array(msg.buffer);
        const ptr = this.module._malloc(data.length);
        this.module.HEAPU8.set(data, ptr);
        const ok = this._loadModule(ptr, data.length);
        this.module._free(ptr);
        if (ok) {
          // Read song info
          const namePtr = this.module._malloc(64);
          this._getSongName(namePtr, 64);
          const nameArr = this.module.HEAPU8.subarray(namePtr, namePtr + 64);
          let name = '';
          for (let i = 0; i < 64 && nameArr[i]; i++) name += String.fromCharCode(nameArr[i]);
          this.module._free(namePtr);

          this.port.postMessage({
            type: 'moduleLoaded',
            name: name.trim(),
            songLength: this._getSongLength(),
            numPatterns: this._getNumPatterns(),
            numChannels: this._getNumChannels(),
          });
        } else {
          this.port.postMessage({ type: 'error', error: 'Failed to load MOD file' });
        }
        break;
      }

      case 'play': {
        if (!this.ready) break;
        this._play(msg.position ?? 0, msg.row ?? 0);
        this.playing = true;
        break;
      }

      case 'playPattern': {
        if (!this.ready) break;
        this._playPattern(msg.row ?? 0);
        this.playing = true;
        break;
      }

      case 'stop': {
        if (!this.ready) break;
        this._stop();
        this.playing = false;
        break;
      }

      case 'setPosition': {
        if (!this.ready) break;
        this._setPosition(msg.position, msg.row ?? 0);
        break;
      }

      case 'setMute': {
        if (!this.ready) break;
        this._setMute(msg.channel, msg.muted ? 1 : 0);
        break;
      }

      case 'setStereoSeparation': {
        if (!this.ready) break;
        this._setStereoSeparation(msg.percent);
        break;
      }

      case 'setAmigaModel': {
        if (!this.ready) break;
        this._setAmigaModel(msg.model);
        break;
      }

      case 'setLedFilter': {
        if (!this.ready) break;
        this._setLedFilter(msg.on ? 1 : 0);
        break;
      }

      // ─── Pattern data requests ──────────────────────────────────
      case 'getPatternData': {
        if (!this.ready) break;
        const pat = msg.pattern;
        const rows = 64;
        const channels = 4;
        // Each cell: period(u16), sample(u8), command(u8), param(u8) => 5 bytes
        const data = new Uint8Array(rows * channels * 5);
        const notePtr = this.module._malloc(4); // 4 ints for output
        const smpPtr = this.module._malloc(4);
        const cmdPtr = this.module._malloc(4);
        const paramPtr = this.module._malloc(4);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < channels; c++) {
            this._getPatternCell(pat, r, c, notePtr, smpPtr, cmdPtr, paramPtr);
            const off = (r * channels + c) * 5;
            const period = this.module.getValue(notePtr, 'i32');
            data[off] = (period >> 8) & 0xFF;
            data[off + 1] = period & 0xFF;
            data[off + 2] = this.module.getValue(smpPtr, 'i32') & 0xFF;
            data[off + 3] = this.module.getValue(cmdPtr, 'i32') & 0xFF;
            data[off + 4] = this.module.getValue(paramPtr, 'i32') & 0xFF;
          }
        }

        this.module._free(notePtr);
        this.module._free(smpPtr);
        this.module._free(cmdPtr);
        this.module._free(paramPtr);

        this.port.postMessage(
          { type: 'patternData', pattern: pat, data: data.buffer },
          [data.buffer]
        );
        break;
      }

      case 'setPatternCell': {
        if (!this.ready) break;
        this._setPatternCell(msg.pattern, msg.row, msg.channel, msg.period, msg.sample, msg.command, msg.param);
        break;
      }

      // ─── Order list requests ────────────────────────────────────
      case 'getOrderList': {
        if (!this.ready) break;
        const len = this._getSongLength();
        const orders = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          orders[i] = this._getOrderEntry(i);
        }
        this.port.postMessage(
          { type: 'orderList', data: orders.buffer, length: len },
          [orders.buffer]
        );
        break;
      }

      case 'setOrderEntry': {
        if (!this.ready) break;
        this._setOrderEntry(msg.position, msg.pattern);
        break;
      }

      // ─── Sample data requests ───────────────────────────────────
      case 'getSampleInfo': {
        if (!this.ready) break;
        const idx = msg.index;
        const namePtr = this.module._malloc(32);
        this._getSampleName(idx, namePtr, 32);
        const nameArr = this.module.HEAPU8.subarray(namePtr, namePtr + 32);
        let sname = '';
        for (let i = 0; i < 32 && nameArr[i]; i++) sname += String.fromCharCode(nameArr[i]);
        this.module._free(namePtr);

        this.port.postMessage({
          type: 'sampleInfo',
          index: idx,
          name: sname.trim(),
          length: this._getSampleLength(idx),
          loopStart: this._getSampleLoopStart(idx),
          loopLength: this._getSampleLoopLength(idx),
          volume: this._getSampleVolume(idx),
          finetune: this._getSampleFinetune(idx),
        });
        break;
      }

      case 'getAllSampleInfo': {
        if (!this.ready) break;
        const samples = [];
        const namePtr2 = this.module._malloc(32);
        for (let i = 0; i < 31; i++) {
          this._getSampleName(i, namePtr2, 32);
          const nameArr2 = this.module.HEAPU8.subarray(namePtr2, namePtr2 + 32);
          let sn = '';
          for (let j = 0; j < 32 && nameArr2[j]; j++) sn += String.fromCharCode(nameArr2[j]);
          samples.push({
            index: i,
            name: sn.trim(),
            length: this._getSampleLength(i),
            loopStart: this._getSampleLoopStart(i),
            loopLength: this._getSampleLoopLength(i),
            volume: this._getSampleVolume(i),
            finetune: this._getSampleFinetune(i),
          });
        }
        this.module._free(namePtr2);
        this.port.postMessage({ type: 'allSampleInfo', samples });
        break;
      }

      case 'setSampleVolume': {
        if (!this.ready) break;
        this._setSampleVolume(msg.index, msg.volume);
        break;
      }

      case 'setSampleFinetune': {
        if (!this.ready) break;
        this._setSampleFinetune(msg.index, msg.finetune);
        break;
      }

      case 'setSampleLoop': {
        if (!this.ready) break;
        this._setSampleLoopStart(msg.index, msg.loopStart);
        this._setSampleLoopLength(msg.index, msg.loopLength);
        break;
      }

      case 'setSampleName': {
        if (!this.ready) break;
        this._setSampleName(msg.index, msg.name);
        break;
      }

      // ─── Save/Export ────────────────────────────────────────────
      case 'saveModule': {
        if (!this.ready) break;
        const maxSize = 4 * 1024 * 1024; // 4MB max
        const outPtr = this.module._malloc(maxSize);
        const size = this._saveModule(outPtr, maxSize);
        if (size > 0) {
          const saved = new Uint8Array(size);
          saved.set(this.module.HEAPU8.subarray(outPtr, outPtr + size));
          this.port.postMessage(
            { type: 'savedModule', data: saved.buffer },
            [saved.buffer]
          );
        } else {
          this.port.postMessage({ type: 'error', error: 'Failed to save MOD' });
        }
        this.module._free(outPtr);
        break;
      }

      case 'dispose': {
        if (this.ready) {
          this._free();
          if (this._ptrL) this.module._free(this._ptrL);
          if (this._ptrR) this.module._free(this._ptrR);
          this.ready = false;
        }
        break;
      }
    }
  }

  process(inputs, outputs) {
    if (!this.ready || !outputs[0]) return true;

    const outL = outputs[0][0];
    const outR = outputs[0][1] || outL;
    const numFrames = outL.length; // typically 128

    // Render audio from WASM
    this._render(this._ptrL, this._ptrR, numFrames);

    // Copy from WASM heap to output buffers
    const heapF32 = this.module.HEAPF32;
    const offL = this._ptrL >> 2;
    const offR = this._ptrR >> 2;
    outL.set(heapF32.subarray(offL, offL + numFrames));
    outR.set(heapF32.subarray(offR, offR + numFrames));

    // Periodic position updates (~15 fps at 48kHz)
    this.posCounter += numFrames;
    if (this.posCounter >= 3200) { // ~15 updates/sec at 48kHz
      this.posCounter = 0;
      if (this._isPlaying()) {
        this.port.postMessage({
          type: 'position',
          position: this._getPosition(),
          row: this._getRow(),
          pattern: this._getPattern(),
          speed: this._getSpeed(),
          bpm: this._getBpm(),
          // Per-channel state for VU meters
          channels: [
            { volume: this._getChannelVolume(0), period: this._getChannelPeriod(0), sample: this._getChannelSample(0) },
            { volume: this._getChannelVolume(1), period: this._getChannelPeriod(1), sample: this._getChannelSample(1) },
            { volume: this._getChannelVolume(2), period: this._getChannelPeriod(2), sample: this._getChannelSample(2) },
            { volume: this._getChannelVolume(3), period: this._getChannelPeriod(3), sample: this._getChannelSample(3) },
          ],
        });
      }
    }

    return true;
  }
}

registerProcessor('pt2-player-processor', PT2PlayerProcessor);
