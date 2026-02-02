import * as Tone from 'tone';

export class V2Synth extends Tone.ToneAudioNode {
  public readonly name: string = 'V2Synth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;
  
  private _worklet: AudioWorkletNode | null = null;
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;

  constructor(options?: any) {
    super();
    this.output = new Tone.Gain();
    this._initPromise = this._initialize();
  }

  private async _initialize() {
    const context = Tone.getContext().rawContext;
    
    // Add worklet if not already added
    try {
      await context.audioWorklet.addModule('V2Synth.worklet.js');
    } catch (e) {
      // Worklet might already be added
    }

    // Fetch WASM binary
    const response = await fetch('V2Synth.wasm');
    const wasmBinary = await response.arrayBuffer();

    this._worklet = new AudioWorkletNode(context, 'v2-synth-processor', {
      outputChannelCount: [2]
    });

    this._worklet.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        this._initialized = true;
      }
    };

    // Initialize with binary
    this._worklet.port.postMessage({
      type: 'init',
      wasmBinary
    });

    this._worklet.connect(this.output);
  }

  public async ready() {
    return this._initPromise;
  }

  public triggerAttack(note: string | number, time?: number, velocity: number = 1) {
    if (!this._initialized) return;
    
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const vel = Math.floor(velocity * 127);
    
    // MIDI Note On: 0x90
    this._sendMIDI([0x90, midiNote, vel]);
  }

  public triggerRelease(time?: number) {
    if (!this._initialized) return;
    // We don't have the current note here, but V2 handles polyphony.
    // Standard trackers send Note Off for the note on that channel.
    // For now, we'll send All Notes Off if needed or handle via explicit note.
  }

  public triggerAttackRelease(note: string | number, duration: Tone.Unit.Time, time?: number, velocity: number = 1) {
    this.triggerAttack(note, time, velocity);
    // V2 is polyphonic and stateful, better to send Note Off
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const d = this.toSeconds(duration);
    setTimeout(() => {
      this._sendMIDI([0x80, midiNote, 0]);
    }, d * 1000);
  }

  public setParameter(index: number, value: number) {
    if (this._worklet && this._initialized) {
      this._worklet.port.postMessage({
        type: 'param',
        index,
        value
      });
    }
  }

  private _sendMIDI(msg: number[]) {
    if (this._worklet && this._initialized) {
      this._worklet.port.postMessage({
        type: 'midi',
        msg
      });
    }
  }

  public dispose() {
    super.dispose();
    if (this._worklet) {
      this._worklet.disconnect();
    }
    this.output.dispose();
    return this;
  }
}
