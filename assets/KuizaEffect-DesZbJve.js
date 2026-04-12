import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class KuizaEffect extends ToneAudioNode {
  name = "Kuiza";
  _input;
  _output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _low;
  _lowMid;
  _highMid;
  _high;
  _gain;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._low = options.low ?? 0;
    this._lowMid = options.lowMid ?? 0;
    this._highMid = options.highMid ?? 0;
    this._high = options.high ?? 0;
    this._gain = options.gain ?? 0;
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
      await KuizaEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "kuiza-processor", {
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
            console.warn("[Kuiza] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: KuizaEffect.wasmBinary, jsCode: KuizaEffect.jsCode },
        [KuizaEffect.wasmBinary.slice(0)]
      );
      this.sendParam("low", this._low);
      this.sendParam("lowMid", this._lowMid);
      this.sendParam("highMid", this._highMid);
      this.sendParam("high", this._high);
      this.sendParam("gain", this._gain);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[Kuiza] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}kuiza/Kuiza.wasm`),
        fetch(`${base}kuiza/Kuiza.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}kuiza/Kuiza.worklet.js`);
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
  setLow(v) {
    this._low = Math.max(-12, Math.min(12, v));
    this.sendParam("low", this._low);
  }
  setLowMid(v) {
    this._lowMid = Math.max(-12, Math.min(12, v));
    this.sendParam("lowMid", this._lowMid);
  }
  setHighMid(v) {
    this._highMid = Math.max(-12, Math.min(12, v));
    this.sendParam("highMid", this._highMid);
  }
  setHigh(v) {
    this._high = Math.max(-12, Math.min(12, v));
    this.sendParam("high", this._high);
  }
  setGain(v) {
    this._gain = Math.max(-12, Math.min(12, v));
    this.sendParam("gain", this._gain);
  }
  setMix(v) {
    this._mix = Math.max(0, Math.min(1, v));
    this.sendParam("mix", this._mix);
  }
  get low() {
    return this._low;
  }
  get lowMid() {
    return this._lowMid;
  }
  get highMid() {
    return this._highMid;
  }
  get high() {
    return this._high;
  }
  get gain() {
    return this._gain;
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
      case "low":
        this.setLow(value);
        break;
      case "lowMid":
        this.setLowMid(value);
        break;
      case "highMid":
        this.setHighMid(value);
        break;
      case "high":
        this.setHigh(value);
        break;
      case "gain":
        this.setGain(value);
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
  KuizaEffect
};
