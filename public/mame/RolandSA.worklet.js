import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * Roland SA AudioWorklet Processor
 * Silicon-Accurate 16-Voice Sample Player for DEViLBOX
 *
 * Gate array emulation from Roland SA-synthesis digital pianos.
 * 16 voices x 10 parts = 160 concurrent sample parts.
 * 3 wave ROMs (IC5, IC6, IC7) - 128KB each = 384KB total.
 *
 * Used in: Roland HP-3000S, HP-2000, KR-33
 */
class RolandSAProcessor extends MameChipProcessor {
  chip = 'RolandSA';
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
          this.synth.loadROM(data.romId, romPtr, data.size);
          this.module._free(romPtr);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('rolandsa-processor', RolandSAProcessor);
