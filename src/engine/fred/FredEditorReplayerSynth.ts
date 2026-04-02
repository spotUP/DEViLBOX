/**
 * FredEditorReplayerSynth.ts — DevilboxSynth wrapper for Fred Editor WASM engine.
 *
 * Eagerly initializes the engine on first instance creation so instrument
 * preview works immediately without playing the song first.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { FredEditorReplayerEngine } from './FredEditorReplayerEngine';

// Shared engine init — runs once across all instances
let engineInitPromise: Promise<void> | null = null;
let engineLoaded = false;

function ensureEngineLoaded(): Promise<FredEditorReplayerEngine> {
  const engine = FredEditorReplayerEngine.getInstance();
  if (engineLoaded) return Promise.resolve(engine);

  if (!engineInitPromise) {
    engineInitPromise = (async () => {
      await engine.ready();
      engineLoaded = true;
    })();
  }
  return engineInitPromise.then(() => engine);
}

export class FredEditorReplayerSynth implements DevilboxSynth {
  readonly name = 'FredEditorReplayerSynth';
  readonly output: GainNode;
  private instrumentIndex = 0;

  constructor() {
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
    this.output.gain.value = 0;

    // Eagerly start engine init
    ensureEngineLoaded().catch(() => {});
  }

  async ensureInitialized(): Promise<void> {
    await ensureEngineLoaded();
  }

  setInstrumentIndex(index: number): void {
    this.instrumentIndex = index;
  }

  triggerAttack(note: string | number, _time?: number, velocity = 1): void {
    let midi: number;
    if (typeof note === 'string') {
      midi = noteToMidi(note);
    } else {
      midi = note;
    }
    // Fred Editor notes are 1-72 (6 octaves from C-1)
    // MIDI note 36 (C-2) = Fred note 13
    const fredNote = Math.max(1, Math.min(72, midi - 23));
    const vel = Math.round(velocity * 127);

    ensureEngineLoaded().then(engine => {
      engine.noteOn(this.instrumentIndex, fredNote, vel);
    }).catch(() => {});
  }

  triggerRelease(): void {
    if (FredEditorReplayerEngine.hasInstance()) {
      FredEditorReplayerEngine.getInstance().noteOff();
    }
  }

  triggerAttackRelease(note: string | number, _duration: number, _time?: number, velocity?: number): void {
    this.triggerAttack(note, undefined, velocity);
  }

  dispose(): void {
    this.output.disconnect();
  }
}
