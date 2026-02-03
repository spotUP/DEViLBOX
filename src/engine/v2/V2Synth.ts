import * as Tone from 'tone';
import { getNativeContext, createAudioWorkletNode } from '@utils/audio-context';

export class V2Synth extends Tone.ToneAudioNode {
  public readonly name: string = 'V2Synth';
  public readonly input: undefined = undefined;
  public readonly output: Tone.Gain;

  private _worklet: AudioWorkletNode | null = null;
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;
  private _pendingNotes: Array<{note: number, vel: number}> = [];
  private _releaseTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor() {
    super();
    this.output = new Tone.Gain();
    this._initPromise = this._initialize();
  }

  private async _initialize() {
    const nativeCtx = getNativeContext(this.context);

    // Add worklet if not already added
    try {
      await nativeCtx.audioWorklet.addModule('V2Synth.worklet.js');
    } catch (e) {
      // Worklet might already be added
    }

    // Fetch WASM binary with error handling
    const response = await fetch('V2Synth.wasm');
    if (!response.ok) {
      throw new Error(`Failed to load V2Synth.wasm: ${response.status}`);
    }
    const wasmBinary = await response.arrayBuffer();

    this._worklet = createAudioWorkletNode(this.context, 'v2-synth-processor', {
      outputChannelCount: [2]
    });

    // Wait for ready message with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('V2Synth initialization timeout after 5s'));
      }, 5000);

      this._worklet!.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          this._initialized = true;
          // Flush any pending notes that were queued during init
          this._pendingNotes.forEach(n => this._sendMIDI([0x90, n.note, n.vel]));
          this._pendingNotes = [];
          resolve();
        }
      };

      // Initialize with binary
      this._worklet!.port.postMessage({
        type: 'init',
        wasmBinary
      });
    });

    // Use Tone.connect for reliable connection between wrappers and nodes
    Tone.connect(this._worklet, this.output);
  }

  public async ready() {
    return this._initPromise;
  }

  public triggerAttack(note: string | number, _time?: number, velocity: number = 1) {
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const vel = Math.floor(velocity * 127);

    if (!this._initialized) {
      // Queue note for when init completes instead of dropping silently
      this._pendingNotes.push({ note: midiNote, vel });
      return;
    }

    // MIDI Note On: 0x90
    this._sendMIDI([0x90, midiNote, vel]);
  }

  public triggerRelease(_time?: number) {
    if (!this._initialized) return;
    // We don't have the current note here, but V2 handles polyphony.
    // Standard trackers send Note Off for the note on that channel.
    // For now, we'll send All Notes Off if needed or handle via explicit note.
  }

  public triggerAttackRelease(note: string | number, duration: Tone.Unit.Time, _time?: number, velocity: number = 1) {
    this.triggerAttack(note, undefined, velocity);
    // V2 is polyphonic and stateful, better to send Note Off
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const d = this.toSeconds(duration);
    const timer = setTimeout(() => {
      this._releaseTimers.delete(timer);
      // Only send if still initialized (not disposed)
      if (this._initialized && this._worklet) {
        this._sendMIDI([0x80, midiNote, 0]);
      }
    }, d * 1000);
    this._releaseTimers.add(timer);
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
    // Clear all pending release timers to prevent memory leaks
    this._releaseTimers.forEach(timer => clearTimeout(timer));
    this._releaseTimers.clear();
    this._initialized = false;

    super.dispose();
    if (this._worklet) {
      this._worklet.disconnect();
    }
    this.output.dispose();
    return this;
  }
}
