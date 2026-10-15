/**
 * wasmVoiceStatus.ts - ONE live-voice path for the WASM synths whose editors draw curve markers (curves plan CV-1.5,
 * generalised from klystrack's watchVoices / voiceStatus pair).
 *
 *  C++    `<prefix>_get_voices(handle, float* out, int maxVoices)` writes VOICE_RECORD_FLOATS floats per voice slot
 *         (layout below) and returns the number of slots written.
 *  Worklet `{type:'watchVoices', on}` starts and stops the report; while on it posts
 *         `{type:'voiceStatus', voices: Float32Array}` every few process() calls.
 *  Engine WasmVoiceHub holds the subscribers of ONE synth instance, switches the worklet watch on and off with the
 *         first and last subscriber, and decodes the report.
 *  Editor `subscribeVoiceMarker(synthType, cb)` follows every live instance of a synth type, so a static layout can
 *         draw a marker without knowing which instrument object plays (the instrument-keyed form is a follow-up).
 *
 * Pure TS, no audio context: the decode, the voice choice and the hub are tested with plain arrays.
 */

/** Floats per voice slot in a report. */
export const VOICE_RECORD_FLOATS = 8;

export type VoiceStage = 'attack' | 'decay' | 'sustain' | 'release' | 'off';
/** Stage codes in a record (float 1). */
export const VOICE_STAGES: readonly VoiceStage[] = ['attack', 'decay', 'sustain', 'release', 'off'];

/**
 * One voice slot of a report. Record layout (floats):
 *  0 note (MIDI note; -1 when the engine keeps none for a releasing voice)   1 stage code (VOICE_STAGES)   2 amplitude level 0..1
 *  3 seconds since the voice was triggered (0 when the engine keeps no age)
 *  4 filter cutoff in the engine's own unit (named by each synth's marker module), after envelope and LFO
 *  5 filter envelope level 0..1                    6 LFO phase in cycles 0..1
 *  7 filter envelope stage code (VOICE_STAGES; equal to the amplitude stage when the synth has no filter envelope)
 * The slot index is the record's position in the report. A synth with more to say than eight floats per voice (Tunefish
 * has four filters) posts a longer `stride` and the floats past the eighth arrive in `extra`.
 */
export interface WasmVoice {
  slot: number;
  note: number;
  stage: VoiceStage;
  level: number;
  elapsedSeconds: number;
  cutoff: number;
  filterLevel: number;
  lfoPhase: number;
  filterStage: VoiceStage;
  /** Floats past the eighth of a longer record (empty for the standard stride). */
  extra: number[];
}

export function decodeVoices(data: ArrayLike<number>, stride = VOICE_RECORD_FLOATS): WasmVoice[] {
  const voices: WasmVoice[] = [];
  const width = Math.max(VOICE_RECORD_FLOATS, Math.round(stride));
  for (let at = 0; at + width <= data.length; at += width) {
    const code = Math.round(data[at + 1]);
    voices.push({
      slot: at / width,
      note: Math.round(data[at]),
      stage: VOICE_STAGES[code] ?? 'off',
      level: data[at + 2],
      elapsedSeconds: data[at + 3],
      cutoff: data[at + 4],
      filterLevel: data[at + 5],
      lfoPhase: data[at + 6],
      filterStage: VOICE_STAGES[Math.round(data[at + 7])] ?? 'off',
      extra: Array.from({ length: width - VOICE_RECORD_FLOATS }, (_, i) => data[at + VOICE_RECORD_FLOATS + i]),
    });
  }
  return voices;
}

/**
 * The voice a marker follows: among the voices still sounding, one that has not been released wins over a releasing
 * one (the player is holding it), and among equals the most recently triggered (smallest age). Null when nothing sounds.
 */
export function pickVoice(voices: readonly WasmVoice[]): WasmVoice | null {
  let best: WasmVoice | null = null;
  const rank = (v: WasmVoice): number => (v.stage === 'release' ? 1 : 0);
  for (const v of voices) {
    if (v.stage === 'off') continue;
    if (best === null || rank(v) < rank(best) || (rank(v) === rank(best) && v.elapsedSeconds < best.elapsedSeconds)) best = v;
  }
  return best;
}

export type VoiceWatchMessage = { type: 'watchVoices'; on: boolean };
export interface VoiceStatusMessage { type?: string; voices?: ArrayLike<number>; stride?: number }

/** The subscribers of one synth instance's voice report. */
export class WasmVoiceHub {
  private readonly callbacks = new Set<(voices: WasmVoice[]) => void>();
  private latest: WasmVoice[] = [];

  /** `send` posts a message to the instance's worklet (a no-op until the worklet exists). */
  private readonly send: (message: VoiceWatchMessage) => void;
  constructor(send: (message: VoiceWatchMessage) => void) { this.send = send; }

  subscribe(cb: (voices: WasmVoice[]) => void): () => void {
    this.callbacks.add(cb);
    if (this.callbacks.size === 1) this.send({ type: 'watchVoices', on: true });
    return () => {
      if (!this.callbacks.delete(cb)) return;
      if (this.callbacks.size === 0) {
        this.latest = [];
        this.send({ type: 'watchVoices', on: false });
      }
    };
  }

  /** Call when the worklet reports ready: a watch requested before the worklet existed is sent now. */
  resume(): void {
    if (this.callbacks.size > 0) this.send({ type: 'watchVoices', on: true });
  }

  get subscriberCount(): number { return this.callbacks.size; }
  get voices(): readonly WasmVoice[] { return this.latest; }

  /** Feed a worklet message; true when it was a voice report (and so consumed). */
  handleMessage(data: VoiceStatusMessage): boolean {
    if (data.type !== 'voiceStatus' || !data.voices) return false;
    this.latest = decodeVoices(data.voices, data.stride);
    for (const cb of this.callbacks) cb(this.latest);
    return true;
  }
}

// ---- registry: synth type -> its live instances' hubs ----

const hubsByType = new Map<string, Set<WasmVoiceHub>>();
const registrationListeners = new Map<string, Set<(hub: WasmVoiceHub) => void>>();

/** Register an instance's hub under its synth type; returns the unregister function (call it from dispose()). */
export function registerVoiceHub(synthType: string, hub: WasmVoiceHub): () => void {
  let set = hubsByType.get(synthType);
  if (!set) { set = new Set(); hubsByType.set(synthType, set); }
  set.add(hub);
  for (const listener of registrationListeners.get(synthType) ?? []) listener(hub);
  return () => { hubsByType.get(synthType)?.delete(hub); };
}

/**
 * The voice to mark across every live instance of `synthType`: `cb` gets the chosen voice on each report and null when
 * nothing sounds. Instances created after the call are followed too. Returns the unsubscribe function.
 */
export function subscribeVoiceMarker(synthType: string, cb: (voice: WasmVoice | null) => void): () => void {
  const unsubscribers = new Map<WasmVoiceHub, () => void>();
  const latest = new Map<WasmVoiceHub, readonly WasmVoice[]>();
  let lastWasNull = true;
  const emit = (): void => {
    const picked = pickVoice([...latest.values()].flat());
    if (picked === null && lastWasNull) return;
    lastWasNull = picked === null;
    cb(picked);
  };
  const follow = (hub: WasmVoiceHub): void => {
    if (unsubscribers.has(hub)) return;
    unsubscribers.set(hub, hub.subscribe((voices) => { latest.set(hub, voices); emit(); }));
  };
  for (const hub of hubsByType.get(synthType) ?? []) follow(hub);
  let listeners = registrationListeners.get(synthType);
  if (!listeners) { listeners = new Set(); registrationListeners.set(synthType, listeners); }
  listeners.add(follow);
  return () => {
    listeners?.delete(follow);
    for (const off of unsubscribers.values()) off();
    unsubscribers.clear();
    latest.clear();
  };
}
