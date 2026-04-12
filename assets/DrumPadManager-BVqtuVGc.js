import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, T as TriangleAlert, X, a7 as RefreshCw, R as React, al as Minimize2, am as Maximize2, t as Piano, D as Download } from "./vendor-ui-AJ7AT9BN.js";
import { dK as useDrumPadStore, dL as registerViewHandler, a as useUIStore, dM as bpmToMs, ax as useTransportStore, dN as useOrientation, dO as applyVelocityCurve, dP as djFaderLFO132, dQ as djFaderLFO116, dR as djFaderLFO18, dS as djFaderLFO14, dT as djFaderLFOOff, dU as djScratchStop, dV as djScratchVibrato, dW as djScratchDrag, dX as djScratchTweak, dY as djScratchPhaser, dZ as djScratchLaser, d_ as djScratch3Flare, d$ as djScratch8Crab, e0 as djScratchTwiddle, e1 as djScratchUzi, e2 as djScratchTear, e3 as djScratchScrbl, e4 as djScratchStab, e5 as djScratchChirp, e6 as djScratchOrbit, e7 as djScratchCrab, e8 as djScratchHydro, e9 as djScratchFlare, ea as djScratchTrans, eb as djScratchBaby, $ as getToneEngine, ec as PAD_INSTRUMENT_BASE, e as useInstrumentStore, ed as getBankPads, V as getMIDIManager, W as CustomSelect, ee as useDialogKeyboard, a6 as useAllSamplePacks } from "./main-BbV5VyEH.js";
import { D as DrumPadEngine, N as NoteRepeatEngine, g as getAllKitSources, l as loadKitSource } from "./defaultKitLoader-C9x_oOIb.js";
import { g as getAudioContext, r as resumeAudioContext } from "./samplePack-DtORUwJS.js";
import { getDestination, getContext } from "./vendor-tone-48TQc1H3.js";
import { SamplePackBrowser } from "./SamplePackBrowser-Bepv4XvN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const KEY_TO_PAD_INDEX = {
  q: 0,
  w: 1,
  e: 2,
  r: 3,
  a: 4,
  s: 5,
  d: 6,
  f: 7,
  z: 8,
  x: 9,
  c: 10,
  v: 11,
  t: 12,
  y: 13,
  u: 14,
  i: 15
};
function getPadId(bankRelativeIndex, bank) {
  const bankOffset = ["A", "B", "C", "D"].indexOf(bank);
  const offset = bankOffset >= 0 ? bankOffset * 16 : 0;
  return offset + bankRelativeIndex + 1;
}
function triggerPadElement(padId, velocity) {
  const padButton = document.querySelector(`[data-pad-id="${padId}"]`);
  if (!padButton) return;
  const rect = padButton.getBoundingClientRect();
  const yFraction = velocity >= 100 ? 0.2 : 0.5;
  const mouseDown = new MouseEvent("mousedown", {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height * yFraction
  });
  padButton.dispatchEvent(mouseDown);
}
function releasePadElement(padId) {
  const padButton = document.querySelector(`[data-pad-id="${padId}"]`);
  if (!padButton) return;
  const rect = padButton.getBoundingClientRect();
  const mouseUp = new MouseEvent("mouseup", {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height * 0.5
  });
  padButton.dispatchEvent(mouseUp);
}
function useDrumPadKeyboard() {
  const handleKeyDown = reactExports.useCallback((_normalized, e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const key = e.key.toLowerCase();
    const padIndex = KEY_TO_PAD_INDEX[key];
    if (padIndex === void 0) return false;
    if (e.repeat) return true;
    const { currentBank } = useDrumPadStore.getState();
    const padId = getPadId(padIndex, currentBank);
    const velocity = e.shiftKey ? 100 : 80;
    triggerPadElement(padId, velocity);
    return true;
  }, []);
  const handleKeyUp = reactExports.useCallback((_e) => {
    const key = _e.key.toLowerCase();
    const padIndex = KEY_TO_PAD_INDEX[key];
    if (padIndex === void 0) return;
    const { currentBank } = useDrumPadStore.getState();
    const padId = getPadId(padIndex, currentBank);
    releasePadElement(padId);
  }, []);
  reactExports.useEffect(() => {
    const unregister = registerViewHandler("drumpad", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      unregister();
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, handleKeyUp]);
}
const PadButton = ({
  pad,
  isSelected,
  isFocused = false,
  velocity,
  onTrigger,
  onRelease,
  onSelect,
  onEmptyPadClick,
  onFocus,
  className = ""
}) => {
  const useHex = useUIStore((s) => s.useHexNumbers);
  const [isPressed, setIsPressed] = reactExports.useState(false);
  const [triggerIntensity, setTriggerIntensity] = reactExports.useState(0);
  const decayTimerRef = reactExports.useRef(null);
  const buttonRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    return () => {
      if (decayTimerRef.current) cancelAnimationFrame(decayTimerRef.current);
    };
  }, []);
  const flashTrigger = reactExports.useCallback((vel) => {
    const intensity = vel / 127;
    setTriggerIntensity(intensity);
    const startTime = performance.now();
    const duration = 200 + intensity * 200;
    const decay = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const remaining = intensity * Math.pow(1 - progress, 2);
      setTriggerIntensity(remaining);
      if (progress < 1) {
        decayTimerRef.current = requestAnimationFrame(decay);
      }
    };
    if (decayTimerRef.current) cancelAnimationFrame(decayTimerRef.current);
    decayTimerRef.current = requestAnimationFrame(decay);
  }, []);
  const calculateVelocity = reactExports.useCallback((clientY, target) => {
    const rect = target.getBoundingClientRect();
    const relativeY = (clientY - rect.top) / rect.height;
    const baseVelocity = Math.floor((1 - relativeY) * 127);
    return Math.max(1, Math.min(127, baseVelocity));
  }, []);
  const isLoaded = !!(pad.sample || pad.synthConfig || pad.instrumentId != null);
  const handleMouseDown = reactExports.useCallback((event) => {
    event.preventDefault();
    if (!isLoaded) {
      onSelect(pad.id);
      return;
    }
    setIsPressed(true);
    const vel = calculateVelocity(event.clientY, event.currentTarget);
    flashTrigger(vel);
    onTrigger(pad.id, vel);
  }, [pad.id, isLoaded, onTrigger, onSelect, calculateVelocity, flashTrigger]);
  const handleMouseUp = reactExports.useCallback(() => {
    setIsPressed(false);
    onRelease == null ? void 0 : onRelease(pad.id);
  }, [pad.id, onRelease]);
  const handleClick = reactExports.useCallback((event) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onSelect(pad.id);
    }
  }, [pad.id, onSelect]);
  const touchHandlersRef = reactExports.useRef({
    onTrigger,
    onRelease,
    onSelect,
    onEmptyPadClick,
    pad,
    calculateVelocity,
    flashTrigger
  });
  touchHandlersRef.current = { onTrigger, onRelease, onSelect, onEmptyPadClick, pad, calculateVelocity, flashTrigger };
  reactExports.useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const handleTouchStart = (event) => {
      event.preventDefault();
      const { pad: pad2, onSelect: onSelect2, onTrigger: onTrigger2, calculateVelocity: calculateVelocity2, flashTrigger: flashTrigger2 } = touchHandlersRef.current;
      if (!pad2.sample && !pad2.synthConfig && pad2.instrumentId == null) {
        onSelect2(pad2.id);
        return;
      }
      setIsPressed(true);
      const touch = event.touches[0];
      const vel = calculateVelocity2(touch.clientY, el);
      flashTrigger2(vel);
      onTrigger2(pad2.id, vel);
    };
    const handleTouchEnd = (event) => {
      event.preventDefault();
      setIsPressed(false);
      const { pad: pad2, onRelease: onRelease2, onSelect: onSelect2 } = touchHandlersRef.current;
      onRelease2 == null ? void 0 : onRelease2(pad2.id);
      if (event.changedTouches.length > 1) {
        onSelect2(pad2.id);
      }
    };
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);
  const padStyle = reactExports.useMemo(() => {
    if (pad.color && isLoaded) {
      return { className: "", bgColor: pad.color };
    }
    if (!isLoaded) {
      return { className: "bg-dark-border", bgColor: void 0 };
    }
    if (!pad.sample && (pad.synthConfig || pad.instrumentId != null)) {
      return { className: isSelected ? "bg-blue-800" : "bg-blue-900", bgColor: void 0 };
    }
    return { className: "bg-emerald-800", bgColor: void 0 };
  }, [isLoaded, pad.sample, pad.instrumentId, pad.color, isSelected]);
  const flashOpacity = triggerIntensity > 0.01 ? triggerIntensity : 0;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      ref: buttonRef,
      "data-pad-id": pad.id,
      className: `
        relative rounded-lg select-none overflow-hidden cursor-pointer
        ${padStyle.className}
        ${!isLoaded ? "opacity-40" : ""}
        ${isPressed && isLoaded ? "scale-95" : "scale-100"}
        ${isSelected ? "ring-2 ring-accent-primary ring-offset-2 ring-offset-dark-bg" : ""}
        ${isFocused && !isSelected ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-dark-bg" : ""}
        transform-gpu will-change-transform
        ${className}
      `,
      style: {
        aspectRatio: "1",
        transition: isPressed ? "transform 50ms" : "transform 120ms",
        ...padStyle.bgColor ? { backgroundColor: padStyle.bgColor } : {}
      },
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onClick: handleClick,
      onFocus,
      tabIndex: 0,
      "aria-label": `Drum pad ${pad.id}: ${pad.name}${pad.sample ? "" : " (empty - click to assign)"}`,
      "aria-pressed": isPressed,
      role: "gridcell",
      children: [
        flashOpacity > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute inset-0 rounded-lg pointer-events-none",
            style: {
              background: `radial-gradient(circle at center, rgba(16, 185, 129, ${flashOpacity * 0.9}) 0%, rgba(52, 211, 153, ${flashOpacity * 0.5}) 60%, transparent 100%)`
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
            lineNumber: 215,
            columnNumber: 9
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-1 left-1 text-[10px] font-mono text-white/60", children: useHex ? pad.id.toString(16).toUpperCase().padStart(2, "0") : pad.id }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 224,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center px-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-primary text-center truncate leading-tight", children: pad.name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 230,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 229,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-1 left-1 flex items-center gap-0.5", children: [
          pad.muteGroup > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono text-amber-400/70", children: [
            "M",
            pad.muteGroup
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
            lineNumber: 238,
            columnNumber: 11
          }, void 0),
          pad.playMode === "sustain" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono text-blue-400/70", children: "S" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
            lineNumber: 241,
            columnNumber: 11
          }, void 0),
          pad.reverse && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono text-purple-400/70", children: "R" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
            lineNumber: 244,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 236,
          columnNumber: 7
        }, void 0),
        velocity > 0 && isLoaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-1 right-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-1.5 h-1.5 rounded-full bg-emerald-400",
            style: { opacity: 0.3 + velocity / 127 * 0.7 }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
            lineNumber: 251,
            columnNumber: 11
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 250,
          columnNumber: 9
        }, void 0),
        !isLoaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-2xl text-white/20", children: "+" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 261,
          columnNumber: 11
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
          lineNumber: 260,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadButton.tsx",
      lineNumber: 185,
      columnNumber: 5
    },
    void 0
  );
};
const activeFx = /* @__PURE__ */ new Map();
function getCtx() {
  return getContext().rawContext;
}
function getBpm() {
  return useTransportStore.getState().bpm || 120;
}
function cleanupFx(id) {
  const state = activeFx.get(id);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  if (state.oscillator) try {
    state.oscillator.stop();
  } catch {
  }
  if (state.cleanup) state.cleanup();
  for (const node of state.nodes) {
    try {
      node.disconnect();
    } catch {
    }
  }
  activeFx.delete(id);
}
function createStutter(division) {
  const divLabel = division.replace("1/", "");
  return {
    id: `fx_stutter_${divLabel}`,
    name: `Stutter ${division}`,
    category: "stutter",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const periodMs = bpmToMs(getBpm(), division);
      const periodSec = periodMs / 1e3;
      const bufferSize = Math.round(ctx.sampleRate * periodSec);
      const stutterBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
      const recorder = ctx.createScriptProcessor(bufferSize, 2, 2);
      let captured = false;
      const stutterSource = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 1;
      stutterSource.loop = true;
      recorder.onaudioprocess = (e) => {
        if (!captured) {
          for (let ch = 0; ch < 2; ch++) {
            stutterBuffer.copyToChannel(e.inputBuffer.getChannelData(ch), ch);
          }
          captured = true;
          stutterSource.buffer = stutterBuffer;
          stutterSource.connect(gain);
          gain.connect(ctx.destination);
          stutterSource.start();
        }
        for (let ch = 0; ch < e.outputBuffer.numberOfChannels; ch++) {
          e.outputBuffer.getChannelData(ch).set(e.inputBuffer.getChannelData(ch));
        }
      };
      activeFx.set(this.id, {
        nodes: [recorder, stutterSource, gain],
        oscillator: void 0,
        cleanup: () => {
          recorder.onaudioprocess = null;
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createDubEcho() {
  return {
    id: "fx_dub_echo",
    name: "Dub Echo",
    category: "delay",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const delayTime = bpmToMs(getBpm(), "1/4") / 1e3;
      const delay = ctx.createDelay(4);
      delay.delayTime.value = delayTime;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.65;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2e3;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.7;
      delay.connect(filter);
      filter.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delay);
      const masterNode = getDestination().output;
      if (masterNode) {
        try {
          masterNode.connect(tap);
        } catch {
        }
      }
      activeFx.set(this.id, {
        nodes: [delay, feedback, filter, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const fb = state.nodes[1];
        const wet = state.nodes[3];
        const ctx = getCtx();
        fb.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        wet.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        state.timer = setTimeout(() => cleanupFx(this.id), 2e3);
        activeFx.set(this.id, { ...state });
      }
    }
  };
}
function createTapeEcho() {
  return {
    id: "fx_tape_echo",
    name: "Tape Echo",
    category: "delay",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const delayTime = bpmToMs(getBpm(), "1/8d") / 1e3;
      const delay = ctx.createDelay(4);
      delay.delayTime.value = delayTime;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.55;
      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 3e3;
      const hpf = ctx.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 200;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;
      const saturation = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = i / 128 - 1;
        curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
      }
      saturation.curve = curve;
      delay.connect(hpf);
      hpf.connect(lpf);
      lpf.connect(saturation);
      saturation.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delay);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [delay, feedback, lpf, hpf, saturation, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const fb = state.nodes[1];
        const ctx = getCtx();
        fb.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        state.timer = setTimeout(() => cleanupFx(this.id), 2500);
        activeFx.set(this.id, { ...state });
      }
    }
  };
}
function createPingPong() {
  return {
    id: "fx_ping_pong",
    name: "Ping Pong",
    category: "delay",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const delayTime = bpmToMs(getBpm(), "1/8") / 1e3;
      const delayL = ctx.createDelay(4);
      const delayR = ctx.createDelay(4);
      delayL.delayTime.value = delayTime;
      delayR.delayTime.value = delayTime;
      const fbL = ctx.createGain();
      const fbR = ctx.createGain();
      fbL.gain.value = 0.5;
      fbR.gain.value = 0.5;
      const merger = ctx.createChannelMerger(2);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;
      delayL.connect(fbL);
      fbL.connect(delayR);
      delayR.connect(fbR);
      fbR.connect(delayL);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delayL);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [delayL, delayR, fbL, fbR, merger, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const fbL = state.nodes[2];
        const fbR = state.nodes[3];
        const ctx = getCtx();
        fbL.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        fbR.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        state.timer = setTimeout(() => cleanupFx(this.id), 2e3);
        activeFx.set(this.id, { ...state });
      }
    }
  };
}
function createFilterSweep(type) {
  const label = type === "highpass" ? "HP" : type === "lowpass" ? "LP" : "BP";
  const id = `fx_filter_${type.slice(0, 2)}_sweep`;
  return {
    id,
    name: `${label} Sweep`,
    category: "filter",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = 8;
      if (type === "highpass") {
        filter.frequency.value = 20;
        filter.frequency.exponentialRampToValueAtTime(8e3, ctx.currentTime + 2);
      } else if (type === "lowpass") {
        filter.frequency.value = 2e4;
        filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 2);
      } else {
        filter.frequency.value = 500;
        filter.frequency.exponentialRampToValueAtTime(5e3, ctx.currentTime + 2);
      }
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.8;
      filter.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(filter);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [filter, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createReverbWash() {
  return {
    id: "fx_reverb_wash",
    name: "Reverb Wash",
    category: "reverb",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const convolver = ctx.createConvolver();
      const irLength = ctx.sampleRate * 3;
      const ir = ctx.createBuffer(2, irLength, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLength; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / irLength);
        }
      }
      convolver.buffer = ir;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.7;
      convolver.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(convolver);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [convolver, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const wet = state.nodes[1];
        const ctx = getCtx();
        wet.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        state.timer = setTimeout(() => cleanupFx(this.id), 3e3);
        activeFx.set(this.id, { ...state });
      }
    }
  };
}
function createFlanger() {
  return {
    id: "fx_flanger",
    name: "Flanger",
    category: "modulation",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const delay = ctx.createDelay();
      delay.delayTime.value = 3e-3;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2e-3;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();
      const feedback = ctx.createGain();
      feedback.gain.value = 0.7;
      delay.connect(feedback);
      feedback.connect(delay);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.5;
      delay.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delay);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [delay, feedback, lfoGain, wetGain, tap],
        oscillator: lfo,
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createPhaser() {
  return {
    id: "fx_phaser",
    name: "Phaser",
    category: "modulation",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const stages = [];
      for (let i = 0; i < 4; i++) {
        const ap = ctx.createBiquadFilter();
        ap.type = "allpass";
        ap.frequency.value = 1e3 + i * 500;
        ap.Q.value = 0.5;
        stages.push(ap);
      }
      for (let i = 0; i < stages.length - 1; i++) {
        stages[i].connect(stages[i + 1]);
      }
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.3;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2e3;
      lfo.connect(lfoGain);
      for (const stage of stages) {
        lfoGain.connect(stage.frequency);
      }
      lfo.start();
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.5;
      stages[stages.length - 1].connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(stages[0]);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [...stages, lfoGain, wetGain, tap],
        oscillator: lfo,
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createRingMod() {
  return {
    id: "fx_ring_mod",
    name: "Ring Mod",
    category: "modulation",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = 300;
      const ringGain = ctx.createGain();
      ringGain.gain.value = 0;
      carrier.connect(ringGain.gain);
      carrier.start();
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;
      ringGain.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(ringGain);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [ringGain, wetGain, tap],
        oscillator: carrier,
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createBitcrush() {
  return {
    id: "fx_bitcrush",
    name: "Bitcrush",
    category: "distortion",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const shaper = ctx.createWaveShaper();
      const bits = 4;
      const steps = Math.pow(2, bits);
      const curve = new Float32Array(65536);
      for (let i = 0; i < curve.length; i++) {
        const x = i / 32768 - 1;
        curve[i] = Math.round(x * steps) / steps;
      }
      shaper.curve = curve;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.7;
      shaper.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(shaper);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [shaper, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createOverdrive() {
  return {
    id: "fx_overdrive",
    name: "Overdrive",
    category: "distortion",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = i / 128 - 1;
        curve[i] = Math.tanh(x * 3);
      }
      shaper.curve = curve;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;
      shaper.connect(wetGain);
      wetGain.connect(ctx.destination);
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(shaper);
      const masterNode = getDestination().output;
      if (masterNode) try {
        masterNode.connect(tap);
      } catch {
      }
      activeFx.set(this.id, {
        nodes: [shaper, wetGain, tap],
        cleanup: () => {
          try {
            masterNode.disconnect(tap);
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
function createTapeStop() {
  return {
    id: "fx_tape_stop",
    name: "Tape Stop",
    category: "tape",
    mode: "oneshot",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const dest = getDestination();
      const masterGain = dest._gainNode;
      if (!masterGain) return;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 0.5;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0;
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start();
      const now = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.exponentialRampToValueAtTime(1e-3, now + 1.5);
      const timer = setTimeout(() => {
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
        cleanupFx(this.id);
      }, 1600);
      activeFx.set(this.id, {
        nodes: [oscGain],
        oscillator: osc,
        timer
      });
    },
    disengage() {
      const ctx = getCtx();
      const dest = getDestination();
      const masterGain = dest._gainNode;
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
      }
      cleanupFx(this.id);
    }
  };
}
function createVinylBrake() {
  return {
    id: "fx_vinyl_brake",
    name: "Vinyl Brake",
    category: "tape",
    mode: "oneshot",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const dest = getDestination();
      const masterGain = dest._gainNode;
      if (!masterGain) return;
      const now = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.exponentialRampToValueAtTime(1e-3, now + 0.8);
      const timer = setTimeout(() => {
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
        cleanupFx(this.id);
      }, 900);
      activeFx.set(this.id, { nodes: [], timer });
    },
    disengage() {
      const ctx = getCtx();
      const dest = getDestination();
      const masterGain = dest._gainNode;
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
      }
      cleanupFx(this.id);
    }
  };
}
function createDubSiren() {
  return {
    id: "fx_dub_siren",
    name: "Dub Siren",
    category: "oneshot",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 800;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 400;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = bpmToMs(getBpm(), "1/4") / 1e3;
      const fb = ctx.createGain();
      fb.gain.value = 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 3e3;
      delay.connect(filter);
      filter.connect(fb);
      fb.connect(delay);
      const sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.3;
      osc.connect(sirenGain);
      sirenGain.connect(delay);
      sirenGain.connect(ctx.destination);
      delay.connect(ctx.destination);
      osc.start();
      activeFx.set(this.id, {
        nodes: [lfoGain, sirenGain, delay, fb, filter],
        oscillator: osc,
        cleanup: () => {
          try {
            lfo.stop();
          } catch {
          }
        }
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const sirenGain = state.nodes[1];
        const fb = state.nodes[3];
        const ctx = getCtx();
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        fb.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        state.timer = setTimeout(() => cleanupFx(this.id), 2e3);
        activeFx.set(this.id, { ...state });
      }
    }
  };
}
function createAirHorn() {
  return {
    id: "fx_air_horn",
    name: "Air Horn",
    category: "oneshot",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const freqs = [540, 545, 810, 815];
      const oscs = [];
      const merger = ctx.createGain();
      merger.gain.value = 0.15;
      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.connect(merger);
        osc.start();
        oscs.push(osc);
      }
      const envelope = ctx.createGain();
      envelope.gain.value = 0;
      envelope.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
      merger.connect(envelope);
      envelope.connect(ctx.destination);
      activeFx.set(this.id, {
        nodes: [merger, envelope],
        oscillator: oscs[0],
        cleanup: () => {
          for (const osc of oscs) {
            try {
              osc.stop();
            } catch {
            }
          }
        }
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const envelope = state.nodes[1];
        const ctx = getCtx();
        envelope.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        state.timer = setTimeout(() => cleanupFx(this.id), 300);
        activeFx.set(this.id, { ...state });
      }
    }
  };
}
function createLaser() {
  return {
    id: "fx_laser",
    name: "Laser",
    category: "oneshot",
    mode: "oneshot",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 4e3;
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.3, 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      const timer = setTimeout(() => cleanupFx(this.id), 700);
      activeFx.set(this.id, { nodes: [gain], oscillator: osc, timer });
    },
    disengage() {
    }
  };
}
function createNoiseRiser() {
  return {
    id: "fx_noise_riser",
    name: "Noise Riser",
    category: "oneshot",
    mode: "momentary",
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 3;
      filter.frequency.value = 200;
      filter.frequency.exponentialRampToValueAtTime(12e3, ctx.currentTime + 4);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 4);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      activeFx.set(this.id, {
        nodes: [filter, gain],
        cleanup: () => {
          try {
            noise.stop();
          } catch {
          }
        }
      });
    },
    disengage() {
      cleanupFx(this.id);
    }
  };
}
const stutterActions = [
  createStutter("1/8"),
  createStutter("1/16"),
  createStutter("1/32")
];
const DJ_FX_ACTIONS = [
  // Stutter
  ...stutterActions,
  // Delay
  createDubEcho(),
  createTapeEcho(),
  createPingPong(),
  // Filter
  createFilterSweep("highpass"),
  createFilterSweep("lowpass"),
  createFilterSweep("bandpass"),
  // Reverb
  createReverbWash(),
  // Modulation
  createFlanger(),
  createPhaser(),
  createRingMod(),
  // Distortion
  createBitcrush(),
  createOverdrive(),
  // Tape / Vinyl
  createTapeStop(),
  createVinylBrake(),
  // One-shot sounds
  createDubSiren(),
  createAirHorn(),
  createLaser(),
  createNoiseRiser()
];
const DJ_FX_ACTION_MAP = Object.fromEntries(
  DJ_FX_ACTIONS.map((a) => [a.id, a])
);
const SCRATCH_ACTION_HANDLERS = {
  // Basic patterns
  scratch_baby: djScratchBaby,
  scratch_trans: djScratchTrans,
  scratch_flare: djScratchFlare,
  scratch_hydro: djScratchHydro,
  scratch_crab: djScratchCrab,
  scratch_orbit: djScratchOrbit,
  // Extended patterns
  scratch_chirp: djScratchChirp,
  scratch_stab: djScratchStab,
  scratch_scribble: djScratchScrbl,
  scratch_tear: djScratchTear,
  // Advanced patterns
  scratch_uzi: djScratchUzi,
  scratch_twiddle: djScratchTwiddle,
  scratch_8crab: djScratch8Crab,
  scratch_3flare: djScratch3Flare,
  scratch_laser: djScratchLaser,
  scratch_phaser: djScratchPhaser,
  scratch_tweak: djScratchTweak,
  scratch_drag: djScratchDrag,
  scratch_vibrato: djScratchVibrato,
  // Control
  scratch_stop: djScratchStop,
  lfo_off: djFaderLFOOff,
  lfo_14: djFaderLFO14,
  lfo_18: djFaderLFO18,
  lfo_116: djFaderLFO116,
  lfo_132: djFaderLFO132
};
const PadGrid = ({
  onPadSelect,
  onEmptyPadClick,
  selectedPadId
}) => {
  const [padVelocities, setPadVelocities] = reactExports.useState({});
  const [focusedPadId, setFocusedPadId] = reactExports.useState(1);
  const noteRepeatEnabledRef = reactExports.useRef(false);
  const heldPadsRef = reactExports.useRef(/* @__PURE__ */ new Set());
  const { currentBank, setBank } = useDrumPadStore();
  const { isPortrait } = useOrientation();
  const gridCols = isPortrait ? 2 : 4;
  const { programs, currentProgramId } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);
  const engineRef = reactExports.useRef(null);
  const noteRepeatRef = reactExports.useRef(null);
  const gridRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const audioContext = getAudioContext();
    engineRef.current = new DrumPadEngine(audioContext);
    noteRepeatRef.current = new NoteRepeatEngine(engineRef.current);
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);
    return () => {
      var _a, _b;
      (_a = noteRepeatRef.current) == null ? void 0 : _a.dispose();
      (_b = engineRef.current) == null ? void 0 : _b.dispose();
    };
  }, []);
  reactExports.useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram == null ? void 0 : currentProgram.masterLevel]);
  reactExports.useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
    }
  }, [currentProgram]);
  const noteRepeatEnabled = useDrumPadStore((s) => s.noteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore((s) => s.noteRepeatRate);
  const bpm = useTransportStore((s) => s.bpm);
  reactExports.useEffect(() => {
    const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
    setFocusedPadId(bankOffset + 1);
  }, [currentBank]);
  reactExports.useEffect(() => {
    var _a;
    noteRepeatEnabledRef.current = noteRepeatEnabled;
    (_a = noteRepeatRef.current) == null ? void 0 : _a.setEnabled(noteRepeatEnabled);
  }, [noteRepeatEnabled]);
  reactExports.useEffect(() => {
    var _a;
    (_a = noteRepeatRef.current) == null ? void 0 : _a.setRate(noteRepeatRate);
  }, [noteRepeatRate]);
  reactExports.useEffect(() => {
    var _a;
    (_a = noteRepeatRef.current) == null ? void 0 : _a.setBpm(bpm);
  }, [bpm]);
  const busLevels = useDrumPadStore((s) => s.busLevels);
  reactExports.useEffect(() => {
    if (!engineRef.current || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      engineRef.current.setOutputLevel(bus, level);
    }
  }, [busLevels]);
  const handlePadTrigger = reactExports.useCallback(async (padId, velocity) => {
    var _a, _b;
    setPadVelocities((prev) => ({ ...prev, [padId]: velocity }));
    await resumeAudioContext();
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find((p) => p.id === padId);
      if (pad) {
        const curvedVelocity = applyVelocityCurve(velocity, pad.velocityCurve);
        if (pad.scratchAction) {
          (_a = SCRATCH_ACTION_HANDLERS[pad.scratchAction]) == null ? void 0 : _a.call(SCRATCH_ACTION_HANDLERS);
        }
        if (pad.djFxAction) {
          (_b = DJ_FX_ACTION_MAP[pad.djFxAction]) == null ? void 0 : _b.engage();
        }
        if (pad.sample) {
          engineRef.current.triggerPad(pad, curvedVelocity);
        }
        if (pad.synthConfig) {
          try {
            const engine = getToneEngine();
            const note = pad.instrumentNote || "C3";
            const normalizedVel = curvedVelocity / 127;
            const padInstId = PAD_INSTRUMENT_BASE + pad.id;
            const config = { ...pad.synthConfig, id: padInstId };
            engine.triggerNoteAttack(padInstId, note, 0, normalizedVel, config);
            if (pad.playMode === "oneshot") {
              const releaseDelay = Math.max(pad.decay, 100) / 1e3;
              setTimeout(() => {
                try {
                  engine.triggerNoteRelease(padInstId, note, 0, config);
                } catch {
                }
              }, releaseDelay * 1e3);
            }
          } catch (err) {
            console.warn("[PadGrid] Pad synth trigger failed:", err);
          }
        } else if (pad.instrumentId != null) {
          try {
            const config = useInstrumentStore.getState().getInstrument(pad.instrumentId);
            if (config) {
              const engine = getToneEngine();
              const note = pad.instrumentNote || "C3";
              const normalizedVel = curvedVelocity / 127;
              engine.triggerNoteAttack(pad.instrumentId, note, 0, normalizedVel, config);
              if (pad.playMode === "oneshot") {
                const releaseDelay = Math.max(pad.decay, 100) / 1e3;
                setTimeout(() => {
                  try {
                    engine.triggerNoteRelease(pad.instrumentId, note, 0, config);
                  } catch {
                  }
                }, releaseDelay * 1e3);
              }
            }
          } catch (err) {
            console.warn("[PadGrid] Synth trigger failed:", err);
          }
        }
        if (pad.playMode === "sustain") {
          heldPadsRef.current.add(padId);
        }
        if (noteRepeatEnabledRef.current && noteRepeatRef.current) {
          noteRepeatRef.current.startRepeat(pad, velocity);
          heldPadsRef.current.add(padId);
        }
      }
    }
    setTimeout(() => {
      setPadVelocities((prev) => ({ ...prev, [padId]: 0 }));
    }, 200);
  }, [currentProgram]);
  const handlePadRelease = reactExports.useCallback((padId) => {
    var _a, _b;
    if (!heldPadsRef.current.has(padId)) return;
    heldPadsRef.current.delete(padId);
    (_a = noteRepeatRef.current) == null ? void 0 : _a.stopRepeat(padId);
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find((p) => p.id === padId);
      if (pad) {
        if (pad.djFxAction) {
          (_b = DJ_FX_ACTION_MAP[pad.djFxAction]) == null ? void 0 : _b.disengage();
        }
        if (pad.playMode === "sustain") {
          engineRef.current.stopPad(padId, pad.release / 1e3);
          if (pad.synthConfig) {
            try {
              const padInstId = PAD_INSTRUMENT_BASE + pad.id;
              const config = { ...pad.synthConfig, id: padInstId };
              const note = pad.instrumentNote || "C3";
              getToneEngine().triggerNoteRelease(padInstId, note, 0, config);
            } catch {
            }
          } else if (pad.instrumentId != null) {
            try {
              const config = useInstrumentStore.getState().getInstrument(pad.instrumentId);
              if (config) {
                const note = pad.instrumentNote || "C3";
                getToneEngine().triggerNoteRelease(pad.instrumentId, note, 0, config);
              }
            } catch {
            }
          }
        }
      }
    }
  }, [currentProgram]);
  const bankPads = reactExports.useMemo(() => {
    if (!currentProgram) return [];
    return getBankPads(currentProgram.pads, currentBank);
  }, [currentProgram, currentBank]);
  const rows = reactExports.useMemo(() => {
    if (bankPads.length === 0) return [];
    return [
      bankPads.slice(0, 4),
      bankPads.slice(4, 8),
      bankPads.slice(8, 12),
      bankPads.slice(12, 16)
    ];
  }, [bankPads]);
  reactExports.useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }
      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
      const bankStart = bankOffset + 1;
      const bankEnd = bankOffset + 16;
      let newFocusedId = focusedPadId;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          newFocusedId = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd;
          break;
        case "ArrowRight":
          event.preventDefault();
          newFocusedId = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart;
          break;
        case "ArrowUp":
          event.preventDefault();
          newFocusedId = focusedPadId > bankStart + 3 ? focusedPadId - 4 : focusedPadId + 12;
          break;
        case "ArrowDown":
          event.preventDefault();
          newFocusedId = focusedPadId <= bankEnd - 4 ? focusedPadId + 4 : focusedPadId - 12;
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          handlePadTrigger(focusedPadId, 100);
          break;
        case "Tab":
          if (event.shiftKey) {
            newFocusedId = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd;
          } else {
            newFocusedId = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart;
          }
          break;
        default:
          return;
      }
      if (newFocusedId !== focusedPadId) {
        setFocusedPadId(newFocusedId);
        const pad = currentProgram == null ? void 0 : currentProgram.pads.find((p) => p.id === newFocusedId);
        if (pad) {
          let liveRegion = document.getElementById("pad-navigation-announcer");
          if (!liveRegion) {
            liveRegion = document.createElement("div");
            liveRegion.id = "pad-navigation-announcer";
            liveRegion.setAttribute("role", "status");
            liveRegion.setAttribute("aria-live", "polite");
            liveRegion.setAttribute("aria-atomic", "true");
            liveRegion.className = "sr-only";
            document.body.appendChild(liveRegion);
          }
          liveRegion.textContent = `Pad ${pad.id}: ${pad.name}${pad.sample ? "" : " (empty)"}`;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedPadId, currentProgram, currentBank, handlePadTrigger]);
  if (!currentProgram) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-full text-text-muted", children: "No program loaded" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
      lineNumber: 383,
      columnNumber: 7
    }, void 0);
  }
  const bankButtons = ["A", "B", "C", "D"];
  const bankLoadedCount = bankPads.filter((p) => p.sample !== null || p.synthConfig || p.instrumentId != null).length;
  const totalLoadedCount = currentProgram.pads.filter((p) => p.sample !== null || p.synthConfig || p.instrumentId != null).length;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 p-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-bold text-text-primary", children: currentProgram.name }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
          lineNumber: 398,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted font-mono", children: currentProgram.id }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
          lineNumber: 399,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
        lineNumber: 397,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = engineRef.current) == null ? void 0 : _a.stopAll();
            },
            className: "px-2 py-1 text-[10px] font-mono text-text-muted hover:text-red-400 bg-dark-surface border border-dark-border rounded transition-colors",
            title: "Stop all playing pads",
            children: "Stop All"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
            lineNumber: 402,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: async () => {
              const blob = await useDrumPadStore.getState().exportAllConfigs();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${currentProgram.name || "drumpad"}.dvbpads`;
              a.click();
              URL.revokeObjectURL(url);
            },
            className: "px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors",
            title: "Export all programs + samples",
            children: "Export"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
            lineNumber: 409,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".dvbpads";
              input.onchange = async () => {
                var _a;
                const file = (_a = input.files) == null ? void 0 : _a[0];
                if (!file) return;
                try {
                  const audioContext = getAudioContext();
                  await useDrumPadStore.getState().importConfigs(file, audioContext);
                } catch (err) {
                  console.error("[PadGrid] Import failed:", err);
                }
              };
              input.click();
            },
            className: "px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors",
            title: "Import programs + samples (.dvbpads)",
            children: "Import"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
            lineNumber: 424,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", title: `${totalLoadedCount} samples across all banks`, children: [
          bankLoadedCount,
          "/16 (",
          totalLoadedCount,
          "/64)"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
          lineNumber: 446,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
        lineNumber: 401,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
      lineNumber: 396,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 mb-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-text-muted mr-1", children: "BANK" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
        lineNumber: 454,
        columnNumber: 9
      }, void 0),
      bankButtons.map((bank) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setBank(bank),
          className: `px-3 py-1 text-xs font-bold font-mono rounded transition-colors ${currentBank === bank ? "bg-accent-primary text-text-primary" : "bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary"}`,
          children: bank
        },
        bank,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
          lineNumber: 456,
          columnNumber: 11
        },
        void 0
      ))
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
      lineNumber: 453,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: gridRef,
        className: `grid gap-2 ${gridCols === 2 ? "grid-cols-2" : "grid-cols-4"}`,
        role: "grid",
        "aria-label": "Drum pad grid",
        children: rows.flat().map((pad) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          PadButton,
          {
            pad,
            isSelected: selectedPadId === pad.id,
            isFocused: focusedPadId === pad.id,
            velocity: padVelocities[pad.id] || 0,
            onTrigger: handlePadTrigger,
            onRelease: handlePadRelease,
            onSelect: onPadSelect,
            onEmptyPadClick,
            onFocus: () => setFocusedPadId(pad.id)
          },
          pad.id,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
            lineNumber: 478,
            columnNumber: 11
          },
          void 0
        ))
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
        lineNumber: 471,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted text-center mt-2 font-mono", children: "Click/Enter to trigger • Shift+Click to select • Arrow keys to navigate" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
      lineNumber: 494,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadGrid.tsx",
    lineNumber: 394,
    columnNumber: 5
  }, void 0);
};
const SPEECH_SYNTH_TYPES = /* @__PURE__ */ new Set(["Sam", "DECtalk", "PinkTrombone", "V2Speech"]);
const SYNTH_TYPE_GROUPS = [
  { label: "Basic Synths", types: [
    { value: "Synth", label: "Synth" },
    { value: "MonoSynth", label: "Mono Synth" },
    { value: "FMSynth", label: "FM Synth" },
    { value: "ToneAM", label: "AM Synth" },
    { value: "DuoSynth", label: "Duo Synth" },
    { value: "NoiseSynth", label: "Noise" }
  ] },
  { label: "Drums & Percussion", types: [
    { value: "TR808", label: "TR-808" },
    { value: "TR909", label: "TR-909" },
    { value: "MembraneSynth", label: "Membrane (Kick/Tom)" },
    { value: "MetalSynth", label: "Metal (HiHat/Cymbal)" },
    { value: "PluckSynth", label: "Pluck" },
    { value: "Synare", label: "Synare Drum" }
  ] },
  { label: "Modern Synths", types: [
    { value: "SuperSaw", label: "Super Saw" },
    { value: "Wavetable", label: "Wavetable" },
    { value: "PolySynth", label: "Poly Synth" },
    { value: "ChipSynth", label: "Chip Synth" },
    { value: "PWMSynth", label: "PWM Synth" },
    { value: "WobbleBass", label: "Wobble Bass" },
    { value: "FormantSynth", label: "Formant" },
    { value: "StringMachine", label: "String Machine" },
    { value: "Organ", label: "Organ" }
  ] },
  { label: "Bass & Lead", types: [
    { value: "TB303", label: "TB-303" },
    { value: "DubSiren", label: "Dub Siren" },
    { value: "SpaceLaser", label: "Space Laser" }
  ] },
  { label: "Speech", types: [
    { value: "Sam", label: "SAM (Robot Voice)" },
    { value: "DECtalk", label: "DECtalk (Hawking)" },
    { value: "PinkTrombone", label: "Pink Trombone" }
  ] },
  { label: "WASM Synths", types: [
    { value: "ToneAM", label: "amsynth" },
    { value: "SynthV1", label: "SynthV1" },
    { value: "TalNoizeMaker", label: "TAL NoiseMaker" },
    { value: "MdaEPiano", label: "MDA EPiano" },
    { value: "MdaJX10", label: "MDA JX10" },
    { value: "SetBfree", label: "setBfree (B3 Organ)" },
    { value: "ZynAddSubFX", label: "ZynAddSubFX" }
  ] },
  { label: "Chip / Retro", types: [
    { value: "HarmonicSynth", label: "Harmonic" },
    { value: "FurnaceGB", label: "Game Boy" },
    { value: "FurnaceNES", label: "NES" },
    { value: "FurnacePSG", label: "PSG (Master System)" },
    { value: "FurnaceC64", label: "C64 (Furnace)" },
    { value: "FurnaceAY", label: "AY-3-8910" },
    { value: "FurnacePCE", label: "PC Engine" },
    { value: "FurnaceSNES", label: "SNES" }
  ] },
  { label: "V2 / Demoscene", types: [
    { value: "V2", label: "V2 Synth" },
    { value: "V2Speech", label: "V2 Speech" },
    { value: "Oidos", label: "Oidos" }
  ] }
];
const VELOCITY_CURVE_OPTIONS = [
  { value: "linear", label: "Linear", desc: "Default — velocity maps directly" },
  { value: "exponential", label: "Exponential", desc: "Soft touch, hard hits for max" },
  { value: "logarithmic", label: "Logarithmic", desc: "Reaches loud quickly" },
  { value: "scurve", label: "S-Curve", desc: "Subtle extremes, steep middle" },
  { value: "fixed", label: "Fixed (Max)", desc: "Always max velocity" }
];
const PAD_COLOR_PRESETS = [
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1"
];
function getSpeechText(config) {
  var _a, _b, _c, _d;
  if (config.synthType === "Sam") return (_a = config.sam) == null ? void 0 : _a.text;
  if (config.synthType === "DECtalk") return (_b = config.dectalk) == null ? void 0 : _b.text;
  if (config.synthType === "PinkTrombone") return (_c = config.pinkTrombone) == null ? void 0 : _c.text;
  if (config.synthType === "V2Speech") return (_d = config.v2Speech) == null ? void 0 : _d.text;
  return void 0;
}
function setSpeechTextField(config, synthType, text) {
  if (synthType === "Sam") config.sam = { ...config.sam, text };
  else if (synthType === "DECtalk") config.dectalk = { ...config.dectalk, text };
  else if (synthType === "PinkTrombone") config.pinkTrombone = { ...config.pinkTrombone, text };
  else if (synthType === "V2Speech") config.v2Speech = { ...config.v2Speech, text };
}
const SCRATCH_ACTION_OPTIONS = [
  { value: "", label: "None" },
  // Basic patterns
  { value: "scratch_baby", label: "Baby Scratch" },
  { value: "scratch_trans", label: "Transformer" },
  { value: "scratch_flare", label: "Flare" },
  { value: "scratch_hydro", label: "Hydroplane" },
  { value: "scratch_crab", label: "Crab" },
  { value: "scratch_orbit", label: "Orbit" },
  // Extended patterns
  { value: "scratch_chirp", label: "Chirp" },
  { value: "scratch_stab", label: "Stab" },
  { value: "scratch_scribble", label: "Scribble" },
  { value: "scratch_tear", label: "Tear" },
  // Advanced patterns
  { value: "scratch_uzi", label: "Uzi" },
  { value: "scratch_twiddle", label: "Twiddle" },
  { value: "scratch_8crab", label: "8-Finger Crab" },
  { value: "scratch_3flare", label: "3-Click Flare" },
  { value: "scratch_laser", label: "Laser" },
  { value: "scratch_phaser", label: "Phaser" },
  { value: "scratch_tweak", label: "Tweak" },
  { value: "scratch_drag", label: "Drag" },
  { value: "scratch_vibrato", label: "Vibrato" },
  // Control
  { value: "scratch_stop", label: "Stop Scratch" },
  { value: "lfo_off", label: "Fader LFO: Off" },
  { value: "lfo_14", label: "Fader LFO: ¼" },
  { value: "lfo_18", label: "Fader LFO: ⅛" },
  { value: "lfo_116", label: "Fader LFO: ⅟₁₆" },
  { value: "lfo_132", label: "Fader LFO: ⅟₃₂" }
];
const DJ_FX_OPTIONS = [
  { value: "", label: "None", category: "" },
  ...DJ_FX_ACTIONS.map((a) => ({ value: a.id, label: a.name, category: a.category }))
];
const FX_CATEGORY_LABELS = {
  stutter: "🔁 Stutter",
  delay: "🔊 Delay / Echo",
  filter: "🎛️ Filter",
  reverb: "🌊 Reverb",
  modulation: "🌀 Modulation",
  distortion: "🔥 Distortion",
  tape: "📼 Tape / Vinyl",
  oneshot: "🎵 One-Shot Sounds"
};
const PadEditor = ({ padId, onClose }) => {
  var _a, _b, _c, _d, _e;
  const [activeTab, setActiveTab] = reactExports.useState("main");
  const [isLearning, setIsLearning] = reactExports.useState(false);
  const [showLayerBrowser, setShowLayerBrowser] = reactExports.useState(false);
  const learningRef = reactExports.useRef(false);
  const {
    programs,
    currentProgramId,
    updatePad,
    clearPad,
    midiMappings,
    setMIDIMapping,
    clearMIDIMapping,
    addLayerToPad,
    removeLayerFromPad,
    updateLayerOnPad,
    clipboardPad,
    copyPad,
    pastePad
  } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);
  const pad = currentProgram == null ? void 0 : currentProgram.pads.find((p) => p.id === padId);
  const midiMapping = midiMappings[String(padId)];
  const handleUpdate = reactExports.useCallback((updates) => {
    updatePad(padId, updates);
  }, [padId, updatePad]);
  const handleMIDILearn = reactExports.useCallback(() => {
    if (isLearning) {
      setIsLearning(false);
      learningRef.current = false;
      return;
    }
    setIsLearning(true);
    learningRef.current = true;
    const manager = getMIDIManager();
    const handler = (message) => {
      if (!learningRef.current) return;
      if (message.type === "noteOn" && message.note !== void 0) {
        setMIDIMapping(String(padId), { type: "note", note: message.note });
        setIsLearning(false);
        learningRef.current = false;
        manager.removeMessageHandler(handler);
      }
    };
    manager.addMessageHandler(handler);
    setTimeout(() => {
      if (learningRef.current) {
        setIsLearning(false);
        learningRef.current = false;
        manager.removeMessageHandler(handler);
      }
    }, 1e4);
  }, [isLearning, padId, setMIDIMapping]);
  reactExports.useEffect(() => {
    return () => {
      learningRef.current = false;
    };
  }, []);
  const adsrVisualization = reactExports.useMemo(() => {
    if (!pad) return null;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-6 p-4 bg-dark-surface border border-dark-border rounded", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted mb-2 text-center", children: "ENVELOPE SHAPE" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 237,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-24 flex items-end justify-around", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-end space-x-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-8 bg-accent-primary",
            style: { height: `${pad.attack / 100 * 100}%` },
            title: "Attack"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 240,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-8 bg-accent-secondary",
            style: { height: `${pad.decay / 2e3 * 100}%` },
            title: "Decay"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 245,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-8 bg-emerald-600",
            style: { height: `${pad.sustain}%` },
            title: "Sustain"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 250,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "w-8 bg-blue-600",
            style: { height: `${pad.release / 5e3 * 100}%` },
            title: "Release"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 255,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 239,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 238,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
      lineNumber: 236,
      columnNumber: 7
    }, void 0);
  }, [pad == null ? void 0 : pad.attack, pad == null ? void 0 : pad.decay, pad == null ? void 0 : pad.sustain, pad == null ? void 0 : pad.release]);
  if (!pad) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 text-text-muted text-center", children: [
      "Pad ",
      padId,
      " not found"
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
      lineNumber: 268,
      columnNumber: 7
    }, void 0);
  }
  const tabs = [
    { id: "main", label: "Main" },
    { id: "adsr", label: "ADSR" },
    { id: "filter", label: "Filter" },
    { id: "velo", label: "Velo" },
    { id: "layers", label: "Layers" },
    { id: "dj", label: "DJ" }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg overflow-hidden flex flex-col max-h-[85vh]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-bold text-text-primary", children: [
          "Pad ",
          pad.id,
          ": ",
          pad.name
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 288,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: pad.sample && pad.instrumentId != null ? "Sample + Instrument" : pad.sample ? "Sample loaded" : pad.instrumentId != null ? `Instrument #${pad.instrumentId}` : "Empty — assign sample or instrument" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 289,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 287,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => copyPad(padId),
            className: "px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors",
            title: "Copy pad settings",
            children: "Copy"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 300,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => pastePad(padId),
            disabled: !clipboardPad,
            className: `px-2 py-1 text-[10px] font-mono rounded transition-colors ${clipboardPad ? "text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border" : "text-text-muted/30 bg-dark-surface/50 border border-dark-border/50 cursor-not-allowed"}`,
            title: clipboardPad ? `Paste from Pad ${clipboardPad.id}` : "Nothing to paste",
            children: "Paste"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 307,
            columnNumber: 11
          },
          void 0
        ),
        onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "text-xs text-text-muted hover:text-text-primary",
            children: "Close"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 320,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 299,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
      lineNumber: 286,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border", children: tabs.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setActiveTab(tab.id),
        className: `
              flex-1 px-4 py-2 text-xs font-bold transition-all duration-200
              ${activeTab === tab.id ? "bg-dark-surface text-accent-primary border-b-2 border-accent-primary scale-105" : "text-text-muted hover:text-text-primary hover:scale-102"}
              transform-gpu will-change-transform
            `,
        children: tab.label
      },
      tab.id,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 333,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
      lineNumber: 331,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 overflow-y-auto flex-1 min-h-0", children: [
      activeTab === "main" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Name" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 355,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "text",
              value: pad.name,
              onChange: (e) => handleUpdate({ name: e.target.value }),
              className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 356,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 354,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border border-dark-border rounded-lg p-3 space-y-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono text-text-muted uppercase tracking-wider", children: "Sound Source" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 366,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Synth Type" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 370,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: ((_a = pad.synthConfig) == null ? void 0 : _a.synthType) ?? "",
                onChange: (val) => {
                  if (val === "") {
                    handleUpdate({ synthConfig: void 0, instrumentId: void 0, instrumentNote: void 0 });
                  } else {
                    const synthType = val;
                    const padInstId = PAD_INSTRUMENT_BASE + pad.id;
                    const newConfig = {
                      id: padInstId,
                      name: pad.name === `Pad ${pad.id}` ? val : pad.name,
                      type: "synth",
                      synthType,
                      effects: [],
                      volume: 0,
                      pan: 0
                    };
                    if (SPEECH_SYNTH_TYPES.has(synthType) && pad.synthConfig) {
                      const oldText = getSpeechText(pad.synthConfig);
                      if (oldText) setSpeechTextField(newConfig, synthType, oldText);
                    }
                    handleUpdate({
                      synthConfig: newConfig,
                      instrumentId: void 0,
                      instrumentNote: pad.instrumentNote || "C3",
                      name: pad.name === `Pad ${pad.id}` ? val : pad.name
                    });
                  }
                },
                options: [
                  { value: "", label: "None" },
                  ...SYNTH_TYPE_GROUPS.map((group) => ({
                    label: group.label,
                    options: group.types.map((t) => ({
                      value: t.value,
                      label: t.label
                    }))
                  }))
                ],
                className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 371,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 369,
            columnNumber: 15
          }, void 0),
          (pad.synthConfig || pad.instrumentId != null) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Trigger Note" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 418,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: pad.instrumentNote || "C3",
                onChange: (v) => handleUpdate({ instrumentNote: v }),
                options: (() => {
                  const notes = [];
                  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
                  for (let oct = 1; oct <= 7; oct++) {
                    for (const n of noteNames) {
                      const note = `${n}${oct}`;
                      notes.push({ value: note, label: note });
                    }
                  }
                  return notes;
                })(),
                className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 419,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 417,
            columnNumber: 17
          }, void 0),
          pad.sample && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-xs text-emerald-400 font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-2 h-2 rounded-full bg-emerald-400 inline-block" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 441,
              columnNumber: 19
            }, void 0),
            "Sample: ",
            pad.sample.name
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 440,
            columnNumber: 17
          }, void 0),
          pad.synthConfig && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-xs text-blue-400 font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-2 h-2 rounded-full bg-blue-400 inline-block" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 447,
              columnNumber: 19
            }, void 0),
            "Synth: ",
            pad.synthConfig.synthType
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 446,
            columnNumber: 17
          }, void 0),
          pad.synthConfig && (pad.synthConfig.synthType === "TR808" || pad.synthConfig.synthType === "TR909") && (() => {
            var _a2, _b2, _c2, _d2, _e2, _f, _g;
            const drumType = ((_b2 = (_a2 = pad.synthConfig) == null ? void 0 : _a2.parameters) == null ? void 0 : _b2.io808Type) || ((_d2 = (_c2 = pad.synthConfig) == null ? void 0 : _c2.parameters) == null ? void 0 : _d2.tr909Type) || ((_f = (_e2 = pad.synthConfig) == null ? void 0 : _e2.drumMachine) == null ? void 0 : _f.drumType) || "";
            const params = ((_g = pad.synthConfig) == null ? void 0 : _g.parameters) || {};
            const updateDrumParam = (key, value) => {
              handleUpdate({
                synthConfig: {
                  ...pad.synthConfig,
                  parameters: { ...pad.synthConfig.parameters, [key]: value }
                }
              });
            };
            const knobRow = (label, paramKey, def) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-[10px] text-text-muted mb-0.5", children: label }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 468,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: 0,
                  max: 100,
                  step: 1,
                  value: typeof params[paramKey] === "number" ? params[paramKey] : def,
                  onChange: (e) => updateDrumParam(paramKey, Number(e.target.value)),
                  className: "w-full h-1.5 accent-orange-500"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 469,
                  columnNumber: 21
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-muted text-right", children: [
                typeof params[paramKey] === "number" ? Math.round(params[paramKey]) : def,
                "%"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 475,
                columnNumber: 21
              }, void 0)
            ] }, paramKey, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 467,
              columnNumber: 19
            }, void 0);
            const controls = [];
            if (drumType === "kick") {
              controls.push({ label: "Tone", key: "tone", def: 50 }, { label: "Decay", key: "decay", def: 50 });
            } else if (drumType === "snare") {
              controls.push({ label: "Tone", key: "tone", def: 50 }, { label: "Snappy", key: "snappy", def: 50 });
            } else if (drumType === "openHat" || drumType === "closedHat" || drumType === "hihat") {
              controls.push({ label: "Decay", key: "decay", def: 50 });
            } else if (drumType === "cymbal" || drumType === "crash" || drumType === "ride") {
              controls.push({ label: "Tone", key: "tone", def: 50 }, { label: "Decay", key: "decay", def: 50 });
            } else if (drumType === "tom" || drumType === "conga" || drumType === "tomLow" || drumType === "tomMid" || drumType === "tomHigh" || drumType === "congaLow" || drumType === "congaMid" || drumType === "congaHigh") {
              controls.push({ label: "Tuning", key: "tuning", def: 50 });
            }
            if (controls.length === 0) return null;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono text-text-muted uppercase tracking-wider", children: "Drum Controls" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 487,
                columnNumber: 21
              }, void 0),
              controls.map((c) => knobRow(c.label, c.key, c.def))
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 486,
              columnNumber: 19
            }, void 0);
          })(),
          (pad.sample || pad.synthConfig) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onMouseDown: () => {
                if (pad.synthConfig) {
                  try {
                    const padInstId = PAD_INSTRUMENT_BASE + pad.id;
                    const config = { ...pad.synthConfig, id: padInstId };
                    const note = pad.instrumentNote || "C3";
                    getToneEngine().triggerNoteAttack(padInstId, note, 0, 0.8, config);
                    setTimeout(() => {
                      try {
                        getToneEngine().triggerNoteRelease(padInstId, note, 0, config);
                      } catch {
                      }
                    }, 500);
                  } catch {
                  }
                }
              },
              className: "w-full px-3 py-1.5 bg-dark-surface border border-dark-border rounded text-xs text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary transition-colors font-mono",
              children: "Preview Sound"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 495,
              columnNumber: 17
            },
            void 0
          ),
          pad.synthConfig && SPEECH_SYNTH_TYPES.has(pad.synthConfig.synthType) && (() => {
            const currentText = getSpeechText(pad.synthConfig) || "";
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
                "Speech Text (",
                pad.synthConfig.synthType,
                ")"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 520,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "text",
                    value: currentText,
                    onChange: (e) => {
                      const updated = { ...pad.synthConfig };
                      setSpeechTextField(updated, pad.synthConfig.synthType, e.target.value);
                      handleUpdate({ synthConfig: updated });
                    },
                    placeholder: "Type what to say...",
                    className: "flex-1 bg-dark-surface border border-dark-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 524,
                    columnNumber: 23
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => {
                      try {
                        const padInstId = PAD_INSTRUMENT_BASE + pad.id;
                        const config = { ...pad.synthConfig, id: padInstId };
                        const note = pad.instrumentNote || "C3";
                        getToneEngine().triggerNoteAttack(padInstId, note, 0, 0.8, config);
                        setTimeout(() => {
                          try {
                            getToneEngine().triggerNoteRelease(padInstId, note, 0, config);
                          } catch {
                          }
                        }, 2e3);
                      } catch {
                      }
                    },
                    className: "px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-xs font-bold rounded transition-colors",
                    children: "Speak"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 535,
                    columnNumber: 23
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 523,
                columnNumber: 21
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 519,
              columnNumber: 19
            }, void 0);
          })()
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 365,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Pad Color" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 559,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleUpdate({ color: void 0 }),
                className: `w-6 h-6 rounded border-2 transition-all ${!pad.color ? "border-white ring-1 ring-white/50" : "border-dark-border"}`,
                style: { background: "linear-gradient(135deg, #10b981 50%, #3b82f6 50%)" },
                title: "Default (auto)"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 561,
                columnNumber: 17
              },
              void 0
            ),
            PAD_COLOR_PRESETS.map((color) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleUpdate({ color }),
                className: `w-6 h-6 rounded border-2 transition-all ${pad.color === color ? "border-white ring-1 ring-white/50 scale-110" : "border-dark-border"}`,
                style: { backgroundColor: color }
              },
              color,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 570,
                columnNumber: 19
              },
              void 0
            )),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "color",
                value: pad.color || "#10b981",
                onChange: (e) => handleUpdate({ color: e.target.value }),
                className: "w-6 h-6 rounded border border-dark-border cursor-pointer",
                title: "Custom color"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 579,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 560,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 558,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Velocity Curve: ",
            ((_b = VELOCITY_CURVE_OPTIONS.find((v) => v.value === (pad.velocityCurve || "linear"))) == null ? void 0 : _b.label) || "Linear"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 591,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: pad.velocityCurve || "linear",
              onChange: (v) => handleUpdate({ velocityCurve: v }),
              options: VELOCITY_CURVE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: `${opt.label} — ${opt.desc}`
              })),
              className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 594,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 590,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Level: ",
            pad.level
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 606,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "127",
              value: pad.level,
              onChange: (e) => handleUpdate({ level: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 609,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 605,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Tune: ",
            pad.tune > 0 ? "+" : "",
            (pad.tune / 10).toFixed(1),
            " st"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 620,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "-120",
              max: "120",
              value: pad.tune,
              onChange: (e) => handleUpdate({ tune: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 623,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 619,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Pan: ",
            pad.pan === 0 ? "C" : pad.pan > 0 ? `R${pad.pan}` : `L${-pad.pan}`
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 634,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "-64",
              max: "63",
              value: pad.pan,
              onChange: (e) => handleUpdate({ pan: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 637,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 633,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Output Bus" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 648,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: pad.output,
              onChange: (v) => handleUpdate({ output: v }),
              options: [
                { value: "stereo", label: "Stereo Mix" },
                { value: "out1", label: "Output 1" },
                { value: "out2", label: "Output 2" },
                { value: "out3", label: "Output 3" },
                { value: "out4", label: "Output 4" }
              ],
              className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 649,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 647,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border pt-3 mt-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono text-text-muted mb-2 uppercase", children: "MPC" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 665,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Mute Group" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 668,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  value: String(pad.muteGroup),
                  onChange: (v) => handleUpdate({ muteGroup: parseInt(v) }),
                  options: [
                    { value: "0", label: "Off" },
                    ...[1, 2, 3, 4, 5, 6, 7, 8].map((g) => ({
                      value: String(g),
                      label: `Group ${g}`
                    }))
                  ],
                  className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 669,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 667,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Play Mode" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 683,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                CustomSelect,
                {
                  value: pad.playMode,
                  onChange: (v) => handleUpdate({ playMode: v }),
                  options: [
                    { value: "oneshot", label: "One-Shot" },
                    { value: "sustain", label: "Sustain" }
                  ],
                  className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 684,
                  columnNumber: 19
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 682,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 666,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 text-xs text-text-muted cursor-pointer", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: pad.reverse,
                onChange: (e) => handleUpdate({ reverse: e.target.checked }),
                className: "rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 698,
                columnNumber: 19
              },
              void 0
            ),
            "Reverse"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 697,
            columnNumber: 17
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 696,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
              "Sample Start: ",
              Math.round(pad.sampleStart * 100),
              "%"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 709,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "0",
                max: "100",
                value: Math.round(pad.sampleStart * 100),
                onChange: (e) => handleUpdate({ sampleStart: parseInt(e.target.value) / 100 }),
                className: "w-full"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 712,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 708,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
              "Sample End: ",
              Math.round(pad.sampleEnd * 100),
              "%"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 722,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "0",
                max: "100",
                value: Math.round(pad.sampleEnd * 100),
                onChange: (e) => handleUpdate({ sampleEnd: parseInt(e.target.value) / 100 }),
                className: "w-full"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 725,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 721,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 664,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border pt-3 mt-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "MIDI Trigger" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 738,
            columnNumber: 15
          }, void 0),
          midiMapping ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-text-primary font-mono", children: [
              "Note ",
              midiMapping.note
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 741,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => clearMIDIMapping(String(padId)),
                className: "text-xs text-red-400 hover:text-red-300",
                children: "Clear"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 744,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 740,
            columnNumber: 17
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted mb-2", children: "No MIDI note assigned" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 752,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleMIDILearn,
              className: `w-full px-3 py-2 text-xs font-bold rounded transition-colors ${isLearning ? "animate-pulse bg-amber-600 text-text-primary" : "bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary"}`,
              children: isLearning ? "Hit a MIDI pad..." : "MIDI Learn"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 754,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 737,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => clearPad(padId),
            className: "w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-text-primary text-xs font-bold rounded transition-colors",
            children: "Clear Pad"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 766,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 353,
        columnNumber: 11
      }, void 0),
      activeTab === "adsr" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Attack: ",
            pad.attack,
            "ms"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 778,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "100",
              value: pad.attack,
              onChange: (e) => handleUpdate({ attack: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 781,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 777,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Decay: ",
            pad.decay,
            "ms"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 792,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "2000",
              value: pad.decay,
              onChange: (e) => handleUpdate({ decay: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 795,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mt-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Mode:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 804,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleUpdate({ decayMode: "start" }),
                className: `px-2 py-0.5 text-[10px] font-mono rounded ${pad.decayMode === "start" ? "bg-accent-primary text-text-primary" : "bg-dark-surface text-text-muted"}`,
                children: "START"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 805,
                columnNumber: 17
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleUpdate({ decayMode: "end" }),
                className: `px-2 py-0.5 text-[10px] font-mono rounded ${pad.decayMode === "end" ? "bg-accent-primary text-text-primary" : "bg-dark-surface text-text-muted"}`,
                children: "END"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 813,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 803,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 791,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Sustain: ",
            pad.sustain,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 825,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "100",
              value: pad.sustain,
              onChange: (e) => handleUpdate({ sustain: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 828,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 824,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Release: ",
            pad.release,
            "ms"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 839,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "5000",
              value: pad.release,
              onChange: (e) => handleUpdate({ release: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 842,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 838,
          columnNumber: 13
        }, void 0),
        adsrVisualization
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 776,
        columnNumber: 11
      }, void 0),
      activeTab === "filter" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Filter Type" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 860,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: pad.filterType,
              onChange: (v) => handleUpdate({ filterType: v }),
              options: [
                { value: "off", label: "Off" },
                { value: "lpf", label: "Low Pass" },
                { value: "hpf", label: "High Pass" },
                { value: "bpf", label: "Band Pass" }
              ],
              className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 861,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 859,
          columnNumber: 13
        }, void 0),
        pad.filterType !== "off" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
              "Cutoff: ",
              pad.cutoff,
              "Hz"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 877,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "20",
                max: "20000",
                value: pad.cutoff,
                onChange: (e) => handleUpdate({ cutoff: parseInt(e.target.value) }),
                className: "w-full"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 880,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 876,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
              "Resonance: ",
              pad.resonance,
              "%"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 891,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "0",
                max: "100",
                value: pad.resonance,
                onChange: (e) => handleUpdate({ resonance: parseInt(e.target.value) }),
                className: "w-full"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 894,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 890,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border pt-3 mt-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] font-mono text-text-muted mb-2 uppercase", children: "Filter Envelope" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 906,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
                "Env Amount: ",
                pad.filterEnvAmount,
                "%"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 908,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: "0",
                  max: "100",
                  value: pad.filterEnvAmount,
                  onChange: (e) => handleUpdate({ filterEnvAmount: parseInt(e.target.value) }),
                  className: "w-full"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 911,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 907,
              columnNumber: 19
            }, void 0),
            pad.filterEnvAmount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
                  "F.Attack: ",
                  pad.filterAttack
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 923,
                  columnNumber: 25
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "range",
                    min: "0",
                    max: "100",
                    value: pad.filterAttack,
                    onChange: (e) => handleUpdate({ filterAttack: parseInt(e.target.value) }),
                    className: "w-full"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 926,
                    columnNumber: 25
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 922,
                columnNumber: 23
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
                  "F.Decay: ",
                  pad.filterDecay
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 936,
                  columnNumber: 25
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "input",
                  {
                    type: "range",
                    min: "0",
                    max: "100",
                    value: pad.filterDecay,
                    onChange: (e) => handleUpdate({ filterDecay: parseInt(e.target.value) }),
                    className: "w-full"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 939,
                    columnNumber: 25
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 935,
                columnNumber: 23
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 921,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 905,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 875,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 858,
        columnNumber: 11
      }, void 0),
      activeTab === "velo" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: "Control how velocity affects each parameter. Higher values = more modulation." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 958,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Velocity → Level: ",
            pad.veloToLevel,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 962,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "100",
              value: pad.veloToLevel,
              onChange: (e) => handleUpdate({ veloToLevel: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 965,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: "0% = fixed level, 100% = full velocity range" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 973,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 961,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Velocity → Attack: ",
            pad.veloToAttack,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 976,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "100",
              value: pad.veloToAttack,
              onChange: (e) => handleUpdate({ veloToAttack: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 979,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: "Soft hits get longer attack (transient softening)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 987,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 975,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Velocity → Start: ",
            pad.veloToStart,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 990,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "100",
              value: pad.veloToStart,
              onChange: (e) => handleUpdate({ veloToStart: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 993,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: "Soft hits start later in sample (skip transient)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1001,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 989,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Velocity → Filter: ",
            pad.veloToFilter,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1004,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "0",
              max: "100",
              value: pad.veloToFilter,
              onChange: (e) => handleUpdate({ veloToFilter: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1007,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: "Hard hits open the filter more" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1015,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1003,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: [
            "Velocity → Pitch: ",
            pad.veloToPitch,
            "%"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1018,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "range",
              min: "-100",
              max: "100",
              value: pad.veloToPitch,
              onChange: (e) => handleUpdate({ veloToPitch: parseInt(e.target.value) }),
              className: "w-full"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1021,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: "Velocity-driven pitch bend" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1029,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1017,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 957,
        columnNumber: 11
      }, void 0),
      activeTab === "layers" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: "Layers allow velocity-sensitive sample switching." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1036,
          columnNumber: 13
        }, void 0),
        pad.layers.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-8 text-center text-text-muted border-2 border-dashed border-dark-border rounded", children: "No layers configured" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1040,
          columnNumber: 15
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: pad.layers.map((layer, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "p-3 bg-dark-surface border border-dark-border rounded",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary", children: layer.sample.name }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 1051,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: () => removeLayerFromPad(padId, idx),
                    className: "text-xs text-red-400 hover:text-red-300",
                    children: "Remove"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 1052,
                    columnNumber: 23
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 1050,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2 mt-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted", children: "Vel Min" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 1061,
                    columnNumber: 25
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "input",
                    {
                      type: "number",
                      min: "0",
                      max: "127",
                      value: layer.velocityRange[0],
                      onChange: (e) => updateLayerOnPad(padId, idx, {
                        velocityRange: [parseInt(e.target.value) || 0, layer.velocityRange[1]]
                      }),
                      className: "w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                      lineNumber: 1062,
                      columnNumber: 25
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 1060,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted", children: "Vel Max" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 1074,
                    columnNumber: 25
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "input",
                    {
                      type: "number",
                      min: "0",
                      max: "127",
                      value: layer.velocityRange[1],
                      onChange: (e) => updateLayerOnPad(padId, idx, {
                        velocityRange: [layer.velocityRange[0], parseInt(e.target.value) || 127]
                      }),
                      className: "w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                      lineNumber: 1075,
                      columnNumber: 25
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 1073,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[10px] text-text-muted", children: [
                    "Level ",
                    layer.levelOffset,
                    "dB"
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                    lineNumber: 1087,
                    columnNumber: 25
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "input",
                    {
                      type: "range",
                      min: "-24",
                      max: "24",
                      value: layer.levelOffset,
                      onChange: (e) => updateLayerOnPad(padId, idx, {
                        levelOffset: parseInt(e.target.value)
                      }),
                      className: "w-full"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                      lineNumber: 1088,
                      columnNumber: 25
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                  lineNumber: 1086,
                  columnNumber: 23
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 1059,
                columnNumber: 21
              }, void 0)
            ]
          },
          idx,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1046,
            columnNumber: 19
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1044,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowLayerBrowser(true),
            className: "w-full px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-xs font-bold rounded transition-colors",
            children: "+ Add Layer"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1104,
            columnNumber: 13
          },
          void 0
        ),
        showLayerBrowser && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SamplePackBrowser,
          {
            mode: "drumpad",
            onSelectSample: (sample) => {
              const existingCount = pad.layers.length;
              const rangeSize = Math.floor(128 / (existingCount + 1));
              const min = existingCount * rangeSize;
              const max = existingCount === 0 ? 127 : Math.min(min + rangeSize - 1, 127);
              addLayerToPad(padId, sample, [min, max]);
              setShowLayerBrowser(false);
            },
            onClose: () => setShowLayerBrowser(false)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1112,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 1035,
        columnNumber: 11
      }, void 0),
      activeTab === "dj" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: "Assign a DJ scratch action to this pad. It fires on every hit, in addition to any loaded sample." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1131,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Scratch / Fader Action" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1136,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: pad.scratchAction ?? "",
              onChange: (v) => handleUpdate({ scratchAction: v || void 0 }),
              options: SCRATCH_ACTION_OPTIONS.map(({ value, label }) => ({
                value,
                label
              })),
              className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1137,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1135,
          columnNumber: 13
        }, void 0),
        pad.scratchAction && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 bg-dark-surface border border-dark-border rounded text-xs font-mono", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mb-1", children: "Active action:" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1150,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-accent-primary", children: ((_c = SCRATCH_ACTION_OPTIONS.find((o) => o.value === pad.scratchAction)) == null ? void 0 : _c.label) ?? pad.scratchAction }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1151,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-2", children: "Targets the active playing DJ deck (prefers A over B)." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1154,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1149,
          columnNumber: 15
        }, void 0),
        !pad.scratchAction && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 bg-dark-surface border border-dark-border/50 rounded text-xs text-text-muted font-mono", children: "No DJ action assigned. This pad will only trigger its sample (if loaded)." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1161,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-6 pt-4 border-t border-dark-border", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted mb-3 leading-relaxed", children: [
            "Assign a DJ effect to this pad. ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("strong", { children: "Momentary" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1169,
              columnNumber: 49
            }, void 0),
            " effects engage while held, ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("strong", { children: "one-shot" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1169,
              columnNumber: 103
            }, void 0),
            " effects fire once on press."
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1168,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "DJ FX Action" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1173,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: pad.djFxAction ?? "",
                onChange: (v) => handleUpdate({ djFxAction: v || void 0 }),
                options: (() => {
                  const groups = [];
                  const topLevel = [];
                  let currentGroup = null;
                  let lastCategory = "";
                  for (const { value, label, category } of DJ_FX_OPTIONS) {
                    if (category === "") {
                      topLevel.push({ value, label });
                    } else if (category !== lastCategory) {
                      currentGroup = { label: FX_CATEGORY_LABELS[category] ?? category, options: [{ value, label }] };
                      groups.push(currentGroup);
                    } else {
                      currentGroup.options.push({ value, label });
                    }
                    lastCategory = category;
                  }
                  return [...topLevel, ...groups];
                })(),
                className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
                lineNumber: 1174,
                columnNumber: 17
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1172,
            columnNumber: 15
          }, void 0),
          pad.djFxAction && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 mt-2 bg-dark-surface border border-dark-border rounded text-xs font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mb-1", children: "Active FX:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1201,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-accent-primary", children: ((_d = DJ_FX_ACTIONS.find((a) => a.id === pad.djFxAction)) == null ? void 0 : _d.name) ?? pad.djFxAction }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1202,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted mt-1", children: ((_e = DJ_FX_ACTIONS.find((a) => a.id === pad.djFxAction)) == null ? void 0 : _e.mode) === "momentary" ? "Hold pad to engage, release to disengage" : "Press pad to fire (plays out automatically)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
              lineNumber: 1205,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
            lineNumber: 1200,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
          lineNumber: 1167,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
        lineNumber: 1130,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
      lineNumber: 351,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/PadEditor.tsx",
    lineNumber: 284,
    columnNumber: 5
  }, void 0);
};
const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "warning",
  onConfirm,
  onCancel
}) => {
  useDialogKeyboard({ isOpen, onConfirm, onCancel });
  if (!isOpen) return null;
  const modalAnimation = "animate-in fade-in-0 zoom-in-95 duration-200";
  const variantStyles = {
    danger: {
      icon: "text-red-400",
      button: "bg-red-600 hover:bg-red-700",
      border: "border-red-500/50"
    },
    warning: {
      icon: "text-yellow-400",
      button: "bg-yellow-600 hover:bg-yellow-700",
      border: "border-yellow-500/50"
    },
    info: {
      icon: "text-blue-400",
      button: "bg-blue-600 hover:bg-blue-700",
      border: "border-blue-500/50"
    }
  };
  const styles = variantStyles[variant];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `fixed inset-0 z-[60] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center ${modalAnimation}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `bg-dark-surface border ${styles.border} rounded-lg shadow-2xl max-w-md w-full mx-4 ${modalAnimation}`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-6 py-4 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { className: `w-5 h-5 ${styles.icon}` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
          lineNumber: 63,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-lg font-bold text-text-primary", children: title }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
          lineNumber: 64,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
        lineNumber: 62,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onCancel,
          className: "p-1 hover:bg-dark-border rounded transition-colors",
          "aria-label": "Close",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { className: "w-4 h-4 text-text-muted" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
            lineNumber: 71,
            columnNumber: 13
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
          lineNumber: 66,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
      lineNumber: 61,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-6 py-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted", children: message }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
      lineNumber: 77,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
      lineNumber: 76,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onCancel,
          className: "px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-text-primary text-sm font-bold rounded transition-colors",
          children: cancelLabel
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
          lineNumber: 82,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => {
            onConfirm();
            onCancel();
          },
          className: `px-4 py-2 ${styles.button} text-text-primary text-sm font-bold rounded transition-colors`,
          children: confirmLabel
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
          lineNumber: 88,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
      lineNumber: 81,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
    lineNumber: 59,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ConfirmDialog.tsx",
    lineNumber: 58,
    columnNumber: 5
  }, void 0);
};
class ErrorBoundary extends reactExports.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };
  render() {
    if (this.state.hasError) {
      const { fallbackMessage } = this.props;
      const { error, errorInfo } = this.state;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center min-h-[400px] p-6", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-w-md w-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-surface border border-red-500/50 rounded-lg p-6 space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TriangleAlert, { className: "w-8 h-8 text-red-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
            lineNumber: 67,
            columnNumber: 17
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-lg font-bold text-text-primary", children: "Something went wrong" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 69,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-text-muted", children: fallbackMessage || "An unexpected error occurred in the drum pad system." }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 70,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
            lineNumber: 68,
            columnNumber: 17
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
          lineNumber: 66,
          columnNumber: 15
        }, this),
        error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg rounded p-3 space-y-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-red-400", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("strong", { children: "Error:" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 80,
              columnNumber: 21
            }, this),
            " ",
            error.toString()
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
            lineNumber: 79,
            columnNumber: 19
          }, this),
          errorInfo && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("details", { className: "text-xs font-mono text-text-muted", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("summary", { className: "cursor-pointer hover:text-text-primary", children: "Component Stack" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 84,
              columnNumber: 23
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("pre", { className: "mt-2 whitespace-pre-wrap", children: errorInfo.componentStack }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 87,
              columnNumber: 23
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
            lineNumber: 83,
            columnNumber: 21
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
          lineNumber: 78,
          columnNumber: 17
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: this.handleReset,
              className: "flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-sm font-bold rounded transition-colors",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RefreshCw, { className: "w-4 h-4" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
                  lineNumber: 101,
                  columnNumber: 19
                }, this),
                "Try Again"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 97,
              columnNumber: 17
            },
            this
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => window.location.reload(),
              className: "px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-text-primary text-sm font-bold rounded transition-colors",
              children: "Reload Page"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
              lineNumber: 104,
              columnNumber: 17
            },
            this
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
          lineNumber: 96,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: "If this problem persists, try clearing your browser cache or contact support." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
          lineNumber: 113,
          columnNumber: 15
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
        lineNumber: 64,
        columnNumber: 13
      }, this) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
        lineNumber: 63,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/ErrorBoundary.tsx",
        lineNumber: 62,
        columnNumber: 9
      }, this);
    }
    return this.props.children;
  }
}
const DrumPadManager = ({ onClose }) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  useDrumPadKeyboard();
  const [selectedPadId, setSelectedPadId] = reactExports.useState(null);
  const [showSampleBrowser, setShowSampleBrowser] = reactExports.useState(false);
  const [showPadEditor, setShowPadEditor] = reactExports.useState(false);
  const [confirmDialog, setConfirmDialog] = reactExports.useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {
    }
  });
  const [performanceMode, setPerformanceMode] = reactExports.useState(false);
  const [localMasterLevel, setLocalMasterLevel] = reactExports.useState(null);
  const [localMasterTune, setLocalMasterTune] = reactExports.useState(null);
  const masterLevelTimerRef = reactExports.useRef(null);
  const masterTuneTimerRef = reactExports.useRef(null);
  const {
    programs,
    currentProgramId,
    loadProgram,
    createProgram,
    deleteProgram,
    copyProgram,
    loadSampleToPad,
    saveProgram,
    preferences,
    setPreference,
    busLevels,
    setBusLevel,
    noteRepeatEnabled,
    noteRepeatRate,
    setNoteRepeatEnabled,
    setNoteRepeatRate
  } = useDrumPadStore();
  const allSamplePacks = useAllSamplePacks();
  const allKitSources = React.useMemo(
    () => getAllKitSources(allSamplePacks),
    [allSamplePacks]
  );
  const [selectedKitSourceId, setSelectedKitSourceId] = reactExports.useState(
    ((_a = allKitSources[0]) == null ? void 0 : _a.id) || ""
  );
  const { createInstrument } = useInstrumentStore();
  const handleProgramChange = reactExports.useCallback((programId) => {
    loadProgram(programId);
    setSelectedPadId(null);
  }, [loadProgram]);
  const handleNewProgram = reactExports.useCallback(() => {
    const existingIds = Array.from(programs.keys());
    let letter = "A";
    let number = 1;
    while (existingIds.includes(`${letter}-${String(number).padStart(2, "0")}`)) {
      number++;
      if (number > 99) {
        number = 1;
        letter = String.fromCharCode(letter.charCodeAt(0) + 1);
      }
    }
    const newId = `${letter}-${String(number).padStart(2, "0")}`;
    createProgram(newId, `New Kit ${letter}${number}`);
  }, [programs, createProgram]);
  const handleCopyProgram = reactExports.useCallback(() => {
    const existingIds = Array.from(programs.keys());
    let letter = "A";
    let number = 1;
    while (existingIds.includes(`${letter}-${String(number).padStart(2, "0")}`)) {
      number++;
      if (number > 99) {
        number = 1;
        letter = String.fromCharCode(letter.charCodeAt(0) + 1);
      }
    }
    const newId = `${letter}-${String(number).padStart(2, "0")}`;
    copyProgram(currentProgramId, newId);
    loadProgram(newId);
  }, [programs, currentProgramId, copyProgram, loadProgram]);
  const handleDeleteProgram = reactExports.useCallback(() => {
    if (programs.size <= 1) {
      setConfirmDialog({
        isOpen: true,
        title: "Cannot Delete",
        message: "Cannot delete the last program. At least one program must exist.",
        onConfirm: () => {
        }
      });
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: "Delete Program",
      message: `Are you sure you want to delete program ${currentProgramId}? This action cannot be undone.`,
      onConfirm: () => {
        deleteProgram(currentProgramId);
      }
    });
  }, [programs.size, currentProgramId, deleteProgram]);
  const handleEmptyPadClick = reactExports.useCallback((padId) => {
    setSelectedPadId(padId);
    setShowPadEditor(true);
  }, []);
  const handleLoadSample = reactExports.useCallback((sample) => {
    if (selectedPadId !== null) {
      loadSampleToPad(selectedPadId, sample);
    }
  }, [selectedPadId, loadSampleToPad]);
  const handleLoadKit = reactExports.useCallback(() => {
    try {
      const selectedSource = allKitSources.find((s) => s.id === selectedKitSourceId);
      if (!selectedSource) {
        throw new Error("Kit source not found");
      }
      const createdIds = loadKitSource(
        selectedSource,
        allSamplePacks,
        createInstrument
      );
      setConfirmDialog({
        isOpen: true,
        title: "Kit Loaded",
        message: `Successfully added ${createdIds.length} instruments from "${selectedSource.name}" to your instrument list.`,
        onConfirm: () => {
        }
      });
    } catch (error) {
      console.error("[DrumPadManager] Failed to load kit:", error);
      setConfirmDialog({
        isOpen: true,
        title: "Error Loading Kit",
        message: `Failed to load drum kit. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        onConfirm: () => {
        }
      });
    }
  }, [selectedKitSourceId, allKitSources, allSamplePacks, createInstrument]);
  const handleMasterLevelChange = reactExports.useCallback((level) => {
    setLocalMasterLevel(level);
    if (masterLevelTimerRef.current) {
      clearTimeout(masterLevelTimerRef.current);
    }
    masterLevelTimerRef.current = setTimeout(() => {
      const currentProgram = programs.get(currentProgramId);
      if (currentProgram) {
        saveProgram({
          ...currentProgram,
          masterLevel: level
        });
        setLocalMasterLevel(null);
      }
    }, 300);
  }, [programs, currentProgramId, saveProgram]);
  const handleMasterTuneChange = reactExports.useCallback((tune) => {
    setLocalMasterTune(tune);
    if (masterTuneTimerRef.current) {
      clearTimeout(masterTuneTimerRef.current);
    }
    masterTuneTimerRef.current = setTimeout(() => {
      const currentProgram = programs.get(currentProgramId);
      if (currentProgram) {
        saveProgram({
          ...currentProgram,
          masterTune: tune
        });
        setLocalMasterTune(null);
      }
    }, 300);
  }, [programs, currentProgramId, saveProgram]);
  reactExports.useEffect(() => {
    return () => {
      if (masterLevelTimerRef.current) {
        clearTimeout(masterLevelTimerRef.current);
      }
      if (masterTuneTimerRef.current) {
        clearTimeout(masterTuneTimerRef.current);
      }
    };
  }, []);
  const currentBank = useDrumPadStore((s) => s.currentBank);
  reactExports.useEffect(() => {
    const keyToPadIndex = {
      // Top row: Q W E R (pads 0-3)
      "q": 0,
      "w": 1,
      "e": 2,
      "r": 3,
      // Second row: A S D F (pads 4-7)
      "a": 4,
      "s": 5,
      "d": 6,
      "f": 7,
      // Third row: Z X C V (pads 8-11)
      "z": 8,
      "x": 9,
      "c": 10,
      "v": 11,
      // Fourth row: T G B N (pads 12-15)
      "t": 12,
      "g": 13,
      "b": 14,
      "n": 15
    };
    const handleKeyDown = (event) => {
      const target = event.target;
      const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      const key = event.key.toLowerCase();
      const padIndex = keyToPadIndex[key];
      if (padIndex !== void 0) {
        if (!isInputFocused) {
          const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
          const padId = bankOffset + padIndex + 1;
          const program = programs.get(currentProgramId);
          if (program) {
            event.preventDefault();
            const pad = program.pads.find((p) => p.id === padId);
            if ((pad == null ? void 0 : pad.sample) || (pad == null ? void 0 : pad.instrumentId) != null || (pad == null ? void 0 : pad.synthConfig)) {
              const padButton = document.querySelector(`[data-pad-id="${padId}"]`);
              if (padButton) {
                const rect = padButton.getBoundingClientRect();
                const mouseEvent = new MouseEvent("mousedown", {
                  bubbles: true,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height * 0.3
                  // Upper area = medium velocity
                });
                padButton.dispatchEvent(mouseEvent);
              }
            }
          }
        }
      }
      if (event.key === "Escape") {
        if (performanceMode) {
          setPerformanceMode(false);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [programs, currentProgramId, currentBank, onClose, performanceMode]);
  const isViewMode = !onClose;
  const content = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: isViewMode ? "flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono" : "fixed inset-0 z-[99990] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-300", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: isViewMode ? "flex flex-col h-full w-full overflow-hidden" : "bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-8 duration-400", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex items-center justify-between px-4 py-2 shrink-0 border-b border-dark-border ${performanceMode ? "bg-dark-bg" : "bg-dark-bgSecondary"}`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        isViewMode && !performanceMode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: "drumpad",
              onChange: (val) => {
                if (val !== "drumpad") {
                  useUIStore.getState().setActiveView(val);
                }
              },
              options: [
                { value: "tracker", label: "Tracker" },
                { value: "grid", label: "Grid" },
                { value: "pianoroll", label: "Piano Roll" },
                { value: "tb303", label: "TB-303" },
                { value: "arrangement", label: "Arrangement" },
                { value: "dj", label: "DJ Mixer" },
                { value: "drumpad", label: "Drum Pads" },
                { value: "vj", label: "VJ View" }
              ],
              className: "px-3 py-1.5 rounded-md text-xs font-mono font-bold tracking-widest uppercase border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary",
              title: "Switch view"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 336,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-4 w-px bg-dark-border" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 356,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 335,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-sm font-bold tracking-widest uppercase text-accent-primary", children: performanceMode ? "LIVE" : "DRUM PADS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 359,
          columnNumber: 13
        }, void 0),
        !performanceMode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-[10px] text-text-muted uppercase tracking-wider", children: "MPC-style 64-pad drum machine" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 363,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 333,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setPerformanceMode(!performanceMode),
            className: `px-3 py-1.5 text-xs font-mono border rounded transition-colors flex items-center gap-1.5 ${performanceMode ? "bg-accent-primary text-text-primary border-accent-primary" : "text-text-muted hover:text-text-primary bg-dark-bgTertiary border-dark-border"}`,
            title: performanceMode ? "Exit performance mode (Esc)" : "Performance mode — fullscreen pads",
            children: [
              performanceMode ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minimize2, { className: "w-3.5 h-3.5" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 378,
                columnNumber: 34
              }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Maximize2, { className: "w-3.5 h-3.5" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 378,
                columnNumber: 74
              }, void 0),
              performanceMode ? "EXIT" : "PERFORM"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 369,
            columnNumber: 13
          },
          void 0
        ),
        !performanceMode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => useUIStore.getState().openModal("midi-pads"),
            className: "px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text-primary bg-dark-bgTertiary border border-dark-border rounded transition-colors flex items-center gap-1.5",
            title: "Open MIDI Pad Mapper",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Piano, { className: "w-3.5 h-3.5" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 387,
                columnNumber: 17
              }, void 0),
              "MIDI Map"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 382,
            columnNumber: 15
          },
          void 0
        ),
        onClose && !performanceMode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "p-2 hover:bg-dark-border rounded-lg transition-colors",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { className: "w-5 h-5 text-text-muted" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 396,
              columnNumber: 17
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 392,
            columnNumber: 15
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 368,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
      lineNumber: 330,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ErrorBoundary, { fallbackMessage: "An error occurred in the drum pad interface.", children: performanceMode ? (
      /* Performance Mode: fullscreen pads with minimal controls */
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center overflow-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { width: "100%", maxWidth: "min(800px, calc(100vh - 176px))" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PadGrid,
        {
          onPadSelect: setSelectedPadId,
          onEmptyPadClick: handleEmptyPadClick,
          selectedPadId
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 408,
          columnNumber: 17
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 407,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 406,
        columnNumber: 13
      }, void 0)
    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4 p-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        PadGrid,
        {
          onPadSelect: setSelectedPadId,
          onEmptyPadClick: handleEmptyPadClick,
          selectedPadId
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 421,
          columnNumber: 17
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 420,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 419,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-2", children: "PROGRAM" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 433,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: currentProgramId,
              onChange: (v) => handleProgramChange(v),
              options: Array.from(programs.entries()).map(([id, program]) => ({
                value: id,
                label: `${id} - ${program.name}`
              })),
              className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 434,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 gap-2 mt-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handleNewProgram,
                className: "px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-xs font-bold rounded transition-colors",
                children: "+ New"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 445,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handleCopyProgram,
                className: "px-3 py-2 bg-blue-600 hover:bg-blue-700 text-text-primary text-xs font-bold rounded transition-colors",
                children: "Copy"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 451,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handleDeleteProgram,
                className: "px-3 py-2 bg-red-600 hover:bg-red-700 text-text-primary text-xs font-bold rounded transition-colors",
                disabled: programs.size <= 1,
                children: "Delete"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 457,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 444,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Kit Source" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 468,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: selectedKitSourceId,
                onChange: (v) => setSelectedKitSourceId(v),
                options: allKitSources.map((source) => ({
                  value: source.id,
                  label: `${source.type === "preset" ? "🎵 " : "📦 "}${source.name}`
                })),
                className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 469,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-text-muted mt-1", children: ((_b = allKitSources.find((s) => s.id === selectedKitSourceId)) == null ? void 0 : _b.description) || "" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 478,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 467,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: handleLoadKit,
              className: "w-full mt-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-text-primary text-xs font-bold rounded transition-colors flex items-center justify-center gap-2",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { className: "w-3 h-3" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                  lineNumber: 488,
                  columnNumber: 19
                }, void 0),
                "Add to Instruments"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 484,
              columnNumber: 17
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 432,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-3", children: "MASTER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 495,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted", children: [
                "Level: ",
                localMasterLevel !== null ? localMasterLevel : ((_c = programs.get(currentProgramId)) == null ? void 0 : _c.masterLevel) || 100
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 498,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: "0",
                  max: "127",
                  value: localMasterLevel !== null ? localMasterLevel : ((_d = programs.get(currentProgramId)) == null ? void 0 : _d.masterLevel) || 100,
                  onChange: (e) => handleMasterLevelChange(parseInt(e.target.value)),
                  className: "w-full"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                  lineNumber: 501,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 497,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted", children: [
                "Tune: ",
                localMasterTune !== null ? localMasterTune : ((_e = programs.get(currentProgramId)) == null ? void 0 : _e.masterTune) || 0,
                " st"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 511,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: "-12",
                  max: "12",
                  value: localMasterTune !== null ? localMasterTune : ((_f = programs.get(currentProgramId)) == null ? void 0 : _f.masterTune) || 0,
                  onChange: (e) => handleMasterTuneChange(parseInt(e.target.value)),
                  className: "w-full"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                  lineNumber: 514,
                  columnNumber: 21
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 510,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 496,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 494,
          columnNumber: 15
        }, void 0),
        (() => {
          const currentProg = programs.get(currentProgramId);
          const busesInUse = ["out1", "out2", "out3", "out4"].filter(
            (bus) => currentProg == null ? void 0 : currentProg.pads.some((p) => p.output === bus)
          );
          if (busesInUse.length === 0) return null;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-3", children: "OUTPUT BUSES" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 535,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: busesInUse.map((bus) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted", children: [
                bus,
                ": ",
                busLevels[bus] ?? 100
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 539,
                columnNumber: 27
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "range",
                  min: "0",
                  max: "127",
                  value: busLevels[bus] ?? 100,
                  onChange: (e) => setBusLevel(bus, parseInt(e.target.value)),
                  className: "w-full"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                  lineNumber: 542,
                  columnNumber: 27
                },
                void 0
              )
            ] }, bus, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 538,
              columnNumber: 25
            }, void 0)) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 536,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 534,
            columnNumber: 19
          }, void 0);
        })(),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-3", children: "SETTINGS" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 559,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-xs text-text-muted", children: [
              "Velocity Sensitivity: ",
              preferences.velocitySensitivity.toFixed(1),
              "x"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 561,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "range",
                min: "0",
                max: "2",
                step: "0.1",
                value: preferences.velocitySensitivity,
                onChange: (e) => setPreference("velocitySensitivity", parseFloat(e.target.value)),
                className: "w-full"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 564,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 560,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 558,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-3", children: "NOTE REPEAT" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 578,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 text-xs text-text-muted cursor-pointer mb-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: noteRepeatEnabled,
                onChange: (e) => setNoteRepeatEnabled(e.target.checked),
                className: "rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 580,
                columnNumber: 19
              },
              void 0
            ),
            "Enable"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 579,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: ["1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"].map((rate) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setNoteRepeatRate(rate),
              className: `px-2 py-1 text-[10px] font-mono rounded transition-colors ${noteRepeatRate === rate ? "bg-accent-primary text-text-primary" : "bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary"}`,
              children: rate
            },
            rate,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 590,
              columnNumber: 21
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 588,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 577,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-3", children: "MPC RESAMPLING" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 607,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 text-xs text-text-muted cursor-pointer mb-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: ((_h = (_g = programs.get(currentProgramId)) == null ? void 0 : _g.mpcResample) == null ? void 0 : _h.enabled) ?? false,
                onChange: (e) => {
                  var _a2;
                  const currentProg = programs.get(currentProgramId);
                  if (currentProg) {
                    saveProgram({
                      ...currentProg,
                      mpcResample: {
                        enabled: e.target.checked,
                        model: ((_a2 = currentProg.mpcResample) == null ? void 0 : _a2.model) ?? "MPC60"
                      }
                    });
                  }
                },
                className: "rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 609,
                columnNumber: 19
              },
              void 0
            ),
            "Enable on sample load"
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 608,
            columnNumber: 17
          }, void 0),
          ((_j = (_i = programs.get(currentProgramId)) == null ? void 0 : _i.mpcResample) == null ? void 0 : _j.enabled) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs text-text-muted mb-1", children: "Model" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 630,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              CustomSelect,
              {
                value: ((_l = (_k = programs.get(currentProgramId)) == null ? void 0 : _k.mpcResample) == null ? void 0 : _l.model) ?? "MPC60",
                onChange: (v) => {
                  const currentProg = programs.get(currentProgramId);
                  if (currentProg) {
                    saveProgram({
                      ...currentProg,
                      mpcResample: {
                        enabled: true,
                        model: v
                      }
                    });
                  }
                },
                options: [
                  { value: "MPC60", label: "MPC 60 (12-bit, 40kHz)" },
                  { value: "MPC3000", label: "MPC 3000 (16-bit, 44.1kHz)" },
                  { value: "SP1200", label: "SP-1200 (12-bit, 26kHz)" },
                  { value: "MPC2000XL", label: "MPC 2000XL (16-bit, 44.1kHz)" }
                ],
                className: "w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                lineNumber: 631,
                columnNumber: 21
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted mt-1", children: "Samples loaded to pads will be processed through the selected MPC emulation." }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 653,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 629,
            columnNumber: 19
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 606,
          columnNumber: 15
        }, void 0),
        selectedPadId !== null && (() => {
          var _a2;
          const selectedPad = (_a2 = programs.get(currentProgramId)) == null ? void 0 : _a2.pads.find((p) => p.id === selectedPadId);
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-2", children: [
              "PAD ",
              selectedPadId
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 665,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary mb-1", children: (selectedPad == null ? void 0 : selectedPad.name) || "Empty" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 668,
              columnNumber: 21
            }, void 0),
            (selectedPad == null ? void 0 : selectedPad.sample) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-emerald-400 font-mono mb-1", children: [
              "Sample: ",
              selectedPad.sample.name
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 672,
              columnNumber: 23
            }, void 0),
            (selectedPad == null ? void 0 : selectedPad.instrumentId) != null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-blue-400 font-mono mb-1", children: [
              "Inst #",
              selectedPad.instrumentId
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 677,
              columnNumber: 23
            }, void 0),
            (selectedPad == null ? void 0 : selectedPad.synthConfig) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-blue-400 font-mono mb-1", children: [
              "Synth: ",
              selectedPad.synthConfig.synthType
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 682,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2 mt-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowSampleBrowser(true),
                  className: "w-full px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-xs font-bold rounded transition-colors",
                  children: "Load Sample"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                  lineNumber: 687,
                  columnNumber: 23
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => setShowPadEditor(true),
                  className: "w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-text-primary text-xs font-bold rounded transition-colors",
                  children: "Assign Instrument / Edit"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
                  lineNumber: 693,
                  columnNumber: 23
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 686,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 664,
            columnNumber: 19
          }, void 0);
        })(),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-text-muted mb-2", children: "SHORTCUTS" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 706,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 text-xs text-text-muted font-mono", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "Click: Trigger pad" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 708,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "Shift+Click: Select pad" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 709,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: "Q-P / A-; / Z-/: Trigger pads" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
              lineNumber: 710,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 707,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 705,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 430,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
      lineNumber: 417,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
      lineNumber: 416,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
      lineNumber: 403,
      columnNumber: 9
    }, void 0),
    showSampleBrowser && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "animate-in fade-in-0 duration-200", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SamplePackBrowser,
      {
        mode: "drumpad",
        onSelectSample: handleLoadSample,
        onClose: () => setShowSampleBrowser(false)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 722,
        columnNumber: 13
      },
      void 0
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
      lineNumber: 721,
      columnNumber: 11
    }, void 0),
    showPadEditor && selectedPadId !== null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "fixed inset-0 z-[99990] bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in-0 duration-200",
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) setShowPadEditor(false);
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-w-2xl w-full mx-4 max-h-[85vh] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          PadEditor,
          {
            padId: selectedPadId,
            onClose: () => setShowPadEditor(false)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
            lineNumber: 737,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
          lineNumber: 736,
          columnNumber: 13
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 732,
        columnNumber: 11
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      ConfirmDialog,
      {
        isOpen: confirmDialog.isOpen,
        title: confirmDialog.title,
        message: confirmDialog.message,
        variant: programs.size <= 1 ? "warning" : "danger",
        confirmLabel: programs.size <= 1 ? "OK" : "Delete",
        onConfirm: confirmDialog.onConfirm,
        onCancel: () => setConfirmDialog({ ...confirmDialog, isOpen: false })
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
        lineNumber: 746,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
    lineNumber: 324,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/drumpad/DrumPadManager.tsx",
    lineNumber: 319,
    columnNumber: 5
  }, void 0);
  return content;
};
export {
  DrumPadManager
};
