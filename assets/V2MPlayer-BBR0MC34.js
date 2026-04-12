import { bO as getDevilboxAudioContext, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class V2MPlayer {
  context = null;
  gain = null;
  processNode = null;
  handlers = /* @__PURE__ */ new Map();
  initialized = false;
  initError = null;
  initPromise = null;
  meta = null;
  duration = 0;
  currentTime = 0;
  playing = false;
  constructor() {
  }
  /**
   * Initialize the audio context and worklet (lazy, called on first use)
   */
  async ensureInitialized() {
    if (this.initialized) return true;
    if (this.initError) return false;
    if (this.initPromise) {
      await this.initPromise;
      return this.initialized;
    }
    this.initPromise = this.initWorklet();
    await this.initPromise;
    return this.initialized;
  }
  async initWorklet() {
    try {
      try {
        this.context = getDevilboxAudioContext();
        console.log("[V2MPlayer] Using shared ToneEngine AudioContext");
      } catch {
        this.context = new AudioContext({ sampleRate: 44100 });
        console.log("[V2MPlayer] Created standalone AudioContext");
      }
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      this.gain = this.context.createGain();
      this.gain.gain.value = 1;
      const baseUrl = "/";
      const cacheBuster = `?v=${Date.now()}`;
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}V2MPlayer.wasm${cacheBuster}`),
        fetch(`${baseUrl}V2MPlayer.js${cacheBuster}`)
      ]);
      if (!wasmResponse.ok) {
        throw new Error(`Failed to load V2MPlayer.wasm: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load V2MPlayer.js: ${jsResponse.status}`);
      }
      const [wasmBinary, jsCode] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);
      await this.context.audioWorklet.addModule(`${baseUrl}V2MPlayer.worklet.js${cacheBuster}`);
      this.processNode = new AudioWorkletNode(this.context, "v2m-player-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.processNode.port.onmessage = this.handleMessage.bind(this);
      this.processNode.port.postMessage({
        type: "init",
        sampleRate: this.context.sampleRate,
        wasmBinary,
        jsCode
      }, [wasmBinary]);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("V2MPlayer initialization timeout"));
        }, 1e4);
        const initHandler = (msg) => {
          if (msg.data.type === "initialized") {
            clearTimeout(timeout);
            this.processNode.port.removeEventListener("message", initHandler);
            resolve();
          } else if (msg.data.type === "error") {
            clearTimeout(timeout);
            this.processNode.port.removeEventListener("message", initHandler);
            reject(new Error(msg.data.error));
          }
        };
        this.processNode.port.addEventListener("message", initHandler);
      });
      this.processNode.connect(this.gain);
      try {
        const engine = getToneEngine();
        const masterInput = engine.masterEffectsInput.input;
        if (masterInput) {
          this.gain.connect(masterInput);
        } else {
          this.gain.connect(this.context.destination);
        }
      } catch {
        this.gain.connect(this.context.destination);
      }
      this.initialized = true;
      this.fireEvent("onInitialized");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.initError = errorMessage;
      console.warn("[V2MPlayer] Failed to initialize:", errorMessage);
      this.fireEvent("onError", { type: "init", message: errorMessage });
    }
  }
  handleMessage(msg) {
    const { type, lengthSeconds, error } = msg.data;
    switch (type) {
      case "loaded":
        this.meta = { lengthSeconds };
        this.duration = lengthSeconds;
        this.fireEvent("onMetadata", this.meta);
        break;
      case "playing":
        this.playing = true;
        break;
      case "stopped":
        this.playing = false;
        break;
      case "finished":
        this.playing = false;
        this.fireEvent("onEnded");
        break;
      case "error":
        this.fireEvent("onError", { type: "playback", message: error });
        break;
    }
  }
  fireEvent(eventName, data) {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }
  addHandler(eventName, handler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName).push(handler);
  }
  // Event handlers
  onInitialized(handler) {
    if (this.initialized) {
      handler();
    } else if (this.initError) {
      this.fireEvent("onError", { type: "init", message: this.initError });
    } else {
      this.addHandler("onInitialized", handler);
      this.ensureInitialized();
    }
  }
  onEnded(handler) {
    this.addHandler("onEnded", handler);
  }
  onError(handler) {
    this.addHandler("onError", handler);
  }
  onMetadata(handler) {
    this.addHandler("onMetadata", handler);
  }
  // Playback controls
  async play(buffer) {
    const ready = await this.ensureInitialized();
    if (!ready || !this.processNode || !this.context) {
      console.error("[V2MPlayer] Not initialized");
      this.fireEvent("onError", { type: "not_initialized" });
      return;
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.processNode.port.postMessage({
      type: "load",
      data: new Uint8Array(buffer)
    });
    await new Promise((resolve) => {
      const loadHandler = (msg) => {
        if (msg.data.type === "loaded" || msg.data.type === "error") {
          this.processNode.port.removeEventListener("message", loadHandler);
          resolve();
        }
      };
      this.processNode.port.addEventListener("message", loadHandler);
    });
    this.processNode.port.postMessage({ type: "play", timeMs: 0 });
    this.playing = true;
  }
  stop() {
    var _a;
    (_a = this.processNode) == null ? void 0 : _a.port.postMessage({ type: "stop", fadeMs: 0 });
    this.playing = false;
  }
  pause() {
    this.stop();
  }
  unpause() {
    var _a;
    (_a = this.processNode) == null ? void 0 : _a.port.postMessage({ type: "play", timeMs: 0 });
    this.playing = true;
  }
  setVol(volume) {
    if (this.gain) {
      this.gain.gain.value = volume;
    }
  }
  setPos(seconds) {
    var _a;
    (_a = this.processNode) == null ? void 0 : _a.port.postMessage({ type: "seek", timeMs: seconds * 1e3 });
  }
  isAvailable() {
    return this.initialized && !this.initError;
  }
  async cleanup() {
    if (this.processNode) {
      this.processNode.disconnect();
      this.processNode = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    this.initialized = false;
    this.playing = false;
  }
}
let playerInstance = null;
function getV2MPlayer() {
  if (!playerInstance) {
    playerInstance = new V2MPlayer();
  }
  return playerInstance;
}
export {
  V2MPlayer,
  getV2MPlayer
};
