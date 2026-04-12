import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class ZamDelayEffect extends ToneAudioNode {
  name = "ZamDelay";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _time;
  _feedback;
  _lpf;
  _hpf;
  _invert;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._time = options.time ?? 500;
    this._feedback = options.feedback ?? 0.4;
    this._lpf = options.lpf ?? 8e3;
    this._hpf = options.hpf ?? 60;
    this._invert = options.invert ?? 0;
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
      await ZamDelayEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "zam-delay-processor", {
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
            console.warn("[ZamDelay] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: ZamDelayEffect.wasmBinary, jsCode: ZamDelayEffect.jsCode },
        [ZamDelayEffect.wasmBinary.slice(0)]
      );
      this.sendParam("time", this._time);
      this.sendParam("feedback", this._feedback);
      this.sendParam("lpf", this._lpf);
      this.sendParam("hpf", this._hpf);
      this.sendParam("invert", this._invert);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[ZamDelay] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}zam-delay/ZamDelay.wasm`),
        fetch(`${base}zam-delay/ZamDelay.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}zam-delay/ZamDelay.worklet.js`);
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
  get time() {
    return this._time;
  }
  set time(v) {
    this._time = clamp(v, 10, 2e3);
    this.sendParam("time", this._time);
  }
  get feedbackAmount() {
    return this._feedback;
  }
  set feedbackAmount(v) {
    this._feedback = clamp(v, 0, 0.95);
    this.sendParam("feedback", this._feedback);
  }
  get lpf() {
    return this._lpf;
  }
  set lpf(v) {
    this._lpf = clamp(v, 500, 16e3);
    this.sendParam("lpf", this._lpf);
  }
  get hpf() {
    return this._hpf;
  }
  set hpf(v) {
    this._hpf = clamp(v, 20, 500);
    this.sendParam("hpf", this._hpf);
  }
  get invertPhase() {
    return this._invert;
  }
  set invertPhase(v) {
    this._invert = v >= 0.5 ? 1 : 0;
    this.sendParam("invert", this._invert);
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
      case "time":
        this.time = value;
        break;
      case "feedback":
        this.feedbackAmount = value;
        break;
      case "lpf":
        this.lpf = value;
        break;
      case "hpf":
        this.hpf = value;
        break;
      case "invert":
        this.invertPhase = value;
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
  ZamDelayEffect
};
