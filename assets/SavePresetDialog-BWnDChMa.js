import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, g as Save, J as Tag, X, D as Download } from "./vendor-ui-AJ7AT9BN.js";
import { aa as usePresetStore, ab as Modal, ac as ModalHeader, ad as ModalFooter, ae as Button, af as downloadAsNKSF } from "./main-BbV5VyEH.js";
const CATEGORIES = ["Bass", "Lead", "Pad", "Drum", "FX", "User"];
const SUGGESTED_TAGS = [
  "acid",
  "deep",
  "aggressive",
  "soft",
  "bright",
  "dark",
  "punchy",
  "smooth",
  "distorted",
  "clean",
  "wet",
  "dry"
];
const SavePresetDialog = ({
  instrument,
  onClose
}) => {
  var _a, _b;
  const { savePreset } = usePresetStore();
  const [name, setName] = reactExports.useState(instrument.name);
  const [category, setCategory] = reactExports.useState("User");
  const [tags, setTags] = reactExports.useState([]);
  const [customTag, setCustomTag] = reactExports.useState("");
  const [exportAsNKS, setExportAsNKS] = reactExports.useState(false);
  const handleSave = () => {
    if (!name.trim()) return;
    savePreset(instrument, name.trim(), category, tags);
    if (exportAsNKS) {
      downloadAsNKSF(instrument, {
        name: name.trim(),
        category,
        tags,
        author: "DEViLBOX User",
        comment: `${instrument.synthType} preset`
      });
    }
    onClose();
  };
  const handleExportOnlyNKS = () => {
    if (!name.trim()) return;
    downloadAsNKSF(instrument, {
      name: name.trim(),
      category,
      tags,
      author: "DEViLBOX User",
      comment: `${instrument.synthType} preset`
    });
  };
  const handleAddTag = (tag) => {
    if (tag && !tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag]);
    }
    setCustomTag("");
  };
  const handleRemoveTag = (tag) => {
    setTags(tags.filter((t) => t !== tag));
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Modal,
    {
      isOpen: true,
      onClose,
      size: "sm",
      theme: "modern",
      backdropOpacity: "dark",
      closeOnBackdropClick: true,
      closeOnEscape: true,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          ModalHeader,
          {
            title: "Save Preset",
            icon: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 18 }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 105,
              columnNumber: 15
            }, void 0),
            onClose,
            theme: "modern"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 103,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-4 space-y-4", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-2", children: "Preset Name" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 114,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "text",
                value: name,
                onChange: (e) => setName(e.target.value),
                onKeyDown: handleKeyDown,
                placeholder: "My Awesome Sound",
                className: "w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/50",
                autoFocus: true
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 117,
                columnNumber: 13
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 113,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-2", children: "Category" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 130,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-2", children: CATEGORIES.map((cat) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => setCategory(cat),
                className: `
                    px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                    ${category === cat ? "bg-accent-primary/20 text-accent-primary border border-accent-primary" : "bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary hover:border-text-muted"}
                  `,
                children: cat
              },
              cat,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 135,
                columnNumber: 17
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 133,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 129,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "block text-xs font-medium text-text-muted uppercase tracking-wide mb-2", children: "Tags (optional)" }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 154,
              columnNumber: 13
            }, void 0),
            tags.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 mb-2", children: tags.map((tag) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "span",
              {
                className: "flex items-center gap-1 px-2 py-1 bg-accent-primary/20 text-accent-primary rounded text-xs",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Tag, { size: 10 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                    lineNumber: 166,
                    columnNumber: 21
                  }, void 0),
                  tag,
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: () => handleRemoveTag(tag),
                      className: "hover:text-accent-error ml-1",
                      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 10 }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                        lineNumber: 172,
                        columnNumber: 23
                      }, void 0)
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                      lineNumber: 168,
                      columnNumber: 21
                    },
                    void 0
                  )
                ]
              },
              tag,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 162,
                columnNumber: 19
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 160,
              columnNumber: 15
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap gap-1 mb-2", children: SUGGESTED_TAGS.filter((t) => !tags.includes(t)).slice(0, 8).map((tag) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleAddTag(tag),
                className: "px-2 py-1 bg-dark-bg border border-dark-border rounded text-xs text-text-muted hover:text-text-primary hover:border-text-muted transition-colors",
                children: [
                  "+ ",
                  tag
                ]
              },
              tag,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 185,
                columnNumber: 19
              },
              void 0
            )) }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 180,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "input",
                {
                  type: "text",
                  value: customTag,
                  onChange: (e) => setCustomTag(e.target.value.toLowerCase()),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag(customTag);
                    }
                  },
                  placeholder: "Add custom tag...",
                  className: "flex-1 px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                  lineNumber: 197,
                  columnNumber: 15
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => handleAddTag(customTag),
                  disabled: !customTag || tags.includes(customTag),
                  className: "px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed",
                  children: "Add"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                  lineNumber: 210,
                  columnNumber: 15
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 196,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 153,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-dark-border pt-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-3 cursor-pointer group", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "input",
              {
                type: "checkbox",
                checked: exportAsNKS,
                onChange: (e) => setExportAsNKS(e.target.checked),
                className: "w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary/50"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 223,
                columnNumber: 15
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm text-text-primary group-hover:text-accent-primary transition-colors", children: "Also export as .nksf file" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 230,
                columnNumber: 17
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: "For Native Instruments Komplete Kontrol hardware" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 233,
                columnNumber: 17
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 229,
              columnNumber: 15
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 222,
            columnNumber: 13
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 221,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted bg-dark-bg/50 rounded-lg p-3", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium", children: "Synth Type:" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 243,
                columnNumber: 15
              }, void 0),
              " ",
              instrument.synthType
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 242,
              columnNumber: 13
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium", children: "Effects:" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                lineNumber: 246,
                columnNumber: 15
              }, void 0),
              " ",
              ((_a = instrument.effects) == null ? void 0 : _a.length) || 0,
              " effect",
              (((_b = instrument.effects) == null ? void 0 : _b.length) || 0) !== 1 ? "s" : ""
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 245,
              columnNumber: 13
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 241,
            columnNumber: 11
          }, void 0)
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
          lineNumber: 111,
          columnNumber: 7
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ModalFooter, { theme: "modern", align: "right", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "ghost", onClick: onClose, children: "Cancel" }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
            lineNumber: 252,
            columnNumber: 9
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Button,
            {
              variant: "default",
              onClick: handleExportOnlyNKS,
              disabled: !name.trim(),
              title: "Download as .nksf file only (won't save to library)",
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Download, { size: 14, className: "mr-1" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                  lineNumber: 261,
                  columnNumber: 11
                }, void 0),
                "Export NKS"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 255,
              columnNumber: 9
            },
            void 0
          ),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            Button,
            {
              variant: "primary",
              onClick: handleSave,
              disabled: !name.trim(),
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Save, { size: 14, className: "mr-1" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
                  lineNumber: 269,
                  columnNumber: 11
                }, void 0),
                "Save Preset"
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
              lineNumber: 264,
              columnNumber: 9
            },
            void 0
          )
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
          lineNumber: 251,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/instruments/presets/SavePresetDialog.tsx",
      lineNumber: 94,
      columnNumber: 5
    },
    void 0
  );
};
export {
  SavePresetDialog as S
};
