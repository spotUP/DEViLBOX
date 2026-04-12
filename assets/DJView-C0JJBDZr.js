const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/DJ3DOverlay-CXli-F_O.js","assets/react-three-fiber.esm-C9Qiy9wi.js","assets/index-BU-6pTuc.js","assets/DJActions-Ap2A5JjP.js","assets/parseModuleToSong-B-Yqzlmn.js","assets/useDeckStateSync-BIQewTIw.js"])))=>i.map(i=>d[i]);
import { b as useDJStore, eu as getQuantizeMode, eF as setQuantizeMode, dD as getDJEngine, fr as OffscreenBridge, a1 as useThemeStore, fs as createVisualizerState, ft as isAudioMotionMode, fu as createRendererCache, fv as destroyRendererCache, fw as AudioMotionVisualizer, fx as AM_PRESET_MAP, fy as MODE_LABELS, fz as VISUALIZER_MODES, fA as RENDERERS, eH as OMEGA_NORMAL, dE as TurntablePhysics, fB as SCRATCH_PATTERNS, et as quantizedEQKill, eG as instantEQKill, fC as echoOut, fD as filterReset, fE as filterSweep, am as __vitePreload, fF as isUADEFormat, aB as Knob, fG as cancelAllAutomation, ej as beatMatchedTransition, fH as onNextDownbeat, fI as DJCueEngine, W as CustomSelect, ev as useDJSetStore, fJ as useAuthStore, fK as uploadBlob, fL as saveDJSet, fM as DJMicEngine, u as useDJPlaylistStore, fN as useThirdDeckActive, fO as getModlandStatus, fP as getModlandFormats, fQ as searchModland, fR as searchHVSC, fS as batchGetRatings, fT as removeRating, fU as setRating, fV as downloadHVSCFile, fW as downloadModlandFile, fX as downloadTFMXCompanion, fY as StarRating, as as useAudioStore, fZ as pushToCloud, f_ as SYNC_KEYS, ak as getDefaultEffectParameters, eJ as useClickOutside, aC as MASTER_FX_PRESETS, a as useUIStore, at as getDJEngineIfActive, eB as useVocoderStore, f$ as VocoderEngine, g0 as unregisterPTTHandlers, g1 as VOCODER_FX_PRESETS, g2 as VOCODER_PRESETS, g3 as registerPTTHandlers, g4 as getPhaseInfo, ax as useTransportStore, $ as getToneEngine, g5 as disposeDJEngine, g6 as onNextBeat } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, ac as Pause, s as Play, B as Disc3, aO as Link, aP as Lock, d as ChevronLeft, b as ChevronRight, R as React, ab as Shuffle, al as Minimize2, am as Maximize2, aQ as ArrowRightLeft, Z as Zap, X, aR as Headphones, m as LoaderCircle, U as Upload, A as Music, aS as ListPlus, P as Plus, aT as PenLine, p as Trash2, aU as ArrowUpDown, C as Check, aV as GripVertical, G as Globe, S as Search, a8 as CircleAlert, aW as FolderOpen, aj as HardDrive, aX as ListMusic, h as ChevronDown, aa as Star, aY as Cloud, aZ as CloudOff, ad as SkipForward, aL as SlidersHorizontal, ah as getDefaultExportFromCjs } from "./vendor-ui-AJ7AT9BN.js";
import { getContext, start } from "./vendor-tone-48TQc1H3.js";
import { t as togglePlay, o as cueDeck, z as setDeckKeyLock, A as syncDeckBPM, B as camelotDisplay, C as keyCompatibility, E as keyCompatibilityColor, F as camelotColor, G as seekDeckAudio, a as startScratch, b as setScratchVelocity, c as stopScratch, H as playDeckPattern, I as finishDeckPatternCycle, J as stopDeckPattern, K as stopDeckFaderLFO, L as startDeckFaderLFO, M as setDeckPitch, N as setDeckChannelMuteMask, O as cacheSong, P as detectBPM, g as getDJPipeline, y as setDeckFilter, v as setDeckEQ, Q as setDeckEQKill, u as setDeckTrimGain, q as setDeckVolume, j as setCrossfader, x as setCrossfaderCurve, r as setMasterVolume, R as stopRecording, S as startRecording, T as estimateSongDuration, U as getCachedFilenames, V as cacheSourceFile, W as sortByName, X as sortByEnergy, Y as sortByKey, Z as sortByBPM, _ as smartSort, d as disableAutoDJ, e as enableAutoDJ, $ as resumeAutoDJ, a0 as pauseAutoDJ, s as skipAutoDJ, a1 as playAutoDJFromIndex, a2 as clearSongCache } from "./DJActions-Ap2A5JjP.js";
import { i as isAudioFile, p as parseModuleToSong } from "./parseModuleToSong-B-Yqzlmn.js";
import { u as useDeckVisualizationData, m as markSeek, b as beatJump, l as loadUADEToDeck, D as DJVideoRecorder, i as isUADECached, p as pickAndReadSeratoLibrary, a as autoDetectSeratoLibrary, g as getPresetById, c as getDJControllerMapper, d as DJ_CONTROLLER_PRESETS, e as DJRemoteMicReceiver, f as useDJKeyboardHandler, h as useDeckStateSync } from "./useDeckStateSync-BIQewTIw.js";
import { A as AudioDataBus } from "./AudioDataBus-DGyOo1ms.js";
import { g as getCaptureCanvas, D as DJVideoCapture } from "./DJVideoCapture-DWBKuoDP.js";
import { A as AVAILABLE_EFFECTS } from "./unifiedEffects-Cd2Pk46Y.js";
import { GUITARML_MODEL_REGISTRY } from "./guitarMLRegistry-CdfjBfrw.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-react-Dgd_wxYf.js";
const DeckTransport = ({ deckId }) => {
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const cuePoint = useDJStore((s) => s.decks[deckId].cuePoint);
  const keyLockEnabled = useDJStore((s) => s.decks[deckId].keyLockEnabled);
  const pendingAction = useDJStore((s) => s.decks[deckId].pendingAction);
  const otherDeckId = deckId === "A" ? "B" : "A";
  const thisBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);
  const isSynced = Math.abs(thisBPM - otherBPM) < 0.5;
  const [qMode, setQMode] = reactExports.useState(getQuantizeMode);
  const [isStartingPlay, setIsStartingPlay] = reactExports.useState(false);
  const playPending = (pendingAction == null ? void 0 : pendingAction.kind) === "play";
  const cuePending = (pendingAction == null ? void 0 : pendingAction.kind) === "cue";
  const isPending = isStartingPlay || playPending;
  const handlePlayPause = reactExports.useCallback(async () => {
    if (!isPlaying) setIsStartingPlay(true);
    await togglePlay(deckId);
    setIsStartingPlay(false);
  }, [deckId, isPlaying]);
  const handleCue = reactExports.useCallback(() => {
    cueDeck(deckId, cuePoint);
  }, [deckId, cuePoint]);
  const handleQuantizeCycle = reactExports.useCallback(() => {
    const modes = ["off", "beat", "bar"];
    const nextIdx = (modes.indexOf(qMode) + 1) % modes.length;
    const next = modes[nextIdx];
    setQuantizeMode(next);
    setQMode(next);
  }, [qMode]);
  const handleKeyLock = reactExports.useCallback(() => {
    setDeckKeyLock(deckId, !keyLockEnabled);
  }, [deckId, keyLockEnabled]);
  const handleSync = reactExports.useCallback(() => {
    syncDeckBPM(deckId, otherDeckId);
  }, [deckId, otherDeckId]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handlePlayPause,
        disabled: isPending,
        className: `
          flex items-center justify-center w-10 h-10 rounded-lg
          transition-all duration-100 border border-dark-border
          active:translate-y-[1px]
          ${isPending ? "bg-yellow-600 text-text-primary animate-pulse" : isPlaying ? "bg-green-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}
        `,
        title: isPending ? "Waiting for beat..." : isPlaying ? "Pause" : "Play",
        children: isPlaying ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Pause, { size: 18 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
          lineNumber: 82,
          columnNumber: 22
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 18 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
          lineNumber: 82,
          columnNumber: 44
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
        lineNumber: 65,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleCue,
        className: `
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${cuePending ? "bg-accent-primary/30 text-accent-primary animate-pulse" : "bg-dark-bgTertiary text-accent-warning hover:bg-dark-bgHover"}
        `,
        title: cuePending ? "Waiting for beat..." : "Cue",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 18 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
          lineNumber: 99,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
        lineNumber: 86,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleSync,
        className: `
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${isSynced ? "bg-accent-highlight/30 text-accent-highlight" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary"}
        `,
        title: "Sync",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { size: 16 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
          lineNumber: 118,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
        lineNumber: 103,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleQuantizeCycle,
        className: `
          flex items-center justify-center h-10 px-2.5 rounded-lg
          border text-[11px] font-bold tracking-wide
          active:translate-y-[1px]
          transition-all duration-100
          ${qMode === "off" ? "bg-dark-bgTertiary text-text-muted border-dark-border hover:bg-dark-bgHover" : qMode === "beat" ? "bg-violet-600/40 text-violet-200 border-violet-400/60 shadow-[0_0_6px_rgba(139,92,246,0.3)]" : "bg-fuchsia-600/40 text-fuchsia-200 border-fuchsia-400/60 shadow-[0_0_6px_rgba(217,70,239,0.3)]"}
        `,
        title: `Quantize: ${qMode.toUpperCase()}
OFF = free play
BEAT = snap to beat
BAR = snap to bar
(click to cycle)`,
        children: qMode === "off" ? "Q" : qMode === "beat" ? "Q:BT" : "Q:BR"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
        lineNumber: 122,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleKeyLock,
        className: `
          flex items-center justify-center w-10 h-10 rounded-lg
          border border-dark-border
          active:translate-y-[1px]
          transition-all duration-100
          ${keyLockEnabled ? "bg-amber-600/30 text-amber-300 border-amber-500/40" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary"}
        `,
        title: keyLockEnabled ? "Key Lock ON — pitch slider changes tempo only" : "Key Lock OFF — pitch and tempo coupled",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Lock, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
          lineNumber: 158,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
        lineNumber: 143,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTransport.tsx",
    lineNumber: 63,
    columnNumber: 5
  }, void 0);
};
const PITCH_MIN = -16;
const PITCH_MAX = 16;
const HANDLE_HEIGHT = 24;
const DeckPitchSlider = ({ deckId }) => {
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const setDeckPitch2 = useDJStore((s) => s.setDeckPitch);
  const pitchRef = reactExports.useRef(pitchOffset);
  reactExports.useEffect(() => {
    pitchRef.current = pitchOffset;
  }, [pitchOffset]);
  const trackRef = reactExports.useRef(null);
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const [trackHeight, setTrackHeight] = reactExports.useState(200);
  reactExports.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      var _a;
      const h = (_a = entries[0]) == null ? void 0 : _a.contentRect.height;
      if (h && h > 0) setTrackHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pitchToY = reactExports.useCallback((pitch) => {
    const normalized = (PITCH_MAX - pitch) / (PITCH_MAX - PITCH_MIN);
    return normalized * (trackHeight - HANDLE_HEIGHT);
  }, [trackHeight]);
  const yToPitch = reactExports.useCallback((y) => {
    const clamped = Math.max(0, Math.min(trackHeight - HANDLE_HEIGHT, y));
    const normalized = clamped / (trackHeight - HANDLE_HEIGHT);
    return PITCH_MAX - normalized * (PITCH_MAX - PITCH_MIN);
  }, [trackHeight]);
  const updatePitch = reactExports.useCallback(
    (clientY) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const y = clientY - rect.top - HANDLE_HEIGHT / 2;
      const newPitch = Math.round(yToPitch(y) * 10) / 10;
      setDeckPitch2(deckId, newPitch);
    },
    [deckId, setDeckPitch2, yToPitch]
  );
  const handleMouseDown = reactExports.useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(true);
      updatePitch(e.clientY);
    },
    [updatePitch]
  );
  reactExports.useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      updatePitch(e.clientY);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updatePitch]);
  const handleDoubleClick = reactExports.useCallback(() => {
    setDeckPitch2(deckId, 0);
  }, [deckId, setDeckPitch2]);
  const handleY = pitchToY(pitchOffset);
  const centerY = pitchToY(0);
  const displayValue = pitchOffset > 0 ? `+${pitchOffset.toFixed(1)}` : pitchOffset < 0 ? pitchOffset.toFixed(1) : "0.0";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2 select-none h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: trackRef,
        className: "relative cursor-pointer flex-1 min-h-0",
        style: { width: 32 },
        onMouseDown: handleMouseDown,
        onDoubleClick: handleDoubleClick,
        onContextMenu: (e) => {
          e.preventDefault();
          setDeckPitch2(deckId, 0);
        },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute left-1/2 -translate-x-1/2 rounded-sm top-0 bottom-0",
              style: {
                width: 6,
                backgroundColor: "rgba(0,0,0,0.6)",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.8)"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
              lineNumber: 125,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute left-0 right-0",
              style: {
                top: centerY + HANDLE_HEIGHT / 2 - 1,
                height: 2,
                backgroundColor: "rgba(255,255,255,0.3)"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
              lineNumber: 135,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute left-0 right-0 rounded-sm",
              style: {
                top: handleY,
                height: HANDLE_HEIGHT,
                background: "linear-gradient(to bottom, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.2) 40%, rgba(255,255,255,0.15) 100%)",
                border: "1px solid rgba(255,255,255,0.2)",
                boxShadow: isDragging ? "0 0 8px var(--color-accent-glow, rgba(255,255,255,0.3)), inset 0 1px 0 rgba(255,255,255,0.2)" : "inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 3px rgba(0,0,0,0.5)",
                cursor: isDragging ? "grabbing" : "grab"
              },
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-x-1 top-1/2 -translate-y-1/2 flex flex-col gap-[2px]", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-[1px] bg-black/30" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
                  lineNumber: 160,
                  columnNumber: 13
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-[1px] bg-white/20" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
                  lineNumber: 161,
                  columnNumber: 13
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-[1px] bg-black/30" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
                  lineNumber: 162,
                  columnNumber: 13
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-[1px] bg-white/20" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
                  lineNumber: 163,
                  columnNumber: 13
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-[1px] bg-black/30" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
                  lineNumber: 164,
                  columnNumber: 13
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
                lineNumber: 159,
                columnNumber: 11
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
              lineNumber: 145,
              columnNumber: 9
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
        lineNumber: 116,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "font-mono text-xs text-text-secondary text-center shrink-0",
        style: { minWidth: 48 },
        children: [
          displayValue,
          " st"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
        lineNumber: 170,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPitchSlider.tsx",
    lineNumber: 114,
    columnNumber: 5
  }, void 0);
};
const SOFT_OFFSET = 2;
const SOFT_TICKS = 8;
const HARD_OFFSET = 5;
const HARD_TICKS = 16;
const DeckNudge = ({ deckId }) => {
  const handleNudge = reactExports.useCallback(
    (direction, e) => {
      const isHard = e.shiftKey;
      const offset = direction * (isHard ? HARD_OFFSET : SOFT_OFFSET);
      const ticks = isHard ? HARD_TICKS : SOFT_TICKS;
      const engine = getDJEngine();
      engine.getDeck(deckId).nudge(offset, ticks);
    },
    [deckId]
  );
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: (e) => handleNudge(-1, e),
        className: "\n          flex items-center justify-center w-10 h-10 rounded-lg\n          bg-dark-bgTertiary text-text-secondary border border-dark-border\n          hover:bg-dark-bgHover hover:text-text-primary\n          active:translate-y-[1px]\n          transition-all duration-100\n        ",
        title: "Nudge slower (Shift = hard nudge)",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 18 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckNudge.tsx",
          lineNumber: 48,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckNudge.tsx",
        lineNumber: 37,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: (e) => handleNudge(1, e),
        className: "\n          flex items-center justify-center w-10 h-10 rounded-lg\n          bg-dark-bgTertiary text-text-secondary border border-dark-border\n          hover:bg-dark-bgHover hover:text-text-primary\n          active:translate-y-[1px]\n          transition-all duration-100\n        ",
        title: "Nudge faster (Shift = hard nudge)",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 18 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckNudge.tsx",
          lineNumber: 63,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckNudge.tsx",
        lineNumber: 52,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckNudge.tsx",
    lineNumber: 35,
    columnNumber: 5
  }, void 0);
};
const BEAT_COUNT = 4;
const ON_BEAT_THRESHOLD = 0.12;
const DeckBeatPhase = ({ deckId }) => {
  const hasBeatGrid = useDJStore((s) => !!s.decks[deckId].beatGrid);
  const timeSignature = useDJStore((s) => {
    var _a;
    return ((_a = s.decks[deckId].beatGrid) == null ? void 0 : _a.timeSignature) ?? 4;
  });
  const viz = useDeckVisualizationData(deckId);
  const [phase, setPhase] = reactExports.useState(null);
  const rafRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  reactExports.useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      if (!mountedRef.current) return;
      setPhase(viz.getBeatPhase());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId, viz]);
  const currentBeat = phase ? Math.floor(phase.barPhase * timeSignature) % BEAT_COUNT : -1;
  const subBeatPhase = phase ? phase.beatPhase : 0;
  const isOnBeat = subBeatPhase < ON_BEAT_THRESHOLD || subBeatPhase > 1 - ON_BEAT_THRESHOLD;
  const isA = deckId === "A";
  const accentColor = isA ? "#3b82f6" : "#f97316";
  const dimColor = "rgba(255,255,255,0.08)";
  if (!hasBeatGrid) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-[3px]", children: Array.from({ length: BEAT_COUNT }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "rounded-sm",
        style: {
          width: 10,
          height: 10,
          backgroundColor: dimColor
        }
      },
      i,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatPhase.tsx",
        lineNumber: 72,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatPhase.tsx",
      lineNumber: 70,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-[3px]", children: Array.from({ length: BEAT_COUNT }, (_, i) => {
    const isActive = i === currentBeat;
    const isDownbeat = i === 0;
    const brightness = isActive ? isOnBeat ? 1 : Math.max(0.3, 1 - subBeatPhase * 0.8) : 0.08;
    const color = isDownbeat ? accentColor : "#ffffff";
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "rounded-sm relative overflow-hidden",
        style: {
          width: 10,
          height: 10,
          backgroundColor: dimColor
        },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute inset-0 rounded-sm",
              style: {
                backgroundColor: color,
                opacity: brightness,
                transition: isActive ? "none" : "opacity 0.1s"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatPhase.tsx",
              lineNumber: 109,
              columnNumber: 13
            },
            void 0
          ),
          isActive && isOnBeat && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute inset-[-2px] rounded-sm pointer-events-none",
              style: {
                boxShadow: `0 0 6px 1px ${isDownbeat ? accentColor : "rgba(255,255,255,0.5)"}`
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatPhase.tsx",
              lineNumber: 119,
              columnNumber: 15
            },
            void 0
          )
        ]
      },
      i,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatPhase.tsx",
        lineNumber: 99,
        columnNumber: 11
      },
      void 0
    );
  }) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatPhase.tsx",
    lineNumber: 87,
    columnNumber: 5
  }, void 0);
};
const BPM_MATCH_THRESHOLD = 0.5;
const DeckTrackInfo = ({ deckId }) => {
  const trackName = useDJStore((s) => s.decks[deckId].trackName);
  const trackAuthor = useDJStore((s) => s.decks[deckId].trackAuthor);
  const fileName = useDJStore((s) => s.decks[deckId].fileName);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const detectedBPM = useDJStore((s) => s.decks[deckId].detectedBPM);
  const elapsedMs = useDJStore((s) => s.decks[deckId].elapsedMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const musicalKey = useDJStore((s) => s.decks[deckId].musicalKey);
  const seratoKey = useDJStore((s) => s.decks[deckId].seratoKey);
  const analysisState = useDJStore((s) => s.decks[deckId].analysisState);
  const analysisProgress = useDJStore((s) => s.decks[deckId].analysisProgress);
  const analysisBPM = useDJStore((s) => {
    var _a;
    return ((_a = s.decks[deckId].beatGrid) == null ? void 0 : _a.bpm) ?? 0;
  });
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const genrePrimary = useDJStore((s) => s.decks[deckId].genrePrimary);
  const genreSubgenre = useDJStore((s) => s.decks[deckId].genreSubgenre);
  const mood = useDJStore((s) => s.decks[deckId].mood);
  const energy = useDJStore((s) => s.decks[deckId].energy);
  const otherDeckId = deckId === "A" ? "B" : "A";
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);
  const otherKey = useDJStore((s) => s.decks[otherDeckId].musicalKey ?? s.decks[otherDeckId].seratoKey);
  const displayBPM = analysisBPM > 0 ? analysisBPM : playbackMode === "audio" ? detectedBPM : effectiveBPM;
  const displayKey = musicalKey ?? seratoKey ?? null;
  const camelot = camelotDisplay(displayKey);
  const isBPMMatched = reactExports.useMemo(() => {
    return Math.abs(displayBPM - otherBPM) < BPM_MATCH_THRESHOLD;
  }, [displayBPM, otherBPM]);
  const keyCompat = reactExports.useMemo(() => {
    return keyCompatibility(displayKey, otherKey);
  }, [displayKey, otherKey]);
  const keyColor = reactExports.useMemo(() => {
    if (!displayKey) return "#6b7280";
    if (otherKey) return keyCompatibilityColor(keyCompat);
    return camelotColor(displayKey);
  }, [displayKey, otherKey, keyCompat]);
  const pitchPercent = reactExports.useMemo(() => {
    if (pitchOffset === 0) return null;
    const pct = (Math.pow(2, pitchOffset / 12) - 1) * 100;
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}%`;
  }, [pitchOffset]);
  const keyCompatLabel = reactExports.useMemo(() => {
    if (!otherKey || !displayKey) return null;
    switch (keyCompat) {
      case "perfect":
        return "MATCH";
      case "compatible":
        return "COMPAT";
      case "energy-boost":
        return "ENERGY↑";
      case "energy-drop":
        return "ENERGY↓";
      case "mood-change":
        return "MOOD";
      case "clash":
        return "CLASH";
      default:
        return null;
    }
  }, [keyCompat, otherKey, displayKey]);
  const formattedTime = reactExports.useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1e3);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [elapsedMs]);
  const formattedRemaining = reactExports.useMemo(() => {
    if (playbackMode !== "audio" || durationMs <= 0) return null;
    const remainMs = Math.max(0, durationMs - elapsedMs);
    const totalSeconds = Math.floor(remainMs / 1e3);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `-${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [playbackMode, durationMs, elapsedMs]);
  const displayAuthor = reactExports.useMemo(() => {
    if (trackAuthor) return trackAuthor;
    if (fileName == null ? void 0 : fileName.startsWith("modland:")) {
      const parts = fileName.replace("modland:", "").split("/").filter(Boolean);
      if (parts.length >= 4) return decodeURIComponent(parts[parts.length - 2]);
    }
    return "";
  }, [trackAuthor, fileName]);
  const analysisIndicator = reactExports.useMemo(() => {
    const pct = analysisProgress > 0 ? ` ${analysisProgress}%` : "";
    switch (analysisState) {
      case "pending":
        return { text: "QUEUE", color: "text-yellow-600" };
      case "rendering":
        return { text: `REND${pct}`, color: "text-blue-400" };
      case "analyzing":
        return { text: `ANLZ${pct}`, color: "text-purple-400" };
      default:
        return null;
    }
  }, [analysisState, analysisProgress]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1 min-w-0", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm truncate flex-1", title: trackName || "No track loaded", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary", children: trackName || "No track loaded" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 136,
          columnNumber: 11
        }, void 0),
        displayAuthor && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted ml-1.5", children: [
          "— ",
          displayAuthor
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 138,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 135,
        columnNumber: 9
      }, void 0),
      analysisIndicator && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `text-[9px] font-bold ${analysisIndicator.color} animate-pulse tracking-wider flex-shrink-0`, children: analysisIndicator.text }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 142,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
      lineNumber: 134,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckBeatPhase, { deckId }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 151,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "span",
        {
          className: `font-mono text-2xl font-bold tabular-nums ${isBPMMatched ? "text-accent-success" : "text-text-primary"}`,
          children: displayBPM > 0 ? displayBPM.toFixed(1) : "---.-"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 154,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted uppercase tracking-wider", children: "BPM" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 159,
        columnNumber: 9
      }, void 0),
      pitchPercent && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-xs tabular-nums text-text-secondary", children: pitchPercent }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 165,
        columnNumber: 11
      }, void 0),
      displayKey && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "span",
        {
          className: "font-mono text-sm font-semibold tabular-nums",
          style: { color: keyColor },
          title: `${displayKey} (${camelot})${otherKey ? ` • ${keyCompat} with ${camelotDisplay(otherKey)}` : ""}`,
          children: [
            camelot,
            keyCompatLabel && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-[9px] font-normal opacity-80", children: keyCompatLabel }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
              lineNumber: 179,
              columnNumber: 15
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 172,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-sm text-text-secondary tabular-nums", children: formattedTime }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 187,
        columnNumber: 9
      }, void 0),
      formattedRemaining && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-sm text-text-muted tabular-nums", children: formattedRemaining }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 193,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
      lineNumber: 149,
      columnNumber: 7
    }, void 0),
    genreSubgenre && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-[10px] text-text-muted", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "span",
        {
          className: "px-1.5 py-0.5 rounded bg-surface-secondary/50 text-text-secondary",
          title: `${genrePrimary} • ${genreSubgenre}`,
          children: genreSubgenre
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 202,
          columnNumber: 11
        },
        void 0
      ),
      mood && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted", children: mood }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 209,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] opacity-60", children: "NRG" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 215,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-12 h-1.5 bg-surface-secondary/50 rounded-full overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "h-full rounded-full transition-all duration-300",
            style: {
              width: `${energy * 100}%`,
              backgroundColor: energy > 0.7 ? "#f97316" : energy > 0.4 ? "#eab308" : "#22c55e"
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
            lineNumber: 217,
            columnNumber: 15
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
          lineNumber: 216,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
        lineNumber: 214,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
      lineNumber: 201,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackInfo.tsx",
    lineNumber: 132,
    columnNumber: 5
  }, void 0);
};
function WorkerWrapper$4(options) {
  return new Worker(
    "/assets/dj-overview.worker-CJEnkITp.js",
    {
      name: options == null ? void 0 : options.name
    }
  );
}
const BAR_HEIGHT = 24;
function snapshotColors$2(el) {
  const cs = getComputedStyle(el);
  return {
    bg: cs.getPropertyValue("--color-bg").trim() || "#6e1418",
    bgSecondary: cs.getPropertyValue("--color-bg-secondary").trim() || "#7c1a1e",
    bgTertiary: cs.getPropertyValue("--color-bg-tertiary").trim() || "#8c2028",
    border: cs.getPropertyValue("--color-border").trim() || "#581014"
  };
}
function snapshotDeck(d) {
  return {
    playbackMode: d.playbackMode,
    songPos: d.songPos,
    totalPositions: d.totalPositions,
    cuePoint: d.cuePoint,
    loopActive: d.loopActive,
    patternLoopStart: d.patternLoopStart,
    patternLoopEnd: d.patternLoopEnd,
    audioPosition: d.audioPosition,
    durationMs: d.durationMs,
    // Convert Float32Array → plain number[] for structured clone
    waveformPeaks: d.waveformPeaks ? Array.from(d.waveformPeaks) : null,
    frequencyPeaks: d.frequencyPeaks ? d.frequencyPeaks.map((band) => Array.from(band)) : null
  };
}
const DeckTrackOverview = ({ deckId }) => {
  const analysisState = useDJStore((s) => s.decks[deckId].analysisState);
  const analysisProgress = useDJStore((s) => s.decks[deckId].analysisProgress);
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const bridgeRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container || !("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return;
    const canvas2 = document.createElement("canvas");
    canvas2.className = "block rounded-sm";
    canvas2.style.cssText = `display:block;width:100%;height:${BAR_HEIGHT}px;border-radius:2px;`;
    container.appendChild(canvas2);
    canvasRef.current = canvas2;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, container.clientWidth);
    const colors = snapshotColors$2(container);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas2.transferControlToOffscreen();
    const bridge = new OffscreenBridge(
      WorkerWrapper$4,
      { onReady: () => {
      } }
    );
    bridgeRef.current = bridge;
    bridge.post({
      type: "init",
      canvas: offscreen,
      dpr,
      width: w,
      height: BAR_HEIGHT,
      colors,
      ...snapshotDeck(deck)
    }, [offscreen]);
    const unsub = useDJStore.subscribe(
      (s) => s.decks[deckId],
      (deck2) => {
        var _a;
        return (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "state", ...snapshotDeck(deck2) });
      }
    );
    const unsubTheme = useThemeStore.subscribe(() => {
      var _a;
      if (containerRef.current) {
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "colors", colors: snapshotColors$2(containerRef.current) });
      }
    });
    const observer = new ResizeObserver((entries) => {
      var _a;
      const entry = entries[0];
      if (!entry) return;
      const w2 = Math.floor(entry.contentRect.width);
      if (w2 > 0) {
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "resize", w: w2, h: BAR_HEIGHT, dpr: window.devicePixelRatio || 1 });
      }
    });
    observer.observe(container);
    return () => {
      unsub();
      unsubTheme();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas2.remove();
      canvasRef.current = null;
    };
  }, [deckId]);
  const seekToFraction = reactExports.useCallback((fraction) => {
    const f = Math.max(0, Math.min(1, fraction));
    const state = useDJStore.getState().decks[deckId];
    if (state.playbackMode === "audio") {
      const seekSec = f * (state.durationMs / 1e3);
      markSeek(deckId);
      seekDeckAudio(deckId, seekSec);
      useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1e3 });
    } else {
      const total = Math.max(state.totalPositions, 1);
      const targetPos = Math.min(Math.floor(f * total), total - 1);
      cueDeck(deckId, targetPos, 0);
      useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
    }
  }, [deckId]);
  const previewPosition = reactExports.useCallback((fraction) => {
    const f = Math.max(0, Math.min(1, fraction));
    try {
      const state = useDJStore.getState().decks[deckId];
      if (state.playbackMode === "audio") {
        const seekSec = f * (state.durationMs / 1e3);
        useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1e3 });
      } else {
        const total = Math.max(state.totalPositions, 1);
        const targetPos = Math.min(Math.floor(f * total), total - 1);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch {
    }
  }, [deckId]);
  const isDraggingRef = reactExports.useRef(false);
  const lastFractionRef = reactExports.useRef(0);
  const handleMouseDown = reactExports.useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    lastFractionRef.current = fraction;
    seekToFraction(fraction);
    const onMouseMove = (ev) => {
      if (!isDraggingRef.current || !container) return;
      const r = container.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      lastFractionRef.current = f;
      previewPosition(f);
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      seekToFraction(lastFractionRef.current);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [seekToFraction, previewPosition]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "w-full cursor-pointer relative",
      style: { height: BAR_HEIGHT },
      onMouseDown: handleMouseDown,
      children: (analysisState === "rendering" || analysisState === "analyzing") && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-sm",
          style: { backgroundColor: "rgba(0,0,0,0.3)" },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "div",
              {
                className: `h-full transition-all duration-500 ease-out ${analysisState === "rendering" ? "bg-blue-500/40" : "bg-purple-500/40"}`,
                style: { width: `${analysisProgress}%` }
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackOverview.tsx",
                lineNumber: 209,
                columnNumber: 11
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-bold text-white/70 tracking-tighter uppercase", children: [
              analysisState,
              " ",
              analysisProgress,
              "%"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackOverview.tsx",
              lineNumber: 214,
              columnNumber: 13
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackOverview.tsx",
              lineNumber: 213,
              columnNumber: 11
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackOverview.tsx",
          lineNumber: 205,
          columnNumber: 9
        },
        void 0
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTrackOverview.tsx",
      lineNumber: 198,
      columnNumber: 5
    },
    void 0
  );
};
function WorkerWrapper$3(options) {
  return new Worker(
    "/assets/readonly-pattern.worker-7sc6TctI.js",
    {
      name: options == null ? void 0 : options.name
    }
  );
}
const LINE_NUMBER_WIDTH = 40;
const CHAR_WIDTH = 10;
const ReadOnlyPatternCanvas = React.memo(({
  pattern,
  currentRow,
  numChannels,
  isPlaying = false,
  height: heightProp
}) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const bridgeRef = reactExports.useRef(null);
  const [dimensions, setDimensions] = reactExports.useState({ width: 400, height: heightProp ?? 300 });
  const getCurrentTheme = useThemeStore((s) => s.getCurrentTheme);
  const snapshotTheme = reactExports.useCallback(() => {
    const t = getCurrentTheme();
    return {
      accent: t.colors.accent,
      accentSecondary: t.colors.accentSecondary,
      accentGlow: t.colors.accentGlow,
      rowCurrent: t.colors.trackerRowCurrent,
      bg: t.colors.trackerRowEven,
      rowNormal: t.colors.trackerRowOdd,
      rowHighlight: t.colors.trackerRowHighlight,
      rowSecondaryHighlight: t.colors.accent + "33",
      border: t.colors.border,
      trackerBorder: t.colors.trackerBorder,
      textNote: t.colors.textSecondary,
      textNoteActive: t.colors.text,
      textMuted: t.colors.cellEmpty,
      textInstrument: t.colors.cellInstrument,
      textVolume: t.colors.cellVolume,
      textEffect: t.colors.cellEffect,
      lineNumber: t.colors.textMuted,
      lineNumberHighlight: t.colors.accentSecondary,
      selection: t.colors.accentGlow,
      bookmark: t.colors.warning
    };
  }, [getCurrentTheme]);
  const snapshotPattern = reactExports.useCallback((p, nc) => {
    if (!p) return null;
    return {
      id: p.id,
      length: p.length,
      channels: p.channels.slice(0, nc).map((ch) => {
        var _a;
        return {
          id: ch.id,
          effectCols: ((_a = ch.channelMeta) == null ? void 0 : _a.effectCols) ?? 2,
          color: ch.color ?? void 0,
          rows: ch.rows.map((cell) => ({
            note: cell.note ?? 0,
            instrument: cell.instrument ?? 0,
            volume: cell.volume ?? 0,
            effTyp: cell.effTyp ?? 0,
            eff: cell.eff ?? 0,
            effTyp2: cell.effTyp2 ?? 0,
            eff2: cell.eff2 ?? 0
          }))
        };
      })
    };
  }, []);
  const buildLayout = reactExports.useCallback((w, nc) => {
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const paramWidth = CHAR_WIDTH * 4 + 8 + 2 * (CHAR_WIDTH * 3 + 4);
    const contentWidth = noteWidth + 4 + paramWidth;
    const usable = w - LINE_NUMBER_WIDTH;
    const chW = Math.max(contentWidth + 16, Math.floor(usable / Math.max(1, nc)));
    const offsets = Array.from({ length: nc }, (_, i) => LINE_NUMBER_WIDTH + i * chW);
    const widths = Array.from({ length: nc }, () => chW);
    return { offsets, widths, totalWidth: chW * nc };
  }, []);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!container || isIOS || !("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return;
    const canvas2 = document.createElement("canvas");
    canvas2.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(canvas2);
    canvasRef.current = canvas2;
    const bridge = new OffscreenBridge(
      WorkerWrapper$3,
      { onReady: () => {
      } }
    );
    bridgeRef.current = bridge;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, heightProp ?? container.clientHeight);
    const offscreen = canvas2.transferControlToOffscreen();
    bridge.post(
      {
        type: "init",
        canvas: offscreen,
        dpr,
        width: w,
        height: h,
        theme: snapshotTheme(),
        pattern: snapshotPattern(pattern, numChannels),
        currentRow,
        numChannels,
        isPlaying,
        layout: buildLayout(w, numChannels)
      },
      [offscreen]
    );
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      canvas2.remove();
      canvasRef.current = null;
    };
  }, []);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      var _a;
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      const h = heightProp ?? Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
        const dpr = window.devicePixelRatio || 1;
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "resize", w, h, dpr });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [heightProp]);
  reactExports.useEffect(() => {
    var _a;
    (_a = bridgeRef.current) == null ? void 0 : _a.post({
      type: "pattern",
      pattern: snapshotPattern(pattern, numChannels),
      numChannels,
      layout: buildLayout(dimensions.width, numChannels)
    });
  }, [pattern, numChannels, dimensions.width, snapshotPattern, buildLayout]);
  reactExports.useEffect(() => {
    var _a;
    (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "playback", currentRow, isPlaying });
  }, [currentRow, isPlaying]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "w-full h-full",
      style: heightProp ? { height: heightProp } : void 0
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/tracker/ReadOnlyPatternCanvas.tsx",
      lineNumber: 249,
      columnNumber: 5
    },
    void 0
  );
});
const DJOscilloscope = ({
  width,
  height,
  color = "#00ccff",
  className
}) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const busRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    const bus = AudioDataBus.getShared();
    busRef.current = bus;
    const render = () => {
      const canvas2 = canvasRef.current;
      const container = containerRef.current;
      if (!canvas2) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const w = width ?? (container == null ? void 0 : container.clientWidth) ?? 300;
      const h = height ?? (container == null ? void 0 : container.clientHeight) ?? 80;
      const dpr = devicePixelRatio;
      if (canvas2.width !== w * dpr || canvas2.height !== h * dpr) {
        canvas2.width = w * dpr;
        canvas2.height = h * dpr;
        canvas2.style.width = `${w}px`;
        canvas2.style.height = `${h}px`;
      }
      const ctx = canvas2.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      bus.update();
      const frame = bus.getFrame();
      const waveform = frame.waveform;
      ctx.clearRect(0, 0, canvas2.width, canvas2.height);
      const cw = canvas2.width;
      const ch = canvas2.height;
      const mid = ch / 2;
      ctx.strokeStyle = `${color}22`;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cw, mid);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      const step = waveform.length / cw;
      for (let x = 0; x < cw; x++) {
        const i = Math.floor(x * step);
        const v = waveform[i] ?? 0;
        const y = mid + v * mid * 0.9;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowColor = color;
      ctx.shadowBlur = 4 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, color]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: className ?? "w-full h-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("canvas", { ref: canvasRef, className: "w-full h-full" }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/DJOscilloscope.tsx",
    lineNumber: 102,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/visualization/DJOscilloscope.tsx",
    lineNumber: 101,
    columnNumber: 5
  }, void 0);
};
const DeckPatternDisplay = ({ deckId }) => {
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const pattPos = useDJStore((s) => s.decks[deckId].pattPos);
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const fileName = useDJStore((s) => s.decks[deckId].fileName);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const [visualOffset, setVisualOffset] = reactExports.useState(0);
  const lastTickRef = reactExports.useRef(0);
  const rafRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (!activePatternName) {
      setVisualOffset(0);
      lastTickRef.current = 0;
      return;
    }
    const tick = () => {
      const now = performance.now();
      const store = useDJStore.getState();
      const vel = store.decks[deckId].scratchVelocity;
      if (lastTickRef.current > 0 && vel < -0.1) {
        const bpm = store.decks[deckId].effectiveBPM || 125;
        const rowsPerSec = bpm / 60 * 6;
        const dt = (now - lastTickRef.current) / 1e3;
        const rowDelta = Math.abs(vel) * rowsPerSec * dt;
        setVisualOffset((prev) => prev + rowDelta);
      } else if (vel > 0.1) {
        setVisualOffset((prev) => prev > 0 ? Math.max(0, prev - 2) : 0);
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [deckId, activePatternName]);
  const { patternData, numChannels, numRows } = reactExports.useMemo(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const song = deck.replayer.getSong();
      if (!song || !song.songPositions || song.songPositions.length === 0) {
        return { patternData: null, numChannels: 4, numRows: 64 };
      }
      const patternIndex = song.songPositions[songPos] ?? 0;
      const pat = song.patterns[patternIndex] ?? null;
      return {
        patternData: pat,
        numChannels: song.numChannels,
        numRows: pat ? pat.length : 64
      };
    } catch {
      return { patternData: null, numChannels: 4, numRows: 64 };
    }
  }, [deckId, songPos, fileName, totalPositions]);
  const visualRow = activePatternName && visualOffset > 0 ? ((pattPos - Math.round(visualOffset)) % numRows + numRows) % numRows : pattPos;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bg border border-dark-border rounded-sm overflow-hidden w-full h-full", children: patternData ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    ReadOnlyPatternCanvas,
    {
      pattern: patternData,
      currentRow: visualRow,
      numChannels,
      isPlaying
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPatternDisplay.tsx",
      lineNumber: 103,
      columnNumber: 9
    },
    void 0
  ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJOscilloscope, {}, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPatternDisplay.tsx",
    lineNumber: 110,
    columnNumber: 9
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckPatternDisplay.tsx",
    lineNumber: 101,
    columnNumber: 5
  }, void 0);
};
const VIZ_MODES = VISUALIZER_MODES.slice(1);
const SLIDESHOW_INTERVAL_MS = 15e3;
const DeckVisualizer = ({ deckId, resetKey = 0 }) => {
  const viz = useDeckVisualizationData(deckId);
  const [vizIndex, setVizIndex] = reactExports.useState(0);
  const [isFullscreen, setIsFullscreen] = reactExports.useState(false);
  const [isHovered, setIsHovered] = reactExports.useState(false);
  const [slideshowActive, setSlideshowActive] = reactExports.useState(false);
  const containerRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const glRef = reactExports.useRef(null);
  const cacheRef = reactExports.useRef(null);
  const stateRef = reactExports.useRef(createVisualizerState());
  const rafRef = reactExports.useRef(0);
  const startTimeRef = reactExports.useRef(performance.now() / 1e3);
  const slideshowTimerRef = reactExports.useRef(null);
  const mode2 = VIZ_MODES[vizIndex % VIZ_MODES.length];
  const isAMMode = isAudioMotionMode(mode2);
  const [beatFlashOpacity, setBeatFlashOpacity] = reactExports.useState(0);
  const beatFlashRafRef = reactExports.useRef(0);
  const prevBeatIdxRef = reactExports.useRef(-1);
  reactExports.useEffect(() => {
    let mounted = true;
    let flashDecay = 0;
    const tick = () => {
      if (!mounted) return;
      const phase = viz.getBeatPhase();
      if (phase) {
        if (phase.nearestBeatIdx !== prevBeatIdxRef.current && prevBeatIdxRef.current >= 0) {
          flashDecay = 1;
        }
        prevBeatIdxRef.current = phase.nearestBeatIdx;
      }
      if (flashDecay > 0.01) {
        flashDecay *= 0.88;
        setBeatFlashOpacity(flashDecay);
      } else if (flashDecay > 0) {
        flashDecay = 0;
        setBeatFlashOpacity(0);
      }
      beatFlashRafRef.current = requestAnimationFrame(tick);
    };
    beatFlashRafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(beatFlashRafRef.current);
    };
  }, [deckId]);
  const beatFlashColor = deckId === "A" ? "59,130,246" : "249,115,22";
  const prevResetKeyRef = reactExports.useRef(resetKey);
  reactExports.useEffect(() => {
    if (resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      setVizIndex(0);
    }
  }, [resetKey]);
  const goNext = reactExports.useCallback((e) => {
    e == null ? void 0 : e.stopPropagation();
    setVizIndex((prev) => (prev + 1) % VIZ_MODES.length);
  }, []);
  const goPrev = reactExports.useCallback((e) => {
    e == null ? void 0 : e.stopPropagation();
    setVizIndex((prev) => (prev - 1 + VIZ_MODES.length) % VIZ_MODES.length);
  }, []);
  const goRandom = reactExports.useCallback((e) => {
    e == null ? void 0 : e.stopPropagation();
    setVizIndex((prev) => {
      let next;
      do {
        next = Math.floor(Math.random() * VIZ_MODES.length);
      } while (next === prev && VIZ_MODES.length > 1);
      return next;
    });
  }, []);
  const toggleSlideshow = reactExports.useCallback((e) => {
    e == null ? void 0 : e.stopPropagation();
    setSlideshowActive((prev) => !prev);
  }, []);
  reactExports.useEffect(() => {
    if (slideshowActive) {
      slideshowTimerRef.current = setInterval(() => {
        setVizIndex((prev) => {
          let next;
          do {
            next = Math.floor(Math.random() * VIZ_MODES.length);
          } while (next === prev && VIZ_MODES.length > 1);
          return next;
        });
      }, SLIDESHOW_INTERVAL_MS);
    }
    return () => {
      if (slideshowTimerRef.current) {
        clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
    };
  }, [slideshowActive]);
  const toggleFullscreen = reactExports.useCallback(async (e) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  }, []);
  reactExports.useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);
  reactExports.useEffect(() => {
    if (isAMMode) return;
    const canvas2 = canvasRef.current;
    if (!canvas2) return;
    if (!glRef.current) {
      const gl2 = canvas2.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance"
      });
      if (!gl2) {
        console.warn("[DeckVisualizer] WebGL2 not available");
        return;
      }
      gl2.getExtension("EXT_color_buffer_float");
      glRef.current = gl2;
      cacheRef.current = createRendererCache(gl2);
    }
    const gl = glRef.current;
    const cache = cacheRef.current;
    const state = stateRef.current;
    let running = true;
    const frame = () => {
      if (!running) return;
      const container = containerRef.current;
      if (container && canvas2) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = container.clientWidth;
        const h = container.clientHeight;
        const drawW = Math.round(w * dpr);
        const drawH = Math.round(h * dpr);
        if (canvas2.width !== drawW || canvas2.height !== drawH) {
          canvas2.width = drawW;
          canvas2.height = drawH;
          canvas2.style.width = `${w}px`;
          canvas2.style.height = `${h}px`;
        }
        gl.viewport(0, 0, drawW, drawH);
        const audio = buildAudioData(viz.getWaveform, viz.getFFT);
        const time = performance.now() / 1e3 - startTimeRef.current;
        const renderer = RENDERERS[mode2];
        if (renderer) renderer(cache, audio, state, time, drawW, drawH);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId, mode2, isAMMode]);
  reactExports.useEffect(() => {
    return () => {
      if (cacheRef.current) {
        destroyRendererCache(cacheRef.current);
        cacheRef.current = null;
      }
      glRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);
  const modeLabel = MODE_LABELS[mode2];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "relative w-full h-full bg-dark-bg border border-dark-border rounded-sm overflow-hidden select-none",
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      children: [
        isAMMode && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 w-full h-full", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          AudioMotionVisualizer,
          {
            preset: AM_PRESET_MAP[mode2] ?? "ledBars",
            audioSource: deckId === "A" ? "deckA" : "deckB"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
            lineNumber: 259,
            columnNumber: 11
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
          lineNumber: 258,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "canvas",
          {
            ref: canvasRef,
            className: "absolute inset-0 w-full h-full",
            style: { display: isAMMode ? "none" : "block" }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
            lineNumber: 267,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0", style: { opacity: 0.55 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckPatternDisplay, { deckId }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
          lineNumber: 275,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
          lineNumber: 274,
          columnNumber: 7
        }, void 0),
        beatFlashOpacity > 0.01 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute inset-0 pointer-events-none rounded-sm",
            style: {
              boxShadow: `inset 0 0 12px 2px rgba(${beatFlashColor},${beatFlashOpacity * 0.6})`,
              border: `1px solid rgba(${beatFlashColor},${beatFlashOpacity * 0.4})`
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
            lineNumber: 280,
            columnNumber: 9
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "absolute bottom-1 right-1 text-[9px] font-mono uppercase tracking-wider pointer-events-none",
            style: { opacity: isFullscreen ? 0.7 : 0.4, color: "var(--color-text-muted)" },
            children: [
              modeLabel,
              slideshowActive && " ⟳"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
            lineNumber: 290,
            columnNumber: 7
          },
          void 0
        ),
        (isHovered || isFullscreen) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-1 right-1 flex gap-0.5 z-10", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-text-primary/90 transition-colors",
              onClick: goPrev,
              title: "Previous visualizer",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 306,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
              lineNumber: 301,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-text-primary/90 transition-colors",
              onClick: goNext,
              title: "Next visualizer",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 313,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
              lineNumber: 308,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-text-primary/90 transition-colors",
              onClick: goRandom,
              title: "Random visualizer",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Shuffle, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 320,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
              lineNumber: 315,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: `p-0.5 rounded transition-colors ${slideshowActive ? "bg-green-500/40 text-green-300 hover:bg-green-500/60" : "bg-black/50 hover:bg-black/80 text-white/60 hover:text-text-primary/90"}`,
              onClick: toggleSlideshow,
              title: slideshowActive ? "Stop slideshow" : "Random slideshow (15s)",
              children: slideshowActive ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Pause, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 331,
                columnNumber: 32
              }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 331,
                columnNumber: 54
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
              lineNumber: 322,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              className: "p-0.5 rounded bg-black/50 hover:bg-black/80 text-white/60 hover:text-text-primary/90 transition-colors",
              onClick: toggleFullscreen,
              title: isFullscreen ? "Exit fullscreen" : "Fullscreen",
              children: isFullscreen ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minimize2, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 338,
                columnNumber: 29
              }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Maximize2, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
                lineNumber: 338,
                columnNumber: 55
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
              lineNumber: 333,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
          lineNumber: 300,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVisualizer.tsx",
      lineNumber: 250,
      columnNumber: 5
    },
    void 0
  );
};
const EMPTY_WAVE = new Float32Array(256);
const EMPTY_FFT = new Float32Array(1024);
const EMPTY_AUDIO = {
  waveform: EMPTY_WAVE,
  fft: EMPTY_FFT,
  rms: 0,
  peak: 0,
  bassEnergy: 0,
  midEnergy: 0,
  highEnergy: 0
};
function buildAudioData(getWaveform, getFFT) {
  const waveform = getWaveform();
  const fft = getFFT();
  if (!waveform || !fft) return EMPTY_AUDIO;
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < waveform.length; i++) {
    const v = waveform[i];
    sumSq += v * v;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSq / waveform.length);
  const normalize = (db) => Math.max(0, (db + 100) / 100);
  let bassSum = 0, midSum = 0, highSum = 0;
  const bassEnd = 10;
  const midEnd = 100;
  for (let i = 0; i < fft.length; i++) {
    const v = normalize(fft[i]);
    if (i < bassEnd) bassSum += v;
    else if (i < midEnd) midSum += v;
    else highSum += v;
  }
  return {
    waveform,
    fft,
    rms,
    peak,
    bassEnergy: bassSum / bassEnd,
    midEnergy: midSum / (midEnd - bassEnd),
    highEnergy: highSum / (fft.length - midEnd)
  };
}
function WorkerWrapper$2(options) {
  return new Worker(
    "/assets/dj-turntable.worker-BPFZRINn.js",
    {
      name: options == null ? void 0 : options.name
    }
  );
}
const SIZE = 96;
const MOMENTUM_DECAY_MS = 500;
function snapshotColors$1(el) {
  const cs = getComputedStyle(el);
  return {
    bg: cs.getPropertyValue("--color-bg").trim() || "#6e1418",
    bgSecondary: cs.getPropertyValue("--color-bg-secondary").trim() || "#7c1a1e",
    bgTertiary: cs.getPropertyValue("--color-bg-tertiary").trim() || "#8c2028",
    border: cs.getPropertyValue("--color-border").trim() || "#581014",
    borderLight: cs.getPropertyValue("--color-border-light").trim() || "#403535"
  };
}
const DeckTurntable = ({ deckId }) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const bridgeRef = reactExports.useRef(null);
  const scratchVelocityRef = reactExports.useRef(1);
  const lastPointerRef = reactExports.useRef(null);
  const momentumDecayRafRef = reactExports.useRef(0);
  const momentumStartTimeRef = reactExports.useRef(0);
  const momentumStartVelRef = reactExports.useRef(1);
  const [isScratchActive, setIsScratchActive] = reactExports.useState(false);
  const jogActiveRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container || !("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return;
    const canvas2 = document.createElement("canvas");
    canvas2.style.cssText = `display:block;width:${SIZE}px;height:${SIZE}px;border-radius:4px;touch-action:none;`;
    container.appendChild(canvas2);
    canvasRef.current = canvas2;
    const deck = useDJStore.getState().decks[deckId];
    const dpr = window.devicePixelRatio || 1;
    const colors = snapshotColors$1(container);
    const offscreen = canvas2.transferControlToOffscreen();
    const bridge = new OffscreenBridge(
      WorkerWrapper$2,
      { onReady: () => {
      } }
    );
    bridgeRef.current = bridge;
    bridge.post({
      type: "init",
      canvas: offscreen,
      dpr,
      width: SIZE,
      height: SIZE,
      colors,
      deckId,
      isPlaying: deck.isPlaying,
      effectiveBPM: deck.effectiveBPM
    }, [offscreen]);
    const unsub = useDJStore.subscribe(
      (s) => ({ isPlaying: s.decks[deckId].isPlaying, effectiveBPM: s.decks[deckId].effectiveBPM }),
      ({ isPlaying, effectiveBPM }) => {
        var _a;
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "playback", isPlaying, effectiveBPM });
      },
      { equalityFn: (a, b) => a.isPlaying === b.isPlaying && a.effectiveBPM === b.effectiveBPM }
    );
    const unsubPos = useDJStore.subscribe(
      (s) => {
        const d = s.decks[deckId];
        return d.playbackMode === "audio" ? d.audioPosition : d.elapsedMs / 1e3;
      },
      (posSec) => {
        var _a;
        return (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "position", posSec });
      }
    );
    const unsubScratch = useDJStore.subscribe(
      (s) => ({
        scratchVelocity: s.decks[deckId].scratchVelocity,
        activePatternName: s.decks[deckId].activePatternName
      }),
      ({ scratchVelocity, activePatternName }) => {
        var _a, _b, _c, _d;
        if (activePatternName && !jogActiveRef.current) {
          (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "velocity", v: scratchVelocity });
          (_b = bridgeRef.current) == null ? void 0 : _b.post({ type: "scratchActive", active: true });
        } else if (!activePatternName && !jogActiveRef.current) {
          (_c = bridgeRef.current) == null ? void 0 : _c.post({ type: "velocity", v: 1 });
          (_d = bridgeRef.current) == null ? void 0 : _d.post({ type: "scratchActive", active: false });
        }
      },
      { equalityFn: (a, b) => a.scratchVelocity === b.scratchVelocity && a.activePatternName === b.activePatternName }
    );
    const unsubTheme = useThemeStore.subscribe(() => {
      var _a;
      if (containerRef.current) {
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "colors", colors: snapshotColors$1(containerRef.current) });
      }
    });
    return () => {
      unsub();
      unsubPos();
      unsubScratch();
      unsubTheme();
      bridge.dispose();
      bridgeRef.current = null;
      canvas2.remove();
      canvasRef.current = null;
    };
  }, [deckId]);
  const startMomentumDecay = reactExports.useCallback((fromVelocity) => {
    if (momentumDecayRafRef.current) cancelAnimationFrame(momentumDecayRafRef.current);
    momentumStartTimeRef.current = performance.now();
    momentumStartVelRef.current = fromVelocity;
    const animate = () => {
      var _a;
      const t = Math.min(1, (performance.now() - momentumStartTimeRef.current) / MOMENTUM_DECAY_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      const v = momentumStartVelRef.current + (1 - momentumStartVelRef.current) * ease;
      scratchVelocityRef.current = v;
      (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "velocity", v });
      const audioV = Math.abs(v) < 0.1 ? 0.1 * Math.sign(v || 1) : v;
      setScratchVelocity(deckId, audioV);
      if (t < 1) {
        momentumDecayRafRef.current = requestAnimationFrame(animate);
      } else {
        scratchVelocityRef.current = 1;
        momentumDecayRafRef.current = 0;
        stopScratch(deckId, 0);
      }
    };
    momentumDecayRafRef.current = requestAnimationFrame(animate);
  }, [deckId]);
  const handlePointerDown = reactExports.useCallback((e) => {
    var _a, _b;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (momentumDecayRafRef.current) {
      cancelAnimationFrame(momentumDecayRafRef.current);
      momentumDecayRafRef.current = 0;
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    scratchVelocityRef.current = 0;
    jogActiveRef.current = true;
    setIsScratchActive(true);
    useDJStore.getState().setDeckScratchActive(deckId, true);
    (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "scratchActive", active: true });
    (_b = bridgeRef.current) == null ? void 0 : _b.post({ type: "velocity", v: 0 });
    startScratch(deckId);
    setScratchVelocity(deckId, 0);
  }, [deckId]);
  const handlePointerMove = reactExports.useCallback((e) => {
    var _a;
    if (!lastPointerRef.current) return;
    const dy = lastPointerRef.current.y - e.clientY;
    const v = Math.max(-4, Math.min(4, dy * 0.15));
    scratchVelocityRef.current = v;
    (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "velocity", v });
    setScratchVelocity(deckId, v);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [deckId]);
  const handlePointerUp = reactExports.useCallback((e) => {
    var _a;
    if (!lastPointerRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;
    const fromVelocity = scratchVelocityRef.current;
    jogActiveRef.current = false;
    setIsScratchActive(false);
    useDJStore.getState().setDeckScratchActive(deckId, false);
    (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "scratchActive", active: false });
    startMomentumDecay(fromVelocity);
  }, [deckId, startMomentumDecay]);
  const handlePointerCancel = reactExports.useCallback((e) => {
    var _a;
    if (!lastPointerRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
    lastPointerRef.current = null;
    jogActiveRef.current = false;
    setIsScratchActive(false);
    useDJStore.getState().setDeckScratchActive(deckId, false);
    (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "scratchActive", active: false });
    startMomentumDecay(scratchVelocityRef.current);
  }, [deckId, startMomentumDecay]);
  reactExports.useEffect(() => {
    return () => {
      if (momentumDecayRafRef.current) cancelAnimationFrame(momentumDecayRafRef.current);
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "flex-shrink-0 rounded",
      style: {
        width: SIZE,
        height: SIZE,
        cursor: isScratchActive ? "grabbing" : "grab",
        touchAction: "none"
      },
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onLostPointerCapture: handlePointerCancel
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckTurntable.tsx",
      lineNumber: 233,
      columnNumber: 5
    },
    void 0
  );
};
const DeckCssTurntable = ({ deckId }) => {
  const containerRef = reactExports.useRef(null);
  const platterRef = reactExports.useRef(null);
  const recordRef = reactExports.useRef(null);
  const groovesRef = reactExports.useRef(null);
  const slipmatRef = reactExports.useRef(null);
  const spindleRef = reactExports.useRef(null);
  const tonearmRef = reactExports.useRef(null);
  const physicsRef = reactExports.useRef(null);
  const rafIdRef = reactExports.useRef(null);
  const lastTickRef = reactExports.useRef(0);
  const angleRef = reactExports.useRef(0);
  const isScratchActiveRef = reactExports.useRef(false);
  const lastPointerRef = reactExports.useRef(null);
  const lastPointerTimeRef = reactExports.useRef(0);
  const [isScratchActive, setIsScratchActive] = reactExports.useState(false);
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const playStateRef = reactExports.useRef({ isPlaying, effectiveBPM });
  playStateRef.current = { isPlaying, effectiveBPM };
  const applyRotation = reactExports.useCallback((angleDeg) => {
    const rot = `rotate(${angleDeg}deg)`;
    if (platterRef.current) platterRef.current.style.transform = rot;
    if (recordRef.current) recordRef.current.style.transform = rot;
    if (groovesRef.current) groovesRef.current.style.transform = rot;
    if (slipmatRef.current) slipmatRef.current.style.transform = rot;
    if (spindleRef.current) spindleRef.current.style.transform = rot;
  }, []);
  const applyTonearm = reactExports.useCallback((angleDeg) => {
    if (tonearmRef.current) {
      tonearmRef.current.style.transform = `rotate(${angleDeg}deg)`;
    }
  }, []);
  const engineDeckRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let prevRate = 1;
    let scratchIntegrating = false;
    const tick = (now) => {
      const dt = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1e3 : 0;
      lastTickRef.current = now;
      if (!physicsRef.current || !engineDeckRef.current) {
        try {
          const deck2 = getDJEngine().getDeck(deckId);
          physicsRef.current = deck2.physics;
          engineDeckRef.current = deck2;
        } catch {
        }
      }
      const physics = physicsRef.current;
      const engineDeck = engineDeckRef.current;
      const { isPlaying: playing, effectiveBPM: bpm } = playStateRef.current;
      const baseBPM = bpm || 120;
      const rps = baseBPM / 120 * 0.5556;
      const omegaNormal = rps * 2 * Math.PI;
      if (playing || isScratchActiveRef.current) {
        if (physics && (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive)) {
          const rate = physics.tick(dt);
          if (isScratchActiveRef.current && !scratchIntegrating) {
            scratchIntegrating = true;
            let posSec = 0;
            if (engineDeck) {
              try {
                posSec = engineDeck.playbackMode === "audio" ? engineDeck.audioPlayer.getPosition() : engineDeck.replayer.getElapsedMs() / 1e3;
              } catch {
              }
            }
            angleRef.current = posSec * omegaNormal;
          }
          if (isScratchActiveRef.current && Math.abs(rate - prevRate) > 0.01) {
            useDJStore.getState().setDeckState(deckId, { scratchVelocity: rate });
            prevRate = rate;
          }
          if (scratchIntegrating) {
            angleRef.current += rate * omegaNormal * dt;
          }
          if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
            if (Math.abs(rate - 1) < 0.02) {
              isScratchActiveRef.current = false;
              setIsScratchActive(false);
              scratchIntegrating = false;
              stopScratch(deckId, 50);
              prevRate = 1;
            }
          }
        }
        if (!scratchIntegrating && engineDeck) {
          let posSec = 0;
          try {
            posSec = engineDeck.playbackMode === "audio" ? engineDeck.audioPlayer.getPosition() : engineDeck.replayer.getElapsedMs() / 1e3;
          } catch {
          }
          angleRef.current = posSec * omegaNormal;
        }
      }
      const angleDeg = angleRef.current * 180 / Math.PI;
      applyRotation(angleDeg);
      const ARM_START_DEG = 5;
      const ARM_END_DEG = 25;
      const deck = useDJStore.getState().decks[deckId];
      const duration = deck.durationMs > 0 ? deck.durationMs / 1e3 : 180;
      let pos;
      if (deck.playbackMode === "audio") {
        try {
          pos = getDJEngine().getDeck(deckId).audioPlayer.getPosition();
        } catch {
          pos = deck.audioPosition;
        }
      } else {
        pos = deck.elapsedMs / 1e3;
      }
      const progress = duration > 0 ? Math.min(pos / duration, 1) : 0;
      const wobble = playing && !isScratchActiveRef.current ? Math.sin(now * 1e-3) * 0.15 : 0;
      applyTonearm(ARM_START_DEG + progress * (ARM_END_DEG - ARM_START_DEG) + wobble);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [deckId, applyRotation, applyTonearm]);
  const enterScratch = reactExports.useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    setIsScratchActive(true);
    startScratch(deckId);
  }, [deckId]);
  const handlePointerDown = reactExports.useCallback((e) => {
    var _a, _b;
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    if (!playStateRef.current.isPlaying) return;
    enterScratch();
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    lastPointerTimeRef.current = performance.now();
    (_a = physicsRef.current) == null ? void 0 : _a.setTouching(true);
    (_b = physicsRef.current) == null ? void 0 : _b.setHandVelocity(0);
  }, [enterScratch]);
  const handlePointerMove = reactExports.useCallback((e) => {
    var _a;
    if (!lastPointerRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.41;
    const cy = rect.top + rect.height * 0.5;
    const rx = e.clientX - cx;
    const ry = e.clientY - cy;
    const radius = Math.sqrt(rx * rx + ry * ry);
    if (radius > 4) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      const tangential = (rx * dy - ry * dx) / radius;
      const now = performance.now();
      const dt = Math.max(1e-3, (now - lastPointerTimeRef.current) / 1e3);
      lastPointerTimeRef.current = now;
      const pixelVelocity = tangential / dt;
      const platterSize = rect.width * 0.72;
      const sensitivity = useDJStore.getState().jogWheelSensitivity;
      const omega = pixelVelocity / (platterSize * 0.8) * OMEGA_NORMAL * sensitivity;
      (_a = physicsRef.current) == null ? void 0 : _a.setHandVelocity(omega);
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const handlePointerUp = reactExports.useCallback((e) => {
    var _a;
    e.target.releasePointerCapture(e.pointerId);
    lastPointerRef.current = null;
    (_a = physicsRef.current) == null ? void 0 : _a.setTouching(false);
  }, []);
  reactExports.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      var _a;
      if (!playStateRef.current.isPlaying) return;
      e.preventDefault();
      if (!isScratchActiveRef.current) enterScratch();
      const impulse = TurntablePhysics.deltaToImpulse(e.deltaY, e.deltaMode);
      (_a = physicsRef.current) == null ? void 0 : _a.applyImpulse(impulse);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enterScratch]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "turntable-css-container", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "turntable-css relative select-none",
      style: { cursor: isScratchActive ? "grabbing" : "grab", touchAction: "none" },
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-frame" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
          lineNumber: 276,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-table-bg" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
          lineNumber: 277,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-bd", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: platterRef, className: "tt-platter" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 282,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-slipmat-holder tt-visible", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: slipmatRef, className: "tt-slipmat" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 286,
            columnNumber: 13
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 285,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-record-holder tt-visible", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: recordRef, className: "tt-record" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
              lineNumber: 291,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: groovesRef, className: "tt-record-grooves" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
              lineNumber: 292,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-label" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
              lineNumber: 293,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 290,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: spindleRef, className: "tt-spindle" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 297,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-power-light tt-power-on" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 300,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-power-dial tt-power-on" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 303,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-start-stop" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 304,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-speed-33 tt-speed-on" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 305,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-speed-45" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 306,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-light" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 307,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-light-on tt-power-on" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 308,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "tt-tonearm-holder", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: tonearmRef, className: "tt-tonearm" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 312,
            columnNumber: 13
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
            lineNumber: 311,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
          lineNumber: 280,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
      lineNumber: 266,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCssTurntable.tsx",
    lineNumber: 265,
    columnNumber: 5
  }, void 0);
};
const LOOP_SIZES = [1, 2, 4, 8, 16, 32];
const DeckLoopControls = ({ deckId }) => {
  const loopActive = useDJStore((s) => s.decks[deckId].loopActive);
  const lineLoopSize = useDJStore((s) => s.decks[deckId].lineLoopSize);
  const slipEnabled = useDJStore((s) => s.decks[deckId].slipEnabled);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const audioLoopIn = useDJStore((s) => s.decks[deckId].audioLoopIn);
  const audioLoopOut = useDJStore((s) => s.decks[deckId].audioLoopOut);
  const setDeckLoop = useDJStore((s) => s.setDeckLoop);
  const setDeckLoopSize = useDJStore((s) => s.setDeckLoopSize);
  const setDeckSlip = useDJStore((s) => s.setDeckSlip);
  const handleLoopToggle = reactExports.useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    if (playbackMode === "audio") {
      if (loopActive) {
        deck.clearAudioLoop();
        setDeckLoop(deckId, "off", false);
      } else if (audioLoopIn !== null && audioLoopOut !== null) {
        deck.setAudioLoop(audioLoopIn, audioLoopOut);
        setDeckLoop(deckId, "line", true);
      }
    } else {
      if (loopActive) {
        deck.clearLineLoop();
        setDeckLoop(deckId, "off", false);
      } else {
        deck.setLineLoop(lineLoopSize);
        setDeckLoop(deckId, "line", true);
      }
    }
  }, [deckId, loopActive, lineLoopSize, setDeckLoop, playbackMode, audioLoopIn, audioLoopOut]);
  const handleSizeChange = reactExports.useCallback(
    (size) => {
      setDeckLoopSize(deckId, size);
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      deck.setLineLoop(size);
      if (!loopActive) {
        setDeckLoop(deckId, "line", true);
      }
    },
    [deckId, loopActive, setDeckLoopSize, setDeckLoop]
  );
  const handleSetLoopIn = reactExports.useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const pos = deck.audioPlayer.getPosition();
      const store = useDJStore.getState();
      store.setAudioLoopIn(deckId, pos);
      const currentOut = store.decks[deckId].audioLoopOut;
      if (currentOut !== null && currentOut > pos) {
        deck.setAudioLoop(pos, currentOut);
        store.setDeckLoop(deckId, "line", true);
      }
    } catch {
    }
  }, [deckId]);
  const handleSetLoopOut = reactExports.useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const pos = deck.audioPlayer.getPosition();
      const store = useDJStore.getState();
      store.setAudioLoopOut(deckId, pos);
      const currentIn = store.decks[deckId].audioLoopIn;
      if (currentIn !== null && pos > currentIn) {
        deck.setAudioLoop(currentIn, pos);
        store.setDeckLoop(deckId, "line", true);
      }
    } catch {
    }
  }, [deckId]);
  const handleClearAudioLoop = reactExports.useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      deck.clearAudioLoop();
      useDJStore.getState().setAudioLoopIn(deckId, null);
      useDJStore.getState().setAudioLoopOut(deckId, null);
      useDJStore.getState().setDeckLoop(deckId, "off", false);
    } catch {
    }
  }, [deckId]);
  const handleSlipToggle = reactExports.useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const newSlip = !slipEnabled;
    deck.setSlipEnabled(newSlip);
    setDeckSlip(deckId, newSlip);
  }, [deckId, slipEnabled, setDeckSlip]);
  const isAudio = playbackMode === "audio";
  const audioLoopReady = audioLoopIn !== null && audioLoopOut !== null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 flex-1 min-w-0", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleLoopToggle,
        className: `
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none border border-dark-border
          active:translate-y-[0.5px]
          ${loopActive ? "bg-accent-highlight text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}
        `,
        style: { width: 40, height: 40 },
        title: loopActive ? "Disable loop" : isAudio ? audioLoopReady ? "Enable loop" : "Set IN/OUT first" : "Enable loop",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: `absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${loopActive ? "bg-accent-highlight" : "bg-dark-border"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
              lineNumber: 146,
              columnNumber: 9
            },
            void 0
          ),
          "LOOP"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
        lineNumber: 131,
        columnNumber: 7
      },
      void 0
    ),
    isAudio ? (
      /* Audio mode: IN / OUT markers */
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleSetLoopIn,
            className: `
              flex items-center justify-center font-mono font-bold
              transition-all duration-75 select-none rounded-l-sm
              ${audioLoopIn !== null ? "bg-accent-highlight/60 text-accent-highlight" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary"}
            `,
            style: { height: 40, fontSize: 10, width: 28, minWidth: 28 },
            title: audioLoopIn !== null ? `Loop IN: ${formatSec(audioLoopIn)}` : "Set loop IN at current position",
            children: "IN"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
            lineNumber: 157,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleSetLoopOut,
            className: `
              flex items-center justify-center font-mono font-bold
              transition-all duration-75 select-none
              ${audioLoopOut !== null ? "bg-accent-highlight/60 text-accent-highlight" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary"}
            `,
            style: { height: 40, fontSize: 10, width: 32, minWidth: 32 },
            title: audioLoopOut !== null ? `Loop OUT: ${formatSec(audioLoopOut)}` : "Set loop OUT at current position",
            children: "OUT"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
            lineNumber: 172,
            columnNumber: 11
          },
          void 0
        ),
        [1, 2, 4, 8].map((bars) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              try {
                const engine = getDJEngine();
                const deck = engine.getDeck(deckId);
                const state = useDJStore.getState().decks[deckId];
                const bpm = ((_a = state.beatGrid) == null ? void 0 : _a.bpm) || state.detectedBPM || state.effectiveBPM || 120;
                const beatSec = 60 / bpm;
                const pos = deck.audioPlayer.getPosition();
                const loopDuration = bars * 4 * beatSec;
                const inPos = pos;
                const outPos = pos + loopDuration;
                useDJStore.getState().setAudioLoopIn(deckId, inPos);
                useDJStore.getState().setAudioLoopOut(deckId, outPos);
                deck.setAudioLoop(inPos, outPos);
                useDJStore.getState().setDeckLoop(deckId, "line", true);
              } catch {
              }
            },
            className: `
                flex items-center justify-center font-mono font-bold
                transition-all duration-75 select-none
                ${loopActive && audioLoopReady ? "bg-accent-highlight/40 text-accent-highlight" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover"}
              `,
            style: { height: 40, width: 28, fontSize: 9 },
            title: `Auto-loop ${bars} bar${bars > 1 ? "s" : ""}`,
            children: bars
          },
          bars,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
            lineNumber: 189,
            columnNumber: 13
          },
          void 0
        )),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleClearAudioLoop,
            className: "flex items-center justify-center font-mono font-bold rounded-r-sm\n              transition-all duration-75 select-none bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-red-400",
            style: { height: 40, width: 28, fontSize: 8 },
            title: "Clear loop",
            children: "CLR"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
            lineNumber: 220,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
        lineNumber: 156,
        columnNumber: 9
      }, void 0)
    ) : (
      /* Tracker mode: Loop size selector */
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-px flex-1 min-w-0", children: LOOP_SIZES.map((size) => {
        const isActive = lineLoopSize === size && loopActive;
        const isSelected = lineLoopSize === size;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => handleSizeChange(size),
            className: `
                  flex-1 flex items-center justify-center font-mono font-bold
                  transition-all duration-75 select-none
                  ${isActive ? "bg-accent-highlight/80 text-accent-highlight" : isSelected ? "bg-dark-borderLight text-text-primary" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary"}
                  ${size === LOOP_SIZES[0] ? "rounded-l-sm" : ""}
                  ${size === LOOP_SIZES[LOOP_SIZES.length - 1] ? "rounded-r-sm" : ""}
                `,
            style: { height: 40, fontSize: size >= 10 ? 9 : 11, minWidth: 24 },
            title: `Loop ${size} rows`,
            children: size
          },
          size,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
            lineNumber: 237,
            columnNumber: 15
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
        lineNumber: 232,
        columnNumber: 9
      }, void 0)
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleSlipToggle,
        className: `
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none border border-dark-border
          active:translate-y-[0.5px]
          ${slipEnabled ? "bg-amber-600 text-text-primary" : "bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover"}
        `,
        style: { width: 40, height: 40 },
        title: slipEnabled ? "Disable slip mode" : "Enable slip mode",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: `absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${slipEnabled ? "bg-amber-300" : "bg-dark-border"}`
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
              lineNumber: 279,
              columnNumber: 9
            },
            void 0
          ),
          "SLIP"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
        lineNumber: 264,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckLoopControls.tsx",
    lineNumber: 129,
    columnNumber: 5
  }, void 0);
};
function formatSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor(sec % 1 * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}
const NUM_CHANNELS = 4;
const ScopeCanvas = ({ deckId, channel, size, muted, onClick }) => {
  const canvasRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const isAll = channel === -1;
  const viz = useDeckVisualizationData(deckId);
  const draw = reactExports.useCallback(() => {
    var _a;
    const canvas2 = canvasRef.current;
    if (!canvas2) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas2.width !== size * dpr || canvas2.height !== size * dpr) {
      canvas2.width = size * dpr;
      canvas2.height = size * dpr;
      canvas2.style.width = `${size}px`;
      canvas2.style.height = `${size}px`;
    }
    const ctx = canvas2.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(canvas2);
    const borderColor = cs.getPropertyValue("--color-border").trim() || "#581014";
    const successColor = cs.getPropertyValue("--color-success").trim() || "#10b981";
    const mutedColor = cs.getPropertyValue("--color-text-muted").trim() || "#686060";
    const accentColor = cs.getPropertyValue("--color-accent").trim() || "#ef4444";
    ctx.clearRect(0, 0, size, size);
    const midY = size / 2;
    ctx.beginPath();
    ctx.moveTo(1, midY);
    ctx.lineTo(size - 1, midY);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    const isPlaying = ((_a = useDJStore.getState().decks[deckId]) == null ? void 0 : _a.isPlaying) ?? false;
    const waveform = isPlaying ? viz.getWaveform() : null;
    if (waveform && waveform.length >= 256) {
      if (isAll) {
        ctx.beginPath();
        for (let i = 0; i < 256; i++) {
          const x = 1 + i / 255 * (size - 2);
          const sample = waveform[i] || 0;
          const y = midY - sample * (size / 2 - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = successColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        const samplesPerChannel = 64;
        const offset = channel * samplesPerChannel;
        ctx.beginPath();
        for (let i = 0; i < samplesPerChannel; i++) {
          const x = 1 + i / (samplesPerChannel - 1) * (size - 2);
          const sample = waveform[offset + i] || 0;
          const y = midY - sample * (size / 2 - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = muted ? mutedColor : successColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = muted ? 0.3 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = muted ? accentColor : mutedColor;
    ctx.globalAlpha = muted ? 0.8 : 0.5;
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(isAll ? "ALL" : `CH${channel + 1}`, 3, 3);
    ctx.globalAlpha = 1;
    if (muted && !isAll) {
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [deckId, channel, size, muted, isAll]);
  reactExports.useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      className: "block rounded-sm flex-shrink-0 cursor-pointer",
      style: { width: size, height: size },
      onClick,
      title: isAll ? "Enable all channels" : `CH${channel + 1} — click to mute/unmute, shift+click to solo`
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScopes.tsx",
      lineNumber: 135,
      columnNumber: 5
    },
    void 0
  );
};
const DeckScopes = ({ deckId, size = 64 }) => {
  const channelMask = useDJStore((s) => s.decks[deckId].channelMask);
  const isChannelEnabled = (index) => (channelMask & 1 << index) !== 0;
  const handleChannelClick = reactExports.useCallback((channelIndex, e) => {
    const store = useDJStore.getState();
    if (e.shiftKey) {
      store.setAllDeckChannels(deckId, false);
      store.toggleDeckChannel(deckId, channelIndex);
    } else {
      store.toggleDeckChannel(deckId, channelIndex);
    }
  }, [deckId]);
  const handleAllClick = reactExports.useCallback(() => {
    useDJStore.getState().setAllDeckChannels(deckId, true);
  }, [deckId]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 flex-shrink-0", children: [
    Array.from({ length: NUM_CHANNELS }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      ScopeCanvas,
      {
        deckId,
        channel: i,
        size,
        muted: !isChannelEnabled(i),
        onClick: (e) => handleChannelClick(i, e)
      },
      i,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScopes.tsx",
        lineNumber: 168,
        columnNumber: 9
      },
      void 0
    )),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      ScopeCanvas,
      {
        deckId,
        channel: -1,
        size,
        muted: false,
        onClick: handleAllClick
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScopes.tsx",
        lineNumber: 177,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScopes.tsx",
    lineNumber: 166,
    columnNumber: 5
  }, void 0);
};
const LFO_LABELS = [
  { division: "1/4", label: "¼" },
  { division: "1/8", label: "⅛" },
  { division: "1/16", label: "⅟₁₆" },
  { division: "1/32", label: "⅟₃₂" }
];
const DeckScratch = ({ deckId }) => {
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const scratchVelocity = useDJStore((s) => s.decks[deckId].scratchVelocity);
  const scratchFaderGain = useDJStore((s) => s.decks[deckId].scratchFaderGain);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const faderLFODivision = useDJStore((s) => s.decks[deckId].faderLFODivision);
  const [waitingPattern, setWaitingPattern] = reactExports.useState(null);
  const TAP_MS = 300;
  const pressTimeRef = reactExports.useRef(0);
  const isB = deckId === "B";
  const deckColor = isB ? "text-red-400" : "text-blue-400";
  const deckActiveBg = isB ? "bg-red-900/40 border-red-500/60" : "bg-blue-900/40 border-blue-500/60";
  const deckWaitBg = isB ? "bg-red-900/20 border-red-500/30" : "bg-blue-900/20 border-blue-500/30";
  const handlePatternPointerDown = reactExports.useCallback((patternName, e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (activePatternName !== null) return;
    pressTimeRef.current = performance.now();
    const store = useDJStore.getState();
    setWaitingPattern(patternName);
    let quantizeWaitMs = 0;
    try {
      playDeckPattern(deckId, patternName, (waitMs) => {
        quantizeWaitMs = waitMs;
        setTimeout(() => {
          setWaitingPattern(null);
          store.setDeckPattern(deckId, patternName);
        }, waitMs);
      });
    } catch {
      setWaitingPattern(null);
      return;
    }
    if (quantizeWaitMs === 0) {
      setWaitingPattern(null);
      store.setDeckPattern(deckId, patternName);
    }
  }, [deckId, activePatternName]);
  const handlePatternPointerUp = reactExports.useCallback((_patternName) => {
    const held = performance.now() - pressTimeRef.current;
    if (held < TAP_MS) {
      finishDeckPatternCycle(deckId);
    } else {
      stopDeckPattern(deckId);
    }
    useDJStore.getState().setDeckPattern(deckId, null);
    setWaitingPattern(null);
  }, [deckId]);
  const handleLFOClick = reactExports.useCallback((division) => {
    const store = useDJStore.getState();
    if (division === null || faderLFOActive && faderLFODivision === division) {
      stopDeckFaderLFO(deckId);
      store.setDeckFaderLFO(deckId, false);
      return;
    }
    startDeckFaderLFO(deckId, division);
    store.setDeckFaderLFO(deckId, true, division);
  }, [deckId, faderLFOActive, faderLFODivision]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 flex-wrap", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: SCRATCH_PATTERNS.map((pattern) => {
      const isActive = activePatternName === pattern.name;
      const isWaiting = waitingPattern === pattern.name;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onPointerDown: (e) => handlePatternPointerDown(pattern.name, e),
          onPointerUp: () => handlePatternPointerUp(pattern.name),
          onContextMenu: (e) => e.preventDefault(),
          className: `
                px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all select-none
                ${isActive ? `${deckActiveBg} ${deckColor}` : isWaiting ? `${deckWaitBg} ${deckColor} animate-pulse` : activePatternName !== null ? "bg-transparent border-white/5 text-white/20 cursor-not-allowed" : "bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-text-primary/70"}
              `,
          title: pattern.name,
          children: isWaiting ? "WAIT" : pattern.shortName
        },
        pattern.name,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
          lineNumber: 130,
          columnNumber: 13
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
      lineNumber: 125,
      columnNumber: 7
    }, void 0),
    (activePatternName || faderLFOActive) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex items-center gap-1 font-mono text-xs ${deckColor}`, children: [
      activePatternName && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "opacity-60", children: scratchVelocity > 0.1 ? ">" : scratchVelocity < -0.1 ? "<" : "|" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
          lineNumber: 159,
          columnNumber: 15
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-6 text-right tabular-nums opacity-80", children: Math.abs(scratchVelocity).toFixed(1) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
          lineNumber: 162,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
        lineNumber: 158,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "rounded-sm border",
          style: {
            width: 4,
            height: 12,
            borderColor: isB ? "rgba(248, 113, 113, 0.4)" : "rgba(96, 165, 250, 0.4)",
            backgroundColor: scratchFaderGain > 0.5 ? isB ? "rgba(248, 113, 113, 0.7)" : "rgba(96, 165, 250, 0.7)" : "transparent"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
          lineNumber: 168,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
      lineNumber: 156,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px h-4 bg-white/10 flex-shrink-0" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
      lineNumber: 183,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-white/30 mr-0.5", children: "LFO" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
        lineNumber: 187,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handleLFOClick(null),
          className: `
            px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all
            ${!faderLFOActive ? `${deckActiveBg} ${deckColor}` : "bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-text-primary/70"}
          `,
          children: "OFF"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
          lineNumber: 190,
          columnNumber: 9
        },
        void 0
      ),
      LFO_LABELS.map(({ division, label }) => {
        const isActive = faderLFOActive && faderLFODivision === division;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => handleLFOClick(division),
            className: `
                px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all
                ${isActive ? `${deckActiveBg} ${deckColor}` : "bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-text-primary/70"}
              `,
            title: `Fader LFO ${division} note`,
            children: label
          },
          division,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
            lineNumber: 206,
            columnNumber: 13
          },
          void 0
        );
      })
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
      lineNumber: 186,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckScratch.tsx",
    lineNumber: 123,
    columnNumber: 5
  }, void 0);
};
const FX_PADS = [
  { id: "hpf-sweep", label: "HPF", sublabel: "▲", color: "violet", activeColor: "violet", mode: "momentary" },
  { id: "lpf-sweep", label: "LPF", sublabel: "▼", color: "blue", activeColor: "blue", mode: "momentary" },
  { id: "filter-reset", label: "FLT", sublabel: "RST", color: "gray", activeColor: "green", mode: "momentary" },
  { id: "echo-out", label: "ECHO", sublabel: "OUT", color: "amber", activeColor: "red", mode: "toggle" },
  { id: "kill-low", label: "KILL", sublabel: "LO", color: "orange", activeColor: "red", mode: "toggle" },
  { id: "kill-mid", label: "KILL", sublabel: "MID", color: "gray", activeColor: "red", mode: "toggle" },
  { id: "kill-hi", label: "KILL", sublabel: "HI", color: "cyan", activeColor: "red", mode: "toggle" },
  { id: "brake", label: "BRK", sublabel: "⏎", color: "rose", activeColor: "rose", mode: "momentary" }
];
const JUMP_PADS = [
  { id: "jump-back-16", label: "◄◄", sublabel: "16", color: "indigo", activeColor: "indigo", mode: "instant" },
  { id: "jump-back-4", label: "◄◄", sublabel: "4", color: "blue", activeColor: "blue", mode: "instant" },
  { id: "jump-back-1", label: "◄", sublabel: "1", color: "sky", activeColor: "sky", mode: "instant" },
  { id: "jump-back-half", label: "◄", sublabel: "½", color: "teal", activeColor: "teal", mode: "instant" },
  { id: "jump-fwd-half", label: "►", sublabel: "½", color: "teal", activeColor: "teal", mode: "instant" },
  { id: "jump-fwd-1", label: "►", sublabel: "1", color: "sky", activeColor: "sky", mode: "instant" },
  { id: "jump-fwd-4", label: "►►", sublabel: "4", color: "blue", activeColor: "blue", mode: "instant" },
  { id: "jump-fwd-16", label: "►►", sublabel: "16", color: "indigo", activeColor: "indigo", mode: "instant" }
];
const BAND_MAP = {
  "kill-low": "low",
  "kill-mid": "mid",
  "kill-hi": "high"
};
const BEAT_JUMPS = {
  "jump-back-16": -16,
  "jump-back-4": -4,
  "jump-back-1": -1,
  "jump-back-half": -0.5,
  "jump-fwd-half": 0.5,
  "jump-fwd-1": 1,
  "jump-fwd-4": 4,
  "jump-fwd-16": 16
};
const DeckFXPads = ({ deckId }) => {
  const [page, setPage] = reactExports.useState("fx");
  const [activePads, setActivePads] = reactExports.useState(/* @__PURE__ */ new Set());
  const cancelRefs = reactExports.useRef(/* @__PURE__ */ new Map());
  const killLow = useDJStore((s) => s.decks[deckId].eqLowKill);
  const killMid = useDJStore((s) => s.decks[deckId].eqMidKill);
  const killHigh = useDJStore((s) => s.decks[deckId].eqHighKill);
  const hasBeatGrid = useDJStore((s) => !!s.decks[deckId].beatGrid);
  const killState = {
    "kill-low": killLow,
    "kill-mid": killMid,
    "kill-hi": killHigh
  };
  const cancelPad = reactExports.useCallback((padId) => {
    const cancel = cancelRefs.current.get(padId);
    if (cancel) {
      cancel();
      cancelRefs.current.delete(padId);
    }
    setActivePads((prev) => {
      const next = new Set(prev);
      next.delete(padId);
      return next;
    });
  }, []);
  const activateFXPad = reactExports.useCallback((padId) => {
    var _a;
    if (padId === "echo-out" && cancelRefs.current.has(padId)) {
      cancelPad(padId);
      return;
    }
    cancelPad(padId);
    setActivePads((prev) => new Set(prev).add(padId));
    let cancelFn;
    switch (padId) {
      case "hpf-sweep":
        cancelFn = filterSweep(deckId, -0.85, 4, () => cancelPad(padId));
        break;
      case "lpf-sweep":
        cancelFn = filterSweep(deckId, 0.85, 4, () => cancelPad(padId));
        break;
      case "filter-reset":
        cancelFn = filterReset(deckId);
        setTimeout(() => cancelPad(padId), 150);
        break;
      case "echo-out":
        cancelFn = echoOut(deckId, 8, () => cancelPad(padId));
        break;
      case "kill-low":
      case "kill-mid":
      case "kill-hi": {
        const band = BAND_MAP[padId];
        const killKey = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill`;
        const current = useDJStore.getState().decks[deckId][killKey];
        const newKill = !current;
        useDJStore.getState().setDeckEQKill(deckId, band, newKill);
        if (getQuantizeMode() !== "off") {
          cancelFn = quantizedEQKill(deckId, band, newKill);
        } else {
          instantEQKill(deckId, band, newKill);
        }
        if (!newKill) cancelPad(padId);
        break;
      }
      case "brake": {
        try {
          const engine = getDJEngine();
          const deck = engine.getDeck(deckId);
          const state = useDJStore.getState().decks[deckId];
          const bpm = ((_a = state.beatGrid) == null ? void 0 : _a.bpm) || state.detectedBPM || state.effectiveBPM || 120;
          const durationMs = 2 * 60 / bpm * 1e3;
          let rafId = 0;
          const startTime = performance.now();
          const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const rate = 1 - progress * progress;
            useDJStore.getState().setDeckPitch(deckId, 12 * Math.log2(Math.max(0.01, rate)));
            if (progress < 1) {
              rafId = requestAnimationFrame(animate);
            } else {
              deck.pause();
              useDJStore.getState().setDeckPlaying(deckId, false);
              useDJStore.getState().setDeckPitch(deckId, 0);
              cancelPad(padId);
            }
          };
          rafId = requestAnimationFrame(animate);
          cancelFn = () => {
            cancelAnimationFrame(rafId);
            useDJStore.getState().setDeckPitch(deckId, 0);
          };
        } catch {
          cancelPad(padId);
        }
        break;
      }
    }
    if (cancelFn) {
      cancelRefs.current.set(padId, cancelFn);
    }
  }, [deckId, cancelPad]);
  const handlePadDown = reactExports.useCallback((pad) => {
    if (pad.mode === "instant") {
      const beats = BEAT_JUMPS[pad.id];
      if (beats !== void 0) beatJump(deckId, beats);
      setActivePads((prev) => new Set(prev).add(pad.id));
      setTimeout(() => setActivePads((prev) => {
        const n = new Set(prev);
        n.delete(pad.id);
        return n;
      }), 120);
    } else {
      activateFXPad(pad.id);
    }
  }, [deckId, activateFXPad]);
  const handlePadUp = reactExports.useCallback((pad) => {
    if (pad.mode === "momentary") {
      if (pad.id === "hpf-sweep" || pad.id === "lpf-sweep") {
        cancelPad(pad.id);
        filterReset(deckId);
      }
    }
  }, [deckId, cancelPad]);
  const isActive = (padId) => {
    if (padId in killState) return killState[padId];
    return activePads.has(padId);
  };
  const pads = page === "fx" ? FX_PADS : JUMP_PADS;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setPage("fx"),
          className: `px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${page === "fx" ? "bg-violet-600/30 text-violet-300 border border-violet-500/40" : "bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary"}`,
          children: "FX PADS"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
          lineNumber: 226,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setPage("jump"),
          className: `px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${page === "jump" ? "bg-sky-600/30 text-sky-300 border border-sky-500/40" : "bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary"}`,
          children: "BEAT JUMP"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
          lineNumber: 236,
          columnNumber: 9
        },
        void 0
      ),
      page === "jump" && hasBeatGrid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[7px] text-green-400 ml-auto", children: "● GRID" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
        lineNumber: 247,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
      lineNumber: 225,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-4 gap-1", children: pads.map((pad) => {
      const active = isActive(pad.id);
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onPointerDown: () => handlePadDown(pad),
          onPointerUp: () => handlePadUp(pad),
          onPointerLeave: () => pad.mode === "momentary" && handlePadUp(pad),
          className: `
                flex flex-col items-center justify-center
                h-9 rounded-md text-[8px] font-bold leading-tight
                select-none touch-none
                transition-all duration-75
                active:scale-95
                ${active ? `bg-${pad.activeColor}-600/40 text-${pad.activeColor}-200 border border-${pad.activeColor}-500/50` : "bg-dark-bgTertiary text-text-muted border border-dark-border hover:bg-dark-bgHover hover:text-text-secondary"}
              `,
          title: `${pad.label} ${pad.sublabel ?? ""} (${pad.mode})`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: pad.label }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
              lineNumber: 275,
              columnNumber: 15
            }, void 0),
            pad.sublabel && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[7px] opacity-60", children: pad.sublabel }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
              lineNumber: 276,
              columnNumber: 32
            }, void 0)
          ]
        },
        pad.id,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
          lineNumber: 256,
          columnNumber: 13
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
      lineNumber: 252,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckFXPads.tsx",
    lineNumber: 223,
    columnNumber: 5
  }, void 0);
};
const HOT_CUE_COLORS = [
  "#E91E63",
  // 1: Pink
  "#FF9800",
  // 2: Orange
  "#2196F3",
  // 3: Blue
  "#4CAF50",
  // 4: Green
  "#9C27B0",
  // 5: Purple
  "#00BCD4",
  // 6: Cyan
  "#FFEB3B",
  // 7: Yellow
  "#F44336"
  // 8: Red
];
const DeckCuePoints = ({ deckId }) => {
  const hotCues = useDJStore((s) => s.decks[deckId].hotCues);
  const seratoCues = useDJStore((s) => s.decks[deckId].seratoCuePoints);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const handleClick = reactExports.useCallback((index, e) => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const store = useDJStore.getState();
      const cue = store.decks[deckId].hotCues[index];
      if (e.shiftKey && cue) {
        store.deleteHotCue(deckId, index);
        return;
      }
      if (cue) {
        const seconds = cue.position / 1e3;
        if (deck.playbackMode === "audio") {
          markSeek(deckId);
          deck.audioPlayer.seek(seconds);
          store.setDeckState(deckId, {
            audioPosition: seconds,
            elapsedMs: cue.position
          });
        } else {
          const state = store.decks[deckId];
          if (state.durationMs > 0 && state.totalPositions > 0) {
            const pos = Math.floor(cue.position / state.durationMs * state.totalPositions);
            deck.cue(Math.max(0, Math.min(pos, state.totalPositions - 1)), 0);
          }
        }
      } else {
        let positionMs = 0;
        const state = store.decks[deckId];
        if (deck.playbackMode === "audio") {
          positionMs = deck.audioPlayer.getPosition() * 1e3;
        } else {
          positionMs = state.elapsedMs;
        }
        const newCue = {
          position: positionMs,
          color: HOT_CUE_COLORS[index],
          name: ""
        };
        store.setHotCue(deckId, index, newCue);
      }
    } catch {
    }
  }, [deckId]);
  const mergedSlots = hotCues.map((native, i) => {
    if (native) return { position: native.position, color: native.color, name: native.name, isNative: true };
    const serato = seratoCues.find((c) => c.index === i);
    if (serato) return { position: serato.position, color: serato.color, name: serato.name, isNative: false };
    return null;
  });
  const hasAnyCues = mergedSlots.some((s) => s !== null);
  if (playbackMode !== "audio" && !hasAnyCues) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: mergedSlots.map((cue, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: (e) => handleClick(i, e),
      className: "flex-1 h-6 rounded text-[9px] font-mono font-bold transition-all border border-transparent",
      style: cue ? {
        backgroundColor: `${cue.color}30`,
        borderColor: `${cue.color}80`,
        color: cue.color
      } : {
        backgroundColor: "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.15)"
      },
      title: cue ? `${cue.name || `Cue ${i + 1}`} — ${formatCueTime(cue.position)}${cue.isNative ? "" : " (Serato)"}${"\n"}Shift+click to delete` : `Cue ${i + 1} — click to set at current position`,
      children: cue ? cue.name || i + 1 : i + 1
    },
    i,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCuePoints.tsx",
      lineNumber: 106,
      columnNumber: 9
    },
    void 0
  )) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckCuePoints.tsx",
    lineNumber: 104,
    columnNumber: 5
  }, void 0);
};
function formatCueTime(ms) {
  const sec = Math.floor(ms / 1e3);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  const frac = Math.floor(ms % 1e3 / 10);
  return `${min}:${String(s).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}
function WorkerWrapper$1(options) {
  return new Worker(
    "/assets/dj-beatgrid.worker-ra2xnAkU.js",
    {
      name: options == null ? void 0 : options.name
    }
  );
}
const DeckBeatGrid = ({ deckId, height = 24 }) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const bridgeRef = reactExports.useRef(null);
  const seratoBeatGrid = useDJStore((s) => s.decks[deckId].seratoBeatGrid);
  const analysisBeatGrid = useDJStore((s) => s.decks[deckId].beatGrid);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const hasSerato = seratoBeatGrid.length > 0;
  const hasAnalysis = analysisBeatGrid !== null && analysisBeatGrid.beats.length > 0;
  const hasBeatData = hasSerato || hasAnalysis;
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container || !("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return;
    if (!hasBeatData) return;
    const canvas2 = document.createElement("canvas");
    canvas2.style.cssText = `display:block;width:100%;height:${height}px`;
    container.appendChild(canvas2);
    canvasRef.current = canvas2;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, container.clientWidth);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas2.transferControlToOffscreen();
    const posFrac = deck.playbackMode === "tracker" ? deck.totalPositions > 0 ? (deck.songPos + 0.5) / deck.totalPositions : 0 : 0;
    const bridge = new OffscreenBridge(
      WorkerWrapper$1,
      { onReady: () => {
      } }
    );
    bridgeRef.current = bridge;
    bridge.post({
      type: "init",
      canvas: offscreen,
      dpr,
      width: w,
      height,
      beatGrid: deck.seratoBeatGrid,
      analysisBeatGrid: deck.beatGrid,
      durationMs: deck.durationMs,
      audioPosition: deck.audioPosition,
      positionFraction: posFrac
    }, [offscreen]);
    const unsubPos = useDJStore.subscribe(
      (s) => [s.decks[deckId].audioPosition, s.decks[deckId].songPos, s.decks[deckId].totalPositions],
      ([audioPos, sPos, total]) => {
        var _a;
        const frac = total > 0 ? (sPos + 0.5) / total : 0;
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "position", audioPosition: audioPos, positionFraction: frac });
      }
    );
    const unsubGrid = useDJStore.subscribe(
      (s) => [s.decks[deckId].seratoBeatGrid, s.decks[deckId].beatGrid],
      ([newSerato, newAnalysis]) => {
        var _a;
        return (_a = bridgeRef.current) == null ? void 0 : _a.post({
          type: "beatGrid",
          beatGrid: newSerato,
          analysisBeatGrid: newAnalysis,
          durationMs: useDJStore.getState().decks[deckId].durationMs
        });
      }
    );
    const observer = new ResizeObserver((entries) => {
      var _a;
      const entry = entries[0];
      if (!entry) return;
      const w2 = Math.floor(entry.contentRect.width);
      if (w2 > 0) {
        (_a = bridgeRef.current) == null ? void 0 : _a.post({ type: "resize", w: w2, h: height, dpr: window.devicePixelRatio || 1 });
      }
    });
    observer.observe(container);
    return () => {
      unsubPos();
      unsubGrid();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas2.remove();
      canvasRef.current = null;
    };
  }, [deckId, playbackMode, hasBeatData, height]);
  if (!hasBeatData) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "absolute inset-0 pointer-events-none",
      style: { height }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckBeatGrid.tsx",
      lineNumber: 124,
      columnNumber: 5
    },
    void 0
  );
};
const DJDeck = ({ deckId }) => {
  const [isDragOver, setIsDragOver] = reactExports.useState(false);
  const [isLoadingDrop, setIsLoadingDrop] = reactExports.useState(false);
  const [vizResetKey, setVizResetKey] = reactExports.useState(0);
  const dragCountRef = reactExports.useRef(0);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const hasPatternData = useDJStore((s) => s.decks[deckId].totalPositions > 0);
  const hasAudioWaveform = useDJStore((s) => {
    const peaks = s.decks[deckId].waveformPeaks;
    return !!(peaks && peaks.length > 0);
  });
  reactExports.useEffect(() => {
    let prevPitch = useDJStore.getState().decks[deckId].pitchOffset;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newPitch = state.decks[deckId].pitchOffset;
      if (newPitch !== prevPitch) {
        prevPitch = newPitch;
        setDeckPitch(deckId, newPitch);
      }
    });
    return unsubscribe;
  }, [deckId]);
  reactExports.useEffect(() => {
    let prevMask = useDJStore.getState().decks[deckId].channelMask;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newMask = state.decks[deckId].channelMask;
      if (newMask !== prevMask) {
        prevMask = newMask;
        setDeckChannelMuteMask(deckId, newMask);
      }
    });
    return unsubscribe;
  }, [deckId]);
  reactExports.useEffect(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      deck.replayer.onRowChange = (_row, _pattern, _position) => {
      };
      deck.replayer.onSongEnd = () => {
        useDJStore.getState().setDeckPlaying(deckId, false);
      };
    } catch {
    }
  }, [deckId]);
  const handleDragEnter = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.items && Array.from(e.dataTransfer.items).some((i) => i.kind === "file")) {
      setIsDragOver(true);
    }
  }, []);
  const handleDragLeave = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragOver(false);
  }, []);
  const handleDragOver = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const handleDrop = reactExports.useCallback(async (e) => {
    var _a;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCountRef.current = 0;
    const file = Array.from(e.dataTransfer.files)[0];
    if (!file) return;
    setVizResetKey((k) => k + 1);
    setIsLoadingDrop(true);
    try {
      const engine = getDJEngine();
      if (/\.(sqs|seq)$/i.test(file.name)) {
        const { useUIStore: useUIStore2 } = await __vitePreload(async () => {
          const { useUIStore: useUIStore3 } = await import("./main-BbV5VyEH.js").then((n) => n.iQ);
          return { useUIStore: useUIStore3 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        useUIStore2.getState().setPendingTD3File(file);
        return;
      }
      if (isAudioFile(file.name)) {
        const buffer = await file.arrayBuffer();
        const info = await engine.loadAudioToDeck(deckId, buffer, file.name);
        useDJStore.getState().setDeckViewMode("vinyl");
        let seratoBPM = 0;
        let seratoCues = [];
        let seratoLoops = [];
        let seratoBeatGrid = [];
        let seratoKey = null;
        try {
          const { readSeratoMetadata } = await __vitePreload(async () => {
            const { readSeratoMetadata: readSeratoMetadata2 } = await import("./seratoMetadata-BfJ6LXfc.js");
            return { readSeratoMetadata: readSeratoMetadata2 };
          }, true ? [] : void 0);
          const meta = readSeratoMetadata(buffer);
          seratoBPM = meta.bpm ?? 0;
          seratoCues = meta.cuePoints;
          seratoLoops = meta.loops;
          seratoBeatGrid = meta.beatGrid;
          seratoKey = meta.key;
        } catch {
        }
        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: file.name.replace(/\.[^.]+$/, ""),
          detectedBPM: seratoBPM,
          effectiveBPM: seratoBPM,
          totalPositions: 0,
          songPos: 0,
          pattPos: 0,
          elapsedMs: 0,
          isPlaying: false,
          playbackMode: "audio",
          durationMs: info.duration * 1e3,
          audioPosition: 0,
          waveformPeaks: info.waveformPeaks,
          seratoCuePoints: seratoCues,
          seratoLoops,
          seratoBeatGrid,
          seratoKey
        });
      } else if (isUADEFormat(file.name)) {
        const moduleBuffer = await file.arrayBuffer();
        await loadUADEToDeck(engine, deckId, moduleBuffer, file.name, true);
        useDJStore.getState().setDeckViewMode("visualizer");
      } else {
        const song = await parseModuleToSong(file);
        cacheSong(file.name, song);
        const bpmResult = detectBPM(song);
        const moduleBuffer = await file.arrayBuffer();
        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: song.name || file.name,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: "rendering",
          isPlaying: false
        });
        try {
          const result = await getDJPipeline().loadOrEnqueue(moduleBuffer, file.name, deckId, "high");
          await engine.loadAudioToDeck(deckId, result.wavData, file.name, song.name || file.name, ((_a = result.analysis) == null ? void 0 : _a.bpm) || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode("visualizer");
        } catch (err) {
          console.error(`[DJDeck] Pipeline failed:`, err);
        }
      }
    } catch (err) {
      console.error(`[DJDeck] Failed to load ${file.name} to deck ${deckId}:`, err);
    } finally {
      setIsLoadingDrop(false);
    }
  }, [deckId]);
  const isB = deckId === "B";
  const deckNum = deckId === "A" ? "1" : deckId === "B" ? "2" : "3";
  const deckColor = deckId === "A" ? "text-blue-400" : deckId === "B" ? "text-red-400" : "text-emerald-400";
  const deckBorderColor = deckId === "A" ? "border-blue-900/30" : deckId === "B" ? "border-red-900/30" : "border-emerald-900/30";
  const deckHighlight = deckId === "A" ? "border-blue-500/60" : deckId === "B" ? "border-red-500/60" : "border-emerald-500/60";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: `relative flex flex-col gap-2 p-3 bg-dark-bg rounded-lg border min-w-0 h-full overflow-hidden transition-all ${isDragOver ? deckHighlight : deckBorderColor}`,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      "data-dj-deck-drop": true,
      children: [
        isDragOver && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 z-10 bg-black/70 rounded-lg flex items-center justify-center pointer-events-none", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-lg font-mono font-bold ${deckColor}`, children: [
          "Drop to load Deck ",
          deckNum
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 240,
          columnNumber: 11
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 239,
          columnNumber: 9
        }, void 0),
        isLoadingDrop && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 z-10 bg-black/70 rounded-lg flex items-center justify-center pointer-events-none", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-sm font-mono ${deckColor} animate-pulse`, children: "Loading..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 249,
          columnNumber: 11
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 248,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0 overflow-hidden", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-xs font-mono font-bold tracking-[0.3em] uppercase ${deckColor} opacity-60 mb-1`, children: [
              "Deck ",
              deckNum
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 256,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckScopes, { deckId, size: 64 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 259,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckTrackInfo, { deckId }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 260,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 255,
            columnNumber: 9
          }, void 0),
          deckViewMode === "visualizer" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckTurntable, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 262,
            columnNumber: 43
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 254,
          columnNumber: 7
        }, void 0),
        !hasAudioWaveform && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckTrackOverview, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 268,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckBeatGrid, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 269,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 267,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex gap-2 flex-1 min-h-0 ${isB ? "flex-row-reverse" : ""}`, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0 min-h-0 flex items-center justify-center relative", children: [
            deckViewMode === "vinyl" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckCssTurntable, { deckId }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 280,
              columnNumber: 13
            }, void 0) : hasPatternData || hasAudioWaveform ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckVisualizer, { deckId, resetKey: vizResetKey }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 282,
              columnNumber: 13
            }, void 0) : null,
            deckViewMode !== "visualizer" && (hasPatternData || hasAudioWaveform) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 pointer-events-none", style: { opacity: hasPatternData ? 0.55 : 0.7 }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckPatternDisplay, { deckId }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 288,
              columnNumber: 15
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
              lineNumber: 287,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 278,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 self-stretch", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckPitchSlider, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 295,
            columnNumber: 11
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 294,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 276,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckCuePoints, { deckId }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 300,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckTransport, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 304,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckNudge, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 305,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckLoopControls, { deckId }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
            lineNumber: 306,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 303,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckFXPads, { deckId }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 310,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckScratch, { deckId }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
          lineNumber: 313,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJDeck.tsx",
      lineNumber: 227,
      columnNumber: 5
    },
    void 0
  );
};
const MixerFilterKnob = ({ deckId }) => {
  const filterPosition = useDJStore((s) => s.decks[deckId].filterPosition);
  const handleChange = reactExports.useCallback((value) => {
    setDeckFilter(deckId, value);
  }, [deckId]);
  const formatFilter = reactExports.useCallback((val) => {
    if (Math.abs(val) < 0.01) return "OFF";
    if (val < 0) return "HPF";
    return "LPF";
  }, []);
  const deckNum = deckId === "A" ? "1" : "2";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Knob,
    {
      value: filterPosition,
      min: -1,
      max: 1,
      onChange: handleChange,
      label: "FLT",
      size: "sm",
      color: "#aa44ff",
      bipolar: true,
      defaultValue: 0,
      formatValue: formatFilter,
      hideValue: true,
      title: `Deck ${deckNum} Filter — left: high-pass, center: off, right: low-pass`
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerEQ.tsx",
      lineNumber: 35,
      columnNumber: 5
    },
    void 0
  );
};
const MixerEQBandKnob = ({ deckId, band, label, color, side }) => {
  const eqValue = useDJStore((s) => s.decks[deckId][`eq${band.charAt(0).toUpperCase() + band.slice(1)}`]);
  const killKey = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill`;
  const killActive = useDJStore((s) => s.decks[deckId][killKey]);
  const handleChange = reactExports.useCallback((dB) => {
    setDeckEQ(deckId, band, dB);
  }, [deckId, band]);
  const handleKillToggle = reactExports.useCallback(() => {
    const current = useDJStore.getState().decks[deckId][killKey];
    setDeckEQKill(deckId, band, !current);
  }, [deckId, band, killKey]);
  const formatEQ = reactExports.useCallback((val) => {
    if (val === 0) return "0";
    return `${val > 0 ? "+" : ""}${val.toFixed(0)}`;
  }, []);
  const deckNum = deckId === "A" ? "1" : "2";
  const bandDesc = band === "high" ? "treble" : band === "low" ? "bass" : "mid";
  const killButton = /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: handleKillToggle,
      className: `
        w-4 h-4 rounded-sm text-[7px] font-black leading-none
        flex items-center justify-center flex-shrink-0
        transition-all duration-75
        ${killActive ? "bg-red-600 text-text-primary shadow-[0_0_6px_rgba(220,38,38,0.5)]" : "bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover border border-dark-border"}
      `,
      title: `${killActive ? "Unmute" : "Kill"} ${label} (${getQuantizeMode() !== "off" ? "quantized" : "instant"})`,
      children: "K"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerEQ.tsx",
      lineNumber: 82,
      columnNumber: 5
    },
    void 0
  );
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-0.5", children: [
    side === "left" && killButton,
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: eqValue,
        min: -24,
        max: 6,
        onChange: handleChange,
        label,
        size: "sm",
        color,
        bipolar: true,
        defaultValue: 0,
        formatValue: formatEQ,
        hideValue: true,
        title: `Deck ${deckNum} EQ ${label} — ${bandDesc} (-24 to +6 dB)`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerEQ.tsx",
        lineNumber: 103,
        columnNumber: 7
      },
      void 0
    ),
    side === "right" && killButton
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerEQ.tsx",
    lineNumber: 101,
    columnNumber: 5
  }, void 0);
};
const VU_SEGMENTS$1 = 14;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_SEGMENTS_PER_SEC = 12;
function levelToSegments$1(dBLevel) {
  if (dBLevel <= -60) return 0;
  if (dBLevel >= 0) return VU_SEGMENTS$1;
  return Math.round((dBLevel + 60) / 60 * VU_SEGMENTS$1);
}
const COLORS = {
  off: "var(--color-bg-tertiary)",
  green: "var(--color-success)",
  yellow: "var(--color-warning)",
  red: "var(--color-error)"
};
function getSegmentColor$1(index) {
  if (index >= 12) return COLORS.red;
  if (index >= 8) return COLORS.yellow;
  return COLORS.green;
}
const MixerVUMeter = ({ deckId, stretch }) => {
  const viz = useDeckVisualizationData(deckId);
  const containerRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  const peakRef = reactExports.useRef(-1);
  const peakTimeRef = reactExports.useRef(0);
  const prevSegmentsRef = reactExports.useRef(-1);
  const prevPeakRef = reactExports.useRef(-1);
  reactExports.useEffect(() => {
    mountedRef.current = true;
    let lastTime = performance.now();
    const tick = (now) => {
      if (!mountedRef.current) return;
      const dt = (now - lastTime) / 1e3;
      lastTime = now;
      let segments2 = 0;
      let peak = -1;
      try {
        const dB = viz.getLevel();
        const dbVal = typeof dB === "number" ? dB : -Infinity;
        segments2 = levelToSegments$1(dbVal);
        if (segments2 >= peakRef.current) {
          peakRef.current = segments2;
          peakTimeRef.current = now;
        } else if (now - peakTimeRef.current > PEAK_HOLD_MS) {
          peakRef.current = Math.max(segments2, peakRef.current - PEAK_DECAY_SEGMENTS_PER_SEC * dt);
        }
        peak = Math.round(peakRef.current);
      } catch {
      }
      if (segments2 !== prevSegmentsRef.current || peak !== prevPeakRef.current) {
        prevSegmentsRef.current = segments2;
        prevPeakRef.current = peak;
        const container = containerRef.current;
        if (container) {
          const children = container.children;
          for (let i = 0; i < VU_SEGMENTS$1; i++) {
            const el = children[i];
            if (!el) continue;
            const isLit = i < segments2;
            const isPeak = !isLit && i === peak - 1 && peak > segments2;
            el.style.backgroundColor = isLit || isPeak ? getSegmentColor$1(i) : COLORS.off;
            el.style.opacity = isPeak ? "0.85" : "1";
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: `flex flex-col-reverse gap-[1px] justify-center${stretch ? " self-stretch flex-1" : ""}`,
      style: { width: 12 },
      title: `Deck ${deckId === "A" ? "1" : "2"} level meter`,
      children: Array.from({ length: VU_SEGMENTS$1 }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: `rounded-[1px]${stretch ? " flex-1" : ""}`,
          style: {
            width: 12,
            ...!stretch ? { height: 5 } : { minHeight: 3 },
            backgroundColor: COLORS.off
          }
        },
        i,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerVUMeter.tsx",
          lineNumber: 120,
          columnNumber: 9
        },
        void 0
      ))
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerVUMeter.tsx",
      lineNumber: 113,
      columnNumber: 5
    },
    void 0
  );
};
const TRACK_HEIGHT = 80;
const THUMB_HEIGHT = 12;
const THUMB_WIDTH = 24;
function volumeToDb(volume) {
  if (volume <= 0) return "-∞";
  const dB = 20 * Math.log10(volume);
  if (dB >= -0.5) return "0dB";
  if (dB < -60) return "-∞dB";
  return `${dB.toFixed(0)}dB`;
}
const MixerChannelStrip = ({ deckId, stretch }) => {
  const volume = useDJStore((s) => s.decks[deckId].volume);
  const trimGain = useDJStore((s) => s.decks[deckId].trimGain);
  const scratchFaderGain = useDJStore((s) => s.decks[deckId].scratchFaderGain);
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const [dragging, setDragging] = reactExports.useState(false);
  const trackRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setDeckTrimGain(deckId, trimGain);
  }, [deckId, trimGain]);
  const setVolume = reactExports.useCallback((value) => {
    setDeckVolume(deckId, value);
  }, [deckId]);
  const getVolumeFromY = reactExports.useCallback((clientY) => {
    const track = trackRef.current;
    if (!track) return volume;
    const rect = track.getBoundingClientRect();
    const y = clientY - rect.top;
    return 1 - Math.max(0, Math.min(1, y / rect.height));
  }, [volume]);
  const handlePointerDown = reactExports.useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    e.target.setPointerCapture(e.pointerId);
    setVolume(getVolumeFromY(e.clientY));
  }, [getVolumeFromY, setVolume]);
  const handlePointerMove = reactExports.useCallback((e) => {
    if (!dragging) return;
    setVolume(getVolumeFromY(e.clientY));
  }, [dragging, getVolumeFromY, setVolume]);
  const handlePointerUp = reactExports.useCallback(() => {
    setDragging(false);
  }, []);
  const deckNum = deckId === "A" ? "1" : "2";
  const isB = deckId === "B";
  const usableHeight = TRACK_HEIGHT - THUMB_HEIGHT;
  const thumbTop = (1 - volume) * usableHeight;
  const isFaderActive = activePatternName !== null || faderLFOActive;
  const isCut = isFaderActive && scratchFaderGain < 0.5;
  const cutColor = isB ? "rgba(248, 113, 113, 0.6)" : "rgba(96, 165, 250, 0.6)";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex flex-col items-center gap-1${stretch ? " self-stretch" : ""}`, title: `Deck ${deckNum} channel fader`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-[10px] font-mono tracking-wider", children: deckNum }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
      lineNumber: 92,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        ref: trackRef,
        className: `relative cursor-pointer select-none${stretch ? " flex-1" : ""}`,
        style: { width: THUMB_WIDTH + 4, ...!stretch ? { height: TRACK_HEIGHT } : { minHeight: TRACK_HEIGHT } },
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerUp,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: `absolute rounded-full ${isCut ? "border" : "bg-dark-bgTertiary border border-dark-border"}`,
              style: {
                left: "50%",
                transform: "translateX(-50%)",
                width: 6,
                top: 0,
                bottom: 0,
                ...isCut ? { backgroundColor: cutColor, borderColor: cutColor } : {}
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
              lineNumber: 107,
              columnNumber: 9
            },
            void 0
          ),
          isFaderActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute rounded-full",
              style: {
                left: "50%",
                transform: "translateX(-50%)",
                width: 6,
                bottom: 0,
                height: `${scratchFaderGain * 100}%`,
                backgroundColor: isB ? "rgba(248, 113, 113, 0.4)" : "rgba(96, 165, 250, 0.4)",
                transition: "height 20ms linear"
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
              lineNumber: 125,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: `absolute rounded-sm border ${dragging ? "bg-text-muted border-text-secondary" : isCut ? "border-dark-border" : "bg-dark-borderLight border-dark-border hover:bg-text-muted"}`,
              style: {
                width: THUMB_WIDTH,
                height: THUMB_HEIGHT,
                left: "50%",
                transform: "translateX(-50%)",
                top: thumbTop,
                transition: dragging ? "none" : "top 0.05s ease-out",
                backgroundColor: isCut ? cutColor : void 0
              }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
              lineNumber: 140,
              columnNumber: 9
            },
            void 0
          ),
          isCut && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "absolute inset-0 flex items-center justify-center pointer-events-none",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: "text-[8px] font-mono font-bold tracking-wider",
                  style: { color: isB ? "#f87171" : "#60a5fa" },
                  children: "CUT"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
                  lineNumber: 164,
                  columnNumber: 13
                },
                void 0
              )
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
              lineNumber: 161,
              columnNumber: 11
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
        lineNumber: 97,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-muted text-[9px] font-mono", children: volumeToDb(volume) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
      lineNumber: 175,
      columnNumber: 7
    }, void 0),
    trimGain !== 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[8px] font-mono text-accent-info opacity-70", title: `Auto-gain trim: ${trimGain > 0 ? "+" : ""}${trimGain.toFixed(1)}dB`, children: [
      "AG ",
      trimGain > 0 ? "+" : "",
      trimGain.toFixed(0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
      lineNumber: 181,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerChannelStrip.tsx",
    lineNumber: 90,
    columnNumber: 5
  }, void 0);
};
const CURVES = [
  { key: "linear", label: "Linear" },
  { key: "cut", label: "Cut" },
  { key: "smooth", label: "Smooth" }
];
const MixerCrossfader = () => {
  const position = useDJStore((s) => s.crossfaderPosition);
  const curve = useDJStore((s) => s.crossfaderCurve);
  const stateRef = reactExports.useRef({ position, curve });
  reactExports.useEffect(() => {
    stateRef.current = { position, curve };
  }, [position, curve]);
  const handlePositionChange = reactExports.useCallback((e) => {
    setCrossfader(parseFloat(e.target.value));
  }, []);
  const handleCurveChange = reactExports.useCallback((newCurve) => {
    setCrossfaderCurve(newCurve);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1 w-full px-2", title: "Crossfader", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 w-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary text-xs font-mono font-bold", title: "Deck 1", children: "1" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
        lineNumber: 45,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 relative", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: 0,
          max: 1,
          step: 5e-3,
          value: position,
          onChange: handlePositionChange,
          className: "crossfader-slider w-full",
          title: `Crossfader — blend between Deck 1 and Deck 2`,
          style: {
            appearance: "none",
            WebkitAppearance: "none",
            height: 24,
            background: "transparent",
            cursor: "pointer"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
          lineNumber: 48,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
        lineNumber: 47,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary text-xs font-mono font-bold", title: "Deck 2", children: "2" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
        lineNumber: 67,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
      lineNumber: 44,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: CURVES.map(({ key, label }) => {
      const curveDescriptions = {
        linear: "Linear — equal crossfade, smooth blend",
        cut: "Cut — hard switch, no blending",
        smooth: "Smooth — constant-power crossfade"
      };
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handleCurveChange(key),
          className: `
                px-2 py-0.5 text-[10px] font-mono rounded transition-colors
                ${curve === key ? "bg-accent-primary text-text-inverse" : "bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight"}
              `,
          title: curveDescriptions[key],
          children: label
        },
        key,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
          lineNumber: 79,
          columnNumber: 13
        },
        void 0
      );
    }) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
      lineNumber: 71,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("style", { children: `
        .crossfader-slider::-webkit-slider-runnable-track {
          height: 6px;
          background: var(--color-bg-tertiary);
          border-radius: 3px;
          border: 1px solid var(--color-border);
        }
        .crossfader-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 32px;
          height: 18px;
          background: var(--color-border-light);
          border: 1px solid var(--color-border);
          border-radius: 3px;
          cursor: grab;
          margin-top: -7px;
        }
        .crossfader-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          background: var(--color-text-muted);
        }
        .crossfader-slider::-moz-range-track {
          height: 6px;
          background: var(--color-bg-tertiary);
          border-radius: 3px;
          border: 1px solid var(--color-border);
        }
        .crossfader-slider::-moz-range-thumb {
          width: 32px;
          height: 18px;
          background: var(--color-border-light);
          border: 1px solid var(--color-border);
          border-radius: 3px;
          cursor: grab;
        }
      ` }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
      lineNumber: 99,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCrossfader.tsx",
    lineNumber: 42,
    columnNumber: 5
  }, void 0);
};
const MixerTransition = () => {
  const [automating, setAutomating] = reactExports.useState(false);
  const [direction, setDirection] = reactExports.useState(null);
  const cancelRef = reactExports.useRef(null);
  const cancelCurrent = reactExports.useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    cancelAllAutomation();
    setAutomating(false);
    setDirection(null);
  }, []);
  const handleTransition = reactExports.useCallback((from, to) => {
    cancelCurrent();
    setAutomating(true);
    setDirection(from === "A" ? "A→B" : "B→A");
    cancelRef.current = beatMatchedTransition(from, to, 8, true);
    const timeout = setTimeout(() => {
      setAutomating(false);
      setDirection(null);
      cancelRef.current = null;
    }, 3e4);
    const originalCancel = cancelRef.current;
    cancelRef.current = () => {
      clearTimeout(timeout);
      originalCancel();
    };
  }, [cancelCurrent]);
  const handleQuickCut = reactExports.useCallback((to) => {
    cancelCurrent();
    const target = to === "A" ? 0 : 1;
    if (getQuantizeMode() !== "off") {
      const from = to === "A" ? "B" : "A";
      setAutomating(true);
      setDirection(to === "A" ? "B→A" : "A→B");
      cancelRef.current = onNextDownbeat(from, () => {
        setCrossfader(target);
        setAutomating(false);
        setDirection(null);
        cancelRef.current = null;
      });
    } else {
      setCrossfader(target);
    }
  }, [cancelCurrent]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-1.5 w-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => handleTransition("A", "B"),
        disabled: automating && direction !== "A→B",
        className: `
          flex items-center gap-1 px-2 h-7 rounded text-[9px] font-bold
          transition-all duration-100
          ${automating && direction === "A→B" ? "bg-accent-highlight/40 text-accent-highlight border border-accent-highlight/50 animate-pulse" : "bg-dark-bgTertiary text-text-muted border border-dark-border hover:bg-dark-bgHover hover:text-text-secondary"}
          disabled:opacity-30
        `,
        title: "Auto-transition A→B (8 bars, with filter sweep)",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowRightLeft, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
            lineNumber: 98,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "A→B" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
            lineNumber: 99,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
        lineNumber: 83,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => handleQuickCut("A"),
        className: "flex items-center gap-0.5 px-1.5 h-7 rounded text-[9px] font-bold\n          bg-dark-bgTertiary text-text-muted border border-dark-border\n          hover:bg-amber-600/20 hover:text-amber-300 transition-all duration-100",
        title: "Quick cut to A (on downbeat if quantized)",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 8 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
            lineNumber: 110,
            columnNumber: 9
          }, void 0),
          "A"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
        lineNumber: 103,
        columnNumber: 7
      },
      void 0
    ),
    automating ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: cancelCurrent,
        className: "flex items-center gap-0.5 px-1.5 h-7 rounded text-[9px] font-bold\n            bg-red-600/30 text-red-300 border border-red-500/40\n            hover:bg-red-600/50 transition-all duration-100",
        title: "Cancel automation",
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 10 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
          lineNumber: 122,
          columnNumber: 11
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
        lineNumber: 115,
        columnNumber: 9
      },
      void 0
    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-7" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
      lineNumber: 125,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => handleQuickCut("B"),
        className: "flex items-center gap-0.5 px-1.5 h-7 rounded text-[9px] font-bold\n          bg-dark-bgTertiary text-text-muted border border-dark-border\n          hover:bg-amber-600/20 hover:text-amber-300 transition-all duration-100",
        title: "Quick cut to B (on downbeat if quantized)",
        children: [
          "B",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 8 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
            lineNumber: 136,
            columnNumber: 10
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
        lineNumber: 129,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => handleTransition("B", "A"),
        disabled: automating && direction !== "B→A",
        className: `
          flex items-center gap-1 px-2 h-7 rounded text-[9px] font-bold
          transition-all duration-100
          ${automating && direction === "B→A" ? "bg-accent-highlight/40 text-accent-highlight border border-accent-highlight/50 animate-pulse" : "bg-dark-bgTertiary text-text-muted border border-dark-border hover:bg-dark-bgHover hover:text-text-secondary"}
          disabled:opacity-30
        `,
        title: "Auto-transition B→A (8 bars, with filter sweep)",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "B→A" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
            lineNumber: 155,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowRightLeft, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
            lineNumber: 156,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
        lineNumber: 140,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerTransition.tsx",
    lineNumber: 81,
    columnNumber: 5
  }, void 0);
};
const VU_SEGMENTS = 12;
function levelToSegments(dBLevel) {
  if (dBLevel <= -60) return 0;
  if (dBLevel >= 0) return VU_SEGMENTS;
  const normalized = (dBLevel + 60) / 60;
  return Math.round(normalized * VU_SEGMENTS);
}
function getSegmentColor(index, lit) {
  if (!lit) return "var(--color-bg-tertiary)";
  if (index >= 10) return "var(--color-error)";
  if (index >= 7) return "var(--color-warning)";
  return "var(--color-success)";
}
const MixerMaster = () => {
  const masterVolume = useDJStore((s) => s.masterVolume);
  const [levelL, setLevelL] = reactExports.useState(-Infinity);
  const [levelR, setLevelR] = reactExports.useState(-Infinity);
  const [limiterActive, setLimiterActive] = reactExports.useState(false);
  const rafRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  const handleVolumeChange = reactExports.useCallback((value) => {
    setMasterVolume(value);
  }, []);
  reactExports.useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      if (!mountedRef.current) return;
      try {
        const raw = getDJEngine().mixer.getMasterLevel();
        if (Array.isArray(raw) && raw.length >= 2) {
          setLevelL(raw[0]);
          setLevelR(raw[1]);
          setLimiterActive(raw[0] > -1 || raw[1] > -1);
        } else {
          const mono = typeof raw === "number" ? raw : -Infinity;
          setLevelL(mono);
          setLevelR(mono);
          setLimiterActive(mono > -1);
        }
      } catch {
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);
  const segmentsL = levelToSegments(levelL);
  const segmentsR = levelToSegments(levelR);
  const formatMaster = reactExports.useCallback((val) => {
    if (val <= 0) return "-∞";
    const dB = 20 * Math.log10(val);
    return `${dB >= -0.5 ? "0" : dB.toFixed(0)}`;
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5", title: "Master output", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: masterVolume,
        min: 0,
        max: 1.5,
        onChange: handleVolumeChange,
        label: "MST",
        size: "sm",
        color: "#ffffff",
        defaultValue: 1,
        formatValue: formatMaster,
        hideValue: true,
        title: "Master volume — controls overall output level"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
        lineNumber: 88,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-[2px]", title: "Master stereo level meter (L/R)", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[7px] font-mono leading-none mb-0.5", children: "L" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
          lineNumber: 106,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col-reverse gap-[1px]", children: Array.from({ length: 8 }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "rounded-[1px]",
            style: {
              width: 5,
              height: 4,
              backgroundColor: getSegmentColor(Math.round(i * 12 / 8), i < Math.round(segmentsL * 8 / 12)),
              transition: "background-color 0.05s"
            }
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
            lineNumber: 109,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
          lineNumber: 107,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
        lineNumber: 105,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[7px] font-mono leading-none mb-0.5", children: "R" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
          lineNumber: 125,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col-reverse gap-[1px]", children: Array.from({ length: 8 }, (_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: "rounded-[1px]",
            style: {
              width: 5,
              height: 4,
              backgroundColor: getSegmentColor(Math.round(i * 12 / 8), i < Math.round(segmentsR * 8 / 12)),
              transition: "background-color 0.05s"
            }
          },
          i,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
            lineNumber: 128,
            columnNumber: 15
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
          lineNumber: 126,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
        lineNumber: 124,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
      lineNumber: 103,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-0.5", title: "Limiter — lights red when output is clipping", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "rounded-full",
          style: {
            width: 5,
            height: 5,
            backgroundColor: limiterActive ? "var(--color-error)" : "var(--color-bg-tertiary)",
            transition: "background-color 0.1s"
          }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
          lineNumber: 145,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted text-[8px] font-mono", children: "LIM" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
        lineNumber: 154,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
      lineNumber: 144,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerMaster.tsx",
    lineNumber: 87,
    columnNumber: 5
  }, void 0);
};
const MixerCueSection = () => {
  const pflA = useDJStore((s) => s.decks.A.pflEnabled);
  const pflB = useDJStore((s) => s.decks.B.pflEnabled);
  const cueVolume = useDJStore((s) => s.cueVolume);
  const cueMix = useDJStore((s) => s.cueMix);
  const cueDeviceId = useDJStore((s) => s.cueDeviceId);
  const setCueDevice = useDJStore((s) => s.setCueDevice);
  const [devices, setDevices] = reactExports.useState([]);
  const [supportsMultiOutput, setSupportsMultiOutput] = reactExports.useState(false);
  const stateRef = reactExports.useRef({ pflA, pflB, cueVolume, cueMix });
  reactExports.useEffect(() => {
    stateRef.current = { pflA, pflB, cueVolume, cueMix };
  }, [pflA, pflB, cueVolume, cueMix]);
  reactExports.useEffect(() => {
    setSupportsMultiOutput(DJCueEngine.supportsSetSinkId());
    const loadDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (_err) {
        console.warn("[MixerCueSection] Microphone permission denied, device labels may be unavailable");
      }
      const audioOutputs = await DJCueEngine.getOutputDevices();
      setDevices(audioOutputs);
    };
    void loadDevices();
  }, []);
  const handlePFLToggle = reactExports.useCallback((deck) => {
    const current = deck === "A" ? stateRef.current.pflA : stateRef.current.pflB;
    useDJStore.getState().setDeckPFL(deck, !current);
  }, []);
  const handleCueVolumeChange = reactExports.useCallback((value) => {
    useDJStore.getState().setCueVolume(value);
  }, []);
  const handleCueMixChange = reactExports.useCallback((value) => {
    useDJStore.getState().setCueMix(value);
  }, []);
  const handleDeviceChange = reactExports.useCallback((v) => {
    const deviceId = v || null;
    setCueDevice(deviceId);
  }, [setCueDevice]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-1", title: "Headphone cue section", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Knob,
      {
        value: cueVolume,
        min: 0,
        max: 1.5,
        onChange: handleCueVolumeChange,
        label: "CUE",
        size: "sm",
        color: "#ffcc00",
        defaultValue: 1,
        hideValue: true,
        title: "Cue volume — headphone pre-fader listen level"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
        lineNumber: 80,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full px-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-between text-[7px] font-mono text-text-muted mb-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "CUE" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "MST" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
        lineNumber: 95,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: 0,
          max: 1,
          step: 0.01,
          value: cueMix,
          onChange: (e) => handleCueMixChange(parseFloat(e.target.value)),
          onDoubleClick: () => handleCueMixChange(0.5),
          className: "w-full h-2 appearance-none bg-dark-bgTertiary rounded-full cursor-pointer\n            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-4\n            [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-[#66ccff] [&::-webkit-slider-thumb]:border\n            [&::-webkit-slider-thumb]:border-[#66ccff]/50 [&::-webkit-slider-thumb]:shadow-sm\n            [&::-webkit-slider-thumb]:hover:bg-[#88ddff]",
          title: "Cue crossfader — left = PFL only, center = blend, right = master only. Double-click to center."
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
          lineNumber: 99,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
      lineNumber: 94,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 items-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Headphones, { size: 10, className: "text-text-muted flex-shrink-0" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
        lineNumber: 118,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handlePFLToggle("A"),
          title: `Headphone cue Deck A — ${pflA ? "disable" : "enable"} pre-fader listen`,
          className: `
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${pflA ? "bg-accent-warning text-text-inverse" : "bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary"}
          `,
          children: "A"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
          lineNumber: 119,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handlePFLToggle("B"),
          title: `Headphone cue Deck B — ${pflB ? "disable" : "enable"} pre-fader listen`,
          className: `
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${pflB ? "bg-accent-warning text-text-inverse" : "bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary"}
          `,
          children: "B"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
          lineNumber: 133,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
      lineNumber: 117,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center w-full gap-0.5", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "text-[7px] font-mono text-text-muted uppercase tracking-wider", children: "Phones" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
        lineNumber: 151,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: cueDeviceId || "",
          onChange: handleDeviceChange,
          options: [
            { value: "", label: "System Default" },
            ...devices.map((d) => ({
              value: d.deviceId,
              label: d.label || "Unknown Device"
            }))
          ],
          className: "w-full px-1 py-0.5 text-[8px] font-mono bg-dark-bgTertiary text-text-secondary border border-dark-borderLight rounded hover:bg-dark-bgHover transition-colors cursor-pointer",
          title: "Headphone output device — only affects cue/PFL monitoring, not main speakers"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
          lineNumber: 152,
          columnNumber: 9
        },
        void 0
      ),
      !supportsMultiOutput && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[7px] text-accent-warning opacity-70", title: "setSinkId not supported - requires Chrome/Edge or Y-splitter cable", children: "⚠ Y-splitter required" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
        lineNumber: 166,
        columnNumber: 11
      }, void 0),
      supportsMultiOutput && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[7px] text-accent-success opacity-70", title: "Multi-output supported", children: "✓ Multi-output" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
        lineNumber: 171,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
      lineNumber: 150,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerCueSection.tsx",
    lineNumber: 78,
    columnNumber: 5
  }, void 0);
};
const DJSetRecordButton = () => {
  const isRecording = useDJSetStore((s) => s.isRecording);
  const recordingDuration = useDJSetStore((s) => s.recordingDuration);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const isPlayingSet = useDJSetStore((s) => s.isPlayingSet);
  const [saving, setSaving] = reactExports.useState(false);
  const timerRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (!isRecording) return;
    timerRef.current = window.setInterval(async () => {
      try {
        const { getDJEngineIfActive: getDJEngineIfActive2 } = await __vitePreload(async () => {
          const { getDJEngineIfActive: getDJEngineIfActive3 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
          return { getDJEngineIfActive: getDJEngineIfActive3 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        const engine = getDJEngineIfActive2();
        if (engine == null ? void 0 : engine.recorder) {
          useDJSetStore.getState().setRecordingDuration(engine.recorder.elapsed() / 1e3);
        }
      } catch {
      }
    }, 250);
    return () => clearInterval(timerRef.current);
  }, [isRecording]);
  const handleToggle = async () => {
    var _a, _b, _c, _d;
    if (isRecording) {
      const name = prompt("Name your DJ set:", `DJ Set ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
      if (!name) return;
      const set = await stopRecording(name, (user == null ? void 0 : user.id) || "local", (user == null ? void 0 : user.username) || "DJ");
      if (!set) return;
      if (token) {
        setSaving(true);
        try {
          const { getDJEngine: getDJEngine2 } = await __vitePreload(async () => {
            const { getDJEngine: getDJEngine3 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
            return { getDJEngine: getDJEngine3 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const engine = getDJEngine2();
          for (const track of set.metadata.trackList) {
            if (track.source.type === "local") {
              for (const deckId of ["A", "B", "C"]) {
                try {
                  const deck = engine.getDeck(deckId);
                  const bytes = (_b = (_a = deck.audioPlayer) == null ? void 0 : _a.getOriginalFileBytes) == null ? void 0 : _b.call(_a);
                  if (bytes) {
                    const blob = new Blob([bytes], { type: "application/octet-stream" });
                    const { id: blobId } = await uploadBlob(blob, track.fileName);
                    const originalSource = { ...track.source };
                    track.source = { type: "embedded", blobId, originalSource };
                    for (const evt of set.events) {
                      if (evt.type === "load" && ((_c = evt.values) == null ? void 0 : _c.fileName) === track.fileName) {
                        evt.values.source = track.source;
                      }
                    }
                    break;
                  }
                } catch {
                }
              }
            }
          }
          try {
            const { getDJEngineIfActive: getEng } = await __vitePreload(async () => {
              const { getDJEngineIfActive: getEng2 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
              return { getDJEngineIfActive: getEng2 };
            }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
            const eng = getEng();
            if ((_d = eng == null ? void 0 : eng.mic) == null ? void 0 : _d.isRecording) {
              const micBlob = eng.mic.stopRecording();
              if (micBlob && micBlob.size > 0) {
                const { id } = await uploadBlob(micBlob, "mic-recording.webm");
                set.micAudioId = id;
              }
            }
          } catch {
          }
          await saveDJSet(set);
          useDJSetStore.getState().fetchSets();
          console.log("[DJSetRecord] Set saved:", set.metadata.name);
        } catch (err) {
          console.error("[DJSetRecord] Save failed:", err);
          alert("Failed to save DJ set to server. Set recorded locally.");
        } finally {
          setSaving(false);
        }
      }
    } else {
      if (!token) {
        const proceed = window.confirm(
          "You are not signed in!\n\nYour DJ set will be recorded, but it CANNOT be saved to the server without an account. If you close the browser or navigate away, your recording will be lost.\n\nSign in first to save your sets safely.\n\nRecord anyway?"
        );
        if (!proceed) return;
      }
      await startRecording();
    }
  };
  const formatDuration2 = (ms) => {
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const pad = (n) => n.toString().padStart(2, "0");
    return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: handleToggle,
      disabled: saving || isPlayingSet,
      className: `
        flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all
        ${isRecording ? "bg-red-600 hover:bg-red-700 text-white animate-pulse" : "bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-secondary hover:text-text-primary"}
        ${saving ? "opacity-50 cursor-wait" : isPlayingSet ? "opacity-40 cursor-not-allowed" : ""}
      `,
      title: isRecording ? "Stop recording" : "Record DJ set",
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `w-2.5 h-2.5 rounded-full ${isRecording ? "bg-white" : "bg-red-500"}` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSetRecordButton.tsx",
          lineNumber: 144,
          columnNumber: 7
        }, void 0),
        saving ? "Saving..." : isRecording ? formatDuration2(recordingDuration) : "REC"
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSetRecordButton.tsx",
      lineNumber: 131,
      columnNumber: 5
    },
    void 0
  );
};
const DJMicControl = () => {
  const micEnabled = useDJSetStore((s) => s.micEnabled);
  const micGain = useDJSetStore((s) => s.micGain);
  const isRecording = useDJSetStore((s) => s.isRecording);
  const [error, setError] = reactExports.useState(null);
  const handleToggle = reactExports.useCallback(async () => {
    try {
      setError(null);
      const { getDJEngineIfActive: getDJEngineIfActive2 } = await __vitePreload(async () => {
        const { getDJEngineIfActive: getDJEngineIfActive3 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
        return { getDJEngineIfActive: getDJEngineIfActive3 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const engine = getDJEngineIfActive2();
      if (!engine) return;
      const active = await engine.toggleMic();
      useDJSetStore.getState().setMicEnabled(active);
      if (active && isRecording && engine.mic) {
        engine.mic.startRecording();
        useDJSetStore.getState().setMicRecording(true);
      } else if (!active && engine.mic) {
        engine.mic.stopRecording();
        useDJSetStore.getState().setMicRecording(false);
      }
    } catch (err) {
      setError("Mic unavailable");
      console.error("[DJMicControl] Toggle failed:", err);
    }
  }, [isRecording]);
  const handleGainChange = reactExports.useCallback(async (e) => {
    var _a;
    const gain = parseFloat(e.target.value);
    useDJSetStore.getState().setMicGain(gain);
    try {
      const { getDJEngineIfActive: getDJEngineIfActive2 } = await __vitePreload(async () => {
        const { getDJEngineIfActive: getDJEngineIfActive3 } = await import("./main-BbV5VyEH.js").then((n) => n.jf);
        return { getDJEngineIfActive: getDJEngineIfActive3 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const engine = getDJEngineIfActive2();
      (_a = engine == null ? void 0 : engine.mic) == null ? void 0 : _a.setGain(gain);
    } catch {
    }
  }, []);
  if (!DJMicEngine.isSupported()) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleToggle,
        className: `
          px-2 py-1 rounded text-xs font-bold transition-all
          ${micEnabled ? "bg-green-600 hover:bg-green-700 text-white" : "bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted"}
        `,
        title: micEnabled ? "Mute microphone" : "Enable microphone",
        children: "MIC"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMicControl.tsx",
        lineNumber: 53,
        columnNumber: 7
      },
      void 0
    ),
    micEnabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "input",
      {
        type: "range",
        min: "0",
        max: "1.5",
        step: "0.01",
        value: micGain,
        onChange: handleGainChange,
        className: "w-16 h-1 accent-green-500",
        title: `Mic gain: ${Math.round(micGain * 100)}%`
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMicControl.tsx",
        lineNumber: 68,
        columnNumber: 9
      },
      void 0
    ),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-red-400", children: error }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMicControl.tsx",
      lineNumber: 80,
      columnNumber: 17
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMicControl.tsx",
    lineNumber: 52,
    columnNumber: 5
  }, void 0);
};
const captureRef = { current: null };
const recorderRef = { current: null };
const DJVideoExport = () => {
  const [isRecording, setIsRecording] = reactExports.useState(false);
  const [source, setSource] = reactExports.useState("vj");
  const [duration, setDuration] = reactExports.useState(0);
  const [fileSize, setFileSize] = reactExports.useState(0);
  const [showMenu, setShowMenu] = reactExports.useState(false);
  const timerRef = reactExports.useRef(0);
  const sources = [
    { id: "vj", label: "VJ Visualizer" },
    { id: "dj-ui", label: "DJ Interface" }
  ];
  reactExports.useEffect(() => {
    if (!isRecording) return;
    timerRef.current = window.setInterval(() => {
      if (recorderRef.current) {
        setDuration(recorderRef.current.durationMs);
        setFileSize(recorderRef.current.totalBytes);
      }
    }, 250);
    return () => clearInterval(timerRef.current);
  }, [isRecording]);
  const handleStart = reactExports.useCallback(async () => {
    try {
      if (!getCaptureCanvas(source)) {
        alert(`The ${source === "vj" ? "VJ View" : "DJ UI"} must be active to capture video. Switch to that view first.`);
        return;
      }
      const capture = new DJVideoCapture();
      const stream = capture.startCapture(source, source === "vj" ? 60 : 30);
      const recorder = new DJVideoRecorder();
      recorder.onDataAvailable = (bytes, ms) => {
        setFileSize(bytes);
        setDuration(ms);
      };
      recorder.startRecording(stream);
      captureRef.current = capture;
      recorderRef.current = recorder;
      setIsRecording(true);
      setShowMenu(false);
    } catch (err) {
      console.error("[DJVideoExport] Start failed:", err);
      alert(`Failed to start video capture: ${err.message}`);
    }
  }, [source]);
  const handleStop = reactExports.useCallback(async () => {
    if (!recorderRef.current || !captureRef.current) return;
    const blob = await recorderRef.current.stopRecording();
    captureRef.current.stopCapture();
    captureRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
    setDuration(0);
    setFileSize(0);
    if (blob.size > 0) {
      const filename = `dj-set-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[T:]/g, "-")}.webm`;
      DJVideoRecorder.download(blob, filename);
    }
  }, []);
  const formatDuration2 = (ms) => {
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    const pad = (n) => n.toString().padStart(2, "0");
    return `${pad(m)}:${pad(s % 60)}`;
  };
  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
    isRecording ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleStop,
        className: "flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white animate-pulse transition-all",
        title: "Stop video recording",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-2 h-2 rounded-sm bg-white" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
            lineNumber: 107,
            columnNumber: 11
          }, void 0),
          formatDuration2(duration),
          " (",
          formatSize(fileSize),
          ")"
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
        lineNumber: 102,
        columnNumber: 9
      },
      void 0
    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setShowMenu(!showMenu),
        className: "px-3 py-1.5 rounded text-xs font-bold bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-secondary hover:text-text-primary transition-all",
        title: "Record video of DJ set",
        children: "VIDEO"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
        lineNumber: 111,
        columnNumber: 9
      },
      void 0
    ),
    showMenu && !isRecording && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-full mb-1 left-0 bg-dark-bgSecondary border border-dark-border rounded shadow-xl z-[99990] min-w-[160px]", children: sources.map((s) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => {
          setSource(s.id);
          handleStart();
        },
        className: `
                block w-full text-left px-3 py-2 text-xs hover:bg-dark-bgHover transition-colors
                ${source === s.id ? "text-accent-primary" : "text-text-secondary"}
                ${!getCaptureCanvas(s.id) ? "opacity-40 cursor-not-allowed" : ""}
              `,
        disabled: !getCaptureCanvas(s.id),
        children: [
          s.label,
          !getCaptureCanvas(s.id) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-1 text-text-muted", children: "(inactive)" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
            lineNumber: 135,
            columnNumber: 43
          }, void 0)
        ]
      },
      s.id,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
        lineNumber: 124,
        columnNumber: 13
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
      lineNumber: 122,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVideoExport.tsx",
    lineNumber: 100,
    columnNumber: 5
  }, void 0);
};
const WS_URL = "wss://devilbox.uprough.net";
class DJLiveStream {
  _ws = null;
  _recorder = null;
  _active = false;
  _startTime = 0;
  /** Callbacks */
  onStatusChange;
  onError;
  /** Start live streaming a MediaStream to a platform (youtube, twitch, or custom RTMP) */
  async startStream(stream, streamKey, platform = "youtube") {
    var _a, _b;
    if (this._active) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm;codecs=vp8,opus";
    (_a = this.onStatusChange) == null ? void 0 : _a.call(this, "connecting");
    this._ws = new WebSocket(`${WS_URL}/api/stream/ingest?key=${encodeURIComponent(streamKey)}&platform=${platform}`);
    this._ws.binaryType = "arraybuffer";
    await new Promise((resolve, reject) => {
      if (!this._ws) {
        reject(new Error("No WebSocket"));
        return;
      }
      this._ws.onopen = () => resolve();
      this._ws.onerror = () => reject(new Error("WebSocket connection failed"));
      this._ws.onclose = (e) => {
        var _a2, _b2;
        if (this._active) {
          (_a2 = this.onStatusChange) == null ? void 0 : _a2.call(this, "error");
          (_b2 = this.onError) == null ? void 0 : _b2.call(this, `Stream disconnected: ${e.reason || "unknown"}`);
          this._active = false;
        }
      };
      setTimeout(() => reject(new Error("Connection timeout")), 1e4);
    });
    this._recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4e6,
      audioBitsPerSecond: 128e3
    });
    this._recorder.ondataavailable = (e) => {
      var _a2;
      if (e.data.size > 0 && ((_a2 = this._ws) == null ? void 0 : _a2.readyState) === WebSocket.OPEN) {
        e.data.arrayBuffer().then((buf) => {
          var _a3;
          (_a3 = this._ws) == null ? void 0 : _a3.send(buf);
        });
      }
    };
    this._recorder.start(1e3);
    this._active = true;
    this._startTime = performance.now();
    (_b = this.onStatusChange) == null ? void 0 : _b.call(this, "live");
    console.log("[DJLiveStream] Started streaming to YouTube");
  }
  /** Stop the live stream */
  stopStream() {
    var _a, _b, _c;
    if (!this._active) return;
    this._active = false;
    try {
      (_a = this._recorder) == null ? void 0 : _a.stop();
    } catch {
    }
    this._recorder = null;
    try {
      (_b = this._ws) == null ? void 0 : _b.close(1e3, "stream ended");
    } catch {
    }
    this._ws = null;
    (_c = this.onStatusChange) == null ? void 0 : _c.call(this, "stopped");
    console.log("[DJLiveStream] Stopped");
  }
  get isActive() {
    return this._active;
  }
  get durationMs() {
    return this._active ? performance.now() - this._startTime : 0;
  }
}
const PLATFORM_INFO = {
  youtube: {
    label: "YouTube",
    color: "bg-red-600 hover:bg-red-700",
    placeholder: "xxxx-xxxx-xxxx-xxxx",
    help: "YouTube Studio → Go Live → Stream → Stream key"
  },
  twitch: {
    label: "Twitch",
    color: "bg-purple-600 hover:bg-purple-700",
    placeholder: "live_xxxxxxxxxxxxxxxxx",
    help: "Twitch Dashboard → Settings → Stream → Primary Stream key"
  },
  custom: {
    label: "Custom RTMP",
    color: "bg-gray-600 hover:bg-gray-700",
    placeholder: "rtmp://server/app/key",
    help: "Full RTMP URL including stream key"
  }
};
const DJStreamControl = () => {
  const [isLive, setIsLive] = reactExports.useState(false);
  const [platform, setPlatform] = reactExports.useState("youtube");
  const [streamKey, setStreamKey] = reactExports.useState("");
  const [showSetup, setShowSetup] = reactExports.useState(false);
  const [status, setStatus] = reactExports.useState("");
  const [duration, setDuration] = reactExports.useState(0);
  const captureRef2 = reactExports.useRef(null);
  const streamRef = reactExports.useRef(null);
  const timerRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (!isLive) return;
    timerRef.current = window.setInterval(() => {
      if (streamRef.current) setDuration(streamRef.current.durationMs);
    }, 1e3);
    return () => clearInterval(timerRef.current);
  }, [isLive]);
  const info = PLATFORM_INFO[platform];
  const handleGoLive = reactExports.useCallback(async () => {
    if (!streamKey.trim()) {
      alert(`Enter your ${info.label} stream key first`);
      return;
    }
    try {
      const source = getCaptureCanvas("vj") ? "vj" : "dj-ui";
      if (!getCaptureCanvas(source)) {
        alert("No capture canvas available. Switch to VJ View or enable the DJ UI.");
        return;
      }
      setStatus("Connecting...");
      const capture = new DJVideoCapture();
      const mediaStream = capture.startCapture(source, source === "vj" ? 60 : 30);
      const liveStream = new DJLiveStream();
      liveStream.onStatusChange = (s) => {
        setStatus(s === "live" ? `LIVE on ${info.label}` : s === "connecting" ? "Connecting..." : s);
        if (s === "error" || s === "stopped") {
          setIsLive(false);
          capture.stopCapture();
        }
      };
      liveStream.onError = (err) => setStatus(`Error: ${err}`);
      await liveStream.startStream(mediaStream, streamKey.trim(), platform);
      captureRef2.current = capture;
      streamRef.current = liveStream;
      setIsLive(true);
      setShowSetup(false);
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
      setIsLive(false);
    }
  }, [streamKey, platform, info.label]);
  const handleStop = reactExports.useCallback(() => {
    var _a, _b;
    (_a = streamRef.current) == null ? void 0 : _a.stopStream();
    (_b = captureRef2.current) == null ? void 0 : _b.stopCapture();
    streamRef.current = null;
    captureRef2.current = null;
    setIsLive(false);
    setDuration(0);
    setStatus("");
  }, []);
  const formatDuration2 = (ms) => {
    const s = Math.floor(ms / 1e3);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const pad = (n) => n.toString().padStart(2, "0");
    return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
    isLive ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleStop,
        className: `flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold text-white animate-pulse ${info.color}`,
        title: "End live stream",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "w-2 h-2 rounded-full bg-white" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
            lineNumber: 121,
            columnNumber: 11
          }, void 0),
          "LIVE ",
          formatDuration2(duration)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
        lineNumber: 116,
        columnNumber: 9
      },
      void 0
    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setShowSetup(!showSetup),
        className: "px-3 py-1.5 rounded text-xs font-bold bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-secondary hover:text-text-primary transition-all",
        title: "Go live on YouTube, Twitch, or custom RTMP",
        children: "LIVE"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
        lineNumber: 125,
        columnNumber: 9
      },
      void 0
    ),
    showSetup && !isLive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-full mb-1 left-0 bg-dark-bgSecondary border border-dark-border rounded shadow-xl z-[99990] p-3 min-w-[280px]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 mb-3", children: Object.keys(PLATFORM_INFO).map((p) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setPlatform(p),
          className: `
                  flex-1 px-2 py-1 rounded text-[10px] font-bold transition-colors
                  ${platform === p ? `${PLATFORM_INFO[p].color} text-white` : "bg-dark-bg text-text-muted hover:text-text-primary"}
                `,
          children: PLATFORM_INFO[p].label
        },
        p,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
          lineNumber: 140,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
        lineNumber: 138,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted mb-2", children: info.help }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
        lineNumber: 156,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: platform === "custom" ? "text" : "password",
          value: streamKey,
          onChange: (e) => setStreamKey(e.target.value),
          placeholder: info.placeholder,
          className: "w-full px-2 py-1 bg-dark-bg border border-dark-border rounded text-xs text-text-primary mb-2"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
          lineNumber: 158,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handleGoLive,
          disabled: !streamKey.trim(),
          className: `w-full px-3 py-1.5 disabled:opacity-40 text-white rounded text-xs font-bold transition-colors ${info.color}`,
          children: [
            "Go Live on ",
            info.label
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
          lineNumber: 166,
          columnNumber: 11
        },
        void 0
      ),
      status && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted mt-1", children: status }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
        lineNumber: 174,
        columnNumber: 22
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
      lineNumber: 136,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJStreamControl.tsx",
    lineNumber: 114,
    columnNumber: 5
  }, void 0);
};
const DJMixer = () => {
  const thirdDeck = useDJStore((s) => s.thirdDeckActive);
  const [showBroadcast, setShowBroadcast] = reactExports.useState(false);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "\n        flex flex-col items-center gap-2 p-2\n        bg-dark-bg border border-dark-border rounded-lg h-full\n      ",
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-stretch justify-center gap-1.5 w-full border-b border-dark-border pb-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerFilterKnob, { deckId: "A" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 41,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "A", band: "high", label: "HI", color: "#00d4ff", side: "left" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 42,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "A", band: "mid", label: "MID", color: "#cccccc", side: "left" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 43,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "A", band: "low", label: "LO", color: "#ff8800", side: "left" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 44,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 40,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerChannelStrip, { deckId: "A", stretch: true }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 48,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 items-stretch", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerVUMeter, { deckId: "A", stretch: true }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 52,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerVUMeter, { deckId: "B", stretch: true }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 53,
              columnNumber: 11
            }, void 0),
            thirdDeck && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerVUMeter, { deckId: "C", stretch: true }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 54,
              columnNumber: 25
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 51,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerChannelStrip, { deckId: "B", stretch: true }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 58,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerFilterKnob, { deckId: "B" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 62,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "B", band: "high", label: "HI", color: "#00d4ff", side: "right" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 63,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "B", band: "mid", label: "MID", color: "#cccccc", side: "right" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 64,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "B", band: "low", label: "LO", color: "#ff8800", side: "right" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 65,
              columnNumber: 11
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 61,
            columnNumber: 9
          }, void 0),
          thirdDeck && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerChannelStrip, { deckId: "C", stretch: true }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 70,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-0.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerFilterKnob, { deckId: "C" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
                lineNumber: 72,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "C", band: "high", label: "HI", color: "#00d4ff", side: "right" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
                lineNumber: 73,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "C", band: "mid", label: "MID", color: "#cccccc", side: "right" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
                lineNumber: 74,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerEQBandKnob, { deckId: "C", band: "low", label: "LO", color: "#ff8800", side: "right" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
                lineNumber: 75,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 71,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 69,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 38,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full border-b border-dark-border pb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerCrossfader, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 83,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 82,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full border-b border-dark-border pb-2", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerTransition, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 88,
          columnNumber: 9
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 87,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 w-full", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerMaster, {}, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 93,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-px bg-dark-borderLight self-stretch" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 94,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerCueSection, {}, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 95,
            columnNumber: 9
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 92,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-2 w-full pt-2 border-t border-dark-border flex-wrap", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowBroadcast((v) => !v),
              className: `px-2 py-0.5 text-xs font-mono rounded border transition-colors ${showBroadcast ? "bg-red-900/40 border-red-700/60 text-red-300" : "bg-dark-surface border-dark-border text-dark-textSecondary hover:text-dark-text"}`,
              children: "BROADCAST"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 100,
              columnNumber: 9
            },
            void 0
          ),
          showBroadcast && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJSetRecordButton, {}, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 112,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJVideoExport, {}, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 113,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJStreamControl, {}, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 114,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJMicControl, {}, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
              lineNumber: 115,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
            lineNumber: 111,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
          lineNumber: 99,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJMixer.tsx",
      lineNumber: 31,
      columnNumber: 5
    },
    void 0
  );
};
const DJFileBrowser = ({ onClose }) => {
  const [files, setFiles] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [sortBy, setSortBy] = reactExports.useState("name");
  const fileInputRef = reactExports.useRef(null);
  const handleFileSelect = reactExports.useCallback(async (e) => {
    var _a;
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    setLoading(true);
    setError(null);
    const newFiles = [];
    for (const file of Array.from(selectedFiles)) {
      try {
        const buffer = await file.arrayBuffer();
        const fileExt = ((_a = file.name.split(".").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
        const isAudio = isAudioFile(file.name);
        if (isAudio) {
          newFiles.push({
            name: file.name,
            bpm: 0,
            // Will be analyzed on load
            duration: 0,
            format: fileExt.toUpperCase(),
            rawBuffer: buffer
          });
        } else {
          const isUADE = isUADEFormat(file.name);
          const song = await parseModuleToSong(file);
          const bpmResult = detectBPM(song);
          const duration = estimateSongDuration(song);
          cacheSong(file.name, song);
          const cached = await isUADECached(buffer);
          newFiles.push({
            name: file.name,
            song,
            bpm: bpmResult.bpm,
            duration,
            format: fileExt.toUpperCase(),
            rawBuffer: buffer,
            isUADE,
            isCached: cached
          });
        }
      } catch (err) {
        console.error(`[DJFileBrowser] Failed to parse ${file.name}:`, err);
        setError(`Failed to load ${file.name}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);
  const pickFreeDeck = reactExports.useCallback(() => {
    const decks = useDJStore.getState().decks;
    if (!decks.A.isPlaying) return "A";
    if (!decks.B.isPlaying) return "B";
    return "A";
  }, []);
  const loadToDeck = reactExports.useCallback(async (file, deckId) => {
    var _a;
    const engine = getDJEngine();
    try {
      if (file.rawBuffer) {
        if (!file.song) {
          await engine.loadAudioToDeck(deckId, file.rawBuffer, file.name);
          useDJStore.getState().setDeckViewMode("vinyl");
          console.log(`[DJFileBrowser] Loaded ${file.name} as audio file`);
          return;
        }
        if (file.isUADE) {
          const result = await loadUADEToDeck(
            engine,
            deckId,
            file.rawBuffer,
            file.name,
            true,
            file.bpm,
            file.song.name
          );
          useDJStore.getState().setDeckViewMode("visualizer");
          setFiles((prev) => prev.map(
            (f) => f.name === file.name ? { ...f, isCached: result.cached } : f
          ));
        } else {
          useDJStore.getState().setDeckState(deckId, {
            fileName: file.name,
            trackName: file.song.name || file.name,
            detectedBPM: file.bpm,
            effectiveBPM: file.bpm,
            analysisState: "rendering",
            isPlaying: false
          });
          const result = await getDJPipeline().loadOrEnqueue(file.rawBuffer, file.name, deckId, "high");
          await engine.loadAudioToDeck(deckId, result.wavData, file.name, file.song.name || file.name, ((_a = result.analysis) == null ? void 0 : _a.bpm) || file.bpm, file.song);
          useDJStore.getState().setDeckViewMode("visualizer");
          console.log(`[DJFileBrowser] Loaded ${file.name} in audio mode (skipped tracker bugs)`);
        }
      } else {
        console.warn(`[DJFileBrowser] No raw buffer for ${file.name}, cannot render for DJ mode`);
      }
    } catch (err) {
      console.error(`[DJFileBrowser] Failed to load ${file.name} to deck ${deckId}:`, err);
      setError(`Failed to load to deck: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }, []);
  const removeFile = reactExports.useCallback((index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);
  const sortedFiles = [...files].sort((a, b) => {
    switch (sortBy) {
      case "bpm":
        return a.bpm - b.bpm;
      case "format":
        return a.format.localeCompare(b.format);
      default:
        return a.name.localeCompare(b.name);
    }
  });
  const formatDuration2 = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-primary text-sm font-mono font-bold tracking-wider uppercase", children: "File Browser" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
        lineNumber: 184,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = fileInputRef.current) == null ? void 0 : _a.click();
            },
            disabled: loading,
            className: "flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary border border-dark-borderLight\n                       rounded text-text-secondary text-xs font-mono hover:bg-dark-bgHover hover:text-text-primary\n                       transition-colors disabled:opacity-50",
            children: [
              loading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 12, className: "animate-spin" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 195,
                columnNumber: 24
              }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Upload, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 195,
                columnNumber: 73
              }, void 0),
              loading ? "Loading..." : "Add Files"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
            lineNumber: 188,
            columnNumber: 11
          },
          void 0
        ),
        onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary p-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
          lineNumber: 200,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
          lineNumber: 199,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
        lineNumber: 187,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          ref: fileInputRef,
          type: "file",
          multiple: true,
          accept: "*/*",
          onChange: handleFileSelect,
          className: "hidden"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
          lineNumber: 204,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
      lineNumber: 183,
      columnNumber: 7
    }, void 0),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30", children: error }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
      lineNumber: 216,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 text-[10px] font-mono", children: ["name", "bpm", "format"].map((key) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setSortBy(key),
        className: `px-2 py-0.5 rounded transition-colors ${sortBy === key ? "bg-dark-bgActive text-text-primary" : "text-text-muted hover:text-text-secondary"}`,
        children: key.toUpperCase()
      },
      key,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
        lineNumber: 224,
        columnNumber: 11
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
      lineNumber: 222,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto min-h-0", children: sortedFiles.length === 0 && !loading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center py-8 text-text-muted", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 24, className: "mb-2 opacity-40" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
        lineNumber: 242,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono", children: "Drop modules here or click Add Files" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
        lineNumber: 243,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
      lineNumber: 241,
      columnNumber: 11
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: sortedFiles.map((file, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        onDoubleClick: () => loadToDeck(file, pickFreeDeck()),
        className: "flex items-center gap-2 px-2 py-1.5 bg-dark-bg rounded border border-dark-borderLight\n                           hover:border-dark-border transition-colors group cursor-pointer",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary text-xs font-mono truncate", children: file.name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 257,
                columnNumber: 21
              }, void 0),
              file.isCached && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[8px] font-mono px-1 py-0.5 bg-green-900/30 text-green-400 rounded border border-green-700/30", children: "CACHED" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 259,
                columnNumber: 23
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 256,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 text-[10px] text-text-muted font-mono", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: file.format }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 265,
                columnNumber: 21
              }, void 0),
              file.bpm > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: [
                file.bpm,
                " BPM"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 266,
                columnNumber: 38
              }, void 0),
              file.duration > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: formatDuration2(file.duration) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 267,
                columnNumber: 43
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 264,
              columnNumber: 19
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
            lineNumber: 255,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                var _a;
                const playlistId = useDJPlaylistStore.getState().activePlaylistId;
                if (!playlistId) return;
                useDJPlaylistStore.getState().addTrack(playlistId, {
                  fileName: file.name,
                  trackName: ((_a = file.song) == null ? void 0 : _a.name) || file.name,
                  format: file.format,
                  bpm: file.bpm,
                  duration: file.duration,
                  addedAt: Date.now()
                });
              },
              className: "p-1 text-text-muted hover:text-amber-400 transition-colors\n                             opacity-0 group-hover:opacity-100",
              title: "Add to active playlist",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ListPlus, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 289,
                columnNumber: 19
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 272,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => loadToDeck(file, "A"),
              className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                             bg-blue-900/30 text-blue-400 border border-blue-800/50\n                             hover:bg-blue-800/40 hover:text-blue-300 transition-colors\n                             opacity-0 group-hover:opacity-100",
              children: "1"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 293,
              columnNumber: 17
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => loadToDeck(file, "B"),
              className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                             bg-red-900/30 text-red-400 border border-red-800/50\n                             hover:bg-red-800/40 hover:text-red-300 transition-colors\n                             opacity-0 group-hover:opacity-100",
              children: "2"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 302,
              columnNumber: 17
            },
            void 0
          ),
          useDJStore.getState().thirdDeckActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => loadToDeck(file, "C"),
              className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                               bg-emerald-900/30 text-emerald-400 border border-emerald-800/50\n                               hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors\n                               opacity-0 group-hover:opacity-100",
              children: "3"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 312,
              columnNumber: 19
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => removeFile(i),
              className: "p-0.5 text-text-muted hover:text-accent-error transition-colors\n                             opacity-0 group-hover:opacity-100",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 10 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
                lineNumber: 327,
                columnNumber: 19
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
              lineNumber: 322,
              columnNumber: 17
            },
            void 0
          )
        ]
      },
      `${file.name}-${i}`,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
        lineNumber: 248,
        columnNumber: 15
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
      lineNumber: 246,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
      lineNumber: 239,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFileBrowser.tsx",
    lineNumber: 181,
    columnNumber: 5
  }, void 0);
};
async function precachePlaylist(playlistId, onProgress) {
  const store = useDJPlaylistStore.getState();
  const playlist = store.playlists.find((p) => p.id === playlistId);
  if (!playlist) return { cached: 0, failed: 0, skipped: 0, total: 0 };
  const modlandTracks = playlist.tracks.map((track, index) => ({ track, index })).filter(({ track }) => track.fileName.startsWith("modland:"));
  if (modlandTracks.length === 0) return { cached: 0, failed: 0, skipped: 0, total: 0 };
  const total = modlandTracks.length;
  let cached = 0;
  let failed = 0;
  let skipped = 0;
  onProgress == null ? void 0 : onProgress({ current: 0, total, cached: 0, failed: 0, skipped: 0, trackName: "Checking cache...", status: "checking" });
  const cachedNames = await getCachedFilenames();
  console.log(`[Precache] Starting: ${total} tracks, ${cachedNames.size} already cached`);
  for (const { track } of modlandTracks) {
    const modlandPath = track.fileName.slice("modland:".length);
    const filename = modlandPath.split("/").pop() || "unknown";
    const processed = cached + failed + skipped;
    if (cachedNames.has(filename)) {
      skipped++;
      onProgress == null ? void 0 : onProgress({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: "skipped" });
      continue;
    }
    if (processed > 0) {
      await new Promise((r) => setTimeout(r, 4e3));
    }
    onProgress == null ? void 0 : onProgress({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: "downloading" });
    try {
      const { downloadModlandFile: downloadModlandFile2 } = await __vitePreload(async () => {
        const { downloadModlandFile: downloadModlandFile3 } = await import("./main-BbV5VyEH.js").then((n) => n.jp);
        return { downloadModlandFile: downloadModlandFile3 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      let buffer;
      let retries = 0;
      while (true) {
        try {
          buffer = await downloadModlandFile2(modlandPath);
          break;
        } catch (dlErr) {
          const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
          if (msg.includes("Rate limited") || msg.includes("429")) {
            retries++;
            if (retries > 8) throw dlErr;
            const wait = Math.min(6e4, 5e3 * Math.pow(2, retries - 1));
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          throw dlErr;
        }
      }
      await cacheSourceFile(buffer, filename);
      onProgress == null ? void 0 : onProgress({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: "rendering" });
      if (!isAudioFile(filename)) {
        await getDJPipeline().loadOrEnqueue(buffer, filename, void 0, "low");
      }
      cached++;
      cachedNames.add(filename);
      onProgress == null ? void 0 : onProgress({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: track.trackName, status: "cached" });
      console.log(`[Precache] ${cached + failed + skipped}/${total} — ${track.trackName} cached`);
    } catch (err) {
      failed++;
      console.warn(`[Precache] ${cached + failed + skipped}/${total} FAIL — ${track.trackName}:`, err);
      onProgress == null ? void 0 : onProgress({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: track.trackName, status: "error" });
    }
  }
  console.log(`[Precache] Complete — ${cached} cached, ${skipped} already cached, ${failed} failed out of ${total}`);
  return { cached, failed, skipped, total };
}
function formatDuration$1(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
const DJPlaylistPanel = ({ onClose }) => {
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const createPlaylist = useDJPlaylistStore((s) => s.createPlaylist);
  const deletePlaylist = useDJPlaylistStore((s) => s.deletePlaylist);
  const renamePlaylist = useDJPlaylistStore((s) => s.renamePlaylist);
  const setActivePlaylist = useDJPlaylistStore((s) => s.setActivePlaylist);
  const addTrack = useDJPlaylistStore((s) => s.addTrack);
  const removeTrack = useDJPlaylistStore((s) => s.removeTrack);
  const reorderTrack = useDJPlaylistStore((s) => s.reorderTrack);
  const sortTracksAction = useDJPlaylistStore((s) => s.sortTracks);
  const autoDJEnabled = useDJStore((s) => s.autoDJEnabled);
  const autoDJCurrentIdx = useDJStore((s) => s.autoDJCurrentTrackIndex);
  const autoDJNextIdx = useDJStore((s) => s.autoDJNextTrackIndex);
  const [isCreating, setIsCreating] = reactExports.useState(false);
  const [newName, setNewName] = reactExports.useState("");
  const [editingId, setEditingId] = reactExports.useState(null);
  const [editName, setEditName] = reactExports.useState("");
  const [dragIndex, setDragIndex] = reactExports.useState(null);
  const [loadingTrackIndex, setLoadingTrackIndex] = reactExports.useState(null);
  const [loadingDeckId, setLoadingDeckId] = reactExports.useState(null);
  const [isLoadingFile, setIsLoadingFile] = reactExports.useState(false);
  const [showSortMenu, setShowSortMenu] = reactExports.useState(false);
  const fileInputRef = reactExports.useRef(null);
  const panelRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!onClose) return;
    const handlePointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const [precacheProgress, setPrecacheProgress] = reactExports.useState(null);
  const precachingRef = reactExports.useRef(false);
  const [cachedCount, setCachedCount] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (!activePlaylist) {
      setCachedCount(0);
      return;
    }
    getCachedFilenames().then((names) => {
      let count = 0;
      for (const t of activePlaylist.tracks) {
        if (!t.fileName.startsWith("modland:")) continue;
        const fn = t.fileName.slice("modland:".length).split("/").pop() || "";
        if (names.has(fn)) count++;
      }
      setCachedCount(count);
    });
  }, [activePlaylist, precacheProgress]);
  const modlandCount = activePlaylist ? activePlaylist.tracks.filter((t) => t.fileName.startsWith("modland:")).length : 0;
  const uncachedCount = modlandCount - cachedCount;
  const handlePrecache = reactExports.useCallback(async () => {
    if (!activePlaylistId || precachingRef.current) return;
    precachingRef.current = true;
    setPrecacheProgress({ current: 0, total: 1, cached: 0, failed: 0, skipped: 0, trackName: "Starting...", status: "checking" });
    try {
      await precachePlaylist(activePlaylistId, (p) => setPrecacheProgress({ ...p }));
    } finally {
      precachingRef.current = false;
      setPrecacheProgress(null);
    }
  }, [activePlaylistId]);
  const handleCreate = reactExports.useCallback(() => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName("");
    setIsCreating(false);
  }, [newName, createPlaylist]);
  const handleRename = reactExports.useCallback(
    (id) => {
      if (!editName.trim()) return;
      renamePlaylist(id, editName.trim());
      setEditingId(null);
    },
    [editName, renamePlaylist]
  );
  const handleAddFiles = reactExports.useCallback(
    async (e) => {
      var _a;
      if (!activePlaylistId || !e.target.files) return;
      setIsLoadingFile(true);
      for (const file of Array.from(e.target.files)) {
        try {
          const isAudio = isAudioFile(file.name);
          const fileExt = ((_a = file.name.split(".").pop()) == null ? void 0 : _a.toUpperCase()) ?? "MOD";
          if (isAudio) {
            const track = {
              fileName: file.name,
              trackName: file.name.replace(/\.[^.]+$/, ""),
              format: fileExt,
              bpm: 0,
              duration: 0,
              addedAt: Date.now()
            };
            addTrack(activePlaylistId, track);
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);
            const track = {
              fileName: file.name,
              trackName: song.name || file.name,
              format: fileExt,
              bpm: bpmResult.bpm,
              duration,
              addedAt: Date.now()
            };
            addTrack(activePlaylistId, track);
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Failed to process ${file.name}:`, err);
        }
      }
      setIsLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [activePlaylistId, addTrack]
  );
  const pickFreeDeck = reactExports.useCallback(() => {
    const decks = useDJStore.getState().decks;
    if (!decks.A.isPlaying) return "A";
    if (!decks.B.isPlaying) return "B";
    return "A";
  }, []);
  const loadSongToDeck = reactExports.useCallback(
    async (song, fileName, deckId, rawBuffer) => {
      var _a;
      const engine = getDJEngine();
      const bpmResult = detectBPM(song);
      if (rawBuffer) {
        useDJStore.getState().setDeckState(deckId, {
          fileName,
          trackName: song.name || fileName,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: "rendering",
          isPlaying: false
        });
        try {
          const result = await getDJPipeline().loadOrEnqueue(rawBuffer, fileName, deckId, "high");
          await engine.loadAudioToDeck(deckId, result.wavData, fileName, song.name || fileName, ((_a = result.analysis) == null ? void 0 : _a.bpm) || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode("visualizer");
        } catch (err) {
          console.error(`[DJPlaylistPanel] Pipeline failed for ${fileName}:`, err);
        }
      } else {
        console.warn(`[DJPlaylistPanel] Cannot load ${fileName}: missing raw buffer for rendering`);
      }
    },
    []
  );
  const loadTrackToDeck = reactExports.useCallback(
    async (track, deckId) => {
      const engine = getDJEngine();
      if (track.fileName.startsWith("modland:")) {
        const modlandPath = track.fileName.slice("modland:".length);
        try {
          const { downloadModlandFile: downloadModlandFile2 } = await __vitePreload(async () => {
            const { downloadModlandFile: downloadModlandFile3 } = await import("./main-BbV5VyEH.js").then((n) => n.jp);
            return { downloadModlandFile: downloadModlandFile3 };
          }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
          const buffer = await downloadModlandFile2(modlandPath);
          const filename = modlandPath.split("/").pop() || "download.mod";
          if (isAudioFile(filename)) {
            await engine.loadAudioToDeck(deckId, buffer, track.fileName);
            useDJStore.getState().setDeckViewMode("vinyl");
          } else if (isUADEFormat(filename)) {
            await loadUADEToDeck(engine, deckId, buffer, filename, true, void 0, track.trackName);
            useDJStore.getState().setDeckViewMode("visualizer");
          } else {
            const blob = new File([buffer], filename, { type: "application/octet-stream" });
            const song = await parseModuleToSong(blob);
            cacheSong(track.fileName, song);
            await loadSongToDeck(song, track.fileName, deckId, buffer);
          }
          return;
        } catch (err) {
          console.error(`[DJPlaylistPanel] Modland re-download failed:`, err);
        }
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "*/*";
      input.onchange = async () => {
        var _a;
        const file = (_a = input.files) == null ? void 0 : _a[0];
        if (!file) return;
        try {
          const rawBuffer = await file.arrayBuffer();
          if (isAudioFile(file.name)) {
            await engine.loadAudioToDeck(deckId, rawBuffer, file.name);
            useDJStore.getState().setDeckViewMode("vinyl");
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            await loadSongToDeck(song, file.name, deckId, rawBuffer);
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Failed to load track:`, err);
        }
      };
      input.click();
    },
    [loadSongToDeck]
  );
  const loadTrackWithProgress = reactExports.useCallback(
    async (track, deckId, index) => {
      setLoadingTrackIndex(index);
      setLoadingDeckId(deckId);
      try {
        await loadTrackToDeck(track, deckId);
      } finally {
        setLoadingTrackIndex(null);
        setLoadingDeckId(null);
      }
    },
    [loadTrackToDeck]
  );
  const handleDragStart = reactExports.useCallback((index) => {
    setDragIndex(index);
  }, []);
  const handleDragOver = reactExports.useCallback(
    (e, index) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index || !activePlaylistId) return;
      reorderTrack(activePlaylistId, dragIndex, index);
      setDragIndex(index);
    },
    [dragIndex, activePlaylistId, reorderTrack]
  );
  const handleDragEnd = reactExports.useCallback(() => {
    setDragIndex(null);
  }, []);
  const handleDropOnPlaylist = reactExports.useCallback(
    async (e) => {
      var _a;
      e.preventDefault();
      e.stopPropagation();
      if (!activePlaylistId) return;
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      setIsLoadingFile(true);
      for (const file of droppedFiles) {
        try {
          const isAudio = isAudioFile(file.name);
          const fileExt = ((_a = file.name.split(".").pop()) == null ? void 0 : _a.toUpperCase()) ?? "MOD";
          if (isAudio) {
            addTrack(activePlaylistId, {
              fileName: file.name,
              trackName: file.name.replace(/\.[^.]+$/, ""),
              format: fileExt,
              bpm: 0,
              duration: 0,
              addedAt: Date.now()
            });
          } else {
            const song = await parseModuleToSong(file);
            cacheSong(file.name, song);
            const bpmResult = detectBPM(song);
            const duration = estimateSongDuration(song);
            addTrack(activePlaylistId, {
              fileName: file.name,
              trackName: song.name || file.name,
              format: fileExt,
              bpm: bpmResult.bpm,
              duration,
              addedAt: Date.now()
            });
          }
        } catch (err) {
          console.error(`[DJPlaylistPanel] Drop process error:`, err);
        }
      }
      setIsLoadingFile(false);
    },
    [activePlaylistId, addTrack]
  );
  const handleSort = reactExports.useCallback((mode2) => {
    if (!activePlaylist) return;
    const tracks = [...activePlaylist.tracks];
    let sorted;
    switch (mode2) {
      case "smart":
        sorted = smartSort(tracks);
        break;
      case "bpm":
        sorted = sortByBPM(tracks);
        break;
      case "bpm-desc":
        sorted = sortByBPM(tracks, true);
        break;
      case "key":
        sorted = sortByKey(tracks);
        break;
      case "energy":
        sorted = sortByEnergy(tracks);
        break;
      case "name":
        sorted = sortByName(tracks);
        break;
      default:
        sorted = tracks;
    }
    sortTracksAction(activePlaylist.id, sorted);
    setShowSortMenu(false);
  }, [activePlaylist, sortTracksAction]);
  const [hoveredIdx, setHoveredIdx] = reactExports.useState(null);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: panelRef, className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-2 flex flex-col gap-1 max-h-[400px]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5", children: [
      playlists.length > 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: activePlaylistId ?? "",
          onChange: (v) => setActivePlaylist(v),
          options: playlists.map((pl) => {
            const totalSec = pl.tracks.reduce((s, t) => s + (t.duration || 0), 0);
            const durStr = totalSec > 0 ? totalSec >= 3600 ? `${Math.floor(totalSec / 3600)}h${String(Math.floor(totalSec % 3600 / 60)).padStart(2, "0")}m` : `${Math.floor(totalSec / 60)}m` : "";
            return {
              value: pl.id,
              label: `${pl.name} (${pl.tracks.length}${durStr ? ` · ${durStr}` : ""})`
            };
          }),
          className: "flex-1 px-2 py-1 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary cursor-pointer min-w-0"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 408,
          columnNumber: 11
        },
        void 0
      ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 text-[10px] font-mono text-text-muted", children: "No playlists" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 426,
        columnNumber: 11
      }, void 0),
      activePlaylist && !isCreating && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = fileInputRef.current) == null ? void 0 : _a.click();
            },
            disabled: isLoadingFile,
            className: "p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50",
            title: isLoadingFile ? "Loading..." : "Add tracks",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
              lineNumber: 437,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
            lineNumber: 431,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              setEditingId(activePlaylist.id);
              setEditName(activePlaylist.name);
            },
            className: "p-1 text-text-muted hover:text-text-primary transition-colors",
            title: "Rename playlist",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PenLine, { size: 10 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
              lineNumber: 444,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
            lineNumber: 439,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => deletePlaylist(activePlaylist.id),
            className: "p-1 text-text-muted hover:text-accent-error transition-colors",
            title: "Delete playlist",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 10 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
              lineNumber: 451,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
            lineNumber: 446,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setShowSortMenu((v) => !v),
              className: `p-1 transition-colors ${showSortMenu ? "text-accent-primary" : "text-text-muted hover:text-text-primary"}`,
              title: "Sort playlist",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArrowUpDown, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 460,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
              lineNumber: 455,
              columnNumber: 15
            },
            void 0
          ),
          showSortMenu && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full right-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded shadow-xl min-w-[140px]", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleSort("smart"),
                className: "w-full text-left px-3 py-1.5 text-xs font-mono text-accent-primary hover:bg-dark-bgTertiary transition-colors",
                title: "AI-optimized order: BPM flow + harmonic keys + energy arc",
                children: "Smart Mix"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 464,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border/30" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
              lineNumber: 470,
              columnNumber: 19
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleSort("bpm"),
                className: "w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors",
                children: "BPM (low → high)"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 471,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleSort("bpm-desc"),
                className: "w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors",
                children: "BPM (high → low)"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 475,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleSort("key"),
                className: "w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors",
                children: "Key (Camelot)"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 479,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleSort("energy"),
                className: "w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors",
                children: "Energy"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 483,
                columnNumber: 19
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleSort("name"),
                className: "w-full text-left px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-dark-bgTertiary transition-colors",
                children: "Name (A→Z)"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 487,
                columnNumber: 19
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
            lineNumber: 463,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 454,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 430,
        columnNumber: 11
      }, void 0),
      !isCreating ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setIsCreating(true),
          className: "px-2 py-1 text-[10px] font-mono text-text-secondary\n                       bg-dark-bgTertiary border border-dark-borderLight rounded\n                       hover:bg-dark-bgHover hover:text-text-primary transition-colors",
          children: "New"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 498,
          columnNumber: 11
        },
        void 0
      ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            autoFocus: true,
            value: newName,
            onChange: (e) => setNewName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setIsCreating(false);
            },
            placeholder: "Name...",
            className: "w-24 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight\n                         rounded text-text-primary placeholder:text-text-muted/40"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
            lineNumber: 508,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: handleCreate, className: "p-0.5 text-green-400 hover:text-green-300", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 12 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 521,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 520,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => setIsCreating(false), className: "p-0.5 text-text-muted hover:text-text-primary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 12 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 524,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 523,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 507,
        columnNumber: 11
      }, void 0),
      onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary p-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 12 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 531,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 530,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 406,
      columnNumber: 7
    }, void 0),
    editingId && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          autoFocus: true,
          value: editName,
          onChange: (e) => setEditName(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") handleRename(editingId);
            if (e.key === "Escape") setEditingId(null);
          },
          onBlur: () => handleRename(editingId),
          className: "flex-1 px-2 py-0.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight\n                       rounded text-text-primary"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 539,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => handleRename(editingId), className: "p-0.5 text-green-400 hover:text-green-300", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 12 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 552,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 551,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: () => setEditingId(null), className: "p-0.5 text-text-muted hover:text-text-primary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 12 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 555,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 554,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 538,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("input", { ref: fileInputRef, type: "file", multiple: true, accept: "*/*", onChange: handleAddFiles, className: "hidden" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 560,
      columnNumber: 7
    }, void 0),
    activePlaylist && modlandCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 py-1.5 border-b border-dark-border", children: precacheProgress ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between text-[10px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-amber-400", children: [
          precacheProgress.current,
          "/",
          precacheProgress.total
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 568,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-400 ml-1", children: [
          precacheProgress.cached + precacheProgress.skipped,
          " cached"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 569,
          columnNumber: 17
        }, void 0),
        precacheProgress.failed > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-red-400 ml-1", children: [
          precacheProgress.failed,
          " fail"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 570,
          columnNumber: 49
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-tertiary truncate ml-2 flex-1 text-right", children: precacheProgress.trackName }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 571,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 567,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-1 bg-dark-bgTertiary rounded-full overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "h-full bg-amber-500 transition-all duration-300",
          style: { width: `${precacheProgress.current / precacheProgress.total * 100}%` }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 574,
          columnNumber: 17
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 573,
        columnNumber: 15
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 566,
      columnNumber: 13
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-[10px]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-400", children: [
        cachedCount,
        "/",
        modlandCount,
        " cached"
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 580,
        columnNumber: 15
      }, void 0),
      uncachedCount === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-500/80 ml-auto", children: "Offline ready" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 581,
        columnNumber: 39
      }, void 0),
      uncachedCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handlePrecache,
          className: "ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-amber-700 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-all",
          children: [
            "Cache (",
            uncachedCount,
            ")"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 583,
          columnNumber: 17
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 579,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 564,
      columnNumber: 9
    }, void 0),
    activePlaylist ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex-1 overflow-y-auto min-h-0",
        onDragOver: (e) => e.preventDefault(),
        onDrop: handleDropOnPlaylist,
        children: activePlaylist.tracks.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center py-4 text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] font-mono", children: "Drop files or click + to add tracks" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 604,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 603,
          columnNumber: 13
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col", children: activePlaylist.tracks.map((track, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            draggable: true,
            onDragStart: () => handleDragStart(i),
            onDragOver: (e) => handleDragOver(e, i),
            onDragEnd: handleDragEnd,
            onDoubleClick: () => loadTrackWithProgress(track, pickFreeDeck(), i),
            onPointerEnter: () => setHoveredIdx(i),
            onPointerLeave: () => setHoveredIdx((prev) => prev === i ? null : prev),
            className: `flex items-center gap-1.5 px-1.5 py-1 border-b border-dark-border transition-colors cursor-pointer ${loadingTrackIndex === i ? "bg-cyan-900/20" : dragIndex === i ? "bg-accent-primary/10" : autoDJEnabled && i === autoDJCurrentIdx ? "bg-green-900/20" : autoDJEnabled && i === autoDJNextIdx ? "bg-blue-900/15" : hoveredIdx === i ? "bg-white/5" : ""}`,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                GripVertical,
                {
                  size: 8,
                  className: "text-text-muted/20 group-hover:text-text-muted/50 shrink-0 cursor-grab"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                  lineNumber: 632,
                  columnNumber: 19
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-muted/30 w-4 text-right shrink-0", children: i + 1 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 636,
                columnNumber: 19
              }, void 0),
              loadingTrackIndex === i ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-cyan-400 text-[9px] shrink-0 animate-pulse", title: `Loading to deck ${loadingDeckId}`, children: loadingDeckId }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 640,
                columnNumber: 21
              }, void 0) : track.played ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-500/50 text-[9px] shrink-0", title: "Played", children: "P" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 644,
                columnNumber: 21
              }, void 0) : null,
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `flex-1 text-sm font-mono truncate min-w-0 ${loadingTrackIndex === i ? "text-cyan-400" : track.played ? "text-text-muted/40" : "text-text-secondary"}`, children: track.trackName }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 646,
                columnNumber: 19
              }, void 0),
              track.bpm > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-muted/40 shrink-0", children: track.bpm }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 652,
                columnNumber: 21
              }, void 0),
              track.musicalKey && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "span",
                {
                  className: "text-[10px] font-mono font-bold shrink-0 px-1 rounded",
                  style: { color: camelotColor(track.musicalKey), backgroundColor: `${camelotColor(track.musicalKey)}15` },
                  children: camelotDisplay(track.musicalKey)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                  lineNumber: 655,
                  columnNumber: 21
                },
                void 0
              ),
              track.duration > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-text-muted/30 shrink-0", children: formatDuration$1(track.duration) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 663,
                columnNumber: 21
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `flex items-center gap-0.5 shrink-0 transition-opacity ${hoveredIdx === i ? "opacity-100" : "opacity-0 pointer-events-none"}`, children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      loadTrackWithProgress(track, "A", i);
                    },
                    className: "px-1 text-xs font-mono font-bold text-blue-400 hover:text-blue-300 transition-colors",
                    title: "Deck 1",
                    children: "1"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                    lineNumber: 666,
                    columnNumber: 21
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      loadTrackWithProgress(track, "B", i);
                    },
                    className: "px-1 text-xs font-mono font-bold text-red-400 hover:text-red-300 transition-colors",
                    title: "Deck 2",
                    children: "2"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                    lineNumber: 673,
                    columnNumber: 21
                  },
                  void 0
                ),
                useDJStore.getState().thirdDeckActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      loadTrackWithProgress(track, "C", i);
                    },
                    className: "px-1 text-xs font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-colors",
                    title: "Deck 3",
                    children: "3"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                    lineNumber: 681,
                    columnNumber: 23
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      removeTrack(activePlaylist.id, i);
                    },
                    className: "p-0.5 text-accent-error hover:text-red-400 transition-colors",
                    children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 8 }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                      lineNumber: 693,
                      columnNumber: 23
                    }, void 0)
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                    lineNumber: 689,
                    columnNumber: 21
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
                lineNumber: 665,
                columnNumber: 19
              }, void 0)
            ]
          },
          `${track.fileName}-${i}`,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
            lineNumber: 609,
            columnNumber: 17
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
          lineNumber: 607,
          columnNumber: 13
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
        lineNumber: 597,
        columnNumber: 9
      },
      void 0
    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center py-4 text-text-muted", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] font-mono", children: "Create a playlist to get started" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 703,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
      lineNumber: 702,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJPlaylistPanel.tsx",
    lineNumber: 404,
    columnNumber: 5
  }, void 0);
};
function modlandToResult(f) {
  return { source: "modland", key: f.full_path, filename: f.filename, format: f.format, author: f.author, avg_rating: f.avg_rating, vote_count: f.vote_count };
}
function hvscToResult(e) {
  return { source: "hvsc", key: e.path, filename: e.name, format: "SID", author: e.author || "", avg_rating: e.avg_rating, vote_count: e.vote_count };
}
const DJModlandBrowser = ({ onClose }) => {
  const [query, setQuery] = reactExports.useState("");
  const [source, setSource] = reactExports.useState("all");
  const [format, setFormat] = reactExports.useState("");
  const [results, setResults] = reactExports.useState([]);
  const [formats, setFormats] = reactExports.useState([]);
  const [status, setStatus] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [offset, setOffset] = reactExports.useState(0);
  const [hasMore, setHasMore] = reactExports.useState(false);
  const [downloadingPaths, setDownloadingPaths] = reactExports.useState(/* @__PURE__ */ new Set());
  const [selectedIndex, setSelectedIndex] = reactExports.useState(-1);
  const [, setLoadedDecks] = reactExports.useState(/* @__PURE__ */ new Set());
  const [ratings, setRatings] = reactExports.useState({});
  const isLoggedIn = useAuthStore((s) => !!s.token);
  const searchTimerRef = reactExports.useRef(null);
  const abortRef = reactExports.useRef(null);
  const inputRef = reactExports.useRef(null);
  const listRef = reactExports.useRef(null);
  const panelRef = reactExports.useRef(null);
  const thirdDeckActive = useThirdDeckActive();
  const LIMIT = 50;
  reactExports.useEffect(() => {
    getModlandStatus().then(setStatus).catch((err) => console.warn("Modland status unavailable:", err));
    getModlandFormats().then((fmts) => setFormats(fmts.sort((a, b) => a.format.localeCompare(b.format)))).catch((err) => console.warn("Modland formats unavailable:", err));
    requestAnimationFrame(() => {
      var _a;
      return (_a = inputRef.current) == null ? void 0 : _a.focus();
    });
  }, []);
  reactExports.useEffect(() => {
    if (!onClose) return;
    const handlePointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);
  const doSearch = reactExports.useCallback(
    async (q, fmt, src, newOffset, append) => {
      if (!q && !fmt) {
        if (!append) setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        let combined = [];
        let moreResults = false;
        if (src === "all" || src === "modland") {
          const data = await searchModland({
            q: q || void 0,
            format: fmt || void 0,
            limit: LIMIT,
            offset: newOffset
          });
          combined.push(...data.results.map(modlandToResult));
          if (data.results.length === LIMIT) moreResults = true;
        }
        if ((src === "all" || src === "hvsc") && q && !fmt) {
          try {
            const hvscResults = await searchHVSC(q, LIMIT, newOffset);
            combined.push(...hvscResults.filter((e) => !e.isDirectory).map(hvscToResult));
            if (hvscResults.length === LIMIT) moreResults = true;
          } catch {
          }
        }
        if (src === "all") {
          combined.sort((a, b) => a.filename.localeCompare(b.filename));
        }
        if (append) {
          setResults((prev) => [...prev, ...combined]);
        } else {
          setResults(combined);
        }
        setHasMore(moreResults);
        setOffset(newOffset);
        const modlandKeys = combined.filter((r) => r.source === "modland").map((r) => r.key);
        const hvscKeys = combined.filter((r) => r.source === "hvsc").map((r) => r.key);
        const ratingPromises = [];
        if (modlandKeys.length > 0) ratingPromises.push(batchGetRatings("modland", modlandKeys));
        if (hvscKeys.length > 0) ratingPromises.push(batchGetRatings("hvsc", hvscKeys));
        if (ratingPromises.length > 0) {
          Promise.all(ratingPromises).then((maps) => {
            const merged = Object.assign({}, ...maps);
            setRatings((prev) => append ? { ...prev, ...merged } : merged);
          }).catch(() => {
          });
        } else if (!append) {
          setRatings({});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    []
  );
  reactExports.useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      doSearch(query, format, source, 0, false);
      setSelectedIndex(0);
    }, 500);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, format, source, doSearch]);
  const loadMore = reactExports.useCallback(() => {
    const newOffset = offset + LIMIT;
    doSearch(query, format, source, newOffset, true);
  }, [query, format, source, offset, doSearch]);
  const handleRate = reactExports.useCallback(async (item, star) => {
    if (!isLoggedIn) return;
    const itemKey = item.key;
    const ratingSource = item.source;
    setRatings((prev) => {
      const existing = prev[itemKey];
      if (star === 0) {
        if (!existing) return prev;
        const newCount2 = Math.max(0, existing.count - 1);
        const newAvg2 = newCount2 > 0 ? (existing.avg * existing.count - (existing.userRating || 0)) / newCount2 : 0;
        return { ...prev, [itemKey]: { avg: newAvg2, count: newCount2 } };
      }
      const oldUser = existing == null ? void 0 : existing.userRating;
      const oldCount = (existing == null ? void 0 : existing.count) || 0;
      const oldAvg = (existing == null ? void 0 : existing.avg) || 0;
      const newCount = oldUser ? oldCount : oldCount + 1;
      const newAvg = oldUser ? (oldAvg * oldCount - oldUser + star) / newCount : (oldAvg * oldCount + star) / newCount;
      return { ...prev, [itemKey]: { avg: newAvg, count: newCount, userRating: star } };
    });
    try {
      if (star === 0) {
        await removeRating(ratingSource, itemKey);
      } else {
        await setRating(ratingSource, itemKey, star);
      }
    } catch {
      batchGetRatings(ratingSource, [itemKey]).then((rm) => {
        setRatings((prev) => ({ ...prev, ...rm }));
      }).catch(() => {
      });
    }
  }, [isLoggedIn]);
  reactExports.useEffect(() => {
    var _a;
    if (selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-result-item]");
    (_a = items[selectedIndex]) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  const pickFreeDeck = reactExports.useCallback(() => {
    const decks = useDJStore.getState().decks;
    if (!decks.A.isPlaying) return "A";
    if (!decks.B.isPlaying) return "B";
    return "A";
  }, []);
  const loadToDeck = reactExports.useCallback(
    async (file, deckId) => {
      var _a;
      setDownloadingPaths((prev) => new Set(prev).add(file.key));
      setError(null);
      try {
        let buffer;
        if (file.source === "hvsc") {
          buffer = await downloadHVSCFile(file.key);
        } else {
          const [modBuffer, companion] = await Promise.all([
            downloadModlandFile(file.key),
            downloadTFMXCompanion(file.key)
          ]);
          buffer = modBuffer;
          if (companion) {
            const { UADEEngine } = await __vitePreload(async () => {
              const { UADEEngine: UADEEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iN);
              return { UADEEngine: UADEEngine2 };
            }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
            await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
          }
        }
        const cacheKey = `${file.source}:${file.key}`;
        const engine = getDJEngine();
        if (isUADEFormat(file.filename) || file.source === "hvsc") {
          await loadUADEToDeck(
            engine,
            deckId,
            buffer,
            file.filename,
            true,
            void 0,
            file.filename
          );
          if (useDJStore.getState().deckViewMode !== "3d") {
            useDJStore.getState().setDeckViewMode("visualizer");
          }
        } else {
          const blob = new File([buffer], file.filename, { type: "application/octet-stream" });
          const song = await parseModuleToSong(blob);
          const bpmResult = detectBPM(song);
          cacheSong(cacheKey, song);
          useDJStore.getState().setDeckState(deckId, {
            fileName: cacheKey,
            trackName: song.name || file.filename,
            detectedBPM: bpmResult.bpm,
            effectiveBPM: bpmResult.bpm,
            analysisState: "rendering",
            isPlaying: false
          });
          const result = await getDJPipeline().loadOrEnqueue(buffer, file.filename, deckId, "high");
          await engine.loadAudioToDeck(deckId, result.wavData, cacheKey, song.name || file.filename, ((_a = result.analysis) == null ? void 0 : _a.bpm) || bpmResult.bpm, song);
          if (useDJStore.getState().deckViewMode !== "3d") {
            useDJStore.getState().setDeckViewMode("visualizer");
          }
        }
        setLoadedDecks((prev) => {
          const next = new Set(prev).add(deckId);
          const requiredDecks = thirdDeckActive ? 3 : 2;
          if (next.size >= requiredDecks && onClose) {
            setTimeout(onClose, 300);
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setDownloadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(file.key);
          return next;
        });
      }
    },
    [thirdDeckActive, onClose]
  );
  const addToPlaylist = reactExports.useCallback(
    async (file) => {
      const playlistId = useDJPlaylistStore.getState().activePlaylistId;
      if (!playlistId) return;
      setDownloadingPaths((prev) => new Set(prev).add(file.key));
      setError(null);
      try {
        let buffer;
        if (file.source === "hvsc") {
          buffer = await downloadHVSCFile(file.key);
        } else {
          const [modBuffer, companion] = await Promise.all([
            downloadModlandFile(file.key),
            downloadTFMXCompanion(file.key)
          ]);
          buffer = modBuffer;
          if (companion) {
            const { UADEEngine } = await __vitePreload(async () => {
              const { UADEEngine: UADEEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iN);
              return { UADEEngine: UADEEngine2 };
            }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
            await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
          }
        }
        const blob = new File([buffer], file.filename, { type: "application/octet-stream" });
        const song = await parseModuleToSong(blob);
        const bpmResult = detectBPM(song);
        const duration = estimateSongDuration(song);
        const cacheKey = `${file.source}:${file.key}`;
        cacheSong(cacheKey, song);
        useDJPlaylistStore.getState().addTrack(playlistId, {
          fileName: cacheKey,
          trackName: song.name || file.filename,
          format: file.format,
          bpm: bpmResult.bpm,
          duration,
          addedAt: Date.now()
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add to playlist");
      } finally {
        setDownloadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(file.key);
          return next;
        });
      }
    },
    []
  );
  const handleKeyDown = reactExports.useCallback(
    (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault();
        const file = results[selectedIndex];
        if (!downloadingPaths.has(file.key)) {
          loadToDeck(file, e.shiftKey ? "B" : "A");
        }
      } else if ((e.key === "1" || e.key === "2" || e.key === "3") && selectedIndex >= 0 && selectedIndex < results.length) {
        const target = e.target;
        if (target.tagName === "INPUT") return;
        e.preventDefault();
        const file = results[selectedIndex];
        if (downloadingPaths.has(file.key)) return;
        const deckMap = { "1": "A", "2": "B", "3": "C" };
        const deckId = deckMap[e.key];
        if (deckId === "C" && !thirdDeckActive) {
          useDJStore.getState().setThirdDeckActive(true);
        }
        loadToDeck(file, deckId);
      }
    },
    [results, selectedIndex, downloadingPaths, thirdDeckActive, loadToDeck]
  );
  const isDownloading = (key) => downloadingPaths.has(key);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: panelRef,
      className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px] relative z-[99990]",
      onKeyDown: handleKeyDown,
      tabIndex: -1,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 14, className: "text-green-400" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 446,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-primary text-sm font-mono font-bold tracking-wider uppercase", children: "Online" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 447,
              columnNumber: 11
            }, void 0),
            status && status.status === "ready" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-text-muted", children: [
              status.totalFiles.toLocaleString(),
              " files"
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 451,
              columnNumber: 13
            }, void 0),
            status && status.status === "indexing" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-amber-400 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 10, className: "animate-spin" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                lineNumber: 457,
                columnNumber: 15
              }, void 0),
              " Indexing..."
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 456,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 445,
            columnNumber: 9
          }, void 0),
          onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary p-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 463,
            columnNumber: 13
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 462,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
          lineNumber: 444,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 flex gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 relative", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 12, className: "absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 471,
              columnNumber: 11
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                ref: inputRef,
                value: query,
                onChange: (e) => setQuery(e.target.value),
                placeholder: "Search online archives...",
                className: "w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight\n                       rounded text-text-primary placeholder:text-text-muted/40\n                       focus:border-green-600 focus:outline-none transition-colors"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                lineNumber: 472,
                columnNumber: 11
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 470,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: source,
              onChange: (v) => setSource(v),
              options: [
                { value: "all", label: "All sources" },
                { value: "modland", label: "Modland (190K+)" },
                { value: "hvsc", label: "HVSC / SID (80K+)" }
              ],
              className: "px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 482,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            CustomSelect,
            {
              value: format,
              onChange: (v) => setFormat(v),
              disabled: source === "hvsc",
              options: [
                { value: "", label: "All formats" },
                ...formats.map((f) => ({
                  value: f.format,
                  label: `${f.format} (${f.count.toLocaleString()})`
                }))
              ],
              className: "px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 492,
              columnNumber: 9
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
          lineNumber: 469,
          columnNumber: 7
        }, void 0),
        error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CircleAlert, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 510,
            columnNumber: 11
          }, void 0),
          error
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
          lineNumber: 509,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: listRef, className: "flex-1 overflow-y-auto min-h-0", children: [
          results.length === 0 && !loading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center py-8 text-text-muted", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Globe, { size: 24, className: "mb-2 opacity-40" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 519,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono", children: query || format ? "No results found" : "Search 270K+ tracker modules & SID tunes" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
              lineNumber: 520,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 518,
            columnNumber: 11
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
            results.map((file, idx) => {
              var _a, _b, _c;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "div",
                {
                  "data-result-item": true,
                  onClick: () => setSelectedIndex(idx),
                  onDoubleClick: () => loadToDeck(file, pickFreeDeck()),
                  className: `flex items-center gap-2 px-2 py-1.5 rounded border transition-colors group cursor-pointer ${idx === selectedIndex ? "bg-green-900/20 border-green-700/50" : "bg-dark-bg border-dark-borderLight hover:border-dark-border"}`,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary text-xs font-mono truncate", children: file.filename }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                        lineNumber: 540,
                        columnNumber: 19
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-3 text-[10px] text-text-muted font-mono items-center", children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: file.source === "hvsc" ? "text-blue-400" : "", children: file.format }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 544,
                          columnNumber: 21
                        }, void 0),
                        file.source === "hvsc" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-blue-400/60 text-[9px]", children: "HVSC" }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 545,
                          columnNumber: 48
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-muted/60", children: file.author }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 546,
                          columnNumber: 21
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                          StarRating,
                          {
                            avg: ((_a = ratings[file.key]) == null ? void 0 : _a.avg) ?? file.avg_rating ?? 0,
                            count: ((_b = ratings[file.key]) == null ? void 0 : _b.count) ?? file.vote_count ?? 0,
                            userRating: (_c = ratings[file.key]) == null ? void 0 : _c.userRating,
                            onRate: isLoggedIn ? (star) => handleRate(file, star) : void 0
                          },
                          void 0,
                          false,
                          {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                            lineNumber: 547,
                            columnNumber: 21
                          },
                          void 0
                        )
                      ] }, void 0, true, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                        lineNumber: 543,
                        columnNumber: 19
                      }, void 0)
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                      lineNumber: 539,
                      columnNumber: 17
                    }, void 0),
                    isDownloading(file.key) ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 12, className: "animate-spin text-green-400" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                      lineNumber: 558,
                      columnNumber: 19
                    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "button",
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            addToPlaylist(file);
                          },
                          className: "p-1 text-text-muted hover:text-amber-400 transition-colors\n                                 opacity-0 group-hover:opacity-100",
                          title: "Add to active playlist",
                          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ListPlus, { size: 12 }, void 0, false, {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                            lineNumber: 567,
                            columnNumber: 23
                          }, void 0)
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 561,
                          columnNumber: 21
                        },
                        void 0
                      ),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "button",
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            loadToDeck(file, "A");
                          },
                          className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                                 bg-blue-900/30 text-blue-400 border border-blue-800/50\n                                 hover:bg-blue-800/40 hover:text-blue-300 transition-colors\n                                 opacity-0 group-hover:opacity-100",
                          children: "1"
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 569,
                          columnNumber: 21
                        },
                        void 0
                      ),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "button",
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            loadToDeck(file, "B");
                          },
                          className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                                 bg-red-900/30 text-red-400 border border-red-800/50\n                                 hover:bg-red-800/40 hover:text-red-300 transition-colors\n                                 opacity-0 group-hover:opacity-100",
                          children: "2"
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 578,
                          columnNumber: 21
                        },
                        void 0
                      ),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                        "button",
                        {
                          onClick: (e) => {
                            e.stopPropagation();
                            if (!thirdDeckActive) useDJStore.getState().setThirdDeckActive(true);
                            loadToDeck(file, "C");
                          },
                          className: `px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50
                                 hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors
                                 opacity-0 group-hover:opacity-100 ${!thirdDeckActive ? "opacity-0 group-hover:opacity-50" : ""}`,
                          children: "3"
                        },
                        void 0,
                        false,
                        {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                          lineNumber: 587,
                          columnNumber: 21
                        },
                        void 0
                      )
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                      lineNumber: 560,
                      columnNumber: 19
                    }, void 0)
                  ]
                },
                file.key,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                  lineNumber: 527,
                  columnNumber: 15
                },
                void 0
              );
            }),
            hasMore && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: loadMore,
                disabled: loading,
                className: "mt-1 py-1.5 text-[10px] font-mono text-text-secondary bg-dark-bgTertiary\n                           border border-dark-borderLight rounded hover:bg-dark-bgHover\n                           hover:text-text-primary transition-colors disabled:opacity-50",
                children: loading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex items-center justify-center gap-1", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 10, className: "animate-spin" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                    lineNumber: 616,
                    columnNumber: 21
                  }, void 0),
                  " Loading..."
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                  lineNumber: 615,
                  columnNumber: 19
                }, void 0) : "Load more"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
                lineNumber: 607,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 525,
            columnNumber: 11
          }, void 0),
          loading && results.length === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 16, className: "animate-spin text-green-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 629,
            columnNumber: 13
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 628,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
          lineNumber: 516,
          columnNumber: 7
        }, void 0),
        results.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] font-mono text-text-muted/50 flex gap-3 px-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "↑↓ navigate" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 637,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "⏎ deck 1" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 638,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: "⇧⏎ deck 2" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
            lineNumber: 639,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
          lineNumber: 636,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJModlandBrowser.tsx",
      lineNumber: 437,
      columnNumber: 5
    },
    void 0
  );
};
const SERATO_PATH_KEY = "devilbox-serato-library-path";
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function formatBPM(bpm) {
  if (!bpm || bpm <= 0) return "--";
  return bpm.toFixed(1);
}
const DJSeratoBrowser = ({ onClose, onLoadTrackToDevice }) => {
  const [library, setLibrary] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [selectedCrate, setSelectedCrate] = reactExports.useState(null);
  const [query, setQuery] = reactExports.useState("");
  const [sortKey, setSortKey] = reactExports.useState("title");
  const [sortDir, setSortDir] = reactExports.useState("asc");
  const searchRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    const tryAutoDetect = async () => {
      setLoading(true);
      try {
        const lib = await autoDetectSeratoLibrary();
        if (!cancelled && lib) {
          setLibrary(lib);
          localStorage.setItem(SERATO_PATH_KEY, lib.libraryPath);
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tryAutoDetect();
    return () => {
      cancelled = true;
    };
  }, []);
  const handleBrowse = reactExports.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lib = await pickAndReadSeratoLibrary();
      if (lib) {
        setLibrary(lib);
        localStorage.setItem(SERATO_PATH_KEY, lib.libraryPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Serato library");
    } finally {
      setLoading(false);
    }
  }, []);
  const filteredTracks = reactExports.useMemo(() => {
    if (!library) return [];
    let tracks;
    if (selectedCrate) {
      const crate = library.crates.find((c) => c.name === selectedCrate);
      if (!crate) return [];
      const cratePathSet = new Set(crate.tracks.map((p) => p.toLowerCase()));
      tracks = library.tracks.filter(
        (t) => {
          var _a;
          return cratePathSet.has(t.filePath.toLowerCase()) || cratePathSet.has(((_a = t.filePath.replace(/\\/g, "/").split("/").pop()) == null ? void 0 : _a.toLowerCase()) || "");
        }
      );
    } else {
      tracks = library.tracks;
    }
    if (query) {
      const q = query.toLowerCase();
      tracks = tracks.filter(
        (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q) || t.genre.toLowerCase().includes(q) || t.key.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    tracks.sort((a, b) => {
      switch (sortKey) {
        case "bpm":
          return (a.bpm - b.bpm) * dir;
        case "duration":
          return (a.duration - b.duration) * dir;
        case "artist":
          return a.artist.localeCompare(b.artist) * dir;
        case "key":
          return a.key.localeCompare(b.key) * dir;
        case "genre":
          return a.genre.localeCompare(b.genre) * dir;
        default:
          return a.title.localeCompare(b.title) * dir;
      }
    });
    return tracks;
  }, [library, selectedCrate, query, sortKey, sortDir]);
  const toggleSort = reactExports.useCallback((key) => {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);
  if (!library && !loading) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-3 max-h-[400px]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 14, className: "text-purple-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 171,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-primary text-sm font-mono font-bold tracking-wider uppercase", children: "Serato" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 172,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 170,
          columnNumber: 11
        }, void 0),
        onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary p-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 178,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 177,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 169,
        columnNumber: 9
      }, void 0),
      error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CircleAlert, { size: 10 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 185,
          columnNumber: 13
        }, void 0),
        error
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 184,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center py-6 text-text-muted", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 28, className: "mb-3 opacity-40" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 191,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono mb-3", children: "Connect your Serato library" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 192,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleBrowse,
            className: "flex items-center gap-1.5 px-4 py-2 bg-purple-900/30 border border-purple-700/50\n                       rounded text-purple-300 text-xs font-mono hover:bg-purple-800/40 transition-colors",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FolderOpen, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
                lineNumber: 198,
                columnNumber: 13
              }, void 0),
              "Browse for _Serato_ folder"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 193,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted/60 mt-2 font-mono", children: "Usually at ~/Music/_Serato_" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 201,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 190,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 168,
      columnNumber: 7
    }, void 0);
  }
  if (loading) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 14, className: "text-purple-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 215,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-primary text-sm font-mono font-bold tracking-wider uppercase", children: "Serato" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 216,
            columnNumber: 13
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 214,
          columnNumber: 11
        }, void 0),
        onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary p-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 219,
          columnNumber: 95
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 219,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 213,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center py-8", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LoaderCircle, { size: 16, className: "animate-spin text-purple-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 223,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-2 text-xs font-mono text-text-muted", children: "Reading Serato library..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 224,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 222,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 212,
      columnNumber: 7
    }, void 0);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 14, className: "text-purple-400" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 236,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-text-primary text-sm font-mono font-bold tracking-wider uppercase", children: "Serato" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 237,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-mono text-text-muted", children: [
          library.tracks.length.toLocaleString(),
          " tracks",
          library.crates.length > 0 && ` / ${library.crates.length} crates`
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 240,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 235,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleBrowse,
            className: "text-text-muted hover:text-purple-400 p-1 transition-colors",
            title: "Change Serato library",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FolderOpen, { size: 12 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
              lineNumber: 251,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 246,
            columnNumber: 11
          },
          void 0
        ),
        onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary p-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 255,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 254,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 245,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 234,
      columnNumber: 7
    }, void 0),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CircleAlert, { size: 10 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 264,
        columnNumber: 11
      }, void 0),
      error
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 263,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 relative", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 12, className: "absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 272,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            ref: searchRef,
            value: query,
            onChange: (e) => setQuery(e.target.value),
            placeholder: "Search tracks...",
            className: "w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight\n                       rounded text-text-primary placeholder:text-text-muted/40\n                       focus:border-purple-600 focus:outline-none transition-colors"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 273,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 271,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: selectedCrate || "",
          onChange: (v) => setSelectedCrate(v || null),
          options: [
            { value: "", label: "All Tracks" },
            ...library.crates.map((c) => ({
              value: c.name,
              label: `${c.name} (${c.tracks.length})`
            }))
          ],
          className: "px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors max-w-[160px]"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 284,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 270,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 px-2 py-1 text-[10px] font-mono text-text-muted border-b border-dark-borderLight", children: [
      [
        ["title", "Title", "flex-1 min-w-0"],
        ["artist", "Artist", "w-[120px]"],
        ["bpm", "BPM", "w-[50px] text-right"],
        ["key", "Key", "w-[40px]"],
        ["duration", "Len", "w-[40px] text-right"]
      ].map(([key, label, cls]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => toggleSort(key),
          className: `${cls} hover:text-text-primary transition-colors text-left truncate ${sortKey === key ? "text-purple-400" : ""}`,
          children: [
            label,
            sortKey === key && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-0.5", children: sortDir === "asc" ? "▲" : "▼" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
              lineNumber: 316,
              columnNumber: 15
            }, void 0)
          ]
        },
        key,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
          lineNumber: 307,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[60px]" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 320,
        columnNumber: 9
      }, void 0),
      " "
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 299,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto min-h-0", children: filteredTracks.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center justify-center py-8 text-text-muted", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 24, className: "mb-2 opacity-40" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 327,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono", children: query ? "No matching tracks" : "No tracks in this view" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 328,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 326,
      columnNumber: 11
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: filteredTracks.map((track, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex items-center gap-2 px-2 py-1.5 bg-dark-bg rounded border border-dark-borderLight\n                           hover:border-dark-border transition-colors group",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0 text-text-primary text-xs font-mono truncate", children: track.title || track.filePath.split(/[/\\]/).pop() }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 340,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[120px] text-text-muted text-[10px] font-mono truncate", children: track.artist }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 343,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[50px] text-right text-[10px] font-mono text-text-muted", children: formatBPM(track.bpm) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 346,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[40px] text-[10px] font-mono text-text-muted", children: track.key || "--" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 349,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[40px] text-right text-[10px] font-mono text-text-muted", children: formatDuration(track.duration) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 352,
            columnNumber: 17
          }, void 0),
          onLoadTrackToDevice ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onLoadTrackToDevice(track, "A"),
                className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                                 bg-blue-900/30 text-blue-400 border border-blue-800/50\n                                 hover:bg-blue-800/40 hover:text-blue-300 transition-colors\n                                 opacity-0 group-hover:opacity-100",
                children: "1"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
                lineNumber: 359,
                columnNumber: 21
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onLoadTrackToDevice(track, "B"),
                className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                                 bg-red-900/30 text-red-400 border border-red-800/50\n                                 hover:bg-red-800/40 hover:text-red-300 transition-colors\n                                 opacity-0 group-hover:opacity-100",
                children: "2"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
                lineNumber: 368,
                columnNumber: 21
              },
              void 0
            ),
            useDJStore.getState().thirdDeckActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => onLoadTrackToDevice(track, "C"),
                className: "px-2 py-1 text-[10px] font-mono font-bold rounded\n                                   bg-emerald-900/30 text-emerald-400 border border-emerald-800/50\n                                   hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors\n                                   opacity-0 group-hover:opacity-100",
                children: "3"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
                lineNumber: 378,
                columnNumber: 23
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 358,
            columnNumber: 19
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-[60px] flex justify-end gap-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] font-mono text-text-muted/40 truncate", children: track.fileType || "--" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 391,
            columnNumber: 21
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
            lineNumber: 390,
            columnNumber: 19
          }, void 0)
        ]
      },
      `${track.filePath}-${i}`,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
        lineNumber: 335,
        columnNumber: 15
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 333,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
      lineNumber: 324,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJSeratoBrowser.tsx",
    lineNumber: 232,
    columnNumber: 5
  }, void 0);
};
const TABS = [
  { id: "browser", label: "Browser", icon: HardDrive },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "online", label: "Online", icon: Globe },
  { id: "serato", label: "Serato", icon: Disc3 }
];
const DJCratePanel = ({ onClose, onLoadSeratoTrack }) => {
  const [activeTab, setActiveTab] = reactExports.useState("playlists");
  const handleTabClick = reactExports.useCallback((tab) => {
    setActiveTab(tab);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-border rounded-lg flex flex-col max-h-[50vh]", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center border-b border-dark-border shrink-0", children: [
      TABS.map(({ id, label, icon: Icon }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => handleTabClick(id),
          className: `flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors border-b-2 ${activeTab === id ? "border-accent-primary text-accent-primary bg-dark-bg/50" : "border-transparent text-text-muted hover:text-text-secondary hover:bg-dark-bg/30"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Icon, { size: 12, strokeWidth: 1.5 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
              lineNumber: 51,
              columnNumber: 13
            }, void 0),
            label
          ]
        },
        id,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
          lineNumber: 42,
          columnNumber: 11
        },
        void 0
      )),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
        lineNumber: 55,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClose,
          className: "p-1.5 text-text-muted hover:text-text-primary transition-colors mr-1",
          title: "Close crate",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 14 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
            lineNumber: 61,
            columnNumber: 11
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
          lineNumber: 56,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
      lineNumber: 40,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-h-0", children: [
      activeTab === "browser" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJFileBrowser, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
        lineNumber: 67,
        columnNumber: 37
      }, void 0),
      activeTab === "playlists" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJPlaylistPanel, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
        lineNumber: 68,
        columnNumber: 39
      }, void 0),
      activeTab === "online" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJModlandBrowser, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
        lineNumber: 69,
        columnNumber: 36
      }, void 0),
      activeTab === "serato" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJSeratoBrowser, { onLoadTrackToDevice: onLoadSeratoTrack }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
        lineNumber: 71,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
      lineNumber: 66,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJCratePanel.tsx",
    lineNumber: 38,
    columnNumber: 5
  }, void 0);
};
const USER_PRESETS_KEY = "master-fx-user-presets";
const CATEGORY_ORDER = [
  "DJ",
  "Genre",
  "Loud",
  "Warm",
  "Clean",
  "Wide",
  "Vinyl",
  "Neural"
];
const DYNAMICS_EFFECTS = /* @__PURE__ */ new Set(["Compressor", "EQ3"]);
const effectsByGroup = AVAILABLE_EFFECTS.reduce((acc, effect) => {
  if (!acc[effect.group]) acc[effect.group] = [];
  acc[effect.group].push(effect);
  return acc;
}, {});
const groupedPresets = CATEGORY_ORDER.map((cat) => ({
  category: cat,
  presets: MASTER_FX_PRESETS.filter((p) => p.category === cat)
})).filter((g) => g.presets.length > 0);
const DJFxQuickPresets = () => {
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [showAddEffect, setShowAddEffect] = reactExports.useState(false);
  const [activePresetName, setActivePresetName] = reactExports.useState(null);
  const dropdownRef = reactExports.useRef(null);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);
  const addMasterEffectConfig = useAudioStore((s) => s.addMasterEffectConfig);
  const user = useAuthStore((s) => s.user);
  const getUserPresets = reactExports.useCallback(() => {
    try {
      const stored = localStorage.getItem(USER_PRESETS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p) => p !== null && typeof p === "object" && typeof p.name === "string" && Array.isArray(p.effects)
      );
    } catch {
      return [];
    }
  }, []);
  const [userPresets, setUserPresets] = reactExports.useState(getUserPresets);
  reactExports.useEffect(() => {
    if (isOpen) setUserPresets(getUserPresets());
  }, [isOpen, getUserPresets]);
  const syncToServer = reactExports.useCallback((presets) => {
    pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, presets).catch((err) => console.warn("FX preset cloud sync failed:", err));
  }, []);
  const applyFactoryPreset = reactExports.useCallback(
    (preset) => {
      const effects = preset.effects.map((fx, i) => ({
        ...fx,
        id: `master-fx-${Date.now()}-${i}`
      }));
      setMasterEffects(effects);
      setActivePresetName(preset.name);
      setIsOpen(false);
    },
    [setMasterEffects]
  );
  const applyUserPreset = reactExports.useCallback(
    (preset) => {
      const effects = preset.effects.map((fx, i) => ({
        ...fx,
        id: `master-fx-${Date.now()}-${i}`
      }));
      setMasterEffects(effects);
      setActivePresetName(preset.name);
      setIsOpen(false);
    },
    [setMasterEffects]
  );
  const deleteUserPreset = reactExports.useCallback(
    async (name, e) => {
      e.stopPropagation();
      const updated = getUserPresets().filter((p) => p.name !== name);
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(updated));
      setUserPresets(updated);
      if (activePresetName === name) setActivePresetName(null);
      await syncToServer(updated);
    },
    [getUserPresets, activePresetName, syncToServer]
  );
  const clearPresets = reactExports.useCallback(() => {
    setMasterEffects([]);
    setActivePresetName(null);
    setIsOpen(false);
  }, [setMasterEffects]);
  const handleAddEffect = reactExports.useCallback(
    (availableEffect) => {
      const type = availableEffect.type || "Distortion";
      const params = { ...getDefaultEffectParameters(type) };
      if (availableEffect.category === "neural" && availableEffect.neuralModelIndex !== void 0) {
        const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
        if (model == null ? void 0 : model.parameters) {
          Object.entries(model.parameters).forEach(([key, param]) => {
            if (param) params[key] = param.default;
          });
        }
      }
      const defaultWet = DYNAMICS_EFFECTS.has(type) ? 100 : 50;
      addMasterEffectConfig({
        category: availableEffect.category,
        type,
        enabled: true,
        wet: defaultWet,
        parameters: params,
        neuralModelIndex: availableEffect.neuralModelIndex,
        neuralModelName: availableEffect.category === "neural" ? availableEffect.label : void 0
      });
      setActivePresetName(null);
    },
    [addMasterEffectConfig]
  );
  useClickOutside(dropdownRef, () => setIsOpen(false), { enabled: isOpen });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: dropdownRef, className: "relative", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: () => setIsOpen(!isOpen),
        className: `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border transition-all
          ${activePresetName ? "border-green-600/60 bg-green-950/30 text-green-400" : "border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate max-w-[120px]", children: activePresetName || "FX Presets" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 193,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 12, className: `shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 196,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
        lineNumber: 185,
        columnNumber: 7
      },
      void 0
    ),
    isOpen && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute right-0 top-full mt-1 z-[99990] w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-dark-border bg-dark-bgSecondary shadow-xl", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: clearPresets,
          className: "w-full px-3 py-2 text-left text-xs font-mono text-text-muted hover:bg-dark-bgHover hover:text-text-primary border-b border-dark-border transition-colors",
          children: "Clear All FX"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
          lineNumber: 203,
          columnNumber: 11
        },
        void 0
      ),
      userPresets.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-b border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400/70", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Star, { size: 10 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 214,
            columnNumber: 17
          }, void 0),
          "My Presets",
          user && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cloud, { size: 9, className: "ml-auto text-green-500/50", "aria-label": "Synced to account" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 216,
            columnNumber: 26
          }, void 0),
          !user && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CloudOff, { size: 9, className: "ml-auto text-text-muted/30", "aria-label": "Local only — log in to sync" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 217,
            columnNumber: 27
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
          lineNumber: 213,
          columnNumber: 15
        }, void 0),
        userPresets.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => applyUserPreset(preset),
            className: `group flex items-center w-full px-3 py-1.5 text-left text-xs font-mono transition-colors
                    ${activePresetName === preset.name ? "bg-amber-950/30 text-amber-300" : "text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate flex-1", children: preset.name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
                lineNumber: 229,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted/50 mr-2", children: [
                preset.effects.length,
                " fx"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
                lineNumber: 230,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Trash2,
                {
                  size: 11,
                  className: "shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-400 transition-opacity",
                  onClick: (e) => deleteUserPreset(preset.name, e)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
                  lineNumber: 233,
                  columnNumber: 19
                },
                void 0
              )
            ]
          },
          preset.name,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 220,
            columnNumber: 17
          },
          void 0
        ))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
        lineNumber: 212,
        columnNumber: 13
      }, void 0),
      groupedPresets.map(({ category, presets }) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-b border-dark-border last:border-0", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted/60", children: category }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
          lineNumber: 246,
          columnNumber: 15
        }, void 0),
        presets.map((preset) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => applyFactoryPreset(preset),
            className: `w-full px-3 py-1.5 text-left text-xs font-mono transition-colors
                    ${activePresetName === preset.name ? "bg-accent-primary/10 text-accent-primary" : "text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
            title: preset.description,
            children: preset.name
          },
          preset.name,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 250,
            columnNumber: 17
          },
          void 0
        ))
      ] }, category, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
        lineNumber: 245,
        columnNumber: 13
      }, void 0)),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowAddEffect(!showAddEffect),
            className: "w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-accent-primary/80 hover:text-accent-primary hover:bg-dark-bgHover transition-colors",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Plus, { size: 10 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
                lineNumber: 272,
                columnNumber: 15
              }, void 0),
              "Add Individual Effect",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronDown, { size: 10, className: `ml-auto transition-transform ${showAddEffect ? "rotate-180" : ""}` }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
                lineNumber: 274,
                columnNumber: 15
              }, void 0)
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 268,
            columnNumber: 13
          },
          void 0
        ),
        showAddEffect && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-2 pb-2 space-y-2", children: Object.entries(effectsByGroup).map(([group, effects]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-1 py-1 text-[9px] font-bold uppercase tracking-widest text-text-muted/50", children: group }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 281,
            columnNumber: 21
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1", children: effects.map((effect) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handleAddEffect(effect),
              className: "px-1.5 py-0.5 text-[10px] rounded border border-dark-borderLight\n                            bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary\n                            hover:border-accent-primary/50 transition-colors",
              title: effect.description,
              children: effect.label
            },
            effect.type ?? `neural-${effect.neuralModelIndex}`,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
              lineNumber: 286,
              columnNumber: 25
            },
            void 0
          )) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
            lineNumber: 284,
            columnNumber: 21
          }, void 0)
        ] }, group, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
          lineNumber: 280,
          columnNumber: 19
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
          lineNumber: 278,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
        lineNumber: 267,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
      lineNumber: 201,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJFxQuickPresets.tsx",
    lineNumber: 183,
    columnNumber: 5
  }, void 0);
};
const STORAGE_KEY = "devilbox-dj-controller-preset";
const DJControllerSelector = () => {
  const [selectedId, setSelectedId] = reactExports.useState(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });
  reactExports.useEffect(() => {
    if (selectedId) {
      const preset = getPresetById(selectedId);
      getDJControllerMapper().setPreset(preset);
    }
  }, []);
  const handleChange = reactExports.useCallback((id) => {
    setSelectedId(id);
    if (id) {
      const preset = getPresetById(id);
      getDJControllerMapper().setPreset(preset);
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      getDJControllerMapper().setPreset(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  const grouped = /* @__PURE__ */ new Map();
  for (const p of DJ_CONTROLLER_PRESETS) {
    const list = grouped.get(p.manufacturer) || [];
    list.push(p);
    grouped.set(p.manufacturer, list);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    CustomSelect,
    {
      value: selectedId,
      onChange: handleChange,
      options: [
        { value: "", label: "Controller: None" },
        ...Array.from(grouped.entries()).map(([mfr, presets]) => ({
          label: mfr,
          options: presets.map((p) => ({
            value: p.id,
            label: p.name
          }))
        }))
      ],
      className: "px-3 py-1.5 text-xs font-mono bg-dark-bgTertiary text-text-secondary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer",
      title: "Select DJ controller for MIDI mapping"
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJControllerSelector.tsx",
      lineNumber: 51,
      columnNumber: 5
    },
    void 0
  );
};
function trackNeedsAnalysis(track) {
  if (track.analysisSkipped) return false;
  return track.bpm === 0 || !track.musicalKey || track.energy == null;
}
function playlistNeedsAnalysis(playlist) {
  return playlist.tracks.some(trackNeedsAnalysis);
}
async function analyzePlaylist(playlistId, onProgress, onFixNeeded) {
  var _a;
  const store = useDJPlaylistStore.getState();
  const playlist = store.playlists.find((p) => p.id === playlistId);
  if (!playlist) return { analyzed: 0, failed: 0, total: 0, failures: [] };
  const tracksToAnalyze = playlist.tracks.map((track, index) => ({ track, index })).filter(({ track }) => trackNeedsAnalysis(track) && track.fileName.startsWith("modland:"));
  if (tracksToAnalyze.length === 0) return { analyzed: 0, failed: 0, total: 0, failures: [] };
  const total = tracksToAnalyze.length;
  let analyzed = 0;
  let failed = 0;
  const failures = [];
  console.log(`[PlaylistAnalyzer] Analyzing ${total} tracks in "${playlist.name}"`);
  for (const { track, index } of tracksToAnalyze) {
    const modlandPath = track.fileName.slice("modland:".length);
    const filename = modlandPath.split("/").pop() || "download.mod";
    const processed = analyzed + failed;
    onProgress == null ? void 0 : onProgress({ current: processed + 1, total, analyzed, failed, trackName: track.trackName, status: "analyzing" });
    try {
      await new Promise((r) => setTimeout(r, 4e3));
      const { downloadModlandFile: downloadModlandFile2, searchModland: searchModland2 } = await __vitePreload(async () => {
        const { downloadModlandFile: downloadModlandFile3, searchModland: searchModland3 } = await import("./main-BbV5VyEH.js").then((n) => n.jp);
        return { downloadModlandFile: downloadModlandFile3, searchModland: searchModland3 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      let buffer;
      let currentPath = modlandPath;
      let retries = 0;
      while (true) {
        try {
          buffer = await downloadModlandFile2(currentPath);
          break;
        } catch (dlErr) {
          const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
          if (msg.includes("Rate limited") || msg.includes("429")) {
            retries++;
            if (retries > 8) throw dlErr;
            const wait = Math.min(6e4, 5e3 * Math.pow(2, retries - 1));
            console.log(`[PlaylistAnalyzer] Rate limited, waiting ${wait / 1e3}s (retry ${retries}/8)...`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          if (msg.includes("404")) {
            console.log(`[PlaylistAnalyzer] 404 for ${filename} — searching Modland...`);
            try {
              const nameNoExt = filename.replace(/\.[^.]+$/, "");
              let candidates = [];
              for (const query of [filename, nameNoExt]) {
                const results = await searchModland2({ q: query, limit: 10 });
                if (results.results.length > 0) {
                  candidates = results.results.map((r) => ({
                    filename: r.filename,
                    full_path: r.full_path,
                    format: r.format,
                    author: r.author
                  }));
                  break;
                }
                await new Promise((r) => setTimeout(r, 1e3));
              }
              if (candidates.length > 0) {
                let selectedPath = null;
                if (candidates.length === 1) {
                  selectedPath = candidates[0].full_path;
                  console.log(`[PlaylistAnalyzer] Auto-fix: ${selectedPath}`);
                } else if (onFixNeeded) {
                  selectedPath = await onFixNeeded(track.trackName, modlandPath, candidates);
                } else {
                  selectedPath = candidates[0].full_path;
                  console.log(`[PlaylistAnalyzer] Auto-fix (best guess): ${selectedPath}`);
                }
                if (selectedPath) {
                  const newFileName = `modland:${selectedPath}`;
                  useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, { fileName: newFileName });
                  currentPath = selectedPath;
                  await new Promise((r) => setTimeout(r, 2e3));
                  continue;
                }
              }
            } catch {
            }
          }
          throw dlErr;
        }
      }
      const serverBase = "http://localhost:3001/api";
      let companionParam = "";
      const baseName = filename.toLowerCase();
      if (baseName.startsWith("mdat.")) {
        const smplName = "smpl." + filename.slice(5);
        const dirPath = modlandPath.split("/").slice(0, -1).join("/");
        companionParam = `&companion=${encodeURIComponent(dirPath + "/" + smplName)}`;
      }
      const response = await fetch(
        `${serverBase}/render/analyze?filename=${encodeURIComponent(filename)}${companionParam}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: buffer
        }
      );
      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown");
        throw new Error(`Server render failed (${response.status}): ${errText}`);
      }
      const result = await response.json();
      const meta = {};
      if (result.bpm > 0) meta.bpm = result.bpm;
      if (result.musicalKey) meta.musicalKey = result.musicalKey;
      if (result.energy != null) meta.energy = result.energy;
      if (result.duration > 0) meta.duration = result.duration;
      if (Object.keys(meta).length > 0) {
        useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, meta);
      }
      analyzed++;
      const done = analyzed + failed;
      onProgress == null ? void 0 : onProgress({ current: done, total, analyzed, failed, trackName: track.trackName, status: "done" });
      console.log(`[PlaylistAnalyzer] ${done}/${total} (${analyzed} ok, ${failed} fail) — ${track.trackName}: BPM=${result.bpm}, key=${result.musicalKey ?? "?"}, energy=${((_a = result.energy) == null ? void 0 : _a.toFixed(2)) ?? "?"}`);
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ trackName: track.trackName, fileName: track.fileName, reason });
      useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, { analysisSkipped: true });
      const done = analyzed + failed;
      onProgress == null ? void 0 : onProgress({ current: done, total, analyzed, failed, trackName: track.trackName, status: "error" });
      console.warn(`[PlaylistAnalyzer] ${done}/${total} FAIL — ${track.trackName}: ${reason}`);
    }
  }
  console.log(`[PlaylistAnalyzer] Complete — ${analyzed} analyzed, ${failed} failed out of ${total}`);
  if (failures.length > 0) {
    console.group("[PlaylistAnalyzer] Failure report:");
    for (const f of failures) {
      console.log(`  ${f.trackName}: ${f.reason}`);
    }
    console.groupEnd();
  }
  return { analyzed, failed, total, failures };
}
const STATUS_LABELS = {
  idle: "OFF",
  playing: "Playing",
  preloading: "Loading next...",
  "preload-failed": "Load failed",
  "transition-pending": "Ready to mix",
  transitioning: "Mixing..."
};
const STATUS_COLORS = {
  idle: "bg-gray-600",
  playing: "bg-green-500",
  preloading: "bg-yellow-500",
  "preload-failed": "bg-red-500",
  "transition-pending": "bg-blue-500",
  transitioning: "bg-cyan-500 animate-pulse"
};
const TRANSITION_BAR_OPTIONS = [4, 8, 16, 32];
const DJAutoDJPanel = ({ onClose }) => {
  const enabled = useDJStore((s) => s.autoDJEnabled);
  const status = useDJStore((s) => s.autoDJStatus);
  const currentIdx = useDJStore((s) => s.autoDJCurrentTrackIndex);
  const nextIdx = useDJStore((s) => s.autoDJNextTrackIndex);
  const transitionBars = useDJStore((s) => s.autoDJTransitionBars);
  const shuffle = useDJStore((s) => s.autoDJShuffle);
  const withFilter = useDJStore((s) => s.autoDJWithFilter);
  const setConfig = useDJStore((s) => s.setAutoDJConfig);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const trackCount = (activePlaylist == null ? void 0 : activePlaylist.tracks.length) ?? 0;
  const currentTrack = activePlaylist == null ? void 0 : activePlaylist.tracks[currentIdx];
  const [paused, setPaused] = reactExports.useState(false);
  const handleToggle = reactExports.useCallback(async () => {
    if (enabled) {
      disableAutoDJ();
      setPaused(false);
    } else {
      const error = await enableAutoDJ(0);
      if (error) {
        useUIStore.getState().setStatusMessage(`Auto DJ: ${error}`, false, 4e3);
      } else {
        setPaused(false);
        onClose == null ? void 0 : onClose();
      }
    }
  }, [enabled, onClose]);
  const handlePauseResume = reactExports.useCallback(() => {
    if (paused) {
      resumeAutoDJ();
      setPaused(false);
    } else {
      pauseAutoDJ();
      setPaused(true);
    }
  }, [paused]);
  const handleSkip = reactExports.useCallback(async () => {
    setPaused(false);
    await skipAutoDJ();
  }, []);
  const handlePlayFromHere = reactExports.useCallback(async (index) => {
    setPaused(false);
    await playAutoDJFromIndex(index);
  }, []);
  const [analysisProgress, setAnalysisProgress] = reactExports.useState(null);
  const analyzingRef = reactExports.useRef(false);
  const needsAnalysis = activePlaylist ? playlistNeedsAnalysis(activePlaylist) : false;
  const analyzedCount = activePlaylist ? activePlaylist.tracks.filter((t) => t.bpm > 0 && t.musicalKey).length : 0;
  const skippedCount = activePlaylist ? activePlaylist.tracks.filter((t) => t.analysisSkipped).length : 0;
  const pendingCount = trackCount - analyzedCount - skippedCount;
  const [fixDialog, setFixDialog] = reactExports.useState(null);
  const handleFixNeeded = reactExports.useCallback(
    (trackName, originalPath, candidates) => {
      return new Promise((resolve) => {
        setFixDialog({ trackName, originalPath, candidates, resolve });
      });
    },
    []
  );
  const handleAnalyze = reactExports.useCallback(async () => {
    if (!activePlaylistId) return;
    analyzingRef.current = false;
    setFixDialog(null);
    analyzingRef.current = true;
    setAnalysisProgress({ current: 0, total: 1, analyzed: 0, failed: 0, trackName: "Starting...", status: "analyzing" });
    try {
      await analyzePlaylist(
        activePlaylistId,
        (p) => setAnalysisProgress({ ...p }),
        handleFixNeeded
      );
    } finally {
      analyzingRef.current = false;
      setAnalysisProgress(null);
    }
  }, [activePlaylistId, handleFixNeeded]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgSecondary border border-dark-borderLight rounded-lg p-3 text-xs font-mono", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `w-2 h-2 rounded-full ${STATUS_COLORS[status]}` }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 148,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary font-bold uppercase tracking-wider", children: "Auto DJ" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 149,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-tertiary", children: STATUS_LABELS[status] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 150,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 147,
        columnNumber: 9
      }, void 0),
      onClose && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: onClose,
          className: "text-text-tertiary hover:text-text-primary transition-colors",
          children: "X"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 153,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 146,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handleToggle,
          disabled: !activePlaylist || trackCount < 2,
          className: `px-3 py-2 rounded-md font-bold uppercase tracking-wider transition-all border ${enabled ? "bg-green-600 border-green-500 text-white hover:bg-green-700" : activePlaylist && trackCount >= 2 ? "bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:bg-dark-bgHover hover:text-text-primary" : "bg-dark-bgTertiary border-dark-borderLight text-text-tertiary cursor-not-allowed opacity-50"}`,
          children: enabled ? "Stop Auto DJ" : "Start Auto DJ"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 164,
          columnNumber: 9
        },
        void 0
      ),
      enabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handlePauseResume,
            className: `px-3 py-2 rounded-md border transition-all ${paused ? "border-amber-500 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40" : "border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
            title: paused ? "Resume auto transitions" : "Pause auto transitions",
            children: paused ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 188,
              columnNumber: 25
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Pause, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 188,
              columnNumber: 46
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 179,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: handleSkip,
            className: "px-3 py-2 rounded-md border border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-all",
            title: "Skip to next track",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SkipForward, { size: 14 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 195,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 190,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 178,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 163,
      columnNumber: 7
    }, void 0),
    (!activePlaylist || trackCount < 2) && !enabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-yellow-500/80 text-center py-1 mb-2", children: "Select a playlist with 2+ tracks" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 203,
      columnNumber: 9
    }, void 0),
    activePlaylist && trackCount >= 2 && !enabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-3", children: analysisProgress ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between text-[10px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-cyan-400", children: [
          analysisProgress.current,
          "/",
          analysisProgress.total
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 214,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-400 ml-1", children: [
          analysisProgress.analyzed,
          " ok"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 215,
          columnNumber: 17
        }, void 0),
        analysisProgress.failed > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-red-400 ml-1", children: [
          analysisProgress.failed,
          " fail"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 216,
          columnNumber: 49
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-tertiary truncate ml-2 flex-1 text-right", children: analysisProgress.trackName }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 217,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 213,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-1 bg-dark-bgTertiary rounded-full overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "h-full bg-cyan-500 transition-all duration-300",
          style: { width: `${analysisProgress.current / analysisProgress.total * 100}%` }
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 220,
          columnNumber: 17
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 219,
        columnNumber: 15
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 212,
      columnNumber: 13
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1.5", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-[10px]", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-400", children: [
          analyzedCount,
          " analyzed"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 230,
          columnNumber: 17
        }, void 0),
        skippedCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-red-400/60", children: [
          skippedCount,
          " skipped"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 231,
          columnNumber: 38
        }, void 0),
        pendingCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-yellow-400", children: [
          pendingCount,
          " pending"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 232,
          columnNumber: 38
        }, void 0),
        !needsAnalysis && pendingCount === 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-500/80 ml-auto", children: "Ready" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 234,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 229,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-1 bg-dark-bgTertiary rounded-full overflow-hidden flex", children: [
        analyzedCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full bg-green-500", style: { width: `${analyzedCount / trackCount * 100}%` } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 240,
          columnNumber: 19
        }, void 0),
        skippedCount > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full bg-red-500/40", style: { width: `${skippedCount / trackCount * 100}%` } }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 243,
          columnNumber: 19
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 238,
        columnNumber: 15
      }, void 0),
      needsAnalysis && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: handleAnalyze,
          className: "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-700 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 transition-all text-[10px]",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 10 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 252,
              columnNumber: 19
            }, void 0),
            "Analyze (",
            pendingCount,
            " tracks)"
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 248,
          columnNumber: 17
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 227,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 210,
      columnNumber: 9
    }, void 0),
    enabled && activePlaylist && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 mb-3 text-[10px]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-green-400 w-8 flex-shrink-0", children: "NOW" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 266,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-primary truncate flex-1", children: (currentTrack == null ? void 0 : currentTrack.trackName) ?? "—" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 267,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-tertiary flex-shrink-0", children: [
          currentIdx + 1,
          "/",
          trackCount
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 270,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 265,
        columnNumber: 11
      }, void 0),
      Array.from({ length: Math.min(4, trackCount - currentIdx - 1) }, (_, i) => {
        const idx = (currentIdx + 1 + i) % trackCount;
        const track = activePlaylist.tracks[idx];
        const isNext = idx === nextIdx;
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 group", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `w-8 flex-shrink-0 ${isNext ? "text-blue-400" : "text-text-tertiary"}`, children: isNext ? "NEXT" : `${idx + 1}` }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 279,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `truncate flex-1 ${isNext ? "text-text-secondary" : "text-text-tertiary"}`, children: (track == null ? void 0 : track.trackName) ?? "—" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 282,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => handlePlayFromHere(idx),
              className: "opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded border border-dark-borderLight\n                             text-accent-primary hover:bg-accent-primary/10 transition-all flex-shrink-0",
              title: `Play from "${track == null ? void 0 : track.trackName}"`,
              children: "Play"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 285,
              columnNumber: 17
            },
            void 0
          )
        ] }, idx, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 278,
          columnNumber: 15
        }, void 0);
      }),
      paused && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-amber-400/80 text-center py-0.5 text-[9px] uppercase tracking-wider", children: "Paused — transitions stopped" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 297,
        columnNumber: 13
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 263,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-tertiary mr-1", children: "Bars:" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 308,
          columnNumber: 11
        }, void 0),
        TRANSITION_BAR_OPTIONS.map((bars) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setConfig({ transitionBars: bars }),
            className: `px-2 py-1 rounded text-[10px] border transition-all ${transitionBars === bars ? "border-accent-primary bg-accent-primary/20 text-accent-primary" : "border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary"}`,
            children: bars
          },
          bars,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 310,
            columnNumber: 13
          },
          void 0
        ))
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 307,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 324,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setConfig({ shuffle: !shuffle }),
          className: `p-1.5 rounded border transition-all ${shuffle ? "border-amber-500 bg-amber-900/20 text-amber-400" : "border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary"}`,
          title: "Shuffle",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Shuffle, { size: 12 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 336,
            columnNumber: 11
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 327,
          columnNumber: 9
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setConfig({ withFilter: !withFilter }),
          className: `p-1.5 rounded border transition-all ${withFilter ? "border-cyan-500 bg-cyan-900/20 text-cyan-400" : "border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-text-secondary"}`,
          title: "HPF sweep on outgoing track",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SlidersHorizontal, { size: 12 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
            lineNumber: 349,
            columnNumber: 11
          }, void 0)
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 340,
          columnNumber: 9
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 305,
      columnNumber: 7
    }, void 0),
    fixDialog && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-3 border border-amber-700 bg-amber-900/10 rounded-md p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-amber-400 mb-1.5 font-bold", children: [
        '404: "',
        fixDialog.trackName,
        '" not found'
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 356,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[9px] text-text-tertiary mb-2 truncate", children: fixDialog.originalPath }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 359,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-1 max-h-32 overflow-y-auto", children: fixDialog.candidates.map((c, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => {
            fixDialog.resolve(c.full_path);
            setFixDialog(null);
          },
          className: "w-full text-left px-2 py-1 rounded text-[10px] border border-dark-borderLight bg-dark-bgTertiary hover:bg-dark-bgHover hover:border-amber-600 transition-all",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary truncate", children: c.filename }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 369,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-tertiary truncate", children: [
              c.author,
              " / ",
              c.format
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
              lineNumber: 370,
              columnNumber: 17
            }, void 0)
          ]
        },
        i,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 364,
          columnNumber: 15
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
        lineNumber: 362,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => {
            fixDialog.resolve(null);
            setFixDialog(null);
          },
          className: "mt-1.5 w-full px-2 py-1 rounded text-[10px] border border-dark-borderLight bg-dark-bgTertiary text-text-tertiary hover:text-red-400 transition-all",
          children: "Skip this track"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
          lineNumber: 374,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
      lineNumber: 355,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJAutoDJPanel.tsx",
    lineNumber: 144,
    columnNumber: 5
  }, void 0);
};
function noteToFreq(note) {
  const midi = note + 11;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
class VocoderAutoTune {
  engine;
  timer = null;
  lastNote = 0;
  enabled = false;
  constructor(engine) {
    this.engine = engine;
  }
  start() {
    if (this.timer) return;
    this.enabled = true;
    this.timer = setInterval(() => this.tick(), 33);
    console.log("[AutoTune] Started — following melody from active deck");
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    console.log("[AutoTune] Stopped");
  }
  tick() {
    var _a, _b;
    const djEngine = getDJEngineIfActive();
    if (!djEngine) return;
    const s = useDJStore.getState();
    const aPlaying = s.decks.A.isPlaying;
    const bPlaying = s.decks.B.isPlaying;
    let deckId = "A";
    if (aPlaying && !bPlaying) deckId = "A";
    else if (bPlaying && !aPlaying) deckId = "B";
    else if (aPlaying && bPlaying) deckId = s.crossfaderPosition < 0.5 ? "A" : "B";
    const deck = djEngine.getDeck(deckId);
    const song = deck.replayer.getSong();
    if (!((_a = song == null ? void 0 : song.patterns) == null ? void 0 : _a.length) || !((_b = song.songPositions) == null ? void 0 : _b.length)) return;
    const deckState = s.decks[deckId];
    const patIdx = song.songPositions[deckState.songPos] ?? 0;
    const pattern = song.patterns[patIdx];
    if (!(pattern == null ? void 0 : pattern.channels)) return;
    const row = deckState.pattPos;
    let bestNote = 0;
    for (const ch of pattern.channels) {
      if (!ch.rows || row >= ch.rows.length) continue;
      const cell = ch.rows[row];
      if (cell && cell.note > 0 && cell.note < 97) {
        if (cell.note > bestNote) bestNote = cell.note;
      }
    }
    if (bestNote > 0 && bestNote !== this.lastNote) {
      this.lastNote = bestNote;
      const freq = noteToFreq(bestNote);
      const clamped = Math.max(65, Math.min(1e3, freq));
      this.engine.setCarrierFreq(clamped);
    }
  }
  dispose() {
    this.stop();
  }
}
const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_OPTIONS = ["major", "minor", "chromatic", "pentatonic", "blues"];
const DJVocoderControl = () => {
  const isActive = useVocoderStore((s) => s.isActive);
  const amplitude = useVocoderStore((s) => s.amplitude);
  const params = useVocoderStore((s) => s.params);
  const presetName = useVocoderStore((s) => s.presetName);
  const fxEnabled = useVocoderStore((s) => s.fx.enabled);
  const fxPreset = useVocoderStore((s) => s.fx.preset);
  const globalPTT = useVocoderStore((s) => s.pttActive);
  const [error, setError] = reactExports.useState(null);
  const [muted, setMuted] = reactExports.useState(false);
  const [duckingEnabled, setDuckingEnabled] = reactExports.useState(true);
  const [realTuneEnabled, setRealTuneEnabled] = reactExports.useState(false);
  const [tuneKey, setTuneKey] = reactExports.useState(0);
  const [tuneScale, setTuneScale] = reactExports.useState("major");
  const [followMelodyEnabled, setFollowMelodyEnabled] = reactExports.useState(true);
  const followMelodyRef = reactExports.useRef(null);
  const [devices, setDevices] = reactExports.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = reactExports.useState("");
  const engineRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    VocoderEngine.preload();
    return () => unregisterPTTHandlers();
  }, []);
  reactExports.useEffect(() => {
    var _a;
    const enumerate = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const inputs = allDevices.filter((d) => d.kind === "audioinput").map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Mic ${d.deviceId.slice(0, 8)}`
        }));
        setDevices(inputs);
        if (!selectedDeviceId && inputs.length > 0) {
          const real = inputs.find(
            (d) => !d.label.toLowerCase().includes("blackhole") && !d.label.toLowerCase().includes("virtual") && !d.label.toLowerCase().includes("loopback")
          );
          setSelectedDeviceId((real || inputs[0]).deviceId);
        }
      } catch {
      }
    };
    enumerate();
    (_a = navigator.mediaDevices) == null ? void 0 : _a.addEventListener("devicechange", enumerate);
    return () => {
      var _a2;
      (_a2 = navigator.mediaDevices) == null ? void 0 : _a2.removeEventListener("devicechange", enumerate);
    };
  }, [selectedDeviceId]);
  reactExports.useEffect(() => {
    return () => {
      var _a;
      (_a = engineRef.current) == null ? void 0 : _a.dispose();
      engineRef.current = null;
    };
  }, []);
  const ensureEngine = reactExports.useCallback(async () => {
    if (engineRef.current) return engineRef.current;
    try {
      setError(null);
      const djEngine = getDJEngineIfActive();
      const destination = djEngine == null ? void 0 : djEngine.mixer.samplerInput;
      const engine = new VocoderEngine(destination);
      await engine.start(selectedDeviceId || void 0);
      engineRef.current = engine;
      setMuted(true);
      engine.setMuted(true);
      if (followMelodyEnabled) {
        followMelodyRef.current = new VocoderAutoTune(engine);
        followMelodyRef.current.start();
      }
      if (realTuneEnabled) {
        engine.setRealAutoTuneEnabled(true, {
          key: tuneKey,
          scale: tuneScale,
          strength: 1,
          speed: 0.7
        });
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = allDevices.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` }));
      setDevices(inputs);
      return engine;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("Permission") || msg.includes("NotAllowed") ? "Mic blocked" : "Failed");
      console.error("[DJVocoderControl]", err);
      return null;
    }
  }, [selectedDeviceId]);
  const handleToggle = reactExports.useCallback(async () => {
    var _a;
    try {
      setError(null);
      if (!isActive) {
        const engine = await ensureEngine();
        if (!engine) return;
        engine.setVocoderBypass(false);
        useVocoderStore.getState().setActive(true);
      } else {
        (_a = engineRef.current) == null ? void 0 : _a.setVocoderBypass(true);
        useVocoderStore.getState().setActive(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setError("Mic blocked");
      } else {
        setError("Failed");
      }
      console.error("[DJVocoderControl]", err);
    }
  }, [isActive, selectedDeviceId]);
  const handleDeviceChange = reactExports.useCallback(async (deviceId) => {
    var _a;
    setSelectedDeviceId(deviceId);
    if ((_a = engineRef.current) == null ? void 0 : _a.isActive) {
      engineRef.current.stop();
      try {
        const djEngine = getDJEngineIfActive();
        const destination = djEngine == null ? void 0 : djEngine.mixer.samplerInput;
        const engine = new VocoderEngine(destination);
        await engine.start(deviceId || void 0);
        engineRef.current = engine;
      } catch (err) {
        console.error("[DJVocoderControl] Device switch failed:", err);
        setError("Switch failed");
      }
    }
  }, []);
  const handlePTTDown = reactExports.useCallback(async () => {
    var _a;
    let engine = engineRef.current;
    if (!engine) {
      engine = await ensureEngine();
      if (!engine) return;
    }
    if (!isActive || engine.isBypassed) {
      engine.setVocoderBypass(false);
      useVocoderStore.getState().setActive(true);
    }
    setMuted(false);
    engine.setMuted(false);
    if (duckingEnabled) {
      try {
        (_a = getDJEngineIfActive()) == null ? void 0 : _a.mixer.duck();
      } catch {
      }
    }
  }, [ensureEngine, isActive, duckingEnabled]);
  const handlePTTUp = reactExports.useCallback(() => {
    var _a;
    if (!engineRef.current) return;
    setMuted(true);
    engineRef.current.setMuted(true);
    if (duckingEnabled) {
      try {
        (_a = getDJEngineIfActive()) == null ? void 0 : _a.mixer.unduck();
      } catch {
      }
    }
  }, [duckingEnabled]);
  reactExports.useEffect(() => {
    registerPTTHandlers(handlePTTDown, handlePTTUp);
  }, [handlePTTDown, handlePTTUp]);
  const handleFormantShift = reactExports.useCallback((e) => {
    var _a;
    const shift = parseFloat(e.target.value);
    useVocoderStore.getState().setParam("formantShift", shift);
    (_a = engineRef.current) == null ? void 0 : _a.setFormantShift(shift);
  }, []);
  const handleWet = reactExports.useCallback((e) => {
    var _a;
    const wet = parseFloat(e.target.value);
    useVocoderStore.getState().setParam("wet", wet);
    (_a = engineRef.current) == null ? void 0 : _a.setWet(wet);
  }, []);
  const handlePresetChange = reactExports.useCallback((name) => {
    if (engineRef.current) {
      engineRef.current.loadPreset(name);
    } else {
      useVocoderStore.getState().loadPreset(name);
    }
  }, []);
  const handleFollowMelodyToggle = reactExports.useCallback(() => {
    var _a;
    const next = !followMelodyEnabled;
    setFollowMelodyEnabled(next);
    if (next && engineRef.current) {
      if (!followMelodyRef.current) {
        followMelodyRef.current = new VocoderAutoTune(engineRef.current);
      }
      followMelodyRef.current.start();
    } else {
      (_a = followMelodyRef.current) == null ? void 0 : _a.stop();
    }
  }, [followMelodyEnabled]);
  const handleRealTuneToggle = reactExports.useCallback(() => {
    var _a;
    const next = !realTuneEnabled;
    setRealTuneEnabled(next);
    (_a = engineRef.current) == null ? void 0 : _a.setRealAutoTuneEnabled(next, {
      key: tuneKey,
      scale: tuneScale,
      strength: 1,
      speed: 0.7
    });
  }, [realTuneEnabled, tuneKey, tuneScale]);
  const handleTuneKeyChange = reactExports.useCallback((v) => {
    var _a;
    const k = parseInt(v, 10);
    setTuneKey(k);
    (_a = engineRef.current) == null ? void 0 : _a.setAutoTuneKey(k);
  }, []);
  const handleTuneScaleChange = reactExports.useCallback((v) => {
    var _a;
    const s = v;
    setTuneScale(s);
    (_a = engineRef.current) == null ? void 0 : _a.setAutoTuneScale(s);
  }, []);
  const handleFXToggle = reactExports.useCallback(() => {
    var _a;
    const next = !fxEnabled;
    useVocoderStore.getState().setFXEnabled(next);
    (_a = engineRef.current) == null ? void 0 : _a.applyFX(useVocoderStore.getState().fx);
  }, [fxEnabled]);
  const handleFXPresetChange = reactExports.useCallback((v) => {
    var _a;
    const preset = v;
    useVocoderStore.getState().loadFXPreset(preset);
    (_a = engineRef.current) == null ? void 0 : _a.applyFX(useVocoderStore.getState().fx);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1.5 flex-wrap", children: [
    devices.length > 1 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      CustomSelect,
      {
        value: selectedDeviceId,
        onChange: handleDeviceChange,
        options: devices.map((d) => ({
          value: d.deviceId,
          label: d.label
        })),
        className: "px-1.5 py-1 text-xs rounded border border-dark-border bg-dark-bgTertiary text-dark-textSecondary max-w-[140px]",
        title: "Select microphone input"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 285,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onPointerDown: handlePTTDown,
        onPointerUp: handlePTTUp,
        onPointerLeave: handlePTTUp,
        className: `
          px-2 py-1 rounded text-[10px] font-bold transition-all select-none touch-none
          ${!muted || globalPTT ? "bg-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted"}
        `,
        title: "Hold to talk (or press Space) — release to let echo ring out",
        children: "TALK"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 299,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleToggle,
        className: `
          px-2 py-1 rounded text-xs font-bold transition-all relative overflow-hidden
          ${isActive ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted"}
        `,
        title: isActive ? "Switch to clean mic" : "Enable robot voice",
        children: [
          isActive && !muted && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "span",
            {
              className: "absolute inset-0 bg-purple-400 rounded pointer-events-none",
              style: { opacity: amplitude * 0.5 }
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
              lineNumber: 328,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "relative", children: "VOCODER" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 333,
            columnNumber: 9
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 316,
        columnNumber: 7
      },
      void 0
    ),
    engineRef.current && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "w-8 h-2 bg-dark-bgTertiary rounded-sm overflow-hidden",
        title: `Level: ${Math.round(amplitude * 100)}%`,
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: `h-full transition-[width] duration-75 ${isActive ? "bg-purple-500" : "bg-green-500"}`,
            style: { width: `${Math.min(100, (muted ? 0 : amplitude) * 300)}%` }
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 342,
            columnNumber: 11
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 338,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 border-l border-dark-borderLight pl-1.5 ml-0.5", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-0.5 cursor-pointer", title: "Duck music volume while talking", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: duckingEnabled,
            onChange: () => setDuckingEnabled(!duckingEnabled),
            className: "w-3 h-3 accent-amber-500"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 352,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "Duck" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 358,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 351,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-0.5 cursor-pointer", title: "Real pitch-correction autotune (YIN + scale snap) on the vocoder output", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: realTuneEnabled,
            onChange: handleRealTuneToggle,
            className: "w-3 h-3 accent-pink-500"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 361,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "Tune" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 367,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 360,
        columnNumber: 9
      }, void 0),
      realTuneEnabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: String(tuneKey),
            onChange: handleTuneKeyChange,
            options: KEY_NAMES.map((name, i) => ({
              value: String(i),
              label: name
            })),
            className: "px-1 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bgTertiary text-pink-400",
            title: "Autotune key"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 371,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          CustomSelect,
          {
            value: tuneScale,
            onChange: handleTuneScaleChange,
            options: SCALE_OPTIONS.map((s) => ({
              value: s,
              label: s
            })),
            className: "px-1 py-0.5 text-[10px] rounded border border-dark-border bg-dark-bgTertiary text-pink-400",
            title: "Autotune scale"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 381,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 370,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-0.5 cursor-pointer", title: "Follow Melody — drive the vocoder carrier from the active deck's pattern data", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: followMelodyEnabled,
            onChange: handleFollowMelodyToggle,
            className: "w-3 h-3 accent-pink-500"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 394,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "Melody" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 400,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 393,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
      lineNumber: 350,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 border-l border-dark-borderLight pl-1.5 ml-0.5", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-0.5 cursor-pointer", title: "Enable mic effects (echo/reverb)", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "checkbox",
            checked: fxEnabled,
            onChange: handleFXToggle,
            className: "w-3 h-3 accent-cyan-500"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
            lineNumber: 405,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[9px] text-text-muted", children: "FX" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 411,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
        lineNumber: 404,
        columnNumber: 9
      }, void 0),
      fxEnabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: fxPreset,
          onChange: handleFXPresetChange,
          options: Object.keys(VOCODER_FX_PRESETS).map((name) => ({
            value: name,
            label: name === "none" ? "Dry" : name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
          })),
          className: "px-1.5 py-1 text-xs rounded border border-dark-border bg-dark-bgTertiary text-cyan-400",
          title: "Effect preset"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 414,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
      lineNumber: 403,
      columnNumber: 7
    }, void 0),
    isActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: presetName || "",
          onChange: handlePresetChange,
          options: [
            ...!presetName ? [{ value: "", label: "Custom" }] : [],
            ...VOCODER_PRESETS.map((p) => ({
              value: p.name,
              label: p.name
            }))
          ],
          className: "px-1.5 py-1 text-xs rounded border border-dark-border bg-dark-bgTertiary text-dark-textSecondary",
          title: "Vocoder voice preset"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 430,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: "0.25",
          max: "4.0",
          step: "0.05",
          value: params.formantShift,
          onChange: handleFormantShift,
          className: "w-12 h-1 accent-purple-500",
          title: `Formant: ${params.formantShift.toFixed(2)}x`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 443,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "range",
          min: "0",
          max: "1",
          step: "0.01",
          value: params.wet,
          onChange: handleWet,
          className: "w-12 h-1 accent-purple-500",
          title: `Wet: ${Math.round(params.wet * 100)}%`
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
          lineNumber: 449,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
      lineNumber: 429,
      columnNumber: 9
    }, void 0),
    error && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-red-400", children: error }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
      lineNumber: 458,
      columnNumber: 17
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJVocoderControl.tsx",
    lineNumber: 282,
    columnNumber: 5
  }, void 0);
};
var browser = {};
var canPromise;
var hasRequiredCanPromise;
function requireCanPromise() {
  if (hasRequiredCanPromise) return canPromise;
  hasRequiredCanPromise = 1;
  canPromise = function() {
    return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
  };
  return canPromise;
}
var qrcode = {};
var utils$1 = {};
var hasRequiredUtils$1;
function requireUtils$1() {
  if (hasRequiredUtils$1) return utils$1;
  hasRequiredUtils$1 = 1;
  let toSJISFunction;
  const CODEWORDS_COUNT = [
    0,
    // Not used
    26,
    44,
    70,
    100,
    134,
    172,
    196,
    242,
    292,
    346,
    404,
    466,
    532,
    581,
    655,
    733,
    815,
    901,
    991,
    1085,
    1156,
    1258,
    1364,
    1474,
    1588,
    1706,
    1828,
    1921,
    2051,
    2185,
    2323,
    2465,
    2611,
    2761,
    2876,
    3034,
    3196,
    3362,
    3532,
    3706
  ];
  utils$1.getSymbolSize = function getSymbolSize(version2) {
    if (!version2) throw new Error('"version" cannot be null or undefined');
    if (version2 < 1 || version2 > 40) throw new Error('"version" should be in range from 1 to 40');
    return version2 * 4 + 17;
  };
  utils$1.getSymbolTotalCodewords = function getSymbolTotalCodewords(version2) {
    return CODEWORDS_COUNT[version2];
  };
  utils$1.getBCHDigit = function(data) {
    let digit = 0;
    while (data !== 0) {
      digit++;
      data >>>= 1;
    }
    return digit;
  };
  utils$1.setToSJISFunction = function setToSJISFunction(f) {
    if (typeof f !== "function") {
      throw new Error('"toSJISFunc" is not a valid function.');
    }
    toSJISFunction = f;
  };
  utils$1.isKanjiModeEnabled = function() {
    return typeof toSJISFunction !== "undefined";
  };
  utils$1.toSJIS = function toSJIS(kanji) {
    return toSJISFunction(kanji);
  };
  return utils$1;
}
var errorCorrectionLevel = {};
var hasRequiredErrorCorrectionLevel;
function requireErrorCorrectionLevel() {
  if (hasRequiredErrorCorrectionLevel) return errorCorrectionLevel;
  hasRequiredErrorCorrectionLevel = 1;
  (function(exports$1) {
    exports$1.L = { bit: 1 };
    exports$1.M = { bit: 0 };
    exports$1.Q = { bit: 3 };
    exports$1.H = { bit: 2 };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "l":
        case "low":
          return exports$1.L;
        case "m":
        case "medium":
          return exports$1.M;
        case "q":
        case "quartile":
          return exports$1.Q;
        case "h":
        case "high":
          return exports$1.H;
        default:
          throw new Error("Unknown EC Level: " + string);
      }
    }
    exports$1.isValid = function isValid(level) {
      return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
    };
    exports$1.from = function from(value, defaultValue) {
      if (exports$1.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  })(errorCorrectionLevel);
  return errorCorrectionLevel;
}
var bitBuffer;
var hasRequiredBitBuffer;
function requireBitBuffer() {
  if (hasRequiredBitBuffer) return bitBuffer;
  hasRequiredBitBuffer = 1;
  function BitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  BitBuffer.prototype = {
    get: function(index) {
      const bufIndex = Math.floor(index / 8);
      return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
    },
    put: function(num, length) {
      for (let i = 0; i < length; i++) {
        this.putBit((num >>> length - i - 1 & 1) === 1);
      }
    },
    getLengthInBits: function() {
      return this.length;
    },
    putBit: function(bit) {
      const bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) {
        this.buffer.push(0);
      }
      if (bit) {
        this.buffer[bufIndex] |= 128 >>> this.length % 8;
      }
      this.length++;
    }
  };
  bitBuffer = BitBuffer;
  return bitBuffer;
}
var bitMatrix;
var hasRequiredBitMatrix;
function requireBitMatrix() {
  if (hasRequiredBitMatrix) return bitMatrix;
  hasRequiredBitMatrix = 1;
  function BitMatrix(size) {
    if (!size || size < 1) {
      throw new Error("BitMatrix size must be defined and greater than 0");
    }
    this.size = size;
    this.data = new Uint8Array(size * size);
    this.reservedBit = new Uint8Array(size * size);
  }
  BitMatrix.prototype.set = function(row, col, value, reserved) {
    const index = row * this.size + col;
    this.data[index] = value;
    if (reserved) this.reservedBit[index] = true;
  };
  BitMatrix.prototype.get = function(row, col) {
    return this.data[row * this.size + col];
  };
  BitMatrix.prototype.xor = function(row, col, value) {
    this.data[row * this.size + col] ^= value;
  };
  BitMatrix.prototype.isReserved = function(row, col) {
    return this.reservedBit[row * this.size + col];
  };
  bitMatrix = BitMatrix;
  return bitMatrix;
}
var alignmentPattern = {};
var hasRequiredAlignmentPattern;
function requireAlignmentPattern() {
  if (hasRequiredAlignmentPattern) return alignmentPattern;
  hasRequiredAlignmentPattern = 1;
  (function(exports$1) {
    const getSymbolSize = requireUtils$1().getSymbolSize;
    exports$1.getRowColCoords = function getRowColCoords(version2) {
      if (version2 === 1) return [];
      const posCount = Math.floor(version2 / 7) + 2;
      const size = getSymbolSize(version2);
      const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
      const positions = [size - 7];
      for (let i = 1; i < posCount - 1; i++) {
        positions[i] = positions[i - 1] - intervals;
      }
      positions.push(6);
      return positions.reverse();
    };
    exports$1.getPositions = function getPositions(version2) {
      const coords = [];
      const pos = exports$1.getRowColCoords(version2);
      const posLength = pos.length;
      for (let i = 0; i < posLength; i++) {
        for (let j = 0; j < posLength; j++) {
          if (i === 0 && j === 0 || // top-left
          i === 0 && j === posLength - 1 || // bottom-left
          i === posLength - 1 && j === 0) {
            continue;
          }
          coords.push([pos[i], pos[j]]);
        }
      }
      return coords;
    };
  })(alignmentPattern);
  return alignmentPattern;
}
var finderPattern = {};
var hasRequiredFinderPattern;
function requireFinderPattern() {
  if (hasRequiredFinderPattern) return finderPattern;
  hasRequiredFinderPattern = 1;
  const getSymbolSize = requireUtils$1().getSymbolSize;
  const FINDER_PATTERN_SIZE = 7;
  finderPattern.getPositions = function getPositions(version2) {
    const size = getSymbolSize(version2);
    return [
      // top-left
      [0, 0],
      // top-right
      [size - FINDER_PATTERN_SIZE, 0],
      // bottom-left
      [0, size - FINDER_PATTERN_SIZE]
    ];
  };
  return finderPattern;
}
var maskPattern = {};
var hasRequiredMaskPattern;
function requireMaskPattern() {
  if (hasRequiredMaskPattern) return maskPattern;
  hasRequiredMaskPattern = 1;
  (function(exports$1) {
    exports$1.Patterns = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
    const PenaltyScores = {
      N1: 3,
      N2: 3,
      N3: 40,
      N4: 10
    };
    exports$1.isValid = function isValid(mask) {
      return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
    };
    exports$1.from = function from(value) {
      return exports$1.isValid(value) ? parseInt(value, 10) : void 0;
    };
    exports$1.getPenaltyN1 = function getPenaltyN1(data) {
      const size = data.size;
      let points = 0;
      let sameCountCol = 0;
      let sameCountRow = 0;
      let lastCol = null;
      let lastRow = null;
      for (let row = 0; row < size; row++) {
        sameCountCol = sameCountRow = 0;
        lastCol = lastRow = null;
        for (let col = 0; col < size; col++) {
          let module = data.get(row, col);
          if (module === lastCol) {
            sameCountCol++;
          } else {
            if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
            lastCol = module;
            sameCountCol = 1;
          }
          module = data.get(col, row);
          if (module === lastRow) {
            sameCountRow++;
          } else {
            if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
            lastRow = module;
            sameCountRow = 1;
          }
        }
        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
      }
      return points;
    };
    exports$1.getPenaltyN2 = function getPenaltyN2(data) {
      const size = data.size;
      let points = 0;
      for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
          const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
          if (last === 4 || last === 0) points++;
        }
      }
      return points * PenaltyScores.N2;
    };
    exports$1.getPenaltyN3 = function getPenaltyN3(data) {
      const size = data.size;
      let points = 0;
      let bitsCol = 0;
      let bitsRow = 0;
      for (let row = 0; row < size; row++) {
        bitsCol = bitsRow = 0;
        for (let col = 0; col < size; col++) {
          bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
          if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
          bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
          if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
        }
      }
      return points * PenaltyScores.N3;
    };
    exports$1.getPenaltyN4 = function getPenaltyN4(data) {
      let darkCount = 0;
      const modulesCount = data.data.length;
      for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
      const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
      return k * PenaltyScores.N4;
    };
    function getMaskAt(maskPattern2, i, j) {
      switch (maskPattern2) {
        case exports$1.Patterns.PATTERN000:
          return (i + j) % 2 === 0;
        case exports$1.Patterns.PATTERN001:
          return i % 2 === 0;
        case exports$1.Patterns.PATTERN010:
          return j % 3 === 0;
        case exports$1.Patterns.PATTERN011:
          return (i + j) % 3 === 0;
        case exports$1.Patterns.PATTERN100:
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case exports$1.Patterns.PATTERN101:
          return i * j % 2 + i * j % 3 === 0;
        case exports$1.Patterns.PATTERN110:
          return (i * j % 2 + i * j % 3) % 2 === 0;
        case exports$1.Patterns.PATTERN111:
          return (i * j % 3 + (i + j) % 2) % 2 === 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern2);
      }
    }
    exports$1.applyMask = function applyMask(pattern, data) {
      const size = data.size;
      for (let col = 0; col < size; col++) {
        for (let row = 0; row < size; row++) {
          if (data.isReserved(row, col)) continue;
          data.xor(row, col, getMaskAt(pattern, row, col));
        }
      }
    };
    exports$1.getBestMask = function getBestMask(data, setupFormatFunc) {
      const numPatterns = Object.keys(exports$1.Patterns).length;
      let bestPattern = 0;
      let lowerPenalty = Infinity;
      for (let p = 0; p < numPatterns; p++) {
        setupFormatFunc(p);
        exports$1.applyMask(p, data);
        const penalty = exports$1.getPenaltyN1(data) + exports$1.getPenaltyN2(data) + exports$1.getPenaltyN3(data) + exports$1.getPenaltyN4(data);
        exports$1.applyMask(p, data);
        if (penalty < lowerPenalty) {
          lowerPenalty = penalty;
          bestPattern = p;
        }
      }
      return bestPattern;
    };
  })(maskPattern);
  return maskPattern;
}
var errorCorrectionCode = {};
var hasRequiredErrorCorrectionCode;
function requireErrorCorrectionCode() {
  if (hasRequiredErrorCorrectionCode) return errorCorrectionCode;
  hasRequiredErrorCorrectionCode = 1;
  const ECLevel = requireErrorCorrectionLevel();
  const EC_BLOCKS_TABLE = [
    // L  M  Q  H
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    2,
    2,
    1,
    2,
    2,
    4,
    1,
    2,
    4,
    4,
    2,
    4,
    4,
    4,
    2,
    4,
    6,
    5,
    2,
    4,
    6,
    6,
    2,
    5,
    8,
    8,
    4,
    5,
    8,
    8,
    4,
    5,
    8,
    11,
    4,
    8,
    10,
    11,
    4,
    9,
    12,
    16,
    4,
    9,
    16,
    16,
    6,
    10,
    12,
    18,
    6,
    10,
    17,
    16,
    6,
    11,
    16,
    19,
    6,
    13,
    18,
    21,
    7,
    14,
    21,
    25,
    8,
    16,
    20,
    25,
    8,
    17,
    23,
    25,
    9,
    17,
    23,
    34,
    9,
    18,
    25,
    30,
    10,
    20,
    27,
    32,
    12,
    21,
    29,
    35,
    12,
    23,
    34,
    37,
    12,
    25,
    34,
    40,
    13,
    26,
    35,
    42,
    14,
    28,
    38,
    45,
    15,
    29,
    40,
    48,
    16,
    31,
    43,
    51,
    17,
    33,
    45,
    54,
    18,
    35,
    48,
    57,
    19,
    37,
    51,
    60,
    19,
    38,
    53,
    63,
    20,
    40,
    56,
    66,
    21,
    43,
    59,
    70,
    22,
    45,
    62,
    74,
    24,
    47,
    65,
    77,
    25,
    49,
    68,
    81
  ];
  const EC_CODEWORDS_TABLE = [
    // L  M  Q  H
    7,
    10,
    13,
    17,
    10,
    16,
    22,
    28,
    15,
    26,
    36,
    44,
    20,
    36,
    52,
    64,
    26,
    48,
    72,
    88,
    36,
    64,
    96,
    112,
    40,
    72,
    108,
    130,
    48,
    88,
    132,
    156,
    60,
    110,
    160,
    192,
    72,
    130,
    192,
    224,
    80,
    150,
    224,
    264,
    96,
    176,
    260,
    308,
    104,
    198,
    288,
    352,
    120,
    216,
    320,
    384,
    132,
    240,
    360,
    432,
    144,
    280,
    408,
    480,
    168,
    308,
    448,
    532,
    180,
    338,
    504,
    588,
    196,
    364,
    546,
    650,
    224,
    416,
    600,
    700,
    224,
    442,
    644,
    750,
    252,
    476,
    690,
    816,
    270,
    504,
    750,
    900,
    300,
    560,
    810,
    960,
    312,
    588,
    870,
    1050,
    336,
    644,
    952,
    1110,
    360,
    700,
    1020,
    1200,
    390,
    728,
    1050,
    1260,
    420,
    784,
    1140,
    1350,
    450,
    812,
    1200,
    1440,
    480,
    868,
    1290,
    1530,
    510,
    924,
    1350,
    1620,
    540,
    980,
    1440,
    1710,
    570,
    1036,
    1530,
    1800,
    570,
    1064,
    1590,
    1890,
    600,
    1120,
    1680,
    1980,
    630,
    1204,
    1770,
    2100,
    660,
    1260,
    1860,
    2220,
    720,
    1316,
    1950,
    2310,
    750,
    1372,
    2040,
    2430
  ];
  errorCorrectionCode.getBlocksCount = function getBlocksCount(version2, errorCorrectionLevel2) {
    switch (errorCorrectionLevel2) {
      case ECLevel.L:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 0];
      case ECLevel.M:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 1];
      case ECLevel.Q:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 2];
      case ECLevel.H:
        return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  errorCorrectionCode.getTotalCodewordsCount = function getTotalCodewordsCount(version2, errorCorrectionLevel2) {
    switch (errorCorrectionLevel2) {
      case ECLevel.L:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 0];
      case ECLevel.M:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 1];
      case ECLevel.Q:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 2];
      case ECLevel.H:
        return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  return errorCorrectionCode;
}
var polynomial = {};
var galoisField = {};
var hasRequiredGaloisField;
function requireGaloisField() {
  if (hasRequiredGaloisField) return galoisField;
  hasRequiredGaloisField = 1;
  const EXP_TABLE = new Uint8Array(512);
  const LOG_TABLE = new Uint8Array(256);
  (function initTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP_TABLE[i] = x;
      LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 256) {
        x ^= 285;
      }
    }
    for (let i = 255; i < 512; i++) {
      EXP_TABLE[i] = EXP_TABLE[i - 255];
    }
  })();
  galoisField.log = function log(n) {
    if (n < 1) throw new Error("log(" + n + ")");
    return LOG_TABLE[n];
  };
  galoisField.exp = function exp(n) {
    return EXP_TABLE[n];
  };
  galoisField.mul = function mul(x, y) {
    if (x === 0 || y === 0) return 0;
    return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
  };
  return galoisField;
}
var hasRequiredPolynomial;
function requirePolynomial() {
  if (hasRequiredPolynomial) return polynomial;
  hasRequiredPolynomial = 1;
  (function(exports$1) {
    const GF = requireGaloisField();
    exports$1.mul = function mul(p1, p2) {
      const coeff = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
          coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        }
      }
      return coeff;
    };
    exports$1.mod = function mod(divident, divisor) {
      let result = new Uint8Array(divident);
      while (result.length - divisor.length >= 0) {
        const coeff = result[0];
        for (let i = 0; i < divisor.length; i++) {
          result[i] ^= GF.mul(divisor[i], coeff);
        }
        let offset = 0;
        while (offset < result.length && result[offset] === 0) offset++;
        result = result.slice(offset);
      }
      return result;
    };
    exports$1.generateECPolynomial = function generateECPolynomial(degree) {
      let poly = new Uint8Array([1]);
      for (let i = 0; i < degree; i++) {
        poly = exports$1.mul(poly, new Uint8Array([1, GF.exp(i)]));
      }
      return poly;
    };
  })(polynomial);
  return polynomial;
}
var reedSolomonEncoder;
var hasRequiredReedSolomonEncoder;
function requireReedSolomonEncoder() {
  if (hasRequiredReedSolomonEncoder) return reedSolomonEncoder;
  hasRequiredReedSolomonEncoder = 1;
  const Polynomial = requirePolynomial();
  function ReedSolomonEncoder(degree) {
    this.genPoly = void 0;
    this.degree = degree;
    if (this.degree) this.initialize(this.degree);
  }
  ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
    this.degree = degree;
    this.genPoly = Polynomial.generateECPolynomial(this.degree);
  };
  ReedSolomonEncoder.prototype.encode = function encode(data) {
    if (!this.genPoly) {
      throw new Error("Encoder not initialized");
    }
    const paddedData = new Uint8Array(data.length + this.degree);
    paddedData.set(data);
    const remainder = Polynomial.mod(paddedData, this.genPoly);
    const start2 = this.degree - remainder.length;
    if (start2 > 0) {
      const buff = new Uint8Array(this.degree);
      buff.set(remainder, start2);
      return buff;
    }
    return remainder;
  };
  reedSolomonEncoder = ReedSolomonEncoder;
  return reedSolomonEncoder;
}
var version = {};
var mode = {};
var versionCheck = {};
var hasRequiredVersionCheck;
function requireVersionCheck() {
  if (hasRequiredVersionCheck) return versionCheck;
  hasRequiredVersionCheck = 1;
  versionCheck.isValid = function isValid(version2) {
    return !isNaN(version2) && version2 >= 1 && version2 <= 40;
  };
  return versionCheck;
}
var regex = {};
var hasRequiredRegex;
function requireRegex() {
  if (hasRequiredRegex) return regex;
  hasRequiredRegex = 1;
  const numeric = "[0-9]+";
  const alphanumeric = "[A-Z $%*+\\-./:]+";
  let kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
  kanji = kanji.replace(/u/g, "\\u");
  const byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
  regex.KANJI = new RegExp(kanji, "g");
  regex.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
  regex.BYTE = new RegExp(byte, "g");
  regex.NUMERIC = new RegExp(numeric, "g");
  regex.ALPHANUMERIC = new RegExp(alphanumeric, "g");
  const TEST_KANJI = new RegExp("^" + kanji + "$");
  const TEST_NUMERIC = new RegExp("^" + numeric + "$");
  const TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
  regex.testKanji = function testKanji(str) {
    return TEST_KANJI.test(str);
  };
  regex.testNumeric = function testNumeric(str) {
    return TEST_NUMERIC.test(str);
  };
  regex.testAlphanumeric = function testAlphanumeric(str) {
    return TEST_ALPHANUMERIC.test(str);
  };
  return regex;
}
var hasRequiredMode;
function requireMode() {
  if (hasRequiredMode) return mode;
  hasRequiredMode = 1;
  (function(exports$1) {
    const VersionCheck = requireVersionCheck();
    const Regex = requireRegex();
    exports$1.NUMERIC = {
      id: "Numeric",
      bit: 1 << 0,
      ccBits: [10, 12, 14]
    };
    exports$1.ALPHANUMERIC = {
      id: "Alphanumeric",
      bit: 1 << 1,
      ccBits: [9, 11, 13]
    };
    exports$1.BYTE = {
      id: "Byte",
      bit: 1 << 2,
      ccBits: [8, 16, 16]
    };
    exports$1.KANJI = {
      id: "Kanji",
      bit: 1 << 3,
      ccBits: [8, 10, 12]
    };
    exports$1.MIXED = {
      bit: -1
    };
    exports$1.getCharCountIndicator = function getCharCountIndicator(mode2, version2) {
      if (!mode2.ccBits) throw new Error("Invalid mode: " + mode2);
      if (!VersionCheck.isValid(version2)) {
        throw new Error("Invalid version: " + version2);
      }
      if (version2 >= 1 && version2 < 10) return mode2.ccBits[0];
      else if (version2 < 27) return mode2.ccBits[1];
      return mode2.ccBits[2];
    };
    exports$1.getBestModeForData = function getBestModeForData(dataStr) {
      if (Regex.testNumeric(dataStr)) return exports$1.NUMERIC;
      else if (Regex.testAlphanumeric(dataStr)) return exports$1.ALPHANUMERIC;
      else if (Regex.testKanji(dataStr)) return exports$1.KANJI;
      else return exports$1.BYTE;
    };
    exports$1.toString = function toString(mode2) {
      if (mode2 && mode2.id) return mode2.id;
      throw new Error("Invalid mode");
    };
    exports$1.isValid = function isValid(mode2) {
      return mode2 && mode2.bit && mode2.ccBits;
    };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "numeric":
          return exports$1.NUMERIC;
        case "alphanumeric":
          return exports$1.ALPHANUMERIC;
        case "kanji":
          return exports$1.KANJI;
        case "byte":
          return exports$1.BYTE;
        default:
          throw new Error("Unknown mode: " + string);
      }
    }
    exports$1.from = function from(value, defaultValue) {
      if (exports$1.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  })(mode);
  return mode;
}
var hasRequiredVersion;
function requireVersion() {
  if (hasRequiredVersion) return version;
  hasRequiredVersion = 1;
  (function(exports$1) {
    const Utils = requireUtils$1();
    const ECCode = requireErrorCorrectionCode();
    const ECLevel = requireErrorCorrectionLevel();
    const Mode = requireMode();
    const VersionCheck = requireVersionCheck();
    const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    const G18_BCH = Utils.getBCHDigit(G18);
    function getBestVersionForDataLength(mode2, length, errorCorrectionLevel2) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        if (length <= exports$1.getCapacity(currentVersion, errorCorrectionLevel2, mode2)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    function getReservedBitsCount(mode2, version2) {
      return Mode.getCharCountIndicator(mode2, version2) + 4;
    }
    function getTotalBitsFromDataArray(segments2, version2) {
      let totalBits = 0;
      segments2.forEach(function(data) {
        const reservedBits = getReservedBitsCount(data.mode, version2);
        totalBits += reservedBits + data.getBitsLength();
      });
      return totalBits;
    }
    function getBestVersionForMixedData(segments2, errorCorrectionLevel2) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        const length = getTotalBitsFromDataArray(segments2, currentVersion);
        if (length <= exports$1.getCapacity(currentVersion, errorCorrectionLevel2, Mode.MIXED)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    exports$1.from = function from(value, defaultValue) {
      if (VersionCheck.isValid(value)) {
        return parseInt(value, 10);
      }
      return defaultValue;
    };
    exports$1.getCapacity = function getCapacity(version2, errorCorrectionLevel2, mode2) {
      if (!VersionCheck.isValid(version2)) {
        throw new Error("Invalid QR Code version");
      }
      if (typeof mode2 === "undefined") mode2 = Mode.BYTE;
      const totalCodewords = Utils.getSymbolTotalCodewords(version2);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel2);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (mode2 === Mode.MIXED) return dataTotalCodewordsBits;
      const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode2, version2);
      switch (mode2) {
        case Mode.NUMERIC:
          return Math.floor(usableBits / 10 * 3);
        case Mode.ALPHANUMERIC:
          return Math.floor(usableBits / 11 * 2);
        case Mode.KANJI:
          return Math.floor(usableBits / 13);
        case Mode.BYTE:
        default:
          return Math.floor(usableBits / 8);
      }
    };
    exports$1.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel2) {
      let seg;
      const ecl = ECLevel.from(errorCorrectionLevel2, ECLevel.M);
      if (Array.isArray(data)) {
        if (data.length > 1) {
          return getBestVersionForMixedData(data, ecl);
        }
        if (data.length === 0) {
          return 1;
        }
        seg = data[0];
      } else {
        seg = data;
      }
      return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
    };
    exports$1.getEncodedBits = function getEncodedBits(version2) {
      if (!VersionCheck.isValid(version2) || version2 < 7) {
        throw new Error("Invalid QR Code version");
      }
      let d = version2 << 12;
      while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
        d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
      }
      return version2 << 12 | d;
    };
  })(version);
  return version;
}
var formatInfo = {};
var hasRequiredFormatInfo;
function requireFormatInfo() {
  if (hasRequiredFormatInfo) return formatInfo;
  hasRequiredFormatInfo = 1;
  const Utils = requireUtils$1();
  const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
  const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
  const G15_BCH = Utils.getBCHDigit(G15);
  formatInfo.getEncodedBits = function getEncodedBits(errorCorrectionLevel2, mask) {
    const data = errorCorrectionLevel2.bit << 3 | mask;
    let d = data << 10;
    while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
      d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
    }
    return (data << 10 | d) ^ G15_MASK;
  };
  return formatInfo;
}
var segments = {};
var numericData;
var hasRequiredNumericData;
function requireNumericData() {
  if (hasRequiredNumericData) return numericData;
  hasRequiredNumericData = 1;
  const Mode = requireMode();
  function NumericData(data) {
    this.mode = Mode.NUMERIC;
    this.data = data.toString();
  }
  NumericData.getBitsLength = function getBitsLength(length) {
    return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
  };
  NumericData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  NumericData.prototype.getBitsLength = function getBitsLength() {
    return NumericData.getBitsLength(this.data.length);
  };
  NumericData.prototype.write = function write(bitBuffer2) {
    let i, group, value;
    for (i = 0; i + 3 <= this.data.length; i += 3) {
      group = this.data.substr(i, 3);
      value = parseInt(group, 10);
      bitBuffer2.put(value, 10);
    }
    const remainingNum = this.data.length - i;
    if (remainingNum > 0) {
      group = this.data.substr(i);
      value = parseInt(group, 10);
      bitBuffer2.put(value, remainingNum * 3 + 1);
    }
  };
  numericData = NumericData;
  return numericData;
}
var alphanumericData;
var hasRequiredAlphanumericData;
function requireAlphanumericData() {
  if (hasRequiredAlphanumericData) return alphanumericData;
  hasRequiredAlphanumericData = 1;
  const Mode = requireMode();
  const ALPHA_NUM_CHARS = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    " ",
    "$",
    "%",
    "*",
    "+",
    "-",
    ".",
    "/",
    ":"
  ];
  function AlphanumericData(data) {
    this.mode = Mode.ALPHANUMERIC;
    this.data = data;
  }
  AlphanumericData.getBitsLength = function getBitsLength(length) {
    return 11 * Math.floor(length / 2) + 6 * (length % 2);
  };
  AlphanumericData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  AlphanumericData.prototype.getBitsLength = function getBitsLength() {
    return AlphanumericData.getBitsLength(this.data.length);
  };
  AlphanumericData.prototype.write = function write(bitBuffer2) {
    let i;
    for (i = 0; i + 2 <= this.data.length; i += 2) {
      let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
      value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
      bitBuffer2.put(value, 11);
    }
    if (this.data.length % 2) {
      bitBuffer2.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
    }
  };
  alphanumericData = AlphanumericData;
  return alphanumericData;
}
var byteData;
var hasRequiredByteData;
function requireByteData() {
  if (hasRequiredByteData) return byteData;
  hasRequiredByteData = 1;
  const Mode = requireMode();
  function ByteData(data) {
    this.mode = Mode.BYTE;
    if (typeof data === "string") {
      this.data = new TextEncoder().encode(data);
    } else {
      this.data = new Uint8Array(data);
    }
  }
  ByteData.getBitsLength = function getBitsLength(length) {
    return length * 8;
  };
  ByteData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  ByteData.prototype.getBitsLength = function getBitsLength() {
    return ByteData.getBitsLength(this.data.length);
  };
  ByteData.prototype.write = function(bitBuffer2) {
    for (let i = 0, l = this.data.length; i < l; i++) {
      bitBuffer2.put(this.data[i], 8);
    }
  };
  byteData = ByteData;
  return byteData;
}
var kanjiData;
var hasRequiredKanjiData;
function requireKanjiData() {
  if (hasRequiredKanjiData) return kanjiData;
  hasRequiredKanjiData = 1;
  const Mode = requireMode();
  const Utils = requireUtils$1();
  function KanjiData(data) {
    this.mode = Mode.KANJI;
    this.data = data;
  }
  KanjiData.getBitsLength = function getBitsLength(length) {
    return length * 13;
  };
  KanjiData.prototype.getLength = function getLength() {
    return this.data.length;
  };
  KanjiData.prototype.getBitsLength = function getBitsLength() {
    return KanjiData.getBitsLength(this.data.length);
  };
  KanjiData.prototype.write = function(bitBuffer2) {
    let i;
    for (i = 0; i < this.data.length; i++) {
      let value = Utils.toSJIS(this.data[i]);
      if (value >= 33088 && value <= 40956) {
        value -= 33088;
      } else if (value >= 57408 && value <= 60351) {
        value -= 49472;
      } else {
        throw new Error(
          "Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8"
        );
      }
      value = (value >>> 8 & 255) * 192 + (value & 255);
      bitBuffer2.put(value, 13);
    }
  };
  kanjiData = KanjiData;
  return kanjiData;
}
var dijkstra = { exports: {} };
var hasRequiredDijkstra;
function requireDijkstra() {
  if (hasRequiredDijkstra) return dijkstra.exports;
  hasRequiredDijkstra = 1;
  (function(module) {
    var dijkstra2 = {
      single_source_shortest_paths: function(graph, s, d) {
        var predecessors = {};
        var costs = {};
        costs[s] = 0;
        var open = dijkstra2.PriorityQueue.make();
        open.push(s, 0);
        var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
        while (!open.empty()) {
          closest = open.pop();
          u = closest.value;
          cost_of_s_to_u = closest.cost;
          adjacent_nodes = graph[u] || {};
          for (v in adjacent_nodes) {
            if (adjacent_nodes.hasOwnProperty(v)) {
              cost_of_e = adjacent_nodes[v];
              cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
              cost_of_s_to_v = costs[v];
              first_visit = typeof costs[v] === "undefined";
              if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                costs[v] = cost_of_s_to_u_plus_cost_of_e;
                open.push(v, cost_of_s_to_u_plus_cost_of_e);
                predecessors[v] = u;
              }
            }
          }
        }
        if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
          var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
          throw new Error(msg);
        }
        return predecessors;
      },
      extract_shortest_path_from_predecessor_list: function(predecessors, d) {
        var nodes = [];
        var u = d;
        while (u) {
          nodes.push(u);
          predecessors[u];
          u = predecessors[u];
        }
        nodes.reverse();
        return nodes;
      },
      find_path: function(graph, s, d) {
        var predecessors = dijkstra2.single_source_shortest_paths(graph, s, d);
        return dijkstra2.extract_shortest_path_from_predecessor_list(
          predecessors,
          d
        );
      },
      /**
       * A very naive priority queue implementation.
       */
      PriorityQueue: {
        make: function(opts) {
          var T = dijkstra2.PriorityQueue, t = {}, key;
          opts = opts || {};
          for (key in T) {
            if (T.hasOwnProperty(key)) {
              t[key] = T[key];
            }
          }
          t.queue = [];
          t.sorter = opts.sorter || T.default_sorter;
          return t;
        },
        default_sorter: function(a, b) {
          return a.cost - b.cost;
        },
        /**
         * Add a new item to the queue and ensure the highest priority element
         * is at the front of the queue.
         */
        push: function(value, cost) {
          var item = { value, cost };
          this.queue.push(item);
          this.queue.sort(this.sorter);
        },
        /**
         * Return the highest priority element in the queue.
         */
        pop: function() {
          return this.queue.shift();
        },
        empty: function() {
          return this.queue.length === 0;
        }
      }
    };
    {
      module.exports = dijkstra2;
    }
  })(dijkstra);
  return dijkstra.exports;
}
var hasRequiredSegments;
function requireSegments() {
  if (hasRequiredSegments) return segments;
  hasRequiredSegments = 1;
  (function(exports$1) {
    const Mode = requireMode();
    const NumericData = requireNumericData();
    const AlphanumericData = requireAlphanumericData();
    const ByteData = requireByteData();
    const KanjiData = requireKanjiData();
    const Regex = requireRegex();
    const Utils = requireUtils$1();
    const dijkstra2 = requireDijkstra();
    function getStringByteLength(str) {
      return unescape(encodeURIComponent(str)).length;
    }
    function getSegments(regex2, mode2, str) {
      const segments2 = [];
      let result;
      while ((result = regex2.exec(str)) !== null) {
        segments2.push({
          data: result[0],
          index: result.index,
          mode: mode2,
          length: result[0].length
        });
      }
      return segments2;
    }
    function getSegmentsFromString(dataStr) {
      const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
      const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
      let byteSegs;
      let kanjiSegs;
      if (Utils.isKanjiModeEnabled()) {
        byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
        kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
      } else {
        byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
        kanjiSegs = [];
      }
      const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
      return segs.sort(function(s1, s2) {
        return s1.index - s2.index;
      }).map(function(obj) {
        return {
          data: obj.data,
          mode: obj.mode,
          length: obj.length
        };
      });
    }
    function getSegmentBitsLength(length, mode2) {
      switch (mode2) {
        case Mode.NUMERIC:
          return NumericData.getBitsLength(length);
        case Mode.ALPHANUMERIC:
          return AlphanumericData.getBitsLength(length);
        case Mode.KANJI:
          return KanjiData.getBitsLength(length);
        case Mode.BYTE:
          return ByteData.getBitsLength(length);
      }
    }
    function mergeSegments(segs) {
      return segs.reduce(function(acc, curr) {
        const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
        if (prevSeg && prevSeg.mode === curr.mode) {
          acc[acc.length - 1].data += curr.data;
          return acc;
        }
        acc.push(curr);
        return acc;
      }, []);
    }
    function buildNodes(segs) {
      const nodes = [];
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        switch (seg.mode) {
          case Mode.NUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.ALPHANUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.KANJI:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
            break;
          case Mode.BYTE:
            nodes.push([
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
        }
      }
      return nodes;
    }
    function buildGraph(nodes, version2) {
      const table = {};
      const graph = { start: {} };
      let prevNodeIds = ["start"];
      for (let i = 0; i < nodes.length; i++) {
        const nodeGroup = nodes[i];
        const currentNodeIds = [];
        for (let j = 0; j < nodeGroup.length; j++) {
          const node = nodeGroup[j];
          const key = "" + i + j;
          currentNodeIds.push(key);
          table[key] = { node, lastCount: 0 };
          graph[key] = {};
          for (let n = 0; n < prevNodeIds.length; n++) {
            const prevNodeId = prevNodeIds[n];
            if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
              graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
              table[prevNodeId].lastCount += node.length;
            } else {
              if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
              graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version2);
            }
          }
        }
        prevNodeIds = currentNodeIds;
      }
      for (let n = 0; n < prevNodeIds.length; n++) {
        graph[prevNodeIds[n]].end = 0;
      }
      return { map: graph, table };
    }
    function buildSingleSegment(data, modesHint) {
      let mode2;
      const bestMode = Mode.getBestModeForData(data);
      mode2 = Mode.from(modesHint, bestMode);
      if (mode2 !== Mode.BYTE && mode2.bit < bestMode.bit) {
        throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode2) + ".\n Suggested mode is: " + Mode.toString(bestMode));
      }
      if (mode2 === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
        mode2 = Mode.BYTE;
      }
      switch (mode2) {
        case Mode.NUMERIC:
          return new NumericData(data);
        case Mode.ALPHANUMERIC:
          return new AlphanumericData(data);
        case Mode.KANJI:
          return new KanjiData(data);
        case Mode.BYTE:
          return new ByteData(data);
      }
    }
    exports$1.fromArray = function fromArray(array) {
      return array.reduce(function(acc, seg) {
        if (typeof seg === "string") {
          acc.push(buildSingleSegment(seg, null));
        } else if (seg.data) {
          acc.push(buildSingleSegment(seg.data, seg.mode));
        }
        return acc;
      }, []);
    };
    exports$1.fromString = function fromString(data, version2) {
      const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());
      const nodes = buildNodes(segs);
      const graph = buildGraph(nodes, version2);
      const path = dijkstra2.find_path(graph.map, "start", "end");
      const optimizedSegs = [];
      for (let i = 1; i < path.length - 1; i++) {
        optimizedSegs.push(graph.table[path[i]].node);
      }
      return exports$1.fromArray(mergeSegments(optimizedSegs));
    };
    exports$1.rawSplit = function rawSplit(data) {
      return exports$1.fromArray(
        getSegmentsFromString(data, Utils.isKanjiModeEnabled())
      );
    };
  })(segments);
  return segments;
}
var hasRequiredQrcode;
function requireQrcode() {
  if (hasRequiredQrcode) return qrcode;
  hasRequiredQrcode = 1;
  const Utils = requireUtils$1();
  const ECLevel = requireErrorCorrectionLevel();
  const BitBuffer = requireBitBuffer();
  const BitMatrix = requireBitMatrix();
  const AlignmentPattern = requireAlignmentPattern();
  const FinderPattern = requireFinderPattern();
  const MaskPattern = requireMaskPattern();
  const ECCode = requireErrorCorrectionCode();
  const ReedSolomonEncoder = requireReedSolomonEncoder();
  const Version = requireVersion();
  const FormatInfo = requireFormatInfo();
  const Mode = requireMode();
  const Segments = requireSegments();
  function setupFinderPattern(matrix, version2) {
    const size = matrix.size;
    const pos = FinderPattern.getPositions(version2);
    for (let i = 0; i < pos.length; i++) {
      const row = pos[i][0];
      const col = pos[i][1];
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || size <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || size <= col + c) continue;
          if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
            matrix.set(row + r, col + c, true, true);
          } else {
            matrix.set(row + r, col + c, false, true);
          }
        }
      }
    }
  }
  function setupTimingPattern(matrix) {
    const size = matrix.size;
    for (let r = 8; r < size - 8; r++) {
      const value = r % 2 === 0;
      matrix.set(r, 6, value, true);
      matrix.set(6, r, value, true);
    }
  }
  function setupAlignmentPattern(matrix, version2) {
    const pos = AlignmentPattern.getPositions(version2);
    for (let i = 0; i < pos.length; i++) {
      const row = pos[i][0];
      const col = pos[i][1];
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
            matrix.set(row + r, col + c, true, true);
          } else {
            matrix.set(row + r, col + c, false, true);
          }
        }
      }
    }
  }
  function setupVersionInfo(matrix, version2) {
    const size = matrix.size;
    const bits = Version.getEncodedBits(version2);
    let row, col, mod;
    for (let i = 0; i < 18; i++) {
      row = Math.floor(i / 3);
      col = i % 3 + size - 8 - 3;
      mod = (bits >> i & 1) === 1;
      matrix.set(row, col, mod, true);
      matrix.set(col, row, mod, true);
    }
  }
  function setupFormatInfo(matrix, errorCorrectionLevel2, maskPattern2) {
    const size = matrix.size;
    const bits = FormatInfo.getEncodedBits(errorCorrectionLevel2, maskPattern2);
    let i, mod;
    for (i = 0; i < 15; i++) {
      mod = (bits >> i & 1) === 1;
      if (i < 6) {
        matrix.set(i, 8, mod, true);
      } else if (i < 8) {
        matrix.set(i + 1, 8, mod, true);
      } else {
        matrix.set(size - 15 + i, 8, mod, true);
      }
      if (i < 8) {
        matrix.set(8, size - i - 1, mod, true);
      } else if (i < 9) {
        matrix.set(8, 15 - i - 1 + 1, mod, true);
      } else {
        matrix.set(8, 15 - i - 1, mod, true);
      }
    }
    matrix.set(size - 8, 8, 1, true);
  }
  function setupData(matrix, data) {
    const size = matrix.size;
    let inc = -1;
    let row = size - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (!matrix.isReserved(row, col - c)) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (data[byteIndex] >>> bitIndex & 1) === 1;
            }
            matrix.set(row, col - c, dark);
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || size <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }
  function createData(version2, errorCorrectionLevel2, segments2) {
    const buffer = new BitBuffer();
    segments2.forEach(function(data) {
      buffer.put(data.mode.bit, 4);
      buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version2));
      data.write(buffer);
    });
    const totalCodewords = Utils.getSymbolTotalCodewords(version2);
    const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel2);
    const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
    if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
      buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 !== 0) {
      buffer.putBit(0);
    }
    const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
    for (let i = 0; i < remainingByte; i++) {
      buffer.put(i % 2 ? 17 : 236, 8);
    }
    return createCodewords(buffer, version2, errorCorrectionLevel2);
  }
  function createCodewords(bitBuffer2, version2, errorCorrectionLevel2) {
    const totalCodewords = Utils.getSymbolTotalCodewords(version2);
    const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel2);
    const dataTotalCodewords = totalCodewords - ecTotalCodewords;
    const ecTotalBlocks = ECCode.getBlocksCount(version2, errorCorrectionLevel2);
    const blocksInGroup2 = totalCodewords % ecTotalBlocks;
    const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
    const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
    const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
    const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
    const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
    const rs = new ReedSolomonEncoder(ecCount);
    let offset = 0;
    const dcData = new Array(ecTotalBlocks);
    const ecData = new Array(ecTotalBlocks);
    let maxDataSize = 0;
    const buffer = new Uint8Array(bitBuffer2.buffer);
    for (let b = 0; b < ecTotalBlocks; b++) {
      const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
      dcData[b] = buffer.slice(offset, offset + dataSize);
      ecData[b] = rs.encode(dcData[b]);
      offset += dataSize;
      maxDataSize = Math.max(maxDataSize, dataSize);
    }
    const data = new Uint8Array(totalCodewords);
    let index = 0;
    let i, r;
    for (i = 0; i < maxDataSize; i++) {
      for (r = 0; r < ecTotalBlocks; r++) {
        if (i < dcData[r].length) {
          data[index++] = dcData[r][i];
        }
      }
    }
    for (i = 0; i < ecCount; i++) {
      for (r = 0; r < ecTotalBlocks; r++) {
        data[index++] = ecData[r][i];
      }
    }
    return data;
  }
  function createSymbol(data, version2, errorCorrectionLevel2, maskPattern2) {
    let segments2;
    if (Array.isArray(data)) {
      segments2 = Segments.fromArray(data);
    } else if (typeof data === "string") {
      let estimatedVersion = version2;
      if (!estimatedVersion) {
        const rawSegments = Segments.rawSplit(data);
        estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel2);
      }
      segments2 = Segments.fromString(data, estimatedVersion || 40);
    } else {
      throw new Error("Invalid data");
    }
    const bestVersion = Version.getBestVersionForData(segments2, errorCorrectionLevel2);
    if (!bestVersion) {
      throw new Error("The amount of data is too big to be stored in a QR Code");
    }
    if (!version2) {
      version2 = bestVersion;
    } else if (version2 < bestVersion) {
      throw new Error(
        "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
      );
    }
    const dataBits = createData(version2, errorCorrectionLevel2, segments2);
    const moduleCount = Utils.getSymbolSize(version2);
    const modules = new BitMatrix(moduleCount);
    setupFinderPattern(modules, version2);
    setupTimingPattern(modules);
    setupAlignmentPattern(modules, version2);
    setupFormatInfo(modules, errorCorrectionLevel2, 0);
    if (version2 >= 7) {
      setupVersionInfo(modules, version2);
    }
    setupData(modules, dataBits);
    if (isNaN(maskPattern2)) {
      maskPattern2 = MaskPattern.getBestMask(
        modules,
        setupFormatInfo.bind(null, modules, errorCorrectionLevel2)
      );
    }
    MaskPattern.applyMask(maskPattern2, modules);
    setupFormatInfo(modules, errorCorrectionLevel2, maskPattern2);
    return {
      modules,
      version: version2,
      errorCorrectionLevel: errorCorrectionLevel2,
      maskPattern: maskPattern2,
      segments: segments2
    };
  }
  qrcode.create = function create(data, options) {
    if (typeof data === "undefined" || data === "") {
      throw new Error("No input text");
    }
    let errorCorrectionLevel2 = ECLevel.M;
    let version2;
    let mask;
    if (typeof options !== "undefined") {
      errorCorrectionLevel2 = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
      version2 = Version.from(options.version);
      mask = MaskPattern.from(options.maskPattern);
      if (options.toSJISFunc) {
        Utils.setToSJISFunction(options.toSJISFunc);
      }
    }
    return createSymbol(data, version2, errorCorrectionLevel2, mask);
  };
  return qrcode;
}
var canvas = {};
var utils = {};
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  (function(exports$1) {
    function hex2rgba(hex) {
      if (typeof hex === "number") {
        hex = hex.toString();
      }
      if (typeof hex !== "string") {
        throw new Error("Color should be defined as hex string");
      }
      let hexCode = hex.slice().replace("#", "").split("");
      if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
        throw new Error("Invalid hex color: " + hex);
      }
      if (hexCode.length === 3 || hexCode.length === 4) {
        hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }));
      }
      if (hexCode.length === 6) hexCode.push("F", "F");
      const hexValue = parseInt(hexCode.join(""), 16);
      return {
        r: hexValue >> 24 & 255,
        g: hexValue >> 16 & 255,
        b: hexValue >> 8 & 255,
        a: hexValue & 255,
        hex: "#" + hexCode.slice(0, 6).join("")
      };
    }
    exports$1.getOptions = function getOptions(options) {
      if (!options) options = {};
      if (!options.color) options.color = {};
      const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
      const width = options.width && options.width >= 21 ? options.width : void 0;
      const scale = options.scale || 4;
      return {
        width,
        scale: width ? 4 : scale,
        margin,
        color: {
          dark: hex2rgba(options.color.dark || "#000000ff"),
          light: hex2rgba(options.color.light || "#ffffffff")
        },
        type: options.type,
        rendererOpts: options.rendererOpts || {}
      };
    };
    exports$1.getScale = function getScale(qrSize, opts) {
      return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
    };
    exports$1.getImageWidth = function getImageWidth(qrSize, opts) {
      const scale = exports$1.getScale(qrSize, opts);
      return Math.floor((qrSize + opts.margin * 2) * scale);
    };
    exports$1.qrToImageData = function qrToImageData(imgData, qr, opts) {
      const size = qr.modules.size;
      const data = qr.modules.data;
      const scale = exports$1.getScale(size, opts);
      const symbolSize = Math.floor((size + opts.margin * 2) * scale);
      const scaledMargin = opts.margin * scale;
      const palette = [opts.color.light, opts.color.dark];
      for (let i = 0; i < symbolSize; i++) {
        for (let j = 0; j < symbolSize; j++) {
          let posDst = (i * symbolSize + j) * 4;
          let pxColor = opts.color.light;
          if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
            const iSrc = Math.floor((i - scaledMargin) / scale);
            const jSrc = Math.floor((j - scaledMargin) / scale);
            pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
          }
          imgData[posDst++] = pxColor.r;
          imgData[posDst++] = pxColor.g;
          imgData[posDst++] = pxColor.b;
          imgData[posDst] = pxColor.a;
        }
      }
    };
  })(utils);
  return utils;
}
var hasRequiredCanvas;
function requireCanvas() {
  if (hasRequiredCanvas) return canvas;
  hasRequiredCanvas = 1;
  (function(exports$1) {
    const Utils = requireUtils();
    function clearCanvas(ctx, canvas2, size) {
      ctx.clearRect(0, 0, canvas2.width, canvas2.height);
      if (!canvas2.style) canvas2.style = {};
      canvas2.height = size;
      canvas2.width = size;
      canvas2.style.height = size + "px";
      canvas2.style.width = size + "px";
    }
    function getCanvasElement() {
      try {
        return document.createElement("canvas");
      } catch (e) {
        throw new Error("You need to specify a canvas element");
      }
    }
    exports$1.render = function render(qrData, canvas2, options) {
      let opts = options;
      let canvasEl = canvas2;
      if (typeof opts === "undefined" && (!canvas2 || !canvas2.getContext)) {
        opts = canvas2;
        canvas2 = void 0;
      }
      if (!canvas2) {
        canvasEl = getCanvasElement();
      }
      opts = Utils.getOptions(opts);
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      const ctx = canvasEl.getContext("2d");
      const image = ctx.createImageData(size, size);
      Utils.qrToImageData(image.data, qrData, opts);
      clearCanvas(ctx, canvasEl, size);
      ctx.putImageData(image, 0, 0);
      return canvasEl;
    };
    exports$1.renderToDataURL = function renderToDataURL(qrData, canvas2, options) {
      let opts = options;
      if (typeof opts === "undefined" && (!canvas2 || !canvas2.getContext)) {
        opts = canvas2;
        canvas2 = void 0;
      }
      if (!opts) opts = {};
      const canvasEl = exports$1.render(qrData, canvas2, opts);
      const type = opts.type || "image/png";
      const rendererOpts = opts.rendererOpts || {};
      return canvasEl.toDataURL(type, rendererOpts.quality);
    };
  })(canvas);
  return canvas;
}
var svgTag = {};
var hasRequiredSvgTag;
function requireSvgTag() {
  if (hasRequiredSvgTag) return svgTag;
  hasRequiredSvgTag = 1;
  const Utils = requireUtils();
  function getColorAttrib(color, attrib) {
    const alpha = color.a / 255;
    const str = attrib + '="' + color.hex + '"';
    return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
  }
  function svgCmd(cmd, x, y) {
    let str = cmd + x;
    if (typeof y !== "undefined") str += " " + y;
    return str;
  }
  function qrToPath(data, size, margin) {
    let path = "";
    let moveBy = 0;
    let newRow = false;
    let lineLength = 0;
    for (let i = 0; i < data.length; i++) {
      const col = Math.floor(i % size);
      const row = Math.floor(i / size);
      if (!col && !newRow) newRow = true;
      if (data[i]) {
        lineLength++;
        if (!(i > 0 && col > 0 && data[i - 1])) {
          path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
          moveBy = 0;
          newRow = false;
        }
        if (!(col + 1 < size && data[i + 1])) {
          path += svgCmd("h", lineLength);
          lineLength = 0;
        }
      } else {
        moveBy++;
      }
    }
    return path;
  }
  svgTag.render = function render(qrData, options, cb) {
    const opts = Utils.getOptions(options);
    const size = qrData.modules.size;
    const data = qrData.modules.data;
    const qrcodesize = size + opts.margin * 2;
    const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
    const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>';
    const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
    const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
    const svgTag2 = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + "</svg>\n";
    if (typeof cb === "function") {
      cb(null, svgTag2);
    }
    return svgTag2;
  };
  return svgTag;
}
var hasRequiredBrowser;
function requireBrowser() {
  if (hasRequiredBrowser) return browser;
  hasRequiredBrowser = 1;
  const canPromise2 = requireCanPromise();
  const QRCode2 = requireQrcode();
  const CanvasRenderer = requireCanvas();
  const SvgRenderer = requireSvgTag();
  function renderCanvas(renderFunc, canvas2, text, opts, cb) {
    const args = [].slice.call(arguments, 1);
    const argsNum = args.length;
    const isLastArgCb = typeof args[argsNum - 1] === "function";
    if (!isLastArgCb && !canPromise2()) {
      throw new Error("Callback required as last argument");
    }
    if (isLastArgCb) {
      if (argsNum < 2) {
        throw new Error("Too few arguments provided");
      }
      if (argsNum === 2) {
        cb = text;
        text = canvas2;
        canvas2 = opts = void 0;
      } else if (argsNum === 3) {
        if (canvas2.getContext && typeof cb === "undefined") {
          cb = opts;
          opts = void 0;
        } else {
          cb = opts;
          opts = text;
          text = canvas2;
          canvas2 = void 0;
        }
      }
    } else {
      if (argsNum < 1) {
        throw new Error("Too few arguments provided");
      }
      if (argsNum === 1) {
        text = canvas2;
        canvas2 = opts = void 0;
      } else if (argsNum === 2 && !canvas2.getContext) {
        opts = text;
        text = canvas2;
        canvas2 = void 0;
      }
      return new Promise(function(resolve, reject) {
        try {
          const data = QRCode2.create(text, opts);
          resolve(renderFunc(data, canvas2, opts));
        } catch (e) {
          reject(e);
        }
      });
    }
    try {
      const data = QRCode2.create(text, opts);
      cb(null, renderFunc(data, canvas2, opts));
    } catch (e) {
      cb(e);
    }
  }
  browser.create = QRCode2.create;
  browser.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
  browser.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
  browser.toString = renderCanvas.bind(null, function(data, _, opts) {
    return SvgRenderer.render(data, opts);
  });
  return browser;
}
var browserExports = requireBrowser();
const QRCodeLib = /* @__PURE__ */ getDefaultExportFromCjs(browserExports);
const QRCode = ({ url, size = 200 }) => {
  const canvasRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "L"
    }).catch((err) => console.error("[QRCode]", err));
  }, [url, size]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "canvas",
    {
      ref: canvasRef,
      width: size,
      height: size,
      style: { borderRadius: 8, background: "#fff" }
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/QRCode.tsx",
      lineNumber: 27,
      columnNumber: 5
    },
    void 0
  );
};
const API_BASE = "http://localhost:3001/api";
const DJRemoteControlButton = () => {
  const [showPanel, setShowPanel] = reactExports.useState(false);
  const [roomCode, setRoomCode] = reactExports.useState(null);
  const [localIP, setLocalIP] = reactExports.useState("");
  const [micStatus, setMicStatus] = reactExports.useState("");
  const receiverRef = reactExports.useRef(null);
  const handleToggle = reactExports.useCallback(async () => {
    var _a;
    if (showPanel) {
      (_a = receiverRef.current) == null ? void 0 : _a.disconnect();
      receiverRef.current = null;
      setShowPanel(false);
      setRoomCode(null);
      setMicStatus("");
      return;
    }
    setShowPanel(true);
    try {
      const ipResp = await fetch(`${API_BASE}/network/local-ip`);
      const { ip } = await ipResp.json();
      setLocalIP(ip);
      const receiver = new DJRemoteMicReceiver();
      receiver.onStatusChange = (s) => setMicStatus(s);
      receiverRef.current = receiver;
      const code = await receiver.createRoom();
      setRoomCode(code);
    } catch (err) {
      console.error("[RemoteControl] Setup failed:", err);
      setMicStatus("error");
    }
  }, [showPanel]);
  reactExports.useEffect(() => {
    return () => {
      var _a;
      (_a = receiverRef.current) == null ? void 0 : _a.disconnect();
    };
  }, []);
  const controllerURL = localIP && roomCode ? `http://${localIP}:5173/controller.html?host=${localIP}&room=${roomCode}` : "";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: { position: "relative" }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        onClick: handleToggle,
        className: `
          px-2 py-1 rounded text-xs font-bold transition-all
          ${showPanel ? "bg-blue-600 text-white" : "bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted"}
        `,
        title: "Connect iPhone controller",
        children: "REMOTE"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
        lineNumber: 64,
        columnNumber: 7
      },
      void 0
    ),
    showPanel && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-40", onClick: handleToggle }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
      lineNumber: 80,
      columnNumber: 9
    }, void 0),
    showPanel && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute top-full right-0 mt-1 w-72 bg-dark-bgSecondary border border-dark-borderLight rounded-lg p-4 shadow-xl z-50",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-bold text-text-primary", children: "iPhone Controller" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
              lineNumber: 88,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handleToggle,
                className: "text-text-tertiary hover:text-text-primary transition-colors text-sm leading-none",
                title: "Close",
                children: "X"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 89,
                columnNumber: 13
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
            lineNumber: 87,
            columnNumber: 11
          }, void 0),
          roomCode ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center mb-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(QRCode, { url: controllerURL, size: 200 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 102,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted mt-1", children: "Scan with iPhone camera" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 103,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
              lineNumber: 101,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted", children: "Room:" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 110,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-mono font-bold text-blue-400 tracking-wider", children: roomCode }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 111,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
              lineNumber: 109,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => {
                  var _a;
                  return (_a = navigator.clipboard) == null ? void 0 : _a.writeText(controllerURL);
                },
                className: "w-full px-3 py-1.5 rounded-md border border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover text-[10px] transition-all mb-2",
                children: "Copy URL"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 115,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: [
              "Mic: ",
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: micStatus === "connected" ? "text-green-400" : micStatus === "waiting" ? "text-yellow-400" : "text-text-muted", children: micStatus || "initializing..." }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
                lineNumber: 124,
                columnNumber: 22
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
              lineNumber: 123,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
            lineNumber: 99,
            columnNumber: 13
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-[10px] text-text-muted", children: "Setting up..." }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
            lineNumber: 130,
            columnNumber: 13
          }, void 0)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
        lineNumber: 84,
        columnNumber: 9
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJRemoteControlButton.tsx",
    lineNumber: 63,
    columnNumber: 5
  }, void 0);
};
function WorkerWrapper(options) {
  return new Worker(
    "/assets/dj-waveform.worker-BJRAhSV5.js",
    {
      name: options == null ? void 0 : options.name
    }
  );
}
const OVERVIEW_H = 16;
function snapshotColors(el) {
  const cs = getComputedStyle(el);
  return {
    bg: cs.getPropertyValue("--color-bg").trim() || "#6e1418",
    bgSecondary: cs.getPropertyValue("--color-bg-secondary").trim() || "#7c1a1e",
    bgTertiary: cs.getPropertyValue("--color-bg-tertiary").trim() || "#8c2028",
    border: cs.getPropertyValue("--color-border").trim() || "#581014"
  };
}
function snapshotOverview(deckId, container) {
  var _a, _b;
  const d = useDJStore.getState().decks[deckId];
  return {
    frequencyPeaks: d.frequencyPeaks ? d.frequencyPeaks.map((band) => Array.from(band)) : null,
    loopActive: d.loopActive,
    patternLoopStart: d.patternLoopStart,
    patternLoopEnd: d.patternLoopEnd,
    cuePoint: d.cuePoint,
    totalPositions: d.totalPositions,
    colors: snapshotColors(container),
    beats: ((_a = d.beatGrid) == null ? void 0 : _a.beats) ?? null,
    downbeats: ((_b = d.beatGrid) == null ? void 0 : _b.downbeats) ?? null
  };
}
const DeckAudioWaveform = ({ deckId }) => {
  const canvasRef = reactExports.useRef(null);
  const containerRef = reactExports.useRef(null);
  const bridgeRef = reactExports.useRef(null);
  const waveformPeaks = useDJStore((s) => s.decks[deckId].waveformPeaks);
  const hasPeaks = !!(waveformPeaks && waveformPeaks.length > 0);
  reactExports.useEffect(() => {
    var _a;
    if (!hasPeaks) return;
    const container = containerRef.current;
    if (!container || !("transferControlToOffscreen" in HTMLCanvasElement.prototype)) return;
    const canvas2 = document.createElement("canvas");
    canvas2.className = "block w-full h-full";
    container.appendChild(canvas2);
    canvasRef.current = canvas2;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas2.transferControlToOffscreen();
    const bridge = new OffscreenBridge(
      WorkerWrapper,
      { onReady: () => {
      } }
    );
    bridgeRef.current = bridge;
    bridge.post({
      type: "init",
      canvas: offscreen,
      dpr,
      width: w,
      height: h,
      waveformPeaks: deck.waveformPeaks ? Array.from(deck.waveformPeaks) : null,
      durationMs: deck.durationMs,
      audioPosition: deck.audioPosition,
      cuePoints: deck.seratoCuePoints,
      overview: snapshotOverview(deckId, container)
    }, [offscreen]);
    const unsubPos = useDJStore.subscribe(
      (s) => s.decks[deckId].audioPosition,
      (audioPosition) => {
        var _a2;
        return (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({ type: "position", audioPosition });
      }
    );
    const unsubPeaks = useDJStore.subscribe(
      (s) => s.decks[deckId].waveformPeaks,
      (peaks) => {
        var _a2;
        return (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({
          type: "waveformPeaks",
          peaks: peaks ? Array.from(peaks) : null,
          durationMs: useDJStore.getState().decks[deckId].durationMs
        });
      }
    );
    const unsubCues = useDJStore.subscribe(
      (s) => s.decks[deckId].seratoCuePoints,
      (cuePoints) => {
        var _a2;
        return (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({ type: "cuePoints", cuePoints });
      }
    );
    const unsubOverview = useDJStore.subscribe(
      (s) => {
        const d = s.decks[deckId];
        return [d.frequencyPeaks, d.loopActive, d.patternLoopStart, d.patternLoopEnd, d.cuePoint, d.totalPositions, d.beatGrid];
      },
      () => {
        var _a2;
        if (containerRef.current) {
          (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({ type: "overview", overview: snapshotOverview(deckId, containerRef.current) });
        }
      }
    );
    const unsubTheme = useThemeStore.subscribe(() => {
      var _a2;
      if (containerRef.current) {
        (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({ type: "overview", overview: snapshotOverview(deckId, containerRef.current) });
      }
    });
    const otherDeckId = deckId === "A" ? "B" : deckId === "B" ? "A" : "A";
    const otherInit = useDJStore.getState().decks[otherDeckId];
    (_a = bridgeRef.current) == null ? void 0 : _a.post({
      type: "otherDeck",
      peaks: otherInit.waveformPeaks ? Array.from(otherInit.waveformPeaks) : null,
      durationMs: otherInit.durationMs,
      audioPosition: otherInit.audioPosition
    });
    const unsubOtherPos = useDJStore.subscribe(
      (s) => s.decks[otherDeckId].audioPosition,
      (pos) => {
        var _a2;
        const od = useDJStore.getState().decks[otherDeckId];
        (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({
          type: "otherDeck",
          peaks: null,
          // don't resend peaks on every position update
          durationMs: od.durationMs,
          audioPosition: pos
        });
      }
    );
    const unsubOtherPeaks = useDJStore.subscribe(
      (s) => s.decks[otherDeckId].waveformPeaks,
      (peaks) => {
        var _a2;
        const od = useDJStore.getState().decks[otherDeckId];
        (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({
          type: "otherDeck",
          peaks: peaks ? Array.from(peaks) : null,
          durationMs: od.durationMs,
          audioPosition: od.audioPosition
        });
      }
    );
    const observer = new ResizeObserver((entries) => {
      var _a2;
      const entry = entries[0];
      if (!entry) return;
      const w2 = Math.floor(entry.contentRect.width);
      const h2 = Math.floor(entry.contentRect.height);
      if (w2 > 0 && h2 > 0) {
        (_a2 = bridgeRef.current) == null ? void 0 : _a2.post({ type: "resize", w: w2, h: h2, dpr: Math.min(window.devicePixelRatio, 2) });
      }
    });
    observer.observe(container);
    return () => {
      unsubPos();
      unsubPeaks();
      unsubCues();
      unsubOverview();
      unsubTheme();
      unsubOtherPos();
      unsubOtherPeaks();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas2.remove();
      canvasRef.current = null;
    };
  }, [deckId, hasPeaks]);
  const snapToNearestBeat = reactExports.useCallback((seekSec) => {
    var _a;
    const beats = (_a = useDJStore.getState().decks[deckId].beatGrid) == null ? void 0 : _a.beats;
    if (!beats || beats.length === 0) return seekSec;
    let nearest = beats[0], minDist = Math.abs(seekSec - nearest);
    for (const b of beats) {
      const dist = Math.abs(seekSec - b);
      if (dist < minDist) {
        minDist = dist;
        nearest = b;
      }
      if (b > seekSec + 0.2) break;
    }
    return minDist < 0.15 ? nearest : seekSec;
  }, [deckId]);
  const seekToFraction = reactExports.useCallback((fraction) => {
    const f = Math.max(0, Math.min(1, fraction));
    const seekSec = f * (useDJStore.getState().decks[deckId].durationMs / 1e3);
    markSeek(deckId);
    seekDeckAudio(deckId, seekSec);
    useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1e3 });
  }, [deckId]);
  const isDraggingRef = reactExports.useRef(false);
  const dragStartXRef = reactExports.useRef(0);
  const dragStartPosRef = reactExports.useRef(0);
  const handleMouseDown = reactExports.useCallback((e) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (localY <= OVERVIEW_H) {
      seekToFraction(frac);
      return;
    }
    e.preventDefault();
    isDraggingRef.current = true;
    const state = useDJStore.getState().decks[deckId];
    dragStartXRef.current = e.clientX;
    dragStartPosRef.current = state.audioPosition;
    const WINDOW_SEC = 10;
    const durationSec = state.durationMs / 1e3;
    const calcSeekSec = (clientX) => {
      const dx = clientX - dragStartXRef.current;
      const deltaSec = -(dx / rect.width) * WINDOW_SEC;
      return Math.max(0, Math.min(durationSec - 0.01, dragStartPosRef.current + deltaSec));
    };
    const onMouseMove = (ev) => {
      if (!isDraggingRef.current) return;
      const seekSec = snapToNearestBeat(calcSeekSec(ev.clientX));
      markSeek(deckId);
      useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1e3 });
    };
    const onMouseUp = (ev) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        const seekSec = snapToNearestBeat(calcSeekSec(ev.clientX));
        const dur = useDJStore.getState().decks[deckId].durationMs / 1e3;
        if (dur > 0) seekToFraction(seekSec / dur);
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [deckId, seekToFraction]);
  if (!waveformPeaks || waveformPeaks.length === 0) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: containerRef,
      className: "w-full h-16 shrink-0 bg-dark-bg border border-dark-border rounded-sm overflow-hidden cursor-pointer",
      onMouseDown: handleMouseDown
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckAudioWaveform.tsx",
      lineNumber: 291,
      columnNumber: 5
    },
    void 0
  );
};
let instance = null;
class DJHealthMonitor {
  intervalId = null;
  listeners = /* @__PURE__ */ new Set();
  lastStatus = null;
  static getInstance() {
    if (!instance) instance = new DJHealthMonitor();
    return instance;
  }
  static dispose() {
    instance == null ? void 0 : instance.stop();
    instance = null;
  }
  start() {
    if (this.intervalId) return;
    this.check();
    this.intervalId = setInterval(() => this.check(), 5e3);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.listeners.clear();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    if (this.lastStatus) listener(this.lastStatus);
    return () => this.listeners.delete(listener);
  }
  check() {
    const ctx = getContext().rawContext;
    const perf = performance;
    const status = {
      audioContext: (ctx == null ? void 0 : ctx.state) ?? "closed",
      memoryMB: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : null,
      engineReady: (ctx == null ? void 0 : ctx.state) === "running",
      timestamp: Date.now()
    };
    if (status.audioContext === "suspended") {
      start().catch(() => {
      });
    }
    this.lastStatus = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
function useDJHealth() {
  const [status, setStatus] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const monitor = DJHealthMonitor.getInstance();
    monitor.start();
    const unsub = monitor.subscribe(setStatus);
    return unsub;
  }, []);
  return status;
}
function DeckStateSyncBridge({ deckId }) {
  useDeckStateSync(deckId);
  return null;
}
const DJ3DOverlay = React.lazy(() => __vitePreload(() => import("./DJ3DOverlay-CXli-F_O.js"), true ? __vite__mapDeps([7,1,2,3,8,4,9,0,5,6,10,11]) : void 0).then((m) => ({ default: m.DJ3DOverlay })));
const DJView = ({ onShowDrumpads: _onShowDrumpads }) => {
  const djViewRef = reactExports.useRef(null);
  const engineRef = reactExports.useRef(null);
  const setDJModeActive = useDJStore((s) => s.setDJModeActive);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);
  const setThirdDeckActive = useDJStore((s) => s.setThirdDeckActive);
  const [showCrate, setShowCrate] = reactExports.useState(false);
  const [showAutoDJ, setShowAutoDJ] = reactExports.useState(false);
  const autoDJEnabled = useDJStore((s) => s.autoDJEnabled);
  const health = useDJHealth();
  const [syncDriftMs, setSyncDriftMs] = reactExports.useState(null);
  const driftHistoryRef = reactExports.useRef([]);
  reactExports.useEffect(() => {
    const timer = setInterval(() => {
      const s = useDJStore.getState();
      if (!s.decks.A.isPlaying || !s.decks.B.isPlaying || !s.decks.A.beatGrid || !s.decks.B.beatGrid) {
        setSyncDriftMs(null);
        driftHistoryRef.current = [];
        return;
      }
      try {
        const phaseA = getPhaseInfo("A");
        const phaseB = getPhaseInfo("B");
        if (!phaseA || !phaseB) {
          setSyncDriftMs(null);
          return;
        }
        let phaseDiff = Math.abs(phaseA.beatPhase - phaseB.beatPhase);
        if (phaseDiff > 0.5) phaseDiff = 1 - phaseDiff;
        const beatPeriodMs = 60 / s.decks.A.beatGrid.bpm * 1e3;
        const rawDrift = Math.round(phaseDiff * beatPeriodMs);
        const history = driftHistoryRef.current;
        history.push(rawDrift);
        if (history.length > 10) history.shift();
        const avgDrift = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
        setSyncDriftMs(avgDrift);
      } catch {
        setSyncDriftMs(null);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);
  reactExports.useEffect(() => {
    const { isPlaying, stop } = useTransportStore.getState();
    if (isPlaying) stop();
    getToneEngine().releaseAll();
    void start().catch(() => {
    });
    engineRef.current = getDJEngine();
    setDJModeActive(true);
    return () => {
      setDJModeActive(false);
      disposeDJEngine();
      clearSongCache();
      engineRef.current = null;
      const engine = getToneEngine();
      engine.setGlobalPlaybackRate(1);
      engine.setGlobalDetune(0);
      engine.releaseAll();
      useTransportStore.getState().setGlobalPitch(0);
    };
  }, [setDJModeActive]);
  reactExports.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const unsubscribePFLA = useDJStore.subscribe(
      (s) => s.decks.A.pflEnabled,
      (enabled) => engine.mixer.setPFL("A", enabled)
    );
    const unsubscribePFLB = useDJStore.subscribe(
      (s) => s.decks.B.pflEnabled,
      (enabled) => engine.mixer.setPFL("B", enabled)
    );
    const unsubscribePFLC = useDJStore.subscribe(
      (s) => s.decks.C.pflEnabled,
      (enabled) => engine.mixer.setPFL("C", enabled)
    );
    const unsubscribeCueVolume = useDJStore.subscribe(
      (s) => s.cueVolume,
      (volume) => engine.cueEngine.setCueVolume(volume)
    );
    const unsubscribeCueMix = useDJStore.subscribe(
      (s) => s.cueMix,
      (mix) => engine.cueEngine.setCueMix(mix)
    );
    const unsubscribeCueDevice = useDJStore.subscribe(
      (s) => s.cueDeviceId,
      (deviceId) => {
        if (deviceId) {
          void engine.cueEngine.setCueDevice(deviceId);
        }
      }
    );
    return () => {
      unsubscribePFLA();
      unsubscribePFLB();
      unsubscribePFLC();
      unsubscribeCueVolume();
      unsubscribeCueMix();
      unsubscribeCueDevice();
    };
  }, []);
  useDJKeyboardHandler();
  const masterEffects = useAudioStore((s) => s.masterEffects);
  const masterEffectsKey = reactExports.useMemo(
    () => masterEffects.map((e) => `${e.id}:${e.enabled}:${e.type}:${(e.selectedChannels ?? []).join(",")}`).join("|"),
    [masterEffects]
  );
  reactExports.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const store = useDJStore.getState();
    const activeDeck = store.decks.A.isPlaying ? "A" : store.decks.B.isPlaying ? "B" : "A";
    const isPlaying = store.decks.A.isPlaying || store.decks.B.isPlaying;
    if (isPlaying) {
      const cancel = onNextBeat(activeDeck, () => {
        engine.mixer.rebuildMasterEffects(masterEffects);
      });
      return cancel;
    } else {
      engine.mixer.rebuildMasterEffects(masterEffects);
    }
  }, [masterEffectsKey]);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  reactExports.useEffect(() => {
    if (!activePlaylistId) return;
    useDJPlaylistStore.getState().setPlaylistMasterEffects(activePlaylistId, masterEffects);
  }, [masterEffectsKey, activePlaylistId]);
  const handleSeratoTrackLoad = reactExports.useCallback(async (track, deckId) => {
    var _a, _b;
    const fs = (_a = window.electron) == null ? void 0 : _a.fs;
    if (!fs) {
      console.warn("[DJView] Electron fs not available for Serato track loading");
      return;
    }
    try {
      const buffer = await fs.readFile(track.filePath);
      const filename = track.filePath.split(/[/\\]/).pop() || track.title;
      const engine = getDJEngine();
      const cacheKey = `serato:${track.filePath}`;
      const { isAudioFile: isAudioFile2 } = await __vitePreload(async () => {
        const { isAudioFile: isAudioFile3 } = await import("./parseModuleToSong-B-Yqzlmn.js").then((n) => n.a);
        return { isAudioFile: isAudioFile3 };
      }, true ? __vite__mapDeps([11,0,1,2,3,4,5,6]) : void 0);
      if (isAudioFile2(filename)) {
        const info = await engine.loadAudioToDeck(deckId, buffer.slice(0), filename);
        const { readSeratoMetadata } = await __vitePreload(async () => {
          const { readSeratoMetadata: readSeratoMetadata2 } = await import("./seratoMetadata-BfJ6LXfc.js");
          return { readSeratoMetadata: readSeratoMetadata2 };
        }, true ? [] : void 0);
        const metadata = readSeratoMetadata(buffer);
        const bpm = metadata.bpm ?? (track.bpm > 0 ? track.bpm : 0);
        useDJStore.getState().setDeckState(deckId, {
          fileName: cacheKey,
          trackName: track.title || filename.replace(/\.[^.]+$/, ""),
          detectedBPM: bpm,
          effectiveBPM: bpm,
          totalPositions: 0,
          songPos: 0,
          pattPos: 0,
          elapsedMs: 0,
          isPlaying: false,
          playbackMode: "audio",
          durationMs: info.duration * 1e3,
          audioPosition: 0,
          waveformPeaks: info.waveformPeaks,
          seratoCuePoints: metadata.cuePoints,
          seratoLoops: metadata.loops,
          seratoBeatGrid: metadata.beatGrid,
          seratoKey: track.key || metadata.key
        });
      } else {
        const { isUADEFormat: checkUADE } = await __vitePreload(async () => {
          const { isUADEFormat: checkUADE2 } = await import("./main-BbV5VyEH.js").then((n) => n.ji);
          return { isUADEFormat: checkUADE2 };
        }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
        if (checkUADE(filename)) {
          const { loadUADEToDeck: loadUADE } = await __vitePreload(async () => {
            const { loadUADEToDeck: loadUADE2 } = await import("./useDeckStateSync-BIQewTIw.js").then((n) => n.j);
            return { loadUADEToDeck: loadUADE2 };
          }, true ? __vite__mapDeps([12,0,1,2,3,4,5,6,10,11]) : void 0);
          await loadUADE(engine, deckId, buffer.slice(0), filename, true, track.bpm > 0 ? track.bpm : void 0, track.title);
          useDJStore.getState().setDeckViewMode("visualizer");
        } else {
          const { parseModuleToSong: parseModuleToSong2 } = await __vitePreload(async () => {
            const { parseModuleToSong: parseModuleToSong3 } = await import("./parseModuleToSong-B-Yqzlmn.js").then((n) => n.b);
            return { parseModuleToSong: parseModuleToSong3 };
          }, true ? __vite__mapDeps([11,0,1,2,3,4,5,6]) : void 0);
          const { detectBPM: detectBPM2 } = await __vitePreload(async () => {
            const { detectBPM: detectBPM3 } = await import("./DJActions-Ap2A5JjP.js").then((n) => n.a6);
            return { detectBPM: detectBPM3 };
          }, true ? __vite__mapDeps([10,0,1,2,3,4,5,6,11]) : void 0);
          const { cacheSong: cacheSong2 } = await __vitePreload(async () => {
            const { cacheSong: cacheSong3 } = await import("./DJActions-Ap2A5JjP.js").then((n) => n.a5);
            return { cacheSong: cacheSong3 };
          }, true ? __vite__mapDeps([10,0,1,2,3,4,5,6,11]) : void 0);
          const blob = new File([buffer], filename, { type: "application/octet-stream" });
          const song = await parseModuleToSong2(blob);
          const bpmResult = detectBPM2(song);
          cacheSong2(cacheKey, song);
          useDJStore.getState().setDeckState(deckId, {
            fileName: cacheKey,
            trackName: song.name || track.title || filename,
            detectedBPM: track.bpm > 0 ? track.bpm : bpmResult.bpm,
            effectiveBPM: track.bpm > 0 ? track.bpm : bpmResult.bpm,
            analysisState: "rendering",
            isPlaying: false
          });
          const result = await getDJPipeline().loadOrEnqueue(buffer.slice(0), filename, deckId, "high");
          await engine.loadAudioToDeck(deckId, result.wavData, cacheKey, song.name || filename, ((_b = result.analysis) == null ? void 0 : _b.bpm) || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode("visualizer");
        }
      }
    } catch (err) {
      console.error(`[DJView] Failed to load Serato track ${track.title}:`, err);
    }
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: djViewRef, className: "relative flex flex-col h-full w-full overflow-hidden select-none bg-dark-bg font-mono", children: [
    health && health.audioContext !== "running" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { style: {
      position: "absolute",
      top: 4,
      right: 4,
      zIndex: 9999,
      padding: "4px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontFamily: "monospace",
      background: health.audioContext === "suspended" ? "#a80" : "#a00",
      color: "#fff",
      pointerEvents: "none"
    }, children: [
      "Audio: ",
      health.audioContext
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 307,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckStateSyncBridge, { deckId: "A" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 317,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckStateSyncBridge, { deckId: "B" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 318,
      columnNumber: 7
    }, void 0),
    thirdDeckActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckStateSyncBridge, { deckId: "C" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 319,
      columnNumber: 27
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-2 shrink-0 bg-dark-bgSecondary border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJControllerSelector, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 326,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJFxQuickPresets, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 327,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CustomSelect,
        {
          value: deckViewMode,
          onChange: (v) => useDJStore.getState().setDeckViewMode(v),
          options: [
            { value: "visualizer", label: "Deck: Visualizer" },
            { value: "vinyl", label: "Deck: Vinyl" },
            { value: "3d", label: "Deck: 3D" }
          ],
          className: "px-3 py-1.5 rounded-md text-xs font-mono border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary",
          title: "Select deck view mode"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 328,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setThirdDeckActive(!thirdDeckActive),
          className: `px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${thirdDeckActive ? "border-emerald-500 bg-emerald-900/20 text-emerald-400" : "border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
          title: "Toggle 3rd deck (Deck C)",
          children: "Deck C"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 339,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => setShowAutoDJ(!showAutoDJ),
            className: `px-3 py-1.5 rounded-md text-xs font-mono border transition-all
                ${showAutoDJ || autoDJEnabled ? "border-green-500 bg-green-900/20 text-green-400" : "border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
            title: "Auto DJ — automatic beatmixed playlist playback",
            children: [
              "Auto DJ",
              autoDJEnabled ? " ON" : ""
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
            lineNumber: 351,
            columnNumber: 13
          },
          void 0
        ),
        showAutoDJ && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-full right-0 mt-1 z-[99989] w-80", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJAutoDJPanel, { onClose: () => setShowAutoDJ(false) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 364,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 363,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 350,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJVocoderControl, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 368,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJRemoteControlButton, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 369,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setShowCrate(!showCrate),
          className: `px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all
              ${showCrate ? "border-accent-primary bg-accent-primary/20 text-accent-primary" : "border-accent-primary bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"}`,
          children: "Crate"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 370,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 325,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 324,
      columnNumber: 7
    }, void 0),
    showCrate && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute inset-x-0 top-12 bottom-0 z-[99990] px-2 pt-2",
        onClick: (e) => {
          if (e.target === e.currentTarget) setShowCrate(false);
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-h-[50vh]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          DJCratePanel,
          {
            onClose: () => setShowCrate(false),
            onLoadSeratoTrack: handleSeratoTrackLoad
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
            lineNumber: 392,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 391,
          columnNumber: 11
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 387,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `flex flex-col w-full shrink-0 border-b relative transition-shadow duration-300 ${syncDriftMs !== null && syncDriftMs < 30 ? "border-green-500/50 shadow-[0_0_12px_rgba(34,197,94,0.3)]" : syncDriftMs !== null && syncDriftMs > 80 ? "border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "border-dark-border"}`, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckAudioWaveform, { deckId: "A" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 415,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DeckAudioWaveform, { deckId: "B" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 416,
        columnNumber: 9
      }, void 0),
      syncDriftMs !== null && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-mono font-bold pointer-events-none z-10 ${syncDriftMs < 30 ? "bg-green-500/80 text-white" : syncDriftMs < 80 ? "bg-yellow-500/80 text-black" : "bg-red-500/80 text-white"}`, children: syncDriftMs < 30 ? "SYNCED" : `${syncDriftMs}ms` }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 419,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 408,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `relative flex-1 grid gap-2 p-2 overflow-hidden min-h-0 ${thirdDeckActive ? "grid-cols-[1fr_400px_1fr_1fr]" : "grid-cols-[1fr_400px_1fr]"}`, children: deckViewMode === "3d" ? (
      /* ── 3D mode: Unified scene with decks + mixer side by side ──── */
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "col-span-full min-h-0 min-w-0 overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center w-full h-full text-text-muted text-sm", children: "Loading 3D scene..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 443,
        columnNumber: 15
      }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJ3DOverlay, {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 447,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 442,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 441,
        columnNumber: 11
      }, void 0)
    ) : (
      /* ── Standard 2D modes (Visualizer / Vinyl) ──────────────────── */
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "min-h-0 min-w-0 overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJDeck, { deckId: "A" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 455,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 454,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "min-h-0 min-w-0 overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJMixer, {}, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 460,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 459,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "min-h-0 min-w-0 overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJDeck, { deckId: "B" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 465,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 464,
          columnNumber: 13
        }, void 0),
        thirdDeckActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "min-h-0 min-w-0 overflow-hidden", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DJDeck, { deckId: "C" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 471,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
          lineNumber: 470,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
        lineNumber: 452,
        columnNumber: 11
      }, void 0)
    ) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
      lineNumber: 434,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJView.tsx",
    lineNumber: 304,
    columnNumber: 5
  }, void 0);
};
export {
  DJView
};
