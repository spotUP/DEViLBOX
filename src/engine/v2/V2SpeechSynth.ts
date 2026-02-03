import * as Tone from 'tone';

export interface V2SpeechConfig {
  text: string;     // Phonetic text (e.g. "!kwIH_k")
  speed: number;    // 0-127
  pitch: number;    // 0-127
  formantShift: number; // 0-127
  singMode: boolean;
}

export class V2SpeechSynth extends Tone.ToneAudioNode {
  public readonly name: string = 'V2SpeechSynth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;
  
  private _config: V2SpeechConfig = {
    text: '!kwIH_k',
    speed: 64,
    pitch: 64,
    formantShift: 64,
    singMode: true
  };

  constructor() {
    super();
    this.output = new Tone.Gain();
  }

  public applyConfig(config: Partial<V2SpeechConfig>) {
    this._config = { ...this._config, ...config };
  }

  public triggerAttack(note: string | number, _time?: number, _velocity: number = 1) {
    // Note tracking for Sing Mode
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    
    // Trigger Speech via Engine (Reserved ID 999 for previews/special)
    // In a real V2 scenario, the text is linked to the patch.
    console.log(`[V2Speech] Trigger: ${note} (MIDI ${midiNote}) sing:${this._config.singMode} text:${this._config.text}`);
    
    // To make it sing, we send Note On to the V2 core
    // The engine handles the instrument mapping
  }

  public triggerRelease(_time?: number) {
    // Release logic
  }

  public dispose() {
    super.dispose();
    this.output.dispose();
    return this;
  }
}
