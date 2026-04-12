import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class ZamEQ2Effect extends ToneAudioNode {
  name = "ZamEQ2";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _lowFreq;
  _lowGain;
  _lowBw;
  _highFreq;
  _highGain;
  _highBw;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._lowFreq = options.lowFreq ?? 200;
    this._lowGain = options.lowGain ?? 0;
    this._lowBw = options.lowBw ?? 1;
    this._highFreq = options.highFreq ?? 4e3;
    this._highGain = options.highGain ?? 0;
    this._highBw = options.highBw ?? 1;
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
      await ZamEQ2Effect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "zam-eq2-processor", {
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
            console.warn("[ZamEQ2] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: ZamEQ2Effect.wasmBinary, jsCode: ZamEQ2Effect.jsCode },
        [ZamEQ2Effect.wasmBinary.slice(0)]
      );
      this.sendParam("lowFreq", this._lowFreq);
      this.sendParam("lowGain", this._lowGain);
      this.sendParam("lowBw", this._lowBw);
      this.sendParam("highFreq", this._highFreq);
      this.sendParam("highGain", this._highGain);
      this.sendParam("highBw", this._highBw);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[ZamEQ2] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}zam-eq2/ZamEQ2.wasm`),
        fetch(`${base}zam-eq2/ZamEQ2.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}zam-eq2/ZamEQ2.worklet.js`);
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
  setLowFreq(v) {
    this._lowFreq = clamp(v, 20, 1e3);
    this.sendParam("lowFreq", this._lowFreq);
  }
  setLowGain(v) {
    this._lowGain = clamp(v, -36, 36);
    this.sendParam("lowGain", this._lowGain);
  }
  setLowBw(v) {
    this._lowBw = clamp(v, 0.1, 6);
    this.sendParam("lowBw", this._lowBw);
  }
  setHighFreq(v) {
    this._highFreq = clamp(v, 1e3, 2e4);
    this.sendParam("highFreq", this._highFreq);
  }
  setHighGain(v) {
    this._highGain = clamp(v, -36, 36);
    this.sendParam("highGain", this._highGain);
  }
  setHighBw(v) {
    this._highBw = clamp(v, 0.1, 6);
    this.sendParam("highBw", this._highBw);
  }
  setMix(v) {
    this._mix = clamp(v, 0, 1);
    this.sendParam("mix", this._mix);
  }
  get lowFreq() {
    return this._lowFreq;
  }
  get lowGain() {
    return this._lowGain;
  }
  get lowBw() {
    return this._lowBw;
  }
  get highFreq() {
    return this._highFreq;
  }
  get highGain() {
    return this._highGain;
  }
  get highBw() {
    return this._highBw;
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
      case "lowFreq":
        this.setLowFreq(value);
        break;
      case "lowGain":
        this.setLowGain(value);
        break;
      case "lowBw":
        this.setLowBw(value);
        break;
      case "highFreq":
        this.setHighFreq(value);
        break;
      case "highGain":
        this.setHighGain(value);
        break;
      case "highBw":
        this.setHighBw(value);
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
  ZamEQ2Effect
};
