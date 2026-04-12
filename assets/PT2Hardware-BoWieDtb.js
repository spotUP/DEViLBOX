import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
const PT2 = {
  VOLUME: 0,
  FINETUNE: 1,
  LOOP_START_HI: 2,
  LOOP_START_LO: 3,
  LOOP_LENGTH_HI: 4,
  LOOP_LENGTH_LO: 5,
  LOOP_TYPE: 6
};
const SCREEN_W = 320;
const SCREEN_H = 255;
const SAMPLER_Y = 121;
const SAMPLER_H = SCREEN_H - SAMPLER_Y;
function blitFramebuffer(mod, ctx, imgData) {
  const fbPtr = mod._pt2_sampled_get_fb();
  const srcOffset = fbPtr + SAMPLER_Y * SCREEN_W * 4;
  const src = mod.HEAPU8.subarray(srcOffset, srcOffset + SCREEN_W * SAMPLER_H * 4);
  const dst = imgData.data;
  for (let i = 0; i < SCREEN_W * SAMPLER_H; i++) {
    const off = i * 4;
    dst[off] = src[off + 2];
    dst[off + 1] = src[off + 1];
    dst[off + 2] = src[off];
    dst[off + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
function configToBuffer(inst) {
  var _a;
  const buf = new Uint8Array(11);
  const sample = inst.sample;
  const mod = (_a = inst.metadata) == null ? void 0 : _a.modPlayback;
  buf[0] = (mod == null ? void 0 : mod.defaultVolume) ?? 64;
  buf[1] = ((mod == null ? void 0 : mod.finetune) ?? 0) + 8 & 15;
  const loopStart = (sample == null ? void 0 : sample.loopStart) ?? 0;
  const loopLength = ((sample == null ? void 0 : sample.loopEnd) ?? 0) - ((sample == null ? void 0 : sample.loopStart) ?? 0);
  buf[2] = loopStart & 255;
  buf[3] = loopStart >> 8 & 255;
  buf[4] = loopStart >> 16 & 255;
  buf[5] = loopStart >> 24 & 255;
  const ll = loopLength > 0 ? loopLength : 0;
  buf[6] = ll & 255;
  buf[7] = ll >> 8 & 255;
  buf[8] = ll >> 16 & 255;
  buf[9] = ll >> 24 & 255;
  const lt = sample == null ? void 0 : sample.loopType;
  buf[10] = lt === "forward" || lt === "pingpong" ? 1 : 0;
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
  const int8 = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let v = Math.round(float32[i] * 127);
    if (v > 127) v = 127;
    if (v < -128) v = -128;
    int8[i] = v;
  }
  return { pcm: int8, sampleRate: audioBuffer.sampleRate };
}
const PT2Hardware = ({ instrument, onChange }) => {
  const configRef = reactExports.useRef(instrument);
  const moduleRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const onChangeRef = reactExports.useRef(onChange);
  const pcmLoadedRef = reactExports.useRef(false);
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
    mod._pt2_sampled_load_config(ptr, buf.length);
    mod._free(ptr);
  }, [instrument, loaded]);
  const canvasCoords = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [
      Math.floor((e.clientX - rect.left) * scaleX),
      Math.floor((e.clientY - rect.top) * scaleY) + SAMPLER_Y
      // offset to absolute FB coords
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
          const existing = window.createPT2SampEd;
          if (typeof existing === "function") {
            resolve(existing);
            return;
          }
          const script = document.createElement("script");
          script.src = "/pt2/PT2SampEd.js";
          script.onload = () => {
            const fn = window.createPT2SampEd;
            if (typeof fn === "function") {
              resolve(fn);
            } else {
              reject(new Error("createPT2SampEd not found after script load"));
            }
          };
          script.onerror = () => reject(new Error("Failed to load PT2SampEd.js"));
          document.head.appendChild(script);
        });
        if (cancelled) return;
        mod = await factory({});
        moduleRef.current = mod;
        mod.onParamChange = (paramId, value) => {
          var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
          const inst = configRef.current;
          const updates = {};
          switch (paramId) {
            case PT2.VOLUME:
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
            case PT2.FINETUNE:
              updates.metadata = {
                ...inst.metadata,
                modPlayback: {
                  ...(_h = inst.metadata) == null ? void 0 : _h.modPlayback,
                  usePeriodPlayback: ((_j = (_i = inst.metadata) == null ? void 0 : _i.modPlayback) == null ? void 0 : _j.usePeriodPlayback) ?? false,
                  periodMultiplier: ((_l = (_k = inst.metadata) == null ? void 0 : _k.modPlayback) == null ? void 0 : _l.periodMultiplier) ?? 3546895,
                  finetune: value > 7 ? value - 16 : value,
                  // 0-15 → -8..+7
                  defaultVolume: ((_n = (_m = inst.metadata) == null ? void 0 : _m.modPlayback) == null ? void 0 : _n.defaultVolume) ?? 64
                }
              };
              break;
          }
          if (Object.keys(updates).length > 0) {
            configRef.current = { ...inst, ...updates };
            onChangeRef.current(updates);
          }
        };
        mod.onLoopChange = (loopStart, loopLength, loopType) => {
          const inst = configRef.current;
          const loopEnd = loopStart + loopLength;
          const lt = loopType === 0 ? "off" : "forward";
          const updates = {
            sample: {
              ...inst.sample,
              loopStart,
              loopEnd,
              loopType: lt,
              loop: loopType > 0
            }
          };
          configRef.current = { ...inst, ...updates };
          onChangeRef.current(updates);
        };
        mod.onPlaySample = (ptr2, len, loopStart, loopLength, loopType) => {
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
          const raw = new Int8Array(mod.HEAP8.buffer, ptr2, len);
          const sr = sampleRateRef.current;
          const buf2 = ctx2.createBuffer(1, len, sr);
          const ch = buf2.getChannelData(0);
          for (let i = 0; i < len; i++) ch[i] = raw[i] / 128;
          const src = ctx2.createBufferSource();
          src.buffer = buf2;
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
        mod._pt2_sampled_init(SCREEN_W, SCREEN_H);
        mod._pt2_sampled_start();
        const m = mod;
        const onMouseDown = (e) => {
          e.preventDefault();
          canvas.focus();
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_mouse_down(cx, cy);
        };
        const onMouseUp = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_mouse_up(cx, cy);
        };
        const onMouseMove = (e) => {
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_mouse_move(cx, cy);
        };
        const onWheel = (e) => {
          e.preventDefault();
          const [cx, cy] = canvasCoords(canvas, e);
          m._pt2_sampled_on_wheel(Math.sign(e.deltaY), cx, cy);
        };
        const onKeyDown = (e) => {
          e.preventDefault();
          m._pt2_sampled_on_key_down(e.keyCode);
        };
        const onKeyUp = (e) => {
          if (e.keyCode === 16 || e.keyCode === 17 || e.keyCode === 18) {
            m._pt2_sampled_on_key_down(-e.keyCode);
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
        canvas.addEventListener("keyup", onKeyUp);
        eventCleanups.push(
          () => canvas.removeEventListener("mousedown", onMouseDown),
          () => document.removeEventListener("mouseup", onMouseUp),
          () => document.removeEventListener("mousemove", onMouseMove),
          () => canvas.removeEventListener("pointerdown", onMouseDown),
          () => document.removeEventListener("pointerup", onMouseUp),
          () => document.removeEventListener("pointermove", onMouseMove),
          () => canvas.removeEventListener("wheel", onWheel),
          () => canvas.removeEventListener("keydown", onKeyDown),
          () => canvas.removeEventListener("keyup", onKeyUp)
        );
        const buf = configToBuffer(configRef.current);
        const ptr = mod._malloc(buf.length);
        if (ptr) {
          mod.HEAPU8.set(buf, ptr);
          mod._pt2_sampled_load_config(ptr, buf.length);
          mod._free(ptr);
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setError("Canvas 2D context unavailable");
          return;
        }
        const imgData = ctx.createImageData(SCREEN_W, SAMPLER_H);
        let rafId = 0;
        const WAVE_X = 3, WAVE_W = 314, WAVE_Y = 138 - SAMPLER_Y, WAVE_H = 64;
        const renderLoop = () => {
          if (cancelled) return;
          if (m._pt2_sampled_tick) m._pt2_sampled_tick();
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
          const { pcm, sampleRate } = decoded;
          sampleRateRef.current = sampleRate;
          const pcmPtr = mod._malloc(pcm.length);
          if (pcmPtr) {
            mod.HEAP8.set(pcm, pcmPtr);
            mod._pt2_sampled_load_pcm(pcmPtr, pcm.length);
            mod._free(pcmPtr);
            pcmLoadedRef.current = true;
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
      if (mod) {
        try {
          mod._pt2_sampled_shutdown();
        } catch {
        }
      }
      moduleRef.current = null;
      pcmLoadedRef.current = false;
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pt2-hardware-container flex flex-col items-center", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "canvas",
      {
        ref: canvasRef,
        width: SCREEN_W,
        height: SAMPLER_H,
        tabIndex: 0,
        style: {
          width: "100%",
          maxWidth: 640,
          height: "auto",
          imageRendering: "pixelated",
          display: "block"
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/PT2Hardware.tsx",
        lineNumber: 499,
        columnNumber: 7
      },
      void 0
    ),
    !loaded && !error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-secondary text-sm mt-2", children: "Loading PT2 sample editor..." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/PT2Hardware.tsx",
      lineNumber: 513,
      columnNumber: 9
    }, void 0),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-red-400 text-sm mt-2 text-center", children: [
      "Failed to load PT2 hardware UI: ",
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/PT2Hardware.tsx",
      lineNumber: 518,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/hardware/PT2Hardware.tsx",
    lineNumber: 498,
    columnNumber: 5
  }, void 0);
};
export {
  PT2Hardware
};
