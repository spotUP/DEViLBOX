import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
const FT2 = {
  VOLUME: 0,
  PANNING: 1,
  FINETUNE: 2,
  RELATIVE_NOTE: 3,
  LOOP_TYPE: 4,
  FADEOUT: 5,
  VIB_TYPE: 6,
  VIB_SWEEP: 7,
  VIB_DEPTH: 8,
  VIB_RATE: 9,
  VOL_ENV_ON: 10,
  VOL_ENV_SUSTAIN: 11,
  VOL_ENV_LOOP_START: 12,
  VOL_ENV_LOOP_END: 13,
  VOL_ENV_NUM_POINTS: 14,
  PAN_ENV_ON: 15,
  PAN_ENV_SUSTAIN: 16,
  PAN_ENV_LOOP_START: 17,
  PAN_ENV_LOOP_END: 18,
  PAN_ENV_NUM_POINTS: 19
};
const FT2_SCREEN_W = 632;
const FT2_SCREEN_H = 400;
const VIB_TYPES = ["sine", "square", "rampDown", "rampUp"];
function blitFramebuffer(mod, ctx, imgData) {
  const fbPtr = mod._ft2_sampled_get_fb();
  const src = mod.HEAPU8.subarray(fbPtr, fbPtr + FT2_SCREEN_W * FT2_SCREEN_H * 4);
  const dst = imgData.data;
  for (let i = 0; i < FT2_SCREEN_W * FT2_SCREEN_H; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
function configToBuffer(inst) {
  var _a, _b, _c, _d, _e;
  const buf = new Uint8Array(126);
  const sample = inst.sample;
  const mod = (_a = inst.metadata) == null ? void 0 : _a.modPlayback;
  const volEnv = (_b = inst.metadata) == null ? void 0 : _b.originalEnvelope;
  const panEnv = (_c = inst.metadata) == null ? void 0 : _c.panningEnvelope;
  const vib = (_d = inst.metadata) == null ? void 0 : _d.autoVibrato;
  buf[0] = (mod == null ? void 0 : mod.defaultVolume) ?? 64;
  buf[1] = (mod == null ? void 0 : mod.panning) ?? 128;
  const ft = (mod == null ? void 0 : mod.finetune) ?? 0;
  buf[2] = ft & 255;
  buf[3] = ft >> 8 & 255;
  buf[4] = (mod == null ? void 0 : mod.relativeNote) ?? 0;
  const lt = sample == null ? void 0 : sample.loopType;
  buf[5] = lt === "forward" ? 1 : lt === "pingpong" ? 2 : 0;
  const ls = (sample == null ? void 0 : sample.loopStart) ?? 0;
  buf[6] = ls & 255;
  buf[7] = ls >> 8 & 255;
  buf[8] = ls >> 16 & 255;
  buf[9] = ls >> 24 & 255;
  const ll = Math.max(0, ((sample == null ? void 0 : sample.loopEnd) ?? 0) - ((sample == null ? void 0 : sample.loopStart) ?? 0));
  buf[10] = ll & 255;
  buf[11] = ll >> 8 & 255;
  buf[12] = ll >> 16 & 255;
  buf[13] = ll >> 24 & 255;
  const fo = ((_e = inst.metadata) == null ? void 0 : _e.fadeout) ?? 0;
  buf[14] = fo & 255;
  buf[15] = fo >> 8 & 255;
  buf[16] = VIB_TYPES.indexOf((vib == null ? void 0 : vib.type) ?? "sine");
  buf[17] = (vib == null ? void 0 : vib.sweep) ?? 0;
  buf[18] = (vib == null ? void 0 : vib.depth) ?? 0;
  buf[19] = (vib == null ? void 0 : vib.rate) ?? 0;
  const volPts = (volEnv == null ? void 0 : volEnv.points) ?? [{ tick: 0, value: 64 }, { tick: 325, value: 0 }];
  buf[20] = (volEnv == null ? void 0 : volEnv.enabled) ? 1 : 0;
  buf[21] = (volEnv == null ? void 0 : volEnv.sustainPoint) != null ? volEnv.sustainPoint : 255;
  buf[22] = (volEnv == null ? void 0 : volEnv.loopStartPoint) != null ? volEnv.loopStartPoint : 255;
  buf[23] = (volEnv == null ? void 0 : volEnv.loopEndPoint) != null ? volEnv.loopEndPoint : 255;
  for (let i = 0; i < 12; i++) {
    const off = 24 + i * 4;
    if (i < volPts.length) {
      const t = volPts[i].tick;
      const v = volPts[i].value;
      buf[off] = t & 255;
      buf[off + 1] = t >> 8 & 255;
      buf[off + 2] = v & 255;
      buf[off + 3] = v >> 8 & 255;
    }
  }
  const panPts = (panEnv == null ? void 0 : panEnv.points) ?? [{ tick: 0, value: 32 }, { tick: 325, value: 32 }];
  buf[72] = (panEnv == null ? void 0 : panEnv.enabled) ? 1 : 0;
  buf[73] = (panEnv == null ? void 0 : panEnv.sustainPoint) != null ? panEnv.sustainPoint : 255;
  buf[74] = (panEnv == null ? void 0 : panEnv.loopStartPoint) != null ? panEnv.loopStartPoint : 255;
  buf[75] = (panEnv == null ? void 0 : panEnv.loopEndPoint) != null ? panEnv.loopEndPoint : 255;
  for (let i = 0; i < 12; i++) {
    const off = 76 + i * 4;
    if (i < panPts.length) {
      const t = panPts[i].tick;
      const v = panPts[i].value;
      buf[off] = t & 255;
      buf[off + 1] = t >> 8 & 255;
      buf[off + 2] = v & 255;
      buf[off + 3] = v >> 8 & 255;
    }
  }
  buf[124] = volPts.length;
  buf[125] = panPts.length;
  return buf;
}
async function decodePCM(instrument) {
  const sample = instrument.sample;
  if (!sample) return null;
  let audioBuffer = null;
  try {
    if (sample.audioBuffer && sample.audioBuffer.byteLength > 0) {
      const ctx = new OfflineAudioContext(1, 1, 44100);
      audioBuffer = await ctx.decodeAudioData(sample.audioBuffer.slice(0));
    } else if (sample.url) {
      const resp = await fetch(sample.url);
      const arrayBuf = await resp.arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100);
      audioBuffer = await ctx.decodeAudioData(arrayBuf);
    }
  } catch {
    return null;
  }
  if (!audioBuffer) return null;
  const float32 = audioBuffer.getChannelData(0);
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let v = Math.round(float32[i] * 32767);
    if (v > 32767) v = 32767;
    if (v < -32768) v = -32768;
    int16[i] = v;
  }
  return { pcm: int16, sampleRate: audioBuffer.sampleRate };
}
function updateVolEnvPoint(inst, index, tick, value) {
  var _a;
  const env = (_a = inst.metadata) == null ? void 0 : _a.originalEnvelope;
  const points = [...(env == null ? void 0 : env.points) ?? []];
  while (points.length <= index) points.push({ tick: 0, value: 0 });
  points[index] = { tick, value };
  return {
    metadata: {
      ...inst.metadata,
      originalEnvelope: { ...env, points }
    }
  };
}
function updatePanEnvPoint(inst, index, tick, value) {
  var _a;
  const env = (_a = inst.metadata) == null ? void 0 : _a.panningEnvelope;
  const points = [...(env == null ? void 0 : env.points) ?? []];
  while (points.length <= index) points.push({ tick: 0, value: 32 });
  points[index] = { tick, value };
  return {
    metadata: {
      ...inst.metadata,
      panningEnvelope: { ...env, points }
    }
  };
}
function updateEnvFlags(inst, envKey, enabled, sustain, loopStart, loopEnd, numPoints) {
  var _a;
  const env = (_a = inst.metadata) == null ? void 0 : _a[envKey];
  const points = [...(env == null ? void 0 : env.points) ?? []];
  while (points.length > numPoints) points.pop();
  while (points.length < numPoints) {
    const lastTick = points.length > 0 ? points[points.length - 1].tick + 10 : 0;
    points.push({ tick: lastTick, value: envKey === "originalEnvelope" ? 64 : 32 });
  }
  return {
    metadata: {
      ...inst.metadata,
      [envKey]: {
        ...env,
        enabled: enabled !== 0,
        points,
        sustainPoint: sustain === 255 || sustain < 0 ? null : sustain,
        loopStartPoint: loopStart === 255 || loopStart < 0 ? null : loopStart,
        loopEndPoint: loopEnd === 255 || loopEnd < 0 ? null : loopEnd
      }
    }
  };
}
const FT2Hardware = ({ instrument, onChange }) => {
  const configRef = reactExports.useRef(instrument);
  const moduleRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const onChangeRef = reactExports.useRef(onChange);
  const sampleRateRef = reactExports.useRef(44100);
  const audioCtxRef = reactExports.useRef(null);
  const currentSourceRef = reactExports.useRef(null);
  const playStartTimeRef = reactExports.useRef(0);
  const playDurationRef = reactExports.useRef(0);
  const playLoopingRef = reactExports.useRef(false);
  const playActiveRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    configRef.current = instrument;
  }, [instrument]);
  reactExports.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  reactExports.useEffect(() => {
    const mod = moduleRef.current;
    if (!mod || !loaded) return;
    const buf = configToBuffer(instrument);
    const ptr = mod._malloc(buf.length);
    if (!ptr) return;
    mod.HEAPU8.set(buf, ptr);
    mod._ft2_sampled_load_config(ptr, buf.length);
    mod._free(ptr);
  }, [instrument, loaded]);
  const canvasCoords = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [
      Math.floor((e.clientX - rect.left) * scaleX),
      Math.floor((e.clientY - rect.top) * scaleY)
    ];
  };
  reactExports.useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;
    let mod = null;
    const eventCleanups = [];
    async function init() {
      try {
        const factory = await new Promise((resolve, reject) => {
          const existing = window.createFT2SampEd;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/ft2/FT2SampEd.js";
          script.onload = () => {
            const fn = window.createFT2SampEd;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createFT2SampEd not found after script load"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load FT2SampEd.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        mod = await factory({});
        moduleRef.current = mod;
        mod.onParamChange = (paramId, value) => {
          var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v;
          const inst = configRef.current;
          const updates = {};
          switch (paramId) {
            case FT2.VOLUME:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...(_a = inst.metadata) == null ? void 0 : _a.modPlayback,
                  usePeriodPlayback: ((_c = (_b = inst.metadata) == null ? void 0 : _b.modPlayback) == null ? void 0 : _c.usePeriodPlayback) ?? false,
                  periodMultiplier: ((_e = (_d = inst.metadata) == null ? void 0 : _d.modPlayback) == null ? void 0 : _e.periodMultiplier) ?? 3546895,
                  finetune: ((_g = (_f = inst.metadata) == null ? void 0 : _f.modPlayback) == null ? void 0 : _g.finetune) ?? 0,
                  defaultVolume: value
                }
              };
              break;
            case FT2.PANNING:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...(_h = inst.metadata) == null ? void 0 : _h.modPlayback,
                  usePeriodPlayback: ((_j = (_i = inst.metadata) == null ? void 0 : _i.modPlayback) == null ? void 0 : _j.usePeriodPlayback) ?? false,
                  periodMultiplier: ((_l = (_k = inst.metadata) == null ? void 0 : _k.modPlayback) == null ? void 0 : _l.periodMultiplier) ?? 3546895,
                  finetune: ((_n = (_m = inst.metadata) == null ? void 0 : _m.modPlayback) == null ? void 0 : _n.finetune) ?? 0,
                  panning: value
                }
              };
              break;
            case FT2.FINETUNE:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...(_o = inst.metadata) == null ? void 0 : _o.modPlayback,
                  usePeriodPlayback: ((_q = (_p = inst.metadata) == null ? void 0 : _p.modPlayback) == null ? void 0 : _q.usePeriodPlayback) ?? false,
                  periodMultiplier: ((_s = (_r = inst.metadata) == null ? void 0 : _r.modPlayback) == null ? void 0 : _s.periodMultiplier) ?? 3546895,
                  finetune: value,
                  defaultVolume: ((_u = (_t = inst.metadata) == null ? void 0 : _t.modPlayback) == null ? void 0 : _u.defaultVolume) ?? 64
                }
              };
              break;
            case FT2.FADEOUT:
              updates.metadata = {
                ...inst.metadata,
                fadeout: value
              };
              break;
            case FT2.VIB_TYPE:
            case FT2.VIB_SWEEP:
            case FT2.VIB_DEPTH:
            case FT2.VIB_RATE: {
              const curVib = ((_v = inst.metadata) == null ? void 0 : _v.autoVibrato) ?? { type: "sine", sweep: 0, depth: 0, rate: 0 };
              const newVib = { ...curVib };
              if (paramId === FT2.VIB_TYPE) newVib.type = VIB_TYPES[value] ?? "sine";
              if (paramId === FT2.VIB_SWEEP) newVib.sweep = value;
              if (paramId === FT2.VIB_DEPTH) newVib.depth = value;
              if (paramId === FT2.VIB_RATE) newVib.rate = value;
              updates.metadata = { ...inst.metadata, autoVibrato: newVib };
              break;
            }
          }
          if (Object.keys(updates).length > 0) {
            configRef.current = { ...inst, ...updates };
            onChangeRef.current(updates);
          }
        };
        mod.onLoopChange = (loopStart, loopLength, loopType) => {
          const inst = configRef.current;
          const lt = loopType === 0 ? "off" : loopType === 1 ? "forward" : "pingpong";
          const updates = {
            sample: {
              ...inst.sample,
              loopStart,
              loopEnd: loopStart + loopLength,
              loopType: lt,
              loop: loopType > 0
            }
          };
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };
        mod.onVolEnvChange = (index, tick, value) => {
          const inst = configRef.current;
          const updates = updateVolEnvPoint(inst, index, tick, value);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };
        mod.onPanEnvChange = (index, tick, value) => {
          const inst = configRef.current;
          const updates = updatePanEnvPoint(inst, index, tick, value);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };
        mod.onVolEnvFlagsChange = (enabled, sustain, loopStart, loopEnd, numPoints) => {
          const inst = configRef.current;
          const updates = updateEnvFlags(inst, "originalEnvelope", enabled, sustain, loopStart, loopEnd, numPoints);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };
        mod.onPanEnvFlagsChange = (enabled, sustain, loopStart, loopEnd, numPoints) => {
          const inst = configRef.current;
          const updates = updateEnvFlags(inst, "panningEnvelope", enabled, sustain, loopStart, loopEnd, numPoints);
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };
        mod.onPlaySample = (ptr2, len, loopStart, loopLength, loopType, is16bit) => {
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
          const ctx2 = audioCtxRef.current;
          if (currentSourceRef.current) {
            try {
              currentSourceRef.current.stop();
            } catch {
            }
            currentSourceRef.current = null;
          }
          if (len <= 0) {
            playActiveRef.current = false;
            return;
          }
          const sr = sampleRateRef.current;
          const audioBuf = ctx2.createBuffer(1, len, sr);
          const chData = audioBuf.getChannelData(0);
          if (is16bit) {
            const raw = mod.HEAP16.subarray(ptr2 >> 1, (ptr2 >> 1) + len);
            for (let i = 0; i < len; i++) chData[i] = raw[i] / 32768;
          } else {
            const raw = new Int8Array(mod.HEAPU8.buffer, ptr2, len);
            for (let i = 0; i < len; i++) chData[i] = raw[i] / 128;
          }
          const src = ctx2.createBufferSource();
          src.buffer = audioBuf;
          const isLooping = loopType !== 0 && loopLength > 2;
          if (isLooping) {
            src.loop = true;
            src.loopStart = loopStart / sr;
            src.loopEnd = (loopStart + loopLength) / sr;
          }
          src.connect(ctx2.destination);
          src.start();
          currentSourceRef.current = src;
          playStartTimeRef.current = ctx2.currentTime;
          playDurationRef.current = len / sr;
          playLoopingRef.current = isLooping;
          playActiveRef.current = true;
          src.onended = () => {
            if (currentSourceRef.current === src) {
              currentSourceRef.current = null;
              playActiveRef.current = false;
            }
          };
        };
        mod.onStopSample = () => {
          if (currentSourceRef.current) {
            try {
              currentSourceRef.current.stop();
            } catch {
            }
            currentSourceRef.current = null;
          }
          playActiveRef.current = false;
        };
        mod._ft2_sampled_init(FT2_SCREEN_W, FT2_SCREEN_H);
        mod._ft2_sampled_start();
        const m = mod;
        const onMouseDown = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_mouse_down(cx, cy);
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_mouse_up(cx, cy);
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_mouse_move(cx, cy);
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._ft2_sampled_on_wheel(Math.sign(e.deltaY), cx, cy);
        };
        const onKeyDown = (e) => {
          const navKeys = [37, 39];
          if (navKeys.includes(e.keyCode)) {
            e.preventDefault();
            m._ft2_sampled_on_key_down(e.keyCode);
          }
        };
        canvas.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("pointerdown", onMouseDown);
        document.addEventListener("pointerup", onMouseUp);
        document.addEventListener("pointermove", onMouseMove);
        canvas.style.touchAction = "none";
        canvas.addEventListener("wheel", onWheel, { passive: false });
        canvas.addEventListener("keydown", onKeyDown);
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("pointerdown", onMouseDown),
          () => document.removeEventListener("pointerup", onMouseUp),
          () => document.removeEventListener("pointermove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel),
          () => canvas.removeEventListener("keydown", onKeyDown)
        );
        const buf = configToBuffer(configRef.current);
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          mod._ft2_sampled_load_config(ptr, buf.length);
          mod._free(ptr);
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setError("Canvas 2D context unavailable");
          return;
        }
        const imgData = ctx.createImageData(FT2_SCREEN_W, FT2_SCREEN_H);
        let rafId = 0;
        const WAVE_X = 0, WAVE_W = 632, WAVE_Y = 174, WAVE_H = 154;
        const renderLoop = () => {
          if (cancelled) return;
          if (m._ft2_sampled_tick) m._ft2_sampled_tick();
          blitFramebuffer(m, ctx, imgData);
          if (playActiveRef.current && audioCtxRef.current && playDurationRef.current > 0) {
            const elapsed = audioCtxRef.current.currentTime - playStartTimeRef.current;
            const dur = playDurationRef.current;
            let progress;
            if (playLoopingRef.current) {
              progress = elapsed % dur / dur;
            } else {
              progress = Math.min(elapsed / dur, 1);
              if (progress >= 1) playActiveRef.current = false;
            }
            if (playActiveRef.current) {
              const px = Math.round(WAVE_X + progress * WAVE_W);
              ctx.strokeStyle = "#fbbf24";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(px, WAVE_Y);
              ctx.lineTo(px, WAVE_Y + WAVE_H);
              ctx.stroke();
            }
          }
          rafId = requestAnimationFrame(renderLoop);
        };
        rafId = requestAnimationFrame(renderLoop);
        eventCleanups.push(() => cancelAnimationFrame(rafId));
        if (!cancelled) setLoaded(true);
        const decoded = await decodePCM(configRef.current);
        if (decoded && !cancelled && mod) {
          sampleRateRef.current = decoded.sampleRate;
          const pcm = decoded.pcm;
          const pcmPtr = mod._malloc(pcm.length * 2);
          if (pcmPtr) {
            mod.HEAP16.set(pcm, pcmPtr >> 1);
            mod._ft2_sampled_load_pcm(pcmPtr, pcm.length);
            mod._free(pcmPtr);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    init();
    return () => {
      cancelled = true;
      eventCleanups.forEach((fn) => fn());
      if (mod) {
        try {
          mod._ft2_sampled_shutdown();
        } catch {
        }
      }
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch {
        }
        currentSourceRef.current = null;
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {
        }
        audioCtxRef.current = null;
      }
      moduleRef.current = null;
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "ft2-hardware-container flex flex-col items-center", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "canvas",
      {
        ref: canvasRef,
        width: FT2_SCREEN_W,
        height: FT2_SCREEN_H,
        tabIndex: 0,
        style: {
          width: "100%",
          maxWidth: 632,
          height: "auto",
          imageRendering: "pixelated",
          display: "block"
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FT2Hardware.tsx",
        lineNumber: 695,
        columnNumber: 7
      },
      void 0
    ),
    !loaded && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-secondary text-sm mt-2", children: "Loading FT2 instrument editor..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FT2Hardware.tsx",
      lineNumber: 709,
      columnNumber: 9
    }, void 0),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-red-400 text-sm mt-2 text-center", children: [
      "Failed to load FT2 hardware UI: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FT2Hardware.tsx",
      lineNumber: 714,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/FT2Hardware.tsx",
    lineNumber: 694,
    columnNumber: 5
  }, void 0);
};
export {
  FT2Hardware
};
