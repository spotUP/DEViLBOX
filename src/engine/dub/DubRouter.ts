/**
 * DubRouter — the single entry point for firing dub moves.
 *
 * Every consumer (on-screen button click, keyboard handler, MIDI CC handler,
 * DubLanePlayer during pattern playback) calls `fire(moveId, channelId,
 * params, source)`. The router looks the move up in the registry, executes
 * it against the current DubBus, and publishes the fire event to
 * subscribers (DubRecorder subscribes to capture into the lane when armed).
 *
 * One code path = zero drift between live performance and recorded playback.
 * The REC indicator flashes, the UI highlights, and the audio fires through
 * exactly the same sequence regardless of who pulled the trigger.
 */

import { echoThrow } from './moves/echoThrow';
import { dubStab } from './moves/dubStab';
import { filterDrop } from './moves/filterDrop';
import { hpfRise } from './moves/hpfRise';
import { madProfPingPong } from './moves/madProfPingPong';
import { dubSiren } from './moves/dubSiren';
import { springSlam } from './moves/springSlam';
import { springKick } from './moves/springKick';
import { channelMute } from './moves/channelMute';
import { ghostReverb } from './moves/ghostReverb';
import { voltageStarve } from './moves/voltageStarve';
import { ringMod } from './moves/ringMod';
import { channelThrow } from './moves/channelThrow';
import { delayTimeThrow } from './moves/delayTimeThrow';
import { tapeWobble } from './moves/tapeWobble';
import { masterDrop } from './moves/masterDrop';
import { snareCrack } from './moves/snareCrack';
import { tapeStop } from './moves/tapeStop';
import { backwardReverb } from './moves/backwardReverb';
import { toast } from './moves/toast';
import { transportTapeStop } from './moves/transportTapeStop';
import { tubbyScream } from './moves/tubbyScream';
import { stereoDoubler } from './moves/stereoDoubler';
import { reverseEcho } from './moves/reverseEcho';
import { sonarPing } from './moves/sonarPing';
import { radioRiser } from './moves/radioRiser';
import { subSwell } from './moves/subSwell';
import { oscBass } from './moves/oscBass';
import { echoBuildUp } from './moves/echoBuildUp';
import { delayPreset380, delayPresetDotted, delayPresetQuarter, delayPreset8th, delayPresetTriplet, delayPreset16th, delayPresetDoubler } from './moves/delayPreset';
import { crushBass } from './moves/crushBass';
import { subHarmonic } from './moves/subHarmonic';
import { eqSweep } from './moves/eqSweep';
import { combSweep } from './moves/combSweep';
import { versionDrop } from './moves/versionDrop';
import { skankEchoThrow } from './moves/skankEchoThrow';
import { riddimSection } from './moves/riddimSection';
import type { DubMove, DubMoveContext } from './moves/_types';
import type { DubBus } from './DubBus';
import { useTransportStore } from '@/stores/useTransportStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { useDubStore } from '@/stores/useDubStore';
import { getTrackerReplayer } from '@/engine/TrackerReplayer';
import { decodeDubEffect, decodeDubParamStep, DUB_EFFECT_PARAM_STEP, isDubMoveEffectSlot } from './moveTable';
import { routeParameterToEngine } from '@/midi/performance/parameterRouter';
import { getSongTimeSec } from './songTime';
import * as Tone from 'tone';

/**
 * Resolve the current pattern-row position. Prefers the active replayer's
 * audio-synced state (works for libopenmpt / UADE / Hively / Furnace where
 * the transport store isn't driven), falls back to useTransportStore for
 * Tone.js-only sessions.
 */
function currentRow(): number {
  try {
    const replayer = getTrackerReplayer();
    if (replayer) {
      const state = replayer.getStateAtTime(Tone.now(), true /* peek */);
      if (state && typeof state.row === 'number') {
        const ts = useTransportStore.getState();
        const duration = state.duration;
        if (duration > 0) {
          const progress = Math.min(Math.max((Tone.now() - state.time) / duration, 0), 1);
          return state.row + progress;
        }
        return state.row;
        // `ts` kept live for a future "if replayer stale, fall back" branch.
        void ts;
      }
    }
  } catch { /* replayer not ready */ }
  // WASM engines (Hively/AHX, JamCracker, PreTracker, etc.) push position
  // updates to useWasmPositionStore from their worklet — they don't drive
  // useTransportStore.currentRow. Read here BEFORE falling back so AutoDub
  // fires get the correct row, not 0. Without this every fire stacked on
  // row 0 and overwrote the previous one.
  try {
    const wasmStore = useWasmPositionStore.getState();
    if (wasmStore.active && typeof wasmStore.row === 'number') {
      return wasmStore.row;
    }
  } catch { /* store not ready */ }
  return useTransportStore.getState().currentRow ?? 0;
}

const MOVES: Record<string, DubMove> = {
  echoThrow,
  dubStab,
  filterDrop,
  hpfRise,
  madProfPingPong,
  dubSiren,
  springSlam,
  springKick,
  channelMute,
  ghostReverb,
  voltageStarve,
  ringMod,
  channelThrow,
  delayTimeThrow,
  tapeWobble,
  masterDrop,
  snareCrack,
  tapeStop,
  backwardReverb,
  toast,
  transportTapeStop,
  tubbyScream,
  stereoDoubler,
  reverseEcho,
  sonarPing,
  radioRiser,
  subSwell,
  oscBass,
  echoBuildUp,
  delayPreset380,
  delayPresetDotted,
  delayPresetQuarter,
  delayPreset8th,
  delayPresetTriplet,
  delayPreset16th,
  delayPresetDoubler,
  crushBass,
  subHarmonic,
  eqSweep,
  combSweep,
  versionDrop,
  skankEchoThrow,
  riddimSection,
};

/**
 * What every subscriber sees when a move fires. `row` is the tracker's
 * row-level position at fire time, quantized by the caller if they wanted
 * grid placement. DubRecorder uses this as the stored `row` on DubEvent.
 * `invocationId` uniquely identifies the fire; a matching DubReleaseEvent
 * with the same id is published when the returned disposer is called
 * (only for hold-kind moves that actually return a disposer).
 */
export interface DubFireEvent {
  invocationId: string;
  moveId: string;
  channelId?: number;
  params: Record<string, number>;
  row: number;
  /** Song-time in seconds at fire moment. Recorder uses this when the active
   *  song has a time-mode lane (raw SID, SC68). Always populated — cheap to
   *  compute — so the recorder doesn't need a special code path to query it. */
  timeSec: number;
  source: 'live' | 'lane';
}

/**
 * Published when a held move releases (disposer called). Recorder uses
 * this to fill in durationRows on the previously-captured DubEvent so
 * the lane editor can render held moves as proper rectangles.
 */
export interface DubReleaseEvent {
  invocationId: string;
  row: number;  // release row position (for durationRows = releaseRow - fireRow)
  /** Song-time in seconds at release moment. Paired with DubFireEvent.timeSec
   *  to compute durationSec for time-mode held moves. */
  timeSec: number;
  source: 'live' | 'lane';
}

type FireSubscriber = (event: DubFireEvent) => void;
type ReleaseSubscriber = (event: DubReleaseEvent) => void;
const subscribers = new Set<FireSubscriber>();
const releaseSubscribers = new Set<ReleaseSubscriber>();

let _invCounter = 0;
function nextInvocationId(): string {
  _invCounter = (_invCounter + 1) | 0;
  return `${Date.now().toString(36)}-${_invCounter.toString(36)}`;
}

let _bus: DubBus | null = null;

/** Set by the TrackerView mount effect. Null when no tracker view is active. */
export function setDubBusForRouter(bus: DubBus | null): void {
  _bus = bus;
}

/** Subscribe to fire events. Returns an unsubscribe fn. */
export function subscribeDubRouter(fn: FireSubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Subscribe to release events (disposer invocations for held moves). */
export function subscribeDubRelease(fn: ReleaseSubscriber): () => void {
  releaseSubscribers.add(fn);
  return () => {
    releaseSubscribers.delete(fn);
  };
}

/**
 * Fire a move. Returns the move's disposer (null for pure one-shots), so the
 * caller can cancel a held move on release or bail out on panic.
 *
 * No-op + warn if the move id is unknown or no DubBus has been registered.
 */
export function fire(
  moveId: string,
  channelId: number | undefined,
  params: Record<string, number> = {},
  source: 'live' | 'lane' = 'live',
  opts?: { deckId?: import('../dj/DeckEngine').DeckId },
): { dispose(): void } | null {
  const move = MOVES[moveId];
  if (!move) {
    console.warn(`[DubRouter] unknown moveId "${moveId}" — ignoring`);
    return null;
  }
  if (!_bus) {
    console.warn(`[DubRouter] no bus registered — "${moveId}" ignored (tracker view not mounted?)`);
    return null;
  }

  const merged = { ...move.defaults, ...params };
  const bpm = useTransportStore.getState().bpm || 120;
  const rawRow = currentRow();
  const quantize = useDubStore.getState().quantize;
  const row = quantize ? Math.round(rawRow) : rawRow;

  const ctx: DubMoveContext = { bus: _bus, channelId, deckId: opts?.deckId, params: merged, bpm, source };
  const disposer = move.execute(ctx);

  const invocationId = nextInvocationId();
  const event: DubFireEvent = { invocationId, moveId, channelId, params: merged, row, timeSec: getSongTimeSec(), source };
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch (err) {
      console.warn('[DubRouter] subscriber failed:', err);
    }
  }

  if (!disposer) return null;

  // Wrap the move's own disposer so calling it publishes a release event
  // with the matching invocationId. Subscribers can pair fire → release by
  // id to fill in durationRows on held-move events. Idempotent — wrapping
  // only fires the release once even if dispose() is called multiple times.
  let released = false;
  const wrapped = {
    dispose() {
      if (released) return;
      released = true;
      try { disposer.dispose(); } catch (e) { console.warn('[DubRouter] disposer threw:', e); }
      const rawReleaseRow = currentRow();
      const releaseRow = useDubStore.getState().quantize ? Math.round(rawReleaseRow) : rawReleaseRow;
      const relEvent: DubReleaseEvent = { invocationId, row: releaseRow, timeSec: getSongTimeSec(), source };
      for (const fn of releaseSubscribers) {
        try {
          fn(relEvent);
        } catch (err) {
          console.warn('[DubRouter] release subscriber failed:', err);
        }
      }
    },
  };
  return wrapped;
}

/**
 * Fire a dub move from a tracker effect-command cell. `effTyp` must be
 * 33 (global move), 34 (per-channel move), or 35 (param step). Decodes
 * `eff` via `decodeDubEffect` / `decodeDubParamStep`, honours the user's
 * `autoDubMoveBlacklist`, and forwards to the normal `fire()` path.
 *
 * Returns the same disposer `fire()` returns (null for one-shots / param
 * steps). The caller — tick-0 effect processor — doesn't need to hold the
 * disposer; hold-duration encoding inside cells is a future extension.
 */
export function fireFromEffectCommand(
  effTyp: number,
  eff: number,
  fallbackChannelId?: number,
): { dispose(): void } | null {
  if (effTyp === DUB_EFFECT_PARAM_STEP) {
    const step = decodeDubParamStep(eff);
    if (!step) return null;
    try {
      routeParameterToEngine(step.paramKey, step.value);
    } catch (err) {
      console.warn('[DubRouter] param-step route failed:', err);
    }
    return null;
  }
  if (!isDubMoveEffectSlot(effTyp)) return null;
  const decoded = decodeDubEffect(effTyp, eff);
  if (!decoded) return null;
  // Blacklist respected — a blacklisted move in a saved .dbx still
  // shouldn't play. User can un-blacklist via the ⚙ popover to re-enable.
  const blacklist = useDubStore.getState().autoDubMoveBlacklist ?? [];
  if (blacklist.includes(decoded.moveId)) return null;
  const channelId = decoded.channelId ?? fallbackChannelId;
  // source='lane' — this fire originates from pattern data (a Zxx cell on
  // replay), NOT from live user input. DubRecorder filters on source and
  // ignores lane fires, which is essential: without this guard, replaying
  // a cell would trigger DubRecorder, which would write another cell at
  // the same row, which would fire again, and so on — infinite capture
  // loop. Matches DubLanePlayer's source='lane' semantics.
  return fire(decoded.moveId, channelId, {}, 'lane');
}
