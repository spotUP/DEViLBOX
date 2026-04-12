// CoreDesign.worklet.js — AudioWorklet for Core Design replayer WASM engine
const WORKLET_SAMPLE_RATE = 28150;

class CoreDesignProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this._wasm = null;
        this._ready = false;
        this._outPtr = 0;
        this.port.onmessage = (e) => this._handleMessage(e.data);
    }

    async _handleMessage(msg) {
        switch (msg.type) {
        case 'init':
            await this._initWasm(msg.sampleRate, msg.wasmBinary, msg.jsCode);
            break;
        case 'load': {
            if (!this._wasm) return;
            const data = new Uint8Array(msg.data);
            const ptr = this._wasm._malloc(data.length);
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
        default:
            break;
        }
    }

    async _initWasm(sampleRate, wasmBinary, jsCode) {
        try {
            if (!jsCode) { this.port.postMessage({ type: 'error', msg: 'no jsCode' }); return; }
            let code = jsCode;
            if (wasmBinary) {
                code = code.replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];');
            }
            code = code
                .replace(/import\.meta\.url/g, "'.'")
                .replace(/export\s+default\s+\w+;?/g, '');
            const wrappedCode = code + '\nreturn createCoreDesign;';
            const factory = new Function('module', wrappedCode);
            const createFn = factory({});
            const config = { noInitialRun: true };
            if (wasmBinary) config.wasmBinary = wasmBinary;
            this._wasm = await createFn(config);
            this._wasm._player_init(sampleRate || WORKLET_SAMPLE_RATE);
            this._outPtr = this._wasm._malloc(128 * 2 * 4);
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
        const wasm = this._wasm;
        const out = outputs[0];
        const outL = out[0];
        const outR = out[1];
        const frames = outL ? outL.length : 128;
        wasm._player_render(this._outPtr, frames);
        const heap = new Float32Array(wasm.HEAPF32.buffer, this._outPtr, frames * 2);
        if (outL && outR) {
            for (let i = 0; i < frames; i++) {
                outL[i] = heap[i * 2];
                outR[i] = heap[i * 2 + 1];
            }
        }
        return true;
    }
}

registerProcessor('coredesign-processor', CoreDesignProcessor);
