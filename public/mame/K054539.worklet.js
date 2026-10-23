import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * K054539 AudioWorklet Processor
 * Konami PCM/ADPCM Sound Chip for DEViLBOX
 */
class K054539Processor extends MameChipProcessor {
  chip = 'K054539';

  handleChipMessage(data) {
    switch (data.type) {
      case 'keyOn':
        if (this.synth) {
          this.synth.keyOn(data.channel);
        }
        return true;
      case 'keyOff':
        if (this.synth) {
          this.synth.keyOff(data.channel);
        }
        return true;
      case 'loadROM':
        if (this.synth && this.module) {
          if (!this.module.wasmMemory) {
            console.error("[Worklet] WASM memory not available");
            return true;
          }
          // Allocate memory for ROM data
          const romPtr = this.module._malloc(data.size);
          const heap = new Uint8Array(this.module.wasmMemory.buffer);
          const romView = new Uint8Array(heap.buffer, romPtr, data.size);
          romView.set(new Uint8Array(data.data));
          this.synth.loadROM(data.offset, romPtr, data.size);
          this.module._free(romPtr);
        }
        return true;
      case 'configureChannel':
        if (this.synth) {
          this.synth.configureChannel(
            data.channel,
            data.startAddr,
            data.loopAddr,
            data.sampleType,
            data.loopEnable,
            data.reverse
          );
        }
        return true;
      case 'setChannelPitch':
        if (this.synth) {
          this.synth.setChannelPitch(data.channel, data.delta);
        }
        return true;
      case 'setChannelVolume':
        if (this.synth) {
          this.synth.setChannelVolume(data.channel, data.volume);
        }
        return true;
      case 'setChannelPan':
        if (this.synth) {
          this.synth.setChannelPan(data.channel, data.pan);
        }
        return true;
      case 'setChannelGain':
        if (this.synth) {
          this.synth.setChannelGain(data.channel, data.gain);
        }
        return true;
    }
    return false;
  }
}

registerProcessor('k054539-processor', K054539Processor);
