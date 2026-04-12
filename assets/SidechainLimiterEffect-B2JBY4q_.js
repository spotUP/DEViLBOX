import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class SidechainLimiterEffect extends ToneAudioNode {
  name = "SidechainLimiter";
  input;
  output;
  dryGain;
  wetGain;
  sidechainInput;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _ceiling;
  _release;
  _scFreq;
  _scGain;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._ceiling = options.ceiling ?? -1;
    this._release = options.release ?? 50;
    this._scFreq = options.scFreq ?? 1e3;
    this._scGain = options.scGain ?? 0;
    this._wet = options.wet ?? 1;
    this.input = new Gain(1);
    this.output = new Gain(1);
    this.dryGain = new Gain(1 - this._wet);
    this.wetGain = new Gain(this._wet);
    this.sidechainInput = new Gain(1);
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);
    void this._initWorklet();
  }
  async _initWorklet() {
    try {
      const rawCtx = getContext().rawContext;
      await SidechainLimiterEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "sidechain-limiter-processor", {
        numberOfInputs: 2,
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
            const rawSc = getNativeAudioNode(this.sidechainInput);
            if (rawSc) rawSc.connect(this.workletNode, 0, 1);
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
            console.warn("[SidechainLimiter] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: SidechainLimiterEffect.wasmBinary, jsCode: SidechainLimiterEffect.jsCode },
        [SidechainLimiterEffect.wasmBinary.slice(0)]
      );
      this.sendParam("ceiling", this._ceiling);
      this.sendParam("release", this._release);
      this.sendParam("scFreq", this._scFreq);
      this.sendParam("scGain", this._scGain);
    } catch (err) {
      console.warn("[SidechainLimiter] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}sidechain-limiter/SidechainLimiter.wasm`),
        fetch(`${base}sidechain-limiter/SidechainLimiter.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}sidechain-limiter/SidechainLimiter.worklet.js`);
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
  get ceiling() {
    return this._ceiling;
  }
  set ceiling(v) {
    this._ceiling = clamp(v, -24, 0);
    this.sendParam("ceiling", this._ceiling);
  }
  get release() {
    return this._release;
  }
  set release(v) {
    this._release = clamp(v, 10, 500);
    this.sendParam("release", this._release);
  }
  get scFreq() {
    return this._scFreq;
  }
  set scFreq(v) {
    this._scFreq = clamp(v, 20, 2e4);
    this.sendParam("scFreq", this._scFreq);
  }
  get scGain() {
    return this._scGain;
  }
  set scGain(v) {
    this._scGain = clamp(v, -12, 12);
    this.sendParam("scGain", this._scGain);
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  getSidechainInput() {
    return this.sidechainInput;
  }
  setParam(param, value) {
    switch (param) {
      case "ceiling":
        this.ceiling = value;
        break;
      case "release":
        this.release = value;
        break;
      case "scFreq":
        this.scFreq = value;
        break;
      case "scGain":
        this.scGain = value;
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
    this.sidechainInput.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
export {
  SidechainLimiterEffect
};
