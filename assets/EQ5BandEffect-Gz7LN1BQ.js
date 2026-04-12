import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class EQ5BandEffect extends ToneAudioNode {
  name = "EQ5Band";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _lowShelfFreq;
  _lowShelfGain;
  _peak1Freq;
  _peak1Gain;
  _peak1Q;
  _peak2Freq;
  _peak2Gain;
  _peak2Q;
  _peak3Freq;
  _peak3Gain;
  _peak3Q;
  _highShelfFreq;
  _highShelfGain;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._lowShelfFreq = options.lowShelfFreq ?? 100;
    this._lowShelfGain = options.lowShelfGain ?? 0;
    this._peak1Freq = options.peak1Freq ?? 500;
    this._peak1Gain = options.peak1Gain ?? 0;
    this._peak1Q = options.peak1Q ?? 1;
    this._peak2Freq = options.peak2Freq ?? 1500;
    this._peak2Gain = options.peak2Gain ?? 0;
    this._peak2Q = options.peak2Q ?? 1;
    this._peak3Freq = options.peak3Freq ?? 5e3;
    this._peak3Gain = options.peak3Gain ?? 0;
    this._peak3Q = options.peak3Q ?? 1;
    this._highShelfFreq = options.highShelfFreq ?? 8e3;
    this._highShelfGain = options.highShelfGain ?? 0;
    this._mix = options.mix ?? 1;
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
      await EQ5BandEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "eq5-processor", {
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
            console.warn("[EQ5Band] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: EQ5BandEffect.wasmBinary, jsCode: EQ5BandEffect.jsCode },
        [EQ5BandEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowShelfFreq", this._lowShelfFreq);
      this.sendParam("lowShelfGain", this._lowShelfGain);
      this.sendParam("peak1Freq", this._peak1Freq);
      this.sendParam("peak1Gain", this._peak1Gain);
      this.sendParam("peak1Q", this._peak1Q);
      this.sendParam("peak2Freq", this._peak2Freq);
      this.sendParam("peak2Gain", this._peak2Gain);
      this.sendParam("peak2Q", this._peak2Q);
      this.sendParam("peak3Freq", this._peak3Freq);
      this.sendParam("peak3Gain", this._peak3Gain);
      this.sendParam("peak3Q", this._peak3Q);
      this.sendParam("highShelfFreq", this._highShelfFreq);
      this.sendParam("highShelfGain", this._highShelfGain);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[EQ5Band] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}eq5/EQ5Band.wasm`),
        fetch(`${base}eq5/EQ5Band.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}eq5/EQ5Band.worklet.js`);
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
  setLowShelfFreq(v) {
    this._lowShelfFreq = clamp(v, 20, 500);
    this.sendParam("lowShelfFreq", this._lowShelfFreq);
  }
  setLowShelfGain(v) {
    this._lowShelfGain = clamp(v, -36, 36);
    this.sendParam("lowShelfGain", this._lowShelfGain);
  }
  setPeak1Freq(v) {
    this._peak1Freq = clamp(v, 100, 2e3);
    this.sendParam("peak1Freq", this._peak1Freq);
  }
  setPeak1Gain(v) {
    this._peak1Gain = clamp(v, -36, 36);
    this.sendParam("peak1Gain", this._peak1Gain);
  }
  setPeak1Q(v) {
    this._peak1Q = clamp(v, 0.1, 10);
    this.sendParam("peak1Q", this._peak1Q);
  }
  setPeak2Freq(v) {
    this._peak2Freq = clamp(v, 500, 5e3);
    this.sendParam("peak2Freq", this._peak2Freq);
  }
  setPeak2Gain(v) {
    this._peak2Gain = clamp(v, -36, 36);
    this.sendParam("peak2Gain", this._peak2Gain);
  }
  setPeak2Q(v) {
    this._peak2Q = clamp(v, 0.1, 10);
    this.sendParam("peak2Q", this._peak2Q);
  }
  setPeak3Freq(v) {
    this._peak3Freq = clamp(v, 2e3, 15e3);
    this.sendParam("peak3Freq", this._peak3Freq);
  }
  setPeak3Gain(v) {
    this._peak3Gain = clamp(v, -36, 36);
    this.sendParam("peak3Gain", this._peak3Gain);
  }
  setPeak3Q(v) {
    this._peak3Q = clamp(v, 0.1, 10);
    this.sendParam("peak3Q", this._peak3Q);
  }
  setHighShelfFreq(v) {
    this._highShelfFreq = clamp(v, 2e3, 2e4);
    this.sendParam("highShelfFreq", this._highShelfFreq);
  }
  setHighShelfGain(v) {
    this._highShelfGain = clamp(v, -36, 36);
    this.sendParam("highShelfGain", this._highShelfGain);
  }
  setMix(v) {
    this._mix = clamp(v, 0, 1);
    this.sendParam("mix", this._mix);
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  get lowShelfFreq() {
    return this._lowShelfFreq;
  }
  get lowShelfGain() {
    return this._lowShelfGain;
  }
  get peak1Freq() {
    return this._peak1Freq;
  }
  get peak1Gain() {
    return this._peak1Gain;
  }
  get peak1Q() {
    return this._peak1Q;
  }
  get peak2Freq() {
    return this._peak2Freq;
  }
  get peak2Gain() {
    return this._peak2Gain;
  }
  get peak2Q() {
    return this._peak2Q;
  }
  get peak3Freq() {
    return this._peak3Freq;
  }
  get peak3Gain() {
    return this._peak3Gain;
  }
  get peak3Q() {
    return this._peak3Q;
  }
  get highShelfFreq() {
    return this._highShelfFreq;
  }
  get highShelfGain() {
    return this._highShelfGain;
  }
  get mix() {
    return this._mix;
  }
  setParam(param, value) {
    switch (param) {
      case "lowShelfFreq":
        this.setLowShelfFreq(value);
        break;
      case "lowShelfGain":
        this.setLowShelfGain(value);
        break;
      case "peak1Freq":
        this.setPeak1Freq(value);
        break;
      case "peak1Gain":
        this.setPeak1Gain(value);
        break;
      case "peak1Q":
        this.setPeak1Q(value);
        break;
      case "peak2Freq":
        this.setPeak2Freq(value);
        break;
      case "peak2Gain":
        this.setPeak2Gain(value);
        break;
      case "peak2Q":
        this.setPeak2Q(value);
        break;
      case "peak3Freq":
        this.setPeak3Freq(value);
        break;
      case "peak3Gain":
        this.setPeak3Gain(value);
        break;
      case "peak3Q":
        this.setPeak3Q(value);
        break;
      case "highShelfFreq":
        this.setHighShelfFreq(value);
        break;
      case "highShelfGain":
        this.setHighShelfGain(value);
        break;
      case "mix":
        this.setMix(value);
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
  EQ5BandEffect
};
