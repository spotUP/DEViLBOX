import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class SaturatorEffect extends ToneAudioNode {
  name = "Saturator";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _drive;
  _blend;
  _preFreq;
  _postFreq;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._drive = options.drive ?? 0.5;
    this._blend = options.blend ?? 0.5;
    this._preFreq = options.preFreq ?? 2e4;
    this._postFreq = options.postFreq ?? 2e4;
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
      await SaturatorEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "saturator-processor", {
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
            console.warn("[Saturator] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: SaturatorEffect.wasmBinary, jsCode: SaturatorEffect.jsCode },
        [SaturatorEffect.wasmBinary.slice(0)]
      );
      this.sendParam("drive", this._drive);
      this.sendParam("blend", this._blend);
      this.sendParam("preFreq", this._preFreq);
      this.sendParam("postFreq", this._postFreq);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[Saturator] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}saturator/Saturator.wasm`),
        fetch(`${base}saturator/Saturator.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}saturator/Saturator.worklet.js`);
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
  get drive() {
    return this._drive;
  }
  set drive(v) {
    this._drive = clamp(v, 0, 1);
    this.sendParam("drive", this._drive);
  }
  get blend() {
    return this._blend;
  }
  set blend(v) {
    this._blend = clamp(v, 0, 1);
    this.sendParam("blend", this._blend);
  }
  get preFreq() {
    return this._preFreq;
  }
  set preFreq(v) {
    this._preFreq = clamp(v, 200, 2e4);
    this.sendParam("preFreq", this._preFreq);
  }
  get postFreq() {
    return this._postFreq;
  }
  set postFreq(v) {
    this._postFreq = clamp(v, 200, 2e4);
    this.sendParam("postFreq", this._postFreq);
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
      case "drive":
        this.drive = value;
        break;
      case "blend":
        this.blend = value;
        break;
      case "preFreq":
        this.preFreq = value;
        break;
      case "postFreq":
        this.postFreq = value;
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
  SaturatorEffect
};
