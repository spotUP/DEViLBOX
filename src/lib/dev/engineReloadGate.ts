/**
 * Hold a dev-server page reload while an agent session is using the tab.
 *
 * Observed 2026-10-08: master-FX measurements over the MCP bridge "crashed the
 * tab" on Big Muff Wall, Lo-Fi Drums and Brick Wall. They were not crashes and
 * not those presets: the Vite plugin devilbox-reload-on-engine-change sends a
 * full reload whenever a file under src/engine, stores, bridge, audio or midi
 * is saved, and another agent was saving src/engine/dj/** and
 * src/stores/useDJStore.ts. The bridge socket closed with code 1001 (a
 * navigation), the Vite client's reload showed in the navigation stack, and the
 * save times matched the reload times to the second. Whichever preset was being
 * measured at that moment took the blame.
 *
 * The reload itself is wanted (a worklet or engine singleton edited in place
 * leaves stale state, see vite.config.ts). What is wrong is the moment: a
 * measurement is one bridge call lasting up to 90 s, and a run is a series of
 * calls. So the reload waits until no bridge call is in flight and none has
 * finished for `quietMs`, and gives up waiting after `maxWaitMs`.
 */
export interface ReloadGateOptions {
  /** True while a bridge call is in flight. */
  inFlight: () => boolean;
  /** Milliseconds since the last bridge call started or finished (Infinity if never). */
  sinceLastActivityMs: () => number;
  reload: () => void;
  quietMs?: number;
  maxWaitMs?: number;
  pollMs?: number;
}

/** Returns request(): ask for a reload; many requests while waiting become one reload. */
export function createReloadGate(opts: ReloadGateOptions): () => void {
  const { inFlight, sinceLastActivityMs, reload, quietMs = 10_000, maxWaitMs = 300_000, pollMs = 500 } = opts;
  let waiting: ReturnType<typeof setInterval> | null = null;
  return () => {
    if (waiting) return;
    const idle = () => !inFlight() && sinceLastActivityMs() >= quietMs;
    if (idle()) { reload(); return; }
    const started = Date.now();
    waiting = setInterval(() => {
      if (idle() || Date.now() - started >= maxWaitMs) {
        clearInterval(waiting as ReturnType<typeof setInterval>);
        waiting = null;
        reload();
      }
    }, pollMs);
  };
}
