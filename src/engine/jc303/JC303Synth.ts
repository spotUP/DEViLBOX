import * as Tone from 'tone';

export class JC303Synth extends Tone.ToneAudioNode {
  readonly name = 'JC303Synth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static isWorkletLoaded: boolean = false;
  private static initializationPromise: Promise<void> | null = null;

  // Post-processing effects
  private overdrive: Tone.WaveShaper;
  private overdriveGain: Tone.Gain;
  private overdriveAmount: number = 0;

  // Compatibility properties
  public config: any = {};
  public audioContext: AudioContext;

  constructor() {
    super();
    this.audioContext = this.context.rawContext as AudioContext;
    this.output = new Tone.Gain(1);
    
    // Overdrive setup
    this.overdriveGain = new Tone.Gain(1);
    this.overdrive = new Tone.WaveShaper((x) => {
      const drive = 1 + this.overdriveAmount * 8;
      return Math.tanh(x * drive) / Math.tanh(drive);
    }, 4096);

    this.overdriveGain.connect(this.overdrive);
    this.overdrive.connect(this.output);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await JC303Synth.ensureInitialized(this.context.rawContext as AudioContext);
      this.createNode();
    } catch (err) {
      console.error('[JC303] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded && this.wasmBinary) return;
    
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      if (!this.wasmBinary) {
        const response = await fetch('jc303/JC303.wasm');
        this.wasmBinary = await response.arrayBuffer();
      }

      if (!this.isWorkletLoaded) {
        await context.audioWorklet.addModule('JC303.worklet.js');
        this.isWorkletLoaded = true;
      }
    })();

    return this.initializationPromise;
  }

  private createNode(): void {
    if (!JC303Synth.wasmBinary) return;

    const context = this.context.rawContext as AudioContext;
    
    this.workletNode = new AudioWorkletNode(context, 'jc303-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: context.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[JC303] Node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: JC303Synth.wasmBinary
    });

    // Connect to overdrive input instead of direct output
    Tone.connect(this.workletNode, this.overdriveGain);
  }

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this.workletNode) return;
    
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : Math.round(12 * Math.log2(note / 440) + 69);
    
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: Math.floor(velocity * 127),
      detune: 0
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0 
    });
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number): void {
    this.triggerAttack(note, time, velocity);
    
    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
        this.triggerRelease();
    }, d * 1000);
  }

  setParam(param: string, value: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'param',
      param,
      value
    });
  }

  setCutoff(hz: number): void { this.setParam('cutoff', hz); }
  setResonance(val: number): void { this.setParam('resonance', val); }
  setEnvMod(val: number): void { this.setParam('env_mod', val); }
  setDecay(ms: number): void { this.setParam('decay', ms); }
  setAccent(val: number): void { this.setParam('accent', val); }
  setAccentAmount(val: number): void { this.setAccent(val); }
  
  setWaveform(mix: number): void { this.setParam('waveform', mix); }
  
  // Tuning expects cents (from ToneEngine automation), but Open303 expects Hz
  setTuning(cents: number): void { 
    const hz = 440 * Math.pow(2, cents / 1200);
    this.setParam('tuning', hz); 
  }
  
  setSlideTime(ms: number): void { this.setParam('slide_time', ms); }

  setOverdrive(amount: number): void {
    this.overdriveAmount = Math.min(Math.max(amount, 0), 100) / 100;
    
    // Update waveshaper curve
    const curve = new Float32Array(4096);
    const drive = 1 + this.overdriveAmount * 8;
    for (let i = 0; i < 4096; i++) {
        const x = (i / 4096) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.overdrive.curve = curve;

    // Boost input gain
    this.overdriveGain.gain.linearRampTo(1 + this.overdriveAmount * 2, 0.03);
  }

  setVolume(volumeDb: number): void {
    // Open303 setVolume uses dB, but my wrapper passes it directly
    // Also update output gain
    // this.setParam('volume', volumeDb); // Open303 volume
    // But let's use Tone.js gain for consistency
    this.output.gain.value = Tone.dbToGain(volumeDb);
  }

  // GuitarML stubs
  async loadGuitarMLModel(_index: number): Promise<void> {}
  async setGuitarMLEnabled(_enabled: boolean): Promise<void> {}
  setGuitarMLMix(_mix: number): void {}

  // Stubs for Devil Fish compatibility (JC303 doesn't support them yet)
  enableDevilFish(_enabled: boolean, _config?: any): void {}
  setNormalDecay(_decayMs: number): void {}
  setAccentDecay(_decayMs: number): void {}
  setVegDecay(_decayMs: number): void {}
  setVegSustain(_percent: number): void {}
  setSoftAttack(_timeMs: number): void {}
  setFilterTracking(_percent: number): void {}
  setFilterFM(_percent: number): void {}
  setSweepSpeed(_mode: string): void {}
  setAccentSweepEnabled(_enabled: boolean): void {}
  setHighResonance(_enabled: boolean): void {}
  setMuffler(_mode: string): void {}
  
  // Quality stub
  setQuality(_quality: string): void {}

  dispose(): this {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.overdriveGain.dispose();
    this.overdrive.dispose();
    super.dispose();
    return this;
  }
}
