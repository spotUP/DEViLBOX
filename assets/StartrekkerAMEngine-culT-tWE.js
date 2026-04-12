import { bO as getDevilboxAudioContext } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class StartrekkerAMEngine {
  static instance = null;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new WeakSet();
  static initPromises = /* @__PURE__ */ new WeakMap();
  audioContext;
  workletNode = null;
  output;
  _initPromise;
  _resolveInit = null;
  _disposed = false;
  // Per-channel voice state: { instrumentId, samplePosition (0-1) }
  _voiceState = [
    { instr: 0, pos: 0 },
    { instr: 0, pos: 0 },
    { instr: 0, pos: 0 },
    { instr: 0, pos: 0 }
  ];
  _voiceListeners = /* @__PURE__ */ new Set();
  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
    this.initialize();
  }
  static getInstance() {
    if (!StartrekkerAMEngine.instance || StartrekkerAMEngine.instance._disposed) {
      StartrekkerAMEngine.instance = new StartrekkerAMEngine();
    }
    return StartrekkerAMEngine.instance;
  }
  static hasInstance() {
    return !!StartrekkerAMEngine.instance && !StartrekkerAMEngine.instance._disposed;
  }
  async initialize() {
    try {
      await StartrekkerAMEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[StartrekkerAMEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existing = this.initPromises.get(context);
    if (existing) return existing;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(
          `${baseUrl}startrekker-am/StartrekkerAM.worklet.js`
        );
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}startrekker-am/StartrekkerAM.wasm`),
          fetch(`${baseUrl}startrekker-am/StartrekkerAM.js`)
        ]);
        if (wasmResp.ok) this.wasmBinary = await wasmResp.arrayBuffer();
        if (jsResp.ok) {
          let code = await jsResp.text();
          code = code.replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, "").replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];').replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;').replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
          this.jsCode = code;
        }
      }
      this.loadedContexts.add(context);
    })();
    this.initPromises.set(context, initPromise);
    return initPromise;
  }
  createNode() {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, "startrekker-am-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[StartrekkerAMEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "loaded":
          console.log("[StartrekkerAMEngine] Module loaded:", data.title);
          break;
        case "modLoaded":
          console.log("[StartrekkerAMEngine] MOD file loaded, waiting for NT");
          break;
        case "error":
          console.error("[StartrekkerAMEngine] Error:", data.msg);
          break;
        case "voiceState": {
          const voices = data.voices;
          if (voices) {
            this._voiceState = voices;
            for (const cb of this._voiceListeners) cb(voices);
          }
          break;
        }
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: StartrekkerAMEngine.wasmBinary,
      jsCode: StartrekkerAMEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  /**
   * Load a StarTrekker AM module.
   * @param modData  The .mod / .adsc file bytes
   * @param ntData   The .nt companion file bytes (optional)
   */
  async loadTune(modData, ntData) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("StartrekkerAMEngine not initialized");
    if (ntData && ntData.byteLength > 0) {
      this.workletNode.port.postMessage(
        { type: "loadMod", data: modData.slice(0) },
        [modData.slice(0)]
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      this.workletNode.port.postMessage(
        { type: "loadNt", data: ntData.slice(0) },
        [ntData.slice(0)]
      );
    } else {
      const copy = modData.slice(0);
      this.workletNode.port.postMessage({ type: "load", data: copy }, [copy]);
    }
  }
  play() {
  }
  stop() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "stop" });
  }
  pause() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "stop" });
  }
  setChannelGain(channel, gain) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setChannelGain", channel, gain });
  }
  /** Write a 4-byte ProTracker pattern cell. Takes effect on next row read. */
  setPatternCell(pattern, row, channel, b0, b1, b2, b3) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setPatternCell", pattern, row, channel, b0, b1, b2, b3 });
  }
  /** Write a 16-bit NT instrument parameter. Takes effect immediately during playback. */
  setNtParam(instr, offset, value) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setNtParam", instr, offset, value: value & 65535 });
  }
  /** Get current voice state snapshot */
  getVoiceState() {
    return this._voiceState;
  }
  /** Subscribe to voice state updates (~15 Hz). Returns unsubscribe function. */
  onVoiceState(cb) {
    this._voiceListeners.add(cb);
    return () => this._voiceListeners.delete(cb);
  }
  /** Get playback position (0-1) for a specific instrument across all channels.
   *  Returns the max position if the instrument is active on multiple channels, or -1 if not playing. */
  getInstrumentPosition(instrumentId) {
    let maxPos = -1;
    for (const v of this._voiceState) {
      if (v.instr === instrumentId && v.pos >= 0) {
        if (v.pos > maxPos) maxPos = v.pos;
      }
    }
    return maxPos;
  }
  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "setMuteMask", mask });
  }
  dispose() {
    var _a, _b;
    this._disposed = true;
    this._voiceListeners.clear();
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "stop" });
    (_b = this.workletNode) == null ? void 0 : _b.disconnect();
    this.workletNode = null;
    if (StartrekkerAMEngine.instance === this) {
      StartrekkerAMEngine.instance = null;
    }
  }
}
export {
  StartrekkerAMEngine
};
