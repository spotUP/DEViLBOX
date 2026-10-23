import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * S14001A AudioWorklet Processor
 * SSi TSI S14001A Speech IC (Berzerk) for DEViLBOX
 *
 * 4-voice polyphonic delta modulation speech synth.
 * 2-bit deltas, 4-bit DAC, voiced/unvoiced modes.
 * Based on MAME emulator by Ed Bernard, Jonathan Gevaryahu.
 */
class S14001AProcessor extends MameChipProcessor {
  chip = 'S14001A';
  romPtr = 0;
  frameBufferPtr = 0;

  handleChipMessage(data) {
    switch (data.type) {
      case 'writeWord':
        if (this.synth) this.synth.writeWord(data.word);
        return true;
      case 'writeRegister':
        if (this.synth) this.synth.writeRegister(data.offset, data.value);
        return true;
      case 'setPreset':
        if (this.synth) this.synth.setPreset(data.value);
        return true;
      case 'setFrequency':
        // Handled via noteOn pitch
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

  loadFrameBuffer(frameData, numFrames) {
    if (!this.module || !this.synth) return;
    if (this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
    const size = numFrames * 4; // 4 bytes per frame
    this.frameBufferPtr = this.module._malloc(size);
    if (!this.frameBufferPtr) return;
    const bytes = new Uint8Array(frameData);
    const heapView = new Uint8Array(this.module.wasmMemory ? this.module.wasmMemory.buffer : this.module.HEAPU8.buffer);
    heapView.set(bytes, this.frameBufferPtr);
    this.synth.loadFrameBuffer(this.frameBufferPtr, numFrames);
  }

  loadROM(romData) {
    if (!this.module || !this.synth) { console.error('[S14001A Worklet] Cannot load ROM: synth not initialized'); return; }
    if (this.romPtr) { this.module._free(this.romPtr); this.romPtr = 0; }
    const size = romData.byteLength;
    this.romPtr = this.module._malloc(size);
    if (!this.romPtr) { console.error('[S14001A Worklet] Failed to allocate WASM memory for ROM'); return; }
    const romBytes = new Uint8Array(romData);
    const heapView = new Uint8Array(this.module.wasmMemory ? this.module.wasmMemory.buffer : this.module.HEAPU8.buffer);
    heapView.set(romBytes, this.romPtr);
    this.synth.loadROM(this.romPtr, size);
    console.log(`[S14001A Worklet] ROM loaded: ${size} bytes at WASM ptr ${this.romPtr}`);
    this.port.postMessage({ type: 'romLoaded', size });
  }

  cleanupChip() {
    if (this.module && this.romPtr) { this.module._free(this.romPtr); this.romPtr = 0; }
    if (this.module && this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
  }
}

registerProcessor('s14001a-processor', S14001AProcessor);
