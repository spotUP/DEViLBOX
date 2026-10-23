import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * TR-707 AudioWorklet Processor
 * Roland TR-707 PCM Drum Machine for DEViLBOX
 *
 * 10-voice drum machine with RC envelope generators and analog signal chain.
 * 8 multiplexed voices (bass, snare, toms, hi-hat, rimshot, handclap)
 * + 2 cymbal voices (crash, ride) with independent ROMs.
 *
 * ROMs: IC34+IC35 (64KB voices), IC19 (32KB crash), IC22 (32KB ride)
 */
class TR707Processor extends MameChipProcessor {
  chip = 'TR707';
  deleteSynthOnCleanup = true;

  handleChipMessage(data) {
    switch (data.type) {
      case 'loadROM':
        if (this.synth && this.module) {
          if (!this.module.wasmMemory) {
            console.error("[Worklet] WASM memory not available");
            break;
          }
          const romPtr = this.module._malloc(data.size);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          const romView = new Uint8Array(heap.buffer, romPtr, data.size);
          romView.set(new Uint8Array(data.data));
          this.synth.loadROM(data.offset, romPtr, data.size);
          this.module._free(romPtr);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('tr707-processor', TR707Processor);
