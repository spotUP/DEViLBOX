/**
 * Runtime METER invariants for the dub bus.
 *
 * These are the three questions that the unit suite structurally cannot ask and
 * that cost the whole evening of 2026-09-22. happy-dom has no AudioWorklet, no
 * audio graph and no layout, so every source-shape test stayed green while
 * `busInput` sat at 0.000001 and the master ran 29.76 dB down. What separates
 * this file from those tests is not the assertion — it is the INPUT: these
 * predicates run over a live `get_dub_bus_state` payload read out of a real
 * Chrome, driven by `tools/dub-invariant-sweep.ts --phase M`.
 *
 * They live in `src/` rather than beside the sweep for one reason: the sweep
 * needs a browser, so it cannot run in CI, and a predicate nobody can test is
 * how the last set of these went wrong. Here they are covered by
 * `__tests__/meterInvariants.test.ts`, which feeds them the numbers the real
 * faults produced.
 */

/** A level tap that reported itself unavailable returns this, not 0. */
const TAP_UNAVAILABLE = -1;

/** Below this the master is silent for practical purposes. */
export const SILENCE_RMS = 0.001;

/**
 * The floors `checkBusInputWet` uses, both measured on 2026-09-23 against
 * amanda.ahx with the bus armed and channel 0 sending 0.6, not guessed:
 *
 *   healthy   busInput 0.005668 .. 0.006010 rms
 *             masterEffectsInput 0.017861 .. 0.051611 rms
 *             ratio busInput / masterEffectsInput 0.12 .. 0.32
 *   starved   busInput 0.000001 (the 2026-09-22 reading)
 *
 * Three orders of magnitude separate the two, so the floor sits far below
 * anything healthy and far above the fault.
 */
export const BUS_INPUT_FLOOR = 1e-4;

/**
 * The same question asked relatively, because an absolute floor alone cannot
 * tell a starved bus from a quiet song. 0.01 is a twelfth of the smallest
 * healthy ratio measured and 180x the starved one.
 */
export const BUS_INPUT_UPSTREAM_RATIO = 0.01;

/** Rounding along the store -> engine path, nothing more. */
export const MASTER_DB_TOLERANCE = 0.5;

/**
 * The capture aborts DubBus raises when the bus ring holds no signal. Matched
 * as text on purpose: the threshold itself lives in `DubBus.ts`
 * (`CAPTURE_SILENCE_PEAK`), and a second copy of a number here is a second
 * number to get wrong. This asks whether the PRODUCT refused, not whether some
 * level cleared a bar this file invented.
 */
export const CAPTURE_ABORT_PATTERN = /captured SILENCE|ring still empty|empty ring buffer/;

export interface MeterCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** The slice of `get_dub_bus_state` these predicates read. */
export interface DubMeterState {
  masterInsertLevels?: Record<string, number> | null;
  upstreamLevels?: Record<string, number | null> | null;
  channelDubSends?: { dubSend?: number }[] | null;
  insertProbe?: Record<string, unknown> | null;
}

/** The slice of `get_mixer_state` `checkMasterGainAgrees` reads. */
export interface MixerMasterState {
  masterVolume?: number | null;
  masterMuted?: boolean | null;
}

export interface ConsoleEntryLike {
  level: string;
  message: string;
}

/**
 * WET — the bus INPUT carries the song while a send is open.
 *
 * `masterInsertLevels.busInput` is an rms tap; the identically named
 * `insertProbe.busInput` is the GAIN on the same node and stayed at 1.0 all
 * through the starvation, which is why reading the gain answered nothing.
 *
 * `upstreamLevels.masterEffectsInput` is the stage the bus is spliced onto, so
 * comparing the two separates "the bus gets nothing" from "the song is quiet
 * here" — a distinction an absolute floor cannot make and that produced two
 * wrong conclusions before it was measured.
 */
export function checkBusInputWet(state: DubMeterState | null | undefined): MeterCheck {
  const sends = (state?.channelDubSends ?? []).map(c => c?.dubSend ?? 0);
  const open = sends.filter(v => v > 0).length;
  if (!open) {
    return { name: 'WET', ok: true, detail: 'no send open — nothing is expected at the bus' };
  }

  const busInput = state?.masterInsertLevels?.busInput;
  if (busInput == null) {
    return { name: 'WET', ok: false, detail: 'no bus input tap (bus not created, or levels unavailable)' };
  }
  if (busInput === TAP_UNAVAILABLE) {
    return { name: 'WET', ok: false, detail: 'bus input tap reported itself unavailable' };
  }

  const upstream = state?.upstreamLevels?.masterEffectsInput ?? null;
  if (busInput < BUS_INPUT_FLOOR) {
    return {
      name: 'WET',
      ok: false,
      detail:
        `bus starved: busInput ${busInput.toExponential(2)} with ${open} send(s) open` +
        ` (floor ${BUS_INPUT_FLOOR.toExponential(0)}, masterEffectsInput ${upstream ?? 'n/a'})`,
    };
  }

  if (upstream != null && upstream > SILENCE_RMS) {
    const ratio = busInput / upstream;
    if (ratio < BUS_INPUT_UPSTREAM_RATIO) {
      return {
        name: 'WET',
        ok: false,
        detail:
          `bus input is ${ratio.toExponential(2)} of the stage feeding it` +
          ` (busInput ${busInput.toFixed(6)}, masterEffectsInput ${upstream.toFixed(6)},` +
          ` floor ${BUS_INPUT_UPSTREAM_RATIO})`,
      };
    }
    return { name: 'WET', ok: true, detail: `busInput ${busInput.toFixed(6)} (${ratio.toFixed(3)} of upstream)` };
  }

  return { name: 'WET', ok: true, detail: `busInput ${busInput.toFixed(6)}` };
}

/**
 * MASTER — the engine's master gain is the one the store asked for.
 *
 * Three numbers must agree: `useAudioStore.masterVolume` (what the app
 * believes), `_masterVolumeDb` (what the engine was last told) and
 * `masterChannel.volume.value` (what the audio graph is doing). On 2026-09-22
 * the first read 0 dB and the last read −29.76 dB, with no hardware attached
 * and nothing in the UI showing it; comparing the two is the only thing that
 * could have seen it.
 */
export function checkMasterGainAgrees(
  state: DubMeterState | null | undefined,
  mixer: MixerMasterState | null | undefined,
): MeterCheck {
  const probe = state?.insertProbe;
  if (!probe) {
    return { name: 'MASTER', ok: true, detail: 'no bus yet — master not measurable here' };
  }

  const storeDb = mixer?.masterVolume;
  const targetDb = probe.masterVolumeDbTarget as number | null | undefined;
  const actualDb = probe.masterChannelVolumeDb as number | null | undefined;
  if (typeof storeDb !== 'number' || typeof actualDb !== 'number') {
    return { name: 'MASTER', ok: true, detail: `not measurable (store ${storeDb}, engine ${actualDb})` };
  }

  const drift: string[] = [];
  if (Math.abs(actualDb - storeDb) > MASTER_DB_TOLERANCE) {
    drift.push(`engine ${actualDb.toFixed(2)} dB vs store ${storeDb.toFixed(2)} dB`);
  }
  if (typeof targetDb === 'number' && Math.abs(targetDb - storeDb) > MASTER_DB_TOLERANCE) {
    drift.push(`engine target ${targetDb.toFixed(2)} dB vs store ${storeDb.toFixed(2)} dB`);
  }
  if (probe.masterChannelMute === true && mixer?.masterMuted !== true) {
    drift.push('engine master is muted and the store is not');
  }

  return drift.length
    ? { name: 'MASTER', ok: false, detail: drift.join('; ') }
    : { name: 'MASTER', ok: true, detail: `${actualDb.toFixed(2)} dB, store agrees` };
}

/**
 * CAP — a capture move heard the bus.
 *
 * `backwardReverb` and `reverseEcho` snapshot the bus ring and refuse to play
 * it when the snapshot's peak is under `CAPTURE_SILENCE_PEAK`, warning and
 * toasting the performer. That abort is the product's own silence detector, so
 * this predicate does not re-implement the threshold — it reads whether the
 * product aborted. Pass the console entries captured since the move fired.
 */
export function checkCaptureNotAborted(entries: ConsoleEntryLike[] | null | undefined): MeterCheck {
  const aborted = (entries ?? []).find(e => CAPTURE_ABORT_PATTERN.test(e?.message ?? ''));
  return aborted
    ? { name: 'CAP', ok: false, detail: `capture aborted — ${aborted.message.slice(0, 160)}` }
    : { name: 'CAP', ok: true, detail: 'capture cleared the silence threshold' };
}
