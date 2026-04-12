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
            break;
        case 'setPatternCell':
            if (this._wasm && this._wasm._player_set_pattern_cell) {
                this._wasm._player_set_pattern_cell(msg.pattern, msg.row, msg.channel, msg.b0, msg.b1, msg.b2, msg.b3);
            }
            break;
        case 'setMuteMask':
            this.muteMask = msg.mask;
            break;
        default:
            break;
        }
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

        const heap = new Float32Array(wasm.HEAPF32.buffer, this._outPtr, frames * 2);
        if (outL && outR) {
            for (let i = 0; i < frames; i++) {
                outL[i] = heap[i * 2];
                outR[i] = heap[i * 2 + 1];
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
