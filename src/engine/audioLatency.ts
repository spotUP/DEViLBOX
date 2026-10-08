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
