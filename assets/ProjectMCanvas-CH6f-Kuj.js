import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { R as React, a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { A as AudioDataBus } from "./AudioDataBus-DGyOo1ms.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-tone-48TQc1H3.js";
let factoryPromise = null;
function loadFactory() {
  if (factoryPromise) return factoryPromise;
  factoryPromise = new Promise((resolve, reject) => {
    const existing = window.createProjectM;
    if (typeof existing === "function") {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "/projectm/ProjectM.js";
    script.onload = () => {
      const fn = window.createProjectM;
      if (typeof fn === "function") {
        resolve(fn);
      } else {
        reject(new Error("createProjectM not found after script load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load ProjectM.js"));
    document.head.appendChild(script);
  });
  return factoryPromise;
}
class ProjectMEngine {
  mod = null;
  pcmBuf = 0;
  // WASM heap pointer for PCM push buffer
  pcmBufSize = 0;
  strBuf = 0;
  // reusable string buffer
  strBufSize = 0;
  _ready = false;
  // Queue preset loads to be applied inside renderFrame where the WebGL context is active.
  // Loading presets outside the render loop can fail silently because the SDL/Emscripten
  // WebGL context may not be current, causing shader compilation to silently fail.
  pendingPreset = null;
  get ready() {
    return this._ready;
  }
  /**
   * Initialize projectM. Pass the canvas element that Emscripten's SDL2 will bind to.
   * The canvas must already be in the DOM.
   */
  async init(canvas, width, height) {
    const factory = await loadFactory();
    if (!canvas.id) canvas.id = "projectm-canvas";
    this.mod = await factory({
      canvas,
      // Suppress non-fatal SDL event handler warnings
      printErr: (text) => {
        if (typeof text === "string" && text.includes("registerOrRemoveHandler")) return;
      }
    });
    const rc = this.mod._pm_init(width, height);
    if (rc !== 0) throw new Error(`pm_init failed with code ${rc}`);
    const maxSamples = this.mod._pm_get_max_samples();
    this.pcmBufSize = maxSamples * 2;
    this.pcmBuf = this.mod._malloc(this.pcmBufSize * 4);
    this.strBufSize = 65536;
    this.strBuf = this.mod._malloc(this.strBufSize);
    this.mod._pm_set_preset_locked(1);
    this._ready = true;
  }
  /** Render one frame to the bound canvas. Call from rAF. */
  renderFrame() {
    if (!this.mod) return;
    if (this.pendingPreset) {
      const { data, smooth } = this.pendingPreset;
      this.pendingPreset = null;
      const bytes = this.mod.lengthBytesUTF8(data) + 1;
      let ptr = this.strBuf;
      let allocated = false;
      if (bytes > this.strBufSize) {
        ptr = this.mod._malloc(bytes);
        allocated = true;
      }
      this.mod.stringToUTF8(data, ptr, bytes);
      this.mod._pm_load_preset_data(ptr, smooth ? 1 : 0);
      if (allocated) this.mod._free(ptr);
    }
    this.mod._pm_render_frame();
  }
  /**
   * Push interleaved stereo float PCM audio data.
   * @param samples Float32Array of interleaved LRLRLR... samples
   * @param samplesPerChannel Number of samples per channel
   */
  pushAudio(samples, samplesPerChannel) {
    if (!this.mod || !this.pcmBuf) return;
    const count = Math.min(samplesPerChannel, this.pcmBufSize / 2);
    this.mod.HEAPF32.set(samples.subarray(0, count * 2), this.pcmBuf >> 2);
    this.mod._pm_add_pcm(this.pcmBuf, count);
  }
  /** Queue a Milkdrop preset to be loaded on the next render frame.
   *  Loading is deferred to renderFrame() where the SDL/WebGL context is guaranteed active. */
  loadPresetData(data, smooth = true) {
    if (!this.mod) return;
    this.pendingPreset = { data, smooth };
  }
  /** Load a preset from the Emscripten virtual filesystem. */
  loadPresetFile(path, smooth = true) {
    if (!this.mod) return;
    const bytes = this.mod.lengthBytesUTF8(path) + 1;
    let ptr = this.strBuf;
    let allocated = false;
    if (bytes > this.strBufSize) {
      ptr = this.mod._malloc(bytes);
      allocated = true;
    }
    this.mod.stringToUTF8(path, ptr, bytes);
    this.mod._pm_load_preset_file(ptr, smooth ? 1 : 0);
    if (allocated) this.mod._free(ptr);
  }
  /** Resize the viewport. */
  setSize(width, height) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_size(width, height);
  }
  /** Set beat detection sensitivity (default 1.0). */
  setBeatSensitivity(value) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_beat_sensitivity(value);
  }
  /** Set crossfade duration in seconds. */
  setSoftCutDuration(seconds) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_soft_cut_duration(seconds);
  }
  /** Set auto-advance interval (seconds per preset). */
  setPresetDuration(seconds) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_preset_duration(seconds);
  }
  /** Lock/unlock preset auto-switching. */
  setPresetLocked(locked) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_preset_locked(locked ? 1 : 0);
  }
  /** Enable/disable hard cuts (abrupt transitions on beat). */
  setHardCutEnabled(enabled) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_hard_cut_enabled(enabled ? 1 : 0);
  }
  /** Set mesh resolution (default 48x36). Higher = more detail. */
  setMeshSize(width, height) {
    var _a;
    (_a = this.mod) == null ? void 0 : _a._pm_set_mesh_size(width, height);
  }
  /** Destroy the engine and free resources. */
  destroy() {
    if (!this.mod) return;
    this.mod._pm_destroy();
    if (this.pcmBuf) this.mod._free(this.pcmBuf);
    if (this.strBuf) this.mod._free(this.strBuf);
    this.pcmBuf = 0;
    this.strBuf = 0;
    this.mod = null;
    this._ready = false;
  }
}
const BUILTIN_PRESETS = {
  "Bass Pulse Tunnel": `[preset00]
fRating=4
fGammaAdj=1.8
fDecay=0.96
fVideoEchoZoom=1.01
fVideoEchoAlpha=0.3
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=1
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.5
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.5
fWarpScale=1.2
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0.5
sx=1
sy=1
wave_r=0.0
wave_g=0.5
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=0.5
ib_size=0.01
ib_r=0.1
ib_g=0.3
ib_b=0.6
ib_a=0.3
per_frame_1=zoom = 1.0 + 0.1*bass;
per_frame_2=rot = 0.02*sin(time*0.3) + 0.01*treb;
per_frame_3=warp = 0.5 + 0.5*bass;
per_frame_4=wave_r = 0.5 + 0.5*sin(time*1.1);
per_frame_5=wave_g = 0.5 + 0.5*sin(time*1.3 + 2.0);
per_frame_6=wave_b = 0.5 + 0.5*sin(time*1.7 + 4.0);
per_frame_7=decay = 0.94 + 0.04*bass;
per_frame_8=ob_a = 0.3 + 0.3*bass;
per_pixel_1=zoom = zoom + 0.02*rad*bass;
per_pixel_2=rot = rot + 0.01*sin(ang*6.0)*treb;`,
  "Neon Waveform": `[preset00]
fRating=4
fGammaAdj=2.0
fDecay=0.92
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=5
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=0
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=2.0
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=0.0
wave_g=1.0
wave_b=0.5
wave_x=0.5
wave_y=0.5
ob_size=0
ob_r=0
ob_g=0
ob_b=0
ob_a=0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=wave_r = 0.5+0.5*sin(time*2.0);
per_frame_2=wave_g = 0.5+0.5*cos(time*1.5);
per_frame_3=wave_b = 0.5+0.5*sin(time*3.0+1.0);
per_frame_4=wave_x = 0.5;
per_frame_5=wave_y = 0.5;
per_frame_6=zoom = 0.98 + 0.02*bass;
per_frame_7=rot = 0.005*sin(time*0.2);`,
  "Spiral Galaxy": `[preset00]
fRating=4
fGammaAdj=1.9
fDecay=0.97
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.4
nVideoEchoOrientation=3
nWaveMode=0
bAdditiveWaves=1
bWaveDots=1
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.9
fWaveScale=1.0
fWaveSmoothing=0.7
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=2.0
fWarpScale=2.0
fZoomExponent=1.0
fShader=0
zoom=0.99
rot=0.03
cx=0.5
cy=0.5
dx=0
dy=0
warp=1.0
sx=1
sy=1
wave_r=1.0
wave_g=0.5
wave_b=0.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.0
ob_b=0.2
ob_a=0.8
ib_size=0.005
ib_r=0.2
ib_g=0.0
ib_b=0.2
ib_a=0.3
per_frame_1=rot = 0.03 + 0.02*bass;
per_frame_2=zoom = 0.985 + 0.015*mid;
per_frame_3=warp = 1.0 + 2.0*treb;
per_frame_4=wave_r = 0.8 + 0.2*bass;
per_frame_5=wave_g = 0.3 + 0.3*mid;
per_frame_6=wave_b = 0.5 + 0.5*treb;
per_frame_7=decay = 0.96 + 0.02*bass;
per_pixel_1=rot = rot + 0.03*sin(rad*3.14159*4.0)*bass;
per_pixel_2=zoom = zoom + 0.01*sin(ang*4.0)*mid;`,
  "Heartbeat Rings": `[preset00]
fRating=4
fGammaAdj=2.0
fDecay=0.95
fVideoEchoZoom=1.005
fVideoEchoAlpha=0.5
nVideoEchoOrientation=0
nWaveMode=3
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=1
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.8
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1.0
sy=1.0
wave_r=1.0
wave_g=0.2
wave_b=0.4
wave_x=0.5
wave_y=0.5
ob_size=0
ob_r=0
ob_g=0
ob_b=0
ob_a=0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=zoom = 1.0 + 0.15*bass - 0.05*mid;
per_frame_2=sx = 1.0 + 0.05*sin(time*2.0)*bass;
per_frame_3=sy = 1.0 + 0.05*cos(time*2.0)*bass;
per_frame_4=wave_r = 1.0;
per_frame_5=wave_g = 0.2 + 0.4*mid;
per_frame_6=wave_b = 0.4 + 0.6*treb;
per_frame_7=decay = 0.93 + 0.05*bass;
per_pixel_1=zoom = zoom + 0.1*sin(rad*3.14159*6.0)*bass;`,
  "Electric Storm": `[preset00]
fRating=5
fGammaAdj=1.7
fDecay=0.94
fVideoEchoZoom=1.01
fVideoEchoAlpha=0.35
nVideoEchoOrientation=1
nWaveMode=6
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.0
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=2.0
fWarpScale=1.5
fZoomExponent=1.0
fShader=0
zoom=0.98
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=1.0
sx=1
sy=1
wave_r=0.3
wave_g=0.5
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=0.8
ib_size=0.005
ib_r=0.0
ib_g=0.2
ib_b=0.5
ib_a=0.5
per_frame_1=warp = 1.0 + 3.0*bass;
per_frame_2=zoom = 0.97 + 0.03*mid;
per_frame_3=rot = 0.01*sin(time*0.5)*treb;
per_frame_4=cx = 0.5 + 0.1*sin(time*0.7);
per_frame_5=cy = 0.5 + 0.1*cos(time*0.9);
per_frame_6=wave_r = 0.3 + 0.7*treb;
per_frame_7=wave_g = 0.3 + 0.4*mid;
per_frame_8=wave_b = 0.8 + 0.2*bass;
per_frame_9=decay = 0.92 + 0.06*bass;
per_pixel_1=warp = warp + 0.5*sin(ang*3.0 + time)*treb;
per_pixel_2=zoom = zoom + 0.02*cos(rad*8.0)*bass;`,
  "Deep Ocean": `[preset00]
fRating=4
fGammaAdj=1.6
fDecay=0.985
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.2
nVideoEchoOrientation=2
nWaveMode=2
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=0
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.7
fWaveScale=1.2
fWaveSmoothing=0.8
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=0.5
fWarpScale=2.0
fZoomExponent=1.0
fShader=0
zoom=1.005
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0.5
sx=1
sy=1
wave_r=0.0
wave_g=0.3
wave_b=0.8
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.05
ob_b=0.15
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=zoom = 1.003 + 0.005*bass;
per_frame_2=warp = 0.3 + 0.8*mid;
per_frame_3=rot = 0.003*sin(time*0.15);
per_frame_4=dx = 0.002*sin(time*0.2);
per_frame_5=dy = 0.003*cos(time*0.15);
per_frame_6=wave_r = 0.0 + 0.3*treb;
per_frame_7=wave_g = 0.3 + 0.3*mid;
per_frame_8=wave_b = 0.7 + 0.3*bass;
per_frame_9=decay = 0.98 + 0.015*bass;
per_pixel_1=zoom = zoom + 0.005*sin(rad*6.28*2.0 + time*0.5)*mid;
per_pixel_2=warp = warp + 0.3*sin(ang*2.0 + time*0.3)*bass;`,
  "Fire Dance": `[preset00]
fRating=5
fGammaAdj=2.2
fDecay=0.93
fVideoEchoZoom=1.02
fVideoEchoAlpha=0.25
nVideoEchoOrientation=0
nWaveMode=4
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=1.5
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=3.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=0.99
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=-0.005
warp=0.5
sx=1
sy=1
wave_r=1.0
wave_g=0.5
wave_b=0.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=zoom = 0.98 + 0.04*bass;
per_frame_2=dy = -0.005 - 0.01*bass;
per_frame_3=warp = 0.5 + 1.5*mid;
per_frame_4=rot = 0.005*sin(time*0.4)*treb;
per_frame_5=wave_r = 0.9 + 0.1*bass;
per_frame_6=wave_g = 0.3 + 0.4*mid;
per_frame_7=wave_b = 0.0 + 0.3*treb;
per_frame_8=decay = 0.91 + 0.07*bass;
per_pixel_1=dy = dy - 0.01*sin(x*3.14159*2.0)*bass;
per_pixel_2=dx = 0.003*sin(y*3.14159*4.0 + time)*treb;`,
  "Cosmic Warp": `[preset00]
fRating=5
fGammaAdj=1.8
fDecay=0.96
fVideoEchoZoom=0.99
fVideoEchoAlpha=0.5
nVideoEchoOrientation=3
nWaveMode=7
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.8
fWaveScale=1.0
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.5
fWarpScale=3.0
fZoomExponent=1.0
fShader=0
zoom=1.01
rot=0.02
cx=0.5
cy=0.5
dx=0
dy=0
warp=2.0
sx=1
sy=1
wave_r=0.6
wave_g=0.2
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.1
ob_g=0.0
ob_b=0.2
ob_a=0.5
ib_size=0.005
ib_r=0.2
ib_g=0.0
ib_b=0.3
ib_a=0.3
per_frame_1=zoom = 1.005 + 0.02*bass;
per_frame_2=rot = 0.02 + 0.03*treb;
per_frame_3=warp = 2.0 + 3.0*mid;
per_frame_4=cx = 0.5 + 0.15*sin(time*0.3);
per_frame_5=cy = 0.5 + 0.15*cos(time*0.4);
per_frame_6=wave_r = 0.4 + 0.6*sin(time*0.7);
per_frame_7=wave_g = 0.2 + 0.4*sin(time*1.1 + 2.0);
per_frame_8=wave_b = 0.8 + 0.2*cos(time*0.9);
per_frame_9=decay = 0.95 + 0.03*bass;
per_pixel_1=zoom = zoom + 0.03*sin(ang*5.0 + time*0.5)*bass;
per_pixel_2=rot = rot + 0.04*sin(rad*3.14*3.0)*mid;
per_pixel_3=warp = warp + sin(ang*3.0)*treb;`,
  "Strobelight": `[preset00]
fRating=4
fGammaAdj=2.5
fDecay=0.5
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=0
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=3.0
fWaveSmoothing=0.3
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=1.0
wave_g=1.0
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=decay = 0.2 + 0.6*bass;
per_frame_2=wave_r = 0.5+0.5*sin(time*5.0);
per_frame_3=wave_g = 0.5+0.5*sin(time*5.0+2.0);
per_frame_4=wave_b = 0.5+0.5*sin(time*5.0+4.0);
per_frame_5=zoom = 1.0 + 0.3*bass;
per_frame_6=rot = 0.1*treb*sin(time);`,
  "Kaleidoscope": `[preset00]
fRating=5
fGammaAdj=1.8
fDecay=0.97
fVideoEchoZoom=1.005
fVideoEchoAlpha=0.6
nVideoEchoOrientation=2
nWaveMode=1
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.6
fWaveScale=1.0
fWaveSmoothing=0.7
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=2.0
fZoomExponent=1.0
fShader=0
zoom=0.99
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=1.5
sx=1
sy=1
wave_r=0.8
wave_g=0.4
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.0
ob_b=0.1
ob_a=0.6
ib_size=0.005
ib_r=0.1
ib_g=0.0
ib_b=0.1
ib_a=0.4
per_frame_1=rot = 0.05*bass;
per_frame_2=zoom = 0.98 + 0.03*mid;
per_frame_3=warp = 1.0 + 2.0*treb;
per_frame_4=wave_r = 0.5 + 0.5*sin(time*1.5);
per_frame_5=wave_g = 0.5 + 0.5*sin(time*1.5 + 2.09);
per_frame_6=wave_b = 0.5 + 0.5*sin(time*1.5 + 4.19);
per_frame_7=decay = 0.96 + 0.03*bass;
per_pixel_1=rot = rot + 0.1*sin(ang*6.0)*bass;
per_pixel_2=zoom = zoom + 0.02*sin(ang*8.0 + time)*mid;
per_pixel_3=warp = warp + sin(rad*4.0)*treb;`,
  "Hypnotic Zoom": `[preset00]
fRating=4
fGammaAdj=2.0
fDecay=0.98
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=1
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.9
fWaveScale=1.2
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.04
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=1.0
wave_g=1.0
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=0.3
ib_size=0.01
ib_r=0.2
ib_g=0.1
ib_b=0.5
ib_a=0.6
per_frame_1=zoom = 1.02 + 0.06*bass;
per_frame_2=rot = 0.01*sin(time*0.25) + 0.005*treb;
per_frame_3=cx = 0.5 + 0.05*sin(time*0.3);
per_frame_4=cy = 0.5 + 0.05*cos(time*0.4);
per_frame_5=wave_r = 0.8 + 0.2*bass;
per_frame_6=wave_g = 0.6 + 0.4*mid;
per_frame_7=wave_b = 1.0;
per_frame_8=decay = 0.97 + 0.02*bass;
per_frame_9=ib_r = 0.2 + 0.3*sin(time*0.5);
per_frame_10=ib_g = 0.1 + 0.2*sin(time*0.7);
per_frame_11=ib_b = 0.5 + 0.3*sin(time*0.3);`,
  "Motion Vectors": `[preset00]
fRating=4
fGammaAdj=1.9
fDecay=0.96
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=1
bRedBlueStereo=0
nMotionVectorsX=32
nMotionVectorsY=24
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=0.5
fWaveScale=1.0
fWaveSmoothing=0.5
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.5
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.02
cx=0.5
cy=0.5
dx=0
dy=0
warp=0.5
sx=1
sy=1
wave_r=0.5
wave_g=1.0
wave_b=0.5
wave_x=0.5
wave_y=0.5
ob_size=0
ob_r=0
ob_g=0
ob_b=0
ob_a=0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=rot = 0.02 + 0.03*bass;
per_frame_2=zoom = 0.99 + 0.02*mid;
per_frame_3=warp = 0.5 + 1.5*treb;
per_frame_4=decay = 0.95 + 0.04*bass;
per_frame_5=wave_r = 0.3 + 0.7*treb;
per_frame_6=wave_g = 0.8 + 0.2*mid;
per_frame_7=wave_b = 0.3 + 0.4*bass;
per_pixel_1=rot = rot + 0.05*sin(rad*6.28*3.0)*bass;
per_pixel_2=dx = 0.005*cos(ang*4.0+time)*mid;
per_pixel_3=dy = 0.005*sin(ang*4.0+time)*mid;`,
  "Acid Trip": `[preset00]
fRating=5
fGammaAdj=1.5
fDecay=0.99
fVideoEchoZoom=1.01
fVideoEchoAlpha=0.7
nVideoEchoOrientation=1
nWaveMode=5
bAdditiveWaves=1
bWaveDots=0
bMaximizeWaveColor=0
bTexWrap=1
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=1
bInvert=0
fWaveAlpha=0.6
fWaveScale=1.0
fWaveSmoothing=0.6
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=2.0
fWarpScale=3.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.01
cx=0.5
cy=0.5
dx=0
dy=0
warp=2.0
sx=1
sy=1
wave_r=1.0
wave_g=0.0
wave_b=1.0
wave_x=0.5
wave_y=0.5
ob_size=0.01
ob_r=0.1
ob_g=0.0
ob_b=0.1
ob_a=0.3
ib_size=0.01
ib_r=0.0
ib_g=0.1
ib_b=0.0
ib_a=0.3
per_frame_1=zoom = 0.99 + 0.02*bass;
per_frame_2=rot = 0.01 + 0.02*treb*sin(time*0.3);
per_frame_3=warp = 2.0 + 4.0*mid;
per_frame_4=cx = 0.5 + 0.2*sin(time*0.2)*bass;
per_frame_5=cy = 0.5 + 0.2*cos(time*0.3)*bass;
per_frame_6=wave_r = 0.5+0.5*sin(time*2.0);
per_frame_7=wave_g = 0.5+0.5*sin(time*2.0+2.09);
per_frame_8=wave_b = 0.5+0.5*sin(time*2.0+4.19);
per_frame_9=decay = 0.985 + 0.01*bass;
per_pixel_1=warp = warp + 2.0*sin(ang*3.0+time*0.5)*bass;
per_pixel_2=rot = rot + 0.05*cos(rad*6.28*2.0)*treb;
per_pixel_3=zoom = zoom + 0.01*sin(ang*7.0)*mid;`,
  "Minimal Pulse": `[preset00]
fRating=3
fGammaAdj=2.0
fDecay=0.8
fVideoEchoZoom=1.0
fVideoEchoAlpha=0.0
nVideoEchoOrientation=0
nWaveMode=0
bAdditiveWaves=0
bWaveDots=0
bMaximizeWaveColor=1
bTexWrap=0
bDarkenCenter=0
bMotionVectorsOn=0
bRedBlueStereo=0
nMotionVectorsX=12
nMotionVectorsY=9
bBrighten=0
bDarken=0
bSolarize=0
bInvert=0
fWaveAlpha=1.0
fWaveScale=2.5
fWaveSmoothing=0.4
fWaveParam=0
fModWaveAlphaStart=0.75
fModWaveAlphaEnd=0.95
fWarpAnimSpeed=1.0
fWarpScale=1.0
fZoomExponent=1.0
fShader=0
zoom=1.0
rot=0.0
cx=0.5
cy=0.5
dx=0
dy=0
warp=0
sx=1
sy=1
wave_r=0.0
wave_g=1.0
wave_b=0.0
wave_x=0.5
wave_y=0.5
ob_size=0.005
ob_r=0.0
ob_g=0.0
ob_b=0.0
ob_a=1.0
ib_size=0
ib_r=0
ib_g=0
ib_b=0
ib_a=0
per_frame_1=decay = 0.5 + 0.4*bass;
per_frame_2=wave_r = bass;
per_frame_3=wave_g = mid;
per_frame_4=wave_b = treb;
per_frame_5=zoom = 1.0 + 0.05*bass;`
};
let manifestPresets = null;
let allPresetNames = null;
const presetContentCache = /* @__PURE__ */ new Map();
async function loadManifest() {
  if (manifestPresets) return;
  try {
    const resp = await fetch("/projectm/presets-manifest.json");
    const data = await resp.json();
    manifestPresets = data.presets;
    const builtinNames = Object.keys(BUILTIN_PRESETS);
    const seen = new Set(builtinNames);
    allPresetNames = [...builtinNames];
    for (const p of manifestPresets) {
      if (!seen.has(p.name)) {
        allPresetNames.push(p.name);
        seen.add(p.name);
      }
    }
    for (const [name, content] of Object.entries(BUILTIN_PRESETS)) {
      presetContentCache.set(name, content);
    }
  } catch {
    allPresetNames = Object.keys(BUILTIN_PRESETS);
    for (const [name, content] of Object.entries(BUILTIN_PRESETS)) {
      presetContentCache.set(name, content);
    }
  }
}
async function fetchPresetContent(name) {
  if (presetContentCache.has(name)) return presetContentCache.get(name);
  const entry = manifestPresets == null ? void 0 : manifestPresets.find((p) => p.name === name);
  if (!entry) {
    return null;
  }
  try {
    const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
    const resp = await fetch(`/projectm/presets/${encodedPath}`);
    if (!resp.ok) {
      return null;
    }
    const text = await resp.text();
    presetContentCache.set(name, text);
    return text;
  } catch (_err) {
    return null;
  }
}
function getProjectMManifest() {
  return manifestPresets;
}
function getProjectMPresetNames() {
  return allPresetNames;
}
const FADE_DURATION_MS = 350;
const ProjectMCanvas = React.forwardRef(
  ({ onReady, onPresetChange, visible = true }, ref) => {
    const containerRef = reactExports.useRef(null);
    const canvasRef = reactExports.useRef(null);
    const engineRef = reactExports.useRef(null);
    const rafRef = reactExports.useRef(0);
    const currentIdxRef = reactExports.useRef(0);
    const visibleRef = reactExports.useRef(visible);
    const [ready, setReady] = reactExports.useState(false);
    const [error, setError] = reactExports.useState(null);
    const audioBusRef = reactExports.useRef(null);
    const fadeRef = reactExports.useRef(null);
    const fadeTimerRef = reactExports.useRef(void 0);
    const presetLoadTimeRef = reactExports.useRef(0);
    const doLoadPresetRef = reactExports.useRef(void 0);
    reactExports.useEffect(() => {
      visibleRef.current = visible;
    }, [visible]);
    reactExports.useEffect(() => {
      let cancelled = false;
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!canvas.id) canvas.id = "projectm-canvas";
      const doInit = async () => {
        try {
          await loadManifest();
          const engine = new ProjectMEngine();
          const cw = canvas.clientWidth;
          const ch = canvas.clientHeight;
          const w = Math.round(Math.max(cw, 320) * devicePixelRatio);
          const h = Math.round(Math.max(ch, 240) * devicePixelRatio);
          canvas.width = w;
          canvas.height = h;
          await engine.init(canvas, w, h);
          if (cancelled) {
            engine.destroy();
            return;
          }
          engineRef.current = engine;
          const bus = new AudioDataBus();
          bus.enable();
          audioBusRef.current = bus;
          const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
          if (names.length > 0) {
            const startIdx = Math.floor(Math.random() * names.length);
            const content = await fetchPresetContent(names[startIdx]);
            if (content && !cancelled) {
              engine.loadPresetData(content, false);
              currentIdxRef.current = startIdx;
              presetLoadTimeRef.current = performance.now();
              onPresetChange == null ? void 0 : onPresetChange(startIdx, names[startIdx]);
            }
          }
          setReady(true);
          onReady == null ? void 0 : onReady(names.length);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      };
      const handleContextLost = (e) => {
        var _a, _b;
        e.preventDefault();
        console.warn("[ProjectM] WebGL context lost — waiting for restore");
        (_a = audioBusRef.current) == null ? void 0 : _a.disable();
        audioBusRef.current = null;
        (_b = engineRef.current) == null ? void 0 : _b.destroy();
        engineRef.current = null;
        setReady(false);
      };
      const handleContextRestored = () => {
        console.warn("[ProjectM] WebGL context restored — re-initializing");
        doInit();
      };
      canvas.addEventListener("webglcontextlost", handleContextLost);
      canvas.addEventListener("webglcontextrestored", handleContextRestored);
      const raf = requestAnimationFrame(() => {
        if (!cancelled) doInit();
      });
      return () => {
        var _a, _b;
        cancelled = true;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(rafRef.current);
        if (fadeTimerRef.current !== void 0) clearTimeout(fadeTimerRef.current);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        (_a = audioBusRef.current) == null ? void 0 : _a.disable();
        audioBusRef.current = null;
        (_b = engineRef.current) == null ? void 0 : _b.destroy();
        engineRef.current = null;
      };
    }, []);
    const doLoadPreset = reactExports.useCallback(async (idx, smooth = true) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      if (!engineRef.current || names.length === 0) return;
      const wrappedIdx = (idx % names.length + names.length) % names.length;
      const name = names[wrappedIdx];
      const content = await fetchPresetContent(name);
      if (!content || !engineRef.current) return;
      if (fadeTimerRef.current !== void 0) clearTimeout(fadeTimerRef.current);
      if (smooth) {
        presetLoadTimeRef.current = performance.now();
        engineRef.current.loadPresetData(content, true);
        currentIdxRef.current = wrappedIdx;
        onPresetChange == null ? void 0 : onPresetChange(wrappedIdx, name);
      } else {
        const fade = fadeRef.current;
        if (fade) {
          fade.style.transition = `opacity ${FADE_DURATION_MS}ms ease-in`;
          fade.style.opacity = "1";
          fadeTimerRef.current = setTimeout(() => {
            var _a;
            presetLoadTimeRef.current = performance.now();
            (_a = engineRef.current) == null ? void 0 : _a.loadPresetData(content, false);
            currentIdxRef.current = wrappedIdx;
            onPresetChange == null ? void 0 : onPresetChange(wrappedIdx, name);
            requestAnimationFrame(() => {
              if (fade) {
                fade.style.transition = `opacity ${FADE_DURATION_MS}ms ease-out`;
                fade.style.opacity = "0";
              }
            });
            fadeTimerRef.current = void 0;
          }, FADE_DURATION_MS);
        } else {
          presetLoadTimeRef.current = performance.now();
          engineRef.current.loadPresetData(content, false);
          currentIdxRef.current = wrappedIdx;
          onPresetChange == null ? void 0 : onPresetChange(wrappedIdx, name);
        }
      }
      const nextIdx = Math.floor(Math.random() * names.length);
      fetchPresetContent(names[nextIdx]);
    }, [onPresetChange]);
    reactExports.useEffect(() => {
      doLoadPresetRef.current = doLoadPreset;
    }, [doLoadPreset]);
    const doLoadPresetByName = reactExports.useCallback(async (name, smooth = true) => {
      const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
      const idx = names.indexOf(name);
      if (idx >= 0) {
        await doLoadPreset(idx, smooth);
      }
    }, [doLoadPreset]);
    reactExports.useEffect(() => {
      if (!ready || !visible) return;
      let sampleCanvas = null;
      let sampleCtx = null;
      try {
        sampleCanvas = new OffscreenCanvas(1, 1);
        sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      } catch {
      }
      let frameCount = 0;
      let prevHash1 = 0;
      let prevHash2 = 0;
      let alternatingCount = 0;
      const render = () => {
        var _a;
        if (!visibleRef.current) return;
        const engine = engineRef.current;
        const bus = audioBusRef.current;
        const canvas = canvasRef.current;
        if (engine && bus) {
          const frame = bus.update();
          const waveform = frame.waveform;
          const stereo = new Float32Array(waveform.length * 2);
          for (let i = 0; i < waveform.length; i++) {
            stereo[i * 2] = waveform[i];
            stereo[i * 2 + 1] = waveform[i];
          }
          engine.pushAudio(stereo, waveform.length);
          engine.renderFrame();
          frameCount++;
          if (sampleCtx && canvas && (frameCount & 63) === 0) {
            const timeSinceLoad = performance.now() - presetLoadTimeRef.current;
            if (timeSinceLoad > 5e3) {
              sampleCtx.drawImage(canvas, canvas.width >> 1, canvas.height >> 1, 1, 1, 0, 0, 1, 1);
              const px = sampleCtx.getImageData(0, 0, 1, 1).data;
              const hash = px[0] << 16 | px[1] << 8 | px[2];
              if (hash === prevHash1 || hash === prevHash2) {
                alternatingCount++;
              } else {
                prevHash2 = prevHash1;
                prevHash1 = hash;
                alternatingCount = 0;
              }
              if (alternatingCount >= 12) {
                alternatingCount = 0;
                prevHash1 = 0;
                prevHash2 = 0;
                const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
                if (names.length > 0) {
                  (_a = doLoadPresetRef.current) == null ? void 0 : _a.call(doLoadPresetRef, Math.floor(Math.random() * names.length), false);
                }
              }
            }
          }
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [ready, visible]);
    reactExports.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !engineRef.current) return;
      const handleResize = () => {
        var _a;
        const w = Math.round(canvas.clientWidth * devicePixelRatio);
        const h = Math.round(canvas.clientHeight * devicePixelRatio);
        canvas.width = w;
        canvas.height = h;
        (_a = engineRef.current) == null ? void 0 : _a.setSize(w, h);
      };
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [ready]);
    React.useImperativeHandle(ref, () => ({
      // Always use smooth=false (CSS fade-to-black) — projectM's native soft-cut
      // transition shader causes alternating-frame artifacts in WebGL2.
      nextPreset: () => {
        doLoadPreset(currentIdxRef.current + 1, false);
      },
      randomPreset: () => {
        const names = allPresetNames ?? Object.keys(BUILTIN_PRESETS);
        doLoadPreset(Math.floor(Math.random() * names.length), false);
      },
      loadPresetByIndex: (idx) => {
        doLoadPreset(idx, false);
      },
      loadPresetByName: (name, blendOrSmooth) => {
        doLoadPresetByName(name, blendOrSmooth !== false);
      },
      getPresetNames: () => allPresetNames ?? Object.keys(BUILTIN_PRESETS),
      getCurrentIndex: () => currentIdxRef.current
    }), [doLoadPreset, doLoadPresetByName]);
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "w-full h-full relative", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: canvasRef,
          className: "w-full h-full block",
          style: { imageRendering: "auto" }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
          lineNumber: 389,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          ref: fadeRef,
          className: "absolute inset-0 bg-black pointer-events-none",
          style: { opacity: 0 }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
          lineNumber: 395,
          columnNumber: 9
        },
        void 0
      ),
      !ready && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center bg-black", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-white/60 font-mono text-sm", children: "Loading projectM (WASM)..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
        lineNumber: 402,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
        lineNumber: 401,
        columnNumber: 11
      }, void 0),
      error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center bg-black", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-red-400/80 font-mono text-sm text-center px-8", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "projectM failed to load" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
          lineNumber: 408,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs mt-1 text-white/40", children: error }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
          lineNumber: 409,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs mt-2 text-white/30", children: "Falling back to Butterchurn is recommended" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
          lineNumber: 410,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
        lineNumber: 407,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
        lineNumber: 406,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/ProjectMCanvas.tsx",
      lineNumber: 388,
      columnNumber: 7
    }, void 0);
  }
);
ProjectMCanvas.displayName = "ProjectMCanvas";
export {
  ProjectMCanvas,
  getProjectMManifest,
  getProjectMPresetNames,
  loadManifest as loadProjectMManifest
};
