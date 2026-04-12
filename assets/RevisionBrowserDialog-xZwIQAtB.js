import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, H as History, X, N as RotateCcw, p as Trash2 } from "./vendor-ui-AJ7AT9BN.js";
import { O as useModalClose, ag as listLocalRevisions, ah as loadLocalRevision, P as notify, ai as deleteLocalRevision } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const RevisionBrowserDialog = ({ isOpen, onClose }) => {
  useModalClose({ isOpen, onClose });
  const [revisions, setRevisions] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [confirmRestore, setConfirmRestore] = reactExports.useState(null);
  const fetchRevisions = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLocalRevisions();
      setRevisions(list);
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    if (isOpen) {
      fetchRevisions();
      setConfirmRestore(null);
    }
  }, [isOpen, fetchRevisions]);
  const handleRestore = async (key) => {
    const ok = await loadLocalRevision(key);
    if (ok) {
      notify.success("Revision restored");
      onClose();
    } else {
      notify.error("Failed to restore revision");
    }
    setConfirmRestore(null);
  };
  const handleDelete = async (key) => {
    await deleteLocalRevision(key);
    setRevisions((prev) => prev.filter((r) => r.key !== key));
    notify.success("Revision deleted");
  };
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "fixed inset-0 bg-black/70 flex items-center justify-center z-[99990]", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-dark-bgPrimary border border-dark-border rounded-lg w-full max-w-[90vw] md:max-w-[440px] max-h-[520px] overflow-hidden flex flex-col", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-4 py-3 border-b border-dark-border", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(History, { size: 18, className: "text-accent-primary" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
          lineNumber: 64,
          columnNumber: 13
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-semibold text-text-primary", children: "Local Revisions" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
          lineNumber: 65,
          columnNumber: 13
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
        lineNumber: 63,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { onClick: onClose, className: "text-text-muted hover:text-text-primary", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 18 }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
        lineNumber: 68,
        columnNumber: 13
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
        lineNumber: 67,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 62,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto p-4", children: loading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 76,
      columnNumber: 15
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 75,
      columnNumber: 13
    }, void 0) : revisions.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-8 text-text-muted", children: [
      "No revisions yet.",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("br", {}, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
        lineNumber: 81,
        columnNumber: 15
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm", children: "Revisions are created automatically when you save." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
        lineNumber: 82,
        columnNumber: 15
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 79,
      columnNumber: 13
    }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: revisions.map((rev) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "flex items-center justify-between p-3 bg-dark-bgTertiary rounded border border-dark-border",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-text-primary font-medium truncate", children: rev.name }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
              lineNumber: 92,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: new Date(rev.savedAt).toLocaleString() }, void 0, false, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
              lineNumber: 93,
              columnNumber: 21
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs text-text-muted", children: [
              rev.patternCount,
              " pattern",
              rev.patternCount !== 1 ? "s" : "",
              ", ",
              rev.instrumentCount,
              " instrument",
              rev.instrumentCount !== 1 ? "s" : ""
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
              lineNumber: 96,
              columnNumber: 21
            }, void 0)
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
            lineNumber: 91,
            columnNumber: 19
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-1 ml-2 flex-shrink-0", children: confirmRestore === rev.key ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleRestore(rev.key),
                className: "px-2 py-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded text-xs font-medium",
                children: "Confirm"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
                lineNumber: 103,
                columnNumber: 25
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => setConfirmRestore(null),
                className: "px-2 py-1 text-text-muted hover:text-text-primary rounded text-xs",
                children: "Cancel"
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
                lineNumber: 109,
                columnNumber: 25
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
            lineNumber: 102,
            columnNumber: 23
          }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => setConfirmRestore(rev.key),
                className: "flex items-center gap-1 px-3 py-1.5 bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 rounded text-sm font-medium",
                title: "Restore this revision",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RotateCcw, { size: 14 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
                    lineNumber: 123,
                    columnNumber: 27
                  }, void 0),
                  "Restore"
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
                lineNumber: 118,
                columnNumber: 25
              },
              void 0
            ),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => handleDelete(rev.key),
                className: "p-1.5 text-text-muted hover:text-accent-error rounded",
                title: "Delete this revision",
                children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Trash2, { size: 14 }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
                  lineNumber: 131,
                  columnNumber: 27
                }, void 0)
              },
              void 0,
              false,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
                lineNumber: 126,
                columnNumber: 25
              },
              void 0
            )
          ] }, void 0, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
            lineNumber: 117,
            columnNumber: 23
          }, void 0) }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
            lineNumber: 100,
            columnNumber: 19
          }, void 0)
        ]
      },
      rev.key,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
        lineNumber: 87,
        columnNumber: 17
      },
      void 0
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 85,
      columnNumber: 13
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 73,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-4 py-3 border-t border-dark-border text-xs text-text-muted", children: "Up to 50 revisions are kept. Restoring overwrites current project state." }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
      lineNumber: 143,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
    lineNumber: 60,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dialogs/RevisionBrowserDialog.tsx",
    lineNumber: 59,
    columnNumber: 5
  }, void 0);
};
export {
  RevisionBrowserDialog
};
