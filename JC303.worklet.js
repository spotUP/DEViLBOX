/**
 * JC303 AudioWorklet Processor
 * 
 * Runs the Open303 engine (via JC303 WASM) in the audio thread.
 */

try {
  importScripts('jc303/JC303.js');
} catch (e) {
  console.error('[JC303] Failed to import scripts:', e);
}

class JC303Processor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.module = null;
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
                this.initModule(msg.wasmBinary);
                break;
            
            case 'noteOn':
                if (this.isReady) {
                    this.module._jc303_note_on(msg.note, msg.velocity, msg.detune || 0);
                }
                break;
                
            case 'noteOff':
                if (this.isReady) {
                     this.module._jc303_note_on(msg.note, 0, 0);
                }
                break;
                
            case 'param':
                if (this.isReady && this.module[`_jc303_set_${msg.param}`]) {
                    this.module[`_jc303_set_${msg.param}`](msg.value);
                }
                break;
        }
    }

    async initModule(wasmBinary) {
        if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
        
        try {
            if (typeof JC303Module === 'undefined') {
                console.error('[JC303] JC303Module not found. Make sure JC303.js is loaded.');
                return;
            }

            this.module = await JC303Module({
                wasmBinary: wasmBinary,
                print: (msg) => console.log('[JC303 WASM]', msg),
                printErr: (msg) => console.error('[JC303 WASM]', msg)
            });

            // Initialize engine
            this.module._jc303_init(sampleRate);
            this.module._jc303_set_buffer_size(this.bufferSize);
            
            // Get pointers
            const ptrL = this.module._jc303_get_buffer_pointer(0);
            const ptrR = this.module._jc303_get_buffer_pointer(1);
            
            // Create views
            this.bufferL = ptrL >> 2;
            this.bufferR = ptrR >> 2;
            
            this.isReady = true;
            this.port.postMessage({ type: 'ready' });
            
        } catch (e) {
            console.error('[JC303] Initialization failed:', e);
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isReady) return true;
        
        const output = outputs[0];
        const numChannels = output.length;
        
        // Run simulation
        this.module._jc303_process(this.bufferSize);
        
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