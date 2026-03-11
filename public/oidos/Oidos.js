
let wasm;

const cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8Memory0 = new Uint8Array();

function getUint8Memory0() {
    if (cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

let cachedFloat32Memory0 = new Float32Array();

function getFloat32Memory0() {
    if (cachedFloat32Memory0.byteLength === 0) {
        cachedFloat32Memory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32Memory0;
}

let WASM_VECTOR_LEN = 0;

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4);
    getFloat32Memory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
*/
export class OidosSynth {

    static __wrap(ptr) {
        const obj = Object.create(OidosSynth.prototype);
        obj.ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.ptr;
        this.ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_oidossynth_free(ptr);
    }
    /**
    * @param {number} sample_rate
    */
    constructor(sample_rate) {
        const ret = wasm.oidossynth_new(sample_rate);
        return OidosSynth.__wrap(ret);
    }
    /**
    * Set parameter (0-1 normalized)
    * @param {number} index
    * @param {number} value
    */
    set_parameter(index, value) {
        wasm.oidossynth_set_parameter(this.ptr, index, value);
    }
    /**
    * Note on (MIDI note number 0-127)
    * @param {number} note
    * @param {number} _velocity
    */
    note_on(note, _velocity) {
        wasm.oidossynth_note_on(this.ptr, note, _velocity);
    }
    /**
    * Note off
    * @param {number} note
    */
    note_off(note) {
        wasm.oidossynth_note_off(this.ptr, note);
    }
    /**
    * Process audio block (mono output)
    * @param {Float32Array} output
    */
    process(output) {
        try {
            var ptr0 = passArrayF32ToWasm0(output, wasm.__wbindgen_malloc);
            var len0 = WASM_VECTOR_LEN;
            wasm.oidossynth_process(this.ptr, ptr0, len0);
        } finally {
            output.set(getFloat32Memory0().subarray(ptr0 / 4, ptr0 / 4 + len0));
            wasm.__wbindgen_free(ptr0, len0 * 4);
        }
    }
    /**
    * Get memory estimate in bytes (for UI display)
    * @returns {number}
    */
    get_memory_estimate() {
        const ret = wasm.oidossynth_get_memory_estimate(this.ptr);
        return ret >>> 0;
    }
    /**
    * Get active voice count
    * @returns {number}
    */
    get_active_voices() {
        const ret = wasm.oidossynth_get_active_voices(this.ptr);
        return ret >>> 0;
    }
}

async function load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function getImports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function initMemory(imports, maybe_memory) {

}

function finalizeInit(instance, module) {
    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;
    cachedFloat32Memory0 = new Float32Array();
    cachedUint8Memory0 = new Uint8Array();


    return wasm;
}

function initSync(module) {
    const imports = getImports();

    initMemory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return finalizeInit(instance, module);
}

async function init(input) {
    if (typeof input === 'undefined') {
        input = new URL('oidos_wasm_bg.wasm', import.meta.url);
    }
    const imports = getImports();

    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        input = fetch(input);
    }

    initMemory(imports);

    const { instance, module } = await load(await input, imports);

    return finalizeInit(instance, module);
}

export { initSync }
export default init;
