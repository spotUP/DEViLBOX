// StartrekkerAM.worklet.js — AudioWorklet for StarTrekker AM WASM engine
// Follows ArtOfNoiseEngine pattern: main thread fetches WASM/JS and sends
// via 'init' message so fetch is never called inside the worklet.

const WORKLET_SAMPLE_RATE = 28150;  // PAULA_RATE_PAL

class StartrekkerAMProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this._wasm      = null;
        this._ready     = false;
        this._outPtr    = 0;
        this._FRAMES    = 128;
        this.muteMask   = 0xFFFFFFFF;

        this.port.onmessage = (e) => this._handleMessage(e.data);
    }

    async _handleMessage(msg) {
        switch (msg.type) {
        case 'init':
            await this._initWasm(msg.sampleRate, msg.wasmBinary, msg.jsCode);
            break;
        case 'loadMod': {
            if (!this._wasm) return;
            const data = new Uint8Array(msg.data);
            const ptr  = this._wasm._malloc(data.length);
            if (!ptr) { this.port.postMessage({ type: 'error', msg: 'malloc failed (mod)' }); return; }
            this._wasm.HEAPU8.set(data, ptr);
            this._wasm._player_load_mod(ptr, data.length);
            this._wasm._free(ptr);
            this.applyMuteMask();
            this.port.postMessage({ type: 'modLoaded' });
            break;
        }
        case 'loadNt': {
            if (!this._wasm) return;
            const data = new Uint8Array(msg.data);
            const ptr  = this._wasm._malloc(data.length);
            if (!ptr) { this.port.postMessage({ type: 'error', msg: 'malloc failed (nt)' }); return; }
            this._wasm.HEAPU8.set(data, ptr);
            const ok = this._wasm._player_load_nt(ptr, data.length);
            this._wasm._free(ptr);
            if (ok) {
                const title = this._wasm.ccall('player_get_title', 'string', [], []);
                this.applyMuteMask();
                this.port.postMessage({ type: 'loaded', title });
            } else {
                this.port.postMessage({ type: 'error', msg: 'player_load_nt failed' });
            }
            break;
        }
        case 'load': {
            if (!this._wasm) return;
            const data = new Uint8Array(msg.data);
            const ptr  = this._wasm._malloc(data.length);
            if (!ptr) { this.port.postMessage({ type: 'error', msg: 'malloc failed' }); return; }
            this._wasm.HEAPU8.set(data, ptr);
            const ok = this._wasm._player_load(ptr, data.length);
            this._wasm._free(ptr);
            if (ok) {
                const title = this._wasm.ccall('player_get_title', 'string', [], []);
                this.applyMuteMask();
                this.port.postMessage({ type: 'loaded', title });
            } else {
                this.port.postMessage({ type: 'error', msg: 'player_load failed' });
            }
            break;
        }
        case 'stop':
            if (this._wasm) this._wasm._player_stop();
            break;
        case 'setChannelGain':
            if (this._wasm && this._wasm._paula_set_channel_gain) {
                this._wasm._paula_set_channel_gain(msg.channel, msg.gain);
            }
            break;
        case 'setNtParam':
            if (this._wasm && this._wasm._player_set_nt_param) {
                this._wasm._player_set_nt_param(msg.instr, msg.offset, msg.value);
            }
            if (this._pvWasm && this._pvWasm._player_set_nt_param) {
                this._pvWasm._player_set_nt_param(msg.instr, msg.offset, msg.value);
            }
            break;
        case 'previewLoad':
            // The song's module and AM data, for the keyboard copy of the replayer.
            this._pvMod = new Uint8Array(msg.mod);
            this._pvNt = new Uint8Array(msg.nt);
            break;
        case 'noteOn':
            await this._previewNoteOn(msg.instr, msg.period);
            break;
        case 'noteOff':
            // key-up: the AM envelope runs on to its own release; the voice ends itself
            if (this._pvWasm) this._pvWasm._player_set_hold(0);
            break;
        case 'setPatternCell':
            if (this._wasm && this._wasm._player_set_pattern_cell) {
                this._wasm._player_set_pattern_cell(msg.pattern, msg.row, msg.channel, msg.b0, msg.b1, msg.b2, msg.b3);
            }
            break;
        case 'setMuteMask':
            this.muteMask = msg.mask;
            this.applyMuteMask();
            break;
        default:
            break;
        }
    }

    /**
     * Keyboard note: a second copy of the replayer (its own WASM instance, so the song is untouched)
     * plays the song's module cut down to one row, instrument `instr` at `period` on voice 0. The
     * replayer's own note-on, AM envelope and Paula mixer make the sound. It starts a row late
     * (the replayer plays a row every `speed` ticks), so the lead-in is run unheard.
     */
    async _previewNoteOn(instr, period) {
        if (!this._createFn || !this._pvMod || !this._pvNt) return;
        const mod = this._pvMod.slice();
        const order0 = mod[0x3B8];
        const pat = 0x43C + order0 * 1024;
        mod.fill(0, pat, pat + 1024);
        mod[pat] = (instr & 0xF0) | ((period >> 8) & 0x0F);
        mod[pat + 1] = period & 0xFF;
        mod[pat + 2] = (instr & 0x0F) << 4;
        // The song is the note's pattern, then an emptied pattern repeated: a held key is not retriggered
        // when the 64 rows end. (Without a second pattern in the module it is that one pattern.)
        let maxPat = 0;
        for (let i = 0; i < 128; i++) if (mod[0x3B8 + i] > maxPat) maxPat = mod[0x3B8 + i];
        if (maxPat >= 1) {
            const other = order0 === 0 ? 1 : 0;
            const opat = 0x43C + other * 1024;
            mod.fill(0, opat, opat + 1024);
            mod[0x3B8 + 1] = other;
            mod[0x3B6] = 2;
            mod[0x3B7] = 1;                  // the restart position: the empty pattern
        } else {
            mod[0x3B6] = 1;
        }
        if (!this._pvWasm) {
            this._pvWasm = await this._createFn({ ...this._config });
            this._pvPtr = this._pvWasm._malloc(this._FRAMES * 2 * 4);
        }
        const w = this._pvWasm;
        w._player_init(sampleRate);
        const mp = w._malloc(mod.length); w.HEAPU8.set(mod, mp); w._player_load_mod(mp, mod.length); w._free(mp);
        const np = w._malloc(this._pvNt.length); w.HEAPU8.set(this._pvNt, np); w._player_load_nt(np, this._pvNt.length); w._free(np);
        // lead-in: the first row plays at the end of the sixth 20 ms tick
        const lead = Math.ceil((sampleRate / 50) * 6 / this._FRAMES) * this._FRAMES;
        for (let done = 0; done < lead; done += this._FRAMES) w._player_render(this._pvPtr, this._FRAMES);
        w._player_set_hold(1);               // a key is down: the AM sustain waits
        this._pvActive = true;
    }

    async _initWasm(sampleRate, wasmBinary, jsCode) {
        try {
            if (!jsCode) { this.port.postMessage({ type: 'error', msg: 'no jsCode' }); return; }

            // Patch the JS so it uses the provided wasmBinary instead of fetching
            let code = jsCode;
            if (wasmBinary) {
                code = code.replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];');
            }
            code = code
                .replace(/import\.meta\.url/g, "'.'")
                .replace(/export\s+default\s+\w+;?/g, '');

            const wrappedCode = code + '\nreturn createStartrekkerAM;';
            // eslint-disable-next-line no-new-func
            const factory = new Function('module', wrappedCode);
            const createFn = factory({});

            const config = { noInitialRun: true };
            if (wasmBinary) config.wasmBinary = wasmBinary;

            this._createFn = createFn;
            this._config = config;
            this._wasm = await createFn(config);
            // Use the actual AudioContext sample rate for correct pitch and speed
            this._wasm._player_init(sampleRate || sampleRate === 0 ? sampleRate : WORKLET_SAMPLE_RATE);

            // Allocate render buffer: FRAMES * 2 channels * 4 bytes
            this._outPtr = this._wasm._malloc(this._FRAMES * 2 * 4);
            if (!this._outPtr) {
                this.port.postMessage({ type: 'error', msg: 'malloc failed for render buffer' });
                return;
            }

            this._ready = true;
            this.port.postMessage({ type: 'ready' });
        } catch (err) {
            this.port.postMessage({ type: 'error', msg: String(err) });
        }
    }
    /**
     * The mixer's mask is bit N SET = channel N AUDIBLE. The core's gain export
     * takes 1 = audible, 0 = silent, so the bit becomes the gain here, once.
     * Re-applied after every load: a fresh module starts with all channels on.
     */
    applyMuteMask() {
      if (!this._wasm || typeof this._wasm._paula_set_channel_gain !== 'function') return;
      for (let ch = 0; ch < 4; ch++) {
        this._wasm._paula_set_channel_gain(ch, (this.muteMask >>> ch) & 1 ? 1 : 0);
      }
    }


    process(_inputs, outputs) {
        if (!this._ready || !this._wasm || !this._outPtr) {
            const out = outputs[0];
            if (out) { out[0]?.fill(0); out[1]?.fill(0); }
            return true;
        }

        const wasm   = this._wasm;
        const out    = outputs[0];
        const outL   = out[0];
        const outR   = out[1];
        const frames = outL ? outL.length : 128;

        wasm._player_render(this._outPtr, frames);
        const pv = this._pvActive && this._pvWasm && this._pvPtr ? this._pvWasm : null;
        if (pv) pv._player_render(this._pvPtr, frames);

        const heap = new Float32Array(wasm.HEAPF32.buffer, this._outPtr, frames * 2);
        if (outL && outR) {
            const pvh = pv ? new Float32Array(pv.HEAPF32.buffer, this._pvPtr, frames * 2) : null;
            for (let i = 0; i < frames; i++) {
                outL[i] = heap[i * 2] + (pvh ? pvh[i * 2] : 0);
                outR[i] = heap[i * 2 + 1] + (pvh ? pvh[i * 2 + 1] : 0);
            }
        }

        // Send voice state ~15 Hz (every 25th process call at ~375 Hz)
        if (!this._voiceCounter) this._voiceCounter = 0;
        this._voiceCounter++;
        if (this._voiceCounter >= 25 && wasm._player_get_voice_info) {
            this._voiceCounter = 0;
            if (!this._voicePtr) this._voicePtr = wasm._malloc(8 * 4);
            if (this._voicePtr) {
                wasm._player_get_voice_info(this._voicePtr);
                const v = new Float32Array(wasm.HEAPF32.buffer, this._voicePtr, 8);
                this.port.postMessage({
                    type: 'voiceState',
                    voices: [
                        { instr: v[0], pos: v[1] },
                        { instr: v[2], pos: v[3] },
                        { instr: v[4], pos: v[5] },
                        { instr: v[6], pos: v[7] },
                    ]
                });
            }
        }

        return true;
    }
}

registerProcessor('startrekker-am-processor', StartrekkerAMProcessor);
