import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class MultibandGateEffect extends ToneAudioNode {
  name = "MultibandGate";
  input;
  output;
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
  _lowRange;
  _midRange;
  _highRange;
  _attack;
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
    this._lowThresh = options.lowThresh ?? -40;
    this._midThresh = options.midThresh ?? -40;
    this._highThresh = options.highThresh ?? -40;
    this._lowRange = options.lowRange ?? 0;
    this._midRange = options.midRange ?? 0;
    this._highRange = options.highRange ?? 0;
    this._attack = options.attack ?? 1;
    this._release = options.release ?? 200;
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
      await MultibandGateEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "multiband-gate-processor", {
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
            console.warn("[MultibandGate] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: MultibandGateEffect.wasmBinary, jsCode: MultibandGateEffect.jsCode },
        [MultibandGateEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowCross", this._lowCross);
      this.sendParam("highCross", this._highCross);
      this.sendParam("lowThresh", this._lowThresh);
      this.sendParam("midThresh", this._midThresh);
      this.sendParam("highThresh", this._highThresh);
      this.sendParam("lowRange", this._lowRange);
      this.sendParam("midRange", this._midRange);
      this.sendParam("highRange", this._highRange);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
    } catch (err) {
      console.warn("[MultibandGate] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-gate/MultibandGate.wasm`),
        fetch(`${base}multiband-gate/MultibandGate.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-gate/MultibandGate.worklet.js`);
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
  get lowThresh() {
    return this._lowThresh;
  }
  set lowThresh(v) {
    this._lowThresh = clamp(v, -80, 0);
    this.sendParam("lowThresh", this._lowThresh);
  }
  get midThresh() {
    return this._midThresh;
  }
  set midThresh(v) {
    this._midThresh = clamp(v, -80, 0);
    this.sendParam("midThresh", this._midThresh);
  }
  get highThresh() {
    return this._highThresh;
  }
  set highThresh(v) {
    this._highThresh = clamp(v, -80, 0);
    this.sendParam("highThresh", this._highThresh);
  }
  get lowRange() {
    return this._lowRange;
  }
  set lowRange(v) {
    this._lowRange = clamp(v, 0, 1);
    this.sendParam("lowRange", this._lowRange);
  }
  get midRange() {
    return this._midRange;
  }
  set midRange(v) {
    this._midRange = clamp(v, 0, 1);
    this.sendParam("midRange", this._midRange);
  }
  get highRange() {
    return this._highRange;
  }
  set highRange(v) {
    this._highRange = clamp(v, 0, 1);
    this.sendParam("highRange", this._highRange);
  }
  get attack() {
    return this._attack;
  }
  set attack(v) {
    this._attack = clamp(v, 0.01, 100);
    this.sendParam("attack", this._attack);
  }
  get release() {
    return this._release;
  }
  set release(v) {
    this._release = clamp(v, 1, 5e3);
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
      case "lowThresh":
        this.lowThresh = value;
        break;
      case "midThresh":
        this.midThresh = value;
        break;
      case "highThresh":
        this.highThresh = value;
        break;
      case "lowRange":
        this.lowRange = value;
        break;
      case "midRange":
        this.midRange = value;
        break;
      case "highRange":
        this.highRange = value;
        break;
      case "attack":
        this.attack = value;
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
  MultibandGateEffect
};
