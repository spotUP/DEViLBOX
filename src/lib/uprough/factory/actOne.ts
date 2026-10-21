/**
 * Act 1 on a Generate (R2f): the TS bank is built locally (no audio goes over the wire) and kept for audition audio.
 * It emits nothing: on the streamed host Generate the host is the only source of bank and stage events (R2c-09c).
 */
import { songDrumBank, type DrumBank, type HipHopStyle } from '@/engine/uprough/drumBank';
import { keepBank } from './voiceAudition';

export const FACTORY_RATE = 22050;

/** Builds the song's drum bank at `style` and `seed` and keeps it for audition (R2f-15a). */
export function runActOne(style: HipHopStyle, seed: number, rate = FACTORY_RATE): DrumBank {
  const bank = songDrumBank(style, rate, seed);
  keepBank(bank, rate);
  return bank;
}
