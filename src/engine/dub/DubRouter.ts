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
import { skankFloatThrow } from './moves/skankFloatThrow';
import { riddimSection } from './moves/riddimSection';
import type { DubMove, DubMoveContext } from './moves/_types';
import type { DubBus } from './DubBus';
import { useTransportStore } from '@/stores/useTransportStore';
import { useDubStore } from '@/stores/useDubStore';
import { decodeDubEffect, decodeDubParamStep, DUB_EFFECT_PARAM_STEP, isDubMoveEffectSlot } from './moveTable';
import { routeParameterToEngine } from '@/midi/performance/parameterRouter';
import { getSongTimeSec } from './songTime';
import { getCurrentRow as currentRow, msToNextGridBoundary } from './dubGrid';
import { LiveEchoGuard } from '@/lib/dub/liveEcho';

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
  skankFloatThrow,
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
/**
 * WHO fired a move.
 *
 * `source` already distinguished live performance from lane playback, but not
 * the USER from the AI — both were 'live'. The performer's memory therefore
 * read its own fires as the player's and kept answering itself, which is why
 * its accents clustered on whichever channel it had just used. Measured with
 * the Gate N1 simulator.
 */
export type DubFireOrigin = 'user' | 'ai' | 'lane';

export interface DubFireEvent {
  invocationId: string;
  moveId: string;
  /** Who fired it. Defaults to the user — an unlabelled fire is a hand. */
  origin: DubFireOrigin;
  channelId?: number;
  params: Record<string, number>;
  row: number;
  /** Song-time in seconds at fire moment. Recorder uses this when the active
   *  song has a time-mode lane (raw SID, SC68). Always populated — cheap to
   *  compute — so the recorder doesn't need a special code path to query it. */
  timeSec: number;
  source: 'live' | 'lane';
  /** True if this move has a disposer (hold move), false for one-shots/triggers */
  isHold?: boolean;
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

/** Recognises a lane fire that is the replay of a press that just happened. */
const _liveEcho = new LiveEchoGuard();

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
  opts?: {
    deckId?: import('../dj/DeckEngine').DeckId;
    /** Caller already placed this fire on the grid (GestureEngine). Skips the
     *  router's own quantize so two quantizers in series cannot push the
     *  gesture a whole grid step late. */
    preQuantized?: boolean;
    /** Who is firing. Defaults to 'lane' for lane playback, else 'user'. */
    origin?: DubFireOrigin;
  },
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

  // Grid-snap a live performance to the next subdivision when the user has
  // asked for it. A throw's capture window is short — half a beat by default,
  // 250 ms at 120 BPM — so hand-timing it against offbeat stabs is luck, and a
  // press that lands slightly off captures silence and appears to do nothing.
  //
  // `throwQuantize` was written for exactly this but only ever reached the DJ
  // deck path in DubActions; tracker channel throws ignored it entirely.
  // Default is 'off', so this changes nothing until the setting is engaged
  // (the Perry preset ships 'offbeat', the King Tubby placement).
  //
  // Lane playback is never re-quantized: those events already carry the timing
  // they were recorded with, and snapping them again would drift a performance
  // away from what was captured.
  const throwQuantize = _bus.getSettings().throwQuantize;
  if (source === 'live' && throwQuantize !== 'off' && !opts?.preQuantized) {
    const waitMs = msToNextGridBoundary(throwQuantize, bpm);
    if (waitMs > 0) return deferFire(moveId, move, channelId, merged, bpm, source, opts, waitMs);
  }

  return executeNow(moveId, move, channelId, merged, bpm, source, opts);
}

/**
 * Fire after `waitMs`, returning a handle immediately so a hold released
 * before the boundary arrives cancels cleanly rather than firing an orphan.
 */
function deferFire(
  moveId: string,
  move: DubMove,
  channelId: number | undefined,
  merged: Record<string, number>,
  bpm: number,
  source: 'live' | 'lane',
  opts: { deckId?: import('../dj/DeckEngine').DeckId } | undefined,
  waitMs: number,
): { dispose(): void } {
  let landed: { dispose(): void } | null = null;
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    landed = executeNow(moveId, move, channelId, merged, bpm, source, opts);
  }, waitMs);
  return {
    dispose() {
      cancelled = true;
      clearTimeout(timer);
      try { landed?.dispose(); } catch { /* ok */ }
    },
  };
}

/** Execute the move and publish the fire event. Row is read HERE, not at press
 *  time, so a recorded lane matches the moment the audio actually happened. */
function executeNow(
  moveId: string,
  move: DubMove,
  channelId: number | undefined,
  merged: Record<string, number>,
  bpm: number,
  source: 'live' | 'lane',
  opts: {
    deckId?: import('../dj/DeckEngine').DeckId;
    preQuantized?: boolean;
    origin?: DubFireOrigin;
  } | undefined,
): { dispose(): void } | null {
  if (!_bus) return null;
  const rawRow = currentRow();
  const quantize = useDubStore.getState().quantize;
  const row = quantize ? Math.round(rawRow) : rawRow;

  // A press writes its automation point at the row currently playing, and the
  // replayer rebuilds the automation table from the store every row — so the
  // point is read back and fired as playback on the next tick. One press, two
  // sounds. Drop the echo; a genuine replay on a later pass is far outside the
  // window. See `liveEcho.ts`.
  const echoKey = { moveId, channelId, row };
  const nowMs = performance.now();
  if (source === 'lane') {
    if (_liveEcho.isEcho(echoKey, nowMs)) return null;
  } else {
    _liveEcho.noteLive(echoKey, nowMs);
  }

  const ctx: DubMoveContext = { bus: _bus, channelId, deckId: opts?.deckId, params: merged, bpm, source };
  const disposer = move.execute(ctx);

  const invocationId = nextInvocationId();
  // An unlabelled fire is a hand: the user's surfaces (pads, keys, MIDI, MCP)
  // do not pass an origin, and treating them as the user is the safe default —
  // the AI is the one that must declare itself, because mislabelling ITS moves
  // as the player's makes it answer itself.
  const origin: DubFireOrigin = opts?.origin ?? (source === 'lane' ? 'lane' : 'user');
  const event: DubFireEvent = { invocationId, moveId, channelId, params: merged, row, timeSec: getSongTimeSec(), source, origin, isHold: !!disposer };
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
