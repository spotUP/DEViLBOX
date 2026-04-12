import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class DynamicEQEffect extends ToneAudioNode {
  name = "DynamicEQ";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _detectFreq;
  _detectQ;
  _processFreq;
  _processQ;
  _threshold;
  _maxGain;
  _attack;
  _release;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._detectFreq = options.detectFreq ?? 1e3;
    this._detectQ = options.detectQ ?? 1;
    this._processFreq = options.processFreq ?? 1e3;
    this._processQ = options.processQ ?? 1;
    this._threshold = options.threshold ?? -20;
    this._maxGain = options.maxGain ?? 0;
    this._attack = options.attack ?? 10;
    this._release = options.release ?? 100;
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
      await DynamicEQEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "dynamic-eq-processor", {
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
            console.warn("[DynamicEQ] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: DynamicEQEffect.wasmBinary, jsCode: DynamicEQEffect.jsCode },
        [DynamicEQEffect.wasmBinary.slice(0)]
      );
      this.sendParam("detectFreq", this._detectFreq);
      this.sendParam("detectQ", this._detectQ);
      this.sendParam("processFreq", this._processFreq);
      this.sendParam("processQ", this._processQ);
      this.sendParam("threshold", this._threshold);
      this.sendParam("maxGain", this._maxGain);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[DynamicEQ] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}dynamic-eq/DynamicEQ.wasm`),
        fetch(`${base}dynamic-eq/DynamicEQ.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}dynamic-eq/DynamicEQ.worklet.js`);
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
  setDetectFreq(v) {
    this._detectFreq = clamp(v, 20, 2e4);
    this.sendParam("detectFreq", this._detectFreq);
  }
  setDetectQ(v) {
    this._detectQ = clamp(v, 0.1, 10);
    this.sendParam("detectQ", this._detectQ);
  }
  setProcessFreq(v) {
    this._processFreq = clamp(v, 20, 2e4);
    this.sendParam("processFreq", this._processFreq);
  }
  setProcessQ(v) {
    this._processQ = clamp(v, 0.1, 10);
    this.sendParam("processQ", this._processQ);
  }
  setThreshold(v) {
    this._threshold = clamp(v, -60, 0);
    this.sendParam("threshold", this._threshold);
  }
  setMaxGain(v) {
    this._maxGain = clamp(v, -24, 24);
    this.sendParam("maxGain", this._maxGain);
  }
  setAttack(v) {
    this._attack = clamp(v, 0.1, 100);
    this.sendParam("attack", this._attack);
  }
  setRelease(v) {
    this._release = clamp(v, 10, 1e3);
    this.sendParam("release", this._release);
  }
  setMix(v) {
    this._mix = clamp(v, 0, 1);
    this.sendParam("mix", this._mix);
  }
  get detectFreq() {
    return this._detectFreq;
  }
  get detectQ() {
    return this._detectQ;
  }
  get processFreq() {
    return this._processFreq;
  }
  get processQ() {
    return this._processQ;
  }
  get threshold() {
    return this._threshold;
  }
  get maxGain() {
    return this._maxGain;
  }
  get attack() {
    return this._attack;
  }
  get release() {
    return this._release;
  }
  get mix() {
    return this._mix;
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
      case "detectFreq":
        this.setDetectFreq(value);
        break;
      case "detectQ":
        this.setDetectQ(value);
        break;
      case "processFreq":
        this.setProcessFreq(value);
        break;
      case "processQ":
        this.setProcessQ(value);
        break;
      case "threshold":
        this.setThreshold(value);
        break;
      case "maxGain":
        this.setMaxGain(value);
        break;
      case "attack":
        this.setAttack(value);
        break;
      case "release":
        this.setRelease(value);
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
  DynamicEQEffect
};
