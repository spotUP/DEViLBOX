import { bO as getDevilboxAudioContext } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class CoreDesignEngine {
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
    if (!CoreDesignEngine.instance || CoreDesignEngine.instance._disposed) {
      CoreDesignEngine.instance = new CoreDesignEngine();
    }
    return CoreDesignEngine.instance;
  }
  static hasInstance() {
    return !!CoreDesignEngine.instance && !CoreDesignEngine.instance._disposed;
  }
  async initialize() {
    try {
      await CoreDesignEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[CoreDesignEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existing = this.initPromises.get(context);
    if (existing) return existing;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}coredesign/CoreDesign.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResp, jsResp] = await Promise.all([
          fetch(`${baseUrl}coredesign/CoreDesign.wasm`),
          fetch(`${baseUrl}coredesign/CoreDesign.js`)
        ]);
        if (wasmResp.ok) this.wasmBinary = await wasmResp.arrayBuffer();
        if (jsResp.ok) {
          let code = await jsResp.text();
          code = code.replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, "");
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
    this.workletNode = new AudioWorkletNode(ctx, "coredesign-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[CoreDesignEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "loaded":
          console.log("[CoreDesignEngine] Module loaded:", data.title);
          break;
        case "error":
          console.error("[CoreDesignEngine] Error:", data.msg);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: CoreDesignEngine.wasmBinary,
      jsCode: CoreDesignEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(data) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("CoreDesignEngine not initialized");
    const copy = data.slice(0);
    this.workletNode.port.postMessage({ type: "load", data: copy }, [copy]);
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
  setMuteMask(mask) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "setMuteMask", mask });
  }
  dispose() {
    var _a, _b;
    this._disposed = true;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "stop" });
    (_b = this.workletNode) == null ? void 0 : _b.disconnect();
    this.workletNode = null;
    if (CoreDesignEngine.instance === this) CoreDesignEngine.instance = null;
  }
}
export {
  CoreDesignEngine
};
