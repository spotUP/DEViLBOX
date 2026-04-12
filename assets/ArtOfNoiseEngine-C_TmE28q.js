import { bO as getDevilboxAudioContext, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class ArtOfNoiseEngine {
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
  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
    this.initialize();
  }
  static getInstance() {
    const currentCtx = getDevilboxAudioContext();
    if (!ArtOfNoiseEngine.instance || ArtOfNoiseEngine.instance._disposed || ArtOfNoiseEngine.instance.audioContext !== currentCtx) {
      if (ArtOfNoiseEngine.instance && !ArtOfNoiseEngine.instance._disposed) {
        ArtOfNoiseEngine.instance.dispose();
      }
      ArtOfNoiseEngine.instance = new ArtOfNoiseEngine();
    }
    return ArtOfNoiseEngine.instance;
  }
  static hasInstance() {
    return !!ArtOfNoiseEngine.instance && !ArtOfNoiseEngine.instance._disposed;
  }
  async initialize() {
    try {
      await ArtOfNoiseEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[ArtOfNoiseEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}artofnoise/ArtOfNoise.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}artofnoise/ArtOfNoise.wasm`),
          fetch(`${baseUrl}artofnoise/ArtOfNoise.js`)
        ]);
        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
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
    this.workletNode = new AudioWorkletNode(ctx, "artofnoise-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[ArtOfNoiseEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "moduleLoaded":
          console.log("[ArtOfNoiseEngine] Module loaded");
          break;
        case "chLevels":
          try {
            const engine = getToneEngine();
            const levels = data.levels;
            for (let ch = 0; ch < levels.length / 2; ch++) {
              const peak = Math.max(levels[ch * 2], levels[ch * 2 + 1]);
              engine.triggerChannelMeter(ch, peak);
            }
          } catch {
          }
          break;
        case "error":
          console.error("[ArtOfNoiseEngine]", data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: ArtOfNoiseEngine.wasmBinary,
      jsCode: ArtOfNoiseEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(buffer) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("ArtOfNoiseEngine not initialized");
    this.workletNode.port.postMessage(
      { type: "loadModule", moduleData: buffer }
    );
  }
  play() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "play" });
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
  setSubsong(index) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setSubsong", subsong: index });
  }
  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "setMuteMask", mask });
  }
  dispose() {
    var _a, _b;
    this._disposed = true;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "dispose" });
    (_b = this.workletNode) == null ? void 0 : _b.disconnect();
    this.workletNode = null;
    if (ArtOfNoiseEngine.instance === this) {
      ArtOfNoiseEngine.instance = null;
    }
  }
}
export {
  ArtOfNoiseEngine
};
