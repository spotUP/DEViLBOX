/**
 * Silence the performer made, not the song's end.
 *
 * The SilenceDetector stops a native engine after 5 s of silence on its
 * output. Two things silence that output on purpose: the mixer (a mute, or a
 * solo elsewhere - ledger F27) and a dub move holding the dry down
 * (`masterDrop`, ledger F28). The detector asks here before it stops anything.
 *
 * Light on purpose: no engine or Tone import, so the router's detector and
 * the tests can read it without loading the audio graph. The mixer store is
 * resolved lazily because it imports the router.
 */
import { drySilencedByDub } from '@/lib/dub/drySilence';

type MixerStoreLike = { getState(): { channels: Array<{ muted: boolean; soloed: boolean }>; isSoloing: boolean } };
let _mixerStore: MixerStoreLike | null = null;
void import('@/stores/useMixerStore').then((m) => { _mixerStore = m.useMixerStore as unknown as MixerStoreLike; }).catch(() => {});

/** Is the mixer muting or soloing anything right now? */
export function mixerSilencesAChannel(): boolean {
  const st = _mixerStore?.getState();
  if (!st) return false;
  return st.channels.some((c) => (st.isSoloing ? !c.soloed : c.muted));
}

/** Mixer mute/solo, or a dub move holding the dry down. */
export function silenceIsNotTheSongs(): boolean {
  return mixerSilencesAChannel() || drySilencedByDub();
}
