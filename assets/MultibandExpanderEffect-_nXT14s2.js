import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class MultibandExpanderEffect extends ToneAudioNode {
  name = "MultibandExpander";
  _input;
  _output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _lowCross;
  _highCross;
  _lowThresh;
  _midThresh;
  _highThresh;
  _ratio;
  _attack;
  _release;
  _range;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._lowCross = options.lowCross ?? 200;
    this._highCross = options.highCross ?? 4e3;
    this._lowThresh = options.lowThresh ?? -40;
    this._midThresh = options.midThresh ?? -40;
    this._highThresh = options.highThresh ?? -40;
    this._ratio = options.ratio ?? 2;
    this._attack = options.attack ?? 5;
    this._release = options.release ?? 100;
    this._range = options.range ?? -40;
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1;
    this._input = new Gain(1);
    this._output = new Gain(1);
    this.dryGain = new Gain(1 - this._wet);
    this.wetGain = new Gain(this._wet);
    this._input.connect(this.dryGain);
    this.dryGain.connect(this._output);
    this.wetGain.connect(this._output);
    this._input.connect(this.wetGain);
    void this._initWorklet();
  }
  get input() {
    return this._input;
  }
  get output() {
    return this._output;
  }
  async _initWorklet() {
    try {
      const rawCtx = getContext().rawContext;
      await MultibandExpanderEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "multiband-expander-processor", {
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
            const rawInput = getNativeAudioNode(this._input);
            const rawWet = getNativeAudioNode(this.wetGain);
            rawInput.connect(this.workletNode);
            this.workletNode.connect(rawWet);
            try {
              this._input.disconnect(this.wetGain);
            } catch {
            }
            const rawCtx2 = getContext().rawContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.warn("[MultibandExpander] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: MultibandExpanderEffect.wasmBinary, jsCode: MultibandExpanderEffect.jsCode },
        [MultibandExpanderEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowCross", this._lowCross);
      this.sendParam("highCross", this._highCross);
      this.sendParam("lowThresh", this._lowThresh);
      this.sendParam("midThresh", this._midThresh);
      this.sendParam("highThresh", this._highThresh);
      this.sendParam("ratio", this._ratio);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
      this.sendParam("range", this._range);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[MultibandExpander] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-expander/MultibandExpander.wasm`),
        fetch(`${base}multiband-expander/MultibandExpander.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-expander/MultibandExpander.worklet.js`);
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
    this._lowCross = Math.max(20, Math.min(1e3, v));
    this.sendParam("lowCross", this._lowCross);
  }
  setHighCross(v) {
    this._highCross = Math.max(500, Math.min(16e3, v));
    this.sendParam("highCross", this._highCross);
  }
  setLowThresh(v) {
    this._lowThresh = Math.max(-60, Math.min(0, v));
    this.sendParam("lowThresh", this._lowThresh);
  }
  setMidThresh(v) {
    this._midThresh = Math.max(-60, Math.min(0, v));
    this.sendParam("midThresh", this._midThresh);
  }
  setHighThresh(v) {
    this._highThresh = Math.max(-60, Math.min(0, v));
    this.sendParam("highThresh", this._highThresh);
  }
  setRatio(v) {
    this._ratio = Math.max(1, Math.min(10, v));
    this.sendParam("ratio", this._ratio);
  }
  setAttack(v) {
    this._attack = Math.max(0.1, Math.min(100, v));
    this.sendParam("attack", this._attack);
  }
  setRelease(v) {
    this._release = Math.max(10, Math.min(1e3, v));
    this.sendParam("release", this._release);
  }
  setRange(v) {
    this._range = Math.max(-90, Math.min(0, v));
    this.sendParam("range", this._range);
  }
  setMix(v) {
    this._mix = Math.max(0, Math.min(1, v));
    this.sendParam("mix", this._mix);
  }
  get lowCross() {
    return this._lowCross;
  }
  get highCross() {
    return this._highCross;
  }
  get lowThresh() {
    return this._lowThresh;
  }
  get midThresh() {
    return this._midThresh;
  }
  get highThresh() {
    return this._highThresh;
  }
  get ratio() {
    return this._ratio;
  }
  get attack() {
    return this._attack;
  }
  get release() {
    return this._release;
  }
  get range() {
    return this._range;
  }
  get mix() {
    return this._mix;
  }
  get wet() {
    return this._wet;
  }
  set wet(value) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }
  setParam(param, value) {
    switch (param) {
      case "lowCross":
        this.setLowCross(value);
        break;
      case "highCross":
        this.setHighCross(value);
        break;
      case "lowThresh":
        this.setLowThresh(value);
        break;
      case "midThresh":
        this.setMidThresh(value);
        break;
      case "highThresh":
        this.setHighThresh(value);
        break;
      case "ratio":
        this.setRatio(value);
        break;
      case "attack":
        this.setAttack(value);
        break;
      case "release":
        this.setRelease(value);
        break;
      case "range":
        this.setRange(value);
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
    this._input.dispose();
    this._output.dispose();
    super.dispose();
    return this;
  }
}
export {
  MultibandExpanderEffect
};
