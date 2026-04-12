const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { bO as getDevilboxAudioContext, am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class AudioInputManager {
  stream = null;
  sourceNode = null;
  inputGain;
  monitorGain;
  analyser;
  isRecording = false;
  recorder = null;
  recordedChunks = [];
  audioContext;
  effectsDestination = null;
  effectsConnected = false;
  currentDeviceId = null;
  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.inputGain = this.audioContext.createGain();
    this.inputGain.gain.value = 1;
    this.monitorGain = this.audioContext.createGain();
    this.monitorGain.gain.value = 0;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.monitorGain);
  }
  /**
   * Get the input gain node for external routing (e.g., to effects chain).
   */
  getInputNode() {
    return this.inputGain;
  }
  /**
   * Get available audio input devices.
   */
  async getInputDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput").map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Input ${d.deviceId.slice(0, 8)}`,
        groupId: d.groupId
      }));
    } catch (err) {
      console.error("[AudioInputManager] Failed to enumerate devices:", err);
      return [];
    }
  }
  /**
   * Select and connect an audio input device.
   */
  async selectDevice(deviceId) {
    var _a, _b, _c;
    this.disconnect();
    try {
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : void 0,
          echoCancellation: false,
          // Disabled for music recording
          noiseSuppression: false,
          autoGainControl: false
        }
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.inputGain);
      this.currentDeviceId = deviceId ?? null;
      if (this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
        } catch {
        }
      }
      const tracks = this.stream.getAudioTracks();
      const trackInfo = (_b = (_a = tracks[0]) == null ? void 0 : _a.getSettings) == null ? void 0 : _b.call(_a);
      console.log(
        "[AudioInputManager] Connected to input device:",
        ((_c = tracks[0]) == null ? void 0 : _c.label) ?? deviceId ?? "default",
        trackInfo
      );
      return true;
    } catch (err) {
      console.error("[AudioInputManager] Failed to connect device:", err);
      return false;
    }
  }
  /**
   * Set input gain level (0-2, 1.0 = unity).
   */
  setInputGain(gain) {
    this.inputGain.gain.setValueAtTime(
      Math.max(0, Math.min(2, gain)),
      this.audioContext.currentTime
    );
  }
  /**
   * Enable/disable live monitoring (hear input through speakers).
   */
  setMonitoring(enabled) {
    if (enabled) {
      this.monitorGain.gain.setValueAtTime(1, this.audioContext.currentTime);
      this.monitorGain.connect(this.audioContext.destination);
    } else {
      this.monitorGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      try {
        this.monitorGain.disconnect(this.audioContext.destination);
      } catch {
      }
    }
  }
  /**
   * Get current input level (RMS, 0-1).
   */
  getInputLevel() {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }
  /**
   * Route mic input through ToneEngine's master effects chain.
   * Call before startRecording() to record with effects.
   */
  async enableEffectsRouting() {
    if (this.effectsConnected) return;
    try {
      const { getToneEngine } = await __vitePreload(async () => {
        const { getToneEngine: getToneEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.j2);
        return { getToneEngine: getToneEngine2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const engine = getToneEngine();
      this.inputGain.connect(engine.masterEffectsInput.input);
      this.effectsDestination = this.audioContext.createMediaStreamDestination();
      engine.masterChannel.connect(this.effectsDestination);
      this.effectsConnected = true;
      console.log("[AudioInputManager] Effects routing enabled");
    } catch (err) {
      console.error("[AudioInputManager] Failed to enable effects routing:", err);
    }
  }
  /**
   * Disconnect mic from effects chain.
   */
  async disableEffectsRouting() {
    if (!this.effectsConnected) return;
    try {
      const { getToneEngine } = await __vitePreload(async () => {
        const { getToneEngine: getToneEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.j2);
        return { getToneEngine: getToneEngine2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const engine = getToneEngine();
      this.inputGain.disconnect(engine.masterEffectsInput.input);
      if (this.effectsDestination) {
        try {
          engine.masterChannel.disconnect(this.effectsDestination);
        } catch {
        }
        this.effectsDestination = null;
      }
      this.effectsConnected = false;
      console.log("[AudioInputManager] Effects routing disabled");
    } catch {
    }
  }
  /** Whether effects routing is active */
  isEffectsRouted() {
    return this.effectsConnected;
  }
  /**
   * Pick a MediaRecorder mimeType supported by the current browser.
   * Falls back through several common formats so Safari/Firefox/Chrome
   * all work.
   */
  pickRecorderMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/ogg;codecs=opus",
      "audio/ogg"
    ];
    for (const mt of candidates) {
      try {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mt)) return mt;
      } catch {
      }
    }
    return "";
  }
  /**
   * Start recording audio input.
   * @param withEffects If true, records from the effects chain output instead of raw mic
   */
  startRecording(withEffects = false) {
    if (!this.stream || this.isRecording) {
      console.warn("[AudioInputManager] startRecording: not connected or already recording");
      return;
    }
    this.recordedChunks = [];
    const recordStream = withEffects && this.effectsDestination ? this.effectsDestination.stream : this.stream;
    const mimeType = this.pickRecorderMimeType();
    try {
      this.recorder = mimeType ? new MediaRecorder(recordStream, { mimeType }) : new MediaRecorder(recordStream);
    } catch (err) {
      console.error("[AudioInputManager] MediaRecorder construction failed:", err);
      throw err;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
    this.recorder.start(100);
    this.isRecording = true;
    console.log(
      `[AudioInputManager] Recording started ${withEffects ? "(with effects)" : "(dry)"} mimeType=${this.recorder.mimeType}`
    );
  }
  /**
   * Stop recording and return the recorded audio as an AudioBuffer.
   */
  async stopRecording() {
    if (!this.recorder || !this.isRecording) return null;
    const recorderRef = this.recorder;
    return new Promise((resolve) => {
      recorderRef.onstop = async () => {
        this.isRecording = false;
        if (this.recordedChunks.length === 0) {
          console.warn("[AudioInputManager] stopRecording: no chunks captured");
          resolve(null);
          return;
        }
        try {
          const blobType = recorderRef.mimeType || "audio/webm";
          const blob = new Blob(this.recordedChunks, { type: blobType });
          const arrayBuffer = await blob.arrayBuffer();
          console.log(
            `[AudioInputManager] stopRecording: ${this.recordedChunks.length} chunks, ${blob.size} bytes, type=${blobType}`
          );
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          console.log(`[AudioInputManager] Recorded ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch`);
          resolve(audioBuffer);
        } catch (err) {
          console.error("[AudioInputManager] Failed to decode recording:", err);
          resolve(null);
        }
      };
      this.recorder.stop();
    });
  }
  /**
   * Check if currently recording.
   */
  getIsRecording() {
    return this.isRecording;
  }
  /**
   * Check if a device is connected.
   */
  isConnected() {
    return this.sourceNode !== null;
  }
  /**
   * Get the deviceId of the currently selected input (null if none / default).
   */
  getCurrentDeviceId() {
    return this.currentDeviceId;
  }
  /**
   * Disconnect current input device.
   */
  disconnect() {
    if (this.recorder && this.isRecording) {
      this.recorder.stop();
      this.isRecording = false;
    }
    if (this.effectsConnected) {
      this.disableEffectsRouting();
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.currentDeviceId = null;
    this.setMonitoring(false);
  }
  /**
   * Dispose all resources.
   */
  dispose() {
    this.disconnect();
    this.inputGain.disconnect();
    this.monitorGain.disconnect();
    this.analyser.disconnect();
  }
}
let instance = null;
function getAudioInputManager() {
  if (!instance) {
    instance = new AudioInputManager();
  }
  return instance;
}
export {
  getAudioInputManager
};
