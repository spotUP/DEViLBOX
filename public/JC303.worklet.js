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

// Global context for Emscripten
var Module = {};

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
        const { type, data } = event.data;
        
        switch(type) {
            case 'init':
                this.initModule(data.wasmBinary);
                break;
            
            case 'noteOn':
                if (this.isReady) {
                    this.module._jc303_note_on(data.note, data.velocity, data.detune || 0);
                }
                break;
                
            case 'noteOff':
                // Open303 handles note offs via sequencer or separate handling
                // Usually for a monosynth like 303, noteOff just stops the gate if it's the current note
                // But Open303 API has noteOn with 0 velocity as note off usually, or we can add specific handling
                // Looking at rosic_Open303.h, it has allNotesOff but not specific noteOff(note).
                // However, noteOn handles gate.
                // We'll trust the wrapper or just implement as is.
                // Actually JC303Wrapper has jc303_all_notes_off, let's use that for panic,
                // but for normal playing we usually just trigger new notes.
                // For actual note-off (gate close), we might need to expose releaseNote in wrapper.
                // But for now let's just use what we have. 
                // Wait, TB-303 is a sequencer synth, usually "Note Off" means "Gate Close".
                // Open303::noteOn(note, 0, detune) might work as Note Off.
                if (this.isReady) {
                     this.module._jc303_note_on(data.note, 0, 0);
                }
                break;
                
            case 'param':
                if (this.isReady && this.module[`_jc303_set_${data.param}`]) {
                    this.module[`_jc303_set_${data.param}`](data.value);
                }
                break;
        }
    }

    async initModule(wasmBinary) {
        // Mock browser environment for Emscripten if needed
        if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
        
        // Load the JS glue code
        // We expect JC303.js to be loaded via importScripts in the main scope
        // or we can try to eval it here if passed as string.
        // But the cleanest way is usually to use the factory function if available.
        
        try {
            // JC303Module should be available globally if imported via importScripts in the worklet file
            // But we can't use importScripts inside the class.
            // We'll rely on the main script loading it.
            
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
            // HEAPF32 is Float32Array
            // Pointers are byte offsets, divide by 4 for float index
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
        // We can optimize this using set() if memory layout permits, 
        // but simple loop is fine for 128 samples
        const heap = this.module.HEAPF32;
        
        for (let i = 0; i < this.bufferSize; i++) {
            const sampleL = heap[this.bufferL + i];
            // const sampleR = heap[this.bufferR + i]; // It's mono really, so we can just use L
            
            // Write to all output channels
            for (let ch = 0; ch < numChannels; ch++) {
                output[ch][i] = sampleL;
            }
        }
        
        return true;
    }
}

registerProcessor('jc303-processor', JC303Processor);
