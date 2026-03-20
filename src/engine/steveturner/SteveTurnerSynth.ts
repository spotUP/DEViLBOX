/**
 * SteveTurnerSynth.ts — DevilboxSynth wrapper for Steve Turner WASM engine.
 *
 * Eagerly initializes the engine on first instance creation so instrument
 * preview works immediately without playing the song first.
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SteveTurnerEngine } from './SteveTurnerEngine';

// Shared engine init — runs once across all SteveTurnerSynth instances
let engineInitPromise: Promise<void> | null = null;
let engineLoaded = false;

function ensureEngineLoaded(): Promise<SteveTurnerEngine> {
  const engine = SteveTurnerEngine.getInstance();
  if (engineLoaded) return Promise.resolve(engine);

  if (!engineInitPromise) {
    engineInitPromise = (async () => {
      await engine.ready();
      const { useFormatStore } = await import('@/stores/useFormatStore');
      const data = useFormatStore.getState().steveTurnerFileData;
      if (data) {
        await engine.loadTune(data);
        // Pause song ticks — only note preview should play
        engine.pause();
      }
      engineLoaded = true;
    })();
  }
  return engineInitPromise.then(() => engine);
}

export class SteveTurnerSynth implements DevilboxSynth {
  readonly name = 'SteveTurnerSynth';
  readonly output: GainNode;
  private instrumentIndex = 0;

  constructor() {
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
    this.output.gain.value = 0;

    // Eagerly start engine init so it's ready when user presses a key
    ensureEngineLoaded().catch(() => {});
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
    const stNote = Math.max(0, Math.min(83, midi - 24));
    const vel = Math.round(velocity * 127);

    ensureEngineLoaded().then(engine => {
      engine.noteOn(this.instrumentIndex, stNote, vel);
    }).catch(() => {});
  }

  triggerRelease(): void {
    if (SteveTurnerEngine.hasInstance()) {
      SteveTurnerEngine.getInstance().noteOff();
    }
  }

  triggerAttackRelease(note: string | number, _duration: number, _time?: number, velocity?: number): void {
    this.triggerAttack(note, undefined, velocity);
  }

  dispose(): void {
    this.output.disconnect();
  }
}
