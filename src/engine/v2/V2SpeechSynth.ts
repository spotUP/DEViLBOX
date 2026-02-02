import * as Tone from 'tone';
import { getToneEngine } from '../ToneEngine';

export interface V2SpeechConfig {
  text: string;     // Phonetic text (e.g. "!kwIH_k")
  voice: number;    // 0-127 (maps to V2 program/patch)
  speed: number;    // 0-127
  pitch: number;    // 0-127
}

export class V2SpeechSynth extends Tone.ToneAudioNode {
  public readonly name: string = 'V2SpeechSynth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;
  
  private _config: V2SpeechConfig = {
    text: '!kwIH_k',
    voice: 0,
    speed: 64,
    pitch: 64
  };

  constructor() {
    super();
    this.output = new Tone.Gain();
  }

  public applyConfig(config: Partial<V2SpeechConfig>) {
    this._config = { ...this._config, ...config };
    // V2 Speech usually works by sending text to the engine
    // In our WASM, we'll need a way to set the speech text for a channel
  }

  public triggerAttack(note: string | number, time?: number, velocity: number = 1) {
    const engine = getToneEngine();
    // V2 speech is triggered like a note but uses the speech buffer
    // For now, we'll trigger the standard V2 synth and rely on the engine 
    // having the speech text assigned to that instrument.
    engine.triggerNoteAttack(999, note, velocity, time); 
  }

  public triggerRelease(time?: number) {
    const engine = getToneEngine();
    engine.triggerNoteRelease(999, time);
  }

  public dispose() {
    super.dispose();
    this.output.dispose();
    return this;
  }
}
