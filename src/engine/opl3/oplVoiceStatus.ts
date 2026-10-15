/**
 * What the Nuked OPL3 core reports about its sounding channels, for the editor curves' live markers.
 * Source: the worklet's voiceStatus message (oplGetChannelEnvelopes in juce-wasm/opl3: both slots' eg_gen and
 * eg_rout read straight from the chip). Pure; no engine access.
 */

/** OPL3 envelope stages as the chip numbers them (Nuked envelope_gen_num). */
export type OplStageNumber = 0 | 1 | 2 | 3;

export interface OplVoiceReport {
  channel: number;
  note: number;
  /** Envelope stage of the modulator (slot 0) and carrier (slot 1): 0 attack, 1 decay, 2 sustain, 3 release. */
  modulatorStage: OplStageNumber;
  carrierStage: OplStageNumber;
  /** Envelope attenuation eg_rout, 0 full scale .. 0x1FF silent (1/32 octave per unit). */
  modulatorAttenuation: number;
  carrierAttenuation: number;
  /** Note-on counter: the newest voice has the largest value. */
  age: number;
}

/** The chip's LFO positions: tremolo 0..209, vibrato 0..7 plus the sample counter inside one vibrato step. */
export interface OplLfoReport {
  tremoloPosition: number;
  vibratoPosition: number;
  /** chip timer & 0x3FF: 1024 chip samples make one vibrato step. */
  timer: number;
}

export interface OplVoiceStatus {
  channels: OplVoiceReport[];
  lfo: OplLfoReport;
}

/** The voice the markers follow: the newest one that is not already silent. */
export function newestOplVoice(channels: readonly OplVoiceReport[]): OplVoiceReport | null {
  let best: OplVoiceReport | null = null;
  for (const c of channels) {
    if ((c.carrierAttenuation & 0x1f8) === 0x1f8 && c.carrierStage === 3) continue;
    if (best === null || c.age > best.age) best = c;
  }
  return best;
}
