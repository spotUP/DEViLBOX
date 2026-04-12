import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class DynamicsProcEffect extends ToneAudioNode {
  name = "DynamicsProc";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _lowerThresh;
  _upperThresh;
  _ratio;
  _attack;
  _release;
  _makeup;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._lowerThresh = options.lowerThresh ?? -40;
    this._upperThresh = options.upperThresh ?? -12;
    this._ratio = options.ratio ?? 4;
    this._attack = options.attack ?? 10;
    this._release = options.release ?? 100;
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
      await DynamicsProcEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "dynamics-proc-processor", {
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
            console.warn("[DynamicsProc] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: DynamicsProcEffect.wasmBinary, jsCode: DynamicsProcEffect.jsCode },
        [DynamicsProcEffect.wasmBinary.slice(0)]
      );
      this.sendParam("lowerThresh", this._lowerThresh);
      this.sendParam("upperThresh", this._upperThresh);
      this.sendParam("ratio", this._ratio);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
      this.sendParam("makeup", this._makeup);
    } catch (err) {
      console.warn("[DynamicsProc] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}dynamics-proc/DynamicsProc.wasm`),
        fetch(`${base}dynamics-proc/DynamicsProc.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}dynamics-proc/DynamicsProc.worklet.js`);
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
  get lowerThresh() {
    return this._lowerThresh;
  }
  set lowerThresh(v) {
    this._lowerThresh = clamp(v, -60, 0);
    this.sendParam("lowerThresh", this._lowerThresh);
  }
  get upperThresh() {
    return this._upperThresh;
  }
  set upperThresh(v) {
    this._upperThresh = clamp(v, -30, 0);
    this.sendParam("upperThresh", this._upperThresh);
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
      case "lowerThresh":
        this.lowerThresh = value;
        break;
      case "upperThresh":
        this.upperThresh = value;
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
  DynamicsProcEffect
};
