import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, R as React, w as Package, x as FileHeadphone, U as Upload, y as Folder, X, p as Trash2, S as Search, z as Square, s as Play, Z as Zap, C as Check, A as Music, f as Sparkles, B as Disc3 } from "./vendor-ui-AJ7AT9BN.js";
import { start, Player } from "./vendor-tone-48TQc1H3.js";
import { e as useInstrumentStore, a5 as useSamplePackStore, a6 as useAllSamplePacks, $ as getToneEngine, a7 as normalizeUrl, a8 as STORAGE_KEY, P as notify, a9 as CACHE_NAME } from "./main-BbV5VyEH.js";
import { S as SAMPLE_CATEGORY_LABELS, g as getAudioContext } from "./samplePack-DtORUwJS.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
async function isSampleCached(url) {
  if (!("caches" in window)) return true;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    return !!match;
  } catch {
    return true;
  }
}
async function warnIfNotCached(url) {
  if (localStorage.getItem(STORAGE_KEY) === "v1") return false;
  if (!url.startsWith("/data/samples/packs/")) return false;
  const cached = await isSampleCached(url);
  if (!cached) {
    notify.warning("Sample packs are still downloading — try again in a moment");
    return true;
  }
  return false;
}
const SamplePackBrowser = ({ onClose, mode = "instrument", onSelectSample }) => {
  const { currentInstrumentId, updateInstrument, setPreviewInstrument } = useInstrumentStore();
  const { uploadZip, uploadDirectory, removeUserPack } = useSamplePackStore();
  const allPacks = useAllSamplePacks();
  const isDrumpadMode = mode === "drumpad";
  const [selectedPack, setSelectedPack] = reactExports.useState(allPacks[0] || null);
  const [activeCategory, setActiveCategory] = reactExports.useState("kicks");
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const [selectedSamples, setSelectedSamples] = reactExports.useState(/* @__PURE__ */ new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = reactExports.useState(null);
  const [isUploading, setIsUploading] = reactExports.useState(false);
  const [isDecoding, setIsDecoding] = reactExports.useState(false);
  const [, setIsPlaying] = reactExports.useState(false);
  const [playingSample, setPlayingSample] = reactExports.useState(null);
  const playerRef = reactExports.useRef(null);
  const previewVersionRef = reactExports.useRef(0);
  const isMountedRef = reactExports.useRef(true);
  const zipInputRef = reactExports.useRef(null);
  const dirInputRef = reactExports.useRef(null);
  const audioFileInputRef = reactExports.useRef(null);
  const primarySample = React.useMemo(() => {
    if (selectedSamples.size === 0 || !selectedPack) return null;
    const firstUrl = Array.from(selectedSamples)[selectedSamples.size - 1];
    for (const cat of selectedPack.categories) {
      const found = selectedPack.samples[cat].find((s) => s.url === firstUrl);
      if (found) return found;
    }
    return null;
  }, [selectedSamples, selectedPack]);
  const previewConfig = React.useMemo(() => {
    if (!primarySample) return null;
    return {
      id: 999,
      name: `Preview: ${primarySample.name}`,
      type: "sample",
      synthType: "Sampler",
      sample: {
        url: primarySample.url,
        baseNote: "C4",
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        reverse: false,
        playbackRate: 1
      },
      effects: [],
      volume: -6,
      pan: 0
    };
  }, [primarySample]);
  reactExports.useEffect(() => {
    if (isDrumpadMode) return;
    if (previewConfig) {
      setPreviewInstrument(previewConfig);
      try {
        getToneEngine().invalidateInstrument(999);
      } catch {
      }
    } else {
      setPreviewInstrument(null);
    }
    return () => {
      setPreviewInstrument(null);
      try {
        getToneEngine().invalidateInstrument(999);
      } catch {
      }
    };
  }, [previewConfig, setPreviewInstrument, isDrumpadMode]);
  reactExports.useEffect(() => {
    if (isDrumpadMode) return;
    const handleKeyDown = (e) => {
      var _a;
      if (((_a = document.activeElement) == null ? void 0 : _a.tagName) === "INPUT") return;
      const keyMap = {
        // Lower Octave
        "z": "C4",
        "s": "C#4",
        "x": "D4",
        "d": "D#4",
        "c": "E4",
        "v": "F4",
        "g": "F#4",
        "b": "G4",
        "h": "G#4",
        "n": "A4",
        "j": "A#4",
        "m": "B4",
        ",": "C5",
        // Upper Octave
        "q": "C5",
        "2": "C#5",
        "w": "D5",
        "3": "D#5",
        "e": "E5",
        "r": "F5",
        "5": "F#5",
        "t": "G5",
        "6": "G#5",
        "y": "A5",
        "7": "A#5",
        "u": "B5",
        "i": "C6"
      };
      const note = keyMap[e.key.toLowerCase()];
      if (note && primarySample && previewConfig) {
        const engine = getToneEngine();
        engine.triggerPolyNoteAttack(999, note, 1, previewConfig);
      }
    };
    const handleKeyUp = (e) => {
      var _a;
      if (((_a = document.activeElement) == null ? void 0 : _a.tagName) === "INPUT") return;
      const keyMap = {
        // Lower Octave
        "z": "C4",
        "s": "C#4",
        "x": "D4",
        "d": "D#4",
        "c": "E4",
        "v": "F4",
        "g": "F#4",
        "b": "G4",
        "h": "G#4",
        "n": "A4",
        "j": "A#4",
        "m": "B4",
        ",": "C5",
        // Upper Octave
        "q": "C5",
        "2": "C#5",
        "w": "D5",
        "3": "D#5",
        "e": "E5",
        "r": "F5",
        "5": "F#5",
        "t": "G5",
        "6": "G#5",
        "y": "A5",
        "7": "A#5",
        "u": "B5",
        "i": "C6"
      };
      const note = keyMap[e.key.toLowerCase()];
      if (note && primarySample && previewConfig) {
        const engine = getToneEngine();
        engine.triggerPolyNoteRelease(999, note, previewConfig);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [primarySample, previewConfig, isDrumpadMode]);
  reactExports.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
      }
    };
  }, []);
  reactExports.useEffect(() => {
    if (selectedPack && !allPacks.find((p) => p.id === selectedPack.id)) {
      setSelectedPack(allPacks[0] || null);
      setSelectedSamples(/* @__PURE__ */ new Set());
    } else if (!selectedPack && allPacks.length > 0) {
      setSelectedPack(allPacks[0]);
    }
  }, [allPacks, selectedPack]);
  const getFilteredSamples = () => {
    if (!selectedPack) return [];
    const samples = selectedPack.samples[activeCategory] || [];
    if (!searchQuery.trim()) return samples;
    const query = searchQuery.toLowerCase();
    return samples.filter(
      (sample) => sample.name.toLowerCase().includes(query) || sample.filename.toLowerCase().includes(query)
    );
  };
  const filteredSamples = getFilteredSamples();
  const handleSampleClick = (sample, index, event) => {
    const newSelection = new Set(selectedSamples);
    if (isDrumpadMode) {
      newSelection.clear();
      newSelection.add(sample.url);
      previewSample(sample);
    } else if (event.shiftKey && lastSelectedIndex !== null) {
      const start2 = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start2; i <= end; i++) {
        newSelection.add(filteredSamples[i].url);
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (newSelection.has(sample.url)) {
        newSelection.delete(sample.url);
      } else {
        newSelection.add(sample.url);
      }
    } else {
      newSelection.clear();
      newSelection.add(sample.url);
      previewSample(sample);
    }
    setSelectedSamples(newSelection);
    setLastSelectedIndex(index);
  };
  const previewSample = async (sample) => {
    if (await warnIfNotCached(sample.url)) return;
    const currentVersion = ++previewVersionRef.current;
    try {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
        playerRef.current = null;
      }
      await start();
      setPlayingSample(sample.url);
      setIsPlaying(true);
      const player = new Player({
        url: normalizeUrl(sample.url),
        onload: () => {
          if (previewVersionRef.current === currentVersion) {
            player.start();
          }
        },
        onstop: () => {
          if (previewVersionRef.current === currentVersion) {
            setIsPlaying(false);
            setPlayingSample(null);
          }
        }
      }).toDestination();
      playerRef.current = player;
    } catch (error) {
      console.error("Error previewing sample:", error);
      if (previewVersionRef.current === currentVersion) {
        setIsPlaying(false);
        setPlayingSample(null);
      }
    }
  };
  const stopPreview = () => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setIsPlaying(false);
    setPlayingSample(null);
  };
  const handleLoadSamples = async () => {
    if (selectedSamples.size === 0 || !selectedPack) return;
    const firstUrl = Array.from(selectedSamples)[0];
    if (await warnIfNotCached(firstUrl)) return;
    const urls = Array.from(selectedSamples);
    const samplesToLoad = [];
    for (const url of urls) {
      for (const cat of selectedPack.categories) {
        const found = selectedPack.samples[cat].find((s) => s.url === url);
        if (found) {
          samplesToLoad.push(found);
          break;
        }
      }
    }
    const { createInstrument, getInstrument } = useInstrumentStore.getState();
    const first = samplesToLoad[0];
    const currentExists = currentInstrumentId !== null && getInstrument(currentInstrumentId);
    let firstInstrumentId;
    if (currentExists) {
      updateInstrument(currentInstrumentId, {
        type: "sample",
        name: first.name,
        synthType: "Sampler",
        sample: {
          url: first.url,
          baseNote: "C4",
          detune: 0,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          reverse: false,
          playbackRate: 1
        },
        effects: [],
        volume: -6,
        pan: 0
      });
      firstInstrumentId = currentInstrumentId;
    } else {
      firstInstrumentId = createInstrument({
        type: "sample",
        name: first.name,
        synthType: "Sampler",
        sample: {
          url: first.url,
          baseNote: "C4",
          detune: 0,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          reverse: false,
          playbackRate: 1
        },
        effects: [],
        volume: -6,
        pan: 0
      });
    }
    try {
      getToneEngine().invalidateInstrument(firstInstrumentId);
    } catch {
    }
    if (samplesToLoad.length > 1) {
      for (let i = 1; i < samplesToLoad.length; i++) {
        const s = samplesToLoad[i];
        createInstrument({
          type: "sample",
          name: s.name,
          synthType: "Sampler",
          sample: {
            url: s.url,
            baseNote: "C4",
            detune: 0,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            reverse: false,
            playbackRate: 1
          },
          effects: [],
          volume: -6,
          pan: 0
        });
      }
    }
    setPreviewInstrument(null);
    try {
      getToneEngine().invalidateInstrument(999);
    } catch {
    }
    try {
      const allInstruments = useInstrumentStore.getState().instruments;
      getToneEngine().preloadInstruments(allInstruments).catch((err) => console.warn("Instrument preload failed:", err));
    } catch {
    }
    onClose();
  };
  const handleLoadSampleDrumpad = async () => {
    if (selectedSamples.size === 0 || !selectedPack || !onSelectSample) return;
    const url = Array.from(selectedSamples)[0];
    if (await warnIfNotCached(url)) return;
    let sampleInfo;
    for (const cat of selectedPack.categories) {
      sampleInfo = selectedPack.samples[cat].find((s) => s.url === url);
      if (sampleInfo) break;
    }
    if (!sampleInfo) return;
    setIsDecoding(true);
    try {
      const audioContext = getAudioContext();
      const resp = await fetch(normalizeUrl(sampleInfo.url));
      if (!resp.ok) throw new Error(`Failed to fetch sample: ${resp.status}`);
      const arrayBuffer = await resp.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const sampleData = {
        id: `pack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: sampleInfo.name,
        audioBuffer,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate
      };
      onSelectSample(sampleData);
      onClose();
    } catch (error) {
      console.error("[SamplePackBrowser] Failed to decode sample:", error);
      alert("Failed to load sample. Please try again.");
    } finally {
      if (isMountedRef.current) setIsDecoding(false);
    }
  };
  const handleAudioFileUpload = async (e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file) return;
    setIsDecoding(true);
    try {
      const audioContext = getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const name = file.name.replace(/\.[^/.]+$/, "");
      if (isDrumpadMode && onSelectSample) {
        const sampleData = {
          id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          audioBuffer,
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate
        };
        onSelectSample(sampleData);
        onClose();
      } else {
        const blob = new Blob([arrayBuffer], { type: file.type || "audio/wav" });
        const blobUrl = URL.createObjectURL(blob);
        const { createInstrument } = useInstrumentStore.getState();
        createInstrument({
          type: "sample",
          name,
          synthType: "Sampler",
          sample: {
            url: blobUrl,
            baseNote: "C4",
            detune: 0,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            reverse: false,
            playbackRate: 1
          },
          effects: [],
          volume: -6,
          pan: 0
        });
        onClose();
      }
    } catch (error) {
      console.error("[SamplePackBrowser] Failed to load audio file:", error);
      alert("Failed to load audio file. Ensure it's a valid audio format.");
    } finally {
      if (isMountedRef.current) setIsDecoding(false);
      if (audioFileInputRef.current) audioFileInputRef.current.value = "";
    }
  };
  const handleZipUpload = async (e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const pack = await uploadZip(file);
      if (isMountedRef.current) {
        setSelectedPack(pack);
        if (pack.categories.length > 0) {
          setActiveCategory(pack.categories[0]);
        }
      }
    } catch {
      if (isMountedRef.current) {
        alert("Failed to load ZIP pack. Ensure it contains audio files.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
    if (zipInputRef.current) zipInputRef.current.value = "";
  };
  const handleDirUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const pack = await uploadDirectory(files);
      if (isMountedRef.current) {
        setSelectedPack(pack);
        if (pack.categories.length > 0) {
          setActiveCategory(pack.categories[0]);
        }
      }
    } catch {
      if (isMountedRef.current) {
        alert("Failed to load directory. Ensure it contains audio files.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
    if (dirInputRef.current) dirInputRef.current.value = "";
  };
  const handleDeletePack = (e, packId) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this sample pack?")) {
      removeUserPack(packId);
    }
  };
  const getCategoryIcon = (category) => {
    switch (category) {
      case "kicks":
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 619,
          columnNumber: 16
        }, void 0);
      case "snares":
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Disc3, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 621,
          columnNumber: 16
        }, void 0);
      case "hihats":
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 623,
          columnNumber: 16
        }, void 0);
      case "percussion":
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 625,
          columnNumber: 16
        }, void 0);
      case "fx":
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sparkles, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 627,
          columnNumber: 16
        }, void 0);
      default:
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 14 }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 629,
          columnNumber: 16
        }, void 0);
    }
  };
  const getCategoryColor = (category) => {
    const colors = {
      kicks: "text-red-400",
      snares: "text-orange-400",
      hihats: "text-yellow-400",
      claps: "text-pink-400",
      percussion: "text-purple-400",
      fx: "text-green-400"
    };
    return colors[category] || "text-ft2-highlight";
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/90 pt-16", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full bg-ft2-bg flex flex-col overflow-hidden border-t-2 border-ft2-border relative", children: [
    (isUploading || isDecoding) && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 z-[99990] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-6 bg-ft2-header border-2 border-ft2-highlight rounded-xl shadow-2xl flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Package, { size: 48, className: "text-ft2-highlight animate-bounce" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 653,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-ft2-highlight font-black text-xl tracking-tighter", children: isDecoding ? "DECODING..." : "PACKING..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 655,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-ft2-textDim text-xs font-bold uppercase", children: "Processing audio files" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 658,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 654,
        columnNumber: 15
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
      lineNumber: 652,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
      lineNumber: 651,
      columnNumber: 11
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Package, { size: 20, className: "text-ft2-highlight" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 667,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-ft2-highlight font-bold text-sm", children: isDrumpadMode ? "SELECT SAMPLE" : "SAMPLE PACKS" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 669,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-ft2-textDim text-xs", children: "Browse and load samples" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 672,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 668,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 666,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = audioFileInputRef.current) == null ? void 0 : _a.click();
            },
            className: "flex items-center gap-2 px-3 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-text rounded transition-colors text-xs font-bold",
            title: "Upload single audio file",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FileHeadphone, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 681,
                columnNumber: 15
              }, void 0),
              "AUDIO"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 676,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = zipInputRef.current) == null ? void 0 : _a.click();
            },
            className: "flex items-center gap-2 px-3 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-text rounded transition-colors text-xs font-bold",
            title: "Upload ZIP pack",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Upload, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 689,
                columnNumber: 15
              }, void 0),
              "ZIP"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 684,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              var _a;
              return (_a = dirInputRef.current) == null ? void 0 : _a.click();
            },
            className: "flex items-center gap-2 px-3 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-text rounded transition-colors text-xs font-bold",
            title: "Upload Folder (supports Max for Live device folders)",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Folder, { size: 14 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 697,
                columnNumber: 15
              }, void 0),
              "FOLDER / M4L"
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 692,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "p-2 text-ft2-textDim hover:text-ft2-text hover:bg-ft2-border rounded transition-colors",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 20 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 704,
              columnNumber: 15
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 700,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 675,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          ref: audioFileInputRef,
          type: "file",
          accept: "audio/*,.wav,.mp3,.ogg,.flac",
          className: "hidden",
          onChange: handleAudioFileUpload
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 709,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          ref: zipInputRef,
          type: "file",
          accept: ".zip",
          className: "hidden",
          onChange: handleZipUpload
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 716,
          columnNumber: 11
        },
        void 0
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          ref: dirInputRef,
          type: "file",
          ...{ webkitdirectory: "", directory: "" },
          className: "hidden",
          onChange: handleDirUpload
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 723,
          columnNumber: 11
        },
        void 0
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
      lineNumber: 665,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-64 bg-ft2-header border-r border-ft2-border flex flex-col", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 border-b border-ft2-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-ft2-text font-bold text-xs mb-2", children: "AVAILABLE PACKS" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 736,
          columnNumber: 15
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 735,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto p-2 scrollbar-ft2", children: allPacks.map((pack) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => {
              setSelectedPack(pack);
              if (pack.categories.length > 0) {
                setActiveCategory(pack.categories[0]);
              }
            },
            className: `w-full p-3 rounded mb-2 text-left transition-all group ${(selectedPack == null ? void 0 : selectedPack.id) === pack.id ? "bg-ft2-cursor text-ft2-bg" : "bg-ft2-bg border border-ft2-border hover:border-ft2-highlight"}`,
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-3", children: [
              pack.coverImage ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "img",
                {
                  src: normalizeUrl(pack.coverImage),
                  alt: pack.name,
                  className: "w-12 h-12 rounded object-cover shrink-0"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                  lineNumber: 757,
                  columnNumber: 23
                },
                void 0
              ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `w-12 h-12 rounded shrink-0 flex items-center justify-center border ${(selectedPack == null ? void 0 : selectedPack.id) === pack.id ? "bg-ft2-bg/20 border-ft2-bg/30 text-ft2-bg" : "bg-ft2-bg border-ft2-border text-ft2-highlight"}`, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Package, { size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 768,
                columnNumber: 25
              }, void 0) }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 763,
                columnNumber: 23
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between gap-1", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "div",
                    {
                      className: `font-bold text-sm truncate ${(selectedPack == null ? void 0 : selectedPack.id) === pack.id ? "text-ft2-bg" : "text-ft2-text"}`,
                      children: pack.name
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                      lineNumber: 773,
                      columnNumber: 25
                    },
                    void 0
                  ),
                  pack.isUserUploaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: (e) => handleDeletePack(e, pack.id),
                      className: `p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${(selectedPack == null ? void 0 : selectedPack.id) === pack.id ? "hover:bg-ft2-bg/20 text-ft2-bg" : "hover:bg-ft2-border text-red-400"}`,
                      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 12 }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                        lineNumber: 787,
                        columnNumber: 29
                      }, void 0)
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                      lineNumber: 781,
                      columnNumber: 27
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                  lineNumber: 772,
                  columnNumber: 23
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: `text-xs truncate ${(selectedPack == null ? void 0 : selectedPack.id) === pack.id ? "text-ft2-bg/70" : "text-ft2-textDim"}`,
                    children: [
                      "by ",
                      pack.author
                    ]
                  },
                  void 0,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                    lineNumber: 791,
                    columnNumber: 23
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: `text-xs mt-1 ${(selectedPack == null ? void 0 : selectedPack.id) === pack.id ? "text-ft2-bg/70" : "text-ft2-textDim"}`,
                    children: [
                      pack.sampleCount,
                      " samples"
                    ]
                  },
                  void 0,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                    lineNumber: 798,
                    columnNumber: 23
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 771,
                columnNumber: 21
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 755,
              columnNumber: 19
            }, void 0)
          },
          pack.id,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 740,
            columnNumber: 17
          },
          void 0
        )) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 738,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 734,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col overflow-hidden", children: selectedPack ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-3 bg-ft2-header border-b border-ft2-border shrink-0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
          selectedPack.coverImage ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "img",
            {
              src: normalizeUrl(selectedPack.coverImage),
              alt: selectedPack.name,
              className: "w-16 h-16 rounded object-cover border border-ft2-border"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 820,
              columnNumber: 23
            },
            void 0
          ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-16 h-16 rounded bg-ft2-bg border border-ft2-border flex items-center justify-center text-ft2-highlight", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Package, { size: 32 }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 827,
            columnNumber: 25
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 826,
            columnNumber: 23
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-ft2-text font-bold text-lg", children: selectedPack.name }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 831,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-ft2-textDim text-xs mt-1 max-w-2xl", children: selectedPack.description }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 832,
              columnNumber: 23
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 mt-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] px-1.5 py-0.5 bg-ft2-bg border border-ft2-border text-ft2-textDim rounded", children: selectedPack.author }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 834,
                columnNumber: 25
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] px-1.5 py-0.5 bg-ft2-bg border border-ft2-border text-ft2-textDim rounded", children: [
                selectedPack.sampleCount,
                " SAMPLES"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 837,
                columnNumber: 25
              }, void 0),
              selectedPack.isUserUploaded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] px-1.5 py-0.5 bg-accent-primary/20 text-accent-primary rounded font-bold", children: "USER UPLOAD" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 841,
                columnNumber: 27
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 833,
              columnNumber: 23
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 830,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 818,
          columnNumber: 19
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 817,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-3 bg-ft2-header border-b border-ft2-border shrink-0", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Search,
            {
              size: 16,
              className: "absolute left-3 top-1/2 -translate-y-1/2 text-ft2-textDim"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 853,
              columnNumber: 21
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              type: "text",
              value: searchQuery,
              onChange: (e) => {
                setSearchQuery(e.target.value);
                setSelectedSamples(/* @__PURE__ */ new Set());
                setLastSelectedIndex(null);
              },
              placeholder: "Search samples...",
              className: "w-full pl-10 pr-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 857,
              columnNumber: 21
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 852,
          columnNumber: 19
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 851,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1 px-4 py-2 bg-ft2-header border-b border-ft2-border overflow-x-auto shrink-0", children: selectedPack.categories.map((category) => {
          var _a;
          const isActive = activeCategory === category;
          const sampleCount = ((_a = selectedPack.samples[category]) == null ? void 0 : _a.length) || 0;
          if (sampleCount === 0) return null;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => {
                setActiveCategory(category);
                setSelectedSamples(/* @__PURE__ */ new Set());
                setLastSelectedIndex(null);
              },
              className: `
                          flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap
                          ${isActive ? "bg-ft2-cursor text-ft2-bg" : `bg-ft2-bg border border-ft2-border hover:border-ft2-highlight ${getCategoryColor(category)}`}
                        `,
              children: [
                getCategoryIcon(category),
                SAMPLE_CATEGORY_LABELS[category].toUpperCase(),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "span",
                  {
                    className: `text-[10px] ${isActive ? "text-ft2-bg/70" : "text-ft2-textDim"}`,
                    children: [
                      "(",
                      sampleCount,
                      ")"
                    ]
                  },
                  void 0,
                  true,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                    lineNumber: 897,
                    columnNumber: 25
                  },
                  void 0
                )
              ]
            },
            category,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 879,
              columnNumber: 23
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 872,
          columnNumber: 17
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto p-4 scrollbar-ft2", children: filteredSamples.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-full text-ft2-textDim", children: searchQuery ? `No samples found matching "${searchQuery}"` : "No samples in this category" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 910,
          columnNumber: 21
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2", children: filteredSamples.map((sample, index) => {
          const isSelected = selectedSamples.has(sample.url);
          const isCurrentlyPlaying = playingSample === sample.url;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              role: "button",
              tabIndex: 0,
              onClick: (e) => handleSampleClick(sample, index, e),
              onDoubleClick: () => isDrumpadMode ? handleLoadSampleDrumpad() : handleLoadSamples(),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  if (isDrumpadMode) {
                    handleLoadSampleDrumpad();
                  } else {
                    handleLoadSamples();
                  }
                }
              },
              className: `
                              p-2 rounded border text-left transition-all group cursor-pointer
                              ${isSelected ? "bg-ft2-cursor text-ft2-bg border-ft2-cursor" : "bg-ft2-header border-ft2-border hover:border-ft2-highlight"}
                            `,
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      if (isCurrentlyPlaying) {
                        stopPreview();
                      } else {
                        previewSample(sample);
                      }
                    },
                    className: `
                                  w-7 h-7 rounded flex items-center justify-center transition-colors shrink-0
                                  ${isSelected ? "bg-ft2-bg/20 hover:bg-ft2-bg/30" : "bg-ft2-border hover:bg-ft2-highlight/20"}
                                `,
                    children: isCurrentlyPlaying ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      Square,
                      {
                        size: 12,
                        className: isSelected ? "text-ft2-bg" : "text-ft2-highlight"
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                        lineNumber: 960,
                        columnNumber: 35
                      },
                      void 0
                    ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                      Play,
                      {
                        size: 12,
                        className: isSelected ? "text-ft2-bg" : "text-ft2-text"
                      },
                      void 0,
                      false,
                      {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                        lineNumber: 965,
                        columnNumber: 35
                      },
                      void 0
                    )
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                    lineNumber: 941,
                    columnNumber: 31
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "span",
                  {
                    className: `font-medium text-xs truncate ${isSelected ? "text-ft2-bg" : "text-ft2-text"}`,
                    children: sample.name
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                    lineNumber: 971,
                    columnNumber: 31
                  },
                  void 0
                )
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 940,
                columnNumber: 29
              }, void 0)
            },
            sample.url,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
              lineNumber: 920,
              columnNumber: 27
            },
            void 0
          );
        }) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 914,
          columnNumber: 21
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 908,
          columnNumber: 17
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 815,
        columnNumber: 15
      }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center text-ft2-textDim", children: "Select a sample pack to browse" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 987,
        columnNumber: 15
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 813,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
      lineNumber: 732,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 bg-ft2-header border-t-2 border-ft2-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-textDim text-xs", children: selectedPack && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
          filteredSamples.length,
          " sample",
          filteredSamples.length !== 1 ? "s" : "",
          " in",
          " ",
          SAMPLE_CATEGORY_LABELS[activeCategory],
          selectedSamples.size > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "ml-2 text-ft2-text", children: [
            "• ",
            selectedSamples.size,
            " selected. Double-click or click Load to use."
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 1003,
            columnNumber: 21
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 999,
          columnNumber: 17
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 997,
          columnNumber: 13
        }, void 0),
        !isDrumpadMode && primarySample && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded animate-pulse-glow", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 12, className: "text-amber-400 fill-amber-400" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 1014,
            columnNumber: 17
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] font-black text-amber-400 uppercase tracking-widest", children: "JAM ACTIVE" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 1015,
            columnNumber: 17
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
          lineNumber: 1013,
          columnNumber: 15
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 996,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "px-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text hover:border-ft2-highlight rounded transition-colors",
            children: "Cancel"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 1020,
            columnNumber: 13
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: isDrumpadMode ? handleLoadSampleDrumpad : handleLoadSamples,
            disabled: selectedSamples.size === 0,
            className: "flex items-center gap-2 px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold hover:bg-ft2-highlight rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Check, { size: 16 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
                lineNumber: 1031,
                columnNumber: 15
              }, void 0),
              isDrumpadMode ? "Load Sample" : `Load ${selectedSamples.size > 1 ? `${selectedSamples.size} Samples` : "Sample"}`
            ]
          },
          void 0,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
            lineNumber: 1026,
            columnNumber: 13
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
        lineNumber: 1019,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
      lineNumber: 995,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
    lineNumber: 648,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/SamplePackBrowser.tsx",
    lineNumber: 647,
    columnNumber: 5
  }, void 0);
};
export {
  SamplePackBrowser
};
