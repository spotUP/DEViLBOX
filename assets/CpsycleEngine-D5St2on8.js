import { bO as getDevilboxAudioContext } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class CpsycleEngine {
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
    if (!CpsycleEngine.instance || CpsycleEngine.instance._disposed) {
      CpsycleEngine.instance = new CpsycleEngine();
    }
    return CpsycleEngine.instance;
  }
  static hasInstance() {
    return !!CpsycleEngine.instance && !CpsycleEngine.instance._disposed;
  }
  async initialize() {
    try {
      await CpsycleEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[CpsycleEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}cpsycle/Cpsycle.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}cpsycle/Cpsycle.wasm`),
          fetch(`${baseUrl}cpsycle/Cpsycle.js`)
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
    this.workletNode = new AudioWorkletNode(ctx, "cpsycle-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[CpsycleEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "moduleLoaded":
          console.log("[CpsycleEngine] Module loaded");
          break;
        case "error":
          console.error("[CpsycleEngine]", data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: CpsycleEngine.wasmBinary,
      jsCode: CpsycleEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(buffer) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("CpsycleEngine not initialized");
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
  dispose() {
    var _a, _b;
    this._disposed = true;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "dispose" });
    (_b = this.workletNode) == null ? void 0 : _b.disconnect();
    this.workletNode = null;
    if (CpsycleEngine.instance === this) {
      CpsycleEngine.instance = null;
    }
  }
}
export {
  CpsycleEngine
};
