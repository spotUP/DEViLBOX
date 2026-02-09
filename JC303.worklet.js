/**
 * JC303 AudioWorklet Processor
 * 
 * Runs the Open303 engine (via JC303 WASM) in the audio thread.
 * Supports multiple instances via handle-based system.
 */

class JC303Processor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.module = null;
        this.handle = 0; // Instance handle from C++
        this.isReady = false;
        
        // Pointers
        this.bufferL = null;
        this.bufferR = null;
        this.bufferSize = 128;
        
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        const msg = event.data;
        if (!msg) return;
        
        const type = msg.type;
        
        switch(type) {
            case 'init':
                this.initModule(msg.wasmBinary, msg.jsCode);
                break;
            
            case 'noteOn':
                if (this.isReady && this.handle !== 0) {
                    this.module._jc303_note_on(this.handle, msg.note, msg.velocity, msg.detune || 0);
                }
                break;
                
            case 'noteOff':
                if (this.isReady && this.handle !== 0) {
                     // noteOn with 0 velocity is noteOff in Open303
                     this.module._jc303_note_on(this.handle, msg.note, 0, 0);
                }
                break;
                
            case 'param':
                if (this.isReady && this.handle !== 0) {
                    const setterName = `_jc303_set_${msg.param}`;
                    if (this.module[setterName]) {
                        this.module[setterName](this.handle, msg.value);
                    } else {
                        console.warn(`[JC303 Worklet] Unknown parameter: ${msg.param}`);
                    }
                }
                break;
        }
    }

    async initModule(wasmBinary, jsCode) {
        if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
        
        try {
            // Load the JS glue code if not already globally loaded
            if (jsCode && typeof JC303Module === 'undefined') {
                const factory = new Function('var Module = {}; ' + jsCode + '; return JC303Module;');
                globalThis.JC303Module = factory();
            }

            if (typeof JC303Module === 'undefined') {
                console.error('[JC303] JC303Module not found.');
                return;
            }

            // Standard Emscripten instantiation
            this.module = await JC303Module({
                wasmBinary: wasmBinary,
                print: (msg) => console.log('[JC303 WASM]', msg),
                printErr: (msg) => console.error('[JC303 WASM]', msg)
            });

            // Create a new C++ instance for this processor
            this.handle = this.module._jc303_create(sampleRate);
            this.module._jc303_set_buffer_size(this.handle, this.bufferSize);
            
            // Get pointers for this instance
            const ptrL = this.module._jc303_get_buffer_pointer(this.handle, 0);
            const ptrR = this.module._jc303_get_buffer_pointer(this.handle, 1);
            
            // Create views
            this.bufferL = ptrL >> 2;
            this.bufferR = ptrR >> 2;
            
            this.isReady = true;
            this.port.postMessage({ type: 'ready' });
            console.log(`[JC303 Worklet] Instance ready (Handle: ${this.handle})`);
            
        } catch (e) {
            console.error('[JC303] Initialization failed:', e);
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isReady || this.handle === 0) return true;
        
        const output = outputs[0];
        const numChannels = output.length;
        
        // Run simulation for this specific handle
        this.module._jc303_process(this.handle, this.bufferSize);
        
        // Copy to output
        const heap = this.module.HEAPF32;
        
        for (let i = 0; i < this.bufferSize; i++) {
            const sampleL = heap[this.bufferL + i];
            
            // Write to all output channels
            for (let ch = 0; ch < numChannels; ch++) {
                output[ch][i] = sampleL;
            }
        }
        
        return true;
    }
}

registerProcessor('jc303-processor', JC303Processor);