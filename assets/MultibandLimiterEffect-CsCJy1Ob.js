import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class MultibandLimiterEffect extends ToneAudioNode {
  name = "MultibandLimiter";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _lowCross;
  _highCross;
  _lowCeil;
  _midCeil;
  _highCeil;
  _lowGain;
  _midGain;
  _highGain;
  _release;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._lowCross = options.lowCross ?? 200;
    this._highCross = options.highCross ?? 3e3;
    this._lowCeil = options.lowCeil ?? -1;
    this._midCeil = options.midCeil ?? -1;
    this._highCeil = options.highCeil ?? -1;
    this._lowGain = options.lowGain ?? 1;
    this._midGain = options.midGain ?? 1;
    this._highGain = options.highGain ?? 1;
    this._release = options.release ?? 50;
    this._wet = options.wet ?? 1;
    this.input = new Gain(1);
    this.output = new Gain(1);
    this.dryGain = new Gain(1 - this._wet);
    this.wetGain = new Gain(this._wet);
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);
    void this._initWorklet();
  }
  async _initWorklet() {
    try {
      const rawCtx = getContext().rawContext;
      await MultibandLimiterEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "multiband-limiter-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode.port.postMessage({ type: "parameter", param: p.param, value: p.value });
          }
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this.input);
            const rawWet = getNativeAudioNode(this.wetGain);
            rawInput.connect(this.workletNode);
            this.workletNode.connect(rawWet);
            try {
              this.input.disconnect(this.wetGain);
            } catch {
            }
            const rawCtx2 = getContext().rawContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.warn("[MultibandLimiter] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: MultibandLimiterEffect.wasmBinary, jsCode: MultibandLimiterEffect.jsCode },
        [MultibandLimiterEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowCross", this._lowCross);
      this.sendParam("highCross", this._highCross);
      this.sendParam("lowCeil", this._lowCeil);
      this.sendParam("midCeil", this._midCeil);
      this.sendParam("highCeil", this._highCeil);
      this.sendParam("lowGain", this._lowGain);
      this.sendParam("midGain", this._midGain);
      this.sendParam("highGain", this._highGain);
      this.sendParam("release", this._release);
    } catch (err) {
      console.warn("[MultibandLimiter] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-limiter/MultibandLimiter.wasm`),
        fetch(`${base}multiband-limiter/MultibandLimiter.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-limiter/MultibandLimiter.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }
  sendParam(param, value) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: "parameter", param, value });
    } else {
      this.pendingParams = this.pendingParams.filter((p) => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }
  get lowCross() {
    return this._lowCross;
  }
  set lowCross(v) {
    this._lowCross = clamp(v, 20, 1e3);
    this.sendParam("lowCross", this._lowCross);
  }
  get highCross() {
    return this._highCross;
  }
  set highCross(v) {
    this._highCross = clamp(v, 500, 16e3);
    this.sendParam("highCross", this._highCross);
  }
  get lowCeil() {
    return this._lowCeil;
  }
  set lowCeil(v) {
    this._lowCeil = clamp(v, -24, 0);
    this.sendParam("lowCeil", this._lowCeil);
  }
  get midCeil() {
    return this._midCeil;
  }
  set midCeil(v) {
    this._midCeil = clamp(v, -24, 0);
    this.sendParam("midCeil", this._midCeil);
  }
  get highCeil() {
    return this._highCeil;
  }
  set highCeil(v) {
    this._highCeil = clamp(v, -24, 0);
    this.sendParam("highCeil", this._highCeil);
  }
  get lowGain() {
    return this._lowGain;
  }
  set lowGain(v) {
    this._lowGain = clamp(v, 0, 4);
    this.sendParam("lowGain", this._lowGain);
  }
  get midGain() {
    return this._midGain;
  }
  set midGain(v) {
    this._midGain = clamp(v, 0, 4);
    this.sendParam("midGain", this._midGain);
  }
  get highGain() {
    return this._highGain;
  }
  set highGain(v) {
    this._highGain = clamp(v, 0, 4);
    this.sendParam("highGain", this._highGain);
  }
  get release() {
    return this._release;
  }
  set release(v) {
    this._release = clamp(v, 10, 500);
    this.sendParam("release", this._release);
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  setParam(param, value) {
    switch (param) {
      case "lowCross":
        this.lowCross = value;
        break;
      case "highCross":
        this.highCross = value;
        break;
      case "lowCeil":
        this.lowCeil = value;
        break;
      case "midCeil":
        this.midCeil = value;
        break;
      case "highCeil":
        this.highCeil = value;
        break;
      case "lowGain":
        this.lowGain = value;
        break;
      case "midGain":
        this.midGain = value;
        break;
      case "highGain":
        this.highGain = value;
        break;
      case "release":
        this.release = value;
        break;
      case "wet":
        this.wet = value;
        break;
    }
  }
  dispose() {
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "dispose" });
      } catch {
      }
      try {
        this.workletNode.disconnect();
      } catch {
      }
      this.workletNode = null;
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
export {
  MultibandLimiterEffect
};
