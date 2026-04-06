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
    this.jamActive = false; // True when jam notes need audio processing
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
          this._playTestNote = this.module.cwrap('gt_play_test_note', null, ['number', 'number', 'number']);
          this._releaseNote = this.module.cwrap('gt_release_note', null, ['number']);

          // Pattern/song data access
          this._getPatternPtr = this.module.cwrap('gt_get_pattern_ptr', 'number', ['number']);
          this._getPatternLength = this.module.cwrap('gt_get_pattern_length', 'number', ['number']);
          this._getNumPatterns = this.module.cwrap('gt_get_num_patterns', 'number', []);
          this._getOrderPtr = this.module.cwrap('gt_get_order_ptr', 'number', ['number', 'number']);
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
          this._getTablePositions = this.module.cwrap('gt_get_table_positions', 'number', ['number']);
          this._getMaxChannels = this._getChannelCount;

          // Editing
          this._setPatternCell = this.module.cwrap('gt_set_pattern_cell', null, ['number', 'number', 'number', 'number', 'number', 'number']);
          this._setOrderEntry = this.module.cwrap('gt_set_order_entry', null, ['number', 'number', 'number', 'number']);
          this._setTableEntry = this.module.cwrap('gt_set_table_entry', null, ['number', 'number', 'number', 'number']);
          this._undo = this.module.cwrap('gt_undo', null, []);
          this._redo = this.module.cwrap('gt_redo', null, []);
          this._canUndo = this.module.cwrap('gt_can_undo', 'number', []);
          this._canRedo = this.module.cwrap('gt_can_redo', 'number', []);
          this._checkpointUndo = this.module.cwrap('gt_checkpoint_undo', null, []);
          this._markEdited = this.module.cwrap('gt_mark_edited', null, ['number', 'number']);

          // Structure operations
          this._insertOrder = this.module.cwrap('gt_insert_order', null, ['number', 'number', 'number', 'number']);
          this._deleteOrder = this.module.cwrap('gt_delete_order', null, ['number', 'number', 'number']);
          this._getOrderLength = this.module.cwrap('gt_get_order_length', 'number', ['number', 'number']);
          this._insertTableRow = this.module.cwrap('gt_insert_table_row', null, ['number', 'number']);
          this._deleteTableRow = this.module.cwrap('gt_delete_table_row', null, ['number', 'number']);
          this._expandPattern = this.module.cwrap('gt_expand_pattern', null, ['number']);
          this._shrinkPattern = this.module.cwrap('gt_shrink_pattern', null, ['number']);
          this._copyInstrument = this.module.cwrap('gt_copy_instrument', null, ['number', 'number']);
          this._swapInstruments = this.module.cwrap('gt_swap_instruments', null, ['number', 'number']);
          this._clearInstrument = this.module.cwrap('gt_clear_instrument', null, ['number']);

          // Save/Export
          this._saveSng = this.module.cwrap('gt_save_sng', 'number', ['number', 'number']);
          this._exportPrg = this.module.cwrap('gt_export_prg', 'number', ['number', 'number']);
          this._exportSid = this.module.cwrap('gt_export_sid', 'number', ['number', 'number']);

          // Instrument editing
          this._setInstrumentAD = this.module.cwrap('gt_set_instrument_ad', null, ['number', 'number', 'number']);
          this._setInstrumentSR = this.module.cwrap('gt_set_instrument_sr', null, ['number', 'number', 'number']);
          this._setInstrumentFirstwave = this.module.cwrap('gt_set_instrument_firstwave', null, ['number', 'number']);
          this._setInstrumentTablePtr = this.module.cwrap('gt_set_instrument_table_ptr', null, ['number', 'number', 'number']);
          this._setInstrumentVibdelay = this.module.cwrap('gt_set_instrument_vibdelay', null, ['number', 'number']);
          this._setInstrumentGatetimer = this.module.cwrap('gt_set_instrument_gatetimer', null, ['number', 'number']);
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
        // Include channel count so the UI can set sidCount immediately
        const channelCount = this._getChannelCount();
        this.port.postMessage({ type: 'songLoaded', ok: ok !== 0, channelCount });
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
        // Debug: wrap debug functions if available
        if (!this._dbgSonginit && this.module._gt_debug_songinit) {
          this._dbgSonginit = this.module.cwrap('gt_debug_songinit', 'number', []);
          this._dbgMaxCh = this.module.cwrap('gt_debug_maxchannels', 'number', []);
          this._dbgFramerate = this.module.cwrap('gt_debug_framerate', 'number', []);
          this._dbgAdparam = this.module.cwrap('gt_debug_adparam', 'number', []);
          this._dbgMultiplier = this.module.cwrap('gt_debug_multiplier', 'number', []);
          this._dbgTempoCh0 = this.module.cwrap('gt_debug_tempo_ch0', 'number', []);
          this._dbgSidregSum = this.module.cwrap('gt_debug_sidreg_sum', 'number', []);
        }
        if (this._dbgSonginit) {
          console.log('[GTWorklet] PRE-PLAY state:', {
            songinit: this._dbgSonginit(),
            maxSIDChannels: this._dbgMaxCh(),
            framerate: this._dbgFramerate(),
            adparam: '0x' + this._dbgAdparam().toString(16),
            multiplier: this._dbgMultiplier(),
            tempo_ch0: this._dbgTempoCh0(),
            sidregSum: this._dbgSidregSum(),
          });
        }
        this._play(msg.songNum || 0, msg.fromPos || 0, msg.fromRow || 0);
        this.playing = true;
        this._debugCounter = 0;
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
        this.jamActive = true;
        break;
      }

      case 'jamNoteOff': {
        if (!this.ready) return;
        this._jamNoteOff(msg.channel);
        // Keep jamActive for ~500ms so the release envelope plays out (44100 * 0.5 / 128 ≈ 172 blocks)
        this.jamReleaseCountdown = 172;
        break;
      }

      case 'playTestNote': {
        if (!this.ready) return;
        this._playTestNote(msg.channel, msg.note, msg.instrument);
        this.jamActive = true;
        break;
      }

      case 'releaseNote': {
        if (!this.ready) return;
        this._releaseNote(msg.channel);
        this.jamReleaseCountdown = 172;
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
        const song = msg.song || 0;
        const ptr = this._getOrderPtr(song, ch);
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
        // Read existing cell values, then overwrite the target column
        const pat = msg.pattern;
        const row = msg.row;
        const col = msg.col;
        const ptr = this._getPatternPtr(pat);
        if (ptr) {
          const off = row * 4;
          const n = this.module.HEAPU8[ptr + off + 0];
          const i = this.module.HEAPU8[ptr + off + 1];
          const c = this.module.HEAPU8[ptr + off + 2];
          const d = this.module.HEAPU8[ptr + off + 3];
          const vals = [n, i, c, d];
          vals[col] = msg.value;
          this._setPatternCell(pat, row, vals[0], vals[1], vals[2], vals[3]);
        }
        break;
      }

      case 'setOrderEntry': {
        if (!this.ready) return;
        this._setOrderEntry(msg.song || 0, msg.channel, msg.position, msg.value);
        break;
      }

      case 'setTableEntry': {
        if (!this.ready) return;
        // Read existing left/right, modify one side, write both
        const tType = msg.tableType;
        const tRow = msg.index;
        const lPtr = this._getLTablePtr(tType);
        const rPtr = this._getRTablePtr(tType);
        let left = lPtr ? this.module.HEAPU8[lPtr + tRow] : 0;
        let right = rPtr ? this.module.HEAPU8[rPtr + tRow] : 0;
        if (msg.side === 0) left = msg.value; else right = msg.value;
        this._setTableEntry(tType, tRow, left, right);
        break;
      }

      case 'undo': {
        if (!this.ready) return;
        this._checkpointUndo(); // Finalize any pending edits first
        this._undo();
        break;
      }

      case 'checkpointUndo': {
        if (!this.ready) return;
        this._checkpointUndo();
        break;
      }

      case 'redo': {
        if (!this.ready) return;
        this._redo();
        break;
      }

      case 'insertOrder': {
        if (!this.ready) return;
        this._insertOrder(msg.song, msg.ch, msg.pos, msg.val);
        break;
      }

      case 'deleteOrder': {
        if (!this.ready) return;
        this._deleteOrder(msg.song, msg.ch, msg.pos);
        break;
      }

      case 'insertTableRow': {
        if (!this.ready) return;
        this._insertTableRow(msg.tableType, msg.pos);
        break;
      }

      case 'deleteTableRow': {
        if (!this.ready) return;
        this._deleteTableRow(msg.tableType, msg.pos);
        break;
      }

      case 'expandPattern': {
        if (!this.ready) return;
        this._expandPattern(msg.pat);
        break;
      }

      case 'shrinkPattern': {
        if (!this.ready) return;
        this._shrinkPattern(msg.pat);
        break;
      }

      case 'copyInstrument': {
        if (!this.ready) return;
        this._copyInstrument(msg.src, msg.dst);
        break;
      }

      case 'swapInstruments': {
        if (!this.ready) return;
        this._swapInstruments(msg.a, msg.b);
        break;
      }

      case 'clearInstrument': {
        if (!this.ready) return;
        this._clearInstrument(msg.inst);
        break;
      }

      case 'saveSng': {
        if (!this.ready) return;
        const bufSize = 1024 * 1024; // 1MB should be plenty for .sng
        const ptr = this.module._malloc(bufSize);
        const size = this._saveSng(ptr, bufSize);
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
        // value is combined AD byte: high nibble = attack, low nibble = decay
        this._setInstrumentAD(msg.instrument, (msg.value >> 4) & 0xF, msg.value & 0xF);
        break;
      }

      case 'setInstrumentSR': {
        if (!this.ready) return;
        // value is combined SR byte: high nibble = sustain, low nibble = release
        this._setInstrumentSR(msg.instrument, (msg.value >> 4) & 0xF, msg.value & 0xF);
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

      case 'setInstrumentVibdelay': {
        if (!this.ready) return;
        this._setInstrumentVibdelay(msg.instrument, msg.value);
        break;
      }

      case 'setInstrumentGatetimer': {
        if (!this.ready) return;
        this._setInstrumentGatetimer(msg.instrument, msg.value);
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

      case 'exportPrg': {
        if (!this.ready) return;
        const bufSize = 1024 * 1024;
        const ptr = this.module._malloc(bufSize);
        const size = this._exportPrg(ptr, bufSize);
        if (size > 0) {
          const data = this.module.HEAPU8.slice(ptr, ptr + size);
          this.port.postMessage({ type: 'prgData', data: data.buffer }, [data.buffer]);
        } else {
          this.port.postMessage({ type: 'prgData', data: null });
        }
        this.module._free(ptr);
        break;
      }

      case 'exportSid': {
        if (!this.ready) return;
        const bufSize = 1024 * 1024;
        const ptr = this.module._malloc(bufSize);
        const size = this._exportSid(ptr, bufSize);
        if (size > 0) {
          const data = this.module.HEAPU8.slice(ptr, ptr + size);
          this.port.postMessage({ type: 'sidData', data: data.buffer }, [data.buffer]);
        } else {
          this.port.postMessage({ type: 'sidData', data: null });
        }
        this.module._free(ptr);
        break;
      }

      default:
        break;
    }
  }

  process(inputs, outputs) {
    if (!this.ready) return true;

    // Count down jam release and deactivate when done
    if (this.jamReleaseCountdown > 0) {
      this.jamReleaseCountdown--;
      if (this.jamReleaseCountdown === 0) this.jamActive = false;
    }

    if (!this.playing && !this.jamActive) return true;

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

    // Send position updates every 2 blocks (~5.8ms at 44.1kHz) for smooth scrolling
    if (++this.posCounter >= 2) {
      this.posCounter = 0;
      // Pack table positions for all active voices (up to 6 for stereo SID)
      const tblPos = [];
      if (this._getTablePositions) {
        const numCh = this._getMaxChannels ? this._getMaxChannels() : 3;
        for (let ch = 0; ch < numCh; ch++) {
          tblPos.push(this._getTablePositions(ch));
        }
      }
      this.port.postMessage({
        type: 'position',
        row: this._getCurrentRow(),
        pos: this._getCurrentPos(),
        tablePositions: tblPos,
      });
    }

    return true;
  }
}

registerProcessor('gtultra-processor', GTUltraProcessor);
