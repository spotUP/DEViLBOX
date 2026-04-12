import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class MultibandEnhancerEffect extends ToneAudioNode {
  name = "MultibandEnhancer";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _lowCross;
  _midCross;
  _highCross;
  _lowWidth;
  _midWidth;
  _highWidth;
  _topWidth;
  _harmonics;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._lowCross = options.lowCross ?? 200;
    this._midCross = options.midCross ?? 2e3;
    this._highCross = options.highCross ?? 8e3;
    this._lowWidth = options.lowWidth ?? 1;
    this._midWidth = options.midWidth ?? 1;
    this._highWidth = options.highWidth ?? 1;
    this._topWidth = options.topWidth ?? 1;
    this._harmonics = options.harmonics ?? 0;
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
      await MultibandEnhancerEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "multiband-enhancer-processor", {
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
            console.warn("[MultibandEnhancer] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: MultibandEnhancerEffect.wasmBinary, jsCode: MultibandEnhancerEffect.jsCode },
        [MultibandEnhancerEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowCross", this._lowCross);
      this.sendParam("midCross", this._midCross);
      this.sendParam("highCross", this._highCross);
      this.sendParam("lowWidth", this._lowWidth);
      this.sendParam("midWidth", this._midWidth);
      this.sendParam("highWidth", this._highWidth);
      this.sendParam("topWidth", this._topWidth);
      this.sendParam("harmonics", this._harmonics);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[MultibandEnhancer] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-enhancer/MultibandEnhancer.wasm`),
        fetch(`${base}multiband-enhancer/MultibandEnhancer.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-enhancer/MultibandEnhancer.worklet.js`);
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
  setLowCross(v) {
    this._lowCross = clamp(v, 20, 500);
    this.sendParam("lowCross", this._lowCross);
  }
  setMidCross(v) {
    this._midCross = clamp(v, 200, 5e3);
    this.sendParam("midCross", this._midCross);
  }
  setHighCross(v) {
    this._highCross = clamp(v, 2e3, 16e3);
    this.sendParam("highCross", this._highCross);
  }
  setLowWidth(v) {
    this._lowWidth = clamp(v, 0, 2);
    this.sendParam("lowWidth", this._lowWidth);
  }
  setMidWidth(v) {
    this._midWidth = clamp(v, 0, 2);
    this.sendParam("midWidth", this._midWidth);
  }
  setHighWidth(v) {
    this._highWidth = clamp(v, 0, 2);
    this.sendParam("highWidth", this._highWidth);
  }
  setTopWidth(v) {
    this._topWidth = clamp(v, 0, 2);
    this.sendParam("topWidth", this._topWidth);
  }
  setHarmonics(v) {
    this._harmonics = clamp(v, 0, 1);
    this.sendParam("harmonics", this._harmonics);
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
  get lowCross() {
    return this._lowCross;
  }
  get midCross() {
    return this._midCross;
  }
  get highCross() {
    return this._highCross;
  }
  get lowWidth() {
    return this._lowWidth;
  }
  get midWidth() {
    return this._midWidth;
  }
  get highWidth() {
    return this._highWidth;
  }
  get topWidth() {
    return this._topWidth;
  }
  get harmonics() {
    return this._harmonics;
  }
  get mix() {
    return this._mix;
  }
  setParam(param, value) {
    switch (param) {
      case "lowCross":
        this.setLowCross(value);
        break;
      case "midCross":
        this.setMidCross(value);
        break;
      case "highCross":
        this.setHighCross(value);
        break;
      case "lowWidth":
        this.setLowWidth(value);
        break;
      case "midWidth":
        this.setMidWidth(value);
        break;
      case "highWidth":
        this.setHighWidth(value);
        break;
      case "topWidth":
        this.setTopWidth(value);
        break;
      case "harmonics":
        this.setHarmonics(value);
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
  MultibandEnhancerEffect
};
