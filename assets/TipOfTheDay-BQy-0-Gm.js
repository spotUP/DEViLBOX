import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, v as Lightbulb, f as Sparkles, X, H as History, I as Info, d as ChevronLeft, b as ChevronRight } from "./vendor-ui-AJ7AT9BN.js";
import { D as DEVILBOX_TIPS } from "./tips-D9dh4Ad6.js";
import { a1 as useThemeStore, a2 as BUILD_NUMBER, O as useModalClose, a3 as CURRENT_VERSION, a4 as CHANGELOG } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const SEEN_VERSION_KEY = "devilbox-seen-version";
const ChangeTypeLabel = ({ type }) => {
  const labels = {
    feature: "New",
    fix: "Fix",
    improvement: "Improved"
  };
  const colors = {
    feature: "bg-accent-success/20 text-accent-success",
    fix: "bg-accent-warning/20 text-accent-warning",
    improvement: "bg-accent-primary/20 text-accent-primary"
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `px-1.5 py-0.5 text-[10px] font-bold rounded ${colors[type]}`, children: labels[type] }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
    lineNumber: 28,
    columnNumber: 5
  }, void 0);
};
const VersionEntry = ({ entry, isLatest }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `px-5 py-4 border-b border-dark-border last:border-b-0 ${isLatest ? "bg-accent-primary/5" : ""}`, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 mb-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `font-bold ${isLatest ? "text-accent-primary" : "text-text-primary"}`, children: [
        "v",
        entry.version
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
        lineNumber: 38,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted", children: entry.date }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
        lineNumber: 41,
        columnNumber: 9
      }, void 0),
      isLatest && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "px-2 py-0.5 text-[10px] font-bold bg-accent-primary text-dark-bg rounded-full", children: "LATEST" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
        lineNumber: 43,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
      lineNumber: 37,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "space-y-2", children: entry.changes.map((change, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "flex items-start gap-2 text-sm", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChangeTypeLabel, { type: change.type }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
        lineNumber: 51,
        columnNumber: 13
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-text-secondary", children: change.description }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
        lineNumber: 52,
        columnNumber: 13
      }, void 0)
    ] }, idx, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
      lineNumber: 50,
      columnNumber: 11
    }, void 0)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
      lineNumber: 48,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
    lineNumber: 36,
    columnNumber: 5
  }, void 0);
};
const TipOfTheDay = ({ isOpen, onClose, initialTab = "tips" }) => {
  const [activeTab, setActiveTab] = reactExports.useState(initialTab);
  const [currentTipIndex, setCurrentTipIndex] = reactExports.useState(0);
  const [showAtStartup, setShowAtStartup] = reactExports.useState(() => {
    const saved = localStorage.getItem("show-tips-at-startup");
    return saved === null ? true : saved === "true";
  });
  const { getCurrentTheme } = useThemeStore();
  reactExports.useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setActiveTab(initialTab));
      localStorage.setItem(SEEN_VERSION_KEY, BUILD_NUMBER);
    }
  }, [isOpen, initialTab]);
  reactExports.useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setCurrentTipIndex(Math.floor(Math.random() * DEVILBOX_TIPS.length)));
    }
  }, [isOpen]);
  const handleNext = () => {
    setCurrentTipIndex((prev) => (prev + 1) % DEVILBOX_TIPS.length);
  };
  const handlePrev = () => {
    setCurrentTipIndex((prev) => (prev - 1 + DEVILBOX_TIPS.length) % DEVILBOX_TIPS.length);
  };
  const toggleStartup = (checked) => {
    setShowAtStartup(checked);
    localStorage.setItem("show-tips-at-startup", checked.toString());
  };
  useModalClose({ isOpen, onClose });
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleArrows = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    document.addEventListener("keydown", handleArrows);
    return () => document.removeEventListener("keydown", handleArrows);
  }, [isOpen, handlePrev, handleNext]);
  if (!isOpen) return null;
  const tip = DEVILBOX_TIPS[currentTipIndex];
  const accentColor = getCurrentTheme().colors.accent;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      tabIndex: -1,
      className: `max-w-xl w-full rounded-xl border-2 shadow-2xl overflow-hidden transition-all animate-in zoom-in-95 duration-200 outline-none
          bg-dark-bg border-accent-primary/50
        `,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `px-6 py-4 flex items-center justify-between
          bg-dark-bgSecondary
        `, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 rounded-lg bg-accent-primary/20 text-text-primary", children: activeTab === "tips" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Lightbulb, { size: 20 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 139,
              columnNumber: 39
            }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sparkles, { size: 20 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 139,
              columnNumber: 65
            }, void 0) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 138,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "font-bold text-lg tracking-tight text-text-primary uppercase", children: activeTab === "tips" ? "Tip of the Day" : "What's New" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 142,
                columnNumber: 15
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[10px] text-text-muted uppercase tracking-widest", children: [
                "DEViLBOX v",
                CURRENT_VERSION
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 145,
                columnNumber: 15
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 141,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 137,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: onClose,
              className: "text-text-muted hover:text-text-primary transition-colors p-1",
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 20 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 152,
                columnNumber: 13
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 148,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 134,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex border-b border-dark-border bg-black/20", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setActiveTab("tips"),
              className: `flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
              ${activeTab === "tips" ? `bg-white/5 border-b-2` : "text-text-muted hover:text-text-secondary"}
            `,
              style: activeTab === "tips" ? { color: accentColor, borderColor: accentColor } : void 0,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Lightbulb, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                  lineNumber: 168,
                  columnNumber: 13
                }, void 0),
                "Tips"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 158,
              columnNumber: 11
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => setActiveTab("changelog"),
              className: `flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
              ${activeTab === "changelog" ? `bg-white/5 border-b-2` : "text-text-muted hover:text-text-secondary"}
            `,
              style: activeTab === "changelog" ? { color: accentColor, borderColor: accentColor } : void 0,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(History, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                  lineNumber: 181,
                  columnNumber: 13
                }, void 0),
                "Changelog"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 171,
              columnNumber: 11
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 157,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-[300px] overflow-y-auto scrollbar-modern bg-black/10", children: activeTab === "tips" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "h-full p-8 flex flex-col items-center justify-center text-center space-y-6", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "div",
            {
              className: "w-16 h-16 rounded-full flex items-center justify-center mb-2 text-text-primary",
              style: { backgroundColor: `${accentColor}1a` },
              children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Info, { size: 32 }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 194,
                columnNumber: 17
              }, void 0)
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 190,
              columnNumber: 15
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-xl font-bold text-text-primary", style: { color: accentColor }, children: tip.title }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 198,
              columnNumber: 17
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-text-secondary leading-relaxed text-sm", children: tip.content }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 201,
              columnNumber: 17
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 197,
            columnNumber: 15
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full
                bg-accent-primary/10 text-accent-primary
              `, children: [
            "Category: ",
            tip.category
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 206,
            columnNumber: 15
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 189,
          columnNumber: 13
        }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col", children: CHANGELOG.slice(0, 5).map((entry, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(VersionEntry, { entry, isLatest: idx === 0 }, entry.version, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 215,
          columnNumber: 17
        }, void 0)) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 213,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 187,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-6 py-4 flex items-center justify-between border-t border-dark-border bg-black/20", children: [
          activeTab === "tips" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handlePrev,
                className: "p-2 rounded-lg bg-dark-bgTertiary hover:bg-dark-bgHover text-text-primary transition-colors",
                title: "Previous Tip",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronLeft, { size: 20 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                  lineNumber: 230,
                  columnNumber: 17
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 225,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: handleNext,
                className: "p-2 rounded-lg bg-dark-bgTertiary hover:bg-dark-bgHover text-text-primary transition-colors",
                title: "Next Tip",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChevronRight, { size: 20 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                  lineNumber: 237,
                  columnNumber: 17
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 232,
                columnNumber: 15
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 224,
            columnNumber: 13
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-text-muted italic text-xs", children: "Showing recent updates" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 241,
            columnNumber: 13
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-2 cursor-pointer group", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: showAtStartup,
                onChange: (e) => toggleStartup(e.target.checked),
                className: `w-4 h-4 rounded border-2 bg-transparent cursor-pointer
                border-accent-primary checked:bg-accent-primary
              `
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
                lineNumber: 247,
                columnNumber: 13
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-text-muted group-hover:text-text-secondary transition-colors uppercase font-bold tracking-tighter", children: "Show at startup" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
              lineNumber: 255,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 246,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 222,
          columnNumber: 9
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 bg-black/40 flex justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: onClose,
            className: "w-full py-3 rounded-lg font-bold text-sm transition-all uppercase tracking-widest bg-accent-primary text-dark-bg hover:opacity-90",
            children: "Start Jamming!"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
            lineNumber: 263,
            columnNumber: 11
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
          lineNumber: 262,
          columnNumber: 9
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
      lineNumber: 125,
      columnNumber: 7
    },
    void 0
  ) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/TipOfTheDay.tsx",
    lineNumber: 124,
    columnNumber: 5
  }, void 0);
};
export {
  TipOfTheDay
};
