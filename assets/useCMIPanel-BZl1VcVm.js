import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { cP as WAVE_NAMES, a as useUIStore, cV as useShallow, e as useInstrumentStore, Q as useMIDIStore, dj as getBuiltinHarmonics, dk as generateFromHarmonics, dl as getBuiltinWaveform, dm as generateEnvelopeCurve, dn as floatToUint8PCM, bO as getDevilboxAudioContext, cO as NUM_HARMONICS, cR as formatCutoffHz, $ as getToneEngine } from "./main-BbV5VyEH.js";
const CMI_PRESETS = [
  {
    name: "Init",
    description: "Default CMI patch — bright, snappy",
    params: { volume: 200, wave_select: 0, filter_cutoff: 200, filter_track: 128, attack_time: 10, release_time: 80, envelope_rate: 200 }
  },
  {
    name: "Bright Strings",
    description: "Lush sawtooth strings — Orch5 style",
    params: { volume: 200, wave_select: 1, filter_cutoff: 220, filter_track: 100, attack_time: 60, release_time: 120, envelope_rate: 245 }
  },
  {
    name: "Dark Pad",
    description: "Filtered triangle pad — warm and evolving",
    params: { volume: 210, wave_select: 3, filter_cutoff: 100, filter_track: 60, attack_time: 120, release_time: 180, envelope_rate: 230 }
  },
  {
    name: "Choir",
    description: "Ethereal choir waveform — Peter Gabriel era",
    params: { volume: 190, wave_select: 5, filter_cutoff: 180, filter_track: 90, attack_time: 80, release_time: 150, envelope_rate: 240 }
  },
  {
    name: "Organ",
    description: "Classic Fairlight organ — multiple harmonics",
    params: { volume: 200, wave_select: 6, filter_cutoff: 240, filter_track: 128, attack_time: 5, release_time: 40, envelope_rate: 250 }
  },
  {
    name: "Bass",
    description: "Deep subtractive bass — square wave filtered",
    params: { volume: 220, wave_select: 7, filter_cutoff: 120, filter_track: 40, attack_time: 5, release_time: 60, envelope_rate: 200 }
  },
  {
    name: "Pluck",
    description: "Short plucked — fast attack, quick decay",
    params: { volume: 200, wave_select: 1, filter_cutoff: 240, filter_track: 180, attack_time: 2, release_time: 30, envelope_rate: 150 }
  },
  {
    name: "Bell",
    description: "Metallic bell — sine with fast filter sweep",
    params: { volume: 180, wave_select: 0, filter_cutoff: 255, filter_track: 200, attack_time: 2, release_time: 200, envelope_rate: 180 }
  },
  {
    name: "Mellow Keys",
    description: "Soft electric piano — gentle attack",
    params: { volume: 190, wave_select: 4, filter_cutoff: 160, filter_track: 100, attack_time: 15, release_time: 100, envelope_rate: 220 }
  },
  {
    name: "Sweep",
    description: "Filter sweep pad — Art of Noise style",
    params: { volume: 200, wave_select: 2, filter_cutoff: 60, filter_track: 200, attack_time: 100, release_time: 200, envelope_rate: 210 }
  },
  {
    name: "Stab",
    description: "Aggressive stab — bright square, fast envelope",
    params: { volume: 230, wave_select: 2, filter_cutoff: 255, filter_track: 128, attack_time: 1, release_time: 20, envelope_rate: 120 }
  },
  {
    name: "Atmosphere",
    description: "Evolving atmosphere — slow attack, long release",
    params: { volume: 180, wave_select: 3, filter_cutoff: 140, filter_track: 60, attack_time: 200, release_time: 250, envelope_rate: 250 }
  }
];
const CMI_SAMPLES_BASE = "data/samples/packs/fairlight-cmi";
let _manifestCache = null;
let _manifestLoading = false;
const _manifestListeners = [];
async function loadManifest() {
  if (_manifestCache) return _manifestCache;
  if (_manifestLoading) {
    return new Promise((resolve) => {
      _manifestListeners.push(resolve);
    });
  }
  _manifestLoading = true;
  try {
    const resp = await fetch(`/${CMI_SAMPLES_BASE}/manifest.json`);
    _manifestCache = await resp.json();
    _manifestListeners.forEach((cb) => cb(_manifestCache));
    _manifestListeners.length = 0;
    return _manifestCache;
  } finally {
    _manifestLoading = false;
  }
}
function getCMISynthInstance(instrumentId) {
  if (instrumentId == null) return null;
  try {
    const engine = getToneEngine();
    const key = instrumentId << 16 | 65535;
    const synth = engine.instruments.get(key);
    if (synth && typeof synth.loadSampleAll === "function") return synth;
    return null;
  } catch {
    return null;
  }
}
const CMI_TAB_DEFS = [
  { id: "harmonic", label: "HARMONIC", pageNum: "7" },
  { id: "wave", label: "WAVE", pageNum: "5" },
  { id: "control", label: "CONTROL", pageNum: "6" },
  { id: "filter", label: "FILTER", pageNum: "F" },
  { id: "envelope", label: "ENVELOPE", pageNum: "E" }
];
const CMI_COLLAPSED_H = 40;
const CMI_HEADER_H = 36;
const CMI_TAB_BAR_H = 28;
const CMI_CONTENT_H = 260;
const CMI_EXPANDED_H = CMI_HEADER_H + CMI_TAB_BAR_H + CMI_CONTENT_H + 2;
const fmtInt = (v) => `${Math.round(v)}`;
const fmtWave = (v) => WAVE_NAMES[Math.round(v)] ?? `${Math.round(v)}`;
const fmtCutoff = (v) => formatCutoffHz(v);
const fmtTrack = (v) => `${Math.round(v / 255 * 100)}%`;
function useCMIPanel(props) {
  const { externalParams, externalOnChange, instrumentId: extInstId } = props ?? {};
  const { cmiCollapsed, toggleCMICollapsed } = useUIStore(
    useShallow((s) => ({
      cmiCollapsed: s.cmiCollapsed ?? false,
      toggleCMICollapsed: s.toggleCMICollapsed
    }))
  );
  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((s) => ({
      instruments: s.instruments,
      updateInstrument: s.updateInstrument
    }))
  );
  const { controlledInstrumentId } = useMIDIStore();
  const targetInstrument = extInstId ? instruments.find((i) => i.id === extInstId) : controlledInstrumentId ? instruments.find((i) => i.id === controlledInstrumentId && i.synthType === "MAMECMI") : instruments.find((i) => i.synthType === "MAMECMI");
  const params = externalParams ?? (targetInstrument == null ? void 0 : targetInstrument.parameters) ?? {};
  const p = (key, fallback) => {
    const v = params[key];
    return typeof v === "number" ? v : fallback;
  };
  const volume = p("volume", 200);
  const waveSelect = p("wave_select", 0);
  const cutoff = p("filter_cutoff", 200);
  const filterTrack = p("filter_track", 128);
  const attackTime = p("attack_time", 10);
  const releaseTime = p("release_time", 80);
  const envRate = p("envelope_rate", 200);
  const waveBank = Math.round(waveSelect);
  const [activeTab, setActiveTab] = reactExports.useState("harmonic");
  const [harmonics, setHarmonics] = reactExports.useState(() => getBuiltinHarmonics(0));
  const harmonicDragActive = reactExports.useRef(false);
  const [sampleLoaded, setSampleLoaded] = reactExports.useState(false);
  const [sampleName, setSampleName] = reactExports.useState("");
  const [sampleWaveform, setSampleWaveform] = reactExports.useState(null);
  const [manifest, setManifest] = reactExports.useState(_manifestCache);
  const [libraryCategoryIndex, setLibraryCategoryIndex] = reactExports.useState(0);
  const [librarySampleIndex, setLibrarySampleIndex] = reactExports.useState(-1);
  const [libraryLoading, setLibraryLoading] = reactExports.useState(false);
  reactExports.useEffect(() => {
    loadManifest().then(setManifest);
  }, []);
  const libraryCategories = reactExports.useMemo(
    () => (manifest == null ? void 0 : manifest.categories.map((c) => c.name)) ?? [],
    [manifest]
  );
  const librarySamples = reactExports.useMemo(
    () => {
      var _a;
      return ((_a = manifest == null ? void 0 : manifest.categories[libraryCategoryIndex]) == null ? void 0 : _a.samples) ?? [];
    },
    [manifest, libraryCategoryIndex]
  );
  const customWaveform = reactExports.useMemo(() => generateFromHarmonics(harmonics), [harmonics]);
  const builtinWaveform = reactExports.useMemo(() => getBuiltinWaveform(waveBank), [waveBank]);
  const envelopeCurve = reactExports.useMemo(
    () => generateEnvelopeCurve(attackTime, releaseTime, envRate, 100),
    [attackTime, releaseTime, envRate]
  );
  const chIndex = targetInstrument ? instruments.indexOf(targetInstrument) : -1;
  const chLabel = chIndex >= 0 ? `CH${String(chIndex + 1).padStart(2, "0")}` : "CH--";
  const handleParamChange = reactExports.useCallback(
    (key, value) => {
      const rounded = Math.round(value);
      if (externalOnChange) {
        externalOnChange(key, rounded);
        return;
      }
      if (!targetInstrument) return;
      const latest = useInstrumentStore.getState().instruments.find((i) => i.id === targetInstrument.id);
      if (!latest) return;
      updateInstrument(targetInstrument.id, {
        parameters: { ...latest.parameters, [key]: rounded }
      });
    },
    [targetInstrument, updateInstrument, externalOnChange]
  );
  const selectWavePreset = reactExports.useCallback(
    (bank) => {
      setHarmonics(getBuiltinHarmonics(bank));
      handleParamChange("wave_select", bank);
      const synth = getCMISynthInstance(targetInstrument == null ? void 0 : targetInstrument.id);
      if (synth) {
        const wf = getBuiltinWaveform(bank);
        synth.loadSampleAll(floatToUint8PCM(wf));
      }
    },
    [handleParamChange, targetInstrument]
  );
  const syncHarmonicsToEngine = reactExports.useCallback(() => {
    const synth = getCMISynthInstance(targetInstrument == null ? void 0 : targetInstrument.id);
    if (!synth) return;
    const wf = generateFromHarmonics(harmonics);
    synth.loadSampleAll(floatToUint8PCM(wf));
    setSampleName("Harmonic");
    setSampleLoaded(true);
    setSampleWaveform(wf);
  }, [harmonics, targetInstrument]);
  const prevHarmonicsRef = reactExports.useRef(harmonics);
  reactExports.useEffect(() => {
    if (prevHarmonicsRef.current !== harmonics && !harmonicDragActive.current) {
      syncHarmonicsToEngine();
    }
    prevHarmonicsRef.current = harmonics;
  }, [harmonics, syncHarmonicsToEngine]);
  const loadSampleFromFile = reactExports.useCallback(async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();
      const src = decoded.getChannelData(0);
      const maxSamples = 16384;
      const outLen = Math.min(src.length, maxSamples);
      const ratio = src.length / outLen;
      const floatSamples = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        floatSamples[i] = src[Math.min(Math.floor(i * ratio), src.length - 1)];
      }
      let peak = 0;
      for (let i = 0; i < floatSamples.length; i++) peak = Math.max(peak, Math.abs(floatSamples[i]));
      if (peak > 0) for (let i = 0; i < floatSamples.length; i++) floatSamples[i] /= peak;
      const synth = getCMISynthInstance(targetInstrument == null ? void 0 : targetInstrument.id);
      if (synth) synth.loadSampleAll(floatToUint8PCM(floatSamples));
      setSampleName(file.name.replace(/\.[^.]+$/, ""));
      setSampleLoaded(true);
      setSampleWaveform(floatSamples);
      console.log(`[CMI] Loaded "${file.name}" — ${outLen} samples → 8-bit PCM → all voices`);
    } catch (err) {
      console.error("[CMI] Sample load error:", err);
    }
  }, [targetInstrument]);
  const loadLibrarySample = reactExports.useCallback((sampleIndex) => {
    if (!manifest) return;
    const cat = manifest.categories[libraryCategoryIndex];
    if (!cat) return;
    const sample = cat.samples[sampleIndex];
    if (!sample) return;
    setLibrarySampleIndex(sampleIndex);
    setLibraryLoading(true);
    const url = `/${CMI_SAMPLES_BASE}/${cat.name}/${sample.file}`;
    fetch(url).then((resp) => resp.arrayBuffer()).then((buf) => {
      const view = new DataView(buf);
      let dataOffset = 44;
      let dataSize = buf.byteLength - 44;
      if (view.getUint32(0, false) === 1380533830) {
        let off = 12;
        while (off < buf.byteLength - 8) {
          const chunkId = view.getUint32(off, false);
          const chunkSize = view.getUint32(off + 4, true);
          if (chunkId === 1684108385) {
            dataOffset = off + 8;
            dataSize = chunkSize;
            break;
          }
          off += 8 + chunkSize;
          if (chunkSize % 2 !== 0) off++;
        }
      }
      const rawPCM = new Uint8Array(buf, dataOffset, Math.min(dataSize, 16384));
      const synth = getCMISynthInstance(targetInstrument == null ? void 0 : targetInstrument.id);
      if (synth) synth.loadSampleAll(rawPCM);
      const display = new Float32Array(rawPCM.length);
      for (let i = 0; i < rawPCM.length; i++) {
        display[i] = (rawPCM[i] - 128) / 127;
      }
      setSampleName(sample.name);
      setSampleLoaded(true);
      setSampleWaveform(display);
      setLibraryLoading(false);
      console.log(`[CMI] Loaded "${sample.name}" from library — ${rawPCM.length} bytes → all voices`);
    }).catch((err) => {
      console.error("[CMI] Library sample load error:", err);
      setLibraryLoading(false);
    });
  }, [manifest, libraryCategoryIndex, targetInstrument]);
  const prevLibrarySample = reactExports.useCallback(() => {
    const idx = librarySampleIndex <= 0 ? librarySamples.length - 1 : librarySampleIndex - 1;
    loadLibrarySample(idx);
  }, [librarySampleIndex, librarySamples.length, loadLibrarySample]);
  const nextLibrarySample = reactExports.useCallback(() => {
    const idx = librarySampleIndex >= librarySamples.length - 1 ? 0 : librarySampleIndex + 1;
    loadLibrarySample(idx);
  }, [librarySampleIndex, librarySamples.length, loadLibrarySample]);
  const previewSourceRef = reactExports.useRef(null);
  const [previewing, setPreviewing] = reactExports.useState(false);
  const previewLibrarySample = reactExports.useCallback(async (sampleIndex) => {
    const idx = sampleIndex ?? librarySampleIndex;
    if (!manifest) return;
    const cat = manifest.categories[libraryCategoryIndex];
    if (!cat) return;
    const sample = cat.samples[idx];
    if (!sample) return;
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
      } catch {
      }
      previewSourceRef.current = null;
    }
    const url = `/${CMI_SAMPLES_BASE}/${cat.name}/${encodeURIComponent(sample.file)}`;
    setPreviewing(true);
    try {
      const resp = await fetch(url);
      const buf = await resp.arrayBuffer();
      const ctx = getDevilboxAudioContext();
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        previewSourceRef.current = null;
        setPreviewing(false);
      };
      source.start(0);
      previewSourceRef.current = source;
    } catch (err) {
      console.error("[CMI] Preview error:", err);
      setPreviewing(false);
    }
  }, [manifest, libraryCategoryIndex, librarySampleIndex]);
  const stopPreview = reactExports.useCallback(() => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
      } catch {
      }
      previewSourceRef.current = null;
    }
    setPreviewing(false);
  }, []);
  const updateHarmonicAt = reactExports.useCallback((normalizedX, normalizedY) => {
    const barIndex = Math.floor(normalizedX * NUM_HARMONICS);
    if (barIndex < 0 || barIndex >= NUM_HARMONICS) return;
    const amplitude = Math.max(0, Math.min(1, 1 - normalizedY));
    setHarmonics((prev) => {
      const next = [...prev];
      next[barIndex] = amplitude;
      return next;
    });
  }, []);
  const startHarmonicDrag = reactExports.useCallback((normalizedX, normalizedY) => {
    harmonicDragActive.current = true;
    updateHarmonicAt(normalizedX, normalizedY);
  }, [updateHarmonicAt]);
  const endHarmonicDrag = reactExports.useCallback(() => {
    harmonicDragActive.current = false;
  }, []);
  const [voiceStatus, setVoiceStatus] = reactExports.useState(() => new Int32Array(64));
  reactExports.useEffect(() => {
    const instId = targetInstrument == null ? void 0 : targetInstrument.id;
    if (instId == null) return;
    const synth = getCMISynthInstance(instId);
    if (!synth || typeof synth.onVoiceStatus !== "function") return;
    const unsub = synth.onVoiceStatus((status) => setVoiceStatus(new Int32Array(status)));
    return unsub;
  }, [targetInstrument == null ? void 0 : targetInstrument.id]);
  const loadPreset = reactExports.useCallback((index) => {
    const preset = CMI_PRESETS[index];
    if (!preset) return;
    for (const [key, value] of Object.entries(preset.params)) {
      handleParamChange(key, value);
    }
  }, [handleParamChange]);
  return {
    found: !!targetInstrument,
    instrumentName: (targetInstrument == null ? void 0 : targetInstrument.name) ?? "",
    chLabel,
    instrumentId: targetInstrument == null ? void 0 : targetInstrument.id,
    volume,
    waveSelect,
    waveBank,
    cutoff,
    filterTrack,
    attackTime,
    releaseTime,
    envRate,
    harmonics,
    customWaveform,
    builtinWaveform,
    envelopeCurve,
    sampleLoaded,
    sampleName,
    sampleWaveform,
    libraryCategories,
    libraryCategoryIndex,
    librarySamples,
    librarySampleIndex,
    libraryLoading,
    setLibraryCategoryIndex,
    loadLibrarySample,
    prevLibrarySample,
    nextLibrarySample,
    activeTab,
    setActiveTab,
    collapsed: cmiCollapsed,
    toggleCollapsed: toggleCMICollapsed,
    handleParamChange,
    selectWavePreset,
    loadSampleFromFile,
    syncHarmonicsToEngine,
    harmonicDragActive,
    updateHarmonicAt,
    startHarmonicDrag,
    endHarmonicDrag,
    voiceStatus,
    presets: CMI_PRESETS,
    loadPreset,
    previewing,
    previewLibrarySample,
    stopPreview
  };
}
export {
  CMI_TAB_DEFS as C,
  fmtWave as a,
  fmtCutoff as b,
  fmtTrack as c,
  CMI_COLLAPSED_H as d,
  CMI_EXPANDED_H as e,
  fmtInt as f,
  CMI_HEADER_H as g,
  CMI_TAB_BAR_H as h,
  CMI_CONTENT_H as i,
  useCMIPanel as u
};
