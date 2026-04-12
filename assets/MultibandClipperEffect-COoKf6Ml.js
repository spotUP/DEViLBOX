import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class MultibandClipperEffect extends ToneAudioNode {
  name = "MultibandClipper";
  _input;
  _output;
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
  _softness;
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
    this._lowCeil = options.lowCeil ?? -3;
    this._midCeil = options.midCeil ?? -3;
    this._highCeil = options.highCeil ?? -3;
    this._softness = options.softness ?? 0.5;
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
      await MultibandClipperEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "multiband-clipper-processor", {
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
            console.warn("[MultibandClipper] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: MultibandClipperEffect.wasmBinary, jsCode: MultibandClipperEffect.jsCode },
        [MultibandClipperEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowCross", this._lowCross);
      this.sendParam("highCross", this._highCross);
      this.sendParam("lowCeil", this._lowCeil);
      this.sendParam("midCeil", this._midCeil);
      this.sendParam("highCeil", this._highCeil);
      this.sendParam("softness", this._softness);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[MultibandClipper] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-clipper/MultibandClipper.wasm`),
        fetch(`${base}multiband-clipper/MultibandClipper.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-clipper/MultibandClipper.worklet.js`);
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
  setLowCeil(v) {
    this._lowCeil = Math.max(-24, Math.min(0, v));
    this.sendParam("lowCeil", this._lowCeil);
  }
  setMidCeil(v) {
    this._midCeil = Math.max(-24, Math.min(0, v));
    this.sendParam("midCeil", this._midCeil);
  }
  setHighCeil(v) {
    this._highCeil = Math.max(-24, Math.min(0, v));
    this.sendParam("highCeil", this._highCeil);
  }
  setSoftness(v) {
    this._softness = Math.max(0, Math.min(1, v));
    this.sendParam("softness", this._softness);
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
  get lowCeil() {
    return this._lowCeil;
  }
  get midCeil() {
    return this._midCeil;
  }
  get highCeil() {
    return this._highCeil;
  }
  get softness() {
    return this._softness;
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
      case "lowCeil":
        this.setLowCeil(value);
        break;
      case "midCeil":
        this.setMidCeil(value);
        break;
      case "highCeil":
        this.setHighCeil(value);
        break;
      case "softness":
        this.setSoftness(value);
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
  MultibandClipperEffect
};
