import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
class DrivaEffect extends ToneAudioNode {
  name = "Driva";
  _input;
  _output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _amount;
  _tone;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._amount = options.amount ?? 0.5;
    this._tone = options.tone ?? 0;
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
      await DrivaEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "driva-processor", {
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
            console.warn("[Driva] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: DrivaEffect.wasmBinary, jsCode: DrivaEffect.jsCode },
        [DrivaEffect.wasmBinary.slice(0)]
      );
      this.sendParam("amount", this._amount);
      this.sendParam("tone", this._tone);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[Driva] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}driva/Driva.wasm`),
        fetch(`${base}driva/Driva.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}driva/Driva.worklet.js`);
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
  setAmount(v) {
    this._amount = Math.max(0, Math.min(1, v));
    this.sendParam("amount", this._amount);
  }
  setTone(v) {
    this._tone = Math.max(0, Math.min(3, v));
    this.sendParam("tone", this._tone);
  }
  setMix(v) {
    this._mix = Math.max(0, Math.min(1, v));
    this.sendParam("mix", this._mix);
  }
  get amount() {
    return this._amount;
  }
  get tone() {
    return this._tone;
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
      case "amount":
        this.setAmount(value);
        break;
      case "tone":
        this.setTone(value);
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
  DrivaEffect
};
