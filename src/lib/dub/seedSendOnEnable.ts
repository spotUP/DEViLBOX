/**
 * Opening a channel send when the performer switches the bus on.
 *
 * The bus is fed only by the channels whose sends are open: channel
 * isolation is preferred and the whole-mix fallback is deliberately
 * silenced (src/types/dub.ts). `applySong` resets every send on each song
 * load, so a freshly loaded song reaches the bus with nothing at all —
 * busInput 0, returnRms 0 — and every wet control then reads as dead with
 * no word about why. Measured 2026-10-02 on a MOD: with all sends at 0,
 * `channelTapGainMax` 0 and the bus silent, while the master chain carried
 * signal; raising three sends took the same bus to `channelTapGainMax`
 * 0.68 / inputRms 0.03-0.11.
 *
 * Only a switch from off to on seeds, and only when no send is audible, so
 * it can never touch a send the performer opened themselves.
 */
import { useMixerStore } from '@/stores/useMixerStore';
import { anySendAudible } from '@/lib/dub/sendAudibility';

/**
 * A quiet starting send, not a performer's. 0.15 is Auto Dub's measured
 * flat seed: sends at ~0.43 left 15 of 39 moves reading SILENT, while 0.15
 * raised channel throws +8 to +18 dB, and it matches the four-send-at-
 * 0.2123 feed `returnGain` is calibrated against.
 */
export const BUS_ENABLE_SEED_SEND = 0.15;

/**
 * Which channel the switch-on seed opens, or `null` to seed nothing.
 *
 * `null` when any send is already audible — the performer's own send is
 * never second-guessed. Prefers the first channel that is not muted; with
 * every channel muted it falls back to channel 0, because a muted channel
 * carrying a send beats a silent bus.
 */
export function sendSeedChannel(
  sends: ReadonlyArray<number | undefined | null>,
  muted?: ReadonlyArray<boolean | undefined>,
): number | null {
  if (sends.length === 0) return null;
  if (anySendAudible(sends)) return null;
  for (let i = 0; i < sends.length; i++) {
    if (muted?.[i] !== true) return i;
  }
  return 0;
}

/** Seed the switch-on send. Returns the channel opened, or `null` if none. */
export function seedSendOnBusEnable(): number | null {
  const { channels, setChannelDubSend } = useMixerStore.getState();
  const channel = sendSeedChannel(
    channels.map(c => c?.dubSend),
    channels.map(c => c?.muted),
  );
  if (channel === null) return null;
  setChannelDubSend(channel, BUS_ENABLE_SEED_SEND);
  return channel;
}

/**
 * The invariant both call sites express: an enabled bus must be fed.
 *
 * Two things break it, and they are not the same event. Switching the bus on
 * leaves it with whatever sends were there; loading a song actively closes
 * every one of them (`applySong` -> `resetDubSends`), so a bus that was
 * already on arrives at the deck starved. Without this, every `needsSend`
 * move — Tape Stop, Sub Harmonic, Filter Drop, Master Drop, Liquid, Starve —
 * is gated by the deck's "Raise a CH send first" toast and fires nothing at
 * all (`DubDeckStrip.tsx`), which reads as "the button is broken".
 *
 * `busEnabled` is passed in rather than read here: this module is imported by
 * `useDrumPadStore`, so importing that store back would close a cycle.
 */
export function ensureBusIsFed(busEnabled: boolean): number | null {
  if (!busEnabled) return null;
  return seedSendOnBusEnable();
}