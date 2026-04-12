import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class EQ8BandEffect extends ToneAudioNode {
  name = "EQ8Band";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  params;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this.params = {
      hpFreq: options.hpFreq ?? 20,
      lpFreq: options.lpFreq ?? 2e4,
      lowShelfFreq: options.lowShelfFreq ?? 100,
      lowShelfGain: options.lowShelfGain ?? 0,
      peak1Freq: options.peak1Freq ?? 250,
      peak1Gain: options.peak1Gain ?? 0,
      peak1Q: options.peak1Q ?? 1,
      peak2Freq: options.peak2Freq ?? 1e3,
      peak2Gain: options.peak2Gain ?? 0,
      peak2Q: options.peak2Q ?? 1,
      peak3Freq: options.peak3Freq ?? 3500,
      peak3Gain: options.peak3Gain ?? 0,
      peak3Q: options.peak3Q ?? 1,
      peak4Freq: options.peak4Freq ?? 8e3,
      peak4Gain: options.peak4Gain ?? 0,
      peak4Q: options.peak4Q ?? 1,
      highShelfFreq: options.highShelfFreq ?? 8e3,
      highShelfGain: options.highShelfGain ?? 0,
      mix: options.mix ?? 1
    };
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
      await EQ8BandEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "eq8-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.isWasmReady = true;
          for (const p of this.pendingParams)
            this.workletNode.port.postMessage({ type: "parameter", param: p.param, value: p.value });
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
            console.warn("[EQ8Band] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: EQ8BandEffect.wasmBinary, jsCode: EQ8BandEffect.jsCode },
        [EQ8BandEffect.wasmBinary.slice(0)]
      );
      for (const [k, v] of Object.entries(this.params)) this.sendParam(k, v);
    } catch (err) {
      console.warn("[EQ8Band] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}eq8/EQ8Band.wasm`),
        fetch(`${base}eq8/EQ8Band.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}eq8/EQ8Band.worklet.js`);
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
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  get hpFreq() {
    return this.params.hpFreq;
  }
  get lpFreq() {
    return this.params.lpFreq;
  }
  get lowShelfFreq() {
    return this.params.lowShelfFreq;
  }
  get lowShelfGain() {
    return this.params.lowShelfGain;
  }
  get highShelfFreq() {
    return this.params.highShelfFreq;
  }
  get highShelfGain() {
    return this.params.highShelfGain;
  }
  get mix() {
    return this.params.mix;
  }
  setParam(param, value) {
    if (param === "wet") {
      this.wet = value;
      return;
    }
    if (param in this.params) {
      this.params[param] = value;
      this.sendParam(param, value);
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
  EQ8BandEffect
};
