import { bO as getDevilboxAudioContext } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class Sd2Engine {
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
    if (!Sd2Engine.instance || Sd2Engine.instance._disposed) {
      Sd2Engine.instance = new Sd2Engine();
    }
    return Sd2Engine.instance;
  }
  static hasInstance() {
    return !!Sd2Engine.instance && !Sd2Engine.instance._disposed;
  }
  async initialize() {
    try {
      await Sd2Engine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[Sd2Engine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}sidmon2/Sd2.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sidmon2/Sd2.wasm`),
          fetch(`${baseUrl}sidmon2/Sd2.js`)
        ]);
        if (wasmResponse.ok) this.wasmBinary = await wasmResponse.arrayBuffer();
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
    this.workletNode = new AudioWorkletNode(ctx, "sd2-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (this.handleResponse(data)) return;
      switch (data.type) {
        case "ready":
          console.log("[Sd2Engine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "moduleLoaded":
          console.log("[Sd2Engine] Module loaded");
          break;
        case "error":
          console.error("[Sd2Engine]", data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: Sd2Engine.wasmBinary,
      jsCode: Sd2Engine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(buffer) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("Sd2Engine not initialized");
    this.workletNode.port.postMessage({ type: "loadModule", moduleData: buffer });
  }
  setChannelGain(channel, gain) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setChannelGain", channel, gain });
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
  noteOn(instrument, note, velocity) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOn", instrument, note, velocity });
  }
  noteOff() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOff" });
  }
  async save() {
    await this._initPromise;
    const result = await this.sendRequest({ type: "save" });
    return result.data;
  }
  // ---- Track editing API ----
  _requestId = 0;
  _pendingRequests = /* @__PURE__ */ new Map();
  sendRequest(message) {
    return new Promise((resolve) => {
      var _a;
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, resolve);
      (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ ...message, requestId });
    });
  }
  handleResponse(data) {
    if (data.requestId !== void 0) {
      const resolve = this._pendingRequests.get(data.requestId);
      if (resolve) {
        this._pendingRequests.delete(data.requestId);
        resolve(data);
        return true;
      }
    }
    return false;
  }
  async getNumTracks() {
    await this._initPromise;
    const result = await this.sendRequest({ type: "getNumTracks" });
    return result.count;
  }
  async getTrackLength(trackIdx) {
    await this._initPromise;
    const result = await this.sendRequest({ type: "getTrackLength", trackIdx });
    return result.length;
  }
  async getCell(trackIdx, row) {
    await this._initPromise;
    return this.sendRequest({
      type: "getCell",
      trackIdx,
      row
    });
  }
  async setCell(trackIdx, row, note, instrument, effect, param) {
    await this._initPromise;
    await this.sendRequest({ type: "setCell", trackIdx, row, note, instrument, effect, param });
  }
  async getTrackData(trackIdx) {
    await this._initPromise;
    const result = await this.sendRequest({
      type: "getTrackData",
      trackIdx
    });
    return result.cells;
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
    this._pendingRequests.clear();
    if (Sd2Engine.instance === this) Sd2Engine.instance = null;
  }
}
export {
  Sd2Engine
};
