import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * VLM5030 AudioWorklet Processor
 * Sanyo VLM5030 LPC Speech Synthesizer (Konami arcade) for DEViLBOX
 *
 * 4-voice polyphonic 10-pole LPC lattice filter speech synth.
 * Based on MAME emulator by Tatsuyuki Satoh.
 */
class VLM5030Processor extends MameChipProcessor {
  chip = 'VLM5030';
  romPtr = 0;
  frameBufferPtr = 0;

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setVowel':
        if (this.synth) this.synth.setVowel(data.value);
        return true;
      case 'setFrequency':
        return true;
      case 'setPanning':
        if (this.synth) this.synth.setParameter(4, data.pan);
        return true;
      case 'loadROM':
        this.loadROM(data.romData);
        return true;
      case 'speakWord':
        if (this.synth) this.synth.speakWord(data.wordIndex);
        return true;
      case 'speakAtAddress':
        if (this.synth) this.synth.speakAtAddress(data.byteAddr);
        return true;
      case 'stopSpeaking':
        if (this.synth) this.synth.stopSpeaking();
        return true;
      case 'loadFrameBuffer':
        this.loadFrameBuffer(data.frameData, data.numFrames);
        return true;
      case 'speakFrameBuffer':
        if (this.synth) this.synth.speakFrameBuffer();
        return true;
    }
    return false;
  }

  loadROM(romData) {
    if (!this.module || !this.synth) { console.error('[VLM5030 Worklet] Cannot load ROM: synth not initialized'); return; }
    if (this.romPtr) { this.module._free(this.romPtr); this.romPtr = 0; }
    const size = romData.byteLength;
    this.romPtr = this.module._malloc(size);
    if (!this.romPtr) { console.error('[VLM5030 Worklet] Failed to allocate WASM memory for ROM'); return; }
    const romBytes = new Uint8Array(romData);
    const heapView = new Uint8Array(this.module.wasmMemory ? this.module.wasmMemory.buffer : this.module.HEAPU8.buffer);
    heapView.set(romBytes, this.romPtr);
    this.synth.loadROM(this.romPtr, size);
    console.log(`[VLM5030 Worklet] ROM loaded: ${size} bytes at WASM ptr ${this.romPtr}`);
    this.port.postMessage({ type: 'romLoaded', size });
  }

  loadFrameBuffer(frameData, numFrames) {
    if (!this.module || !this.synth) return;
    if (this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
    const size = numFrames * 12;
    this.frameBufferPtr = this.module._malloc(size);
    if (!this.frameBufferPtr) return;
    const bytes = new Uint8Array(frameData);
    const heapView = new Uint8Array(this.module.wasmMemory ? this.module.wasmMemory.buffer : this.module.HEAPU8.buffer);
    heapView.set(bytes, this.frameBufferPtr);
    this.synth.loadFrameBuffer(this.frameBufferPtr, numFrames);
  }

  cleanupChip() {
    if (this.module && this.romPtr) { this.module._free(this.romPtr); this.romPtr = 0; }
    if (this.module && this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
  }
}

registerProcessor('vlm5030-processor', VLM5030Processor);
