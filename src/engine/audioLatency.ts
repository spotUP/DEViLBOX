/**
 * Output latency, the one source for latency-compensated visuals.
 *
 * The audio context reports how long a sample takes from the graph to the
 * ear (`outputLatency`; `baseLatency` when the browser hides the rest). Every
 * visual that follows playback - the tracker's display ring, the DJ decks'
 * positions, rows, waveform playheads and lights - reads the position the
 * listener HEARS now, which is the position the engine has played minus that
 * latency at the current playback rate. No component keeps its own offset.
 */

export interface LatencySource {
  outputLatency?: number;
  baseLatency?: number;
}

/** Seconds from the audio graph to the ear; 0 when no context is wired. */
export function outputLatencySec(ctx: LatencySource | null | undefined): number {
  if (!ctx) return 0;
  const v = ctx.outputLatency ?? ctx.baseLatency ?? 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The position (seconds into the material) the listener hears now, given the
 * position the player has rendered up to, its playback rate and the output
 * latency. Never negative: before the first latency window the listener
 * hears the start.
 */
export function heardPositionSec(playedSec: number, playbackRate: number, latencySec: number): number {
  const rate = Number.isFinite(playbackRate) ? Math.abs(playbackRate) : 1;
  return Math.max(0, playedSec - latencySec * rate);
}

/**
 * A playback clock anchor: the heard position at one instant and how fast it
 * moves. Published once per position update; every per-frame consumer (rAF
 * loops, render workers) extrapolates it to its own frame time with
 * positionAtFrame, so a frame never draws a position held from an earlier
 * update.
 *
 * `anchorMs` is on the shared wall clock of clockNowMs() (timeOrigin-based),
 * which a worker and the main thread read alike.
 */
export interface ClockAnchor {
  /** Heard position (seconds into the material) at anchorMs. */
  positionSec: number;
  /** Seconds of material per second of time; 0 while paused or stopped. */
  rate: number;
  /** clockNowMs() time at which positionSec is heard. */
  anchorMs: number;
}

/** Now on the clock anchors use: comparable between the main thread and workers. */
export function clockNowMs(): number {
  const origin = typeof performance.timeOrigin === 'number' ? performance.timeOrigin : 0;
  return origin + performance.now();
}

/**
 * The heard position at a frame's time, from an anchor: the anchored
 * position advanced by the time since the anchor at the anchor's rate.
 * A paused anchor (rate 0) does not move. Clamped to [0, maxSec].
 */
export function positionAtFrame(anchor: ClockAnchor, frameMs: number, maxSec = Infinity): number {
  const rate = Number.isFinite(anchor.rate) ? anchor.rate : 0;
  const pos = rate === 0 ? anchor.positionSec : anchor.positionSec + ((frameMs - anchor.anchorMs) / 1000) * rate;
  return Math.min(Math.max(0, pos), maxSec);
}

export interface OutputClockSource extends LatencySource {
  currentTime: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

/**
 * The clockNowMs() time at which heardPositionSec(...), computed now from the
 * context's currentTime, reaches the ear. The context renders ahead in
 * quanta, so currentTime read at performance.now() is not the sample being
 * played: getOutputTimestamp maps a context time to the performance time it
 * is output, and the heard position belongs to currentTime minus the output
 * latency. Without a usable timestamp the heard position is taken as heard now.
 */
export function heardAnchorMs(ctx: OutputClockSource | null | undefined): number {
  const now = clockNowMs();
  if (!ctx || typeof ctx.getOutputTimestamp !== 'function') return now;
  let ts: { contextTime?: number; performanceTime?: number };
  try { ts = ctx.getOutputTimestamp(); } catch { return now; }
  const { contextTime, performanceTime } = ts;
  if (!Number.isFinite(contextTime) || !Number.isFinite(performanceTime) || !performanceTime) return now;
  const origin = typeof performance.timeOrigin === 'number' ? performance.timeOrigin : 0;
  const heardCtxTime = ctx.currentTime - outputLatencySec(ctx);
  const t = origin + (performanceTime as number) + (heardCtxTime - (contextTime as number)) * 1000;
  // A timestamp more than a second off is a stalled or suspended clock, not a mapping.
  return Number.isFinite(t) && Math.abs(t - now) < 1000 ? t : now;
}

/** A deck's heard position at a frame time: its clock anchor extrapolated, inside the track. */
export function deckPositionAt(deck: { positionAnchor: ClockAnchor; durationMs: number }, frameMs: number): number {
  return positionAtFrame(deck.positionAnchor, frameMs, deck.durationMs > 0 ? deck.durationMs / 1000 : Infinity);
}

/**
 * The audio-context time of the sample the listener hears now: the context's
 * currentTime minus the output latency. A display ring stamped in context
 * time (TrackerReplayer.getStateAtTime) is read at this time so the row on
 * screen is the row in the ear, not one scheduled ahead of it.
 */
export function heardContextTime(ctx: LatencySource & { currentTime: number }): number {
  return Math.max(0, ctx.currentTime - outputLatencySec(ctx));
}

/** Longest output latency a heard-signal delay covers, seconds. */
export const HEARD_DELAY_MAX_SEC = 1;

/**
 * A delay line that feeds a meter or analyser the signal the listener hears
 * now: the graph's signal delayed by the output latency. An analyser tapped
 * straight off the graph shows what was just rendered - outputLatency ahead
 * of the ear - so meters and scopes led the audio. Create it with
 * ctx.createDelay(HEARD_DELAY_MAX_SEC); call this whenever the visual reads
 * (the latency is known only once the context runs, and it can change).
 */
export function syncHeardDelay(delay: { delayTime: { value: number } }, ctx: LatencySource | null | undefined): void {
  const want = Math.min(outputLatencySec(ctx), HEARD_DELAY_MAX_SEC);
  if (Math.abs(delay.delayTime.value - want) > 0.0005) delay.delayTime.value = want;
}
