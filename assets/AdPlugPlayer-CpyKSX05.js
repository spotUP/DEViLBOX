import { bO as getDevilboxAudioContext, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class AdPlugPlayer {
  context = null;
  gain = null;
  processNode = null;
  initialized = false;
  initPromise = null;
  initError = null;
  meta = null;
  playing = false;
  /** Position callback — called ~47fps from the worklet with (order, row, audioTime, totalFrames). */
  onPosition = null;
  /** Per-channel level callback — called ~47fps with float array (0-1 per channel). */
  onChannelLevels = null;
  /** Per-channel note state callback — called with position when channel notes change. */
  onChannelNotes = null;
  /** Called when the song ends (all patterns played). */
  onEnded = null;
  constructor() {
  }
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
      } catch {
        this.context = new AudioContext({ sampleRate: 48e3 });
      }
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      this.gain = this.context.createGain();
      this.gain.gain.value = 1;
      const baseUrl = "/";
      const cb = `?v=${Date.now()}`;
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}adplug/AdPlugPlayer.wasm${cb}`),
        fetch(`${baseUrl}adplug/AdPlugPlayer.js${cb}`)
      ]);
      if (!wasmResponse.ok) throw new Error(`Failed to load AdPlugPlayer.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load AdPlugPlayer.js: ${jsResponse.status}`);
      const [wasmBinary, jsCode] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);
      await this.context.audioWorklet.addModule(`${baseUrl}adplug/AdPlugPlayer.worklet.js${cb}`);
      this.processNode = new AudioWorkletNode(this.context, "adplug-player-processor", {
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
        const timeout = setTimeout(() => reject(new Error("AdPlug initialization timeout")), 1e4);
        const handler = (msg) => {
          if (msg.data.type === "initialized") {
            clearTimeout(timeout);
            this.processNode.port.removeEventListener("message", handler);
            resolve();
          } else if (msg.data.type === "error") {
            clearTimeout(timeout);
            this.processNode.port.removeEventListener("message", handler);
            reject(new Error(msg.data.error));
          }
        };
        this.processNode.port.addEventListener("message", handler);
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
      console.log("[AdPlugPlayer] Initialized");
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      console.error("[AdPlugPlayer] Init failed:", this.initError);
    }
  }
  handleMessage(msg) {
    var _a, _b, _c, _d, _e;
    const data = msg.data;
    switch (data.type) {
      case "loaded":
        this.meta = {
          title: data.title,
          formatType: data.formatType,
          subsongs: data.subsongs,
          instruments: data.instruments
        };
        console.log(`[AdPlugPlayer] Loaded: "${data.title}" (${data.formatType}), ${data.subsongs} subsong(s), ${data.instruments.length} instruments`);
        break;
      case "position":
        (_a = this.onPosition) == null ? void 0 : _a.call(this, data.order, data.row, data.audioTime, data.totalFrames);
        if (data.channelLevels) {
          (_b = this.onChannelLevels) == null ? void 0 : _b.call(this, data.channelLevels);
        }
        if (data.channelNotes) {
          (_c = this.onChannelNotes) == null ? void 0 : _c.call(this, data.channelNotes, data.order, data.row);
        }
        break;
      case "levels":
        if (data.channelLevels) {
          (_d = this.onChannelLevels) == null ? void 0 : _d.call(this, data.channelLevels);
        }
        break;
      case "ended":
        this.playing = false;
        (_e = this.onEnded) == null ? void 0 : _e.call(this);
        break;
      case "error":
        console.error("[AdPlugPlayer] Error:", data.error);
        break;
    }
  }
  /**
   * Load a file from an ArrayBuffer.
   * @param buffer Raw file data
   * @param filename Filename with extension (used for format detection)
   * @param companions Optional companion files (e.g. patch.003 for SCI)
   * @param autoPlay If false, load but don't start playback (default: true)
   * @param ticksPerRow Optional ticks-per-row for tick-based position tracking (capture formats)
   * @returns true if loaded successfully
   */
  async load(buffer, filename, companions, autoPlay = true, ticksPerRow) {
    const ok = await this.ensureInitialized();
    if (!ok || !this.processNode) return false;
    if (this.gain) {
      this.gain.gain.value = autoPlay ? 1 : 0;
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1e4);
      const handler = (msg) => {
        if (msg.data.type === "loaded") {
          clearTimeout(timeout);
          this.processNode.port.removeEventListener("message", handler);
          if (autoPlay) this.playing = true;
          resolve(true);
        } else if (msg.data.type === "error") {
          clearTimeout(timeout);
          this.processNode.port.removeEventListener("message", handler);
          resolve(false);
        }
      };
      this.processNode.port.addEventListener("message", handler);
      const data = new Uint8Array(buffer);
      this.processNode.port.postMessage({ type: "load", data, filename, companions: companions || [], autoPlay, ticksPerRow: ticksPerRow || 0 });
    });
  }
  play() {
    this.playing = true;
    if (this.processNode) {
      this.processNode.port.postMessage({ type: "play" });
    }
    if (this.gain) {
      this.gain.gain.value = 1;
    }
  }
  stop() {
    this.playing = false;
    if (this.processNode) {
      this.processNode.port.postMessage({ type: "stop" });
    }
    if (this.gain) {
      this.gain.gain.value = 0;
    }
  }
  rewind(subsong = 0) {
    if (this.processNode) {
      this.processNode.port.postMessage({ type: "rewind", subsong });
    }
  }
  setVolume(vol) {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, vol));
  }
  /**
   * Set per-channel mute mask for live streaming playback.
   * Bit N = 1 means channel N is ACTIVE; bit N = 0 = muted.
   * Channels 0-8 = OPL chip 0. Default: 0x1FF (all 9 active).
   */
  setMuteMask(mask) {
    if (this.processNode) {
      this.processNode.port.postMessage({ type: "setMuteMask", mask: mask >>> 0 });
    }
  }
  destroy() {
    this.stop();
    if (this.processNode) {
      this.processNode.disconnect();
      this.processNode = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
    this.initialized = false;
    this.initPromise = null;
    this.initError = null;
  }
}
let adplugInstance = null;
function getAdPlugPlayer() {
  if (!adplugInstance) {
    adplugInstance = new AdPlugPlayer();
  }
  return adplugInstance;
}
export {
  AdPlugPlayer,
  getAdPlugPlayer
};
