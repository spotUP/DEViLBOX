/**
 * The tracker pitch slider (and its Key Lock), applied to the whole-song WASM engines that declare native tempo/pitch
 * controls (NativeEngineDescriptor.tempoPitch).
 *
 * PatternScheduler.applyPitchState makes the one tempo/pitch decision (computeTempoPitchSplit) and hands it here;
 * NativeEngineRouting registers an engine when it starts playing a song (which applies the current values at once, so
 * a song started with the slider moved starts at the slider's speed) and unregisters it when it stops.
 *
 * Kept free of engine imports: NativeEngineRouting pulls in every engine.
 */
import type { EngineTempoPitchControl, NativeEngineDescriptor, WASMSingletonEngine } from './wasmEngineRegistry';

/** What one engine is told for a tempo multiplier and a pitch multiplier. */
export interface EngineRateAndTempo {
  /** Varispeed rate (tempo and pitch together). */
  rate: number;
  /** Tempo-only scale on top of the rate, or null when the engine has no tempo-only control. */
  tempoScale: number | null;
}

/**
 * Split a tempo/pitch pair onto an engine's controls. With a tempo-only control the rate carries the pitch and the
 * tempo scale makes up the rest of the tempo (rate * tempoScale = tempo). Without one, the engine can only follow the
 * tempo as a varispeed, so the pitch goes with it (Key Lock cannot hold that engine's key).
 */
export function engineRateAndTempo(control: EngineTempoPitchControl, tempo: number, pitch: number): EngineRateAndTempo {
  if (control.setTempoScale && pitch > 0) return { rate: pitch, tempoScale: tempo / pitch };
  return { rate: tempo, tempoScale: null };
}

interface LiveEngine {
  desc: NativeEngineDescriptor;
  instance: WASMSingletonEngine;
}

const live = new Map<string, LiveEngine>();
/** The latest values, for an engine that starts after the slider moved. */
const current = { tempo: 1, pitch: 1 };
/** Re-runs the whole pitch application (PatternScheduler): the synth-bus resampler depends on which engines play. */
let onLiveEnginesChanged: (() => void) | null = null;

/** PatternScheduler hooks its applyPitchState here. */
export function setPitchEnginesChangedListener(fn: (() => void) | null): void {
  onLiveEnginesChanged = fn;
}

function drive(e: LiveEngine): void {
  const control = e.desc.tempoPitch;
  if (!control) return;
  const { rate, tempoScale } = engineRateAndTempo(control, current.tempo, current.pitch);
  try {
    control.setRate(e.instance, rate);
    if (tempoScale !== null) control.setTempoScale!(e.instance, tempoScale);
  } catch (err) {
    console.warn(`[nativeEnginePitch] ${e.desc.key}: tempo/pitch not applied`, err);
  }
}

/**
 * Drive every playing engine that has native tempo/pitch controls.
 * Returns true when one of them plays on the synth bus, whose resampler must then stay at 1: that engine already
 * carries the pitch, and the resampler would shift it a second time.
 */
export function applyNativeEnginePitch(tempo: number, pitch: number): boolean {
  current.tempo = tempo;
  current.pitch = pitch;
  let ownsSynthBus = false;
  for (const e of live.values()) {
    drive(e);
    if (!e.desc.needsDirectRouting) ownsSynthBus = true;
  }
  return ownsSynthBus;
}

/** An engine started playing a song: give it the slider as it stands. No-op for engines without controls. */
export function registerPitchEngine(desc: NativeEngineDescriptor, instance: WASMSingletonEngine): void {
  if (!desc.tempoPitch) return;
  const e = { desc, instance };
  live.set(desc.key, e);
  drive(e);
  onLiveEnginesChanged?.();
}

/** An engine stopped: back to its own speed, so a later caller (live notes, the DJ) does not inherit the slider. */
export function unregisterPitchEngine(key: string): void {
  const e = live.get(key);
  if (!e) return;
  live.delete(key);
  const control = e.desc.tempoPitch!;
  try {
    control.setRate(e.instance, 1);
    control.setTempoScale?.(e.instance, 1);
  } catch { /* engine went away */ }
  onLiveEnginesChanged?.();
}
