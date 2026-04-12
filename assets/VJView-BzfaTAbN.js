const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/butterchurnPresets.min-CWEzsREE.js","assets/vendor-ui-AJ7AT9BN.js","assets/butterchurnPresetsExtra.min-Dvb-ReYl.js","assets/butterchurnPresetsExtra2.min-CPpLG3b-.js","assets/butterchurnPresetsMD1.min-BxN7w1WQ.js","assets/butterchurnPresetsNonMinimal.min-kDZm97qN.js","assets/ProjectMCanvas-CH6f-Kuj.js","assets/client-DHYdgbIN.js","assets/vendor-react-Dgd_wxYf.js","assets/AudioDataBus-DGyOo1ms.js","assets/vendor-tone-48TQc1H3.js","assets/KraftwerkHeadOverlay-DSz-G7Ky.js","assets/react-three-fiber.esm-C9Qiy9wi.js","assets/vendor-utils-a-Usm5Xm.js","assets/index-BU-6pTuc.js","assets/main-BbV5VyEH.js","assets/main-c6CPs1E0.css","assets/butterchurn-z8A4P4Xp.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload, aj as useMixerStore, ay as getTrackerReplayer, ax as useTransportStore, R as useTrackerStore, $ as getToneEngine, b as useDJStore, at as getDJEngineIfActive, W as CustomSelect, dB as VIEW_OPTIONS, dC as switchView, a as useUIStore, o as focusPopout, an as useSettingsStore, dD as getDJEngine, dE as TurntablePhysics } from "./main-BbV5VyEH.js";
import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, S as Search, X, aa as Star, b as ChevronRight, R as React, ab as Shuffle, ac as Pause, s as Play, ad as SkipForward, ae as List, E as ExternalLink, af as Minimize, ag as Maximize, A as Music, Z as Zap } from "./vendor-ui-AJ7AT9BN.js";
import { now, getContext, getDestination } from "./vendor-tone-48TQc1H3.js";
import { A as AudioDataBus } from "./AudioDataBus-DGyOo1ms.js";
import { a as startScratch, b as setScratchVelocity, c as stopScratch } from "./DJActions-Ap2A5JjP.js";
import { r as registerCaptureCanvas } from "./DJVideoCapture-DWBKuoDP.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-react-Dgd_wxYf.js";
import "./parseModuleToSong-B-Yqzlmn.js";
const FAVORITES_KEY = "devilbox-vj-favorites";
const PM_FAVORITES_KEY = "devilbox-vj-pm-favorites";
const ALL_CATEGORY = "★ All";
const FAVORITES_CATEGORY = "♥ Favorites";
let cachedPresets = null;
let cachedPresetMap = null;
async function loadAllPresets() {
  if (cachedPresets && cachedPresetMap) {
    return { entries: cachedPresets, presetMap: cachedPresetMap };
  }
  const [mainMod, extraMod, extra2Mod, md1Mod, nmMod] = await Promise.all([
    __vitePreload(() => import("./butterchurnPresets.min-CWEzsREE.js").then((n) => n.b), true ? __vite__mapDeps([0,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsExtra.min-Dvb-ReYl.js").then((n) => n.b), true ? __vite__mapDeps([2,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsExtra2.min-CPpLG3b-.js").then((n) => n.b), true ? __vite__mapDeps([3,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsMD1.min-BxN7w1WQ.js").then((n) => n.b), true ? __vite__mapDeps([4,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsNonMinimal.min-kDZm97qN.js").then((n) => n.b), true ? __vite__mapDeps([5,1]) : void 0)
  ]);
  const packs = [
    { mod: mainMod.default || mainMod, label: "Main" },
    { mod: extraMod.default || extraMod, label: "Extra" },
    { mod: extra2Mod.default || extra2Mod, label: "Extra 2" },
    { mod: md1Mod.default || md1Mod, label: "MD1" },
    { mod: nmMod.default || nmMod, label: "NonMinimal" }
  ];
  const allMap = {};
  const entries = [];
  let idx = 0;
  for (const { mod, label } of packs) {
    const presets = typeof mod.getPresets === "function" ? mod.getPresets() : mod;
    for (const name of Object.keys(presets).sort()) {
      if (allMap[name]) continue;
      allMap[name] = presets[name];
      entries.push({ name, author: parseAuthor(name), pack: label, idx });
      idx++;
    }
  }
  cachedPresets = entries;
  cachedPresetMap = allMap;
  return { entries, presetMap: allMap };
}
function parseAuthor(name) {
  const cleaned = name.replace(/^[_$]+\s*/, "");
  const dashIdx = cleaned.indexOf(" - ");
  if (dashIdx > 0) {
    let author = cleaned.slice(0, dashIdx).trim();
    const plusIdx = author.indexOf(" + ");
    if (plusIdx > 0) author = author.slice(0, plusIdx).trim();
    const parenIdx = author.indexOf("(");
    if (parenIdx > 0) author = author.slice(0, parenIdx).trim();
    if (author.length > 0 && author.length < 40) return author;
  }
  return "Other";
}
let cachedPMPresets = null;
async function loadProjectMPresets() {
  if (cachedPMPresets && cachedPMPresets.length > 0) return cachedPMPresets;
  try {
    const resp = await fetch("/projectm/presets-manifest.json");
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json();
    cachedPMPresets = data.presets.map((p, i) => ({
      name: p.name,
      author: p.category,
      pack: p.category,
      idx: i
    }));
    return cachedPMPresets;
  } catch (_err) {
    return [];
  }
}
function loadFavorites(key = FAVORITES_KEY) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveFavorites(favs, key = FAVORITES_KEY) {
  localStorage.setItem(key, JSON.stringify([...favs]));
}
const VJPresetBrowser = ({
  isOpen,
  onClose,
  onSelectPreset,
  currentPresetIdx,
  currentPresetName,
  mode = "butterchurn"
}) => {
  const [entries, setEntries] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [search, setSearch] = reactExports.useState("");
  const [category, setCategory] = reactExports.useState(ALL_CATEGORY);
  const favKey = mode === "projectm" ? PM_FAVORITES_KEY : FAVORITES_KEY;
  const [favorites, setFavorites] = reactExports.useState(() => loadFavorites(favKey));
  const listRef = reactExports.useRef(null);
  const searchRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setCategory(ALL_CATEGORY);
    if (mode === "projectm") {
      loadProjectMPresets().then((e) => {
        setEntries(e);
        setFavorites(loadFavorites(PM_FAVORITES_KEY));
        setLoading(false);
      });
    } else {
      loadAllPresets().then(({ entries: e }) => {
        setEntries(e);
        setFavorites(loadFavorites(FAVORITES_KEY));
        setLoading(false);
      });
    }
  }, [isOpen, mode]);
  reactExports.useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => {
        var _a;
        return (_a = searchRef.current) == null ? void 0 : _a.focus();
      }, 100);
    }
  }, [isOpen, loading]);
  const categories = reactExports.useMemo(() => {
    const authorCounts = /* @__PURE__ */ new Map();
    for (const e of entries) {
      authorCounts.set(e.author, (authorCounts.get(e.author) || 0) + 1);
    }
    const sorted = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    return [
      { name: ALL_CATEGORY, count: entries.length },
      { name: FAVORITES_CATEGORY, count: favorites.size },
      ...sorted
    ];
  }, [entries, favorites.size]);
  const filtered = reactExports.useMemo(() => {
    let result = entries;
    if (category === FAVORITES_CATEGORY) {
      result = result.filter((e) => favorites.has(e.name));
    } else if (category !== ALL_CATEGORY) {
      result = result.filter((e) => e.author === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    return result;
  }, [entries, category, search, favorites]);
  const toggleFavorite = reactExports.useCallback((name) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavorites(next, favKey);
      return next;
    });
  }, [favKey]);
  const handleSelect = reactExports.useCallback((entry) => {
    onSelectPreset(entry.name, entry.idx);
  }, [onSelectPreset]);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 z-20 flex bg-black/80 backdrop-blur-sm", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-48 flex-shrink-0 bg-dark-bg border-r border-dark-border flex flex-col overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-3 border-b border-dark-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-xs font-semibold text-text-muted uppercase tracking-wider", children: "Categories" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 258,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 257,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: categories.map((cat) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          onClick: () => setCategory(cat.name),
          className: `w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${category === cat.name ? "bg-accent/20 text-accent" : "text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate", children: cat.name }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
              lineNumber: 271,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted ml-1", children: cat.count }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
              lineNumber: 272,
              columnNumber: 15
            }, void 0)
          ]
        },
        cat.name,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
          lineNumber: 262,
          columnNumber: 13
        },
        void 0
      )) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 260,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
      lineNumber: 256,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex flex-col overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 p-3 border-b border-dark-border bg-dark-bg", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative flex-1", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Search, { size: 14, className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
            lineNumber: 283,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "input",
            {
              ref: searchRef,
              type: "text",
              value: search,
              onChange: (e) => setSearch(e.target.value),
              placeholder: "Search presets...",
              className: "w-full pl-8 pr-8 py-1.5 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded focus:border-accent focus:outline-none"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
              lineNumber: 284,
              columnNumber: 13
            },
            void 0
          ),
          search && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setSearch(""),
              className: "absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 12 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
                lineNumber: 297,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
              lineNumber: 293,
              columnNumber: 15
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
          lineNumber: 282,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted whitespace-nowrap", children: [
          filtered.length,
          " presets"
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
          lineNumber: 301,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "p-1.5 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors",
            title: "Close browser",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 16 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
              lineNumber: 309,
              columnNumber: 13
            }, void 0)
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
            lineNumber: 304,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 281,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: listRef, className: "flex-1 overflow-y-auto scrollbar-thin", children: loading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-32 text-text-muted text-sm", children: "Loading presets..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 316,
        columnNumber: 13
      }, void 0) : filtered.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-32 text-text-muted text-sm", children: "No presets found" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 320,
        columnNumber: 13
      }, void 0) : filtered.map((entry) => {
        const isActive = currentPresetName ? entry.name === currentPresetName : entry.idx === currentPresetIdx;
        const isFav = favorites.has(entry.name);
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: `flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group ${isActive ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"}`,
            onClick: () => handleSelect(entry),
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: (e) => {
                    e.stopPropagation();
                    toggleFavorite(entry.name);
                  },
                  className: `flex-shrink-0 transition-colors ${isFav ? "text-yellow-400" : "text-transparent group-hover:text-text-muted/40"}`,
                  title: isFav ? "Remove from favorites" : "Add to favorites",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Star, { size: 12, fill: isFav ? "currentColor" : "none" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
                    lineNumber: 344,
                    columnNumber: 21
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
                  lineNumber: 337,
                  columnNumber: 19
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 text-xs truncate font-mono", children: entry.name }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
                lineNumber: 346,
                columnNumber: 19
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-[10px] text-text-muted flex-shrink-0", children: entry.pack }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
                lineNumber: 347,
                columnNumber: 19
              }, void 0),
              isActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 12, className: "flex-shrink-0 text-accent" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
                lineNumber: 349,
                columnNumber: 21
              }, void 0)
            ]
          },
          entry.name,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
            lineNumber: 328,
            columnNumber: 17
          },
          void 0
        );
      }) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
        lineNumber: 314,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
      lineNumber: 279,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPresetBrowser.tsx",
    lineNumber: 254,
    columnNumber: 5
  }, void 0);
};
const NOTE_NAMES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
function fmtNote(note) {
  if (!note || note <= 0) return "···";
  if (note === 97 || note === 255) return "===";
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[(note - 1) % 12]}${octave}`;
}
function fmtHex(val, digits) {
  if (!val || val <= 0) return "·".repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, "0");
}
function fmtEffect(typ, param) {
  if ((!typ || typ <= 0) && (!param || param <= 0)) return "···";
  const t = typ && typ > 0 ? typ.toString(16).toUpperCase() : "·";
  const p = param && param > 0 ? param.toString(16).toUpperCase().padStart(2, "0") : "··";
  return `${t}${p}`;
}
function fmtCell(cell) {
  return `${fmtNote(cell.note)} ${fmtHex(cell.instrument, 2)} ${fmtEffect(cell.effTyp, cell.eff)}`;
}
const VISIBLE_ROWS = 16;
const ROW_H = 16;
const ROW_NUM_W = 28;
const CELL_W = 120;
const CANVAS_H = (VISIBLE_ROWS * 2 + 3) * ROW_H;
function hsl(h, s, l, a) {
  return `hsla(${h | 0},${s | 0}%,${l | 0}%,${a.toFixed(3)})`;
}
function bandHue(frame) {
  const bands = [frame.subEnergy, frame.bassEnergy, frame.midEnergy, frame.highEnergy];
  const hues = [0, 30, 180, 270];
  let maxE = 0, maxI = 0;
  for (let i = 0; i < 4; i++) {
    if (bands[i] > maxE) {
      maxE = bands[i];
      maxI = i;
    }
  }
  return hues[maxI];
}
const VU_NUM_SEGMENTS = 26;
const VU_SEGMENT_GAP = 4;
const VU_SEGMENT_HEIGHT = 4;
const VU_METER_WIDTH = 28;
const VU_DECAY_RATE = 0.92;
function createAnimState() {
  return {
    beatFlash: 0,
    bassAccum: 0,
    hueShift: 0,
    tiltKickX: 0,
    tiltKickY: 0,
    bounceY: 0,
    prevRow: -1,
    scrollOffset: 0,
    time: 0,
    glitchAmount: 0,
    glitchSeed: 0,
    chromaShift: 0,
    trailAlpha: 0,
    energyPulse: 0,
    replayerRow: -1,
    replayerPatIdx: -1
  };
}
function pseudoRandom(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function getPatternSnapshot(source) {
  if (source === "tracker") {
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const { currentRow, isPlaying } = useTransportStore.getState();
    const pattern2 = patterns[currentPatternIndex];
    if (!pattern2) return null;
    return { pattern: pattern2, currentRow, isPlaying };
  }
  const deckId = source.replace("deck", "");
  const deckState = useDJStore.getState().decks[deckId];
  if (!deckState.isPlaying) return null;
  const djEngine = getDJEngineIfActive();
  if (!djEngine) return null;
  const deck = djEngine.getDeck(deckId);
  if (!deck) return null;
  const song = deck.replayer.getSong();
  if (!song || !song.patterns.length) return null;
  const patIdx = song.songPositions[deckState.songPos] ?? 0;
  const pattern = song.patterns[patIdx];
  if (!pattern) return null;
  return {
    pattern,
    currentRow: deckState.pattPos,
    isPlaying: true,
    label: `Deck ${deckId}`
  };
}
const GAP_PX = 16;
const VJPatternOverlay = React.memo(({ sources = ["tracker"], crossfader = 0.5 }) => {
  const canvasRef = reactExports.useRef(null);
  const wrapRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const busRef = reactExports.useRef(null);
  const animRef = reactExports.useRef(createAnimState());
  const lastTimeRef = reactExports.useRef(0);
  const sourcesRef = reactExports.useRef(sources);
  sourcesRef.current = sources;
  const crossfaderRef = reactExports.useRef(crossfader);
  crossfaderRef.current = crossfader;
  const vuLevelsRef = reactExports.useRef([]);
  const vuLastGensRef = reactExports.useRef([]);
  const numChannelsRef = reactExports.useRef(0);
  const handleCanvasClick = reactExports.useCallback((e) => {
    var _a;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const ch = Math.floor((localX - ROW_NUM_W) / CELL_W);
    if (ch < 0 || ch >= numChannelsRef.current) return;
    const mixer = useMixerStore.getState();
    const current = ((_a = mixer.channels[ch]) == null ? void 0 : _a.muted) ?? false;
    mixer.setChannelMute(ch, !current);
  }, []);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    const bus = new AudioDataBus();
    bus.enable();
    busRef.current = bus;
    const snapshotBuf = [];
    const layoutBuf = [];
    const render = (timestamp) => {
      var _a;
      const dt = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1e3, 0.05);
      lastTimeRef.current = timestamp;
      const anim = animRef.current;
      anim.time += dt;
      const t = anim.time;
      const allSources = sourcesRef.current;
      snapshotBuf.length = 0;
      for (const src of allSources) {
        const snap = getPatternSnapshot(src);
        if (snap) snapshotBuf.push({ snapshot: snap, source: src });
      }
      if (snapshotBuf.length === 0) {
        const fallback = getPatternSnapshot("tracker");
        if (!fallback) {
          bus.update();
          const wf = bus.getFrame().waveform;
          const wfW = ROW_NUM_W + 4 * CELL_W;
          if (canvas.width !== wfW) canvas.width = wfW;
          ctx.clearRect(0, 0, wfW, CANVAS_H);
          const midY = CANVAS_H / 2;
          const baseHue2 = (bandHue(bus.getFrame()) + anim.hueShift) % 360;
          ctx.strokeStyle = hsl(baseHue2, 80, 70, 0.9);
          ctx.lineWidth = 2;
          ctx.shadowColor = hsl(baseHue2, 90, 65, 0.7);
          ctx.shadowBlur = 6 + bus.getFrame().rms * 12;
          ctx.beginPath();
          const wfStep = wf.length / wfW;
          for (let x = 0; x < wfW; x++) {
            const v = wf[Math.floor(x * wfStep)] ?? 0;
            const y = midY + v * midY * 0.85;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          rafRef.current = requestAnimationFrame(render);
          return;
        }
        snapshotBuf.push({ snapshot: fallback, source: "tracker" });
      }
      const snapshots = snapshotBuf;
      let totalW = 0;
      layoutBuf.length = 0;
      for (const { snapshot } of snapshots) {
        const numCh = snapshot.pattern.channels.length;
        const sectionW = ROW_NUM_W + numCh * CELL_W;
        layoutBuf.push({ xBase: totalW, sectionW, numChannels: numCh });
        totalW += sectionW;
      }
      if (snapshots.length > 1) totalW += (snapshots.length - 1) * GAP_PX;
      if (snapshots.length > 1) {
        let x = 0;
        for (let i = 0; i < layoutBuf.length; i++) {
          layoutBuf[i].xBase = x;
          x += layoutBuf[i].sectionW + GAP_PX;
        }
      }
      const canvasW = totalW;
      if (canvas.width !== canvasW) canvas.width = canvasW;
      numChannelsRef.current = layoutBuf.reduce((s, l) => s + l.numChannels, 0);
      const anyPlaying = snapshots.some((s) => s.snapshot.isPlaying);
      bus.update();
      const frame = bus.getFrame();
      const decay = (v, rate) => v * Math.exp(-rate * dt);
      if (frame.beat) {
        anim.beatFlash = 1;
        anim.hueShift += 25 + Math.random() * 50;
        anim.tiltKickX += (Math.random() - 0.5) * 18;
        anim.tiltKickY += (Math.random() - 0.5) * 14;
        anim.bounceY = 10 + Math.random() * 8;
        anim.glitchAmount = 0.6 + Math.random() * 0.4;
        anim.glitchSeed = Math.random() * 1e3;
        anim.chromaShift = 3 + Math.random() * 4;
        anim.trailAlpha = 0.6;
      }
      anim.beatFlash = decay(anim.beatFlash, 6);
      anim.bassAccum = anim.bassAccum * 0.82 + frame.bassEnergy * 0.18;
      anim.tiltKickX = decay(anim.tiltKickX, 4);
      anim.tiltKickY = decay(anim.tiltKickY, 4);
      anim.bounceY = decay(anim.bounceY, 5);
      anim.glitchAmount = decay(anim.glitchAmount, 10);
      anim.chromaShift = decay(anim.chromaShift, 8);
      anim.trailAlpha = decay(anim.trailAlpha, 4);
      anim.energyPulse = anim.energyPulse * 0.9 + (frame.rms * 0.8 + frame.bassEnergy * 0.2) * 0.1;
      anim.replayerRow = -1;
      anim.replayerPatIdx = -1;
      if (anyPlaying && snapshots[0].source === "tracker") {
        const replayer = getTrackerReplayer();
        const audioTime = now() + 0.01;
        const audioState = replayer.getStateAtTime(audioTime);
        if (audioState) {
          anim.replayerRow = audioState.row;
          anim.replayerPatIdx = audioState.pattern;
          const nextState = replayer.getStateAtTime(audioTime + 0.5, true);
          const dur = nextState && nextState.row !== audioState.row ? nextState.time - audioState.time : 2.5 / (useTransportStore.getState().bpm || 125) * (useTransportStore.getState().speed || 6);
          const progress = Math.min(Math.max((audioTime - audioState.time) / (dur || 0.125), 0), 1);
          anim.scrollOffset = progress * ROW_H;
        } else {
          anim.scrollOffset = 0;
        }
      } else {
        anim.scrollOffset = 0;
      }
      const orbitX = Math.sin(t * 0.17) * Math.cos(t * 0.09) * 12 + Math.sin(t * 0.31) * 4;
      const orbitY = Math.sin(t * 0.13) * Math.cos(t * 0.21) * 8 + Math.cos(t * 0.37) * 3;
      const bassTilt = frame.bassEnergy * 10;
      const highShimmer = frame.highEnergy * Math.sin(t * 47) * 3;
      const midSway = frame.midEnergy * Math.sin(t * 7.3) * 4;
      const tiltDampen = anim.scrollOffset > 0.5 ? 0.15 : 1;
      const rx = (orbitX + bassTilt + anim.tiltKickX + midSway) * tiltDampen;
      const ry = (orbitY + anim.tiltKickY + highShimmer) * tiltDampen;
      const rz = Math.sin(t * 0.07) * 2 + anim.tiltKickX * 0.15;
      const scale = 2.1 + anim.bassAccum * 0.12 + anim.beatFlash * 0.08 + anim.energyPulse * 0.3;
      const driftX = Math.sin(t * 0.09) * 20 + Math.cos(t * 0.23) * 15 + frame.midEnergy * Math.sin(t * 3) * 8;
      const driftY = Math.sin(t * 0.14) * 12 + anim.bounceY;
      const opacity = 0.8 + frame.rms * 0.2 + anim.beatFlash * 0.15;
      wrap.style.transform = `translate(${driftX.toFixed(1)}px, ${driftY.toFixed(1)}px) perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      wrap.style.opacity = Math.min(1, opacity).toFixed(3);
      const glowRadius = 6 + frame.rms * 20 + anim.beatFlash * 18;
      const glowHue = (bandHue(frame) + anim.hueShift) % 360;
      const innerGlow = `drop-shadow(0 0 ${glowRadius.toFixed(0)}px ${hsl(glowHue, 90, 60, 0.6 + anim.beatFlash * 0.4)})`;
      const outerGlow = `drop-shadow(0 0 ${(glowRadius * 2.5).toFixed(0)}px ${hsl((glowHue + 40) % 360, 70, 40, 0.25 + anim.beatFlash * 0.2)})`;
      canvas.style.filter = `${innerGlow} ${outerGlow}`;
      ctx.clearRect(0, 0, canvasW, CANVAS_H);
      const baseHue = (bandHue(frame) + anim.hueShift) % 360;
      const letterSpacing = anim.bassAccum * 2.5 + anim.beatFlash * 1.5;
      ctx.textBaseline = "middle";
      const rowNumW = ROW_NUM_W;
      const cellW = CELL_W;
      const barY = ROW_H + VISIBLE_ROWS * ROW_H;
      const mixerChannels = useMixerStore.getState().channels;
      for (let si = 0; si < snapshots.length; si++) {
        const { snapshot, source: src } = snapshots[si];
        const { currentRow, isPlaying: srcPlaying, label: sourceLabel } = snapshot;
        const { xBase, numChannels } = layoutBuf[si];
        let pattern = snapshot.pattern;
        if (src === "tracker" && anim.replayerPatIdx >= 0) {
          const patterns = useTrackerStore.getState().patterns;
          const replayerPat = patterns[anim.replayerPatIdx];
          if (replayerPat) pattern = replayerPat;
        }
        const channels = pattern.channels;
        const patLen = pattern.length;
        const sectionW = layoutBuf[si].sectionW;
        const cf = crossfaderRef.current;
        let sourceOpacity = 1;
        if (src === "deckA") {
          sourceOpacity = 1 - cf;
        } else if (src === "deckB") {
          sourceOpacity = cf;
        }
        sourceOpacity = 0.08 + sourceOpacity * 0.92;
        const displayRow = src === "tracker" && anim.replayerRow >= 0 ? anim.replayerRow : currentRow;
        ctx.save();
        ctx.translate(xBase, 0);
        ctx.globalAlpha = sourceOpacity;
        if (srcPlaying) {
          const flashBright = 0.45 + anim.beatFlash * 0.55;
          ctx.fillStyle = hsl(baseHue, 80, 55, flashBright);
          ctx.fillRect(0, barY, sectionW, ROW_H);
          if (anim.beatFlash > 0.05) {
            ctx.fillStyle = hsl(baseHue, 95, 85, anim.beatFlash * 0.6);
            ctx.fillRect(0, barY, sectionW, ROW_H);
          }
          const sideGlow = frame.rms * 0.3 + anim.beatFlash * 0.2;
          if (sideGlow > 0.05) {
            const grad = ctx.createLinearGradient(0, barY, 0, barY + ROW_H);
            grad.addColorStop(0, hsl(baseHue, 90, 70, sideGlow));
            grad.addColorStop(0.5, hsl(baseHue, 90, 70, 0));
            grad.addColorStop(1, hsl(baseHue, 90, 70, sideGlow * 0.5));
            ctx.fillStyle = grad;
            ctx.fillRect(0, barY - 4, sectionW, ROW_H + 8);
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.fillRect(0, barY, sectionW, ROW_H);
        }
        const bandEnergies = [frame.subEnergy, frame.bassEnergy, frame.midEnergy, frame.highEnergy];
        for (let ch = 0; ch < numChannels; ch++) {
          const bandIdx = ch % 4;
          const energy = bandEnergies[bandIdx];
          if (energy > 0.15) {
            const colX = rowNumW + ch * cellW;
            const colHue = (baseHue + ch * 35) % 360;
            const colAlpha = (energy - 0.15) * 0.25 + anim.beatFlash * 0.08;
            const grad = ctx.createLinearGradient(colX, 0, colX + cellW, 0);
            grad.addColorStop(0, hsl(colHue, 70, 50, 0));
            grad.addColorStop(0.3, hsl(colHue, 70, 50, colAlpha));
            grad.addColorStop(0.7, hsl(colHue, 70, 50, colAlpha));
            grad.addColorStop(1, hsl(colHue, 70, 50, 0));
            ctx.fillStyle = grad;
            ctx.fillRect(colX, 0, cellW, CANVAS_H);
          }
        }
        ctx.save();
        ctx.translate(0, -(src === "tracker" ? anim.scrollOffset : 0));
        ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
        if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
        if (sourceLabel) {
          ctx.save();
          ctx.font = 'bold 13px "Berkeley Mono", "JetBrains Mono", monospace';
          ctx.fillStyle = hsl(baseHue, 80, 90, 0.9);
          ctx.textAlign = "right";
          ctx.fillText(sourceLabel, sectionW - 4, ROW_H * 0.5);
          ctx.restore();
          ctx.font = '11px "Berkeley Mono", "JetBrains Mono", "Fira Code", monospace';
          if (letterSpacing > 0.1) ctx.letterSpacing = `${letterSpacing.toFixed(1)}px`;
        }
        ctx.fillStyle = hsl(baseHue, 50, 85, 0.8 + anim.beatFlash * 0.2);
        for (let ch = 0; ch < numChannels; ch++) {
          const x = rowNumW + ch * cellW;
          const name = channels[ch].shortName || channels[ch].name || `CH${ch + 1}`;
          ctx.fillText(name.slice(0, 8), x + 2, ROW_H * 0.5);
        }
        ctx.strokeStyle = hsl(baseHue, 70, 60, 0.5 + anim.beatFlash * 0.4);
        ctx.lineWidth = 1 + anim.beatFlash * 3 + frame.rms * 2;
        ctx.shadowColor = hsl(baseHue, 80, 60, 0.6);
        ctx.shadowBlur = 4 + anim.beatFlash * 8;
        ctx.beginPath();
        ctx.moveTo(0, ROW_H);
        ctx.lineTo(sectionW, ROW_H);
        ctx.stroke();
        ctx.shadowBlur = 0;
        const doChroma = anim.chromaShift > 0.3;
        const chromaOff = anim.chromaShift;
        for (let i = -VISIBLE_ROWS; i <= VISIBLE_ROWS; i++) {
          const row = displayRow + i;
          if (row < 0 || row >= patLen) continue;
          const baseY = ROW_H + (i + VISIBLE_ROWS) * ROW_H;
          const isCurrent = i === 0;
          let glitchX = 0;
          if (anim.glitchAmount > 0.05) {
            const r = pseudoRandom(anim.glitchSeed + i * 17.3);
            if (r > 0.6) {
              glitchX = (pseudoRandom(anim.glitchSeed + i * 31.7) - 0.5) * 40 * anim.glitchAmount;
            }
          }
          const dist = Math.abs(i) / VISIBLE_ROWS;
          const wave = Math.sin(t * 4 + i * 0.5) * frame.midEnergy * 2;
          const shimmer = 0.5 + 0.5 * Math.sin(t * 3.5 + i * 0.4);
          const depthAlpha = (1 - dist * 0.55) * (0.85 + shimmer * 0.15);
          const trailBoost = i < 0 && i > -4 && anim.trailAlpha > 0.05 ? anim.trailAlpha * (1 + i / 4) * 0.3 : 0;
          const y = baseY + wave;
          const rnAlpha = isCurrent ? 1 : (0.5 + trailBoost) * depthAlpha;
          ctx.fillStyle = isCurrent ? hsl(baseHue, 70, 92, 0.95 + anim.beatFlash * 0.05) : `rgba(255,255,255,${rnAlpha.toFixed(3)})`;
          ctx.fillText(row.toString(16).toUpperCase().padStart(2, "0"), 4 + glitchX, y + ROW_H * 0.5);
          for (let ch = 0; ch < numChannels; ch++) {
            const cell = channels[ch].rows[row];
            if (!cell) continue;
            const x = rowNumW + ch * cellW + glitchX;
            const hasNote = cell.note > 0;
            const hasData = hasNote || cell.instrument > 0 || cell.effTyp > 0 || cell.eff > 0;
            const text = fmtCell(cell);
            let fillH = baseHue, fillS = 30, fillL = 70, fillA = 0.3 * depthAlpha;
            if (isCurrent && hasData) {
              fillH = (baseHue + ch * 35) % 360;
              fillS = 85;
              fillL = 82 + anim.beatFlash * 18;
              fillA = 0.97;
            } else if (isCurrent) {
              fillS = 40;
              fillL = 80;
              fillA = 0.75;
            } else if (hasNote) {
              fillH = (baseHue + ch * 35) % 360;
              fillS = 55 + frame.rms * 30;
              fillL = 72;
              fillA = (0.8 + trailBoost) * depthAlpha;
            } else if (hasData) {
              fillA = (0.55 + trailBoost) * depthAlpha;
            }
            if (doChroma && (isCurrent || hasNote)) {
              ctx.globalAlpha = fillA * 0.35 * sourceOpacity;
              ctx.fillStyle = hsl(fillH - 40, fillS, fillL, 1);
              ctx.fillText(text, x + 2 - chromaOff, y + ROW_H * 0.5);
              ctx.fillStyle = hsl(fillH + 40, fillS, fillL, 1);
              ctx.fillText(text, x + 2 + chromaOff, y + ROW_H * 0.5);
              ctx.globalAlpha = sourceOpacity;
            }
            ctx.fillStyle = hsl(fillH, fillS, fillL, fillA);
            ctx.fillText(text, x + 2, y + ROW_H * 0.5);
          }
        }
        ctx.restore();
        if (src === "tracker") {
          while (vuLevelsRef.current.length < numChannels) vuLevelsRef.current.push(0);
          while (vuLastGensRef.current.length < numChannels) vuLastGensRef.current.push(0);
          let realtimeLevels = null;
          let triggerLevels = [];
          let triggerGens = [];
          try {
            const engine = getToneEngine();
            realtimeLevels = engine.getChannelLevels(numChannels);
            triggerLevels = engine.getChannelTriggerLevels(numChannels);
            triggerGens = engine.getChannelTriggerGenerations(numChannels);
          } catch {
          }
          const vuAlpha = 0.7 + anim.beatFlash * 0.3;
          for (let ch = 0; ch < numChannels; ch++) {
            const stagger = ch * 0.012;
            if (!srcPlaying) {
              vuLevelsRef.current[ch] = 0;
            } else if (realtimeLevels) {
              const target = realtimeLevels[ch] || 0;
              if (target > vuLevelsRef.current[ch]) {
                vuLevelsRef.current[ch] = target;
              } else {
                vuLevelsRef.current[ch] *= VU_DECAY_RATE - stagger;
                if (vuLevelsRef.current[ch] < 0.01) vuLevelsRef.current[ch] = 0;
              }
            } else {
              const isNew = triggerGens[ch] !== vuLastGensRef.current[ch];
              if (isNew && triggerLevels[ch] > 0) {
                vuLevelsRef.current[ch] = triggerLevels[ch];
                vuLastGensRef.current[ch] = triggerGens[ch];
              } else {
                vuLevelsRef.current[ch] *= VU_DECAY_RATE - stagger;
                if (vuLevelsRef.current[ch] < 0.01) vuLevelsRef.current[ch] = 0;
              }
            }
            const level = vuLevelsRef.current[ch];
            if (level < 0.01) continue;
            const centerX = rowNumW + ch * cellW + cellW / 2;
            const meterX = Math.round(centerX - VU_METER_WIDTH / 2);
            const activeSegs = Math.round(level * VU_NUM_SEGMENTS);
            const segStep = VU_SEGMENT_HEIGHT + VU_SEGMENT_GAP;
            for (let s = 0; s < activeSegs; s++) {
              const ratio = s / (VU_NUM_SEGMENTS - 1);
              const fade = vuAlpha * (1 - ratio * 0.4);
              ctx.fillStyle = hsl(baseHue, 80, 55 + ratio * 20, fade);
              const upY = barY - (s + 1) * segStep;
              ctx.fillRect(meterX, Math.round(upY), VU_METER_WIDTH, VU_SEGMENT_HEIGHT);
              const downY = barY + ROW_H + s * segStep;
              ctx.fillRect(meterX, Math.round(downY), VU_METER_WIDTH, VU_SEGMENT_HEIGHT);
            }
          }
        }
        if (src === "tracker") {
          for (let ch = 0; ch < numChannels; ch++) {
            if ((_a = mixerChannels[ch]) == null ? void 0 : _a.muted) {
              const colX = rowNumW + ch * cellW;
              ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
              ctx.fillRect(colX, 0, cellW, CANVAS_H);
              ctx.save();
              ctx.font = "bold 11px monospace";
              ctx.fillStyle = "rgba(255, 80, 80, 0.7)";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("MUTE", colX + cellW / 2, ROW_H * 0.5);
              ctx.restore();
            }
          }
        }
        ctx.restore();
      }
      const vigGrad = ctx.createRadialGradient(canvasW / 2, CANVAS_H / 2, canvasW * 0.3, canvasW / 2, CANVAS_H / 2, canvasW * 0.7);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, `rgba(0,0,0,${(0.3 + anim.beatFlash * 0.15).toFixed(3)})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, canvasW, CANVAS_H);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      bus.disable();
    };
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      ref: wrapRef,
      style: {
        transformStyle: "preserve-3d",
        willChange: "transform, opacity"
      },
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "canvas",
        {
          ref: canvasRef,
          width: ROW_NUM_W + 4 * CELL_W,
          height: CANVAS_H,
          style: { maxWidth: "90vw", pointerEvents: "auto", cursor: "pointer" },
          onClick: handleCanvasClick
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPatternOverlay.tsx",
          lineNumber: 685,
          columnNumber: 9
        },
        void 0
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPatternOverlay.tsx",
      lineNumber: 678,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJPatternOverlay.tsx",
    lineNumber: 677,
    columnNumber: 5
  }, void 0);
});
VJPatternOverlay.displayName = "VJPatternOverlay";
const ProjectMCanvas = React.lazy(() => __vitePreload(() => import("./ProjectMCanvas-CH6f-Kuj.js"), true ? __vite__mapDeps([6,7,1,8,9,10]) : void 0).then((m) => ({ default: m.ProjectMCanvas })));
const LazyHeadOverlay = React.lazy(() => __vitePreload(() => import("./KraftwerkHeadOverlay-DSz-G7Ky.js"), true ? __vite__mapDeps([11,7,1,8,12,13,14,9,10,15,16]) : void 0).then((m) => ({ default: m.KraftwerkHeadOverlay })));
let butterchurnModule = null;
let allPresetsCache = null;
let presetNamesCache = null;
async function loadButterchurn() {
  if (butterchurnModule && allPresetsCache) {
    return { butterchurn: butterchurnModule, presetMap: allPresetsCache, presetNames: presetNamesCache };
  }
  const [bc, mainMod, extraMod, extra2Mod, md1Mod, nmMod] = await Promise.all([
    __vitePreload(() => import("./butterchurn-z8A4P4Xp.js").then((n) => n.b), true ? __vite__mapDeps([17,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresets.min-CWEzsREE.js").then((n) => n.b), true ? __vite__mapDeps([0,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsExtra.min-Dvb-ReYl.js").then((n) => n.b), true ? __vite__mapDeps([2,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsExtra2.min-CPpLG3b-.js").then((n) => n.b), true ? __vite__mapDeps([3,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsMD1.min-BxN7w1WQ.js").then((n) => n.b), true ? __vite__mapDeps([4,1]) : void 0),
    __vitePreload(() => import("./butterchurnPresetsNonMinimal.min-kDZm97qN.js").then((n) => n.b), true ? __vite__mapDeps([5,1]) : void 0)
  ]);
  butterchurnModule = bc.default || bc;
  const allMap = {};
  for (const mod of [mainMod, extraMod, extra2Mod, md1Mod, nmMod]) {
    const m = mod.default || mod;
    const presets = typeof m.getPresets === "function" ? m.getPresets() : m;
    Object.assign(allMap, presets);
  }
  allPresetsCache = allMap;
  presetNamesCache = Object.keys(allMap).sort();
  return { butterchurn: butterchurnModule, presetMap: allMap, presetNames: presetNamesCache };
}
const VJCanvas = React.forwardRef(
  ({ onReady, onPresetChange, visible = true }, ref) => {
    const canvasRef = reactExports.useRef(null);
    const visualizerRef = reactExports.useRef(null);
    const audioDataBusRef = reactExports.useRef(null);
    const rafRef = reactExports.useRef(0);
    const presetNamesRef = reactExports.useRef([]);
    const presetMapRef = reactExports.useRef({});
    const currentIdxRef = reactExports.useRef(0);
    const visibleRef = reactExports.useRef(visible);
    const [ready, setReady] = reactExports.useState(false);
    reactExports.useEffect(() => {
      visibleRef.current = visible;
    }, [visible]);
    reactExports.useEffect(() => {
      registerCaptureCanvas("vj", canvasRef.current);
      return () => registerCaptureCanvas("vj", null);
    }, []);
    reactExports.useEffect(() => {
      let cancelled = false;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const initRaf = requestAnimationFrame(() => {
        if (cancelled) return;
        doInit();
      });
      async function doInit() {
        var _a;
        try {
          const { butterchurn, presetMap, presetNames } = await loadButterchurn();
          if (cancelled || !canvas) return;
          const cw = Math.max(canvas.clientWidth, 320);
          const ch = Math.max(canvas.clientHeight, 240);
          const w = Math.round(cw * devicePixelRatio);
          const h = Math.round(ch * devicePixelRatio);
          canvas.width = w;
          canvas.height = h;
          const ctx = getContext().rawContext;
          const visualizer = butterchurn.createVisualizer(ctx, canvas, {
            width: w,
            height: h,
            pixelRatio: devicePixelRatio
          });
          const dest = getDestination();
          const nativeNode = ((_a = dest.output) == null ? void 0 : _a.input) || dest._gainNode || dest.input;
          if (nativeNode) {
            visualizer.connectAudio(nativeNode);
          }
          presetNamesRef.current = presetNames;
          presetMapRef.current = presetMap;
          const startIdx = Math.floor(Math.random() * presetNames.length);
          visualizer.loadPreset(presetMap[presetNames[startIdx]], 0);
          currentIdxRef.current = startIdx;
          visualizerRef.current = visualizer;
          setReady(true);
          onReady == null ? void 0 : onReady(presetNames.length);
          onPresetChange == null ? void 0 : onPresetChange(startIdx, presetNames[startIdx]);
          const bus = new AudioDataBus();
          bus.enable();
          audioDataBusRef.current = bus;
        } catch (err) {
        }
      }
      return () => {
        cancelled = true;
        cancelAnimationFrame(initRaf);
      };
    }, []);
    reactExports.useEffect(() => {
      if (!ready || !visible) return;
      const render = () => {
        var _a, _b;
        if (!visibleRef.current) return;
        (_a = visualizerRef.current) == null ? void 0 : _a.render();
        (_b = audioDataBusRef.current) == null ? void 0 : _b.update();
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [ready, visible]);
    reactExports.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !visualizerRef.current) return;
      const handleResize = () => {
        var _a;
        const w = Math.round(Math.max(canvas.clientWidth, 320) * devicePixelRatio);
        const h = Math.round(Math.max(canvas.clientHeight, 240) * devicePixelRatio);
        canvas.width = w;
        canvas.height = h;
        (_a = visualizerRef.current) == null ? void 0 : _a.setRendererSize(w, h);
      };
      handleResize();
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [ready]);
    reactExports.useEffect(() => {
      return () => {
        var _a;
        (_a = audioDataBusRef.current) == null ? void 0 : _a.disable();
        cancelAnimationFrame(rafRef.current);
      };
    }, []);
    const doLoadPreset = reactExports.useCallback((idx, blend = 2) => {
      if (!visualizerRef.current) return;
      const names = presetNamesRef.current;
      const map = presetMapRef.current;
      if (names.length === 0) return;
      const name = names[idx];
      const preset = map[name];
      if (preset) {
        visualizerRef.current.loadPreset(preset, blend);
        currentIdxRef.current = idx;
        onPresetChange == null ? void 0 : onPresetChange(idx, name);
      }
    }, [onPresetChange]);
    const doLoadPresetByName = reactExports.useCallback((name, blend = 2) => {
      if (!visualizerRef.current) return;
      const map = presetMapRef.current;
      const preset = map[name];
      if (preset) {
        const idx = presetNamesRef.current.indexOf(name);
        visualizerRef.current.loadPreset(preset, blend);
        currentIdxRef.current = idx >= 0 ? idx : currentIdxRef.current;
        onPresetChange == null ? void 0 : onPresetChange(currentIdxRef.current, name);
      }
    }, [onPresetChange]);
    React.useImperativeHandle(ref, () => ({
      nextPreset: () => {
        const names = presetNamesRef.current;
        if (names.length === 0) return;
        doLoadPreset((currentIdxRef.current + 1) % names.length);
      },
      randomPreset: () => {
        const names = presetNamesRef.current;
        if (names.length === 0) return;
        doLoadPreset(Math.floor(Math.random() * names.length));
      },
      loadPresetByIndex: (idx, blend) => doLoadPreset(idx, blend),
      loadPresetByName: (name, blendOrSmooth) => doLoadPresetByName(name, typeof blendOrSmooth === "number" ? blendOrSmooth : void 0),
      getPresetNames: () => presetNamesRef.current,
      getCurrentIndex: () => currentIdxRef.current
    }), [doLoadPreset, doLoadPresetByName]);
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
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
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
          lineNumber: 266,
          columnNumber: 9
        },
        void 0
      ),
      !ready && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute inset-0 flex items-center justify-center bg-black", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-white/60 font-mono text-sm", children: "Loading Milkdrop visualizer..." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 273,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 272,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 265,
      columnNumber: 7
    }, void 0);
  }
);
VJCanvas.displayName = "VJCanvas";
const PatternOverlayToggle = () => {
  const enabled = useSettingsStore((s) => s.vjPatternOverlay);
  const toggle = useSettingsStore((s) => s.setVjPatternOverlay);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: () => toggle(!enabled),
      className: `p-2 rounded-full transition-colors text-text-primary ${enabled ? "bg-purple-600/50 hover:bg-purple-600/70" : "bg-white/10 hover:bg-white/20"}`,
      title: enabled ? "Hide pattern overlay" : "Show pattern overlay",
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Music, { size: 18 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 295,
        columnNumber: 7
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 288,
      columnNumber: 5
    },
    void 0
  );
};
const MaxHeadroomToggle = () => {
  const enabled = useSettingsStore((s) => s.maxHeadroomMode);
  const toggle = useSettingsStore((s) => s.setMaxHeadroomMode);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "button",
    {
      onClick: () => toggle(!enabled),
      className: `p-2 rounded-full transition-colors text-text-primary ${enabled ? "bg-cyan-600/50 hover:bg-cyan-600/70" : "bg-white/10 hover:bg-white/20"}`,
      title: enabled ? "Disable Max Headroom mode" : "Enable Max Headroom mode",
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 18 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 312,
        columnNumber: 7
      }, void 0)
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 305,
      columnNumber: 5
    },
    void 0
  );
};
const VJPatternOverlayWrapper = () => {
  const enabled = useSettingsStore((s) => s.vjPatternOverlay);
  const trackerPlaying = useTransportStore((s) => s.isPlaying);
  const deckA = useDJStore((s) => s.decks.A);
  const deckB = useDJStore((s) => s.decks.B);
  const crossfader = useDJStore((s) => s.crossfaderPosition);
  if (!enabled) return null;
  const activeSources = [];
  if (trackerPlaying) activeSources.push("tracker");
  if (deckA.isPlaying) activeSources.push("deckA");
  if (deckB.isPlaying) activeSources.push("deckB");
  if (activeSources.length === 0) activeSources.push("tracker");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VJPatternOverlay, { sources: activeSources, crossfader }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
    lineNumber: 335,
    columnNumber: 10
  }, void 0);
};
const VJControls = ({
  currentName,
  currentIdx,
  totalPresets,
  autoAdvance,
  isPopout,
  onNext,
  onRandom,
  onToggleAutoAdvance,
  onPopOut,
  onToggleBrowser,
  onFullscreen,
  isFullscreen,
  browserOpen
}) => {
  const [showControls, setShowControls] = reactExports.useState(true);
  const timeoutRef = reactExports.useRef(void 0);
  const handleMouseMove = reactExports.useCallback(() => {
    setShowControls(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowControls(false), 3e3);
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "absolute inset-0 pointer-events-none z-10",
      onMouseMove: handleMouseMove,
      onMouseLeave: () => setShowControls(false),
      style: { pointerEvents: "none" },
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: `absolute inset-0 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0"}`,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute top-0 left-0 right-0 pointer-events-auto bg-gradient-to-b from-black/70 to-transparent p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3 flex-1 mr-4 min-w-0", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  CustomSelect,
                  {
                    value: "vj",
                    onChange: (v) => switchView(v, "vj"),
                    className: "bg-white/10 text-white text-xs border border-white/20 rounded px-2 py-1 outline-none cursor-pointer",
                    title: "Switch view",
                    options: VIEW_OPTIONS.map((v) => ({ value: v.value, label: v.label }))
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 400,
                    columnNumber: 15
                  },
                  void 0
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-white/90 text-sm font-mono truncate", children: currentName }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 407,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                lineNumber: 398,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-white/50 text-xs font-mono", children: totalPresets > 0 ? `${currentIdx + 1} / ${totalPresets}` : "—" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                lineNumber: 411,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
              lineNumber: 397,
              columnNumber: 11
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
              lineNumber: 396,
              columnNumber: 9
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "absolute bottom-0 left-0 right-0 pointer-events-auto bg-gradient-to-t from-black/70 to-transparent p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center gap-3", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onRandom,
                  className: "p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors",
                  title: "Random preset",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Shuffle, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 425,
                    columnNumber: 15
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 420,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onToggleAutoAdvance,
                  className: `p-2 rounded-full transition-colors text-text-primary ${autoAdvance ? "bg-green-600/50 hover:bg-green-600/70" : "bg-white/10 hover:bg-white/20"}`,
                  title: autoAdvance ? "Pause auto-advance" : "Resume auto-advance",
                  children: autoAdvance ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Pause, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 435,
                    columnNumber: 30
                  }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Play, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 435,
                    columnNumber: 52
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 428,
                  columnNumber: 13
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onNext,
                  className: "p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors",
                  title: "Next preset",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SkipForward, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 443,
                    columnNumber: 15
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 438,
                  columnNumber: 13
                },
                void 0
              ),
              onToggleBrowser && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onToggleBrowser,
                  className: `p-2 rounded-full transition-colors text-text-primary ${browserOpen ? "bg-accent/50 hover:bg-accent/70" : "bg-white/10 hover:bg-white/20"}`,
                  title: "Browse presets",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(List, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 454,
                    columnNumber: 17
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 447,
                  columnNumber: 15
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PatternOverlayToggle, {}, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                lineNumber: 458,
                columnNumber: 13
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MaxHeadroomToggle, {}, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                lineNumber: 459,
                columnNumber: 13
              }, void 0),
              !isPopout && onPopOut && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onPopOut,
                  className: "p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors",
                  title: "Pop out to second screen",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ExternalLink, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 467,
                    columnNumber: 17
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 462,
                  columnNumber: 15
                },
                void 0
              ),
              onFullscreen && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onFullscreen,
                  className: "p-2 rounded-full bg-white/10 hover:bg-white/20 text-text-primary transition-colors",
                  title: isFullscreen ? "Exit fullscreen" : "Fullscreen",
                  children: isFullscreen ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Minimize, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 477,
                    columnNumber: 33
                  }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Maximize, { size: 18 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                    lineNumber: 477,
                    columnNumber: 58
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
                  lineNumber: 472,
                  columnNumber: 15
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
              lineNumber: 419,
              columnNumber: 11
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
              lineNumber: 418,
              columnNumber: 9
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
          lineNumber: 390,
          columnNumber: 7
        },
        void 0
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 383,
      columnNumber: 5
    },
    void 0
  );
};
const VJView = ({ isPopout = false }) => {
  const vjViewActive = useUIStore((s) => s.activeView === "vj") || isPopout;
  const canvasHandleRef = reactExports.useRef(null);
  const projectmHandleRef = reactExports.useRef(null);
  const [activeLayer, setActiveLayer] = reactExports.useState("milkdrop");
  const [presetName, setPresetName] = reactExports.useState("Loading...");
  const [presetIdx, setPresetIdx] = reactExports.useState(0);
  const [presetCount, setPresetCount] = reactExports.useState(0);
  const [autoAdvance, setAutoAdvance] = reactExports.useState(true);
  const [browserOpen, setBrowserOpen] = reactExports.useState(false);
  const autoAdvanceTimerRef = reactExports.useRef(void 0);
  const containerRef = reactExports.useRef(null);
  const [isFullscreen, setIsFullscreen] = reactExports.useState(false);
  const prevLayerRef = reactExports.useRef("milkdrop");
  const [renderMilkdrop, setRenderMilkdrop] = reactExports.useState(true);
  const [renderProjectm, setRenderProjectm] = reactExports.useState(false);
  const crossfadeTimerRef = reactExports.useRef(void 0);
  const layerSwitchTimerRef = reactExports.useRef(void 0);
  const switchToLayer = reactExports.useCallback((target, loadPreset) => {
    let effectiveTarget = target;
    let effectiveLoadPreset = loadPreset;
    if (target === "projectm" && prevLayerRef.current === "projectm") {
      effectiveTarget = "milkdrop";
      effectiveLoadPreset = () => {
        var _a;
        return (_a = canvasHandleRef.current) == null ? void 0 : _a.nextPreset();
      };
    }
    prevLayerRef.current = effectiveTarget;
    if (layerSwitchTimerRef.current !== void 0) clearTimeout(layerSwitchTimerRef.current);
    if (crossfadeTimerRef.current !== void 0) clearTimeout(crossfadeTimerRef.current);
    setRenderMilkdrop(true);
    setRenderProjectm(true);
    effectiveLoadPreset();
    layerSwitchTimerRef.current = setTimeout(() => {
      setActiveLayer(effectiveTarget);
      layerSwitchTimerRef.current = void 0;
      crossfadeTimerRef.current = setTimeout(() => {
        setRenderMilkdrop(effectiveTarget === "milkdrop");
        setRenderProjectm(effectiveTarget === "projectm");
        crossfadeTimerRef.current = void 0;
      }, 900);
    }, 100);
  }, []);
  const scratchPhysicsRef = reactExports.useRef(null);
  const scratchActiveRef = reactExports.useRef(false);
  const scratchLastScrollTimeRef = reactExports.useRef(0);
  const scratchReleaseTimerRef = reactExports.useRef(null);
  const scratchRafRef = reactExports.useRef(null);
  const scratchLastTickRef = reactExports.useRef(0);
  const scratchDeckRef = reactExports.useRef(null);
  const handleFullscreen = reactExports.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen().catch(() => {
      });
    }
  }, []);
  reactExports.useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const [pmPresetName, setPmPresetName] = reactExports.useState("");
  const [pmPresetIdx, setPmPresetIdx] = reactExports.useState(0);
  const [pmPresetCount, setPmPresetCount] = reactExports.useState(0);
  const handlePMReady = reactExports.useCallback((count) => setPmPresetCount(count), []);
  const handlePMPresetChange = reactExports.useCallback((idx, name) => {
    setPmPresetIdx(idx);
    setPmPresetName(name);
  }, []);
  const currentName = activeLayer === "milkdrop" ? presetName : pmPresetName;
  const combinedCount = presetCount + pmPresetCount;
  const currentIdx = activeLayer === "milkdrop" ? presetIdx : presetCount + pmPresetIdx;
  const handlePresetChange = reactExports.useCallback((idx, name) => {
    setPresetIdx(idx);
    setPresetName(name);
  }, []);
  const handleReady = reactExports.useCallback((count) => {
    setPresetCount(count);
  }, []);
  reactExports.useEffect(() => {
    if (!autoAdvance) return;
    if (presetCount === 0 && pmPresetCount === 0) return;
    const advance = () => {
      var _a, _b;
      if (activeLayer === "projectm" && presetCount > 0) {
        switchToLayer("milkdrop", () => {
          var _a2;
          return (_a2 = canvasHandleRef.current) == null ? void 0 : _a2.randomPreset();
        });
      } else if (activeLayer === "milkdrop" && pmPresetCount > 0) {
        switchToLayer("projectm", () => {
          var _a2;
          return (_a2 = projectmHandleRef.current) == null ? void 0 : _a2.randomPreset();
        });
      } else {
        if (activeLayer === "milkdrop") (_a = canvasHandleRef.current) == null ? void 0 : _a.randomPreset();
        else (_b = projectmHandleRef.current) == null ? void 0 : _b.randomPreset();
      }
      autoAdvanceTimerRef.current = setTimeout(advance, 15e3 + Math.random() * 15e3);
    };
    autoAdvanceTimerRef.current = setTimeout(advance, 15e3 + Math.random() * 15e3);
    return () => {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    };
  }, [autoAdvance, presetCount, pmPresetCount, activeLayer, switchToLayer]);
  reactExports.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e) => {
      const decks = useDJStore.getState().decks;
      const deckId = decks.A.isPlaying ? "A" : decks.B.isPlaying ? "B" : null;
      if (!deckId) return;
      e.preventDefault();
      if (!scratchPhysicsRef.current) {
        try {
          scratchPhysicsRef.current = getDJEngine().getDeck(deckId).physics;
        } catch {
          return;
        }
      }
      const physics = scratchPhysicsRef.current;
      if (!scratchActiveRef.current || scratchDeckRef.current !== deckId) {
        scratchActiveRef.current = true;
        scratchDeckRef.current = deckId;
        startScratch(deckId);
        if (scratchRafRef.current !== null) cancelAnimationFrame(scratchRafRef.current);
        scratchLastTickRef.current = performance.now();
        let prevRate = 1;
        const tick = (now22) => {
          const dt2 = (now22 - scratchLastTickRef.current) / 1e3;
          scratchLastTickRef.current = now22;
          const rate = physics.tick(dt2);
          if (Math.abs(rate - prevRate) > 0.01) {
            setScratchVelocity(deckId, rate);
            prevRate = rate;
          }
          if (!physics.touching && Math.abs(rate - 1) < 0.02) {
            scratchActiveRef.current = false;
            scratchDeckRef.current = null;
            stopScratch(deckId, 50);
            scratchRafRef.current = null;
            return;
          }
          scratchRafRef.current = requestAnimationFrame(tick);
        };
        scratchRafRef.current = requestAnimationFrame(tick);
      }
      const now2 = performance.now();
      const dt = Math.max(1e-3, (now2 - scratchLastScrollTimeRef.current) / 1e3);
      scratchLastScrollTimeRef.current = now2;
      const normalizedDelta = e.deltaMode === 1 ? e.deltaY * 12 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const omega = TurntablePhysics.deltaToAngularVelocity(normalizedDelta, dt);
      physics.setTouching(true);
      physics.setHandVelocity(omega);
      if (scratchReleaseTimerRef.current !== null) clearTimeout(scratchReleaseTimerRef.current);
      scratchReleaseTimerRef.current = setTimeout(() => {
        scratchReleaseTimerRef.current = null;
        physics.setTouching(false);
      }, 150);
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => {
      container.removeEventListener("wheel", handler);
      if (scratchRafRef.current !== null) cancelAnimationFrame(scratchRafRef.current);
      if (scratchReleaseTimerRef.current !== null) clearTimeout(scratchReleaseTimerRef.current);
    };
  }, []);
  const handlePopOut = reactExports.useCallback(() => {
    const s = useUIStore.getState();
    if (s.vjPoppedOut) {
      focusPopout("DEViLBOX — VJ");
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().then(() => {
          useUIStore.getState().setVJPoppedOut(true);
        });
      } else {
        s.setVJPoppedOut(true);
      }
    }
  }, []);
  const handleBrowserSelect = reactExports.useCallback((name, _idx) => {
    switchToLayer("milkdrop", () => {
      var _a;
      return (_a = canvasHandleRef.current) == null ? void 0 : _a.loadPresetByName(name, 1.5);
    });
  }, [switchToLayer]);
  const handlePMBrowserSelect = reactExports.useCallback((name, _idx) => {
    switchToLayer("projectm", () => {
      var _a;
      return (_a = projectmHandleRef.current) == null ? void 0 : _a.loadPresetByName(name, false);
    });
    setBrowserOpen(false);
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = void 0;
    }
  }, [switchToLayer]);
  const handleNext = reactExports.useCallback(() => {
    var _a, _b;
    if (activeLayer === "projectm" && presetCount > 0) {
      switchToLayer("milkdrop", () => {
        var _a2;
        return (_a2 = canvasHandleRef.current) == null ? void 0 : _a2.nextPreset();
      });
    } else if (activeLayer === "milkdrop" && pmPresetCount > 0) {
      switchToLayer("projectm", () => {
        var _a2;
        return (_a2 = projectmHandleRef.current) == null ? void 0 : _a2.nextPreset();
      });
    } else {
      if (activeLayer === "milkdrop") (_a = canvasHandleRef.current) == null ? void 0 : _a.nextPreset();
      else (_b = projectmHandleRef.current) == null ? void 0 : _b.nextPreset();
    }
  }, [activeLayer, presetCount, pmPresetCount, switchToLayer]);
  const handleRandom = reactExports.useCallback(() => {
    var _a, _b;
    if (activeLayer === "projectm" && presetCount > 0) {
      switchToLayer("milkdrop", () => {
        var _a2;
        return (_a2 = canvasHandleRef.current) == null ? void 0 : _a2.randomPreset();
      });
    } else if (activeLayer === "milkdrop" && pmPresetCount > 0) {
      switchToLayer("projectm", () => {
        var _a2;
        return (_a2 = projectmHandleRef.current) == null ? void 0 : _a2.randomPreset();
      });
    } else {
      if (activeLayer === "milkdrop") (_a = canvasHandleRef.current) == null ? void 0 : _a.randomPreset();
      else (_b = projectmHandleRef.current) == null ? void 0 : _b.randomPreset();
    }
  }, [activeLayer, presetCount, pmPresetCount, switchToLayer]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: containerRef, className: "relative w-full h-full bg-black overflow-hidden", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute inset-0 transition-opacity duration-700 ease-in-out",
        style: { opacity: activeLayer === "milkdrop" ? 1 : 0, pointerEvents: activeLayer === "milkdrop" ? "auto" : "none" },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          VJCanvas,
          {
            ref: canvasHandleRef,
            onReady: handleReady,
            onPresetChange: handlePresetChange,
            visible: vjViewActive && renderMilkdrop
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
            lineNumber: 767,
            columnNumber: 9
          },
          void 0
        )
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 763,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "absolute inset-0 transition-opacity duration-700 ease-in-out",
        style: { opacity: activeLayer === "projectm" ? 1 : 0, pointerEvents: activeLayer === "projectm" ? "auto" : "none" },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full h-full bg-black flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-white/50 font-mono text-sm", children: "Loading projectM..." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
          lineNumber: 779,
          columnNumber: 108
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
          lineNumber: 779,
          columnNumber: 35
        }, void 0), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ProjectMCanvas,
          {
            ref: projectmHandleRef,
            onReady: handlePMReady,
            onPresetChange: handlePMPresetChange,
            visible: vjViewActive && renderProjectm
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
            lineNumber: 780,
            columnNumber: 11
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
          lineNumber: 779,
          columnNumber: 9
        }, void 0)
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 775,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(React.Suspense, { fallback: null, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LazyHeadOverlay, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 790,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 789,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VJPatternOverlayWrapper, {}, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
      lineNumber: 792,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      VJControls,
      {
        currentName,
        currentIdx,
        totalPresets: combinedCount,
        autoAdvance,
        isPopout,
        onNext: handleNext,
        onRandom: handleRandom,
        onToggleAutoAdvance: () => setAutoAdvance((v) => !v),
        onPopOut: handlePopOut,
        onToggleBrowser: () => setBrowserOpen((v) => !v),
        onFullscreen: handleFullscreen,
        isFullscreen,
        browserOpen
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 793,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      VJPresetBrowser,
      {
        isOpen: browserOpen,
        onClose: () => setBrowserOpen(false),
        onSelectPreset: activeLayer === "projectm" ? handlePMBrowserSelect : handleBrowserSelect,
        currentPresetIdx: activeLayer === "projectm" ? pmPresetIdx : presetIdx,
        currentPresetName: activeLayer === "projectm" ? pmPresetName : void 0,
        mode: activeLayer === "projectm" ? "projectm" : "butterchurn"
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
        lineNumber: 808,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/vj/VJView.tsx",
    lineNumber: 761,
    columnNumber: 5
  }, void 0);
};
export {
  VJCanvas,
  VJControls,
  VJView
};
