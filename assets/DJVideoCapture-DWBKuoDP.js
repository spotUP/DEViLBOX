import { getContext, getDestination, connect } from "./vendor-tone-48TQc1H3.js";
const _canvasRegistry = /* @__PURE__ */ new Map();
function registerCaptureCanvas(source, canvas) {
  if (canvas) {
    _canvasRegistry.set(source, canvas);
  } else {
    _canvasRegistry.delete(source);
  }
}
function getCaptureCanvas(source) {
  return _canvasRegistry.get(source) ?? null;
}
class DJVideoCapture {
  _stream = null;
  _audioDestination = null;
  _source = null;
  _active = false;
  /** Start capturing video + audio into a combined MediaStream */
  startCapture(source, fps = 30) {
    if (this._active) this.stopCapture();
    const canvas = getCaptureCanvas(source);
    if (!canvas) {
      throw new Error(`No canvas registered for source "${source}". Make sure the view is active.`);
    }
    const videoStream = canvas.captureStream(fps);
    const videoTrack = videoStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error(`Canvas "${source}" produced no video track`);
    }
    const rawCtx = getContext().rawContext;
    this._audioDestination = rawCtx.createMediaStreamDestination();
    const destNode = getDestination().output ?? getDestination()._gainNode ?? getDestination();
    try {
      const nativeNode = destNode._nativeAudioNode ?? destNode.input ?? destNode;
      if (nativeNode && typeof nativeNode.connect === "function") {
        nativeNode.connect(this._audioDestination);
      }
    } catch {
      console.warn("[DJVideoCapture] Direct node connect failed, trying Tone.connect");
      connect(getDestination(), this._audioDestination);
    }
    const audioTrack = this._audioDestination.stream.getAudioTracks()[0];
    this._stream = new MediaStream([videoTrack]);
    if (audioTrack) {
      this._stream.addTrack(audioTrack);
    }
    this._source = source;
    this._active = true;
    console.log(`[DJVideoCapture] Started: source=${source}, fps=${fps}, hasAudio=${!!audioTrack}`);
    return this._stream;
  }
  /** Stop capturing and release all resources */
  stopCapture() {
    var _a;
    if (!this._active) return;
    if (this._audioDestination) {
      try {
        const destNode = getDestination().output ?? getDestination()._gainNode;
        const nativeNode = (destNode == null ? void 0 : destNode._nativeAudioNode) ?? (destNode == null ? void 0 : destNode.input) ?? destNode;
        if (nativeNode && typeof nativeNode.disconnect === "function") {
          try {
            nativeNode.disconnect(this._audioDestination);
          } catch {
          }
        }
      } catch {
      }
      this._audioDestination = null;
    }
    (_a = this._stream) == null ? void 0 : _a.getTracks().forEach((t) => t.stop());
    this._stream = null;
    this._source = null;
    this._active = false;
    console.log("[DJVideoCapture] Stopped");
  }
  get isActive() {
    return this._active;
  }
  get currentSource() {
    return this._source;
  }
  get stream() {
    return this._stream;
  }
}
export {
  DJVideoCapture as D,
  getCaptureCanvas as g,
  registerCaptureCanvas as r
};
