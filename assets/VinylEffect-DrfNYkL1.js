import { ToneAudioNode, Gain, getContext } from "./vendor-tone-48TQc1H3.js";
import { b_ as getNativeAudioNode } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
class VinylEffect extends ToneAudioNode {
  name = "Vinyl";
  input;
  output;
  dryGain;
  wetGain;
  workletNode = null;
  isWasmReady = false;
  pendingParams = [];
  _crackle;
  _noise;
  _rumble;
  _wear;
  _speed;
  _mix;
  _wet;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new Set();
  static initPromises = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super();
    this._crackle = options.crackle ?? 0.3;
    this._noise = options.noise ?? 0.2;
    this._rumble = options.rumble ?? 0.1;
    this._wear = options.wear ?? 0.3;
    this._speed = options.speed ?? 0.5;
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
      await VinylEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, "vinyl-processor", {
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
            console.warn("[Vinyl] WASM swap failed, staying on passthrough:", swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: "init", wasmBinary: VinylEffect.wasmBinary, jsCode: VinylEffect.jsCode },
        [VinylEffect.wasmBinary.slice(0)]
      );
      this.sendParam("crackle", this._crackle);
      this.sendParam("noise", this._noise);
      this.sendParam("rumble", this._rumble);
      this.sendParam("wear", this._wear);
      this.sendParam("speed", this._speed);
      this.sendParam("mix", this._mix);
    } catch (err) {
      console.warn("[Vinyl] Worklet init failed:", err);
    }
  }
  static async ensureInitialized(ctx) {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = "/";
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}vinyl/Vinyl.wasm`),
        fetch(`${base}vinyl/Vinyl.js`)
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, "");
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}vinyl/Vinyl.worklet.js`);
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
  setCrackle(v) {
    this._crackle = clamp(v, 0, 1);
    this.sendParam("crackle", this._crackle);
  }
  setNoise(v) {
    this._noise = clamp(v, 0, 1);
    this.sendParam("noise", this._noise);
  }
  setRumble(v) {
    this._rumble = clamp(v, 0, 1);
    this.sendParam("rumble", this._rumble);
  }
  setWear(v) {
    this._wear = clamp(v, 0, 1);
    this.sendParam("wear", this._wear);
  }
  setSpeed(v) {
    this._speed = clamp(v, 0, 1);
    this.sendParam("speed", this._speed);
  }
  setMix(v) {
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
  get crackle() {
    return this._crackle;
  }
  get noise() {
    return this._noise;
  }
  get rumble() {
    return this._rumble;
  }
  get wear() {
    return this._wear;
  }
  get speed() {
    return this._speed;
  }
  get mix() {
    return this._mix;
  }
  setParam(param, value) {
    switch (param) {
      case "crackle":
        this.setCrackle(value);
        break;
      case "noise":
        this.setNoise(value);
        break;
      case "rumble":
        this.setRumble(value);
        break;
      case "wear":
        this.setWear(value);
        break;
      case "speed":
        this.setSpeed(value);
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
  VinylEffect
};
