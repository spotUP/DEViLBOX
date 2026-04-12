import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports, X, a2 as Book, K as Keyboard, Z as Zap, j as Cpu, a9 as BookOpen } from "./vendor-ui-AJ7AT9BN.js";
import { u as useHelpDialog, E as EFFECT_COMMANDS, T as TUTORIAL_STEPS } from "./useHelpDialog-WXGDnzpi.js";
import { d8 as useKeyboardStore } from "./main-BbV5VyEH.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function buildShortcutGroups$1(schemeData) {
  var _a;
  if (!schemeData || Object.keys(schemeData).length === 0) return [];
  const cats = {};
  const addTo = (cat, key, cmd) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ key, action: cmd.replace(/_/g, " ") });
  };
  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== "string") continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo("Transport", key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo("Navigation", key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo("Editing", key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo("Selection & Clipboard", key, cmd);
    else if (/^transpose_/.test(cmd)) addTo("Transpose", key, cmd);
    else if (/^(set_octave|next_octave|prev_octave)/.test(cmd)) addTo("Octave", key, cmd);
    else if (/^(set_instrument|next_instrument|prev_instrument|set_sample|instrument_|swap_instrument)/.test(cmd)) addTo("Instruments", key, cmd);
    else if (/^(mute_|solo_|unmute_|set_track|set_multi|reset_channel|channel_)/.test(cmd)) addTo("Channels", key, cmd);
    else if (/^(next_pattern|prev_pattern|next_block|prev_block|clone_|next_order|prev_order|next_sequence|prev_sequence|set_position|save_position|goto_position|sequence_|set_playback)/.test(cmd)) addTo("Patterns & Position", key, cmd);
    else if (/^(increase_|decrease_|set_step|set_edit|set_quantize|double_block|halve_block)/.test(cmd)) addTo("Step & Volume", key, cmd);
    else if (/^(toggle_|show_|open_|view_|close_|help$|configure|order_list|layout_|display_|cycle_|switch_to)/.test(cmd)) addTo("View & Settings", key, cmd);
    else if (/^(undo|redo|save_|export_|load_|new_|fast_save)/.test(cmd)) addTo("File & History", key, cmd);
    else if (/^(tracker_|power_cut|dj_)/.test(cmd)) addTo("DJ & Scratch", key, cmd);
    else addTo("Other", key, cmd);
  }
  const catOrder = [
    "Transport",
    "Navigation",
    "Editing",
    "Selection & Clipboard",
    "Transpose",
    "Octave",
    "Instruments",
    "Channels",
    "Patterns & Position",
    "Step & Volume",
    "View & Settings",
    "File & History",
    "DJ & Scratch",
    "Other"
  ];
  const groups = [{
    title: "Note Entry",
    shortcuts: [
      { key: "Z, S, X, D, C...", action: "Piano keys lower row (C-B)" },
      { key: "Q, 2, W, 3, E...", action: "Piano keys upper row (+1 octave)" },
      { key: "0-9, A-F", action: "Hex digits (instrument, volume, effect)" }
    ]
  }];
  for (const cat of catOrder) {
    if ((_a = cats[cat]) == null ? void 0 : _a.length) {
      groups.push({ title: cat, shortcuts: cats[cat] });
    }
  }
  return groups;
}
function renderDynamicShortcuts(schemeData, schemeName) {
  const groups = buildShortcutGroups$1(schemeData);
  if (groups.length === 0) {
    return [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs font-mono text-ft2-textDim italic my-2", children: "No keyboard scheme loaded. Shortcuts will appear here when a scheme is active." }, "no-scheme", false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 86,
        columnNumber: 7
      }, this)
    ];
  }
  const nodes = [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-ft2-textDim mb-3 bg-black/20 border border-ft2-border px-3 py-1.5 inline-block", children: [
      "Active scheme: ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight", children: schemeName }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 94,
        columnNumber: 22
      }, this),
      " ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-textDim", children: "— shortcuts update automatically when you switch schemes" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 95,
        columnNumber: 12
      }, this)
    ] }, "scheme-badge", true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 93,
      columnNumber: 5
    }, this)
  ];
  for (const group of groups) {
    nodes.push(
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-base font-bold text-ft2-highlight mt-5 mb-2 font-mono", children: group.title }, `grp-${group.title}`, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 101,
        columnNumber: 7
      }, this)
    );
    const tableLines = [
      "| Key | Action |",
      "|-----|--------|",
      ...group.shortcuts.map((s) => `| ${s.key} | ${s.action} |`)
    ];
    nodes.push(renderTable(tableLines, nodes.length));
  }
  return nodes;
}
function renderMarkdown(md, schemeData, schemeName) {
  const lines = md.split("\n");
  const nodes = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "{{keyboard-shortcuts}}") {
      nodes.push(...renderDynamicShortcuts(schemeData ?? null, schemeName ?? "unknown"));
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      nodes.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "pre",
          {
            className: "bg-black/40 border border-ft2-border p-3 my-2 overflow-x-auto text-sm font-mono text-ft2-text",
            children: [
              lang && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-ft2-textDim text-xs mb-1", children: lang }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                lineNumber: 154,
                columnNumber: 13
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("code", { children: codeLines.join("\n") }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                lineNumber: 156,
                columnNumber: 11
              }, this)
            ]
          },
          nodes.length,
          true,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 149,
            columnNumber: 9
          },
          this
        )
      );
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      nodes.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("hr", { className: "border-ft2-border my-4" }, nodes.length, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 165,
          columnNumber: 9
        }, this)
      );
      i++;
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const headingClasses = {
        1: "text-2xl font-bold text-ft2-highlight mt-6 mb-3",
        2: "text-xl font-bold text-ft2-highlight mt-5 mb-2",
        3: "text-lg font-bold text-ft2-text mt-4 mb-2",
        4: "text-base font-bold text-ft2-textDim mt-3 mb-1",
        5: "text-sm font-bold text-ft2-textDim mt-2 mb-1",
        6: "text-sm font-bold text-ft2-textDim mt-2 mb-1"
      };
      nodes.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: `font-mono ${headingClasses[level]}`, children: renderInline(text) }, nodes.length, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 185,
          columnNumber: 9
        }, this)
      );
      i++;
      continue;
    }
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      nodes.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "my-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "img",
            {
              src: imgMatch[2],
              alt: imgMatch[1],
              className: "max-w-full border border-ft2-border",
              loading: "lazy"
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
              lineNumber: 198,
              columnNumber: 11
            },
            this
          ),
          imgMatch[1] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-ft2-textDim mt-1", children: imgMatch[1] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 205,
            columnNumber: 13
          }, this)
        ] }, nodes.length, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 197,
          columnNumber: 9
        }, this)
      );
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      nodes.push(renderTable(tableLines, nodes.length));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "list-disc list-inside my-2 space-y-1", children: listItems.map((item, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "text-sm font-mono text-ft2-text", children: renderInline(item) }, idx, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 236,
          columnNumber: 13
        }, this)) }, nodes.length, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 234,
          columnNumber: 9
        }, this)
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      nodes.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ol", { className: "list-decimal list-inside my-2 space-y-1", children: listItems.map((item, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { className: "text-sm font-mono text-ft2-text", children: renderInline(item) }, idx, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 255,
          columnNumber: 13
        }, this)) }, nodes.length, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 253,
          columnNumber: 9
        }, this)
      );
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("|") && !/^!\[/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    nodes.push(
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm font-mono text-ft2-text leading-relaxed my-2", children: renderInline(paraLines.join(" ")) }, nodes.length, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 287,
        columnNumber: 7
      }, this)
    );
  }
  return nodes;
}
function renderInline(text) {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-bold text-ft2-highlight", children: match[2] }, parts.length, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 311,
          columnNumber: 9
        }, this)
      );
    } else if (match[3]) {
      parts.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "code",
          {
            className: "bg-black/30 px-1 py-0.5 text-ft2-highlight border border-ft2-border text-sm",
            children: match[4]
          },
          parts.length,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 318,
            columnNumber: 9
          },
          this
        )
      );
    } else if (match[5]) {
      parts.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "img",
          {
            src: match[7],
            alt: match[6],
            className: "inline max-h-16 border border-ft2-border mx-1",
            loading: "lazy"
          },
          parts.length,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 328,
            columnNumber: 9
          },
          this
        )
      );
    } else if (match[8]) {
      parts.push(
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "a",
          {
            href: match[10],
            className: "text-ft2-highlight underline",
            target: "_blank",
            rel: "noopener noreferrer",
            children: match[9]
          },
          parts.length,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 339,
            columnNumber: 9
          },
          this
        )
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: parts }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
    lineNumber: 357,
    columnNumber: 42
  }, this);
}
function renderTable(tableLines, key) {
  const rows = tableLines.filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line)).map(
    (line) => line.split("|").slice(1, -1).map((cell) => cell.trim())
  );
  if (rows.length === 0) return null;
  const header = rows[0];
  const body = rows.slice(1);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "my-3 overflow-x-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("table", { className: "w-full border-collapse text-sm font-mono", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("thead", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tr", { children: header.map((cell, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "th",
      {
        className: "border border-ft2-border bg-ft2-panel px-2 py-1 text-left text-ft2-highlight font-bold",
        children: renderInline(cell)
      },
      idx,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 381,
        columnNumber: 15
      },
      this
    )) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 379,
      columnNumber: 11
    }, this) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 378,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tbody", { children: body.map((row, ridx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("tr", { children: row.map((cell, cidx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "td",
      {
        className: "border border-ft2-border px-2 py-1 text-ft2-text",
        children: renderInline(cell)
      },
      cidx,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 394,
        columnNumber: 17
      },
      this
    )) }, ridx, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 392,
      columnNumber: 13
    }, this)) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 390,
      columnNumber: 9
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
    lineNumber: 377,
    columnNumber: 7
  }, this) }, key, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
    lineNumber: 376,
    columnNumber: 5
  }, this);
}
const ManualTab = ({
  chapters,
  parts,
  currentIndex,
  onSelectChapter,
  searchQuery,
  onSearchChange,
  activeSchemeData,
  activeSchemeName
}) => {
  const contentRef = reactExports.useRef(null);
  const [collapsedParts, setCollapsedParts] = reactExports.useState(/* @__PURE__ */ new Set());
  reactExports.useEffect(() => {
    var _a;
    (_a = contentRef.current) == null ? void 0 : _a.scrollTo(0, 0);
  }, [currentIndex]);
  const togglePart = reactExports.useCallback((partNumber) => {
    setCollapsedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) {
        next.delete(partNumber);
      } else {
        next.add(partNumber);
      }
      return next;
    });
  }, []);
  if (chapters.length === 0 && !searchQuery) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center h-64", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim mb-3", children: "Manual not yet generated." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 446,
        columnNumber: 11
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-ft2-text bg-black/30 border border-ft2-border px-4 py-2", children: "npx tsx docs/manual/build-app-manifest.ts" }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 449,
        columnNumber: 11
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 445,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 444,
      columnNumber: 7
    }, void 0);
  }
  if (chapters.length === 0 && searchQuery) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex h-full", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-56 flex-shrink-0 border-r border-ft2-border bg-ft2-panel flex flex-col", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 border-b border-ft2-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "input",
          {
            type: "text",
            value: searchQuery,
            onChange: (e) => onSearchChange(e.target.value),
            placeholder: "Search manual...",
            className: "w-full bg-ft2-bg border border-ft2-border px-2 py-1 text-xs font-mono text-ft2-text placeholder:text-ft2-textDim focus:outline-none focus:border-ft2-highlight"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 464,
            columnNumber: 13
          },
          void 0
        ) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 463,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-ft2-textDim text-center", children: "No chapters match your search." }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 473,
          columnNumber: 13
        }, void 0) }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 472,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 462,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 flex items-center justify-center", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim", children: "No results found." }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 480,
        columnNumber: 11
      }, void 0) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 479,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 460,
      columnNumber: 7
    }, void 0);
  }
  const currentChapter = chapters[currentIndex] || chapters[0];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-56 flex-shrink-0 border-r border-ft2-border bg-ft2-panel flex flex-col", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "p-2 border-b border-ft2-border", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          type: "text",
          value: searchQuery,
          onChange: (e) => onSearchChange(e.target.value),
          placeholder: "Search manual...",
          className: "w-full bg-ft2-bg border border-ft2-border px-2 py-1 text-xs font-mono text-ft2-text placeholder:text-ft2-textDim focus:outline-none focus:border-ft2-highlight"
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 496,
          columnNumber: 11
        },
        void 0
      ) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 495,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-ft2", children: [
        parts.map((part) => {
          const partChapters = chapters.filter((ch) => ch.partNumber === part.number);
          if (partChapters.length === 0) return null;
          const isCollapsed = collapsedParts.has(part.number);
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              "button",
              {
                onClick: () => togglePart(part.number),
                className: "w-full text-left px-2 py-1.5 text-xs font-mono font-bold text-ft2-highlight bg-ft2-bg border-b border-ft2-border hover:bg-ft2-panel flex items-center gap-1",
                children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-textDim", children: isCollapsed ? "+" : "-" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                    lineNumber: 519,
                    columnNumber: 19
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "uppercase truncate", children: part.name }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                    lineNumber: 520,
                    columnNumber: 19
                  }, void 0)
                ]
              },
              void 0,
              true,
              {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                lineNumber: 515,
                columnNumber: 17
              },
              void 0
            ),
            !isCollapsed && partChapters.map((ch) => {
              const chapterIdx = chapters.indexOf(ch);
              const isActive = chapterIdx === currentIndex;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => onSelectChapter(chapterIdx),
                  className: `
                        w-full text-left px-3 py-1.5 text-sm font-mono truncate
                        ${isActive ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
                      `,
                  title: `${ch.number}. ${ch.title}`,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-textDim mr-1", children: [
                      ch.number,
                      "."
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                      lineNumber: 542,
                      columnNumber: 23
                    }, void 0),
                    ch.title
                  ]
                },
                ch.id,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                  lineNumber: 530,
                  columnNumber: 21
                },
                void 0
              );
            })
          ] }, part.number, true, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 513,
            columnNumber: 15
          }, void 0);
        }),
        chapters.filter((ch) => !parts.some((p) => p.chapters.includes(ch.number))).map((ch) => {
          const chapterIdx = chapters.indexOf(ch);
          const isActive = chapterIdx === currentIndex;
          return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "button",
            {
              onClick: () => onSelectChapter(chapterIdx),
              className: `
                    w-full text-left px-3 py-1.5 text-sm font-mono truncate
                    ${isActive ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
                  `,
              title: `${ch.number}. ${ch.title}`,
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-textDim mr-1", children: [
                  ch.number,
                  "."
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
                  lineNumber: 570,
                  columnNumber: 19
                }, void 0),
                ch.title
              ]
            },
            ch.id,
            true,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
              lineNumber: 558,
              columnNumber: 17
            },
            void 0
          );
        })
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 506,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 493,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: contentRef, className: "flex-1 overflow-y-auto scrollbar-ft2 p-6", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mb-4 pb-3 border-b border-ft2-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-xs font-mono text-ft2-textDim uppercase mb-1", children: currentChapter.part }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 582,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-2xl font-mono font-bold text-ft2-highlight", children: [
          currentChapter.number,
          ". ",
          currentChapter.title
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 585,
          columnNumber: 11
        }, void 0)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 581,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { children: renderMarkdown(currentChapter.content, activeSchemeData, activeSchemeName) }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 591,
        columnNumber: 9
      }, void 0),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mt-8 pt-4 border-t border-ft2-border", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onSelectChapter(Math.max(0, currentIndex - 1)),
            disabled: currentIndex === 0,
            className: `
              px-3 py-1.5 font-mono text-sm border transition-colors
              ${currentIndex === 0 ? "bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed" : "bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight"}
            `,
            children: "PREV"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 595,
            columnNumber: 11
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs font-mono text-ft2-textDim", children: [
          currentIndex + 1,
          " / ",
          chapters.length
        ] }, void 0, true, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
          lineNumber: 608,
          columnNumber: 11
        }, void 0),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "button",
          {
            onClick: () => onSelectChapter(Math.min(chapters.length - 1, currentIndex + 1)),
            disabled: currentIndex === chapters.length - 1,
            className: `
              px-3 py-1.5 font-mono text-sm border transition-colors
              ${currentIndex === chapters.length - 1 ? "bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed" : "bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight"}
            `,
            children: "NEXT"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
            lineNumber: 611,
            columnNumber: 11
          },
          void 0
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
        lineNumber: 594,
        columnNumber: 9
      }, void 0)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
      lineNumber: 579,
      columnNumber: 7
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/ManualTab.tsx",
    lineNumber: 491,
    columnNumber: 5
  }, void 0);
};
function buildShortcutGroups(schemeData) {
  var _a;
  if (!schemeData || Object.keys(schemeData).length === 0) {
    return [{
      title: "Note Entry",
      shortcuts: [
        { keys: "Z,S,X,D,C...", description: "Piano keys lower row (C-B)" },
        { keys: "Q,2,W,3,E...", description: "Piano keys upper row (+1 octave)" },
        { keys: "0-9, A-F", description: "Hex digits (instrument, volume, effect)" }
      ]
    }];
  }
  const cats = {};
  const addTo = (cat, keys, cmd) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ keys, description: cmd.replace(/_/g, " ") });
  };
  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== "string") continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo("Transport", key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo("Navigation", key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo("Editing", key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo("Selection & Clipboard", key, cmd);
    else if (/^transpose_/.test(cmd)) addTo("Transpose", key, cmd);
    else if (/^(set_octave|next_octave|prev_octave)/.test(cmd)) addTo("Octave", key, cmd);
    else if (/^(set_instrument|next_instrument|prev_instrument|set_sample|instrument_|swap_instrument)/.test(cmd)) addTo("Instruments", key, cmd);
    else if (/^(mute_|solo_|unmute_|set_track|set_multi|reset_channel|channel_)/.test(cmd)) addTo("Channels", key, cmd);
    else if (/^(next_pattern|prev_pattern|next_block|prev_block|clone_|next_order|prev_order|next_sequence|prev_sequence|set_position|save_position|goto_position|sequence_|set_playback)/.test(cmd)) addTo("Patterns & Position", key, cmd);
    else if (/^(increase_|decrease_|set_step|set_edit|set_quantize|double_block|halve_block)/.test(cmd)) addTo("Step & Volume", key, cmd);
    else if (/^(toggle_|show_|open_|view_|close_|help$|configure|order_list|layout_|display_|cycle_|switch_to)/.test(cmd)) addTo("View & Settings", key, cmd);
    else if (/^(undo|redo|save_|export_|load_|new_|fast_save)/.test(cmd)) addTo("File & History", key, cmd);
    else if (/^(tracker_|power_cut|dj_)/.test(cmd)) addTo("DJ & Scratch", key, cmd);
    else addTo("Other", key, cmd);
  }
  const groups = [{
    title: "Note Entry",
    shortcuts: [
      { keys: "Z,S,X,D,C...", description: "Piano keys lower row (C-B)" },
      { keys: "Q,2,W,3,E...", description: "Piano keys upper row (+1 octave)" },
      { keys: "0-9, A-F", description: "Hex digits (instrument, volume, effect)" }
    ]
  }];
  const catOrder = [
    "Transport",
    "Navigation",
    "Editing",
    "Selection & Clipboard",
    "Transpose",
    "Octave",
    "Instruments",
    "Channels",
    "Patterns & Position",
    "Step & Volume",
    "View & Settings",
    "File & History",
    "DJ & Scratch",
    "Other"
  ];
  for (const cat of catOrder) {
    if ((_a = cats[cat]) == null ? void 0 : _a.length) {
      groups.push({ title: cat, shortcuts: cats[cat] });
    }
  }
  return groups;
}
const HelpModal = ({ isOpen, onClose, initialTab = "shortcuts" }) => {
  const h = useHelpDialog({ isOpen, initialTab });
  const [schemeData, setSchemeData] = reactExports.useState(null);
  const activeScheme = useKeyboardStore((s) => s.activeScheme);
  reactExports.useEffect(() => {
    var _a, _b;
    if (!isOpen) return;
    const isMac = ((_a = navigator.platform) == null ? void 0 : _a.includes("Mac")) || ((_b = navigator.userAgent) == null ? void 0 : _b.includes("Mac"));
    fetch(`/keyboard-schemes/${activeScheme}.json`).then((r) => r.json()).then((data) => {
      const plat = data.platform || data;
      setSchemeData(plat[isMac ? "mac" : "pc"] || plat.pc || {});
    }).catch(() => setSchemeData(null));
  }, [isOpen, activeScheme]);
  const shortcutGroups = reactExports.useMemo(() => buildShortcutGroups(schemeData), [schemeData]);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown2 = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown2);
    return () => window.removeEventListener("keydown", handleKeyDown2);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose();
    }
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "fixed inset-0 z-[99990] flex items-center justify-center bg-black bg-opacity-60",
      onClick: onClose,
      onKeyDown: handleKeyDown,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: "bg-ft2-bg border-2 border-ft2-border shadow-2xl w-full h-full flex flex-col",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-header border-b-2 border-ft2-border px-4 py-3 flex items-center justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "font-mono text-2xl font-bold text-ft2-text", children: "HELP & DOCUMENTATION" }, void 0, false, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                lineNumber: 142,
                columnNumber: 11
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onClose,
                  className: "text-ft2-textDim hover:text-ft2-text transition-colors",
                  title: "Close (Esc)",
                  children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(X, { size: 20 }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 150,
                    columnNumber: 13
                  }, void 0)
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 145,
                  columnNumber: 11
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
              lineNumber: 141,
              columnNumber: 9
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-panel border-b border-ft2-border flex", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => h.setActiveTab("manual"),
                  className: `
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === "manual" ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
            `,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Book, { size: 16, className: "inline mr-2" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 166,
                      columnNumber: 13
                    }, void 0),
                    "MANUAL"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 156,
                  columnNumber: 11
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => h.setActiveTab("shortcuts"),
                  className: `
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === "shortcuts" ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
            `,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Keyboard, { size: 16, className: "inline mr-2" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 179,
                      columnNumber: 13
                    }, void 0),
                    "KEYBOARD SHORTCUTS"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 169,
                  columnNumber: 11
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => h.setActiveTab("effects"),
                  className: `
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === "effects" ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
            `,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Zap, { size: 16, className: "inline mr-2" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 192,
                      columnNumber: 13
                    }, void 0),
                    "STANDARD EFFECTS"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 182,
                  columnNumber: 11
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => h.setActiveTab("chip-effects"),
                  className: `
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === "chip-effects" ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
            `,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Cpu, { size: 16, className: "inline mr-2" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 205,
                      columnNumber: 13
                    }, void 0),
                    "CHIP EFFECTS"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 195,
                  columnNumber: 11
                },
                void 0
              ),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: () => h.setActiveTab("tutorial"),
                  className: `
              flex-1 px-4 py-3 font-mono text-base transition-colors
              ${h.activeTab === "tutorial" ? "bg-ft2-cursor text-ft2-bg font-bold" : "text-ft2-text hover:bg-ft2-bg"}
            `,
                  children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(BookOpen, { size: 16, className: "inline mr-2" }, void 0, false, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 218,
                      columnNumber: 13
                    }, void 0),
                    "TUTORIAL"
                  ]
                },
                void 0,
                true,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 208,
                  columnNumber: 11
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
              lineNumber: 155,
              columnNumber: 9
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-y-auto scrollbar-ft2 p-8", children: [
              h.activeTab === "manual" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                ManualTab,
                {
                  chapters: h.filteredChapters,
                  parts: h.manualParts,
                  currentIndex: h.manualChapterIndex,
                  onSelectChapter: h.setManualChapterIndex,
                  searchQuery: h.manualSearchQuery,
                  onSearchChange: h.setManualSearchQuery,
                  activeSchemeData: schemeData,
                  activeSchemeName: activeScheme
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 227,
                  columnNumber: 13
                },
                void 0
              ),
              h.activeTab === "shortcuts" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-6", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim mb-2", children: [
                  "Active scheme: ",
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight", children: activeScheme }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 243,
                    columnNumber: 32
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 242,
                  columnNumber: 15
                }, void 0),
                shortcutGroups.map((group, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-panel border border-ft2-border p-4", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-base font-mono font-bold text-ft2-highlight mb-3", children: group.title.toUpperCase() }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 247,
                    columnNumber: 19
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-2", children: group.shortcuts.map((shortcut, sidx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "div",
                    {
                      className: "flex items-start gap-4 text-sm font-mono",
                      children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 w-32 px-2 py-1 bg-ft2-bg border border-ft2-border text-ft2-highlight font-bold text-center", children: shortcut.keys }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 256,
                          columnNumber: 25
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 text-ft2-text py-1", children: shortcut.description }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 259,
                          columnNumber: 25
                        }, void 0)
                      ]
                    },
                    sidx,
                    true,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 252,
                      columnNumber: 23
                    },
                    void 0
                  )) }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 250,
                    columnNumber: 19
                  }, void 0)
                ] }, idx, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 246,
                  columnNumber: 17
                }, void 0))
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                lineNumber: 241,
                columnNumber: 13
              }, void 0),
              h.activeTab === "effects" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-panel border border-ft2-border p-4 mb-4", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-base font-mono text-ft2-text leading-relaxed", children: "Effect commands follow the FastTracker 2 format: 3 hex characters (0xy-Fxx). Enter effects in the EFFECT column. Multiple effects can be chained across rows." }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 274,
                  columnNumber: 17
                }, void 0) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 273,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-3", children: EFFECT_COMMANDS.map((effect, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: "bg-ft2-panel border border-ft2-border p-3 hover:border-ft2-highlight transition-colors",
                    children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-3 mb-2", children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 w-12 px-2 py-1 bg-ft2-bg border border-ft2-cursor text-ft2-highlight font-bold text-sm font-mono text-center", children: effect.code }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                        lineNumber: 287,
                        columnNumber: 23
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1", children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-base font-bold text-ft2-text mb-1", children: effect.name }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 291,
                          columnNumber: 25
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim mb-1", children: effect.description }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 294,
                          columnNumber: 25
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-text", children: [
                          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight", children: "Range:" }, void 0, false, {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                            lineNumber: 298,
                            columnNumber: 27
                          }, void 0),
                          " ",
                          effect.paramRange
                        ] }, void 0, true, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 297,
                          columnNumber: 25
                        }, void 0),
                        effect.example && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-text mt-1", children: [
                          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight", children: "Example:" }, void 0, false, {
                            fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                            lineNumber: 302,
                            columnNumber: 29
                          }, void 0),
                          " ",
                          effect.example
                        ] }, void 0, true, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 301,
                          columnNumber: 27
                        }, void 0)
                      ] }, void 0, true, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                        lineNumber: 290,
                        columnNumber: 23
                      }, void 0)
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 286,
                      columnNumber: 21
                    }, void 0)
                  },
                  idx,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 282,
                    columnNumber: 19
                  },
                  void 0
                )) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 280,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                lineNumber: 272,
                columnNumber: 13
              }, void 0),
              h.activeTab === "chip-effects" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-panel border border-ft2-border p-4 mb-4", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-base font-mono font-bold text-ft2-highlight mb-2", children: h.currentChip !== null ? `CHIP EFFECTS: ${h.chipName}` : "CHIP EFFECTS" }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 317,
                    columnNumber: 17
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-base font-mono text-ft2-text leading-relaxed", children: h.currentChip !== null ? `These effects are specific to the ${h.chipName} sound chip used by the current instrument. They use effect codes 10xx and above.` : "Select a chip-based instrument (Furnace) in the tracker to see its specific effect commands here." }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 320,
                    columnNumber: 17
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 316,
                  columnNumber: 15
                }, void 0),
                h.chipEffects.length > 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-3", children: h.chipEffects.map((effect, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  "div",
                  {
                    className: "bg-ft2-panel border border-ft2-border p-3 hover:border-ft2-highlight transition-colors",
                    children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-3 mb-2", children: [
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-shrink-0 w-12 px-2 py-1 bg-ft2-bg border border-ft2-cursor text-ft2-highlight font-bold text-sm font-mono text-center", children: effect.command }, void 0, false, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                        lineNumber: 336,
                        columnNumber: 25
                      }, void 0),
                      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1", children: [
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "font-mono text-base font-bold text-ft2-text mb-1", children: effect.name }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 340,
                          columnNumber: 27
                        }, void 0),
                        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim", children: effect.desc }, void 0, false, {
                          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                          lineNumber: 343,
                          columnNumber: 27
                        }, void 0)
                      ] }, void 0, true, {
                        fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                        lineNumber: 339,
                        columnNumber: 25
                      }, void 0)
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 335,
                      columnNumber: 23
                    }, void 0)
                  },
                  idx,
                  false,
                  {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 331,
                    columnNumber: 21
                  },
                  void 0
                )) }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 329,
                  columnNumber: 17
                }, void 0) : h.currentChip !== null ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-8 text-ft2-textDim font-mono text-sm", children: [
                  "No specific chip effects defined for ",
                  h.chipName,
                  " yet."
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 352,
                  columnNumber: 17
                }, void 0) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-center py-8 text-ft2-textDim font-mono text-sm", children: "No chip-based instrument selected." }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 356,
                  columnNumber: 17
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                lineNumber: 315,
                columnNumber: 13
              }, void 0),
              h.activeTab === "tutorial" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-4", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-panel border-2 border-ft2-cursor p-6", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between mb-4", children: [
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "text-xl font-mono font-bold text-ft2-highlight", children: [
                      "STEP ",
                      TUTORIAL_STEPS[h.tutorialStep].step,
                      " OF ",
                      TUTORIAL_STEPS.length
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 368,
                      columnNumber: 19
                    }, void 0),
                    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim", children: [
                      h.tutorialProgress,
                      "% Complete"
                    ] }, void 0, true, {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 371,
                      columnNumber: 19
                    }, void 0)
                  ] }, void 0, true, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 367,
                    columnNumber: 17
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h4", { className: "text-2xl font-mono font-bold text-ft2-text mb-4", children: TUTORIAL_STEPS[h.tutorialStep].title }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 376,
                    columnNumber: 17
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "space-y-3", children: TUTORIAL_STEPS[h.tutorialStep].content.map((paragraph, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-base font-mono text-ft2-text leading-relaxed", children: paragraph }, idx, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 382,
                    columnNumber: 21
                  }, void 0)) }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 380,
                    columnNumber: 17
                  }, void 0)
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 366,
                  columnNumber: 15
                }, void 0),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between gap-4", children: [
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: h.prevTutorialStep,
                      disabled: h.tutorialStep === 0,
                      className: `
                    px-4 py-2 font-mono text-sm border transition-colors
                    ${h.tutorialStep === 0 ? "bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed" : "bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight"}
                  `,
                      children: "← PREVIOUS"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 391,
                      columnNumber: 17
                    },
                    void 0
                  ),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-1", children: TUTORIAL_STEPS.map((_, idx) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: () => h.setTutorialStep(idx),
                      className: `
                        w-8 h-8 text-sm font-mono border transition-colors
                        ${idx === h.tutorialStep ? "bg-ft2-cursor text-ft2-bg border-ft2-cursor font-bold" : "bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight"}
                      `,
                      children: idx + 1
                    },
                    idx,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 407,
                      columnNumber: 21
                    },
                    void 0
                  )) }, void 0, false, {
                    fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                    lineNumber: 405,
                    columnNumber: 17
                  }, void 0),
                  /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                    "button",
                    {
                      onClick: h.nextTutorialStep,
                      disabled: h.tutorialStep === TUTORIAL_STEPS.length - 1,
                      className: `
                    px-4 py-2 font-mono text-sm border transition-colors
                    ${h.tutorialStep === TUTORIAL_STEPS.length - 1 ? "bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed" : "bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight"}
                  `,
                      children: "NEXT →"
                    },
                    void 0,
                    false,
                    {
                      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                      lineNumber: 423,
                      columnNumber: 17
                    },
                    void 0
                  )
                ] }, void 0, true, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 390,
                  columnNumber: 15
                }, void 0)
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                lineNumber: 365,
                columnNumber: 13
              }, void 0)
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
              lineNumber: 224,
              columnNumber: 9
            }, void 0),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "bg-ft2-panel border-t-2 border-ft2-border px-4 py-3 flex items-center justify-between", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-sm font-mono text-ft2-textDim", children: [
                "Press ",
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-ft2-highlight", children: "?" }, void 0, false, {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 444,
                  columnNumber: 19
                }, void 0),
                " anytime to open this help"
              ] }, void 0, true, {
                fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                lineNumber: 443,
                columnNumber: 11
              }, void 0),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                "button",
                {
                  onClick: onClose,
                  className: "px-4 py-2 bg-ft2-cursor text-ft2-bg font-mono text-sm font-bold hover:bg-ft2-highlight transition-colors",
                  children: "CLOSE"
                },
                void 0,
                false,
                {
                  fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
                  lineNumber: 446,
                  columnNumber: 11
                },
                void 0
              )
            ] }, void 0, true, {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
              lineNumber: 442,
              columnNumber: 9
            }, void 0)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
          lineNumber: 136,
          columnNumber: 7
        },
        void 0
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/help/HelpModal.tsx",
      lineNumber: 131,
      columnNumber: 5
    },
    void 0
  );
};
export {
  HelpModal
};
