import * as Tone from 'tone';
import { MAMEEngine } from './MAMEEngine';
// Audio context utilities no longer needed - using Tone.js rawContext directly

export type MAMESynthType = 'vfx' | 'doc' | 'rsa' | 'swp30';

export interface MAMESynthConfig {
  type: MAMESynthType;
  clock?: number;
  roms?: Array<{ bank: number, data: Uint8Array }>;
}

interface MAMEVoice {
  note: string;
  active: boolean;
  voiceIndex: number;
  startTime: number;
}

/**
 * MAMESynth - Tone.js node wrapper for MAME-based synth engines
 */
export class MAMESynth extends Tone.ToneAudioNode {
  readonly name = 'MAMESynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private engine = MAMEEngine.getInstance();
  private outputGain: Tone.Gain;
  private config: MAMESynthConfig;
  private isInitialized: boolean = false;
  private initInProgress: boolean = false;
  private handle: number = 0;

  // Voice allocation
  private voices: MAMEVoice[] = [];
  private numHardwareVoices: number = 32;

  constructor(config: MAMESynthConfig) {
    super();
    this.config = config;
    this.outputGain = new Tone.Gain(1);
    this.output = this.outputGain;

    if (config.type === 'rsa') this.numHardwareVoices = 16;
    else if (config.type === 'swp30') this.numHardwareVoices = 64;
    
    // Initialize voice pool
    for (let i = 0; i < this.numHardwareVoices; i++) {
      this.voices.push({ note: '', active: false, voiceIndex: i, startTime: 0 });
    }

    this.initEngine();
  }

  /**
   * Wait for WASM engine to initialize - used by test runner
   */
  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initInProgress) {
      // Poll until init completes (max 10s)
      for (let i = 0; i < 200; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (this.isInitialized || !this.initInProgress) break;
      }
      return;
    }
    await this.initEngine();
  }

  private async initEngine(): Promise<void> {
    if (this.initInProgress || this.isInitialized) return;
    this.initInProgress = true;

    try {
      await this.engine.init();
      
      // Init the specific chip
      let defaultClock = 16000000;
      if (this.config.type === 'rsa') defaultClock = 20000000;
      else if (this.config.type === 'swp30') defaultClock = 33868800;

      const clock = this.config.clock || defaultClock;
      this.handle = this.engine.createInstance(this.config.type, clock);
      
      // Load ROMs if provided
      if (this.config.roms) {
        for (const rom of this.config.roms) {
          this.engine.setRom(rom.bank, rom.data);
        }
      }

      this.isInitialized = true;
      console.log(`🎹 MAMESynth: ${this.config.type.toUpperCase()} initialized (Handle: ${this.handle})`);

      // Initial register setup
      if (this.config.type === 'vfx') {
        this.engine.write(this.handle, 0x58, 31); // 32 active voices
        this.engine.write(this.handle, 0x60, 0x01); // Single master mode
      }

      // Start the rendering loop
      this.startRendering();
    } catch (err) {
      console.error('[MAMESynth] Failed to initialize:', err);
    } finally {
      this.initInProgress = false;
    }
  }

  private startRendering(): void {
    const bufferSize = 512; // Minimum 256 for ScriptProcessor

    // Get the TRUE native context from Tone.js
    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    if (!rawContext || !rawContext.createScriptProcessor) {
      console.warn('[MAMESynth] ScriptProcessorNode not available, audio rendering disabled');
      return;
    }

    // Create a ScriptProcessorNode (deprecated but easiest for this hack)
    const processor = rawContext.createScriptProcessor(bufferSize, 0, 2);

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isInitialized || this.handle === 0) return;

      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);

      const { left, right } = this.engine.render(this.handle, bufferSize);

      outL.set(left);
      outR.set(right);
    };

    // Connect ScriptProcessor to Tone.js output - use the native GainNode
    const nativeOutput = this.outputGain.input as AudioNode;
    processor.connect(nativeOutput);
  }

  public getHandle(): number {
    return this.handle;
  }

  /**
   * Write to synth register
   */
  public write(offset: number, value: number): void {
    if (this.isInitialized && this.handle !== 0) {
      this.engine.write(this.handle, offset, value);
    }
  }

  /**
   * Write 16-bit word
   */
  public write16(offset: number, value: number): void {
    if (this.isInitialized && this.handle !== 0) {
      this.engine.write16(this.handle, offset, value);
    }
  }

  /**
   * Read from register
   */
  public read(offset: number): number {
    if (this.isInitialized && this.handle !== 0) {
      return this.engine.read(this.handle, offset);
    }
    return 0;
  }

  private findFreeVoice(): MAMEVoice {
    // 1. Try to find an inactive voice
    const free = this.voices.find(v => !v.active);
    if (free) return free;

    // 2. Steal the oldest voice
    return this.voices.sort((a, b) => a.startTime - b.startTime)[0];
  }

  /**
   * Trigger a note (maps to synth-specific register writes)
   */
  public triggerAttack(note: string, _time?: number, velocity: number = 1.0): this {
    if (!this.isInitialized || this.handle === 0) return this;

    const freq = Tone.Frequency(note).toFrequency();
    const voice = this.findFreeVoice();
    
    voice.note = note;
    voice.active = true;
    voice.startTime = Date.now();

    const vIdx = voice.voiceIndex;

    if (this.config.type === 'vfx') {
      this.engine.write(this.handle, 0x78, vIdx); // PAGE
      this.engine.write16(this.handle, 0x00, 0x0001); // STOP
      
      const sampleRate = 44100;
      const freqCount = Math.floor((freq * 2048 * 32) / sampleRate);
      this.engine.write16(this.handle, 0x08, freqCount & 0xFFFF);
      this.engine.write(this.handle, 0x0A, (freqCount >> 16) & 0xFF);
      
      // Default loop for testing
      this.engine.write16(this.handle, 0x80 | 0x08, 0x0000); 
      this.engine.write16(this.handle, 0x80 | 0x10, 0x2000); 
      
      const vol = Math.floor(velocity * 0xFFFF);
      this.engine.write16(this.handle, 0x10, vol);
      
      this.engine.write16(this.handle, 0x00, 0x0000); // PLAY
    } else if (this.config.type === 'doc') {
      // ES5503 (DOC) - Flat address space
      this.engine.write(this.handle, 0xE0, 0x00); 
      this.engine.write(this.handle, 0x00 + vIdx, 0); // STOP bit in control?
      
      const freqVal = Math.floor((freq * 0x10000) / (32000 / 32));
      this.engine.write(this.handle, 0x00 + vIdx, freqVal & 0xFF);
      this.engine.write(this.handle, 0x20 + vIdx, (freqVal >> 8) & 0xFF);
      this.engine.write(this.handle, 0x40 + vIdx, Math.floor(velocity * 255));
      this.engine.write(this.handle, 0x80 + vIdx, 0x00); // PLAY
    } else if (this.config.type === 'rsa') {
      // Roland SA - Each voice has 10 parts
      // Pitch mapping: 0x4000 = 32000Hz (for 32kHz mode)
      const pitchVal = Math.floor((freq * 0x4000) / 32000);
      
      for (let part = 0; part < 10; part++) {
        const mem_offset = vIdx * 0x100 + part * 0x10;
        this.engine.write(this.handle, mem_offset + 0, pitchVal & 0xFF);
        this.engine.write(this.handle, mem_offset + 1, (pitchVal >> 8) & 0xFF);
        // Start envelope ramp
        this.engine.write(this.handle, mem_offset + 5, 0x7F); // Max speed ramp up
      }
    } else if (this.config.type === 'swp30') {
      // Yamaha SWP30 (AWM2) - 64 registers per channel
      const chan_base = vIdx << 6;
      const pitch = Math.floor((freq * 1024) / 44100); // Very rough guess
      this.engine.write16(this.handle, chan_base | 0x0a, pitch);
    }

    return this;
  }

  public triggerRelease(note: string, _time?: number): this {
    if (!this.isInitialized || this.handle === 0) return this;
    
    const voice = this.voices.find(v => v.active && v.note === note);
    if (!voice) return this;

    voice.active = false;
    const vIdx = voice.voiceIndex;

    if (this.config.type === 'vfx') {
      this.engine.write(this.handle, 0x78, vIdx);
      this.engine.write16(this.handle, 0x00, 0x0001); // Stop
    } else if (this.config.type === 'doc') {
      this.engine.write(this.handle, 0x80 + vIdx, 0x01); // Halt
    } else if (this.config.type === 'rsa') {
      for (let part = 0; part < 10; part++) {
        const mem_offset = vIdx * 0x100 + part * 0x10;
        // Ramp envelope down
        this.engine.write(this.handle, mem_offset + 5, 0xFF); // Max speed ramp down (bit 7 set)
      }
    }
    
    return this;
  }

  public dispose(): this {
    if (this.handle !== 0) {
      this.engine.deleteInstance(this.handle);
      this.handle = 0;
    }
    super.dispose();
    this.outputGain.dispose();
    return this;
  }
}
