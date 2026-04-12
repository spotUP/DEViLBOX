const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { bO as getDevilboxAudioContext, $ as getToneEngine, am as __vitePreload, an as useSettingsStore } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class LibopenmptEngine {
  static instance = null;
  context = null;
  workletNode = null;
  gainNode = null;
  _ready = false;
  _available = false;
  _initPromise = null;
  _playing = false;
  _onPosition = null;
  _onEnded = null;
  _onChannelState = null;
  _durationSeconds = 0;
  _lastOrder = 0;
  _lastRow = 0;
  _onTransportEvent = null;
  /** Per-channel effect isolation: tracks which slots are active and their channel masks. */
  static MAX_ISOLATION_SLOTS = 4;
  _isolationSlotMasks = new Array(LibopenmptEngine.MAX_ISOLATION_SLOTS).fill(null);
  /** Subscribe to transport events (seek, pause, unpause, stop) for syncing isolation nodes. */
  set onTransportEvent(cb) {
    this._onTransportEvent = cb;
  }
  /** The raw Web Audio output node for routing into the stereo separation chain */
  output;
  constructor() {
  }
  static getInstance() {
    if (!LibopenmptEngine.instance) {
      LibopenmptEngine.instance = new LibopenmptEngine();
    }
    return LibopenmptEngine.instance;
  }
  static hasInstance() {
    return LibopenmptEngine.instance !== null;
  }
  /** Wait until the worklet is loaded and ready. */
  async ready() {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.init();
    return this._initPromise;
  }
  /** Whether libopenmpt worklet loaded successfully. */
  isAvailable() {
    return this._available;
  }
  async init() {
    try {
      this.context = getDevilboxAudioContext();
    } catch {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 1;
    this.output = this.gainNode;
    const baseUrl = "/";
    const cacheBuster = `?v=${Date.now()}`;
    try {
      await this.context.audioWorklet.addModule(`${baseUrl}chiptune3/chiptune3.worklet.js${cacheBuster}`);
    } catch (err) {
      console.warn("[LibopenmptEngine] Failed to load worklet:", err);
      this._ready = true;
      this._available = false;
      return;
    }
    this.workletNode = new AudioWorkletNode(this.context, "libopenmpt-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1 + LibopenmptEngine.MAX_ISOLATION_SLOTS,
      outputChannelCount: [2, 2, 2, 2, 2]
    });
    this.workletNode.port.onmessage = this.handleMessage.bind(this);
    this.workletNode.port.postMessage({
      cmd: "config",
      val: { repeatCount: -1, stereoSeparation: 100, interpolationFilter: 0 }
    });
    this.workletNode.connect(this.gainNode);
    this._ready = true;
    this._available = true;
    console.log("[LibopenmptEngine] Ready");
  }
  handleMessage(msg) {
    var _a, _b, _c;
    const { cmd, order, pattern, row, chLevels, chState, audioTime } = msg.data;
    switch (cmd) {
      case "pos":
        this._lastOrder = order;
        this._lastRow = row;
        if (this._playing) (_a = this._onPosition) == null ? void 0 : _a.call(this, order, pattern, row, audioTime);
        if (chLevels) {
          try {
            const engine = getToneEngine();
            for (let i = 0; i < chLevels.length; i++) {
              if (chLevels[i] > 0.05) {
                engine.triggerChannelMeter(i, chLevels[i]);
              }
            }
            engine.updateRealtimeChannelLevels(chLevels);
          } catch {
          }
        }
        if (chState && this._onChannelState) {
          const arr = chState;
          const numChannels = arr.length / 6;
          const state = [];
          for (let i = 0; i < numChannels; i++) {
            const base = i * 6;
            state.push({
              note: arr[base + 0],
              instrument: arr[base + 1],
              volume: arr[base + 2],
              frequency: arr[base + 3],
              panning: arr[base + 4],
              active: arr[base + 5] !== 0
            });
          }
          const rawCtx = this.output.context;
          const latency = rawCtx.outputLatency ?? rawCtx.baseLatency ?? 0;
          const time = rawCtx.currentTime + latency;
          this._onChannelState(state, time);
        }
        break;
      case "meta":
        if (((_b = msg.data.meta) == null ? void 0 : _b.dur) > 0) {
          this._durationSeconds = msg.data.meta.dur;
        }
        break;
      case "end":
        this._playing = false;
        (_c = this._onEnded) == null ? void 0 : _c.call(this);
        break;
      case "err":
        console.error("[LibopenmptEngine] Worklet error:", msg.data.val);
        this._playing = false;
        break;
      case "isolationReady":
        console.log(`[LibopenmptEngine] Isolation slot ${msg.data.slotIndex} ready:`, {
          channelMask: "0x" + (msg.data.channelMask ?? 0).toString(16),
          muteFunc: msg.data.muteFunc,
          effectiveSlotMask: "0x" + (msg.data.effectiveSlotMask ?? 0).toString(16),
          userMuteMask: "0x" + (msg.data.userMuteMask ?? 0).toString(16),
          isolatedBits: "0x" + (msg.data.isolatedBits ?? 0).toString(16)
        });
        break;
      case "isolationError":
        console.warn(`[LibopenmptEngine] Isolation slot ${msg.data.slotIndex} failed: ${msg.data.error}`);
        if (msg.data.slotIndex >= 0 && msg.data.slotIndex < LibopenmptEngine.MAX_ISOLATION_SLOTS) {
          this._isolationSlotMasks[msg.data.slotIndex] = null;
          this._updateMainMuteMask();
        }
        break;
      case "diagIsolation":
        console.log("[LibopenmptEngine] Isolation diagnostics:", msg.data);
        break;
      case "isolationDiag":
        console.log("[LibopenmptEngine] 🔍 Periodic isolation state:", {
          isolatedBits: "0x" + (msg.data.isolatedBits ?? 0).toString(16),
          userMuteMask: "0x" + (msg.data.userMuteMask ?? 0).toString(16),
          effectiveMainMask: "0x" + (msg.data.effectiveMainMask ?? 0).toString(16),
          channels: msg.data.channels,
          activeSlots: msg.data.activeSlots,
          slotMasks: msg.data.slotMasks
        });
        break;
    }
  }
  /** Set callback for position updates (order, pattern, row). */
  set onPosition(cb) {
    this._onPosition = cb;
  }
  /** Set callback for song end. */
  set onEnded(cb) {
    this._onEnded = cb;
  }
  /** Set callback for per-row channel state updates (note, instrument, volume, frequency, panning, active). */
  set onChannelState(cb) {
    this._onChannelState = cb;
  }
  /** Duration of the loaded module in seconds (0 if unknown). */
  getDurationSeconds() {
    return this._durationSeconds;
  }
  /** Load a module file (raw binary) into the worklet. */
  async loadTune(data) {
    if (!this._available || !this.workletNode) {
      throw new Error("LibopenmptEngine not available");
    }
    this.stop();
    this._pendingData = data;
  }
  _pendingData = null;
  play() {
    if (!this._available || !this.workletNode) {
      console.warn("[LibopenmptEngine] play() aborted: available =", this._available, "workletNode =", !!this.workletNode);
      return;
    }
    const data = this._pendingData;
    if (!data) {
      console.warn("[LibopenmptEngine] play() aborted: no pending data");
      return;
    }
    console.log("[LibopenmptEngine] play(): sending", data.byteLength, "bytes to worklet");
    this._isolationSlotMasks.fill(null);
    this.workletNode.port.postMessage({ cmd: "play", val: data });
    this._playing = true;
    setTimeout(() => this._rebuildIsolationAfterPlay(), 100);
  }
  /**
   * After a new song starts, recreate isolation slots if any per-channel effects exist
   * (either mixer insert effects or master effects with selectedChannels).
   */
  _rebuildIsolationAfterPlay() {
    try {
      void __vitePreload(async () => {
        const { scheduleWasmEffectRebuild } = await import("./main-BbV5VyEH.js").then((n) => n.iW);
        return { scheduleWasmEffectRebuild };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ scheduleWasmEffectRebuild }) => {
        scheduleWasmEffectRebuild();
      });
    } catch (e) {
      console.warn("[LibopenmptEngine] Failed to rebuild isolation after play:", e);
    }
  }
  stop() {
    var _a;
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: "stop" });
    this._playing = false;
    (_a = this._onTransportEvent) == null ? void 0 : _a.call(this, "stop");
  }
  pause() {
    var _a;
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: "pause" });
    (_a = this._onTransportEvent) == null ? void 0 : _a.call(this, "pause");
  }
  resume() {
    var _a;
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: "unpause" });
    (_a = this._onTransportEvent) == null ? void 0 : _a.call(this, "unpause");
  }
  /** Hot-reload module data without restarting playback. Preserves position. */
  hotReload(data) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: "hotReload", val: data });
  }
  /** Set channel mute mask (bit N=1 means channel N is ACTIVE). */
  setMuteMask(mask) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: "setMuteMask", val: mask });
  }
  /** Seek to a specific order and row. */
  seekTo(order, row) {
    var _a;
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ cmd: "setOrderRow", val: { o: order, r: row } });
    (_a = this._onTransportEvent) == null ? void 0 : _a.call(this, "seek", order, row);
  }
  /** Set stereo separation (0-200, libopenmpt scale). */
  setStereoSeparation(percent) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      cmd: "config",
      val: { stereoSeparation: percent }
    });
  }
  isPlaying() {
    return this._playing;
  }
  /**
   * Whether this engine has already wired its output into a destination
   * AudioNode for the active TrackerReplayer session. Reset on dispose() and
   * stays false on every fresh getInstance() — startWithCoordinator() guards
   * against double-routing during play() reloads.
   */
  _routed = false;
  /**
   * High-level "start playing this song under the given coordinator" entry
   * point. Replaces ~80 lines of glue that previously lived inline in
   * TrackerReplayer.play(). Owns:
   *
   *   - readiness check + availability fallback
   *   - bridge serialize (if user has unsaved soundlib edits)
   *   - loadTune
   *   - one-time audio routing into the destination AudioNode
   *   - stereo separation read from settings store
   *   - position-update subscription that dispatches through the coordinator
   *   - song-end forwarding to coordinator.onSongEnd
   *   - play() + initial seek (unless `startMuted`)
   *
   * Returns `{ started: true }` on success. Returns `{ started: false }` if
   * the worklet failed to initialize so the caller can fall back to its TS
   * scheduler. Throws on programming errors only — load failures are reported
   * via the return value.
   */
  async startWithCoordinator(coordinator, opts) {
    await this.ready();
    if (!this.isAvailable()) return { started: false };
    if (!opts.song.libopenmptFileData) {
      throw new Error("LibopenmptEngine.startWithCoordinator: song.libopenmptFileData is null");
    }
    let tuneData = opts.song.libopenmptFileData;
    const bridge = await __vitePreload(() => import("./main-BbV5VyEH.js").then((n) => n.j7), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    if (bridge.isActive() && bridge.isDirty()) {
      const serialized = await bridge.serialize();
      if (serialized) {
        tuneData = serialized;
        opts.song.libopenmptFileData = serialized;
      }
    }
    await this.loadTune(tuneData);
    if (opts.destination) {
      try {
        this.output.disconnect();
      } catch {
      }
      try {
        this.output.connect(opts.destination);
      } catch (err) {
        console.warn("[LibopenmptEngine] startWithCoordinator: routing failed, falling back to context.destination:", err);
        try {
          this.output.connect(this.output.context.destination);
        } catch {
        }
      }
    } else if (!this._routed) {
      try {
        this.output.connect(this.output.context.destination);
      } catch {
      }
      this._routed = true;
    }
    {
      const settings = useSettingsStore.getState();
      const sep = settings.stereoSeparationMode === "pt2" ? settings.stereoSeparation * 2 : settings.modplugSeparation;
      this.setStereoSeparation(sep);
    }
    let lastRow = -1;
    let lastOrder = -1;
    this.onPosition = (order, _pattern, row, audioTime) => {
      if (row === lastRow && order === lastOrder) return;
      lastRow = row;
      lastOrder = order;
      coordinator.dispatchEnginePosition(row, order, audioTime);
    };
    this.onEnded = () => {
      if (coordinator.onSongEnd) coordinator.onSongEnd();
    };
    if (!opts.startMuted) {
      this.play();
      if (opts.initialSongPos > 0 || opts.initialPattPos > 0) {
        this.seekTo(opts.initialSongPos, opts.initialPattPos);
      }
    }
    return { started: true };
  }
  /** Get the current module buffer (for creating isolation worklet instances). */
  getModuleBuffer() {
    return this._pendingData;
  }
  /** Get the AudioContext used by this engine (for creating additional worklet nodes). */
  getAudioContext() {
    return this.context;
  }
  /** Get current playback position (last known from worklet position messages). */
  getCurrentPosition() {
    return { order: this._lastOrder, row: this._lastRow };
  }
  // ---------------------------------------------------------------------------
  // Per-channel effect isolation (multi-output worklet)
  // ---------------------------------------------------------------------------
  /**
   * Create (or update) an isolation slot that renders ONLY the specified channels.
   * The worklet creates a secondary openmpt module instance and renders its audio
   * to output[slotIndex+1]. The main module's mute mask is automatically updated
   * to exclude isolated channels.
   * @param slotIndex 0..MAX_ISOLATION_SLOTS-1
   * @param channelMask Bitmask where bit N=1 means channel N is audible in this slot
   */
  addIsolation(slotIndex, channelMask) {
    if (!this.workletNode || !this.context || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = channelMask;
    this.workletNode.port.postMessage({ cmd: "addIsolation", val: { slotIndex, channelMask } });
    this._updateMainMuteMask();
    console.log(`[LibopenmptEngine] addIsolation: slot=${slotIndex}, mask=0x${channelMask.toString(16)}, output=${slotIndex + 1}`);
  }
  /**
   * Destroy an isolation slot and return its channels to the main mix.
   */
  removeIsolation(slotIndex) {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = null;
    this.workletNode.port.postMessage({ cmd: "removeIsolation", val: { slotIndex } });
    this._updateMainMuteMask();
  }
  /**
   * Update which channels an isolation slot renders (without destroying/recreating).
   */
  updateIsolationMask(slotIndex, channelMask) {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= LibopenmptEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = channelMask;
    this.workletNode.port.postMessage({ cmd: "updateIsolationMask", val: { slotIndex, channelMask } });
    this._updateMainMuteMask();
  }
  /**
   * Get the AudioWorkletNode (main worklet).
   * Output 0 = main mix. Outputs 1..4 = isolation slots for per-channel effects.
   */
  getWorkletNode() {
    return this.workletNode;
  }
  /**
   * Remove all isolation slots (called on stop/dispose).
   */
  removeAllIsolation() {
    for (let i = 0; i < LibopenmptEngine.MAX_ISOLATION_SLOTS; i++) {
      if (this._isolationSlotMasks[i] !== null) {
        this.removeIsolation(i);
      }
    }
  }
  /**
   * Recompute and send the main module's mute mask.
   * The main module renders all channels EXCEPT those currently isolated.
   */
  _updateMainMuteMask() {
    if (!this.workletNode) return;
    let isolatedBits = 0;
    for (const mask of this._isolationSlotMasks) {
      if (mask !== null) isolatedBits |= mask;
    }
    const mainMask = 4294967295 & ~isolatedBits;
    console.log(`[LibopenmptEngine] updateMainMask: isolatedBits=0x${isolatedBits.toString(16)}, mainMask=0x${mainMask.toString(16)}, slotMasks=${JSON.stringify(this._isolationSlotMasks)}`);
    this.workletNode.port.postMessage({ cmd: "updateMainMask", val: mainMask });
  }
  /**
   * Request diagnostic info about isolation state from the worklet.
   * Results are logged to the console via handleMessage.
   */
  diagIsolation() {
    if (!this.workletNode) {
      console.warn("[LibopenmptEngine] No worklet node");
      return;
    }
    console.log(`[LibopenmptEngine] TS-side isolation masks:`, this._isolationSlotMasks);
    this.workletNode.port.postMessage({ cmd: "diagIsolation" });
  }
  dispose() {
    var _a, _b;
    this.removeAllIsolation();
    this.stop();
    try {
      (_a = this.workletNode) == null ? void 0 : _a.disconnect();
    } catch {
    }
    try {
      (_b = this.gainNode) == null ? void 0 : _b.disconnect();
    } catch {
    }
    this.workletNode = null;
    this.gainNode = null;
    this._ready = false;
    this._available = false;
    this._pendingData = null;
    this._routed = false;
    this._isolationSlotMasks = new Array(LibopenmptEngine.MAX_ISOLATION_SLOTS).fill(null);
    LibopenmptEngine.instance = null;
  }
}
export {
  LibopenmptEngine
};
