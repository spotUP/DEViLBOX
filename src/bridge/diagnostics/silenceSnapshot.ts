/**
 * Catch the moment the music stops.
 *
 * `getPlaybackSilence` is a pull: it answers for the instant it is called. The
 * jennipha.ahx failure (reported repeatedly through 2026-09-21/22) needs the
 * opposite — the state at the moment the sound went, minutes before anyone can
 * ask for it. Every reading taken afterwards is contaminated, because the act
 * of looking at the UI (selecting an instrument) restores the audio.
 *
 * So this samples the master meter once a second, keeps a short ring of what it
 * saw, and captures ONE full graph snapshot the first time playback has been
 * silent for `SILENCE_TRIP_MS`. The snapshot is kept until explicitly cleared,
 * so a later repair cannot overwrite the evidence.
 *
 * Diagnostic only: it reads meters and store state, and changes nothing.
 */

const SAMPLE_MS = 1000;
/** Silence must persist this long to count — a rest between phrases is not a fault. */
const SILENCE_TRIP_MS = 3000;
/** Anything at or below this is silence; the meter never reads exactly 0 with a live graph. */
const SILENT_RMS = 1e-6;
const HISTORY_LEN = 120;

export interface SilenceSample {
  /** ms since the watchdog armed. */
  t: number;
  rms: number;
  row: number;
  globalRow: number;
  playing: boolean;
}

export interface SilenceSnapshot {
  /** ms since the watchdog armed, at the moment silence was declared. */
  t: number;
  isoTime: string;
  /** How long it had already been silent when captured. */
  silentForMs: number;
  row: number;
  globalRow: number;
  /**
   * The full `get_dub_bus_state` payload at the moment of the fault.
   *
   * Its `upstreamLevels` read null on this first pass: those taps are created
   * on demand and have not seen a render quantum yet. `graphAfter` is the same
   * probe taken a moment later, and it is the one that says which node the
   * signal reaches.
   */
  graph: Record<string, unknown> | null;
  /** The same probe ~800 ms later, with every tap live. */
  graphAfter: Record<string, unknown> | null;
  /** Where each native engine's output gain is connected, by engine key. */
  nativeRouting: Record<string, number> | null;
  /** What the meter did in the seconds leading up to it. */
  approach: SilenceSample[];
}

let timer: ReturnType<typeof setInterval> | null = null;
let armedAt = 0;
let silentSince = 0;
let snapshot: SilenceSnapshot | null = null;
let capturing = false;
const history: SilenceSample[] = [];

function push(sample: SilenceSample): void {
  history.push(sample);
  if (history.length > HISTORY_LEN) history.shift();
}

async function tick(): Promise<void> {
  const now = Date.now();
  let rms = 0;
  try {
    const { AudioDataBus } = await import('../../engine/vj/AudioDataBus');
    const bus = AudioDataBus.getShared();
    bus.update();
    const frame = bus.getFrame();
    rms = typeof frame.rms === 'number' ? frame.rms : 0;
  } catch { return; }

  const { useTransportStore } = await import('../../stores/useTransportStore');
  const transport = useTransportStore.getState();
  const playing = transport.isPlaying;

  push({
    t: now - armedAt,
    rms,
    row: transport.currentRow,
    globalRow: transport.currentGlobalRow,
    playing,
  });

  if (!playing || rms > SILENT_RMS) {
    silentSince = 0;
    return;
  }
  if (silentSince === 0) { silentSince = now; return; }
  if (now - silentSince < SILENCE_TRIP_MS) return;
  // One capture per arming. A later repair must not overwrite the evidence.
  if (snapshot || capturing) return;

  capturing = true;
  const pending: SilenceSnapshot = {
    t: now - armedAt,
    isoTime: new Date(now).toISOString(),
    silentForMs: now - silentSince,
    row: transport.currentRow,
    globalRow: transport.currentGlobalRow,
    graph: null,
    graphAfter: null,
    nativeRouting: null,
    approach: history.slice(),
  };
  try {
    const { getDubBusState } = await import('../handlers/readHandlers');
    pending.graph = await getDubBusState();
    // The native engine's own routing table. `rerouteNativeEngine` and
    // `restoreNativeEngineRouting` move this gain between destinations; an
    // empty destination set is an engine connected to nothing at all, which no
    // level reading can distinguish from an engine rendering silence.
    try {
      const { getToneEngine } = await import('../../engine/ToneEngine');
      const routing = (getToneEngine() as unknown as {
        nativeEngineRouting?: Map<string, { destinations?: Set<unknown> }>;
      }).nativeEngineRouting;
      if (routing) {
        const counts: Record<string, number> = {};
        for (const [key, entry] of routing.entries()) counts[key] = entry.destinations?.size ?? -1;
        pending.nativeRouting = counts;
      }
    } catch { /* engine not loaded */ }
    // Taps created on the first probe are empty; give them a render quantum.
    await new Promise<void>(resolve => setTimeout(resolve, 800));
    pending.graphAfter = await getDubBusState();
  } catch { /* graph probe unavailable — the approach history still says something */ }
  snapshot = pending;
  capturing = false;
  console.error(
    '[SilenceSnapshot] playback went silent at globalRow',
    pending.globalRow,
    '- snapshot captured, read it with get_playback_silence',
  );
}

/** Start sampling. Safe to call repeatedly; only the first call arms it. */
export function armSilenceSnapshot(): void {
  if (timer) return;
  armedAt = Date.now();
  silentSince = 0;
  timer = setInterval(() => { void tick(); }, SAMPLE_MS);
}

/** The captured fault, or null if playback has not gone silent since arming. */
export function getSilenceSnapshot(): SilenceSnapshot | null {
  return snapshot;
}

/** Recent meter samples, oldest first. */
export function getSilenceHistory(): SilenceSample[] {
  return history.slice();
}

/** Throw the captured fault away so the next one can be caught. */
export function clearSilenceSnapshot(): void {
  snapshot = null;
  silentSince = 0;
  history.length = 0;
  armedAt = Date.now();
}

/** Stop sampling. Used by tests; the app leaves it running. */
export function disarmSilenceSnapshot(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// ---------------------------------------------------------------------------
// Who wrote this gain?
// ---------------------------------------------------------------------------

/**
 * `HivelySynth.output.gain` goes to 0 mid-song and nothing in the codebase
 * admits to writing it: traces on every call site that touches an instrument
 * output gain stayed silent while the value went 1 -> 0.
 *
 * An AudioParam gives no change notification, so the only way to name the
 * writer is to instrument the param itself. This wraps the scheduling methods
 * and the `value` setter on ONE node and records a stack for every write.
 *
 * Diagnostic only, and it wraps a node at most once.
 */
export interface GainWrite {
  /** ms since the watchdog armed. */
  t: number;
  method: string;
  value: number;
  stack: string;
}

const gainWrites: GainWrite[] = [];
const wrapped = new WeakSet<AudioParam>();

/** Record every write to `param`, naming the caller. Idempotent per param. */
export function watchGainParam(param: AudioParam, label: string): void {
  if (wrapped.has(param)) return;
  wrapped.add(param);

  const record = (method: string, value: number): void => {
    const stack = (new Error().stack ?? '').split('\n').slice(2, 8).join(' | ');
    gainWrites.push({ t: Date.now() - armedAt, method: `${label}.${method}`, value, stack });
    if (gainWrites.length > 60) gainWrites.shift();
  };

  for (const method of [
    'setValueAtTime',
    'linearRampToValueAtTime',
    'exponentialRampToValueAtTime',
    'setTargetAtTime',
    'cancelScheduledValues',
    'cancelAndHoldAtTime',
  ] as const) {
    const original = (param as unknown as Record<string, unknown>)[method];
    if (typeof original !== 'function') continue;
    (param as unknown as Record<string, unknown>)[method] = function (
      this: AudioParam,
      ...args: unknown[]
    ) {
      record(method, args[0] as number);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }

  // `value` lives on AudioParam.prototype; shadow it with an own accessor.
  const proto = Object.getPrototypeOf(param) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.get && descriptor.set) {
    const { get, set } = descriptor;
    Object.defineProperty(param, 'value', {
      configurable: true,
      get() { return get.call(this); },
      set(v: number) { record('value=', v); set.call(this, v); },
    });
  }
}

/** Every recorded write, oldest first. */
export function getGainWrites(): GainWrite[] {
  return gainWrites.slice();
}
