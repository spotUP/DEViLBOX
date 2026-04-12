import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class DistortionShaperEffect extends ToneAudioNode {
  name = "DistortionShaper";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _inputGain;
  _point1x;
  _point1y;
  _point2x;
  _point2y;
  _outputGain;
  _preLpf;
  _postLpf;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._inputGain = options.inputGain ?? 1;
    this._point1x = options.point1x ?? -0.5;
    this._point1y = options.point1y ?? -0.5;
    this._point2x = options.point2x ?? 0.5;
    this._point2y = options.point2y ?? 0.5;
    this._outputGain = options.outputGain ?? 1;
    this._preLpf = options.preLpf ?? 2e4;
    this._postLpf = options.postLpf ?? 2e4;
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
      await DistortionShaperEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "distortion-shaper-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.port.onmessage = (ev) => {
        if (ev.data.type === "ready") {
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
            console.warn("[DistortionShaper] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: DistortionShaperEffect.wasmBinary, jsCode: DistortionShaperEffect.jsCode },
        [DistortionShaperEffect.wasmBinary.slice(0)]
      );
      this.sendParam("inputGain", this._inputGain);
      this.sendParam("point1x", this._point1x);
      this.sendParam("point1y", this._point1y);
      this.sendParam("point2x", this._point2x);
      this.sendParam("point2y", this._point2y);
      this.sendParam("outputGain", this._outputGain);
      this.sendParam("preLpf", this._preLpf);
      this.sendParam("postLpf", this._postLpf);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[DistortionShaper] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}distortion-shaper/DistortionShaper.wasm`),
        fetch(`${base}distortion-shaper/DistortionShaper.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}distortion-shaper/DistortionShaper.worklet.js`);
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
  get inputGain() {
    return this._inputGain;
  }
  set inputGain(v) {
    this._inputGain = clamp(v, 0, 4);
    this.sendParam("inputGain", this._inputGain);
  }
  get point1x() {
    return this._point1x;
  }
  set point1x(v) {
    this._point1x = clamp(v, -1, 1);
    this.sendParam("point1x", this._point1x);
  }
  get point1y() {
    return this._point1y;
  }
  set point1y(v) {
    this._point1y = clamp(v, -1, 1);
    this.sendParam("point1y", this._point1y);
  }
  get point2x() {
    return this._point2x;
  }
  set point2x(v) {
    this._point2x = clamp(v, -1, 1);
    this.sendParam("point2x", this._point2x);
  }
  get point2y() {
    return this._point2y;
  }
  set point2y(v) {
    this._point2y = clamp(v, -1, 1);
    this.sendParam("point2y", this._point2y);
  }
  get outputGain() {
    return this._outputGain;
  }
  set outputGain(v) {
    this._outputGain = clamp(v, 0, 4);
    this.sendParam("outputGain", this._outputGain);
  }
  get preLpf() {
    return this._preLpf;
  }
  set preLpf(v) {
    this._preLpf = clamp(v, 200, 2e4);
    this.sendParam("preLpf", this._preLpf);
  }
  get postLpf() {
    return this._postLpf;
  }
  set postLpf(v) {
    this._postLpf = clamp(v, 200, 2e4);
    this.sendParam("postLpf", this._postLpf);
  }
  get mix() {
    return this._mix;
  }
  set mix(v) {
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
  setParam(param, value) {
    switch (param) {
      case "inputGain":
        this.inputGain = value;
        break;
      case "point1x":
        this.point1x = value;
        break;
      case "point1y":
        this.point1y = value;
        break;
      case "point2x":
        this.point2x = value;
        break;
      case "point2y":
        this.point2y = value;
        break;
      case "outputGain":
        this.outputGain = value;
        break;
      case "preLpf":
        this.preLpf = value;
        break;
      case "postLpf":
        this.postLpf = value;
        break;
      case "mix":
        this.mix = value;
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
  DistortionShaperEffect
};
