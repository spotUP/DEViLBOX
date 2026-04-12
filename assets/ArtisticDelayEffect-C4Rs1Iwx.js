import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class ArtisticDelayEffect extends ToneAudioNode {
  name = "ArtisticDelay";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _timeL;
  _timeR;
  _feedback;
  _pan;
  _lpf;
  _hpf;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._timeL = options.timeL ?? 500;
    this._timeR = options.timeR ?? 375;
    this._feedback = options.feedback ?? 0.4;
    this._pan = options.pan ?? 0.5;
    this._lpf = options.lpf ?? 12e3;
    this._hpf = options.hpf ?? 40;
    this._mix = options.mix ?? 0.5;
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
      await ArtisticDelayEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "artistic-delay-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.isWasmReady = true;
          for (const p of this.pendingParams) this.workletNode.port.postMessage({ type: "parameter", param: p.param, value: p.value });
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
            console.warn("[ArtisticDelay] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: ArtisticDelayEffect.wasmBinary, jsCode: ArtisticDelayEffect.jsCode },
        [ArtisticDelayEffect.wasmBinary.slice(0)]
      );
      this.sendParam("timeL", this._timeL);
      this.sendParam("timeR", this._timeR);
      this.sendParam("feedback", this._feedback);
      this.sendParam("pan", this._pan);
      this.sendParam("lpf", this._lpf);
      this.sendParam("hpf", this._hpf);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[ArtisticDelay] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}artistic-delay/ArtisticDelay.wasm`),
        fetch(`${base}artistic-delay/ArtisticDelay.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}artistic-delay/ArtisticDelay.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }
  sendParam(param, value) {
    if (this.workletNode && this.isWasmReady) this.workletNode.port.postMessage({ type: "parameter", param, value });
    else {
      this.pendingParams = this.pendingParams.filter((p) => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }
  get timeL() {
    return this._timeL;
  }
  set timeL(v) {
    this._timeL = clamp(v, 10, 2e3);
    this.sendParam("timeL", this._timeL);
  }
  get timeR() {
    return this._timeR;
  }
  set timeR(v) {
    this._timeR = clamp(v, 10, 2e3);
    this.sendParam("timeR", this._timeR);
  }
  get feedbackAmount() {
    return this._feedback;
  }
  set feedbackAmount(v) {
    this._feedback = clamp(v, 0, 0.95);
    this.sendParam("feedback", this._feedback);
  }
  get pan() {
    return this._pan;
  }
  set pan(v) {
    this._pan = clamp(v, 0, 1);
    this.sendParam("pan", this._pan);
  }
  get lpf() {
    return this._lpf;
  }
  set lpf(v) {
    this._lpf = clamp(v, 200, 2e4);
    this.sendParam("lpf", this._lpf);
  }
  get hpf() {
    return this._hpf;
  }
  set hpf(v) {
    this._hpf = clamp(v, 20, 2e3);
    this.sendParam("hpf", this._hpf);
  }
  get mixAmount() {
    return this._mix;
  }
  set mixAmount(v) {
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
      case "timeL":
        this.timeL = value;
        break;
      case "timeR":
        this.timeR = value;
        break;
      case "feedback":
        this.feedbackAmount = value;
        break;
      case "pan":
        this.pan = value;
        break;
      case "lpf":
        this.lpf = value;
        break;
      case "hpf":
        this.hpf = value;
        break;
      case "mix":
        this.mixAmount = value;
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
  ArtisticDelayEffect
};
