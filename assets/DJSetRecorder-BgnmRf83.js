import { b as useDJStore } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function loadEvent(t, deck, source, fileName, bpm) {
  return { t, type: "load", deck, values: { source, fileName, bpm } };
}
function continuousEvent(t, type, value, deck) {
  return deck ? { t, type, deck, value } : { t, type, value };
}
function discreteEvent(t, type, deck, values) {
  const e = { t, type };
  if (deck) e.deck = deck;
  if (values) e.values = values;
  return e;
}
const DECK_IDS = ["A", "B", "C"];
const CONTINUOUS_INTERVAL_MS = 16;
class DJSetRecorder {
  _events = [];
  _tracks = [];
  _startTime = 0;
  _recording = false;
  _unsubscribers = [];
  /** Last emit time per param key — for continuous event throttling */
  _lastEmit = /* @__PURE__ */ new Map();
  // ── Lifecycle ─────────────────────────────────────────────────────────
  startRecording() {
    if (this._recording) return;
    this._recording = true;
    this._events = [];
    this._tracks = [];
    this._lastEmit.clear();
    this._startTime = performance.now();
    this._subscribeToStore();
  }
  stopRecording(name, authorId, authorName) {
    this._recording = false;
    this._unsubscribeAll();
    const durationMs = performance.now() - this._startTime;
    const metadata = {
      id: crypto.randomUUID(),
      name,
      authorId,
      authorName,
      createdAt: Date.now(),
      durationMs: Math.round(durationMs),
      trackList: this._tracks,
      version: 1
    };
    return { metadata, events: this._events };
  }
  /** Microseconds elapsed since recording started */
  elapsed() {
    return (performance.now() - this._startTime) * 1e3;
  }
  get isRecording() {
    return this._recording;
  }
  get eventCount() {
    return this._events.length;
  }
  // ── Track load recording (called from DJEngine) ───────────────────────
  recordTrackLoad(deck, source, fileName, trackName, bpm) {
    if (!this._recording) return;
    const t = this.elapsed();
    this._events.push(loadEvent(t, deck, source, fileName, bpm));
    this._tracks.push({ source, fileName, trackName, bpm, loadedAt: t });
  }
  // ── Store subscriptions ───────────────────────────────────────────────
  _subscribeToStore() {
    const store = useDJStore;
    this._subscribeContinuous(
      () => store.getState().crossfaderPosition,
      "crossfader",
      "crossfader"
    );
    this._subscribeContinuous(
      () => store.getState().masterVolume,
      "masterVolume",
      "masterVolume"
    );
    this._subscribeDiscrete(
      () => store.getState().crossfaderCurve,
      (curve) => this._emit(discreteEvent(this.elapsed(), "crossfaderCurve", void 0, { curve }))
    );
    for (const deck of DECK_IDS) {
      const getDeck = () => store.getState().decks[deck];
      this._subscribeDiscrete(
        () => getDeck().isPlaying,
        (playing) => this._emit(discreteEvent(this.elapsed(), playing ? "play" : "stop", deck))
      );
      this._subscribeContinuous(() => getDeck().volume, `${deck}.volume`, "volume", deck);
      this._subscribeContinuous(() => getDeck().eqLow, `${deck}.eqLow`, "eqLow", deck);
      this._subscribeContinuous(() => getDeck().eqMid, `${deck}.eqMid`, "eqMid", deck);
      this._subscribeContinuous(() => getDeck().eqHigh, `${deck}.eqHigh`, "eqHigh", deck);
      this._subscribeContinuous(() => getDeck().filterPosition, `${deck}.filter`, "filter", deck);
      this._subscribeContinuous(() => getDeck().filterResonance, `${deck}.filterRes`, "filterRes", deck);
      this._subscribeContinuous(() => getDeck().pitchOffset, `${deck}.pitch`, "pitch", deck);
      this._subscribeDiscrete(
        () => getDeck().eqLowKill,
        (kill) => this._emit(discreteEvent(this.elapsed(), "eqKill", deck, { band: "low", kill }))
      );
      this._subscribeDiscrete(
        () => getDeck().eqMidKill,
        (kill) => this._emit(discreteEvent(this.elapsed(), "eqKill", deck, { band: "mid", kill }))
      );
      this._subscribeDiscrete(
        () => getDeck().eqHighKill,
        (kill) => this._emit(discreteEvent(this.elapsed(), "eqKill", deck, { band: "high", kill }))
      );
      this._subscribeDiscrete(
        () => getDeck().keyLockEnabled,
        (enabled) => this._emit(discreteEvent(this.elapsed(), "keyLock", deck, { enabled }))
      );
      this._subscribeDiscrete(
        () => getDeck().scratchActive,
        (active) => {
          if (active) {
            const pattern = getDeck().activePatternName;
            this._emit(discreteEvent(this.elapsed(), "scratchStart", deck, { pattern }));
          } else {
            this._emit(discreteEvent(this.elapsed(), "scratchStop", deck));
          }
        }
      );
      this._subscribeDiscrete(
        () => getDeck().faderLFOActive,
        (active) => {
          const division = getDeck().faderLFODivision;
          this._emit(discreteEvent(this.elapsed(), "faderLFO", deck, { active, division }));
        }
      );
      this._subscribeDiscrete(
        () => `${getDeck().loopActive}:${getDeck().loopMode}:${getDeck().lineLoopSize}`,
        () => {
          const d = getDeck();
          this._emit(discreteEvent(this.elapsed(), "loop", deck, {
            active: d.loopActive,
            mode: d.loopMode,
            size: d.lineLoopSize
          }));
        }
      );
      this._subscribeDiscrete(
        () => getDeck().channelMask,
        (mask) => this._emit(discreteEvent(this.elapsed(), "channelMute", deck, { mask }))
      );
    }
  }
  // ── Subscription helpers ──────────────────────────────────────────────
  _subscribeContinuous(selector, key, eventType, deck) {
    let prev = selector();
    const unsub = useDJStore.subscribe((state) => {
      const val = selector();
      if (val === prev) return;
      prev = val;
      const now = performance.now();
      const lastMs = this._lastEmit.get(key) ?? 0;
      if (now - lastMs < CONTINUOUS_INTERVAL_MS) return;
      this._lastEmit.set(key, now);
      this._emit(continuousEvent(this.elapsed(), eventType, val, deck));
    });
    this._unsubscribers.push(unsub);
  }
  _subscribeDiscrete(selector, handler) {
    let prev = selector();
    const unsub = useDJStore.subscribe(() => {
      const val = selector();
      if (val === prev) return;
      prev = val;
      handler(val);
    });
    this._unsubscribers.push(unsub);
  }
  _emit(event) {
    if (!this._recording) return;
    this._events.push(event);
  }
  _unsubscribeAll() {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
  }
}
export {
  DJSetRecorder
};
