import * as Tone from 'tone';
import { getNativeContext, createAudioWorkletNode } from '@utils/audio-context';

export class JC303Synth extends Tone.ToneAudioNode {
  readonly name = 'JC303Synth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static isWorkletLoaded: boolean = false;
  private static initializationPromise: Promise<void> | null = null;

  // Post-processing effects
  private overdrive: Tone.WaveShaper;
  private overdriveGain: Tone.Gain;
  private overdriveAmount: number = 0;

  // Compatibility properties
  public config: any = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;

  constructor() {
    super();
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);
    
    // Overdrive setup (Tone.js fallback/booster)
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
      const context = getNativeContext(this.context);
      await JC303Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[JC303] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded && this.wasmBinary && this.jsCode) return;
    
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      // Pre-load worklet module
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule('JC303.worklet.js');
        } catch (e) {
          // Module might already be added
        }
        this.isWorkletLoaded = true;
      }

      // Fetch assets
      const [wasmRes, jsRes] = await Promise.all([
        fetch('jc303/JC303.wasm'),
        fetch('jc303/JC303.js')
      ]);

      if (!wasmRes.ok || !jsRes.ok) {
        throw new Error('Failed to load JC303 assets');
      }

      const [wasmBinary, jsCode] = await Promise.all([
        wasmRes.arrayBuffer(),
        jsRes.text()
      ]);

      this.wasmBinary = wasmBinary;
      this.jsCode = jsCode;
    })();

    return this.initializationPromise;
  }

  private createNode(): void {
    if (!JC303Synth.wasmBinary || !JC303Synth.jsCode || this._disposed) return;

    // Use the wrapped context (this.context) for createAudioWorkletNode
    // This allows the helper to use context.createAudioWorkletNode if it exists (for polyfills)
    this.workletNode = createAudioWorkletNode(this.context, 'jc303-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: getNativeContext(this.context).sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[JC303] Node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: JC303Synth.wasmBinary,
      jsCode: JC303Synth.jsCode
    });

    // Connect to overdrive input instead of direct output
    Tone.connect(this.workletNode, this.overdriveGain);
  }

  triggerAttack(note: string | number, _time?: number, velocity: number = 1, accent: boolean = false, slide: boolean = false): void {
    if (!this.workletNode || this._disposed) return;
    
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : Math.round(12 * Math.log2(note / 440) + 69);
    
    // Map accent flag to velocity (Open303 uses vel >= 100 for accent)
    let finalVelocity = Math.floor(velocity * 127);
    if (accent && finalVelocity < 100) finalVelocity = 100;
    if (!accent && finalVelocity >= 100) finalVelocity = 99;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: finalVelocity,
      detune: 0,
      slide: slide // Note: slide is handled by overlap in Open303 core
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0 
    });
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number, accent: boolean = false, slide: boolean = false): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1, accent, slide);
    
    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
        if (!this._disposed) {
            this.triggerRelease();
        }
    }, d * 1000);
  }

  setParam(param: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    // console.log(`[JC303 Synth] setParam: ${param}=${value}`);
    this.workletNode.port.postMessage({
      type: 'param',
      param,
      value
    });
  }

  // --- Core Setters ---
  setCutoff(hz: number): void { this.setParam('cutoff', hz); }
  setResonance(val: number): void { this.setParam('resonance', val); }
  setEnvMod(val: number): void { this.setParam('env_mod', val); }
  setDecay(ms: number): void { this.setParam('decay', ms); }
  setAccent(val: number): void { this.setParam('accent', val); }
  setAccentAmount(val: number): void { this.setAccent(val); }
  setSlideTime(ms: number): void { this.setParam('slide_time', ms); }
  setVolume(volumeDb: number): void { this.setParam('volume', volumeDb); }
  
  setWaveform(mix: number | string): void { 
    let val = 0;
    if (typeof mix === 'string') {
      val = mix === 'square' ? 1.0 : 0.0;
    } else {
      val = mix;
    }
    this.setParam('waveform', val); 
  }
  
  setTuning(cents: number): void { 
    const hz = 440 * Math.pow(2, cents / 1200);
    this.setParam('tuning', hz); 
  }

  // --- Advanced / Devil Fish Setters ---
  enableDevilFish(_enabled: boolean, _config?: any): void {
    // Open303 advanced params are always "enabled" in C++, 
    // we just control whether we use them from JS.
  }

  setNormalDecay(ms: number): void { this.setParam('decay', ms); }
  setAccentDecay(ms: number): void { this.setParam('accent_decay', ms); }
  setVegDecay(ms: number): void { this.setParam('amp_decay', ms); }
  setVegSustain(percent: number): void { 
    // Convert 0..100% to -100..0 dB sustain
    const db = Tone.gainToDb(percent / 100);
    this.setParam('amp_sustain', db); 
  }
  setSoftAttack(ms: number): void { this.setParam('normal_attack', ms); }
  
  setFilterTracking(percent: number): void { this.setParam('filter_tracking', percent / 100); }
  setFilterFM(percent: number): void { this.setParam('filter_fm', percent / 100); }
  
  setMuffler(mode: string): void { 
    let val = 0;
    if (mode === 'soft') val = 1;
    if (mode === 'hard') val = 2;
    this.setParam('muffler', val); 
  }

  setSweepSpeed(_mode: string): void {}
  setAccentSweepEnabled(_enabled: boolean): void {}
  setQuality(_quality: string): void {}

  // High Resonance mapping (Open303 doesn't have a direct toggle, but we can boost reso)
  setHighResonance(_enabled: boolean): void {
    // If enabled, we could potentially scale resonance range in wrapper
  }
  setHighResonanceEnabled(enabled: boolean): void { this.setHighResonance(enabled); }

  setOverdrive(amount: number): void {
    if (this._disposed) return;
    this.overdriveAmount = Math.min(Math.max(amount, 0), 100) / 100;
    
    const curve = new Float32Array(4096);
    const drive = 1 + this.overdriveAmount * 8;
    for (let i = 0; i < 4096; i++) {
        const x = (i / 4096) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.overdrive.curve = curve;
    this.overdriveGain.gain.linearRampTo(1 + this.overdriveAmount * 2, 0.03);
  }

  async loadGuitarMLModel(_index: number): Promise<void> {}
  async setGuitarMLEnabled(_enabled: boolean): Promise<void> {}
  setGuitarMLMix(_mix: number): void {}

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.overdriveGain.dispose();
    this.overdrive.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
