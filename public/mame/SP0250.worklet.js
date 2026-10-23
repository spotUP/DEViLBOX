import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * SP0250 AudioWorklet Processor
 * GI SP0250 Digital LPC Sound Synthesizer for DEViLBOX
 *
 * 4-voice polyphonic LPC vocal synth based on the GI SP0250.
 * 6-stage lattice filters with 128-entry coefficient ROM.
 * Based on MAME emulator by Olivier Galibert.
 */
class SP0250Processor extends MameChipProcessor {
  chip = 'SP0250';
  frameBufferPtr = 0;

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeFIFO':
        if (this.synth) this.synth.writeFIFO(data.index, data.data);
        return true;
      case 'setFilterCoeff':
        if (this.synth) this.synth.setFilterCoeff(data.filterIdx, data.isB ? 1 : 0, data.value);
        return true;
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setVowel':
        if (this.synth) this.synth.setVowel(data.value);
        return true;
      case 'loadFrameBuffer':
        this.loadFrameBuffer(data.frameData, data.numFrames);
        return true;
      case 'speakFrameBuffer':
        if (this.synth) this.synth.speakFrameBuffer();
        return true;
      case 'stopSpeaking':
        if (this.synth) this.synth.stopSpeaking();
        return true;
    }
    return false;
  }

  loadFrameBuffer(frameData, numFrames) {
    if (!this.module || !this.synth) return;
    if (this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
    const size = numFrames * 15;
    this.frameBufferPtr = this.module._malloc(size);
    if (!this.frameBufferPtr) return;
    const bytes = new Uint8Array(frameData);
    const heapView = new Uint8Array(this.module.wasmMemory ? this.module.wasmMemory.buffer : this.module.HEAPU8.buffer);
    heapView.set(bytes, this.frameBufferPtr);
    this.synth.loadFrameBuffer(this.frameBufferPtr, numFrames);
  }

  cleanupChip() {
    if (this.module && this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
  }
}

registerProcessor('sp0250-processor', SP0250Processor);
