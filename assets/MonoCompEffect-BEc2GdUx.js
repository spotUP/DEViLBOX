import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class MonoCompEffect extends ToneAudioNode {
  name = "MonoComp";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _threshold;
  _ratio;
  _attack;
  _release;
  _knee;
  _makeup;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._threshold = options.threshold ?? -12;
    this._ratio = options.ratio ?? 4;
    this._attack = options.attack ?? 10;
    this._release = options.release ?? 100;
    this._knee = options.knee ?? 6;
    this._makeup = options.makeup ?? 0;
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
      await MonoCompEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "mono-comp-processor", {
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
            console.warn("[MonoComp] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: MonoCompEffect.wasmBinary, jsCode: MonoCompEffect.jsCode },
        [MonoCompEffect.wasmBinary.slice(0)]
      );
      this.sendParam("threshold", this._threshold);
      this.sendParam("ratio", this._ratio);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
      this.sendParam("knee", this._knee);
      this.sendParam("makeup", this._makeup);
    } catch (err) {
      console.warn("[MonoComp] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}mono-comp/MonoComp.wasm`),
        fetch(`${base}mono-comp/MonoComp.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}mono-comp/MonoComp.worklet.js`);
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
  get threshold() {
    return this._threshold;
  }
  set threshold(v) {
    this._threshold = clamp(v, -60, 0);
    this.sendParam("threshold", this._threshold);
  }
  get ratio() {
    return this._ratio;
  }
  set ratio(v) {
    this._ratio = clamp(v, 1, 20);
    this.sendParam("ratio", this._ratio);
  }
  get attack() {
    return this._attack;
  }
  set attack(v) {
    this._attack = clamp(v, 0.1, 100);
    this.sendParam("attack", this._attack);
  }
  get release() {
    return this._release;
  }
  set release(v) {
    this._release = clamp(v, 10, 1e3);
    this.sendParam("release", this._release);
  }
  get knee() {
    return this._knee;
  }
  set knee(v) {
    this._knee = clamp(v, 0, 24);
    this.sendParam("knee", this._knee);
  }
  get makeup() {
    return this._makeup;
  }
  set makeup(v) {
    this._makeup = clamp(v, 0, 24);
    this.sendParam("makeup", this._makeup);
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
      case "threshold":
        this.threshold = value;
        break;
      case "ratio":
        this.ratio = value;
        break;
      case "attack":
        this.attack = value;
        break;
      case "release":
        this.release = value;
        break;
      case "knee":
        this.knee = value;
        break;
      case "makeup":
        this.makeup = value;
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
  MonoCompEffect
};
