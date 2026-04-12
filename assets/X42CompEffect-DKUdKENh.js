import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class X42CompEffect extends ToneAudioNode {
  name = "X42Comp";
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
  _hold;
  _inputGain;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._threshold = options.threshold ?? -20;
    this._ratio = options.ratio ?? 4;
    this._attack = options.attack ?? 10;
    this._release = options.release ?? 100;
    this._hold = options.hold ?? 0;
    this._inputGain = options.inputGain ?? 0;
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
      await X42CompEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "x42-comp-processor", {
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
            console.warn("[X42Comp] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: X42CompEffect.wasmBinary, jsCode: X42CompEffect.jsCode },
        [X42CompEffect.wasmBinary.slice(0)]
      );
      this.sendParam("threshold", this._threshold);
      this.sendParam("ratio", this._ratio);
      this.sendParam("attack", this._attack);
      this.sendParam("release", this._release);
      this.sendParam("hold", this._hold);
      this.sendParam("inputGain", this._inputGain);
    } catch (err) {
      console.warn("[X42Comp] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}x42-comp/X42Comp.wasm`),
        fetch(`${base}x42-comp/X42Comp.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}x42-comp/X42Comp.worklet.js`);
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
    this._threshold = clamp(v, -50, -10);
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
  get holdEnabled() {
    return this._hold;
  }
  set holdEnabled(v) {
    this._hold = v > 0.5 ? 1 : 0;
    this.sendParam("hold", this._hold);
  }
  get inputGainDb() {
    return this._inputGain;
  }
  set inputGainDb(v) {
    this._inputGain = clamp(v, -10, 30);
    this.sendParam("inputGain", this._inputGain);
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
      case "hold":
        this.holdEnabled = value;
        break;
      case "inputGain":
        this.inputGainDb = value;
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
  X42CompEffect
};
