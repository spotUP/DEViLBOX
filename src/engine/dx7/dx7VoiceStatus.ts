/**
 * What the DX7 firmware reports about its sounding voices, for the editor curves' live markers.
 * Source: the worklet's voiceStatus message (dx7GetEnvelopeState = the EGS Envelope level/stage/key flag of every
 * voice and operator, dx7GetEgsRegisters = voice pitch and LFO modulation registers). Pure; no engine access.
 */

export interface Dx7OpStatus {
  /** EGS attenuation in 1/256 octave steps: 0 full scale, 0xFF0 silent. */
  level: number;
  /** EG segment 0..2 = rates/levels 1..3, 3 = segment 4 (release). */
  stage: number;
  released: boolean;
}

export interface Dx7VoiceReport {
  voice: number;
  /** MIDI note that started the voice, -1 when the worklet could not match one. */
  note: number;
  /** Operators in EGS order: index 0 = OP6 ... index 5 = OP1. */
  ops: Dx7OpStatus[];
  /** Voice pitch register (1024 per octave, 7424 at middle C). */
  pitch: number;
  elapsedSeconds: number;
  /** Seconds since the key went up; null while it is down. */
  releasedSeconds: number | null;
}

export interface Dx7LfoReport {
  /** int16 pitch modulation register (the LFO times depth and sensitivity). */
  pitchMod: number;
  ampMod: number;
}

export interface Dx7VoiceStatus {
  voices: Dx7VoiceReport[];
  lfo: Dx7LfoReport;
}

/** The voice the markers follow: the newest held voice, else the newest releasing one. */
export function markedVoice(voices: readonly Dx7VoiceReport[]): Dx7VoiceReport | null {
  let held: Dx7VoiceReport | null = null;
  let ringing: Dx7VoiceReport | null = null;
  for (const v of voices) {
    if (v.releasedSeconds === null) { if (held === null || v.elapsedSeconds < held.elapsedSeconds) held = v; }
    else if (ringing === null || v.releasedSeconds < (ringing.releasedSeconds ?? Infinity)) ringing = v;
  }
  return held ?? ringing;
}

/** Operator number (1-based, OP1..OP6) -> its entry in a voice report (EGS order is OP6 first). */
export const reportOp = (v: Dx7VoiceReport, opNum: number): Dx7OpStatus | undefined => v.ops[6 - opNum];
