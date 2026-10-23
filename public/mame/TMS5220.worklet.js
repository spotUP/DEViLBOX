import { MameChipProcessor } from './mameChipWorklet.js';

/**
 * TMS5220 AudioWorklet Processor
 * Texas Instruments LPC Speech Synthesizer (Speak & Spell) for DEViLBOX
 *
 * Supports two modes:
 * 1. ROM Speech: Load VSM ROM, speak words by byte address (MAME-accurate)
 * 2. MIDI: 4-voice polyphonic LPC synth with phoneme presets
 */
class TMS5220Processor extends MameChipProcessor {
  chip = 'TMS5220';
  romPtr = 0;
  frameBufferPtr = 0;

  handleChipMessage(data) {
    switch (data.type) {
      case 'activateSpeechVoice':
        if (this.synth) this.synth.activateSpeechVoice();
        return true;
      case 'setFormants':
        if (this.synth) this.synth.setFormants(data.k1, data.k2, data.k3);
        return true;
      case 'setNoiseMode':
        if (this.synth) this.synth.setNoiseMode(data.value);
        return true;
      case 'setLPCFrame':
        if (this.synth) {
          this.synth.setLPCFrame(
            data.energy, data.pitch, data.unvoiced ? 1 : 0,
            data.k[0], data.k[1], data.k[2], data.k[3], data.k[4],
            data.k[5], data.k[6], data.k[7], data.k[8], data.k[9]
          );
        }
        return true;
      case 'setChirpType':
        if (this.synth) this.synth.setChirpType(data.value);
        return true;
      case 'loadROM':
        this.loadROM(data.romData);
        return true;
      case 'speakAtByte':
        if (this.synth) {
          console.log(`[TMS5220 Worklet] speakAtByte: addr=${data.byteAddr}`);
          this.synth.speakAtByte(data.byteAddr);
        }
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
    if (!this.module || !this.synth) {
      console.error('[TMS5220 Worklet] Cannot load ROM: synth not initialized');
      return;
    }

    // Free old ROM if any
    if (this.romPtr) {
      this.module._free(this.romPtr);
      this.romPtr = 0;
    }

    // Allocate WASM memory and copy ROM data
    const size = romData.byteLength;
    this.romPtr = this.module._malloc(size);
    if (!this.romPtr) {
      console.error('[TMS5220 Worklet] Failed to allocate WASM memory for ROM');
      return;
    }

    const romBytes = new Uint8Array(romData);
    const heapView = new Uint8Array(
      this.module.wasmMemory
        ? this.module.wasmMemory.buffer
        : this.module.HEAPU8.buffer
    );
    heapView.set(romBytes, this.romPtr);

    // Tell the synth about the ROM
    this.synth.loadROM(this.romPtr, size);
    console.log(`[TMS5220 Worklet] ROM loaded: ${size} bytes at WASM ptr ${this.romPtr}`);

    this.port.postMessage({ type: 'romLoaded', size });
  }

  loadFrameBuffer(frameData, numFrames) {
    if (!this.module || !this.synth) {
      console.error('[TMS5220 Worklet] Cannot load frame buffer: synth not initialized');
      return;
    }

    // Free old frame buffer if any
    if (this.frameBufferPtr) {
      this.module._free(this.frameBufferPtr);
      this.frameBufferPtr = 0;
    }

    // Allocate WASM memory and copy frame data (12 bytes per frame)
    const size = numFrames * 12;
    this.frameBufferPtr = this.module._malloc(size);
    if (!this.frameBufferPtr) {
      console.error('[TMS5220 Worklet] Failed to allocate WASM memory for frame buffer');
      return;
    }

    const bytes = new Uint8Array(frameData);
    const heapView = new Uint8Array(
      this.module.wasmMemory
        ? this.module.wasmMemory.buffer
        : this.module.HEAPU8.buffer
    );
    heapView.set(bytes, this.frameBufferPtr);

    // Tell the synth about the frame buffer
    this.synth.loadFrameBuffer(this.frameBufferPtr, numFrames);
  }

  cleanupChip() {
    if (this.module && this.romPtr) { this.module._free(this.romPtr); this.romPtr = 0; }
    if (this.module && this.frameBufferPtr) { this.module._free(this.frameBufferPtr); this.frameBufferPtr = 0; }
  }
}

registerProcessor('tms5220-processor', TMS5220Processor);
