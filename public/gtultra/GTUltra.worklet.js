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

          // Pattern/song data access
          this._getPatternPtr = this.module.cwrap('gt_get_pattern_ptr', 'number', ['number']);
          this._getPatternLength = this.module.cwrap('gt_get_pattern_length', 'number', ['number']);
          this._getNumPatterns = this.module.cwrap('gt_get_num_patterns', 'number', []);
          this._getOrderPtr = this.module.cwrap('gt_get_order_ptr', 'number', ['number']);
          this._getInstrumentPtr = this.module.cwrap('gt_get_instrument_ptr', 'number', ['number']);
          this._getNumInstruments = this.module.cwrap('gt_get_num_instruments', 'number', []);
          this._getLTablePtr = this.module.cwrap('gt_get_ltable_ptr', 'number', ['number']);
          this._getRTablePtr = this.module.cwrap('gt_get_rtable_ptr', 'number', ['number']);
          this._getSidRegisters = this.module.cwrap('gt_get_sid_registers', 'number', ['number']);
          this._getSongName = this.module.cwrap('gt_get_song_name', 'number', []);
          this._getAuthorName = this.module.cwrap('gt_get_author_name', 'number', []);
          this._getCopyright = this.module.cwrap('gt_get_copyright', 'number', []);
          this._getNumSongs = this.module.cwrap('gt_get_num_songs', 'number', []);
          this._getChannelCount = this.module.cwrap('gt_get_channel_count', 'number', []);

          // Editing
          this._setPatternCell = this.module.cwrap('gt_set_pattern_cell', null, ['number', 'number', 'number', 'number']);
          this._setOrderEntry = this.module.cwrap('gt_set_order_entry', null, ['number', 'number', 'number']);
          this._setTableEntry = this.module.cwrap('gt_set_table_entry', null, ['number', 'number', 'number', 'number']);
          this._undo = this.module.cwrap('gt_undo', null, []);
          this._redo = this.module.cwrap('gt_redo', null, []);

          // Save/Export
          this._saveSng = this.module.cwrap('gt_save_sng', 'number', ['number']);

          // Instrument editing
          this._setInstrumentAD = this.module.cwrap('gt_set_instrument_ad', null, ['number', 'number']);
          this._setInstrumentSR = this.module.cwrap('gt_set_instrument_sr', null, ['number', 'number']);
          this._setInstrumentFirstwave = this.module.cwrap('gt_set_instrument_firstwave', null, ['number', 'number']);
          this._setInstrumentTablePtr = this.module.cwrap('gt_set_instrument_table_ptr', null, ['number', 'number', 'number']);
          this._setSongName = this.module.cwrap('gt_set_song_name', null, ['string']);
          this._setAuthorName = this.module.cwrap('gt_set_author_name', null, ['string']);
          this._setCopyright = this.module.cwrap('gt_set_copyright', null, ['string']);

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

      case 'getPatternData': {
        // Read pattern data from WASM heap and send to main thread
        if (!this.ready) return;
        const patNum = msg.pattern;
        const len = this._getPatternLength(patNum);
        const ptr = this._getPatternPtr(patNum);
        // Each row is 4 bytes: note, instrument, command, data
        const data = new Uint8Array(this.module.HEAPU8.buffer, ptr, len * 4).slice();
        this.port.postMessage({ type: 'patternData', pattern: patNum, length: len, data: data.buffer }, [data.buffer]);
        break;
      }

      case 'getOrderData': {
        if (!this.ready) return;
        const ch = msg.channel;
        const ptr = this._getOrderPtr(ch);
        // Order list is 256 bytes
        const data = new Uint8Array(this.module.HEAPU8.buffer, ptr, 256).slice();
        this.port.postMessage({ type: 'orderData', channel: ch, data: data.buffer }, [data.buffer]);
        break;
      }

      case 'getInstrumentData': {
        if (!this.ready) return;
        const instNum = msg.instrument;
        const ptr = this._getInstrumentPtr(instNum);
        // Instrument struct: ad(1) + sr(1) + vibdelay(1) + gatetimer(1) + firstwave(1) + name(16) + 4 table ptrs(4) = 25 bytes
        const data = new Uint8Array(this.module.HEAPU8.buffer, ptr, 32).slice();
        this.port.postMessage({ type: 'instrumentData', instrument: instNum, data: data.buffer }, [data.buffer]);
        break;
      }

      case 'getTableData': {
        if (!this.ready) return;
        const tableType = msg.tableType; // 0=wave, 1=pulse, 2=filter, 3=speed
        const lPtr = this._getLTablePtr(tableType);
        const rPtr = this._getRTablePtr(tableType);
        const left = new Uint8Array(this.module.HEAPU8.buffer, lPtr, 256).slice();
        const right = new Uint8Array(this.module.HEAPU8.buffer, rPtr, 256).slice();
        this.port.postMessage({ type: 'tableData', tableType, left: left.buffer, right: right.buffer }, [left.buffer, right.buffer]);
        break;
      }

      case 'getSidRegisters': {
        if (!this.ready) return;
        const sidIdx = msg.sidIdx || 0;
        const ptr = this._getSidRegisters(sidIdx);
        const data = new Uint8Array(this.module.HEAPU8.buffer, ptr, 25).slice();
        this.port.postMessage({ type: 'sidRegisters', sidIdx, data: data.buffer }, [data.buffer]);
        break;
      }

      case 'getSongInfo': {
        if (!this.ready) return;
        const namePtr = this._getSongName();
        const authorPtr = this._getAuthorName();
        const copyrightPtr = this._getCopyright();
        // Read null-terminated strings from WASM heap
        const readStr = (ptr) => {
          const bytes = [];
          for (let i = 0; i < 128; i++) {
            const b = this.module.HEAPU8[ptr + i];
            if (b === 0) break;
            bytes.push(b);
          }
          return String.fromCharCode(...bytes);
        };
        this.port.postMessage({
          type: 'songInfo',
          name: readStr(namePtr),
          author: readStr(authorPtr),
          copyright: readStr(copyrightPtr),
          numPatterns: this._getNumPatterns(),
          numInstruments: this._getNumInstruments(),
          numSongs: this._getNumSongs(),
          channelCount: this._getChannelCount(),
        });
        break;
      }

      case 'setPatternCell': {
        if (!this.ready) return;
        this._setPatternCell(msg.pattern, msg.row, msg.col, msg.value);
        break;
      }

      case 'setOrderEntry': {
        if (!this.ready) return;
        this._setOrderEntry(msg.channel, msg.position, msg.value);
        break;
      }

      case 'setTableEntry': {
        if (!this.ready) return;
        this._setTableEntry(msg.tableType, msg.side, msg.index, msg.value);
        break;
      }

      case 'undo': {
        if (!this.ready) return;
        this._undo();
        break;
      }

      case 'redo': {
        if (!this.ready) return;
        this._redo();
        break;
      }

      case 'saveSng': {
        if (!this.ready) return;
        // gt_save_sng returns size written to internal buffer, we need to allocate and get data
        // The WASM exports a buffer pointer; we allocate a large buffer and pass it
        const bufSize = 1024 * 1024; // 1MB should be plenty for .sng
        const ptr = this.module._malloc(bufSize);
        const size = this._saveSng(ptr);
        if (size > 0) {
          const data = this.module.HEAPU8.slice(ptr, ptr + size);
          this.port.postMessage(
            { type: 'sngData', data: data.buffer },
            [data.buffer]
          );
        } else {
          this.port.postMessage({ type: 'sngData', data: null });
        }
        this.module._free(ptr);
        break;
      }

      case 'setInstrumentAD': {
        if (!this.ready) return;
        this._setInstrumentAD(msg.instrument, msg.value);
        break;
      }

      case 'setInstrumentSR': {
        if (!this.ready) return;
        this._setInstrumentSR(msg.instrument, msg.value);
        break;
      }

      case 'setInstrumentFirstwave': {
        if (!this.ready) return;
        this._setInstrumentFirstwave(msg.instrument, msg.value);
        break;
      }

      case 'setInstrumentTablePtr': {
        if (!this.ready) return;
        this._setInstrumentTablePtr(msg.instrument, msg.tableType, msg.value);
        break;
      }

      case 'setSongName': {
        if (!this.ready) return;
        this._setSongName(msg.name);
        break;
      }

      case 'setAuthorName': {
        if (!this.ready) return;
        this._setAuthorName(msg.name);
        break;
      }

      case 'setCopyright': {
        if (!this.ready) return;
        this._setCopyright(msg.name);
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
